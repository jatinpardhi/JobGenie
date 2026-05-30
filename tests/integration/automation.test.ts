import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { canLaunchChromium } from "./_probes";

let chromiumOk = false;
beforeAll(async () => {
  chromiumOk = await canLaunchChromium();
});

describe("integration: playwright + automation primitives", () => {
  it("can launch chromium", async () => {
    expect(chromiumOk).toBe(true);
  });

  it("discoverJobs harvests job-like links from a fixture portal", async () => {
    if (!chromiumOk) return;
    // A self-contained HTML fixture with a search box and a results list.
    // Some links are job postings (should be harvested) and some are not.
    const html = `<!doctype html><html><body>
      <h1>Test Portal</h1>
      <input type="search" name="q" placeholder="search" />
      <nav>
        <a href="https://portal.test/about">About</a>
        <a href="https://portal.test/contact">Contact</a>
      </nav>
      <ul id="results">
        <li><a href="https://portal.test/jobs/1">Senior Engineer</a></li>
        <li><a href="https://portal.test/career/2">Frontend Developer</a></li>
        <li><a href="https://portal.test/opening/3">Backend Engineer</a></li>
        <li><a href="https://portal.test/blog/hello">A blog post</a></li>
      </ul>
    </body></html>`;
    const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

    const { discoverJobs } = await import("@/lib/automation/searchEngine");
    const jobs = await discoverJobs({
      portalUrl: url,
      keywords: "engineer",
      limit: 25,
    });
    const hrefs = jobs.map((j) => j.url);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "https://portal.test/jobs/1",
        "https://portal.test/career/2",
        "https://portal.test/opening/3",
      ])
    );
    // Non-job links should NOT be harvested.
    expect(hrefs).not.toContain("https://portal.test/about");
    expect(hrefs).not.toContain("https://portal.test/contact");
    expect(hrefs).not.toContain("https://portal.test/blog/hello");
  }, 90_000);

  it("detectFormFields stamps and describes every visible control", async () => {
    if (!chromiumOk) return;
    const { chromium } = await import("playwright");
    const { detectFormFields } = await import("@/lib/automation/inspector");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const html = `<!doctype html><html><body>
        <form>
          <label for="fn">Full name</label>
          <input id="fn" type="text" required />

          <label>Email <input name="email" type="email" /></label>

          <label for="exp">Years of experience</label>
          <select id="exp">
            <option>0-1</option><option>2-5</option><option>5+</option>
          </select>

          <label for="cover">Cover letter</label>
          <textarea id="cover"></textarea>

          <input type="hidden" name="csrf" value="abc" />
          <input type="submit" value="Apply" />
        </form>
      </body></html>`;
      await page.setContent(html);
      const fields = await detectFormFields(page);

      const byLabel = Object.fromEntries(fields.map((f) => [f.label, f]));
      expect(Object.keys(byLabel)).toEqual(
        expect.arrayContaining(["Full name", "Years of experience", "Cover letter"])
      );
      expect(byLabel["Full name"].required).toBe(true);
      expect(byLabel["Years of experience"].type).toBe("select");
      expect(byLabel["Years of experience"].options).toEqual(
        expect.arrayContaining(["0-1", "2-5", "5+"])
      );
      // Hidden + submit must be excluded.
      expect(fields.find((f) => f.type === "hidden")).toBeUndefined();
      expect(fields.find((f) => f.type === "submit")).toBeUndefined();
      // Every field must have a stamped id used by the filler.
      for (const f of fields) expect(f.fieldId).toMatch(/^f_\d+$/);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
