import { Browser, BrowserContext, chromium, Page } from "playwright";
import { env } from "../env";
import { jitter } from "../hash";

let browser: Browser | null = null;
let browserHttp1: Browser | null = null;

const COMMON_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process,AutomationControlled",
  "--no-sandbox",
  "--disable-infobars",
  "--disable-dev-shm-usage",
  "--lang=en-US,en",
];

async function launch(args: string[]): Promise<Browser> {
  return chromium.launch({ headless: env.headless, args });
}

export async function getBrowser(opts: { http1?: boolean } = {}): Promise<Browser> {
  if (opts.http1) {
    if (!browserHttp1) browserHttp1 = await launch([...COMMON_ARGS, "--disable-http2"]);
    return browserHttp1;
  }
  if (!browser) browser = await launch(COMMON_ARGS);
  return browser;
}

/** Stealth init script — masks the most common headless tells. */
const STEALTH_INIT = `
  // navigator.webdriver -> undefined
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined });
  // plugins / mimeTypes non-empty
  Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  // chrome runtime stub
  window.chrome = window.chrome || { runtime: {} };
  // permissions.query for notifications returns 'denied' for headless
  const origQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (origQuery) {
    window.navigator.permissions.query = (p) => (p && p.name === 'notifications')
      ? Promise.resolve({ state: Notification.permission })
      : origQuery(p);
  }
  // WebGL vendor/renderer spoof (Intel)
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, p);
    };
  } catch {}
`;

export async function newContext(
  storageStatePath?: string,
  opts: { http1?: boolean } = {}
): Promise<BrowserContext> {
  const b = await getBrowser(opts);
  const ctx = await b.newContext({
    userAgent: env.userAgent,
    viewport: { width: 1366, height: 820 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
    },
    storageState: storageStatePath,
  });
  await ctx.addInitScript(STEALTH_INIT);
  return ctx;
}

/**
 * Navigate with retries + HTTP/1.1 fallback for sites that RST HTTP/2
 * (Cloudflare, some Akamai). Returns the page on success or throws a
 * tagged Error with code 'BLOCKED' / 'NAV_FAILED'.
 */
export async function safeGoto(
  page: Page,
  url: string,
  opts: { timeout?: number; onRetry?: (msg: string) => void | Promise<void> } = {}
): Promise<void> {
  const timeout = opts.timeout ?? 45_000;
  const tryGoto = async () => {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    if (resp && (resp.status() === 403 || resp.status() === 503)) {
      const body = (await page.content().catch(() => "")) || "";
      if (/cloudflare|just a moment|attention required|cf-chl|access denied/i.test(body)) {
        throw new Error("BLOCKED:cloudflare");
      }
    }
  };
  try {
    await tryGoto();
    return;
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    const isHttp2 = /ERR_HTTP2_PROTOCOL_ERROR|ERR_QUIC_PROTOCOL_ERROR/i.test(msg);
    const isReset = /ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_FAILED|ERR_EMPTY_RESPONSE/i.test(msg);
    if (msg.startsWith("BLOCKED:")) {
      const tagged = new Error(`BLOCKED: ${new URL(url).host} blocked automated access (Cloudflare).`);
      (tagged as any).code = "BLOCKED";
      throw tagged;
    }
    if (!isHttp2 && !isReset) throw e;
    // Retry on a fresh HTTP/1.1 context.
    await opts.onRetry?.(`Navigation failed (${isHttp2 ? "HTTP/2 reset" : "connection reset"}). Retrying over HTTP/1.1…`);
    const ctx = await newContext(undefined, { http1: true });
    const altPage = await ctx.newPage();
    try {
      const resp = await altPage.goto(url, { waitUntil: "domcontentloaded", timeout });
      if (resp && (resp.status() === 403 || resp.status() === 503)) {
        const body = (await altPage.content().catch(() => "")) || "";
        if (/cloudflare|just a moment|attention required|cf-chl|access denied/i.test(body)) {
          const tagged = new Error(`BLOCKED: ${new URL(url).host} blocked automated access (Cloudflare).`);
          (tagged as any).code = "BLOCKED";
          throw tagged;
        }
      }
      // Swap content into original page so caller's `page` is usable.
      const html = await altPage.content();
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      // Best-effort URL alignment for relative links in callers.
      try { await page.evaluate((u) => history.replaceState({}, "", u), url); } catch {}
      return;
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}

/** Human-like typing with jitter. */
export async function humanType(page: Page, selector: string, text: string) {
  await page.click(selector, { delay: 40 });
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 20 + Math.random() * 60 });
  }
  await jitter(80, 240);
}

export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
  if (browserHttp1) { await browserHttp1.close(); browserHttp1 = null; }
}
