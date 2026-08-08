import type { ResumeAnalysis } from "@/lib/ai";

export type ResumeInfo = {
  id: string;
  rawText: string;
  source: "uploaded" | "built";
  structuredJson: string | null;
};

export type HistoryEntry = {
  id: string;
  score: number;
  hasJd: boolean;
  matchPercent: number | null;
  createdAt: string;
};

export type AnalyzeResponse = {
  atsReportId: string;
  jobDescId: string | null;
  engine: string;
  analysis: ResumeAnalysis;
};
