/**
 * Shared probes for integration tests. Each helper returns a boolean
 * so individual tests can `it.skipIf(!await probe())(...)` and the
 * suite stays green when an optional service isn't running.
 */

export async function isDevServerUp(url = "http://localhost:3000"): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export async function isOllamaUp(base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1"): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    // /v1/models is OpenAI-compat; works on Ollama too.
    const res = await fetch(`${base}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function canLaunchChromium(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    const b = await chromium.launch({ headless: true });
    await b.close();
    return true;
  } catch {
    return false;
  }
}
