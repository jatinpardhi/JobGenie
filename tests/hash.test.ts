import { describe, it, expect } from "vitest";
import { questionHash, jitter, sleep } from "@/lib/hash";

describe("hash utils", () => {
  it("normalizes equivalent questions to the same hash", () => {
    expect(questionHash("Years of experience?")).toBe(
      questionHash("years   of EXPERIENCE!")
    );
  });

  it("produces different hashes for different questions", () => {
    expect(questionHash("Years of experience")).not.toBe(
      questionHash("Expected salary")
    );
  });

  it("returns a 40-char sha1 hex", () => {
    const h = questionHash("hi");
    expect(h).toMatch(/^[a-f0-9]{40}$/);
  });

  it("sleep resolves after at least n ms", async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it("jitter is bounded", async () => {
    const start = Date.now();
    await jitter(10, 40);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(5);
    expect(elapsed).toBeLessThan(200);
  });
});
