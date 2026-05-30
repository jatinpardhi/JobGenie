import IORedis from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import { env } from "./env";
import { logger } from "./logger";

const log = logger.child("queue");

export const APPLY_QUEUE = "jobgenie:apply";
export const SEARCH_QUEUE = "jobgenie:search";

let mode: "redis" | "inline" = "inline";
export let connection: IORedis | null = null;
export let applyQueue: Queue | null = null;
export let searchQueue: Queue | null = null;
export let applyEvents: QueueEvents | null = null;

const ready: Promise<void> = (async () => {
  try {
    const probe = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 800,
      lazyConnect: true,
    });
    await probe.connect();
    await probe.ping();
    await probe.quit();

    connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
    applyQueue = new Queue(APPLY_QUEUE, { connection: connection as any });
    searchQueue = new Queue(SEARCH_QUEUE, { connection: connection as any });
    applyEvents = new QueueEvents(APPLY_QUEUE, { connection: connection as any });
    mode = "redis";
    log.info("Queue using Redis", { url: env.redisUrl });
  } catch (err) {
    log.warn("Redis unavailable, falling back to inline execution", {
      err: String(err),
    });
    mode = "inline";
  }
})();

export function getQueueMode(): "redis" | "inline" {
  return mode;
}

export async function enqueueApply(data: { applicationId: string; userId: string; jobUrl: string; bypassApproval?: boolean }) {
  await ready;
  if (mode === "redis" && applyQueue) {
    await applyQueue.add("apply", data);
    return;
  }
  // Lazy-load to avoid circular imports at module init.
  const { runApplication } = await import("./automation/applyEngine");
  setImmediate(() => {
    runApplication(data).catch((e) => log.error("inline apply failed", { err: String(e) }));
  });
}

export async function enqueueSearch(data: { searchId: string; userId: string }) {
  await ready;
  if (mode === "redis" && searchQueue) {
    await searchQueue.add("search", data);
    return;
  }
  const [{ discoverJobs }, { prisma }] = await Promise.all([
    import("./automation/searchEngine"),
    import("./db"),
  ]);
  setImmediate(async () => {
    const started = Date.now();
    const setProgress = async (msg: string) => {
      try {
        await prisma.jobSearch.update({
          where: { id: data.searchId },
          data: { lastProgress: msg.slice(0, 200) },
        });
      } catch { /* row may have been deleted */ }
    };
    try {
      const search = await prisma.jobSearch.findUniqueOrThrow({ where: { id: data.searchId } });
      await prisma.jobSearch.update({
        where: { id: search.id },
        data: {
          lastStatus: "RUNNING",
          lastRunAt: new Date(),
          lastError: null,
          lastProgress: "Starting…",
        },
      });
      const jobs = await discoverJobs({
        portalUrl: search.portalUrl,
        keywords: search.keywords,
        filters: search.filters ? JSON.parse(search.filters) : undefined,
        onProgress: setProgress,
      });
      await setProgress(`Queuing ${jobs.length} application${jobs.length === 1 ? "" : "s"}…`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await prisma.application.count({
        where: { userId: data.userId, createdAt: { gte: today } },
      });
      let budget = Math.max(0, env.dailyLimit - todayCount);
      let created = 0;
      for (const j of jobs) {
        if (budget <= 0) break;
        const existing = await prisma.application.findUnique({
          where: { userId_jobUrl: { userId: data.userId, jobUrl: j.url } },
        });
        if (existing) continue;
        const app = await prisma.application.create({
          data: {
            userId: data.userId,
            searchId: data.searchId,
            jobUrl: j.url,
            jobTitle: j.title,
            status: "PENDING",
          },
        });
        await enqueueApply({ applicationId: app.id, userId: data.userId, jobUrl: j.url });
        budget--;
        created++;
      }
      await prisma.jobSearch.update({
        where: { id: search.id },
        data: {
          lastStatus: jobs.length === 0 ? "ERROR" : "OK",
          lastJobCount: jobs.length,
          lastError:
            jobs.length === 0
              ? "No job links found on the page. The portal may block bots, require login, or render results in JS that didn't load. Try a Greenhouse/Lever/Workday link."
              : null,
          lastProgress:
            jobs.length === 0
              ? "Finished — 0 jobs found."
              : `Finished — queued ${created} new application${created === 1 ? "" : "s"} from ${jobs.length} link${jobs.length === 1 ? "" : "s"}.`,
          lastRunAt: new Date(),
        },
      });
      log.info("inline search done", { jobs: jobs.length, created, ms: Date.now() - started });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      log.error("inline search failed", { err: msg });
      try {
        await prisma.jobSearch.update({
          where: { id: data.searchId },
          data: {
            lastStatus: "ERROR",
            lastError: msg.slice(0, 500),
            lastProgress: "Failed.",
            lastRunAt: new Date(),
          },
        });
      } catch {
        // search row may not exist
      }
    }
  });
}
