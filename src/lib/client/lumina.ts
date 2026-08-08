/**
 * Typed client SDK — the only place the browser knows about API URLs.
 *
 * Components previously called `fetch("/api/...")` directly and re-implemented
 * error handling at each site. Now they call a named function with a typed
 * return, so a change to a route's payload is a compile error here rather than
 * a runtime `undefined` in a component.
 */
import { apiDelete, apiGet, apiPatch, apiPost, apiPostForm } from "@/lib/api/client";
import type { ResumeAnalysis, RoadmapResult } from "@/lib/ai";
import type { StructuredResume } from "@/lib/resumeTypes";
import type { ScoredJob } from "@/lib/jobs/types";

export type AnalyzeResult = {
  atsReportId: string;
  jobDescId: string | null;
  engine: string;
  analysis: ResumeAnalysis;
};

export type SavedResume = { resumeId: string; rawText: string };

export type PolishedResume = SavedResume & { resume: StructuredResume; engine: string };

export type TailorResult = {
  tailoredResumeId: string;
  resume: StructuredResume;
  changes: string[];
  gaps: string[];
};

export type JobSearchResult = {
  query: string;
  scored: boolean;
  jobs: ScoredJob[];
  rolesSearched: string[];
  sources: { name: string; ok: boolean; count: number; error?: string }[];
};

export type EnhanceResult = { improved: string[]; engine: string };

// --- resume -----------------------------------------------------------------

export function uploadResume(file: File): Promise<SavedResume> {
  const form = new FormData();
  form.append("file", file);
  return apiPostForm<SavedResume>("/api/resume/upload", form);
}

export function buildResume(resume: StructuredResume): Promise<SavedResume> {
  return apiPost<SavedResume>("/api/resume/build", resume);
}

export function polishResume(resumeId: string): Promise<PolishedResume> {
  return apiPost<PolishedResume>(`/api/resume/${resumeId}/polish`);
}

export function tailorResume(input: {
  resumeId: string;
  jobDescId?: string;
  jdText?: string;
}): Promise<TailorResult> {
  return apiPost<TailorResult>("/api/resume/tailor", input);
}

// --- analysis ---------------------------------------------------------------

export function analyzeResume(resumeId: string, jdText?: string): Promise<AnalyzeResult> {
  return apiPost<AnalyzeResult>("/api/analyze", { resumeId, jdText: jdText || undefined });
}

export function generateRoadmap(atsReportId: string): Promise<{ roadmap: RoadmapResult }> {
  return apiPost<{ roadmap: RoadmapResult }>("/api/roadmap", { atsReportId });
}

// --- jobs -------------------------------------------------------------------

export function searchJobs(input: {
  resumeId?: string | null;
  query?: string;
  location?: string;
}): Promise<JobSearchResult> {
  return apiPost<JobSearchResult>("/api/jobs/search", input);
}

// --- ai ---------------------------------------------------------------------

export function enhanceLines(input: {
  kind: "bullets" | "summary";
  lines: string[];
  targetRole?: string;
}): Promise<EnhanceResult> {
  return apiPost<EnhanceResult>("/api/ai/enhance", input);
}

export function polishStructuredResume(
  resume: StructuredResume
): Promise<{ resume: StructuredResume; engine: string }> {
  return apiPost<{ resume: StructuredResume; engine: string }>("/api/ai/polish-resume", resume);
}

// --- application tracker -----------------------------------------------------

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  source: string | null;
  matchPercent: number | null;
  status: ApplicationStatus;
  notes: string | null;
  resumeId: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApplicationStats = {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  interviewRate: number | null;
};

export function fetchApplications(): Promise<{
  applications: Application[];
  total: number;
  hasMore: boolean;
  stats: ApplicationStats;
}> {
  return apiGet("/api/applications");
}

export function createApplication(input: {
  company: string;
  title: string;
  location?: string | null;
  url?: string | null;
  source?: string | null;
  matchPercent?: number | null;
  resumeId?: string | null;
  status?: ApplicationStatus;
  notes?: string | null;
}): Promise<Application> {
  return apiPost<Application>("/api/applications", input);
}

export function updateApplication(
  id: string,
  input: { status?: ApplicationStatus; notes?: string | null }
): Promise<Application> {
  return apiPatch<Application>(`/api/applications/${id}`, input);
}

export function deleteApplication(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/api/applications/${id}`);
}

// --- targeted bullet rewriting ------------------------------------------------

export type RewrittenBullet = {
  original: string;
  rewritten: string | null;
  rejected: string | null;
  askUser: string | null;
  issues: string[];
};

export type RewriteResult = {
  bullets: RewrittenBullet[];
  engine: "groq" | "gemini" | "local";
  rejectedCount: number;
};

export function rewriteBullets(resume: StructuredResume): Promise<RewriteResult> {
  return apiPost<RewriteResult>("/api/resume/rewrite", resume);
}

// --- career profile ----------------------------------------------------------

export const LEARNING_STATUSES = ["planned", "learning", "done"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export type ProfileSkill = {
  name: string;
  source: string;
  proficiency: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type LearningItem = {
  id: string;
  skill: string;
  status: LearningStatus;
  source: string;
  notes: string | null;
  targetDate: string | null;
  completedAt: string | null;
};

export type CareerProfile = {
  targetRoles: string[];
  seniority: string | null;
  preferredLocation: string | null;
  openToRemote: boolean;
  skills: ProfileSkill[];
  learning: LearningItem[];
  /** Skills first seen in the last 90 days — measurable skill growth. */
  recentlyAdded: string[];
};

export function fetchProfile(): Promise<CareerProfile> {
  return apiGet<CareerProfile>("/api/profile");
}

export function updateProfile(input: {
  targetRoles?: string[];
  seniority?: string | null;
  preferredLocation?: string | null;
  openToRemote?: boolean;
}): Promise<CareerProfile> {
  return apiPatch<CareerProfile>("/api/profile", input);
}

export function addLearningItem(input: {
  skill: string;
  source?: "roadmap" | "manual";
  notes?: string;
}): Promise<LearningItem> {
  return apiPost<LearningItem>("/api/profile/learning", input);
}

export function updateLearningItem(
  id: string,
  input: { status?: LearningStatus; notes?: string | null }
): Promise<LearningItem> {
  return apiPatch<LearningItem>(`/api/profile/learning/${id}`, input);
}

export function deleteLearningItem(id: string): Promise<{ id: string }> {
  return apiDelete<{ id: string }>(`/api/profile/learning/${id}`);
}

// --- interviews ----------------------------------------------------------------

export type Interview = {
  id: string;
  round: number;
  kind: string;
  outcome: "scheduled" | "passed" | "failed" | "cancelled";
  notes: string | null;
  scheduledAt: string | null;
};

export function fetchInterviews(applicationId: string): Promise<{ interviews: Interview[] }> {
  return apiGet(`/api/applications/${applicationId}/interviews`);
}

export function addInterview(
  applicationId: string,
  input: { kind?: string; outcome?: string; notes?: string; scheduledAt?: string }
): Promise<Interview> {
  return apiPost<Interview>(`/api/applications/${applicationId}/interviews`, input);
}

// --- analytics ---------------------------------------------------------------

export type ScorePoint = { date: string; score: number; hasJd: boolean };
export type SkillGap = { skill: string; count: number; mustHave: boolean };

export type AnalyticsSummary = {
  scoreTrend: {
    points: ScorePoint[];
    latest: number | null;
    best: number | null;
    delta: number | null;
  };
  recurringGaps: SkillGap[];
  applications: ApplicationStats;
  analysedJobDescriptions: number;
  totalAnalyses: number;
};

export function fetchAnalytics(): Promise<AnalyticsSummary> {
  return apiGet<AnalyticsSummary>("/api/analytics");
}

// --- auth (optional accounts; the app works fully signed-out) ----------------

export type PublicUser = { id: string; email: string | null; isAnonymous: boolean };

export function signUp(email: string, password: string): Promise<PublicUser> {
  return apiPost<PublicUser>("/api/auth/signup", { email, password });
}

export function signIn(email: string, password: string): Promise<PublicUser> {
  return apiPost<PublicUser>("/api/auth/signin", { email, password });
}

export function signOut(): Promise<{ signedOut: boolean }> {
  return apiPost<{ signedOut: boolean }>("/api/auth/signout");
}

export function fetchMe(): Promise<{ user: PublicUser | null }> {
  return apiGet<{ user: PublicUser | null }>("/api/auth/me");
}
