import { describe, it, expect } from "vitest";
import { parseJsonLoose, SYSTEM_PROMPTS } from "@/lib/ai/openai";

describe("parseJsonLoose", () => {
  it("parses clean JSON", () => {
    expect(parseJsonLoose<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const text = "```json\n{\"score\":0.8}\n```";
    expect(parseJsonLoose<{ score: number }>(text)).toEqual({ score: 0.8 });
  });

  it("strips plain ``` fences", () => {
    const text = "```\n{\"ok\":true}\n```";
    expect(parseJsonLoose<{ ok: boolean }>(text)).toEqual({ ok: true });
  });

  it("extracts JSON from surrounding prose", () => {
    const text = 'Sure! Here you go: {"questions":[{"id":"q1"}]} hope that helps.';
    expect(parseJsonLoose<any>(text).questions[0].id).toBe("q1");
  });

  it("throws on unrecoverable garbage", () => {
    expect(() => parseJsonLoose("not json at all")).toThrow();
  });
});

describe("SYSTEM_PROMPTS", () => {
  it("defines all four agent prompts", () => {
    expect(SYSTEM_PROMPTS.fieldMapper).toMatch(/JSON/);
    expect(SYSTEM_PROMPTS.coverLetter).toMatch(/cover/i);
    expect(SYSTEM_PROMPTS.matchScorer).toMatch(/score/i);
    expect(SYSTEM_PROMPTS.questionSynth).toMatch(/questions/i);
  });
});
