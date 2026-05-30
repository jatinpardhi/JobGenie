import { Browser, BrowserContext, chromium, Page } from "playwright";
import { env } from "../env";
import { jitter } from "../hash";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  browser = await chromium.launch({
    headless: env.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
    ],
  });
  return browser;
}

export async function newContext(storageStatePath?: string): Promise<BrowserContext> {
  const b = await getBrowser();
  return b.newContext({
    userAgent: env.userAgent,
    viewport: { width: 1366, height: 820 },
    storageState: storageStatePath,
  });
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
  if (browser) {
    await browser.close();
    browser = null;
  }
}
