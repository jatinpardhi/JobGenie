import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { enqueueSearch } from "@/lib/queue";
import { apiError } from "@/lib/route";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();
    const search = await prisma.jobSearch.findFirst({
      where: { id: params.id, userId },
    });
    if (!search) return NextResponse.json({ error: "not found" }, { status: 404 });
    await enqueueSearch({ searchId: search.id, userId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
