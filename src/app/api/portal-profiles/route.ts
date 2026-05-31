import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { apiError } from "@/lib/route";
import { questionHash } from "@/lib/hash";

/**
 * List portal profiles for the signed-in user, enriched with how many
 * of each portal's questions are still unanswered.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const profiles = await prisma.portalProfile.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    const saved = await prisma.savedAnswer.findMany({
      where: { userId },
      select: { questionHash: true, answer: true, questionText: true },
    });
    const answeredHashes = new Set(saved.map((s) => s.questionHash));

    const out = profiles.map((p) => {
      let questions: any[] = [];
      try { questions = JSON.parse(p.questions); } catch { questions = []; }
      let answered = 0;
      let totalRequired = 0;
      let pendingRequired = 0;
      for (const q of questions) {
        const has = answeredHashes.has(questionHash(q.label ?? ""));
        if (has) answered++;
        if (q.required) {
          totalRequired++;
          if (!has) pendingRequired++;
        }
      }
      return {
        id: p.id,
        portal: p.portal,
        sampleUrl: p.sampleUrl,
        completed: p.completed && pendingRequired === 0,
        questionCount: questions.length,
        answered,
        totalRequired,
        pendingRequired,
        updatedAt: p.updatedAt,
      };
    });
    return NextResponse.json(out);
  } catch (e) {
    return apiError(e);
  }
}
