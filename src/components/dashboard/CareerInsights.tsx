"use client";

/**
 * Career insights: ATS score over time, the gaps that keep recurring, and the
 * application funnel.
 *
 * Honesty rule (matches analyticsService): never render a chart from a single
 * data point or imply a trend that doesn't exist. Thin data gets a plain
 * sentence explaining what's needed, not a flat line pretending to be a trend.
 *
 * Colours come from theme tokens so this follows the accent/mode switcher.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, TrendingUp, TrendingDown, Target, Minus } from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";
import { fetchAnalytics, type AnalyticsSummary } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

/** Minimum points before a line is meaningful rather than decorative. */
const MIN_TREND_POINTS = 2;

function Sparkline({ scores }: { scores: number[] }) {
  const w = 260;
  const h = 56;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  // Pad the vertical range slightly so a flat-ish series isn't glued to an edge.
  const y = (s: number) => h - 6 - ((s - min) / span) * (h - 14);
  const x = (i: number) => (i / Math.max(1, scores.length - 1)) * w;

  const line = scores.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s).toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="ATS score over time">
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--primary-rgb))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(var(--primary-rgb))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark)" />
      <path
        d={line}
        fill="none"
        stroke="rgb(var(--primary-rgb))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {scores.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s)} r={i === scores.length - 1 ? 3.5 : 2} fill="rgb(var(--primary-rgb))" />
      ))}
    </svg>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-3">
      <p className="text-[11px] uppercase tracking-wider text-fg/35">{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg/90">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-fg/40">{hint}</p>}
    </div>
  );
}

export default function CareerInsights() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchAnalytics());
    } catch (e) {
      setError(errorMessage(e, "Couldn't load your insights."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when work happens elsewhere on the page.
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("lumina:application-saved", onChange);
    return () => window.removeEventListener("lumina:application-saved", onChange);
  }, [load]);

  if (loading) {
    return (
      <GlassCard className="p-6" hover={false}>
        <div className="h-4 w-40 animate-pulse rounded bg-panel/[0.08]" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-panel/[0.06]" />
      </GlassCard>
    );
  }
  if (error || !data) {
    return (
      <GlassCard className="p-6" hover={false}>
        <p className="text-sm text-red-400">{error ?? "No insights available."}</p>
      </GlassCard>
    );
  }

  const { scoreTrend, recurringGaps, applications, analysedJobDescriptions, totalAnalyses } = data;
  const hasTrend = scoreTrend.points.length >= MIN_TREND_POINTS;
  const scores = scoreTrend.points.map((p) => p.score);

  // Nothing has happened yet — say so plainly instead of rendering empty charts.
  if (totalAnalyses === 0 && applications.total === 0) {
    return (
      <GlassCard className="p-6" hover={false} id="insights">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <LineChart className="h-4 w-4 text-primary" /> Career insights
        </h2>
        <p className="mt-3 text-sm text-muted">
          Analyse a resume against a job description and your score history, recurring skill gaps,
          and application funnel will build up here.
        </p>
      </GlassCard>
    );
  }

  const DeltaIcon = scoreTrend.delta === null || scoreTrend.delta === 0 ? Minus : scoreTrend.delta > 0 ? TrendingUp : TrendingDown;
  const deltaTone =
    scoreTrend.delta === null || scoreTrend.delta === 0
      ? "text-fg/45"
      : scoreTrend.delta > 0
        ? "text-emerald-400"
        : "text-rose-400";

  return (
    <GlassCard className="p-6" hover={false} id="insights">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <LineChart className="h-4 w-4 text-primary" /> Career insights
        </h2>
        <span className="text-[11px] text-fg/35">
          from {totalAnalyses} {totalAnalyses === 1 ? "analysis" : "analyses"}
          {analysedJobDescriptions > 0 &&
            ` · ${analysedJobDescriptions} against a job description`}
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        {/* Score history */}
        <div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Latest" value={scoreTrend.latest !== null ? `${scoreTrend.latest}` : "–"} hint="ATS score /100" />
            <Stat label="Best" value={scoreTrend.best !== null ? `${scoreTrend.best}` : "–"} />
            <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-3">
              <p className="text-[11px] uppercase tracking-wider text-fg/35">Change</p>
              <p className={`mt-1 flex items-center gap-1 text-2xl font-bold ${deltaTone}`}>
                <DeltaIcon className="h-4 w-4" />
                {scoreTrend.delta === null
                  ? "–"
                  : `${scoreTrend.delta > 0 ? "+" : ""}${scoreTrend.delta}`}
              </p>
              <p className="mt-0.5 text-[11px] text-fg/40">
                {scoreTrend.delta === null ? "needs 2 analyses" : "since your first"}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-panel/8 bg-panel/[0.03] p-3">
            {hasTrend ? (
              <>
                <Sparkline scores={scores} />
                <div className="mt-1 flex justify-between text-[10px] text-fg/30">
                  <span>{new Date(scoreTrend.points[0].date).toLocaleDateString()}</span>
                  <span>
                    {new Date(scoreTrend.points[scoreTrend.points.length - 1].date).toLocaleDateString()}
                  </span>
                </div>
              </>
            ) : (
              <p className="py-4 text-center text-xs text-fg/40">
                One analysis so far — run another to see how your score moves.
              </p>
            )}
          </div>
        </div>

        {/* Recurring gaps */}
        <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg/70">
            <Target className="h-3.5 w-3.5 text-glow" /> Gaps that keep coming up
          </h3>
          {recurringGaps.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-fg/40">
              {analysedJobDescriptions === 0
                ? "Paste a job description when you analyse — the skills those roles keep asking for that your resume doesn't show will collect here."
                : "No repeated gaps found. Your resume covers what these job descriptions asked for."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recurringGaps.map((gap) => (
                <motion.li
                  key={gap.skill}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="flex-1 truncate text-fg/75">{gap.skill}</span>
                  {gap.mustHave && (
                    <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                      required
                    </span>
                  )}
                  <span className="text-fg/40">
                    {gap.count}/{analysedJobDescriptions}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Application funnel */}
      {applications.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-panel/8 pt-4 text-[11px]">
          <span className="text-fg/45">Pipeline:</span>
          {(["saved", "applied", "interviewing", "offer", "rejected"] as const)
            .filter((s) => applications.byStatus[s] > 0)
            .map((s) => (
              <span key={s} className="rounded-full border border-panel/10 bg-panel/5 px-2 py-0.5 text-fg/60">
                {applications.byStatus[s]} {s}
              </span>
            ))}
          {applications.interviewRate !== null && (
            <span className="ml-auto text-fg/55">
              <strong className="text-fg/80">{applications.interviewRate}%</strong> of submitted
              applications reached an interview
            </span>
          )}
        </div>
      )}
    </GlassCard>
  );
}
