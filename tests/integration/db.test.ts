import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Use a separate file so we don't pollute dev.db.
const DB_FILE = path.resolve(process.cwd(), "test-integration.db");
process.env.DATABASE_URL = `file:${DB_FILE}`;

let prisma: PrismaClient;

beforeAll(async () => {
  // Reset DB and apply migrations via prisma CLI.
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  const { execSync } = await import("node:child_process");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ datasources: { db: { url: `file:${DB_FILE}` } } });
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  // Also remove sqlite journal files if any.
  for (const ext of ["-journal", "-shm", "-wal"]) {
    const f = DB_FILE + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe("integration: prisma + sqlite", () => {
  it("creates user → profile → search → application", async () => {
    const user = await prisma.user.create({
      data: { email: `it-${Date.now()}@test.local`, name: "Test" },
    });
    expect(user.id).toBeTruthy();

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        fullName: "Test User",
        preferredLocations: "Berlin,Remote",
        workModes: "remote,hybrid",
        data: JSON.stringify({ extra: "field" }),
      },
    });
    expect(profile.preferredLocations).toContain("Berlin");
    expect(JSON.parse(profile.data!)).toEqual({ extra: "field" });

    const search = await prisma.jobSearch.create({
      data: {
        userId: user.id,
        portalUrl: "https://example.test/jobs",
        keywords: "software engineer",
        filters: JSON.stringify({ workMode: "remote" }),
      },
    });

    const app = await prisma.application.create({
      data: {
        userId: user.id,
        searchId: search.id,
        jobUrl: "https://example.test/jobs/1",
        jobTitle: "Senior Engineer",
        status: "PENDING",
        logs: JSON.stringify([{ step: "start", ts: Date.now() }]),
        formSnapshot: JSON.stringify({ fields: [] }),
      },
    });
    expect(app.status).toBe("PENDING");
    expect(JSON.parse(app.logs!)).toHaveLength(1);
  });

  it("enforces unique(userId, jobUrl) on Application", async () => {
    const user = await prisma.user.create({
      data: { email: `it2-${Date.now()}@test.local` },
    });
    await prisma.application.create({
      data: { userId: user.id, jobUrl: "https://dup.test/1", status: "PENDING" },
    });
    await expect(
      prisma.application.create({
        data: { userId: user.id, jobUrl: "https://dup.test/1", status: "PENDING" },
      })
    ).rejects.toThrow();
  });

  it("enforces unique(userId, questionHash) on SavedAnswer", async () => {
    const user = await prisma.user.create({
      data: { email: `it3-${Date.now()}@test.local` },
    });
    await prisma.savedAnswer.create({
      data: { userId: user.id, questionHash: "h1", questionText: "Q", answer: "A" },
    });
    await expect(
      prisma.savedAnswer.create({
        data: { userId: user.id, questionHash: "h1", questionText: "Q", answer: "B" },
      })
    ).rejects.toThrow();
  });

  it("cascade deletes user removes related rows", async () => {
    const user = await prisma.user.create({
      data: { email: `it4-${Date.now()}@test.local` },
    });
    await prisma.application.create({
      data: { userId: user.id, jobUrl: "https://cascade.test/1", status: "PENDING" },
    });
    await prisma.user.delete({ where: { id: user.id } });
    const remaining = await prisma.application.findMany({ where: { userId: user.id } });
    expect(remaining).toHaveLength(0);
  });
});
