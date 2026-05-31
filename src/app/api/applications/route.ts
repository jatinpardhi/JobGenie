import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { enqueueApply } from "@/lib/queue";
import { apiError } from "@/lib/route";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const skip = Math.max(0, Number(url.searchParams.get("skip") ?? "0") || 0);
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get("take") ?? "200") || 200));
    const [apps, total] = await Promise.all([
      prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.application.count({ where: { userId } }),
    ]);
    return NextResponse.json(apps, { headers: { "x-total-count": String(total) } });
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
