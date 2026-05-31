import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { apiError } from "@/lib/route";
import { questionHash } from "@/lib/hash";

/**
 * Accept user-provided answers for pending questions on an
 * AWAITING_APPROVAL application. Merges them into the formSnapshot's
 * `answers` array (replacing or appending), persists them to
 * SavedAnswer so they're reused on future applications, and removes
 * each answered question from `pendingQuestions`.
 *
 * Body: { answers: Record<fieldId, string> }
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const app = await prisma.application.findFirst({
      where: { id: params.id, userId },
    });
    if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const userAnswers: Record<string, string> = (body && body.answers) || {};

    let snap: any = {};
    try {
      snap = app.formSnapshot ? JSON.parse(app.formSnapshot) : {};
    } catch {
      snap = {};
    }
    const fields: Array<{ fieldId: string; label: string; type: string }> = snap.fields ?? [];
    const answers: Array<{ fieldId: string; value: any; confidence: number; rationale?: string }> =
      Array.isArray(snap.answers) ? snap.answers : [];
    let pending: Array<{ fieldId: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string }> =
      Array.isArray(snap.pendingQuestions) ? snap.pendingQuestions : [];

    let saved = 0;
    for (const [fieldId, rawValue] of Object.entries(userAnswers)) {
      const value = (rawValue ?? "").toString();
      if (value.trim() === "") continue;
      const existing = answers.find((a) => a.fieldId === fieldId);
      if (existing) {
        existing.value = value;
        existing.confidence = 1.0;
        existing.rationale = "user-provided";
      } else {
        answers.push({ fieldId, value, confidence: 1.0, rationale: "user-provided" });
      }
      pending = pending.filter((p) => p.fieldId !== fieldId);

      const field = fields.find((f) => f.fieldId === fieldId);
      if (field?.label) {
        try {
          await prisma.savedAnswer.upsert({
            where: { userId_questionHash: { userId, questionHash: questionHash(field.label) } },
            create: {
              userId,
              questionHash: questionHash(field.label),
              questionText: field.label,
              answer: value,
              fieldType: field.type ?? "text",
            },
            update: { answer: value },
          });
        } catch { /* non-fatal */ }
      }
      saved++;
    }

    const nextSnap = { ...snap, fields, answers, pendingQuestions: pending };
    const progressMessage =
      pending.length > 0
        ? `Need your input on ${pending.length} question${pending.length === 1 ? "" : "s"} before submitting.`
        : "Ready for review — click Approve & submit to send.";

    await prisma.application.update({
      where: { id: app.id },
      data: {
        formSnapshot: JSON.stringify(nextSnap),
        progressMessage,
      },
    });

    return NextResponse.json({ ok: true, saved, pending: pending.length });
  } catch (e) {
    return apiError(e);
  }
}
