/**
 * Analytics Service — career insights derived from what the user has actually
 * done: ATS reports over time, recurring JD gaps, and the application pipeline.
 *
 * DESIGN RULE: only compute what the data genuinely supports, and say so when it
 * doesn't. Every figure here traces to a real row. Nothing is estimated,
 * benchmarked against invented averages, or padded to make the dashboard look
 * busy — a job-seeker making decisions from this deserves honest numbers.
 *
 * Consequence: several fields are deliberately nullable. `scoreTrend.delta` is
 * null until there are two reports; `interviewRate` is null until something has
 * actually been submitted. The UI renders "not enough data yet" rather than a 0.
 */
import { prisma } from "@/lib/db";
import type { ResumeAnalysis } from "@/lib/ai";
import { applicationStats, type ApplicationStats } from "@/server/services/applicationService";

/** Reports older than this aren't interesting for a trend. */
const TREND_LIMIT = 30;
/** How many recurring gaps to surface — enough to act on, not a wall of text. */
const TOP_GAPS = 6;

export type ScorePoint = { date: string; score: number; hasJd: boolean };

export type ScoreTrend = {
  points: ScorePoint[];
  latest: number | null;
  best: number | null;
  /** Change from the first to the most recent report; null with fewer than 2. */
  delta: number | null;
};

export type SkillGap = { skill: string; count: number; mustHave: boolean };

export type AnalyticsSummary = {
  scoreTrend: ScoreTrend;
  /** Skills repeatedly missing across analysed job descriptions. */
  recurringGaps: SkillGap[];
  applications: ApplicationStats;
  /** How many JDs the gap analysis is based on — context for the numbers. */
  analysedJobDescriptions: number;
  totalAnalyses: number;
};

/** Parse a stored report, tolerating anything malformed rather than throwing. */
function readAnalysis(json: string): Partial<ResumeAnalysis> | null {
  try {
    return JSON.parse(json) as Partial<ResumeAnalysis>;
  } catch {
    return null;
  }
}

export async function getAnalytics(userId: string): Promise<AnalyticsSummary> {
  const reports = await prisma.atsReport.findMany({
    where: { resume: { userId } },
    orderBy: { createdAt: "asc" },
    take: TREND_LIMIT,
    select: { score: true, createdAt: true, jobDescId: true, breakdownJson: true },
  });

  const points: ScorePoint[] = reports.map((r) => ({
    date: r.createdAt.toISOString(),
    score: r.score,
    hasJd: r.jobDescId !== null,
  }));

  const scores = points.map((p) => p.score);
  const scoreTrend: ScoreTrend = {
    points,
    latest: scores.length ? scores[scores.length - 1] : null,
    best: scores.length ? Math.max(...scores) : null,
    // A "change" needs two measurements. One report is a reading, not a trend.
    delta: scores.length >= 2 ? scores[scores.length - 1] - scores[0] : null,
  };

  // Recurring gaps: which skills keep coming up as missing across analysed JDs.
  // Counted once per report so a single JD repeating a keyword can't dominate.
  const gapCounts = new Map<string, { count: number; mustHave: boolean }>();
  let analysedJobDescriptions = 0;

  for (const report of reports) {
    const jdMatch = readAnalysis(report.breakdownJson)?.jdMatch;
    if (!jdMatch) continue;
    analysedJobDescriptions++;

    const mustHaves = new Set(jdMatch.missingMustHaves ?? []);
    for (const skill of new Set(jdMatch.missingKeywords ?? [])) {
      const entry = gapCounts.get(skill) ?? { count: 0, mustHave: false };
      entry.count++;
      // Once a gap has blocked a stated requirement, it stays flagged.
      if (mustHaves.has(skill)) entry.mustHave = true;
      gapCounts.set(skill, entry);
    }
  }

  const recurringGaps: SkillGap[] = [...gapCounts.entries()]
    .map(([skill, v]) => ({ skill, count: v.count, mustHave: v.mustHave }))
    // Must-haves first, then by how often they recur, then alphabetically so the
    // order is stable between renders.
    .sort(
      (a, b) =>
        Number(b.mustHave) - Number(a.mustHave) ||
        b.count - a.count ||
        a.skill.localeCompare(b.skill)
    )
    .slice(0, TOP_GAPS);

  return {
    scoreTrend,
    recurringGaps,
    applications: await applicationStats(userId),
    analysedJobDescriptions,
    totalAnalyses: reports.length,
  };
}
