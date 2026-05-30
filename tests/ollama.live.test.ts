import { describe, it, expect } from "vitest";

const live = process.env.LIVE_LLM === "1";
const d = live ? describe : describe.skip;

d("Ollama OpenAI-compat endpoint (live)", () => {
  it("responds to /v1/chat/completions", async () => {
    const base = process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1";
    const model = process.env.OPENAI_MODEL ?? "llama3.2:3b";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say OK." }],
        max_tokens: 8,
      }),
    });
    expect(res.ok).toBe(true);
    const json = (await res.json()) as any;
    expect(typeof json.choices?.[0]?.message?.content).toBe("string");
  }, 30_000);
});
