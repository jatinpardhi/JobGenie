import { Worker } from "bullmq";
import { APPLY_QUEUE, SEARCH_QUEUE, connection, enqueueApply, getQueueMode } from "../lib/queue";
import { runApplication } from "../lib/automation/applyEngine";
import { discoverJobs } from "../lib/automation/searchEngine";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const log = logger.child("worker");

// Wait one tick so queue.ts can probe Redis.
setTimeout(() => {
  if (getQueueMode() !== "redis" || !connection) {
    log.error("Worker requires Redis. Inline mode is on — run the web app instead; it executes jobs in-process.");
    process.exit(1);
  }

  const applyWorker = new Worker(
    APPLY_QUEUE,
    async (job) => {
      log.info("apply job picked", { id: job.id, data: job.data });
      await runApplication(job.data);
    },
    { connection: connection as any, concurrency: 2 }
  );

  const searchWorker = new Worker(
    SEARCH_QUEUE,
    async (job) => {
      const { searchId, userId } = job.data as { searchId: string; userId: string };
      const search = await prisma.jobSearch.findUniqueOrThrow({ where: { id: searchId } });
      const jobs = await discoverJobs({
        portalUrl: search.portalUrl,
        keywords: search.keywords,
        filters: search.filters ? JSON.parse(search.filters) : undefined,
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = await prisma.application.count({
        where: { userId, createdAt: { gte: today } },
      });
      let budget = Math.max(0, env.dailyLimit - todayCount);

      for (const j of jobs) {
        if (budget <= 0) break;
        const existing = await prisma.application.findUnique({
          where: { userId_jobUrl: { userId, jobUrl: j.url } },
        });
        if (existing) continue;
        const app = await prisma.application.create({
          data: {
            userId,
            searchId,
            jobUrl: j.url,
            jobTitle: j.title,
            status: "PENDING",
          },
        });
        await enqueueApply({ applicationId: app.id, userId, jobUrl: j.url });
        budget--;
      }
    },
    { connection: connection as any, concurrency: 1 }
  );

  applyWorker.on("failed", (j, err) => log.error("apply failed", { id: j?.id, err: String(err) }));
  searchWorker.on("failed", (j, err) => log.error("search failed", { id: j?.id, err: String(err) }));

  log.info("JobGenie worker started", { headless: env.headless });
}, 1500);
