import type { MappedAnswer } from "../ai/agent";
import type { FormTarget } from "./inspector";
import { jitter } from "../hash";

/**
 * Apply the AI-mapped answers back into the live form. Uses the
 * `data-jobgenie-id` attribute that the inspector stamped onto each
 * detected control. Works against either a Page or an iframe Frame.
 */
export async function fillForm(
  target: FormTarget,
  answers: MappedAnswer[],
  resumePath?: string
): Promise<{ filled: number; skipped: number }> {
  let filled = 0;
  let skipped = 0;

  for (const a of answers) {
    if (a.value === null || a.value === undefined || a.value === "") {
      skipped++;
      continue;
    }
    const selector = `[data-jobgenie-id="${a.fieldId}"]`;
    const handle = await target.$(selector);
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
      } else if (type === "radio" || type === "checkbox") {
        // For grouped radio/checkbox controls, every peer shares the same
        // data-jobgenie-id. Pick the peer whose visible label or value
        // matches the answer; fall back to the single-handle behavior.
        const peers = await target.$$(selector);
        if (peers.length > 1) {
          const want = String(a.value).toLowerCase().trim();
          let matched = false;
          for (const p of peers) {
            const meta = await p.evaluate((el) => {
              const input = el as HTMLInputElement;
              const id = input.getAttribute("id") || "";
              const lblFor = id
                ? document.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`)?.textContent?.trim()
                : null;
              const wrap = input.closest("label")?.textContent?.trim();
              return { value: input.value || "", label: lblFor || wrap || "" };
            });
            const label = (meta.label || "").toLowerCase().trim();
            const value = (meta.value || "").toLowerCase().trim();
            if (label === want || value === want || (label && label.includes(want)) || (value && value.includes(want))) {
              await p.check({ force: true }).catch(() => {});
              matched = true;
              break;
            }
          }
          if (!matched && type === "checkbox" && /^(yes|true|1)$/i.test(String(a.value))) {
            await peers[0].check({ force: true }).catch(() => {});
            matched = true;
          }
          if (!matched) { skipped++; continue; }
        } else {
          if (a.value === true || /^(yes|true|1)$/i.test(String(a.value))) {
            await handle.check({ force: true });
          }
        }
      } else if (tag === "textarea" || tag === "input") {
        await handle.scrollIntoViewIfNeeded().catch(() => {});
        await handle.fill("").catch(() => {});
        await handle.type(String(a.value), { delay: 20 + Math.floor(Math.random() * 40) });
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
export async function clickNextOrSubmit(
  target: FormTarget
): Promise<"next" | "submit" | "none"> {
  const submitNames = [/^submit application$/i, /^submit$/i, /^apply$/i];
  const nextNames = [/^next$/i, /continue/i, /^review$/i];

  const buttons = await target.$$("button, input[type=submit], [role=button], a");
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
