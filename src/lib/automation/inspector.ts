import type { Page, Frame } from "playwright";
import type { DetectedField } from "../ai/agent";

export type FormTarget = Page | Frame;

/**
 * Generic, selector-free form inspector. Runs in the page/frame and
 * returns a structured description of every interactable form control
 * on the current document.
 */
export async function detectFormFields(target: FormTarget): Promise<DetectedField[]> {
  return target.evaluate(() => {
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

/**
 * Look for an "Apply now" style CTA on the page and click it.
 */
export async function clickApplyCta(page: Page): Promise<boolean> {
  const textPatterns = [
    /^apply now$/i,
    /^apply for this (job|position|role)$/i,
    /^apply to (this )?(job|position|role)$/i,
    /^start application$/i,
    /^apply$/i,
    // Looser fallbacks — accept anything that starts with "Apply" and is
    // not the literal word "Applying" / "Applied".
    /^apply\b(?! status)/i,
  ];
  const handles = await page.$$(
    "a, button, [role=button], input[type=button], input[type=submit]"
  );
  for (const re of textPatterns) {
    for (const h of handles) {
      const txt = (
        (await h.textContent().catch(() => "")) ||
        (await h.getAttribute("value").catch(() => "")) ||
        (await h.getAttribute("aria-label").catch(() => "")) ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      if (!txt || !re.test(txt)) continue;
      const visible = await h.isVisible().catch(() => false);
      if (!visible) continue;
      try {
        await h.scrollIntoViewIfNeeded().catch(() => {});
        await h.click({ delay: 60, timeout: 5000 });
        return true;
      } catch {
        /* try next */
      }
    }
  }
  return false;
}

/**
 * Return the Page/Frame that contains the most form fields. Used after
 * clicking an Apply CTA — sometimes the form is embedded as an iframe
 * (Greenhouse pattern), sometimes it swaps onto the same page.
 */
export async function findBestFormTarget(
  page: Page
): Promise<{ target: FormTarget; fields: DetectedField[] }> {
  const candidates: FormTarget[] = [page, ...page.frames()];
  let best: { target: FormTarget; fields: DetectedField[] } = { target: page, fields: [] };
  for (const c of candidates) {
    try {
      const fs = await detectFormFields(c);
      if (fs.length > best.fields.length) best = { target: c, fields: fs };
    } catch {
      /* cross-origin / detached frame */
    }
  }
  return best;
}

export interface PortalProbe {
  url: string;
  title: string;
  requiresLogin: boolean;
  hasEasyApply: boolean;
  hasCaptcha: boolean;
  detectedPlatform: string;
  fields: DetectedField[];
  /** True if we had to click an Apply CTA to reach the form. */
  ctaClicked: boolean;
  /** Final URL after any navigation. */
  finalUrl: string;
}

export async function probePortal(
  page: Page,
  url: string
): Promise<{ probe: PortalProbe; target: FormTarget; activePage: Page }> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  let activePage = page;
  let { target, fields } = await findBestFormTarget(activePage);
  let ctaClicked = false;

  // Heuristic: do the detected fields actually look like an application
  // form? Many listing pages have a header search input or newsletter
  // signup that detectFormFields picks up. Treat the page as "no real
  // form" unless it has at least one application-specific signal.
  const looksLikeRealForm = (fs: DetectedField[]) => {
    if (fs.length >= 5) return true;
    const hasAppSignal = fs.some(
      (f) =>
        f.type === "email" ||
        f.type === "file" ||
        f.type === "textarea" ||
        f.type === "tel" ||
        f.required
    );
    return hasAppSignal && fs.length >= 2;
  };

  if (!looksLikeRealForm(fields)) {
    const context = activePage.context();
    const newPagePromise = context
      .waitForEvent("page", { timeout: 5000 })
      .catch(() => null);
    const clicked = await clickApplyCta(activePage);
    if (clicked) {
      ctaClicked = true;
      const popped = await newPagePromise;
      if (popped) activePage = popped;
      await activePage.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      await activePage.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      // Wait for any input/select/textarea to appear (in page or any same-origin iframe).
      await activePage
        .waitForFunction(
          () => {
            if (document.querySelectorAll("input, select, textarea").length > 0) return true;
            const frames = Array.from(document.querySelectorAll("iframe"));
            for (const f of frames) {
              try {
                const d = (f as HTMLIFrameElement).contentDocument;
                if (d && d.querySelectorAll("input, select, textarea").length > 0) return true;
              } catch { /* cross-origin */ }
            }
            return false;
          },
          undefined,
          { timeout: 10_000 }
        )
        .catch(() => {});
      const best = await findBestFormTarget(activePage);
      // Only adopt the CTA result if it's strictly better — otherwise
      // we'd discard the page's existing fields for nothing.
      if (best.fields.length > fields.length) {
        target = best.target;
        fields = best.fields;
      }
    }
  }

  const title = await activePage.title().catch(() => "");
  const finalUrl = activePage.url();
  const platform = detectPlatform(finalUrl);
  const html = await activePage.content().catch(() => "");
  const requiresLogin =
    /sign in|log in|login/i.test(html) &&
    !!(await activePage
      .$('input[type="password"], a[href*="login"], button:has-text("Sign in")')
      .catch(() => null));
  const hasEasyApply = /easy apply|quick apply|1-click/i.test(html);
  const hasCaptcha = /recaptcha|hcaptcha|cf-turnstile/i.test(html);

  return {
    target,
    activePage,
    probe: {
      url,
      title,
      requiresLogin,
      hasEasyApply,
      hasCaptcha,
      detectedPlatform: platform,
      fields,
      ctaClicked,
      finalUrl,
    },
  };
}

export function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("greenhouse.io") || u.includes("boards.greenhouse")) return "greenhouse";
  if (u.includes("lever.co")) return "lever";
  if (u.includes("workday")) return "workday";
  if (u.includes("indeed.com")) return "indeed";
  if (u.includes("ashbyhq.com")) return "ashby";
  if (u.includes("smartrecruiters.com")) return "smartrecruiters";
  if (u.includes("careers.airbnb")) return "airbnb-greenhouse";
  return "generic";
}
