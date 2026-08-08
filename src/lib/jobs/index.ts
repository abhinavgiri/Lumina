import { ALL_PROVIDERS } from "@/lib/jobs/providers";
import { matchAgainstJd } from "@/lib/ai/localEngine";
import type { JobPosting, ScoredJob } from "@/lib/jobs/types";
export type { JobPosting, ScoredJob } from "@/lib/jobs/types";

export type JobSearchResult = {
  jobs: ScoredJob[];
  sources: { name: string; ok: boolean; count: number; error?: string }[];
};

/**
 * Fan out to every configured provider, merge + dedupe, then score each job
 * against the resume LOCALLY. Only the search query ever leaves this machine —
 * the resume text is never sent to any job board.
 */
export async function searchJobs(
  query: string,
  location: string | undefined,
  resumeText: string | null
): Promise<JobSearchResult> {
  const active = ALL_PROVIDERS.filter((p) => p.isConfigured());

  const settled = await Promise.allSettled(active.map((p) => p.search(query, location)));

  const sources = settled.map((s, i) => ({
    name: active[i].name,
    ok: s.status === "fulfilled",
    count: s.status === "fulfilled" ? s.value.length : 0,
    error: s.status === "rejected" ? String(s.reason?.message ?? s.reason).slice(0, 120) : undefined,
  }));

  // Merge + dedupe on normalized title+company
  const seen = new Set<string>();
  const merged: JobPosting[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const job of s.value) {
      // Strip parentheticals so "QA Engineer (São Paulo)" and "(Campinas)"
      // from the same company collapse into one listing.
      const normTitle = job.title.replace(/\s*\([^)]*\)\s*/g, " ").toLowerCase().trim();
      const key = `${normTitle}|${job.company.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(job);
    }
  }

  // Two separate signals:
  //  - relevance (ordering): does the job TITLE actually match the query?
  //    Keeps copywriter/sales roles from outranking real matches.
  //  - matchPercent (badge): skill fit vs the resume, dampened toward 50 when
  //    the JD names too few skills to judge (a sales JD that only says
  //    "Excel" should not read as a 100% fit).
  const q = query.toLowerCase().trim();
  const queryTerms = q.split(/\s+/).filter((t) => t.length > 2);

  const relevanceOf = (job: JobPosting): number => {
    const title = job.title.toLowerCase();
    if (q && title.includes(q)) return 100; // exact phrase in title
    if (queryTerms.length === 0) return 50;
    const inTitle = queryTerms.filter((t) => title.includes(t)).length;
    if (inTitle === queryTerms.length) return 90;
    const inTags = queryTerms.filter((t) => job.tags.join(" ").toLowerCase().includes(t)).length;
    return (inTitle / queryTerms.length) * 60 + (inTags / queryTerms.length) * 15;
  };

  const scored = merged.map((job) => {
    let matchPercent: number | null = null;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];

    if (resumeText && job.description.length >= 100) {
      const match = matchAgainstJd(resumeText, job.description);
      const jdSkillCount = match.matchedKeywords.length + match.missingKeywords.length;
      const confidence = Math.min(1, jdSkillCount / 5);
      matchPercent = Math.round(50 + (match.matchPercent - 50) * confidence);
      matchedSkills = match.matchedKeywords.slice(0, 6);
      missingSkills = match.missingKeywords.slice(0, 4);
    }

    return { job: { ...job, matchPercent, matchedSkills, missingSkills }, relevance: relevanceOf(job) };
  });

  scored.sort((a, b) => {
    if (Math.abs(a.relevance - b.relevance) > 5) return b.relevance - a.relevance;
    const am = a.job.matchPercent ?? -1;
    const bm = b.job.matchPercent ?? -1;
    if (am !== bm) return bm - am;
    return (b.job.postedAt ?? "").localeCompare(a.job.postedAt ?? "");
  });

  const jobs: ScoredJob[] = scored.map((s) => s.job);

  return { jobs: jobs.slice(0, 30), sources };
}
