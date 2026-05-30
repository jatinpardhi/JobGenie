import type { Page } from "playwright";
import type { MappedAnswer } from "../ai/agent";
import { humanType } from "./browser";
import { jitter } from "../hash";

/**
 * Apply the AI-mapped answers back into the live form. Uses the
 * `data-jobgenie-id` attribute that the inspector stamped onto each
 * detected control, so it is portal-agnostic.
 */
export async function fillForm(
  page: Page,
  answers: MappedAnswer[],
  resumePath?: string
): Promise<{ filled: number; skipped: number }> {
  let filled = 0;
  let skipped = 0;

  for (const a of answers) {
    if (a.value === null || a.value === undefined) {
      skipped++;
      continue;
    }
    const selector = `[data-jobgenie-id="${a.fieldId}"]`;
    const handle = await page.$(selector);
    if (!handle) {
      skipped++;
      continue;
    }
    const tag = await handle.evaluate((el) => el.tagName.toLowerCase());
    const type = await handle.evaluate((el) =>
      (el.getAttribute("type") || "").toLowerCase()
    );

    try {
      if (type === "file" && resumePath) {
        await handle.setInputFiles(resumePath);
      } else if (tag === "select") {
        await handle.selectOption({ label: String(a.value) }).catch(async () => {
          await handle.selectOption(String(a.value));
        });
      } else if (type === "checkbox" || type === "radio") {
        if (a.value === true || /^(yes|true|1)$/i.test(String(a.value))) {
          await handle.check({ force: true });
        }
      } else if (tag === "textarea" || tag === "input") {
        await handle.fill("");
        await humanType(page, selector, String(a.value));
      } else {
        await handle.evaluate((el, v) => {
          (el as HTMLElement).innerText = String(v);
        }, a.value);
      }
      filled++;
      await jitter();
    } catch {
      skipped++;
    }
  }
  return { filled, skipped };
}

/**
 * Attempt to advance multi-step forms or submit. Looks for buttons by
 * accessible name rather than fixed selectors.
 */
export async function clickNextOrSubmit(page: Page): Promise<"next" | "submit" | "none"> {
  const submitNames = [/^submit application$/i, /^submit$/i, /^apply$/i];
  const nextNames = [/^next$/i, /continue/i, /^review$/i];

  const buttons = await page.$$("button, input[type=submit], [role=button], a");
  for (const re of submitNames) {
    for (const b of buttons) {
      const txt = ((await b.textContent()) || (await b.getAttribute("value")) || "").trim();
      if (re.test(txt)) {
        await b.click({ delay: 60 }).catch(() => {});
        return "submit";
      }
    }
  }
  for (const re of nextNames) {
    for (const b of buttons) {
      const txt = ((await b.textContent()) || (await b.getAttribute("value")) || "").trim();
      if (re.test(txt)) {
        await b.click({ delay: 60 }).catch(() => {});
        return "next";
      }
    }
  }
  return "none";
}
