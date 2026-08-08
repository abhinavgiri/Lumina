"use client";

/**
 * Analysis orchestration, lifted out of Dashboard.tsx.
 *
 * The component previously owned the fetch call, the staged progress timers, the
 * artificial minimum delay, the history-list business rule, and the error
 * handling — all mixed into JSX. Now it renders state and calls `analyze()`.
 *
 * The deliberate UX delay stays here (presentation timing, not business logic):
 * the local engine returns in milliseconds, and results appearing instantly
 * reads as "it didn't actually do anything".
 */
import { useCallback, useState } from "react";
import { analyzeResume, type AnalyzeResult } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";
import type { HistoryEntry } from "@/components/dashboard/types";

export const ANALYZE_STAGES = [
  "Parsing resume structure…",
  "Extracting skills & keywords…",
  "Running ATS formatting checks…",
  "Scoring content quality…",
  "Matching against job description…",
  "Compiling insights…",
] as const;

const STAGE_INTERVAL_MS = 450;
const MIN_VISIBLE_MS = 2800;
/** How many past reports the dashboard keeps on screen. */
const HISTORY_LIMIT = 6;

export function useResumeAnalysis(initialHistory: HistoryEntry[]) {
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);

  const reset = useCallback(() => setResult(null), []);

  const analyze = useCallback(
    async (resumeId: string, jdText: string): Promise<AnalyzeResult | null> => {
      setAnalyzing(true);
      setError(null);
      setResult(null);
      setStage(0);

      const stageTimer = setInterval(
        () => setStage((s) => Math.min(s + 1, ANALYZE_STAGES.length - 1)),
        STAGE_INTERVAL_MS
      );
      const minVisible = new Promise((r) => setTimeout(r, MIN_VISIBLE_MS));

      try {
        const data = await analyzeResume(resumeId, jdText.trim() || undefined);
        await minVisible;

        setResult(data);
        setHistory((h) =>
          [
            {
              id: data.atsReportId,
              score: data.analysis.atsScore,
              hasJd: !!data.jobDescId,
              matchPercent: data.analysis.jdMatch?.matchPercent ?? null,
              createdAt: new Date().toISOString(),
            },
            ...h,
          ].slice(0, HISTORY_LIMIT)
        );
        return data;
      } catch (err) {
        setError(errorMessage(err, "Analysis failed. Please try again."));
        return null;
      } finally {
        clearInterval(stageTimer);
        setAnalyzing(false);
      }
    },
    []
  );

  return { analyze, reset, analyzing, stage, error, result, history };
}
