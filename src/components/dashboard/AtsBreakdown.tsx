"use client";

/**
 * The nine-category ATS breakdown.
 *
 * A single number tells someone nothing they can act on. This shows what the
 * score is made of, why each category is weighted the way it is, and the fixes
 * worth the most points — all from the deterministic engine, so every line is
 * explainable rather than a model's opinion.
 *
 * Theme tokens only, so it follows the accent/mode switcher.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gauge, ChevronDown, CircleCheck, CircleX, MinusCircle, Zap } from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";
import type { AtsCategory, AtsReport } from "@/lib/ats/engine";

/** Green / amber / rose by how much of the category was earned. */
function toneFor(score: number, max: number): string {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.8) return "text-emerald-400";
  if (pct >= 0.5) return "text-amber-400";
  return "text-rose-400";
}

function CategoryRow({ category }: { category: AtsCategory }) {
  const [open, setOpen] = useState(false);
  const pct = category.maxScore > 0 ? (category.score / category.maxScore) * 100 : 0;

  return (
    <li className="rounded-xl border border-panel/8 bg-panel/[0.03]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-fg/80">{category.label}</span>
            {!category.applicable && (
              <span className="shrink-0 rounded-full border border-panel/12 px-1.5 py-0.5 text-[10px] text-fg/40">
                not scored
              </span>
            )}
          </span>
          {/* Progress track */}
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-panel/10">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: category.applicable ? `${pct}%` : "0%" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="block h-full rounded-full bg-primary"
            />
          </span>
        </span>

        <span
          className={`shrink-0 text-xs font-semibold tabular-nums ${
            category.applicable ? toneFor(category.score, category.maxScore) : "text-fg/30"
          }`}
        >
          {category.applicable ? `${category.score}/${category.maxScore}` : "—"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-fg/30 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-panel/8 px-3 py-2.5">
              <p className="text-[11px] italic leading-relaxed text-fg/40">{category.rationale}</p>
              <ul className="mt-2 space-y-2">
                {category.checks.map((chk) => {
                  const Icon = !category.applicable
                    ? MinusCircle
                    : chk.passed
                      ? CircleCheck
                      : CircleX;
                  return (
                    <li key={chk.label} className="flex items-start gap-2">
                      <Icon
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          !category.applicable
                            ? "text-fg/25"
                            : chk.passed
                              ? "text-emerald-400"
                              : "text-rose-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[11px] font-medium text-fg/70">{chk.label}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-fg/35">
                            {chk.points}/{chk.maxPoints}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-fg/50">
                          {chk.detail}
                        </span>
                        {!chk.passed && chk.fix && (
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-primary/75">
                            → {chk.fix}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function AtsBreakdown({ ats }: { ats: AtsReport }) {
  return (
    <GlassCard className="p-6" hover={false} delay={0.05}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <Gauge className="h-4 w-4 text-primary" /> ATS score breakdown
        </h3>
        <span className="text-[11px] text-fg/35">
          {ats.jdAware
            ? "Scored against the job description you provided."
            : "Add a job description to score keyword match too."}
        </span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {ats.categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>

      {ats.topFixes.length > 0 && (
        <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.05] p-3.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-fg/75">
            <Zap className="h-3.5 w-3.5 text-glow" /> Worth the most points
          </h4>
          <ul className="mt-2 space-y-1.5">
            {ats.topFixes.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 font-semibold text-primary tabular-nums">
                  +{f.points}
                </span>
                <span className="text-fg/60">
                  <span className="text-fg/45">{f.category}:</span> {f.fix}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
