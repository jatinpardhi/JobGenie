import { describe, it, expect, vi } from "vitest";

// Force Redis to be unreachable so we exercise the inline fallback.
process.env.REDIS_URL = "redis://127.0.0.1:1";

vi.mock("@/lib/automation/applyEngine", () => ({
  runApplication: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/automation/searchEngine", () => ({
  discoverJobs: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    jobSearch: { findUniqueOrThrow: vi.fn() },
    application: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));

describe("queue", () => {
  it("falls back to inline mode when Redis is unreachable", async () => {
    const mod = await import("@/lib/queue");
    // queue.ts probes Redis lazily; give it a moment.
    await new Promise((r) => setTimeout(r, 1500));
    expect(mod.getQueueMode()).toBe("inline");
    expect(mod.applyQueue).toBeNull();
  });

  it("enqueueApply runs the inline handler without throwing", async () => {
    const { enqueueApply } = await import("@/lib/queue");
    const { runApplication } = await import("@/lib/automation/applyEngine");
    await enqueueApply({ applicationId: "a1", userId: "u1", jobUrl: "https://x" });
    // setImmediate schedules — wait for the microtask + immediate.
    await new Promise((r) => setImmediate(r));
    expect(runApplication).toHaveBeenCalledWith({
      applicationId: "a1",
      userId: "u1",
      jobUrl: "https://x",
    });
  });
});
