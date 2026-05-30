import { SYSTEM_PROMPTS, jsonCompletion, textCompletion } from "./openai";

export interface DetectedField {
  fieldId: string;
  label: string;
  type: string; // text, textarea, select, radio, checkbox, file, email, tel, number
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface MappedAnswer {
  fieldId: string;
  value: string | boolean | null;
  confidence: number;
  rationale: string;
}

export async function mapFieldsToProfile(
  fields: DetectedField[],
  profile: Record<string, unknown>,
  resumeText?: string,
  savedAnswers: Record<string, string> = {}
): Promise<MappedAnswer[]> {
  const payload = JSON.stringify(
    {
      fields,
      profile,
      savedAnswers,
      resumeExcerpt: resumeText?.slice(0, 6000) ?? "",
    },
    null,
    2
  );
  const out = await jsonCompletion<{ answers: MappedAnswer[] }>(
    SYSTEM_PROMPTS.fieldMapper,
    payload
  );
  return out.answers ?? [];
}

export async function generateCoverLetter(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  profile: Record<string, unknown>;
  resumeText: string;
}): Promise<string> {
  const user = `JOB:\nTitle: ${input.jobTitle}\nCompany: ${input.company}\nDescription:\n${input.jobDescription.slice(
    0,
    4000
  )}\n\nPROFILE:\n${JSON.stringify(input.profile)}\n\nRESUME:\n${input.resumeText.slice(0, 6000)}`;
  return textCompletion(SYSTEM_PROMPTS.coverLetter, user, 0.7);
}

export async function scoreMatch(input: {
  jobTitle: string;
  jobDescription: string;
  profile: Record<string, unknown>;
  resumeText: string;
}): Promise<{ score: number; reasons: string[]; missing: string[] }> {
  let raw: { score?: number; reasons?: string[]; missing?: string[] } = {};
  try {
    raw = await jsonCompletion(
      SYSTEM_PROMPTS.matchScorer,
      JSON.stringify({
        job: { title: input.jobTitle, description: input.jobDescription.slice(0, 4000) },
        profile: input.profile,
        resume: input.resumeText.slice(0, 6000),
      })
    );
  } catch (e) {
    // LLM returned non-JSON — don't kill the pipeline.
    return { score: 0.6, reasons: ["scoring unavailable (LLM parse error), proceeding"], missing: [] };
  }
  const reasons = Array.isArray(raw.reasons) ? raw.reasons : [];
  const missing = Array.isArray(raw.missing) ? raw.missing : [];
  let score = typeof raw.score === "number" ? raw.score : NaN;
  // Allow models that return 0..100 instead of 0..1.
  if (score > 1 && score <= 100) score = score / 100;
  if (!Number.isFinite(score)) score = 0.6;
  // If the model gave a 0 with no rationale, treat as "couldn't judge" rather than hard-reject.
  if (score === 0 && reasons.length === 0) {
    return { score: 0.6, reasons: ["model returned 0 with no rationale — proceeding cautiously"], missing };
  }
  return { score, reasons, missing };
}

export async function synthesizeQuestions(
  unknownFields: DetectedField[],
  profile: Record<string, unknown>
) {
  return jsonCompletion<{
    questions: {
      id: string;
      label: string;
      type: "text" | "select" | "boolean" | "number";
      options?: string[];
    }[];
  }>(
    SYSTEM_PROMPTS.questionSynth,
    JSON.stringify({ unknownFields, profile })
  );
}
