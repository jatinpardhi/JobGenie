import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";

import { apiError } from "@/lib/route";

export async function GET() {
  try {
    const userId = await requireUserId();
    const resumes = await prisma.resume.findMany({ where: { userId } });
    return NextResponse.json(resumes);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const form = await req.formData();
  const file = form.get("file") as File | null;
  const label = (form.get("label") as string) || "Resume";
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  await fs.mkdir(env.uploadDir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  const safeName = `${Date.now()}_${file.name.replace(/[^a-z0-9_.-]/gi, "_")}`;
  const filePath = path.join(env.uploadDir, safeName);
  await fs.writeFile(filePath, buf);

  let parsedText = "";
  if (file.name.toLowerCase().endsWith(".pdf")) {
    try {
      const parsed = await pdfParse(buf);
      parsedText = parsed.text;
    } catch {
      // ignore parse errors
    }
  } else {
    parsedText = buf.toString("utf8").slice(0, 200_000);
  }

  const count = await prisma.resume.count({ where: { userId } });
  const resume = await prisma.resume.create({
    data: {
      userId,
      label,
      filePath,
      parsedText,
      isDefault: count === 0,
    },
  });
  return NextResponse.json(resume);
  } catch (e) {
    return apiError(e);
  }
}
