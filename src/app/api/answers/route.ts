import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { questionHash } from "@/lib/hash";
import { apiError } from "@/lib/route";

export async function GET() {
  try {
    const userId = await requireUserId();
    const answers = await prisma.savedAnswer.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(answers);
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const { questionText, answer, fieldType } = await req.json();
    if (!questionText || answer == null) {
      return NextResponse.json({ error: "questionText and answer required" }, { status: 400 });
    }
    const hash = questionHash(questionText);
    const saved = await prisma.savedAnswer.upsert({
      where: { userId_questionHash: { userId, questionHash: hash } },
      create: { userId, questionHash: hash, questionText, answer, fieldType },
      update: { answer, fieldType },
    });
    return NextResponse.json(saved);
  } catch (e) {
    return apiError(e);
  }
}
