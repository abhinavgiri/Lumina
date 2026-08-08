import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import Dashboard from "@/components/dashboard/Dashboard";
import type { HistoryEntry, ResumeInfo } from "@/components/dashboard/types";
import type { ResumeAnalysis } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await getUserId();

  let initialResume: ResumeInfo | null = null;
  let initialHistory: HistoryEntry[] = [];

  if (userId) {
    const resume = await prisma.resume.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (resume) {
      initialResume = {
        id: resume.id,
        rawText: resume.rawText,
        source: resume.source as "uploaded" | "built",
        structuredJson: resume.structuredJson,
      };
    }

    const reports = await prisma.atsReport.findMany({
      where: { resume: { userId } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    initialHistory = reports.map((r) => {
      let matchPercent: number | null = null;
      try {
        const analysis = JSON.parse(r.breakdownJson) as Partial<ResumeAnalysis>;
        matchPercent = analysis.jdMatch?.matchPercent ?? null;
      } catch {
        matchPercent = null;
      }
      return {
        id: r.id,
        score: r.score,
        hasJd: r.jobDescId !== null,
        matchPercent,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  return (
    <Dashboard
      initialResume={initialResume}
      initialHistory={initialHistory}
    />
  );
}
