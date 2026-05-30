import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { enqueueApply } from "@/lib/queue";
import { apiError } from "@/lib/route";

export async function GET() {
  try {
    const userId = await requireUserId();
    const apps = await prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(apps);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { jobUrl } = await req.json();
    if (!jobUrl) return NextResponse.json({ error: "jobUrl required" }, { status: 400 });
    const app = await prisma.application.upsert({
      where: { userId_jobUrl: { userId, jobUrl } },
      create: { userId, jobUrl, status: "PENDING" },
      update: { status: "PENDING", errorMessage: null },
    });
    await enqueueApply({ applicationId: app.id, userId, jobUrl });
    return NextResponse.json(app);
  } catch (e) {
    return apiError(e);
  }
}
