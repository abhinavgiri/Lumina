import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateUserId } from "@/lib/session";
import { structuredResumeSchema } from "@/lib/resumeTypes";
import { buildResumeDownload, downloadOptionsFrom } from "@/lib/resumeDownload";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tailoredId: string }> }) {
  const { tailoredId } = await params;
  const userId = await getOrCreateUserId();

  const tailored = await prisma.tailoredResume.findFirst({
    where: { id: tailoredId, resume: { userId } },
  });

  if (!tailored) {
    return NextResponse.json({ error: "Tailored resume not found." }, { status: 404 });
  }

  const parsed = structuredResumeSchema.safeParse(JSON.parse(tailored.structuredJson));
  if (!parsed.success) {
    return NextResponse.json({ error: "Stored tailored resume is corrupted." }, { status: 500 });
  }

  const opts = downloadOptionsFrom(req.nextUrl.searchParams);
  const baseName = `${parsed.data.contact.name || "Tailored_Resume"}_Tailored`;
  return buildResumeDownload(parsed.data, opts, baseName);
}
