/**
 * ATS / Analysis Service — scoring a resume, optionally against a JD, and
 * generating the learning roadmap that follows from the gaps.
 *
 * Extracted from src/app/api/analyze/route.ts and src/app/api/roadmap/route.ts,
 * which were doing auth + DB reads + JSON-blob parsing + AI calls +
 * multi-entity persistence inline in the HTTP handler.
 */
import { prisma } from "@/lib/db";
import { getAiEngine, type ResumeAnalysis, type RoadmapResult } from "@/lib/ai";
import { badRequest, notFound } from "@/lib/api/response";
import { readStructured, requireResume } from "@/server/services/resumeService";

/** A JD shorter than this isn't worth matching against — the engine agrees. */
const MIN_JD_CHARS = 30;

export type AnalysisResult = {
  atsReportId: string;
  jobDescId: string | null;
  engine: string;
  analysis: ResumeAnalysis;
};

/**
 * Score a resume, optionally against a job description, and persist the report.
 * When a usable JD is supplied it is persisted too, so the roadmap step can be
 * generated from the same match later.
 */
export async function analyzeResume(
  userId: string,
  resumeId: string,
  jdText?: string
): Promise<AnalysisResult> {
  const resume = await requireResume(userId, resumeId);
  const structured = readStructured(resume.structuredJson);
  const jd = jdText?.trim();

  const engine = getAiEngine();
  const analysis = await engine.analyzeResume(resume.rawText, {
    targetRole: structured?.targetRole ?? "",
    jdText: jd || undefined,
    // Pass the stored structure when we have it — the ATS engine scores
    // experience/projects/skills far more accurately from real entities than
    // from a heuristic re-parse of the raw text.
    structured: structured ?? undefined,
  });

  let jobDescId: string | null = null;
  if (jd && jd.length >= MIN_JD_CHARS && analysis.jdMatch) {
    const jobDesc = await prisma.jobDesc.create({
      data: {
        userId,
        rawText: jd,
        parsedRequirementsJson: JSON.stringify({
          matchedKeywords: analysis.jdMatch.matchedKeywords,
          missingKeywords: analysis.jdMatch.missingKeywords,
          missingMustHaves: analysis.jdMatch.missingMustHaves,
          experienceLevel: analysis.jdMatch.experienceLevel,
        }),
      },
    });
    jobDescId = jobDesc.id;
  }

  const report = await prisma.atsReport.create({
    data: {
      resumeId,
      jobDescId,
      score: analysis.atsScore,
      breakdownJson: JSON.stringify(analysis),
    },
  });

  return { atsReportId: report.id, jobDescId, engine: engine.name, analysis };
}

/**
 * Build (or return the cached) learning roadmap for a JD-matched report.
 * Roadmaps are generated once per report and reused — they're deterministic
 * for a given gap set, so regenerating would just burn time.
 */
export async function generateRoadmap(
  userId: string,
  atsReportId: string
): Promise<RoadmapResult> {
  const report = await prisma.atsReport.findFirst({
    where: { id: atsReportId, resume: { userId } },
    include: { jobDesc: true, roadmap: true },
  });

  if (!report || !report.jobDesc) {
    throw notFound("Job-description match report not found.");
  }
  if (report.roadmap) {
    return JSON.parse(report.roadmap.stepsJson) as RoadmapResult;
  }

  const analysis = JSON.parse(report.breakdownJson) as ResumeAnalysis;
  if (!analysis.jdMatch) {
    throw badRequest("This report has no job-description match to build a roadmap from.");
  }

  const resume = await prisma.resume.findUnique({ where: { id: report.resumeId } });
  if (!resume) throw notFound("Resume not found.");

  const roadmap = await getAiEngine().generateRoadmap(
    analysis.jdMatch.missingKeywords,
    analysis.jdMatch.missingMustHaves,
    report.jobDesc.rawText,
    resume.rawText
  );

  await prisma.roadmap.create({
    data: { atsReportId, stepsJson: JSON.stringify(roadmap) },
  });

  return roadmap;
}
