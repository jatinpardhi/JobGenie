import { describe, it, expect, beforeAll } from "vitest";
import { isOllamaUp } from "./_probes";

let up = false;
beforeAll(async () => {
  up = await isOllamaUp();
});

describe("integration: ollama (OpenAI-compat)", () => {
  it.skipIf(!up || true)("placeholder", () => {});
  // Real tests defined below — each gated on `up`.

  it("lists models on /v1/models", async () => {
    if (!up) return;
    const base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
    const res = await fetch(`${base}/models`);
    expect(res.ok).toBe(true);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("responds to /v1/chat/completions with the configured model", async () => {
    if (!up) return;
    const base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
    const model = process.env.OPENAI_MODEL ?? "llama3.2:3b";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Reply with the single word: PONG" },
          { role: "user", content: "ping" },
        ],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    expect(res.ok).toBe(true);
    const json = (await res.json()) as any;
    const content = String(json.choices?.[0]?.message?.content ?? "");
    expect(content.length).toBeGreaterThan(0);
  }, 60_000);

  it("produces parseable JSON when asked", async () => {
    if (!up) return;
    const base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
    const model = process.env.OPENAI_MODEL ?? "llama3.2:3b";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              'Reply ONLY with valid JSON of the form {"score": number between 0 and 1}. No prose.',
          },
          { role: "user", content: "How good a match is React for a Frontend role?" },
        ],
        max_tokens: 64,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    expect(res.ok).toBe(true);
    const json = (await res.json()) as any;
    const content = String(json.choices?.[0]?.message?.content ?? "");
    // Use the same lenient parser the app uses.
    const { parseJsonLoose } = await import("@/lib/ai/openai");
    const parsed = parseJsonLoose<{ score: number }>(content);
    expect(typeof parsed.score).toBe("number");
  }, 60_000);
});
