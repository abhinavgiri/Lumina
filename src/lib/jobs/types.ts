/** A normalized job posting from any provider. */
export type JobPosting = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string | null;
  url: string;
  /** Plain-text description (HTML stripped), used for local match scoring. */
  description: string;
  tags: string[];
  postedAt: string | null;
  source: string;
};

/** A posting enriched with a local match score against the user's resume. */
export type ScoredJob = JobPosting & {
  matchPercent: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  /** Which resume-derived role query this job satisfied (multi-query search). */
  matchedRole?: string | null;
  /** Plain-language reasons this job ranked where it did. */
  matchReasons?: string[];
};

/**
 * Job source contract — mirrors the AiEngine pattern: add a provider by
 * implementing this interface and registering it, nothing else changes.
 */
export interface JobProvider {
  readonly name: string;
  /** Whether this provider is usable right now (e.g. has its API keys). */
  isConfigured(): boolean;
  search(query: string, location?: string): Promise<JobPosting[]>;
}
