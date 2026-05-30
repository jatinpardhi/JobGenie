import OpenAI from "openai";
import { env } from "../env";

export const openai = new OpenAI({
  apiKey: env.openaiKey || "ollama",
  baseURL: env.openaiBaseUrl,
});

export const SYSTEM_PROMPTS = {
  fieldMapper: `You are JobGenie's form-understanding agent.
You will receive a JSON list of detected form fields from a job application page
and a JSON user profile. For EACH field, decide the best value from the profile or
return null if unknown. Output strict JSON: { "answers": [{ "fieldId": string, "value": string|boolean|null, "confidence": 0-1, "rationale": string }] }.
Never invent employment history or credentials. If a field is required and unknown,
return value=null with a short rationale so the system can ask the user.`,

  coverLetter: `You write concise (180-260 words), specific, human cover letters.
Use ONLY facts present in the resume and profile. No clichés, no "I am writing to apply".
Open with a concrete hook tied to the company/role. Plain text, no markdown.`,

  matchScorer: `Rate how well a candidate matches a job from 0 to 1.
Weigh: required skills overlap, seniority fit, location/work-mode fit, domain fit.
Return strict JSON: { "score": number, "reasons": string[], "missing": string[] }.`,

  questionSynth: `Given a user profile and a set of unknown application fields,
produce the minimum set of questions to ask the user. Output strict JSON:
{ "questions": [{ "id": string, "label": string, "type": "text"|"select"|"boolean"|"number", "options"?: string[] }] }.`,
};

export async function jsonCompletion<T>(
  system: string,
  user: string,
  schemaHint = ""
): Promise<T> {
  const resp = await openai.chat.completions.create({
    model: env.openaiModel,
    // Ollama's OpenAI-compat layer ignores unknown fields, so this is safe
    // for both OpenAI and Ollama. We also re-instruct in the system prompt.
    response_format: { type: "json_object" } as any,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          system +
          (schemaHint ? `\n${schemaHint}` : "") +
          "\n\nRespond with a single valid JSON object only. No prose, no markdown fences.",
      },
      { role: "user", content: user },
    ],
  });
  const text = resp.choices[0]?.message?.content ?? "{}";
  return parseJsonLoose<T>(text);
}

export function parseJsonLoose<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("AI response was not valid JSON");
  }
}

export async function textCompletion(
  system: string,
  user: string,
  temperature = 0.6
): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: env.openaiModel,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return resp.choices[0]?.message?.content?.trim() ?? "";
}
