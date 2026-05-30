import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { enqueueSearch } from "@/lib/queue";
import { apiError } from "@/lib/route";

const schema = z.object({
  portalUrl: z.string().url(),
  keywords: z.string().min(1),
  filters: z.record(z.any()).optional(),
  schedule: z.string().optional(),
  runNow: z.boolean().optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const searches = await prisma.jobSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(searches);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { portalUrl, keywords, filters, schedule, runNow } = parsed.data;
    const search = await prisma.jobSearch.create({
      data: { userId, portalUrl, keywords, filters: filters ? JSON.stringify(filters) : null, schedule },
    });
    if (runNow !== false) {
      await enqueueSearch({ searchId: search.id, userId });
    }
    return NextResponse.json(search);
  } catch (e) {
    return apiError(e);
  }
}
