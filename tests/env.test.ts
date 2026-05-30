import { describe, it, expect } from "vitest";
import { env } from "@/lib/env";

describe("env", () => {
  it("loads required defaults", () => {
    expect(env.redisUrl).toMatch(/^redis:\/\//);
    expect(env.openaiBaseUrl).toMatch(/^https?:\/\//);
    expect(env.openaiModel).toBeTruthy();
    expect(env.dailyLimit).toBeGreaterThan(0);
    expect(typeof env.humanApproval).toBe("boolean");
    expect(typeof env.headless).toBe("boolean");
  });

  it("respects HUMAN_APPROVAL_MODE override", () => {
    expect(env.humanApproval).toBe(true);
  });
});
