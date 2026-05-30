import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { enqueueApply } from "@/lib/queue";
import { apiError } from "@/lib/route";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const app = await prisma.application.findFirst({
      where: { id: params.id, userId },
    });
    if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "PENDING", errorMessage: null },
    });
    await enqueueApply({
      applicationId: app.id,
      userId,
      jobUrl: app.jobUrl,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
