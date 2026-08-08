"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  SpellCheck,
  LayoutList,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Download,
  Wand2,
  Map,
} from "lucide-react";
import type { ResumeAnalysis, RoadmapResult, TailorResult } from "@/lib/ai";
import { generateRoadmap, tailorResume } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";
import GlassCard from "@/components/fx/GlassCard";
import DownloadResume from "@/components/dashboard/DownloadResume";
import ScoreRing from "@/components/fx/ScoreRing";
import AtsBreakdown from "@/components/dashboard/AtsBreakdown";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

function Chip({ text, tone }: { text: string; tone: "good" | "bad" }) {
  return (
    <motion.span
      variants={item}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${
        tone === "good"
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border-rose-400/25 bg-rose-400/10 text-rose-300"
      }`}
    >
      {text}
    </motion.span>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
      <Icon className="h-4 w-4 text-violet-300" />
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------

function TailorBlock({ resumeId, jobDescId }: { resumeId: string; jobDescId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<(TailorResult & { tailoredResumeId: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("working");
    setError(null);
    try {
      setResult(await tailorResume({ resumeId, jobDescId }));
      setState("done");
    } catch (e) {
      setError(errorMessage(e, "Tailoring failed."));
      setState("error");
    }
  }

  return (
    <GlassCard className="p-6" delay={0.1}>
      <SectionTitle icon={Wand2}>Optimize resume for this job</SectionTitle>
      {state === "idle" || state === "error" ? (
        <>
          <p className="mt-2 text-sm text-fg/50">
            Reorders your skills and bullets to lead with what this JD wants — without inventing anything.
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={run}
            className="btn-gradient mt-4 rounded-xl px-5 py-2 text-sm font-medium text-fg"
          >
            Generate optimized resume
          </motion.button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </>
      ) : state === "working" ? (
        <p className="mt-3 text-sm text-fg/60 animate-pulse">Rebuilding your resume around this JD…</p>
      ) : result ? (
        <div className="mt-3 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-emerald-300/90">Optimized resume ready.</p>
            <DownloadResume
              baseUrl={`/api/resume/tailor/${result.tailoredResumeId}/download`}
              label="Tailored"
            />
          </div>
          {result.changes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg/40 mb-1.5">What changed</p>
              <ul className="space-y-1 text-sm text-fg/65">
                {result.changes.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400/70" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.gaps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg/40 mb-1.5">
                Gaps we didn&apos;t paper over
              </p>
              <ul className="space-y-1 text-sm text-amber-300/80">
                {result.gaps.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </GlassCard>
  );
}

function RoadmapBlock({ atsReportId }: { atsReportId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [roadmap, setRoadmap] = useState<RoadmapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("working");
    setError(null);
    try {
      const { roadmap } = await generateRoadmap(atsReportId);
      setRoadmap(roadmap);
      setState("done");
    } catch (e) {
      setError(errorMessage(e, "Roadmap generation failed."));
      setState("error");
    }
  }

  const prioTone: Record<string, string> = {
    high: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    low: "border-panel/15 bg-panel/5 text-fg/50",
  };

  return (
    <GlassCard className="p-6" delay={0.15}>
      <SectionTitle icon={Map}>Skill-gap roadmap</SectionTitle>
      {state === "idle" || state === "error" ? (
        <>
          <p className="mt-2 text-sm text-fg/50">
            A prioritized learning plan to close the gaps between your resume and this job.
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={run}
            className="mt-4 rounded-xl border border-panel/15 bg-panel/5 px-5 py-2 text-sm font-medium text-fg/85 hover:bg-panel/10 transition-colors"
          >
            Build my roadmap
          </motion.button>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </>
      ) : state === "working" ? (
        <p className="mt-3 text-sm text-fg/60 animate-pulse">Mapping your fastest route to this role…</p>
      ) : roadmap ? (
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-4 space-y-4">
          <ol className="space-y-3">
            {roadmap.steps.map((step, i) => (
              <motion.li key={i} variants={item} className="rounded-xl border border-panel/8 bg-panel/[0.03] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg/90">{step.skill}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${prioTone[step.priority]}`}>
                    {step.priority}
                  </span>
                  <span className="text-xs text-fg/40">{step.timeEstimate}</span>
                </div>
                <p className="mt-1.5 text-sm text-fg/60">{step.resourceType}</p>
                <p className="mt-1 text-xs text-fg/40 italic">{step.why}</p>
              </motion.li>
            ))}
          </ol>
          {roadmap.projectIdeas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg/40 mb-1.5">Prove it with projects</p>
              <ul className="space-y-1.5 text-sm text-fg/65">
                {roadmap.projectIdeas.map((p, i) => (
                  <motion.li key={i} variants={item} className="flex gap-2">
                    <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-300/80" />
                    {p}
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      ) : null}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------

export default function AnalysisSection({
  analysis,
  resumeId,
  jobDescId,
  atsReportId,
}: {
  analysis: ResumeAnalysis;
  resumeId: string;
  jobDescId: string | null;
  atsReportId: string;
}) {
  const { format, content, grammar, jdMatch } = analysis;

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
      id="results"
    >
      {/* Score rings */}
      <GlassCard className="p-8">
        <div className="flex flex-wrap items-center justify-around gap-8">
          <ScoreRing score={analysis.atsScore} label="ATS Score" />
          <ScoreRing score={analysis.resumeQuality} label="Resume Quality" />
          {jdMatch && <ScoreRing score={jdMatch.matchPercent} label="Keyword Match" suffix="%" />}
        </div>
        {jdMatch && <p className="mt-6 text-center text-sm text-fg/55 max-w-2xl mx-auto">{jdMatch.summary}</p>}
      </GlassCard>

      {/* What the ATS score is actually made of */}
      <AtsBreakdown ats={analysis.ats} />

      {/* JD keywords */}
      {jdMatch && (
        <div className="grid gap-6 lg:grid-cols-2">
          <GlassCard className="p-6">
            <SectionTitle icon={CheckCircle2}>Matched keywords · {jdMatch.matchedKeywords.length}</SectionTitle>
            <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-3 flex flex-wrap gap-1.5">
              {jdMatch.matchedKeywords.length ? (
                jdMatch.matchedKeywords.map((k) => <Chip key={k} text={k} tone="good" />)
              ) : (
                <p className="text-sm text-fg/40">No recognizable JD keywords found in your resume.</p>
              )}
            </motion.div>
          </GlassCard>

          <GlassCard className="p-6" delay={0.05}>
            <SectionTitle icon={XCircle}>Missing keywords · {jdMatch.missingKeywords.length}</SectionTitle>
            <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-3 flex flex-wrap gap-1.5">
              {jdMatch.missingKeywords.length ? (
                jdMatch.missingKeywords.map((k) => <Chip key={k} text={k} tone="bad" />)
              ) : (
                <p className="text-sm text-emerald-300/80">Nothing missing — your resume covers every skill this JD names.</p>
              )}
            </motion.div>
            {jdMatch.missingMustHaves.length > 0 && (
              <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-300/90 mb-1">Stated must-haves not met</p>
                <ul className="space-y-0.5 text-sm text-rose-200/80">
                  {jdMatch.missingMustHaves.map((m, i) => (
                    <li key={i}>· {m}</li>
                  ))}
                </ul>
              </div>
            )}
            {jdMatch.experienceLevel.mismatch && (
              <p className="mt-3 text-sm text-amber-300/80">
                <AlertTriangle className="inline h-4 w-4 mr-1 -mt-0.5" />
                Experience gap: JD wants {jdMatch.experienceLevel.jdRequires}, resume shows {jdMatch.experienceLevel.resumeShows}.
              </p>
            )}
          </GlassCard>
        </div>
      )}

      {/* Skills / formatting / grammar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="p-6">
          <SectionTitle icon={Sparkles}>Skills analysis</SectionTitle>
          <ul className="mt-3 space-y-2.5 text-sm">
            {(
              [
                ["Quantified achievements", content.subscores.quantifiedAchievements, 15],
                ["Action verbs", content.subscores.actionVerbs, 15],
                ["Titles & dates", content.subscores.clearTitlesAndDates, 10],
                ["Skill coverage", content.subscores.skillCoverage, 10],
                ["No vague filler", content.subscores.noVagueFiller, 10],
              ] as const
            ).map(([label, val, max]) => (
              <li key={label}>
                <div className="flex justify-between text-fg/65 mb-1">
                  <span>{label}</span>
                  <span className="text-fg/40">
                    {val}/{max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-panel/8 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(val / max) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                    className={`h-full rounded-full ${
                      val / max >= 0.75 ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : val / max >= 0.5 ? "bg-gradient-to-r from-amber-400 to-orange-400" : "bg-gradient-to-r from-rose-500 to-orange-400"
                    }`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-6" delay={0.05}>
          <SectionTitle icon={LayoutList}>Formatting analysis</SectionTitle>
          <ul className="mt-3 space-y-2.5 text-sm">
            {format.items.map((f) => (
              <li key={f.id} className="flex gap-2.5">
                {f.passed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                )}
                <div>
                  <p className="text-fg/75">
                    {f.label}{" "}
                    <span className="text-fg/35">
                      {f.points}/{f.maxPoints}
                    </span>
                  </p>
                  {!f.passed && <p className="mt-0.5 text-xs text-fg/45">{f.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-6" delay={0.1}>
          <SectionTitle icon={SpellCheck}>Grammar & language</SectionTitle>
          {grammar.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300/85">
              <CheckCircle2 className="h-4 w-4" /> No issues detected — clean, consistent writing.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {grammar.map((g, i) => (
                <li key={i}>
                  <p className="text-fg/75">{g.detail}</p>
                  <p className="mt-0.5 text-xs text-fg/45 italic">{g.suggestion}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {/* Strengths / weaknesses / suggestions */}
      <div className="grid gap-6 lg:grid-cols-3">
        <GlassCard className="p-6">
          <SectionTitle icon={TrendingUp}>Strengths</SectionTitle>
          <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-3 space-y-2 text-sm text-fg/70">
            {analysis.strengths.map((s, i) => (
              <motion.li key={i} variants={item} className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400/80" />
                {s}
              </motion.li>
            ))}
          </motion.ul>
        </GlassCard>

        <GlassCard className="p-6" delay={0.05}>
          <SectionTitle icon={TrendingDown}>Weaknesses</SectionTitle>
          <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-3 space-y-2 text-sm text-fg/70">
            {analysis.weaknesses.length ? (
              analysis.weaknesses.map((w, i) => (
                <motion.li key={i} variants={item} className="flex gap-2">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400/80" />
                  {w}
                </motion.li>
              ))
            ) : (
              <p className="text-emerald-300/80">No significant weaknesses found.</p>
            )}
          </motion.ul>
        </GlassCard>

        <GlassCard className="p-6" delay={0.1}>
          <SectionTitle icon={Lightbulb}>AI suggestions</SectionTitle>
          <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="mt-3 space-y-2 text-sm text-fg/70">
            {analysis.suggestions.map((s, i) => (
              <motion.li key={i} variants={item} className="flex gap-2">
                <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-violet-300/80" />
                {s}
              </motion.li>
            ))}
          </motion.ul>
        </GlassCard>
      </div>

      {/* Tailor + roadmap (JD flows only) */}
      {jobDescId && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TailorBlock resumeId={resumeId} jobDescId={jobDescId} />
          <RoadmapBlock atsReportId={atsReportId} />
        </div>
      )}
    </motion.section>
  );
}
