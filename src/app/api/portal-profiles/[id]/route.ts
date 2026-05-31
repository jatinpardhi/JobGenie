import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { apiError } from "@/lib/route";
import { questionHash } from "@/lib/hash";

/**
 * Return one portal profile with its full questions list and the
 * current saved answer (if any) for each question. Used by the
 * portal-profile fill UI.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const profile = await prisma.portalProfile.findFirst({
      where: { id: params.id, userId },
    });
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });
    let questions: any[] = [];
    try { questions = JSON.parse(profile.questions); } catch { questions = []; }

    const saved = await prisma.savedAnswer.findMany({ where: { userId } });
    const byHash = new Map(saved.map((s) => [s.questionHash, s.answer]));

    const enriched = questions.map((q) => ({
      ...q,
      currentAnswer: byHash.get(questionHash(q.label ?? "")) ?? "",
    }));

    return NextResponse.json({
      id: profile.id,
      portal: profile.portal,
      sampleUrl: profile.sampleUrl,
      completed: profile.completed,
      questions: enriched,
    });
  } catch (e) {
    return apiError(e);
  }
}

/**
 * Save user-provided answers for this portal. Body: { answers: Record<label, value> }.
 * Persists each to SavedAnswer (keyed by question hash) so the apply
 * engine will reuse them on every future job from any portal sharing
 * the same question wording.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const profile = await prisma.portalProfile.findFirst({
      where: { id: params.id, userId },
    });
    if (!profile) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const userAnswers: Record<string, string> = (body && body.answers) || {};

    let questions: any[] = [];
    try { questions = JSON.parse(profile.questions); } catch { questions = []; }
    const byLabel = new Map(questions.map((q) => [q.label, q]));

    let saved = 0;
    for (const [label, rawValue] of Object.entries(userAnswers)) {
      const value = (rawValue ?? "").toString();
      if (!label || value.trim() === "") continue;
      const field = byLabel.get(label);
      try {
        await prisma.savedAnswer.upsert({
          where: { userId_questionHash: { userId, questionHash: questionHash(label) } },
          create: {
            userId,
            questionHash: questionHash(label),
            questionText: label,
            answer: value,
            fieldType: field?.type ?? "text",
          },
          update: { answer: value },
        });
        saved++;
      } catch { /* non-fatal */ }
    }

    // Re-check completeness against required questions.
    const allSaved = await prisma.savedAnswer.findMany({
      where: { userId },
      select: { questionHash: true },
    });
    const have = new Set(allSaved.map((s) => s.questionHash));
    const pendingRequired = questions.filter(
      (q) => q.required && !have.has(questionHash(q.label ?? ""))
    ).length;

    await prisma.portalProfile.update({
      where: { id: profile.id },
      data: { completed: pendingRequired === 0 },
    });

    return NextResponse.json({ ok: true, saved, pendingRequired });
  } catch (e) {
    return apiError(e);
  }
}
