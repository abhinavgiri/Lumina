import type { AtsReport } from "@/lib/ats/engine";

import type { FormatCheckResult } from "@/lib/formatChecks";
import type { StructuredResume } from "@/lib/resumeTypes";

/** Content-quality scoring (out of 60, mirrors the ATS content rubric). */
export type ContentIssue = {
  category: string;
  detail: string;
  fix: string;
};

export type ContentQualityResult = {
  score: number; // out of 60
  maxScore: 60;
  subscores: {
    quantifiedAchievements: number; // /15
    actionVerbs: number; // /15
    clearTitlesAndDates: number; // /10
    skillCoverage: number; // /10
    noVagueFiller: number; // /10
  };
  issues: ContentIssue[];
};

/** Resume-vs-job-description match analysis. */
export type JdMatchResult = {
  matchPercent: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  missingMustHaves: string[];
  experienceLevel: {
    jdRequires: string;
    resumeShows: string;
    mismatch: boolean;
  };
  summary: string;
};

/** Grammar / language issues. */
export type GrammarIssue = {
  type: string;
  detail: string;
  suggestion: string;
};

/** The unified analysis returned by a single "Analyze" run. */
export type ResumeAnalysis = {
  /** 0-100, from the nine-category deterministic ATS engine (lib/ats/engine.ts). */
  atsScore: number;
  resumeQuality: number; // 0-100 (content-only, rescaled)
  /** Per-category breakdown — what the score is actually made of. */
  ats: AtsReport;
  format: FormatCheckResult;
  content: ContentQualityResult;
  grammar: GrammarIssue[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  jdMatch?: JdMatchResult;
};

/** Tailored (rewritten/reordered) resume output. */
export type TailorResult = {
  resume: StructuredResume;
  changes: string[];
  gaps: string[];
};

/** Skill-gap learning roadmap. */
export type RoadmapStep = {
  skill: string;
  priority: "high" | "medium" | "low";
  timeEstimate: string;
  resourceType: string;
  why: string;
};

export type RoadmapResult = {
  steps: RoadmapStep[];
  projectIdeas: string[];
};

export type AnalyzeOptions = {
  targetRole?: string;
  jdText?: string;
  /**
   * The stored structured resume, when there is one. The ATS engine scores
   * entity-level categories (experience, projects, skills) from this; without
   * it the raw text is parsed heuristically, which is less accurate.
   */
  structured?: StructuredResume;
};

/**
 * The AI engine contract. Every capability the app needs from "AI" goes
 * through this interface, so the local heuristic engine can be swapped for a
 * self-hosted LLM (or any other backend) without touching routes or UI.
 */
export interface AiEngine {
  /** Identifier surfaced in logs/UI, e.g. "local-heuristic-v1". */
  readonly name: string;

  /** Full resume analysis: ATS score, quality, grammar, strengths/weaknesses, optional JD match. */
  analyzeResume(resumeText: string, opts?: AnalyzeOptions): Promise<ResumeAnalysis>;

  /** Rewrite/reorder the resume toward a JD without fabricating anything. */
  tailorResume(
    resumeText: string,
    jdText: string,
    structured: StructuredResume | null
  ): Promise<TailorResult>;

  /** Learning roadmap for skills the JD wants that the resume lacks. */
  generateRoadmap(
    missingKeywords: string[],
    missingMustHaves: string[],
    jdText: string,
    resumeText: string
  ): Promise<RoadmapResult>;
}
