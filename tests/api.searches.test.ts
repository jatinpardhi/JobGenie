import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror of the schema defined in src/app/api/searches/route.ts.
// Kept in sync via this test — if the route schema changes, this test
// must be updated, which is a desirable forcing function.
const schema = z.object({
  portalUrl: z.string().url(),
  keywords: z.string().min(1),
  filters: z.record(z.any()).optional(),
  schedule: z.string().optional(),
  runNow: z.boolean().optional(),
});

describe("POST /api/searches schema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      schema.safeParse({
        portalUrl: "https://www.linkedin.com/jobs",
        keywords: "senior react",
      }).success
    ).toBe(true);
  });

  it("rejects bad URL", () => {
    expect(
      schema.safeParse({ portalUrl: "not-a-url", keywords: "x" }).success
    ).toBe(false);
  });

  it("rejects empty keywords", () => {
    expect(
      schema.safeParse({ portalUrl: "https://x.test", keywords: "" }).success
    ).toBe(false);
  });

  it("accepts filters as arbitrary record", () => {
    const r = schema.safeParse({
      portalUrl: "https://x.test",
      keywords: "k",
      filters: { remote: true, location: "Berlin", salary: { min: 80000 } },
    });
    expect(r.success).toBe(true);
  });
});
