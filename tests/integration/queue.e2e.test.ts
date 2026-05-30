import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { canLaunchChromium } from "./_probes";

const DB_FILE = path.resolve(process.cwd(), "test-queue.db");
process.env.DATABASE_URL = `file:${DB_FILE}`;
process.env.REDIS_URL = "redis://127.0.0.1:1"; // force inline mode
process.env.DAILY_APPLICATION_LIMIT = "10";

let prisma: PrismaClient;
let chromiumOk = false;

beforeAll(async () => {
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  const { execSync } = await import("node:child_process");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ datasources: { db: { url: `file:${DB_FILE}` } } });

  // Make the app code use this same prisma instance.
  vi.doMock("@/lib/db", () => ({ prisma }));
  // Stub applyEngine so we don't actually open Playwright contexts for every job.
  vi.doMock("@/lib/automation/applyEngine", () => ({
    runApplication: vi.fn().mockResolvedValue(undefined),
  }));

  chromiumOk = await canLaunchChromium();
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  for (const ext of ["-journal", "-shm", "-wal"]) {
    const f = DB_FILE + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe("integration: queue end-to-end (inline mode)", () => {
  it("getQueueMode reports inline when Redis is unreachable", async () => {
    const { getQueueMode } = await import("@/lib/queue");
    // queue probes lazily.
    await new Promise((r) => setTimeout(r, 1500));
    expect(getQueueMode()).toBe("inline");
  });

  it("enqueueSearch discovers jobs and creates Application rows", async () => {
    if (!chromiumOk) return;

    const user = await prisma.user.create({
      data: { email: `q-${Date.now()}@test.local` },
    });

    const html = `<!doctype html><html><body>
      <ul>
        <li><a href="https://portal.test/jobs/100">Job A</a></li>
        <li><a href="https://portal.test/career/200">Job B</a></li>
        <li><a href="https://portal.test/opening/300">Job C</a></li>
      </ul>
    </body></html>`;
    const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);

    const search = await prisma.jobSearch.create({
      data: { userId: user.id, portalUrl: url, keywords: "engineer" },
    });

    const { enqueueSearch } = await import("@/lib/queue");
    await enqueueSearch({ searchId: search.id, userId: user.id });

    // Wait for inline setImmediate + Playwright launch + DB inserts.
    const deadline = Date.now() + 60_000;
    let apps: any[] = [];
    while (Date.now() < deadline) {
      apps = await prisma.application.findMany({ where: { userId: user.id } });
      if (apps.length >= 3) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(apps.length).toBeGreaterThanOrEqual(3);
    const urls = apps.map((a) => a.jobUrl).sort();
    expect(urls).toEqual([
      "https://portal.test/career/200",
      "https://portal.test/jobs/100",
      "https://portal.test/opening/300",
    ]);
    // And every app should be marked PENDING.
    for (const a of apps) expect(a.status).toBe("PENDING");

    // The mocked apply engine should have been called for each job.
    const { runApplication } = await import("@/lib/automation/applyEngine");
    expect((runApplication as any).mock.calls.length).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it("respects the daily application limit", async () => {
    if (!chromiumOk) return;

    const user = await prisma.user.create({
      data: { email: `qlim-${Date.now()}@test.local` },
    });
    // Pre-fill 9 applications today so budget = 1.
    for (let i = 0; i < 9; i++) {
      await prisma.application.create({
        data: { userId: user.id, jobUrl: `https://pre.test/${i}`, status: "PENDING" },
      });
    }
    const html = `<!doctype html><html><body>
      <a href="https://lim.test/jobs/1">A</a>
      <a href="https://lim.test/jobs/2">B</a>
      <a href="https://lim.test/jobs/3">C</a>
    </body></html>`;
    const url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    const search = await prisma.jobSearch.create({
      data: { userId: user.id, portalUrl: url, keywords: "x" },
    });
    const { enqueueSearch } = await import("@/lib/queue");
    await enqueueSearch({ searchId: search.id, userId: user.id });

    const deadline = Date.now() + 60_000;
    let fromSearch: any[] = [];
    while (Date.now() < deadline) {
      fromSearch = await prisma.application.findMany({
        where: { userId: user.id, jobUrl: { startsWith: "https://lim.test/" } },
      });
      if (fromSearch.length >= 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    // Only one slot left in the daily budget.
    expect(fromSearch.length).toBe(1);
  }, 120_000);
});
