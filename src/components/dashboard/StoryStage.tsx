"use client";

/**
 * Progressive disclosure for the dashboard.
 *
 * The dashboard had twelve sections stacked on one page, all shouting at once —
 * it read like a landing page rather than a tool, and there was no signal about
 * what to do first. This wraps each stage so that:
 *
 *   - stages open in order, and the current one is the only one expanded
 *   - a stage that isn't ready yet says WHY ("add a resume first") instead of
 *     showing a dead button
 *   - completed stages collapse to a one-line summary, still one click away
 *
 * Nothing is removed — it's the same functionality, revealed when it's relevant.
 */
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Lock } from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";

export type StageState = "locked" | "active" | "done";

export default function StoryStage({
  step,
  title,
  blurb,
  state,
  /** Shown collapsed when the stage is done — the outcome, in one line. */
  summary,
  /** Why the stage isn't available yet. */
  lockedHint,
  defaultOpen,
  children,
  id,
}: {
  step: number;
  title: string;
  blurb: string;
  state: StageState;
  summary?: string;
  lockedHint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? state === "active");
  const locked = state === "locked";

  return (
    <GlassCard className="overflow-hidden p-0" hover={false} id={id}>
      <button
        onClick={() => !locked && setOpen((v) => !v)}
        disabled={locked}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 text-left disabled:cursor-default"
      >
        {/* Step marker doubles as progress: number → tick */}
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
            state === "done"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : locked
                ? "border-panel/12 bg-panel/5 text-fg/25"
                : "border-primary/30 bg-primary/10 text-primary"
          }`}
        >
          {state === "done" ? <Check className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3 w-3" /> : step}
        </span>

        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${locked ? "text-fg/35" : "text-fg/85"}`}>
            {title}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-fg/45">
            {locked ? (lockedHint ?? blurb) : state === "done" && !open && summary ? summary : blurb}
          </span>
        </span>

        {!locked && (
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-fg/30 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && !locked && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-panel/8 p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
