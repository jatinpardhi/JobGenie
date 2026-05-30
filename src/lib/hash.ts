import crypto from "node:crypto";

/** Normalize a question into a stable hash so saved answers are reusable. */
export function questionHash(q: string): string {
  const norm = q
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(norm).digest("hex");
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Human-like jitter delay. */
export function jitter(min = 150, max = 600) {
  return sleep(min + Math.random() * (max - min));
}
