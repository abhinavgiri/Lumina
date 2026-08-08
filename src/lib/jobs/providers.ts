import type { JobPosting, JobProvider } from "@/lib/jobs/types";

const FETCH_TIMEOUT_MS = 9000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json", "User-Agent": "lumina-resume-tool" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function matchesQuery(query: string, haystack: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (terms.length === 0) return true;
  const lower = haystack.toLowerCase();
  // At least half the terms must appear (loose AND) so multi-word queries stay useful
  const hits = terms.filter((t) => lower.includes(t)).length;
  return hits >= Math.ceil(terms.length / 2);
}

// ---------------------------------------------------------------------------
// Remotive — remote jobs worldwide, free, no key. https://remotive.com/api
// ---------------------------------------------------------------------------

type RemotiveJob = {
  id: number;
  title: string;
  company_name: string;
  candidate_required_location: string;
  salary: string;
  url: string;
  description: string;
  tags: string[];
  publication_date: string;
};

export const remotive: JobProvider = {
  name: "Remotive",
  isConfigured: () => true,
  async search(query) {
    const data = (await getJson(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=25`
    )) as { jobs?: RemotiveJob[] };
    return (data.jobs ?? []).map(
      (j): JobPosting => ({
        id: `remotive-${j.id}`,
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location || "Remote",
        remote: true,
        salary: j.salary?.trim() || null,
        url: j.url,
        description: stripHtml(j.description ?? "").slice(0, 12000),
        tags: (j.tags ?? []).slice(0, 6),
        postedAt: j.publication_date ?? null,
        source: "Remotive",
      })
    );
  },
};

// ---------------------------------------------------------------------------
// Arbeitnow — free job board API, no key. https://www.arbeitnow.com/api
// ---------------------------------------------------------------------------

type ArbeitnowJob = {
  slug: string;
  title: string;
  company_name: string;
  location: string;
  remote: boolean;
  url: string;
  description: string;
  tags: string[];
  job_types: string[];
  created_at: number;
};

export const arbeitnow: JobProvider = {
  name: "Arbeitnow",
  isConfigured: () => true,
  async search(query) {
    const data = (await getJson("https://www.arbeitnow.com/api/job-board-api")) as {
      data?: ArbeitnowJob[];
    };
    return (data.data ?? [])
      .filter((j) => matchesQuery(query, `${j.title} ${j.tags?.join(" ")} ${j.description ?? ""}`))
      .slice(0, 25)
      .map(
        (j): JobPosting => ({
          id: `arbeitnow-${j.slug}`,
          title: j.title,
          company: j.company_name,
          location: j.location || (j.remote ? "Remote" : "Unspecified"),
          remote: j.remote ?? false,
          salary: null,
          url: j.url,
          description: stripHtml(j.description ?? "").slice(0, 12000),
          tags: (j.tags ?? []).slice(0, 6),
          postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
          source: "Arbeitnow",
        })
      );
  },
};

// ---------------------------------------------------------------------------
// Adzuna — broad coverage incl. India; free key at developer.adzuna.com.
// Configure via ADZUNA_APP_ID / ADZUNA_APP_KEY (+ optional ADZUNA_COUNTRY).
// ---------------------------------------------------------------------------

type AdzunaJob = {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  redirect_url: string;
  description: string;
  created?: string;
  category?: { label?: string };
};

export const adzuna: JobProvider = {
  name: "Adzuna",
  isConfigured: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  async search(query, location) {
    const country = (process.env.ADZUNA_COUNTRY ?? "in").toLowerCase();
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      what: query,
      results_per_page: "25",
      "content-type": "application/json",
    });
    if (location) params.set("where", location);
    const data = (await getJson(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`
    )) as { results?: AdzunaJob[] };
    return (data.results ?? []).map((j): JobPosting => {
      const min = j.salary_min ? Math.round(j.salary_min) : null;
      const max = j.salary_max ? Math.round(j.salary_max) : null;
      return {
        id: `adzuna-${j.id}`,
        title: j.title.replace(/<[^>]+>/g, ""),
        company: j.company?.display_name ?? "Unknown",
        location: j.location?.display_name ?? "Unspecified",
        remote: /remote/i.test(j.title + (j.location?.display_name ?? "")),
        salary: min && max ? `${min.toLocaleString()} – ${max.toLocaleString()}` : null,
        url: j.redirect_url,
        description: stripHtml(j.description ?? "").slice(0, 12000),
        tags: j.category?.label ? [j.category.label] : [],
        postedAt: j.created ?? null,
        source: "Adzuna",
      };
    });
  },
};

export const ALL_PROVIDERS: JobProvider[] = [adzuna, remotive, arbeitnow];
