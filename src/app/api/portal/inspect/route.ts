import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/session";
import { newContext } from "@/lib/automation/browser";
import { probePortal } from "@/lib/automation/inspector";
import { synthesizeQuestions } from "@/lib/ai/agent";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/route";

const schema = z.object({ url: z.string().url() });

/** One-shot portal inspection so the UI can preview what a portal needs. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const ctx = await newContext();
    const page = await ctx.newPage();
    try {
      const probe = await probePortal(page, parsed.data.url);
      const profile = await prisma.profile.findUnique({ where: { userId } });
      const unknown = probe.fields.filter((f) => f.required);
      const questions = await synthesizeQuestions(unknown, profile ?? {});
      return NextResponse.json({ probe, suggestedQuestions: questions.questions });
    } finally {
      await ctx.close();
    }
  } catch (e) {
    return apiError(e);
  }
}
