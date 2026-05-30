import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { apiError } from "@/lib/route";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await prisma.profile.findUnique({ where: { userId } });
    return NextResponse.json(profile ?? {});
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const updated = await prisma.profile.upsert({
      where: { userId },
      create: { userId, ...body },
      update: body,
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
