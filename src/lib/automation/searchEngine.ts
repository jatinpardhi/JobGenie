import type { Page } from "playwright";
import { newContext } from "./browser";
import { detectPlatform } from "./inspector";
import { logger } from "../logger";

const log = logger.child("search-engine");

export interface SearchInput {
  portalUrl: string;
  keywords: string;
  filters?: {
    location?: string;
    workMode?: "remote" | "hybrid" | "onsite";
    experience?: string;
    salary?: string;
    type?: "fulltime" | "internship" | "contract";
  };
  limit?: number;
}

export interface DiscoveredJob {
  url: string;
  title: string;
  company?: string;
  location?: string;
}

/**
 * Portal-agnostic job discovery: navigates the portal, types the
 * keyword into the first plausible search input, and harvests
 * outbound links that look like job postings.
 */
export async function discoverJobs(input: SearchInput): Promise<DiscoveredJob[]> {
  const ctx = await newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(input.portalUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const platform = detectPlatform(input.portalUrl);
    log.info("Searching", { platform, keywords: input.keywords });

    const search = await findSearchInput(page);
    if (search) {
      await search.fill(input.keywords).catch(() => {});
      await page.keyboard.press("Enter").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    }

    const limit = input.limit ?? 25;
    const jobs: DiscoveredJob[] = await page.evaluate((max) => {
      const seen = new Set<string>();
      const out: any[] = [];
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const re = /(job|career|posting|opening|requisition|gh_jid|lever|workday)/i;
      for (const a of anchors) {
        const href = a.href;
        if (!href || seen.has(href)) continue;
        if (!re.test(href) && !re.test(a.textContent || "")) continue;
        seen.add(href);
        out.push({
          url: href,
          title: (a.textContent || "").trim().slice(0, 200),
        });
        if (out.length >= max) break;
      }
      return out;
    }, limit);

    log.info("Discovered jobs", { count: jobs.length });
    return jobs;
  } finally {
    await ctx.close();
  }
}

async function findSearchInput(page: Page) {
  const candidates = [
    'input[type="search"]',
    'input[name*="q" i]',
    'input[name*="search" i]',
    'input[placeholder*="search" i]',
    'input[aria-label*="search" i]',
  ];
  for (const c of candidates) {
    const el = await page.$(c);
    if (el) return el;
  }
  return null;
}
