"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Braces, Cpu, CheckCircle2, XCircle, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import ScoreRing from "@/components/fx/ScoreRing";

type Phase = "upload" | "scan" | "results";

const MATCHED = ["Python", "SQL", "Power BI", "Databricks", "ETL", "Tableau"];
const MISSING = ["Airflow", "Kafka", "dbt", "AWS"];
const BARS = [
  { label: "Quantified impact", pct: 80 },
  { label: "Action verbs", pct: 92 },
  { label: "Skill coverage", pct: 74 },
  { label: "Experience match", pct: 60 },
];
const SUGGESTIONS = [
  "Lead with your 80% documentation-time reduction — it's buried in bullet four.",
  "The JD says \"orchestration\" five times. Your Airflow gap is the one to close first.",
  "Swap \"worked on pipelines\" for \"built pipelines processing 1M+ rows daily.\"",
];

export default function UploadSection() {
  const [phase, setPhase] = useState<Phase>("upload");

  // Auto-looping demo: upload (2.2s) â†’ scan (2.6s) â†’ results (7s) â†’ repeat
  useEffect(() => {
    const durations: Record<Phase, number> = { upload: 2200, scan: 2600, results: 7400 };
    const next: Record<Phase, Phase> = { upload: "scan", scan: "results", results: "upload" };
    const t = setTimeout(() => setPhase((p) => next[p]), durations[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <section id="demo" className="relative mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Live demo</span>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Watch a resume get <span className="gradient-text">read like an ATS reads it</span>
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 44, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="animated-border relative mt-14 overflow-hidden rounded-3xl"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-panel/[0.06] px-5 py-3.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]/80" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]/80" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]/80" />
          <span className="ml-3 text-xs text-fg/30">lumina — resume analysis</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-panel/10 bg-panel/[0.04] px-2.5 py-1 text-[10px] font-medium text-fg/45">
            <Cpu className="h-3 w-3 text-glow" /> local engine
          </span>
        </div>

        <div className="min-h-[430px] p-6 sm:p-8">
          <AnimatePresence mode="wait">
            {phase === "upload" && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.45 }}
                className="grid gap-5 md:grid-cols-2"
              >
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/40 bg-primary/[0.04] p-10">
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
                    <FileText className="h-10 w-10 text-primary" />
                  </motion.div>
                  <p className="mt-4 text-sm font-medium text-fg/80">resume_data_engineer.pdf</p>
                  <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-panel/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-glow"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 1.8, ease: "easeInOut" }}
                    />
                  </div>
                </div>
                <div className="rounded-2xl border border-panel/8 bg-black/30 p-6">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
                    <Braces className="h-3.5 w-3.5" /> Job description
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {[92, 78, 85, 60, 88, 70].map((w, i) => (
                      <motion.div
                        key={i}
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: `${w}%`, opacity: 1 }}
                        transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
                        className="h-2.5 rounded-full bg-panel/[0.08]"
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {phase === "scan" && (
              <motion.div
                key="scan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-h-[366px] flex-col items-center justify-center"
              >
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary to-secondary opacity-30 blur-2xl"
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10">
                    <Cpu className="h-9 w-9 text-primary" />
                  </div>
                </div>
                <div className="mt-8 w-full max-w-sm space-y-3">
                  {["Extracting 27 skills…", "Matching against 14 JD requirements…", "Scoring 31 formatting rules…"].map((line, i) => (
                    <motion.p
                      key={line}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.55 }}
                      className="flex items-center gap-2.5 text-sm text-fg/60"
                    >
                      <motion.span
                        className="h-1.5 w-1.5 rounded-full bg-glow"
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.3 }}
                      />
                      {line}
                    </motion.p>
                  ))}
                </div>
                <div className="relative mt-8 h-1 w-72 overflow-hidden rounded-full bg-panel/8">
                  <div className="scan-line absolute inset-y-0 w-1/4 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
                </div>
              </motion.div>
            )}

            {phase === "results" && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.5 }}
                className="grid gap-6 lg:grid-cols-[auto_1fr_1fr]"
              >
                <div className="flex items-center justify-center lg:px-4">
                  <ScoreRing score={84} label="ATS Score" size={168} />
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg/40">Skills match</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MATCHED.map((k, i) => (
                        <motion.span
                          key={k}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 300, damping: 18 }}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300"
                        >
                          <CheckCircle2 className="h-3 w-3" /> {k}
                        </motion.span>
                      ))}
                      {MISSING.map((k, i) => (
                        <motion.span
                          key={k}
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.75 + i * 0.08, type: "spring", stiffness: 300, damping: 18 }}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-xs font-medium text-rose-300"
                        >
                          <XCircle className="h-3 w-3" /> {k}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg/40">Breakdown</p>
                    <div className="space-y-2.5">
                      {BARS.map((b, i) => (
                        <div key={b.label}>
                          <div className="mb-1 flex justify-between text-xs text-fg/55">
                            <span>{b.label}</span>
                            <span className="text-fg/35">{b.pct}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-panel/8">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${b.pct}%` }}
                              transition={{ delay: 0.4 + i * 0.15, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg/40">AI suggestions</p>
                  <div className="space-y-2.5">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.9 + i * 0.35, duration: 0.5 }}
                        className="flex gap-2.5 rounded-xl border border-panel/8 bg-panel/[0.03] p-3 text-sm text-fg/70"
                      >
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                        {s}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Phase dots */}
        <div className="flex items-center justify-center gap-2 pb-5">
          {(["upload", "scan", "results"] as Phase[]).map((p) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              aria-label={`Show ${p} phase`}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                phase === p ? "w-8 bg-gradient-to-r from-primary to-secondary" : "w-1.5 bg-panel/15"
              }`}
            />
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="mt-8 text-center"
      >
        <Link
          href="/dashboard"
          className="group inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-glow"
        >
          Run this on your actual resume
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>
    </section>
  );
}
