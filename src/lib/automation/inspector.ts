import type { Page } from "playwright";
import type { DetectedField } from "../ai/agent";

/**
 * Generic, selector-free form inspector. Runs in the page and returns a
 * structured description of every interactable form control on the
 * current document. Works on arbitrary career portals because it relies
 * on the DOM, not on portal-specific selectors.
 */
export async function detectFormFields(page: Page): Promise<DetectedField[]> {
  return page.evaluate(() => {
    function labelFor(el: HTMLElement): string {
      const id = el.getAttribute("id");
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent) return lbl.textContent.trim();
      }
      const wrapLabel = el.closest("label");
      if (wrapLabel?.textContent) return wrapLabel.textContent.trim();
      const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      if (aria) return aria;
      const ph = (el as HTMLInputElement).placeholder;
      if (ph) return ph;
      const name = el.getAttribute("name");
      return name ?? el.tagName.toLowerCase();
    }

    const fields: any[] = [];
    let idx = 0;
    const inputs = Array.from(
      document.querySelectorAll<HTMLElement>(
        "input, select, textarea, [role=combobox], [contenteditable=true]"
      )
    );
    for (const el of inputs) {
      const tag = el.tagName.toLowerCase();
      const typeAttr = (el.getAttribute("type") || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(typeAttr)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      let type = tag;
      if (tag === "input") type = typeAttr || "text";

      let options: string[] | undefined;
      if (tag === "select") {
        options = Array.from((el as HTMLSelectElement).options)
          .map((o) => o.textContent?.trim() || o.value)
          .filter(Boolean);
      }
      const required =
        el.hasAttribute("required") ||
        el.getAttribute("aria-required") === "true";

      const fieldId = `f_${idx++}`;
      el.setAttribute("data-jobgenie-id", fieldId);

      fields.push({
        fieldId,
        label: labelFor(el).slice(0, 200),
        type,
        required,
        options,
        placeholder: (el as HTMLInputElement).placeholder || undefined,
      });
    }
    return fields;
  });
}

export interface PortalProbe {
  url: string;
  title: string;
  requiresLogin: boolean;
  hasEasyApply: boolean;
  hasCaptcha: boolean;
  detectedPlatform: string;
  fields: DetectedField[];
}

export async function probePortal(page: Page, url: string): Promise<PortalProbe> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const title = await page.title();

  const platform = detectPlatform(url);
  const html = await page.content();
  const requiresLogin =
    /sign in|log in|login/i.test(html) &&
    !!(await page.$('input[type="password"], a[href*="login"], button:has-text("Sign in")'));
  const hasEasyApply = /easy apply|quick apply|1-click/i.test(html);
  const hasCaptcha = /recaptcha|hcaptcha|cf-turnstile/i.test(html);

  const fields = await detectFormFields(page);
  return { url, title, requiresLogin, hasEasyApply, hasCaptcha, detectedPlatform: platform, fields };
}

export function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("greenhouse.io")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workday")) return "workday";
  if (u.includes("indeed.com")) return "indeed";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  return "generic";
}
