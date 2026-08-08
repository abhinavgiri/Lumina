"use client";

import { motion } from "framer-motion";
import { MessageSquare, FileSearch, History, Mic, Layers, Sparkles } from "lucide-react";
import AnimatedCard from "@/components/landing/AnimatedCard";

function FloatingChip({ text, delay, className = "" }: { text: string; delay: number; className?: string }) {
  return (
    <motion.span
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay }}
      className={`pointer-events-none absolute rounded-full border border-panel/10 bg-[#101010]/90 px-3 py-1.5 text-[11px] font-medium text-fg/60 shadow-xl backdrop-blur-sm ${className}`}
    >
      {text}
    </motion.span>
  );
}

export default function BentoGrid() {
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-glow">The full toolkit</span>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          One dashboard. <span className="gradient-text">Every job-hunt weapon.</span>
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-5 md:grid-cols-6">
        {/* Large: AI chat (coming soon) */}
        <AnimatedCard className="md:col-span-4" animatedBorder>
          <div className="relative overflow-hidden p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
              <MessageSquare className="h-4 w-4 text-primary" /> AI resume chat
              <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-secondary">
                coming soon
              </span>
            </div>
            <h3 className="font-display mt-3 text-2xl font-semibold">
              Ask anything about your resume — and get straight answers.
            </h3>
            <div className="mt-6 space-y-3">
              <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-r from-primary to-secondary px-4 py-2.5 text-sm text-fg">
                Why did my score drop for this JD?
              </div>
              <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm border border-panel/10 bg-panel/[0.04] px-4 py-2.5 text-sm text-fg/75">
                This JD lists Airflow as required — your resume shows strong ETL work but no orchestration tool.
                That single gap costs you 12 match points…
              </div>
            </div>
            <FloatingChip text="✦ streaming" delay={0.4} className="right-6 top-6" />
          </div>
        </AnimatedCard>

        {/* Interview questions */}
        <AnimatedCard className="md:col-span-2" delay={0.08}>
          <div className="relative flex h-full flex-col p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
              <Mic className="h-4 w-4 text-glow" /> Interview prep
              <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-secondary">
                soon
              </span>
            </div>
            <h3 className="font-display mt-3 text-lg font-semibold leading-snug">
              Questions generated from your gaps, not a generic list.
            </h3>
            <div className="mt-auto space-y-2 pt-5">
              {["Walk me through your largest data pipeline.", "How would you schedule it with Airflow?"].map((q, i) => (
                <motion.p
                  key={q}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.6 }}
                  className="rounded-xl border border-panel/8 bg-panel/[0.03] px-3.5 py-2.5 text-xs text-fg/60"
                >
                  {q}
                </motion.p>
              ))}
            </div>
          </div>
        </AnimatedCard>

        {/* Resume history */}
        <AnimatedCard className="md:col-span-2" delay={0.12}>
          <div className="p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
              <History className="h-4 w-4 text-secondary" /> Analysis history
            </div>
            <h3 className="font-display mt-3 text-lg font-semibold leading-snug">
              Every version, every score, tracked.
            </h3>
            <div className="mt-5 space-y-2">
              {[
                { score: 84, label: "v3 · Amazon BIE" },
                { score: 77, label: "v2 · Bain AI Eng" },
                { score: 68, label: "v1 · baseline" },
              ].map((h, i) => (
                <motion.div
                  key={h.label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.12 }}
                  className="flex items-center justify-between rounded-xl border border-panel/8 bg-panel/[0.03] px-3.5 py-2.5"
                >
                  <span className="text-xs text-fg/55">{h.label}</span>
                  <span
                    className={`text-sm font-bold ${
                      h.score >= 80 ? "text-emerald-400" : h.score >= 70 ? "text-amber-400" : "text-rose-400"
                    }`}
                  >
                    {h.score}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedCard>

        {/* Deep parse */}
        <AnimatedCard className="md:col-span-2" delay={0.16}>
          <div className="relative overflow-hidden p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
              <FileSearch className="h-4 w-4 text-primary" /> Deep parsing
            </div>
            <h3 className="font-display mt-3 text-lg font-semibold leading-snug">
              PDF & DOCX read exactly the way ATS bots read them.
            </h3>
            <p className="mt-2.5 text-xs leading-relaxed text-fg/45">
              If our parser trips on your layout, so will theirs — you find out here first, not after 40
              applications.
            </p>
            <FloatingChip text=".pdf" delay={0} className="bottom-5 right-16" />
            <FloatingChip text=".docx" delay={0.9} className="bottom-10 right-4" />
          </div>
        </AnimatedCard>

        {/* Engine swap */}
        <AnimatedCard className="md:col-span-2" delay={0.2}>
          <div className="p-7">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg/40">
              <Layers className="h-4 w-4 text-glow" /> Pluggable AI
            </div>
            <h3 className="font-display mt-3 text-lg font-semibold leading-snug">
              Local rules today. Your own LLM tomorrow.
            </h3>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {["Local engine", "Ollama", "Claude", "GPT"].map((e, i) => (
                <motion.span
                  key={e}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 260, damping: 18 }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    i === 0
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-panel/10 bg-panel/[0.03] text-fg/45"
                  }`}
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {e}
                </motion.span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </div>
    </section>
  );
}
