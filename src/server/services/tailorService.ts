/**
 * Tailoring Service — reshape a resume around a specific job description.
 *
 * Extracted from src/app/api/resume/tailor/route.ts. Accepts either an existing
 * jobDescId (the analysis flow) or raw jdText (the job-search flow, where the
 * posting hasn't been saved yet and is persisted on the fly).
 */
import { prisma } from "@/lib/db";
import { getAiEngine } from "@/lib/ai";
import type { StructuredResume } from "@/lib/resumeTypes";
import { badRequest, notFound } from "@/lib/api/response";
import { readStructured, requireResume } from "@/server/services/resumeService";

export type TailorInput = {
  resumeId: string;
  jobDescId?: string;
  jdText?: string;
};

export type TailorOutput = {
  tailoredResumeId: string;
  resume: StructuredResume;
  changes: string[];
  gaps: string[];
};

export async function tailorResume(userId: string, input: TailorInput): Promise<TailorOutput> {
  const { resumeId, jobDescId, jdText } = input;
  if (!resumeId || (!jobDescId && !jdText?.trim())) {
    throw badRequest("Missing resumeId or job description.");
  }

  const resume = await requireResume(userId, resumeId);

  let jobDesc = jobDescId
    ? await prisma.jobDesc.findFirst({ where: { id: jobDescId, userId } })
    : null;
  if (!jobDesc && jdText?.trim()) {
    jobDesc = await prisma.jobDesc.create({ data: { userId, rawText: jdText.trim() } });
  }
  if (!jobDesc) throw notFound("Job description not found.");

  const result = await getAiEngine().tailorResume(
    resume.rawText,
    jobDesc.rawText,
    readStructured(resume.structuredJson)
  );

  const tailored = await prisma.tailoredResume.create({
    data: {
      resumeId,
      jobDescId: jobDesc.id,
      structuredJson: JSON.stringify(result.resume),
      changesJson: JSON.stringify(result.changes),
      gapsJson: JSON.stringify(result.gaps),
    },
  });

  return {
    tailoredResumeId: tailored.id,
    resume: result.resume,
    changes: result.changes,
    gaps: result.gaps,
  };
}
