"use client";

import { useCallback, useRef, useState } from "react";
import { ANALYZE_STAGES, useResumeAnalysis } from "@/hooks/useResumeAnalysis";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  Braces,
  ScanSearch,
  History,
  Clock,
  Cpu,
  Zap,
} from "lucide-react";
import type { HistoryEntry, ResumeInfo } from "@/components/dashboard/types";
import type { SearchItem } from "@/lib/searchData";
import AnimatedBackground from "@/components/fx/AnimatedBackground";
import GlassCard from "@/components/fx/GlassCard";
import SearchBar from "@/components/dashboard/SearchBar";
import UploadCard from "@/components/dashboard/UploadCard";
import AnalysisSection from "@/components/dashboard/AnalysisSection";
import ResumeStudio from "@/components/dashboard/ResumeStudio";
import PolishResumeCard from "@/components/dashboard/PolishResumeCard";
import JobSearchSection from "@/components/dashboard/JobSearchSection";
import ApplicationTracker from "@/components/dashboard/ApplicationTracker";
import CareerInsights from "@/components/dashboard/CareerInsights";
import CareerProfilePanel from "@/components/dashboard/CareerProfilePanel";
import ResumeIntelligencePanel from "@/components/dashboard/ResumeIntelligencePanel";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import AuthMenu from "@/components/auth/AuthMenu";
import AiModeControl from "@/components/dashboard/AiModeControl";
import FluidCursorToggle from "@/components/cursor/FluidCursorToggle";
import StoryStage from "@/components/dashboard/StoryStage";

export default function Dashboard({
  initialResume,
  initialHistory,
}: {
  initialResume: ResumeInfo | null;
  initialHistory: HistoryEntry[];
}) {
  const [resume, setResume] = useState<ResumeInfo | null>(initialResume);
  const [jdText, setJdText] = useState("");
  const jdRef = useRef<HTMLTextAreaElement>(null);

  // All analysis orchestration (request, staged progress, history rule, errors)
  // lives in the hook — this component only renders its state.
  const { analyze: runAnalysis, reset, analyzing, stage, error, result, history } =
    useResumeAnalysis(initialHistory);

  const handleResume = useCallback(
    (r: ResumeInfo) => {
      setResume(r);
      reset();
    },
    [reset]
  );

  async function analyze(overrideJd?: string) {
    if (!resume || analyzing) return;
    const data = await runAnalysis(resume.id, overrideJd ?? jdText);
    if (data) {
      setTimeout(
        () => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        150
      );
    }
  }

  function onSearchPick(item: SearchItem) {
    if (item.type === "Skill" || item.type === "Keyword" || item.type === "Job") {
      setJdText((t) => (t.trim() ? `${t.trimEnd()}\n${item.label}` : item.label));
      jdRef.current?.focus();
    } else {
      document.getElementById("builder")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
      <AnimatedBackground />

      {/* Nav */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-40 border-b border-panel/[0.06] bg-background/70 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3.5 sm:gap-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30">
              <Zap className="h-4 w-4 text-fg" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Lumina</span>
          </Link>
          <div className="ml-auto flex flex-1 items-center justify-end gap-1.5 sm:gap-3">
            <SearchBar onPick={onSearchPick} />
            {/* A live, clickable privacy control — this used to be a static badge
                describing the SERVER's config rather than the user's choice. */}
            <AiModeControl />
            <FluidCursorToggle />
            <AuthMenu />
            <ThemeSwitcher />
          </div>
        </div>
      </motion.header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {/* A working header, not a sales pitch. The dashboard is where someone
            does the work — the pitch belongs on the landing page. */}
        <section className="pt-10 pb-6">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {resume ? "Your resume workspace" : "Let’s start with your resume"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 max-w-xl text-sm text-fg/45"
          >
            {resume
              ? "Everything below works from the resume you’ve added. Open a step when you’re ready for it."
              : "Add a resume and each step below unlocks in turn — scoring, feedback, job search and tracking."}
          </motion.p>
        </section>

        {/* Workspace grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: upload + preview */}
          <div className="space-y-6">
            <GlassCard className="p-6" hover={false}>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg/85">
                <FileText className="h-4 w-4 text-violet-300" /> Resume
                {resume && (
                  <span className="ml-auto rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    {resume.source === "uploaded" ? "Uploaded" : "Built"} ✓
                  </span>
                )}
              </h2>
              <UploadCard onUploaded={handleResume} />
            </GlassCard>

            <AnimatePresence>
              {resume && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <GlassCard className="p-6" hover={false}>
                    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg/85">
                      <ScanSearch className="h-4 w-4 text-violet-300" /> Resume preview
                    </h2>
                    <div className="relative max-h-64 overflow-y-auto rounded-xl border border-panel/8 bg-black/30 p-4">
                      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-fg/55">
                        {resume.rawText}
                      </pre>
                    </div>
                    <PolishResumeCard resume={resume} onPolished={handleResume} />
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: JD + analyze */}
          <div className="space-y-6">
            <GlassCard className="p-6 flex flex-col" hover={false} delay={0.08}>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg/85">
                <Braces className="h-4 w-4 text-violet-300" /> Job description
                <span className="ml-auto text-[11px] font-normal text-fg/35">optional — enables match scoring</span>
              </h2>
              <textarea
                ref={jdRef}
                className="input-dark w-full flex-1 min-h-56 px-4 py-3 text-sm resize-y font-mono leading-relaxed"
                placeholder={"Paste the full job description here…\n\nInclude the requirements section for the most accurate keyword and must-have detection."}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />

              <motion.button
                whileTap={{ scale: 0.97 }}
                disabled={!resume || analyzing}
                onClick={() => analyze()}
                className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-fg"
              >
                <Sparkles className="h-5 w-5" />
                {analyzing ? "Analyzing…" : resume ? "Analyze Resume" : "Add a resume first"}
              </motion.button>
              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-red-400">
                  {error}
                </motion.p>
              )}
            </GlassCard>
          </div>
        </div>

        {/* 3 — bullet-level feedback */}
        <div className="mt-6">
          <StoryStage
            step={3}
            title="Improve your bullets"
            blurb="Line-by-line feedback: strong verb, real tools, measurable result."
            lockedHint="Add a resume first — there's nothing to review yet."
            state={resume ? "active" : "locked"}
            defaultOpen={false}
          >
            {resume && (
              <ResumeIntelligencePanel
                structuredJson={resume.structuredJson}
                rawText={resume.rawText}
              />
            )}
          </StoryStage>
        </div>

        {/* 4 — progress over time */}
        <div className="mt-6">
          <StoryStage
            step={4}
            title="Track your progress"
            blurb="Score history, the gaps that keep recurring, and your skills over time."
            state="active"
            defaultOpen={false}
          >
            <div className="space-y-6">
              <CareerInsights />
              <CareerProfilePanel />
            </div>
          </StoryStage>
        </div>

        {/* 5 — find and track roles */}
        <div className="mt-6">
          <StoryStage
            step={5}
            title="Find and track roles"
            blurb="Search real openings, then follow each application through to an offer."
            state="active"
            defaultOpen={false}
          >
            <div className="space-y-6">
              <ApplicationTracker resumeId={resume?.id ?? null} />
            </div>
          </StoryStage>
        </div>

        {/* Job search */}
        <div className="mt-6">
          <JobSearchSection
            resumeId={resume?.id ?? null}
            onAnalyzeFit={(jd) => {
              setJdText(jd);
              analyze(jd);
            }}
          />
        </div>

        {/* Analyzing overlay card */}
        <AnimatePresence>
          {analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-deep mt-6 overflow-hidden p-8 text-center"
            >
              <div className="relative mx-auto h-16 w-16">
                <motion.div
                  className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 opacity-30 blur-xl"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <motion.div
                  className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/10"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Cpu className="h-7 w-7 text-violet-300" />
                </motion.div>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={stage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-5 text-sm font-medium text-fg/70"
                >
                  {ANALYZE_STAGES[stage]}
                </motion.p>
              </AnimatePresence>
              <div className="relative mx-auto mt-5 h-1 w-72 overflow-hidden rounded-full bg-panel/8">
                <div className="scan-line absolute inset-y-0 w-1/4 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <div className="mt-6">
          <AnimatePresence>
            {result && !analyzing && (
              <AnalysisSection
                key={result.atsReportId}
                analysis={result.analysis}
                resumeId={resume!.id}
                jobDescId={result.jobDescId}
                atsReportId={result.atsReportId}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Builder */}
        <div className="mt-6">
          <ResumeStudio currentResume={resume} onSaved={handleResume} />
        </div>

        {/* History */}
        {history.length > 0 && (
          <GlassCard className="mt-6 p-6" hover={false}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
              <History className="h-4 w-4 text-violet-300" /> Recent analysis
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((h, i) => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`text-2xl font-bold ${
                        h.score >= 80 ? "text-emerald-400" : h.score >= 60 ? "text-amber-400" : "text-rose-400"
                      }`}
                    >
                      {h.score}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-fg/35">
                      {h.hasJd ? `JD match ${h.matchPercent ?? "–"}%` : "General ATS"}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-fg/40">
                    <Clock className="h-3 w-3" />
                    {new Date(h.createdAt).toLocaleString()}
                  </p>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Deliberately does NOT restate a privacy claim. It used to describe the
            SERVER's configuration, which now contradicts the user's own choice —
            the badge in the header is the single source of truth, and it's live. */}
        <footer className="mt-16 text-center text-xs text-fg/25">
          Scoring, ATS checks and job search always run on this device · AI rewriting follows the
          setting in the header
        </footer>
      </main>
    </>
  );
}
