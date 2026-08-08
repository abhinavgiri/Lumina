import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateUserId } from "@/lib/session";
import { structuredResumeSchema } from "@/lib/resumeTypes";
import { parseRawToStructured } from "@/lib/ai/localEngine";
import { buildResumeDownload, downloadOptionsFrom } from "@/lib/resumeDownload";

export async function GET(req: NextRequest, { params }: { params: Promise<{ resumeId: string }> }) {
  const { resumeId } = await params;
  const userId = await getOrCreateUserId();

  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) {
    return NextResponse.json({ error: "Resume not found." }, { status: 404 });
  }

  let structured = null;
  if (resume.structuredJson) {
    const parsed = structuredResumeSchema.safeParse(JSON.parse(resume.structuredJson));
    if (parsed.success) structured = parsed.data;
  }
  if (!structured) {
    structured = parseRawToStructured(resume.rawText);
  }

  const opts = downloadOptionsFrom(req.nextUrl.searchParams);
  return buildResumeDownload(structured, opts, structured.contact.name || "Resume");
}
