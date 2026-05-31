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
    function textOf(node: Element | null): string {
      if (!node) return "";
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      return t;
    }

    function looksLikeLabel(s: string): boolean {
      if (!s) return false;
      if (s.length < 2 || s.length > 240) return false;
      // Reject if it's clearly the option list collapsed into one blob.
      if (s.split(/\s+/).length > 40) return false;
      return true;
    }

    function labelFor(el: HTMLElement): string {
      const id = el.getAttribute("id");
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent) return lbl.textContent.trim();
      }
      const wrapLabel = el.closest("label");
      if (wrapLabel?.textContent) return wrapLabel.textContent.trim();
      const ariaLbl = el.getAttribute("aria-label");
      // Skip generic widget aria-labels ("Search", "Choose…", "Select") so we
      // fall through to DOM walking and find the real field label.
      if (ariaLbl && !/^(search|choose|select|option|combobox|dropdown|list of )/i.test(ariaLbl.trim())) {
        return ariaLbl.trim();
      }
      const ariaLbldBy = el.getAttribute("aria-labelledby");
      if (ariaLbldBy) {
        const parts = ariaLbldBy.split(/\s+/).map((i) => document.getElementById(i)?.textContent?.trim() || "").filter(Boolean);
        if (parts.length) return parts.join(" ").slice(0, 240);
      }
      // Walk up looking for a preceding sibling that looks like a label
      // (common React form pattern: <div class="label">…</div><div><input/></div>).
      let cur: HTMLElement | null = el;
      for (let i = 0; cur && i < 5; i++) {
        let sib: Element | null = cur.previousElementSibling;
        while (sib) {
          // skip empty wrappers
          const t = textOf(sib);
          if (looksLikeLabel(t) && !sib.querySelector("input,select,textarea,[role=combobox],[role=radiogroup]")) {
            return t;
          }
          sib = sib.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      const ph = (el as HTMLInputElement).placeholder;
      if (ph) return ph;
      const name = el.getAttribute("name");
      return name ?? el.tagName.toLowerCase();
    }

    function groupLabelFor(el: HTMLElement): string {
      const fs = el.closest("fieldset");
      const legend = fs?.querySelector(":scope > legend")?.textContent?.trim();
      if (legend) return legend;
      let cur: HTMLElement | null = el.parentElement;
      for (let i = 0; cur && i < 6; i++) {
        const labelled = cur.getAttribute("aria-labelledby");
        if (labelled) {
          const ref = document.getElementById(labelled);
          if (ref?.textContent) return ref.textContent.trim();
        }
        const heading = cur.querySelector(":scope > label, :scope > .label, :scope > h2, :scope > h3, :scope > h4, :scope > div > label");
        if (heading?.textContent) {
          const t = heading.textContent.trim();
          if (t.length > 0 && t.length < 200) return t;
        }
        cur = cur.parentElement;
      }
      return labelFor(el);
    }

    function optionLabelFor(input: HTMLInputElement): string {
      const id = input.getAttribute("id");
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl?.textContent) return lbl.textContent.trim();
      }
      const wrap = input.closest("label");
      if (wrap?.textContent) return wrap.textContent.trim();
      return input.value || "";
    }

    /** Extract options from a custom dropdown (combobox/listbox/aria-haspopup). */
    function customSelectOptions(el: HTMLElement): string[] {
      const out = new Set<string>();
      const collectFrom = (root: Element | null) => {
        if (!root) return;
        const opts = root.querySelectorAll('[role="option"], li, option');
        opts.forEach((o) => {
          const t = textOf(o);
          if (t && t.length < 120) out.add(t);
        });
      };
      // aria-controls → popup element
      const controls = el.getAttribute("aria-controls");
      if (controls) {
        controls.split(/\s+/).forEach((id) => collectFrom(document.getElementById(id)));
      }
      // aria-owns
      const owns = el.getAttribute("aria-owns");
      if (owns) {
        owns.split(/\s+/).forEach((id) => collectFrom(document.getElementById(id)));
      }
      // any descendant listbox
      collectFrom(el.querySelector('[role="listbox"], ul, ol'));
      // adjacent sibling listbox in the same parent
      const parent = el.parentElement;
      if (parent) {
        parent.querySelectorAll(':scope > [role="listbox"], :scope > ul[role="listbox"]').forEach((n) => collectFrom(n));
      }
      return Array.from(out).slice(0, 60);
    }

    /** Extract options from a custom radio-group ([role=radiogroup] with [role=radio] children). */
    function customRadioOptions(el: HTMLElement): string[] {
      const out: string[] = [];
      el.querySelectorAll('[role="radio"]').forEach((r) => {
        const t = r.getAttribute("aria-label") || textOf(r);
        if (t) out.push(t.slice(0, 120));
      });
      return out;
    }

    const fields: any[] = [];
    let idx = 0;
    const handledGroups = new Set<string>();
    const seen = new WeakSet<Element>();

    // Wider selector: include custom ARIA widgets common in React forms
    // (Airbnb, LinkedIn, MUI, Headless UI, Radix, etc.).
    const inputs = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          "input",
          "select",
          "textarea",
          "[role=combobox]",
          "[role=radiogroup]",
          "[role=listbox]",
          "[aria-haspopup=listbox]",
          "[contenteditable=true]",
        ].join(", ")
      )
    );
    for (const el of inputs) {
      if (seen.has(el)) continue;
      const tag = el.tagName.toLowerCase();
      const typeAttr = (el.getAttribute("type") || "").toLowerCase();
      const role = (el.getAttribute("role") || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(typeAttr)) continue;
      const rect = el.getBoundingClientRect();
      // Custom widgets may be display:none until clicked — accept if they're in DOM.
      const isCustom = role === "combobox" || role === "radiogroup" || role === "listbox" || el.getAttribute("aria-haspopup") === "listbox";
      if (!isCustom && rect.width === 0 && rect.height === 0) continue;

      // --- Custom radio-group ([role=radiogroup]) ---
      if (role === "radiogroup") {
        const options = customRadioOptions(el);
        const required = el.getAttribute("aria-required") === "true";
        const fieldId = `f_${idx++}`;
        el.setAttribute("data-jobgenie-id", fieldId);
        // Mark its [role=radio] children so we skip them later
        el.querySelectorAll('[role="radio"]').forEach((r) => seen.add(r));
        fields.push({
          fieldId,
          label: groupLabelFor(el).slice(0, 200),
          type: "radio-group",
          required,
          options,
        });
        continue;
      }

      // --- Custom combobox / listbox / aria-haspopup=listbox ---
      if (isCustom) {
        const options = customSelectOptions(el);
        const required = el.getAttribute("aria-required") === "true" || el.hasAttribute("required");
        const fieldId = `f_${idx++}`;
        el.setAttribute("data-jobgenie-id", fieldId);
        fields.push({
          fieldId,
          label: labelFor(el).slice(0, 200),
          type: options.length > 0 ? "select" : "text",
          required,
          options: options.length > 0 ? options : undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
        });
        continue;
      }

      // --- Native radio / checkbox group detection ---
      if ((typeAttr === "radio" || typeAttr === "checkbox") && el.getAttribute("name")) {
        const name = (el as HTMLInputElement).name;
        const groupKey = `${typeAttr}:${name}`;
        if (handledGroups.has(groupKey)) continue;
        const peers = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            `input[type="${typeAttr}"][name="${CSS.escape(name)}"]`
          )
        );
        if (peers.length > 1) {
          handledGroups.add(groupKey);
          const options = peers.map(optionLabelFor).map((s) => s.slice(0, 120)).filter(Boolean);
          const required = peers.some(
            (p) => p.hasAttribute("required") || p.getAttribute("aria-required") === "true"
          );
          const fieldId = `f_${idx++}`;
          peers.forEach((p) => {
            p.setAttribute("data-jobgenie-id", fieldId);
            seen.add(p);
          });
          fields.push({
            fieldId,
            label: groupLabelFor(el).slice(0, 200),
            type: typeAttr === "radio" ? "radio-group" : "checkbox-group",
            required,
            options,
          });
          continue;
        }
      }

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
    // Collapse duplicates (custom react-select wrappers commonly produce two
    // entries for the same label — outer container + inner search input).
    // Prefer the entry that has options or a non-text type. Keep typing
    // inputs (text/tel/email/url/textarea) separate from choice widgets
    // (select/radio/checkbox) so a "Phone" tel input doesn't get eaten by
    // a "Phone" country-code combobox that happens to share the label.
    const score = (f: any) =>
      (Array.isArray(f.options) && f.options.length ? 4 : 0) +
      (f.type === "radio-group" || f.type === "checkbox-group" ? 3 : 0) +
      (f.type === "select" ? 2 : 0) +
      (f.required ? 1 : 0);
    const isChoice = (t: string) =>
      t === "select" || t === "radio-group" || t === "checkbox-group" || t === "radio" || t === "checkbox";
    const normLabel = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const looksLikeNoise = (s: string) =>
      /^(no results( found)?|loading|placeholder|combobox|listbox|dropdown|menu|select an option)/i.test(s.trim());
    const byLabel = new Map<string, any>();
    for (const f of fields) {
      if (looksLikeNoise(f.label || "")) continue;
      const key = normLabel(f.label) + "|" + (isChoice(f.type) ? "choice" : "input");
      if (!key.startsWith("|")) {
        const prev = byLabel.get(key);
        if (!prev || score(f) > score(prev)) byLabel.set(key, f);
      }
    }
    return Array.from(byLabel.values());
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
