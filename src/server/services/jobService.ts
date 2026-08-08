/**
 * Job Service — resume-aware job search with graceful degradation.
 *
 * When JOBS_API_URL points at the Python FastAPI backend, searches go there
 * (multi-source ATS boards, resume-driven multi-query planning, ML role
 * prediction, ranking, Redis caching) and the richer response is mapped back to
 * the shape the dashboard renders. If that backend is unset OR fails, we fall
 * back to the built-in TypeScript providers so the app still works with zero
 * extra infra.
 *
 * Only the query + resume text reach the backend; the backend never forwards
 * resume text upstream to job boards — see backend/app/services/search_service.py.
 */
import { prisma } from "@/lib/db";
import { searchJobs } from "@/lib/jobs";
import { suggestJobQuery } from "@/lib/ai/localEngine";
import type { ScoredJob } from "@/lib/jobs/types";
import { badRequest } from "@/lib/api/response";
import { readStructured } from "@/server/services/resumeService";

const BACKEND_TIMEOUT_MS = 45_000;
const BACKEND_LIMIT = 30;

export type JobSourceStatus = { name: string; ok: boolean; count: number; error?: string };

export type JobSearchResult = {
  query: string;
  scored: boolean;
  jobs: ScoredJob[];
  rolesSearched: string[];
  sources: JobSourceStatus[];
};

async function proxyToBackend(
  base: string,
  query: string,
  location: string | undefined,
  resumeText: string | null
) {
  const res = await fetch(`${base.replace(/\/$/, "")}/jobs/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: query,
      location: location || null,
      resume_text: resumeText,
      limit: BACKEND_LIMIT,
    }),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`backend ${res.status}`);
  const data = await res.json();

  const jobs: ScoredJob[] = (data.jobs ?? []).map(
    (j: Record<string, unknown>): ScoredJob => ({
      id: String(j.id),
      title: String(j.title ?? ""),
      company: String(j.company ?? ""),
      location: String(j.location ?? ""),
      remote: j.remote_status === "remote" || j.remote_status === "hybrid",
      salary: (j.salary as string) ?? null,
      url: String(j.apply_url ?? ""),
      description: String(j.description ?? ""),
      tags: Array.isArray(j.skills) ? (j.skills as string[]).slice(0, 6) : [],
      postedAt: (j.posted_at as string) ?? null,
      source: String(j.source ?? ""),
      matchPercent: typeof j.score === "number" ? Math.round(j.score) : null,
      matchedSkills: (j.matched_skills as string[]) ?? [],
      missingSkills: (j.missing_skills as string[]) ?? [],
      matchedRole: (j.matched_role as string) ?? null,
      matchReasons: (j.match_reasons as string[]) ?? [],
    })
  );

  return {
    jobs,
    rolesSearched: (data.roles_searched as string[]) ?? [],
    sources: (data.sources ?? []).map((s: Record<string, unknown>) => ({
      name: String(s.name),
      ok: Boolean(s.ok),
      count: Number(s.count ?? 0),
      error: (s.error as string) ?? undefined,
    })),
  };
}

export async function searchJobsForUser(
  userId: string,
  input: { resumeId?: string; query?: string; location?: string }
): Promise<JobSearchResult> {
  let resumeText: string | null = null;
  let effectiveQuery = input.query?.trim() ?? "";

  if (input.resumeId) {
    const resume = await prisma.resume.findFirst({ where: { id: input.resumeId, userId } });
    if (resume) {
      resumeText = resume.rawText;
      if (!effectiveQuery) {
        const targetRole = readStructured(resume.structuredJson)?.targetRole ?? "";
        effectiveQuery = suggestJobQuery(resume.rawText, targetRole);
      }
    }
  }

  if (!effectiveQuery) {
    throw badRequest("Provide a search query or a resume to derive one from.");
  }

  const location = input.location?.trim() || undefined;
  const backend = process.env.JOBS_API_URL;

  if (backend) {
    try {
      const result = await proxyToBackend(backend, effectiveQuery, location, resumeText);
      return { query: effectiveQuery, scored: resumeText !== null, ...result };
    } catch (err) {
      console.error("Backend job search failed, falling back to local providers:", err);
      // fall through to the built-in providers
    }
  }

  // The built-in providers are single-query, so there is no multi-role plan to
  // report — the backend is what fans out across roles. Return the one query
  // used, so the UI's role-chips header stays consistent either way.
  const result = await searchJobs(effectiveQuery, location, resumeText);
  return {
    query: effectiveQuery,
    scored: resumeText !== null,
    rolesSearched: [effectiveQuery],
    ...result,
  };
}
