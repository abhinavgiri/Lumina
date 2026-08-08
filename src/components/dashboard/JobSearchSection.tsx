"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Search,
  MapPin,
  ExternalLink,
  Sparkles,
  Globe,
  CheckCircle2,
  XCircle,
  Clock,
  Wand2,
  Download,
  Loader2,
  Lightbulb,
  BookmarkPlus,
  Check,
} from "lucide-react";
import type { ScoredJob } from "@/lib/jobs/types";
import { createApplication, searchJobs, tailorResume } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";
import GlassCard from "@/components/fx/GlassCard";

type SourceStatus = { name: string; ok: boolean; count: number; error?: string };

function matchTone(pct: number) {
  if (pct >= 70) return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (pct >= 45) return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  return "border-rose-400/30 bg-rose-400/10 text-rose-300";
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (isNaN(days) || days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function JobSearchSection({
  resumeId,
  onAnalyzeFit,
}: {
  resumeId: string | null;
  onAnalyzeFit: (jdText: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ScoredJob[] | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [usedQuery, setUsedQuery] = useState("");
  const [rolesSearched, setRolesSearched] = useState<string[]>([]);
  const [visible, setVisible] = useState(8);

  // Per-job resume-tailoring state, keyed by job id.
  type TailorState = {
    status: "loading" | "done" | "error";
    result?: { tailoredResumeId: string; changes: string[]; gaps: string[] };
    error?: string;
  };
  const [tailor, setTailor] = useState<Record<string, TailorState>>({});
  const [tracked, setTracked] = useState<Record<string, "saving" | "saved">>({});

  /** Save a job into the application pipeline (starts at "saved"). */
  async function trackJob(job: ScoredJob) {
    setTracked((t) => ({ ...t, [job.id]: "saving" }));
    try {
      await createApplication({
        company: job.company,
        title: job.title,
        location: job.location || null,
        url: job.url || null,
        source: job.source || null,
        matchPercent: job.matchPercent,
        resumeId,
      });
      setTracked((t) => ({ ...t, [job.id]: "saved" }));
      // Let the tracker section refresh without prop-drilling through Dashboard.
      window.dispatchEvent(new CustomEvent("lumina:application-saved"));
    } catch (e) {
      setTracked((t) => {
        const next = { ...t };
        delete next[job.id];
        return next;
      });
      setError(errorMessage(e, "Couldn't save that job to your tracker."));
    }
  }

  async function tailorForJob(job: ScoredJob) {
    if (!resumeId) return;
    setTailor((t) => ({ ...t, [job.id]: { status: "loading" } }));
    try {
      const data = await tailorResume({ resumeId, jdText: job.description });
      setTailor((t) => ({
        ...t,
        [job.id]: {
          status: "done",
          result: {
            tailoredResumeId: data.tailoredResumeId,
            changes: data.changes ?? [],
            gaps: data.gaps ?? [],
          },
        },
      }));
    } catch (e) {
      setTailor((t) => ({
        ...t,
        [job.id]: { status: "error", error: e instanceof Error ? e.message : "Tailoring failed." },
      }));
    }
  }

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const data = await searchJobs({
        resumeId,
        query: query.trim() || undefined,
        location: location.trim() || undefined,
      });
      setJobs(data.jobs);
      setSources(data.sources ?? []);
      setUsedQuery(data.query);
      setRolesSearched(data.rolesSearched ?? []);
      setVisible(8);
      if (!query.trim()) setQuery(data.query);
    } catch (e) {
      setError(errorMessage(e, "Job search failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  const okSources = sources.filter((s) => s.ok);

  return (
    <GlassCard className="p-6" hover={false} id="jobs">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <Briefcase className="h-4 w-4 text-primary" /> Job search
        </h2>
        <span className="text-[11px] text-fg/35">
          live openings, ranked against your resume — only search terms are sent to job boards,
          your resume is matched locally
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/35" />
          <input
            className="input-dark w-full py-2.5 pl-10 pr-4 text-sm"
            placeholder={resumeId ? "Leave empty to auto-detect from your resume…" : "e.g. data engineer"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && search()}
          />
        </div>
        <div className="relative sm:w-56">
          <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg/35" />
          <input
            className="input-dark w-full py-2.5 pl-10 pr-4 text-sm"
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && search()}
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          disabled={loading || (!resumeId && !query.trim())}
          onClick={search}
          className="btn-gradient inline-flex items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-fg"
        >
          {loading ? "Searching…" : "Find jobs"}
        </motion.button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              className="h-24 rounded-2xl border border-panel/8 bg-panel/[0.03]"
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {jobs && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg/40">
              <Globe className="h-3.5 w-3.5" />
              {jobs.length} openings for “{usedQuery}” from{" "}
              {okSources.map((s) => s.name).join(", ") || "no sources"}
            </div>

            {rolesSearched.length > 1 && (
              <div className="mt-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/90">
                  <Sparkles className="h-3 w-3" /> AI analyzed your resume and searched{" "}
                  {rolesSearched.length} roles
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rolesSearched.map((r, idx) => (
                    <span
                      key={r}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                        idx < 4
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-panel/12 bg-panel/[0.04] text-fg/55"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {jobs.length === 0 && (
              <p className="mt-4 text-sm text-fg/50">
                Nothing matched that query — try broader terms (e.g. “data engineer” instead of a full title).
              </p>
            )}

            <div className="mt-4 space-y-3">
              {jobs.slice(0, visible).map((job, i) => (
                <motion.article
                  key={job.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="group rounded-2xl border border-panel/8 bg-panel/[0.03] p-5 transition-colors hover:border-primary/30 hover:bg-panel/[0.05]"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-fg/90">{job.title}</h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg/45">
                        <span className="font-medium text-fg/60">{job.company}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {job.location}
                        </span>
                        {job.salary && <span className="text-emerald-300/80">{job.salary}</span>}
                        {timeAgo(job.postedAt) && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {timeAgo(job.postedAt)}
                          </span>
                        )}
                        <span className="rounded-full border border-panel/10 px-1.5 py-px text-[10px] text-fg/30">
                          {job.source}
                        </span>
                        {job.matchedRole && (
                          <span className="rounded-full border border-primary/25 bg-primary/[0.08] px-1.5 py-px text-[10px] text-primary/90">
                            {job.matchedRole}
                          </span>
                        )}
                      </p>
                      {job.matchReasons && job.matchReasons.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {job.matchReasons.map((r, k) => (
                            <li
                              key={k}
                              className={`flex items-start gap-1.5 text-[11px] ${
                                r.startsWith("Boost") ? "text-amber-300/75" : "text-fg/50"
                              }`}
                            >
                              <Sparkles className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-60" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {job.matchPercent !== null && (
                      <span
                        className={`shrink-0 rounded-full border px-3 py-1 text-sm font-bold ${matchTone(job.matchPercent)}`}
                      >
                        {job.matchPercent}%
                      </span>
                    )}
                  </div>

                  {(job.matchedSkills.length > 0 || job.missingSkills.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {job.matchedSkills.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 text-[11px] text-emerald-300/90"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" /> {s}
                        </span>
                      ))}
                      {job.missingSkills.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-400/20 bg-rose-400/[0.07] px-2 py-0.5 text-[11px] text-rose-300/80"
                        >
                          <XCircle className="h-2.5 w-2.5" /> {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-panel/12 bg-panel/[0.04] px-3.5 py-1.5 text-xs font-medium text-fg/80 transition-colors hover:bg-panel/[0.09]"
                    >
                      View & apply <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      onClick={() => trackJob(job)}
                      disabled={!!tracked[job.id]}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-panel/12 bg-panel/[0.04] px-3.5 py-1.5 text-xs font-medium text-fg/70 transition-colors hover:bg-panel/[0.09] disabled:opacity-60"
                    >
                      {tracked[job.id] === "saving" ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                        </>
                      ) : tracked[job.id] === "saved" ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" /> Tracking
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="h-3 w-3" /> Track
                        </>
                      )}
                    </button>
                    {resumeId && job.description.length >= 100 && (
                      <button
                        onClick={() => tailorForJob(job)}
                        disabled={tailor[job.id]?.status === "loading"}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
                      >
                        {tailor[job.id]?.status === "loading" ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" /> Tailoring…
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-3 w-3" /> Tailor resume
                          </>
                        )}
                      </button>
                    )}
                    {resumeId && job.description.length >= 100 && (
                      <button
                        onClick={() => onAnalyzeFit(job.description, `${job.title} — ${job.company}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-secondary/10 px-3.5 py-1.5 text-xs font-medium text-[#c4a2ff] transition-colors hover:bg-secondary/20"
                      >
                        <Sparkles className="h-3 w-3" /> Full analysis
                      </button>
                    )}
                    {!resumeId && (
                      <span className="text-[11px] text-fg/35">
                        Add a resume above to tailor it to this job
                      </span>
                    )}
                  </div>

                  <AnimatePresence>
                    {tailor[job.id]?.status === "done" && tailor[job.id]?.result && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 overflow-hidden"
                      >
                        <div className="rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                              <Wand2 className="h-3.5 w-3.5" /> Resume tailored for this role
                            </p>
                            <span className="inline-flex items-center gap-1.5">
                              <a
                                href={`/api/resume/tailor/${tailor[job.id]!.result!.tailoredResumeId}/download?format=pdf`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
                              >
                                <Download className="h-3 w-3" /> PDF
                              </a>
                              <a
                                href={`/api/resume/tailor/${tailor[job.id]!.result!.tailoredResumeId}/download?format=docx`}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-panel/15 bg-panel/[0.05] px-3 py-1.5 text-xs font-semibold text-fg/75 transition-colors hover:bg-panel/[0.1]"
                              >
                                <Download className="h-3 w-3" /> DOCX
                              </a>
                            </span>
                          </div>

                          {tailor[job.id]!.result!.changes.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-fg/40">
                                What changed
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {tailor[job.id]!.result!.changes.slice(0, 5).map((c, k) => (
                                  <li key={k} className="flex gap-2 text-xs text-fg/70">
                                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300/80" />
                                    <span>{c}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {tailor[job.id]!.result!.gaps.length > 0 && (
                            <div className="mt-3">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-fg/40">
                                Gaps to address
                              </p>
                              <ul className="mt-1.5 space-y-1">
                                {tailor[job.id]!.result!.gaps.slice(0, 4).map((g, k) => (
                                  <li key={k} className="flex gap-2 text-xs text-fg/70">
                                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/80" />
                                    <span>{g}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                    {tailor[job.id]?.status === "error" && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 text-xs text-red-400"
                      >
                        {tailor[job.id]?.error}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.article>
              ))}
            </div>

            {jobs.length > visible && (
              <button
                onClick={() => setVisible((v) => v + 8)}
                className="mt-4 w-full rounded-xl border border-panel/10 bg-panel/[0.03] py-2.5 text-sm text-fg/60 transition-colors hover:bg-panel/[0.06]"
              >
                Show {Math.min(8, jobs.length - visible)} more
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
