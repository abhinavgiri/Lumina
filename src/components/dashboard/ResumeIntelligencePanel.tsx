"use client";

/**
 * Per-bullet resume feedback — the visible half of Phase 4.
 *
 * A score tells someone their resume is a 74. This tells them *which bullet* is
 * weak and *why*, which is the part they can act on. All of it comes from the
 * deterministic engine (lib/resume/intelligence.ts), so every claim is
 * explainable and nothing is invented.
 *
 * Theme tokens only — no hardcoded hex — so it follows the accent/mode switcher.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CircleCheck,
  CircleAlert,
  CircleX,
  PlusCircle,
  ListOrdered,
  ChevronDown,
  Wand2,
  Loader2,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";
import { analyzeResumeIntelligence, type BulletGrade } from "@/lib/resume/intelligence";
import { parseRawToStructured } from "@/lib/ai/localEngine";
import { structuredResumeSchema, type StructuredResume } from "@/lib/resumeTypes";
import { rewriteBullets, type RewrittenBullet } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

const GRADE_META: Record<BulletGrade, { icon: typeof CircleCheck; tone: string; label: string }> = {
  strong: { icon: CircleCheck, tone: "text-emerald-400", label: "Strong" },
  adequate: { icon: CircleAlert, tone: "text-amber-400", label: "Could be stronger" },
  weak: { icon: CircleX, tone: "text-rose-400", label: "Needs work" },
};

export default function ResumeIntelligencePanel({
  structuredJson,
  rawText,
}: {
  structuredJson: string | null;
  rawText: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [rewrites, setRewrites] = useState<Map<string, RewrittenBullet>>(new Map());
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);

  /** The structured resume the analysis ran on — also what we send to rewrite. */
  const source = useMemo<StructuredResume | null>(() => {
    try {
      if (structuredJson) {
        const parsed = structuredResumeSchema.safeParse(JSON.parse(structuredJson));
        if (parsed.success) return parsed.data;
      }
      return rawText?.trim() ? parseRawToStructured(rawText) : null;
    } catch {
      return null;
    }
  }, [structuredJson, rawText]);

  async function runRewrite() {
    if (!source) return;
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await rewriteBullets(source);
      setRewrites(new Map(res.bullets.map((b) => [b.original, b])));
      setRejectedCount(res.rejectedCount);
    } catch (e) {
      setRewriteError(errorMessage(e, "Couldn't rewrite those bullets."));
    } finally {
      setRewriting(false);
    }
  }

  const intel = useMemo(() => {
    // Prefer the stored structure; fall back to parsing the raw text so an
    // UPLOADED resume gets feedback immediately, without having to run "Polish
    // with AI" first. That's the common case, and leaving it blank made the
    // whole panel look broken.
    try {
      if (structuredJson) {
        const parsed = structuredResumeSchema.safeParse(JSON.parse(structuredJson));
        if (parsed.success) return analyzeResumeIntelligence(parsed.data);
      }
      if (rawText?.trim()) {
        const derived = parseRawToStructured(rawText);
        if (derived.experience.some((e) => e.bullets.length > 0)) {
          return analyzeResumeIntelligence(derived);
        }
      }
      return null;
    } catch {
      return null;
    }
  }, [structuredJson, rawText]);

  // Nothing parseable — say what would fix it rather than showing an empty panel.
  if (!intel) {
    return (
      <GlassCard className="p-6" hover={false} id="intelligence">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <Sparkles className="h-4 w-4 text-primary" /> Bullet-by-bullet feedback
        </h2>
        <p className="mt-3 text-sm text-muted">
          Build a resume in the Studio, or run &quot;Polish with AI&quot; on an uploaded one, and
          every bullet gets checked here for a strong verb, named tools, and a measurable result.
        </p>
      </GlassCard>
    );
  }

  const { bullets, counts, consistency, keywordOpportunities, sections, headline } = intel;

  return (
    <GlassCard className="p-6" hover={false} id="intelligence">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <Sparkles className="h-4 w-4 text-primary" /> Bullet-by-bullet feedback
        </h2>
        {counts.strong < bullets.length && (
          <button
            onClick={runRewrite}
            disabled={rewriting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {rewriting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {rewriting ? "Rewriting…" : "Suggest rewrites"}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-fg/70">{headline}</p>

      {bullets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
          {(["strong", "adequate", "weak"] as const)
            .filter((g) => counts[g] > 0)
            .map((g) => (
              <span
                key={g}
                className={`rounded-full border border-panel/10 bg-panel/5 px-2 py-0.5 font-medium ${GRADE_META[g].tone}`}
              >
                {counts[g]} {GRADE_META[g].label.toLowerCase()}
              </span>
            ))}
        </div>
      )}

      {rewriteError && <p className="mt-3 text-xs text-red-400">{rewriteError}</p>}

      {rewrites.size > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg/45">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
          Suggestions are checked before you see them: any rewrite that invented a number, added a
          tool you didn&apos;t mention, or dropped one of your real metrics was discarded
          {rejectedCount > 0 && ` (${rejectedCount} was)`}. Copy anything you want to keep — nothing
          is changed automatically.
        </p>
      )}

      {/* Per-bullet list */}
      <ul className="mt-4 space-y-1.5">
        {bullets.map((b, i) => {
          const meta = GRADE_META[b.grade];
          const Icon = meta.icon;
          const open = expanded === i;
          const hasIssues = b.issues.length > 0;
          return (
            <li key={i} className="rounded-xl border border-panel/8 bg-panel/[0.03]">
              <button
                onClick={() => setExpanded(open ? null : i)}
                disabled={!hasIssues}
                className="flex w-full items-start gap-2.5 p-3 text-left disabled:cursor-default"
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-relaxed text-fg/75">{b.text}</span>
                  <span className="mt-1 block text-[11px] text-fg/35">{b.role}</span>
                </span>
                {hasIssues && (
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 shrink-0 text-fg/30 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                )}
              </button>

              <AnimatePresence initial={false}>
                {open && hasIssues && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-panel/8 px-3 py-2.5 pl-9">
                      <ul className="space-y-1.5">
                        {b.issues.map((issue) => (
                          <li key={issue} className="text-[11px] leading-relaxed text-fg/55">
                            • {issue}
                          </li>
                        ))}
                      </ul>

                      {(() => {
                        const rw = rewrites.get(b.text);
                        if (!rw) return null;
                        return (
                          <div className="mt-3 space-y-2">
                            {rw.rewritten && (
                              <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-2.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                  Suggested rewrite
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-fg/80">{rw.rewritten}</p>
                                <button
                                  onClick={() => navigator.clipboard?.writeText(rw.rewritten!)}
                                  className="mt-1.5 text-[10px] text-primary/80 hover:text-primary"
                                >
                                  Copy
                                </button>
                              </div>
                            )}

                            {/* A metric we refuse to invent — only the user knows it. */}
                            {rw.askUser && (
                              <p className="flex items-start gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5 text-[11px] leading-relaxed text-amber-200/90">
                                <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                  <span className="font-medium">To make this measurable:</span>{" "}
                                  {rw.askUser} We won&apos;t guess a number for you.
                                </span>
                              </p>
                            )}

                            {!rw.rewritten && rw.rejected && (
                              <p className="text-[11px] leading-relaxed text-fg/40">
                                A rewrite was generated but discarded — it{" "}
                                {rw.rejected === "invented-number"
                                  ? "invented a metric that isn't in your bullet"
                                  : rw.rejected === "invented-tool"
                                    ? "added a tool you didn't mention"
                                    : rw.rejected === "dropped-number"
                                      ? "dropped one of your real numbers"
                                      : `failed the ${rw.rejected} check`}
                                . Your original is unchanged.
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {/* Truthful keyword enrichment */}
        {keywordOpportunities.length > 0 && (
          <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg/70">
              <PlusCircle className="h-3.5 w-3.5 text-glow" /> Skills you use but don&apos;t list
            </h3>
            <p className="mt-1 text-[11px] text-fg/40">
              Found in your own bullets — adding them to your Skills section helps ATS keyword
              matching.
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {keywordOpportunities.map((k) => (
                <li
                  key={k.skill}
                  title={k.evidence}
                  className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {k.skill}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Consistency + ordering */}
        {(consistency.length > 0 || sections.reason) && (
          <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg/70">
              <ListOrdered className="h-3.5 w-3.5 text-glow" /> Consistency &amp; structure
            </h3>
            {consistency.length === 0 ? (
              <p className="mt-2 text-[11px] text-fg/45">
                No consistency issues — tense, punctuation and dates all line up.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-2">
                {consistency.map((c) => (
                  <li key={c.type} className="text-[11px] leading-relaxed">
                    <span className="font-medium text-fg/70">{c.type}:</span>{" "}
                    <span className="text-fg/50">{c.detail}</span>{" "}
                    <span className="text-fg/40">{c.fix}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-panel/8 pt-2.5 text-[11px] leading-relaxed text-fg/45">
              <span className="font-medium text-fg/65">Suggested order:</span>{" "}
              {sections.order.join(" → ")}. {sections.reason}
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
