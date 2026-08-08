"use client";

/**
 * Application pipeline: saved → applied → interviewing → offer / rejected.
 *
 * Beyond being useful on its own, this is where real hiring OUTCOMES enter the
 * product. Every status change is logged server-side, which is the only honest
 * basis for a future "will this resume get an interview" model.
 *
 * Styling uses theme tokens only (text-fg, bg-panel, text-primary…), never
 * hardcoded hex or text-white, so it follows the accent/mode switcher.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";
import {
  APPLICATION_STATUSES,
  createApplication,
  deleteApplication,
  fetchApplications,
  updateApplication,
  type Application,
  type ApplicationStats,
  type ApplicationStatus,
} from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

/** Token-based tones so the board still reads correctly in every accent/mode. */
const STATUS_TONE: Record<ApplicationStatus, string> = {
  saved: "border-panel/15 bg-panel/5 text-fg/60",
  applied: "border-primary/30 bg-primary/10 text-primary",
  interviewing: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  offer: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  rejected: "border-rose-400/25 bg-rose-400/10 text-rose-300",
};

export default function ApplicationTracker({ resumeId }: { resumeId: string | null }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ company: "", title: "", url: "" });

  const load = useCallback(async () => {
    try {
      const data = await fetchApplications();
      setApps(data.applications);
      setStats(data.stats);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load your applications."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Other parts of the dashboard (the job cards) save jobs too — refresh then.
  useEffect(() => {
    const onSaved = () => load();
    window.addEventListener("lumina:application-saved", onSaved);
    return () => window.removeEventListener("lumina:application-saved", onSaved);
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.title.trim()) return;
    setBusyId("new");
    try {
      const created = await createApplication({
        company: form.company,
        title: form.title,
        url: form.url || null,
        source: "manual",
        resumeId,
      });
      setApps((a) => [created, ...a]);
      setForm({ company: "", title: "", url: "" });
      setAdding(false);
      load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that application."));
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(app: Application, status: ApplicationStatus) {
    setBusyId(app.id);
    // Optimistic: the board should feel instant.
    setApps((list) => list.map((a) => (a.id === app.id ? { ...a, status } : a)));
    try {
      const updated = await updateApplication(app.id, { status });
      setApps((list) => list.map((a) => (a.id === app.id ? updated : a)));
      load();
    } catch (err) {
      setApps((list) => list.map((a) => (a.id === app.id ? app : a))); // roll back
      setError(errorMessage(err, "Couldn't update that application."));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(app: Application) {
    setBusyId(app.id);
    try {
      await deleteApplication(app.id);
      setApps((list) => list.filter((a) => a.id !== app.id));
      load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove that application."));
    } finally {
      setBusyId(null);
    }
  }

  const nextStatus = (s: ApplicationStatus): ApplicationStatus | null => {
    const order: ApplicationStatus[] = ["saved", "applied", "interviewing", "offer"];
    const i = order.indexOf(s);
    return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  };

  return (
    <GlassCard className="p-6" hover={false} id="applications">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <Briefcase className="h-4 w-4 text-primary" /> Application tracker
        </h2>

        {stats && stats.total > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {APPLICATION_STATUSES.filter((s) => stats.byStatus[s] > 0).map((s) => (
              <span key={s} className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_TONE[s]}`}>
                {stats.byStatus[s]} {STATUS_LABEL[s].toLowerCase()}
              </span>
            ))}
            {stats.interviewRate !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-panel/10 bg-panel/5 px-2 py-0.5 font-medium text-fg/55">
                <TrendingUp className="h-3 w-3 text-glow" />
                {stats.interviewRate}% reached interview
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-panel/10 bg-panel/5 px-3 py-1.5 text-xs font-medium text-fg/60 transition-colors hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" /> Add manually
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={add}
            className="mt-4 grid gap-2 overflow-hidden sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input
              className="input-dark px-3 py-2 text-sm"
              placeholder="Company"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
            <input
              className="input-dark px-3 py-2 text-sm"
              placeholder="Job title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              className="input-dark px-3 py-2 text-sm"
              placeholder="Link (optional)"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <button
              type="submit"
              disabled={busyId === "new"}
              className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-fg disabled:opacity-60"
            >
              {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-panel/[0.06]" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No applications yet. Save a job from the search below, or add one manually — tracking
          which applications turn into interviews is how you learn what&apos;s working.
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {apps.map((app) => {
            const next = nextStatus(app.status);
            return (
              <motion.li
                key={app.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-panel/8 bg-panel/[0.03] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg/85">{app.title}</span>
                    {app.matchPercent !== null && (
                      <span className="shrink-0 text-[11px] text-fg/40">{app.matchPercent}% match</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-fg/45">
                    <span className="truncate">{app.company}</span>
                    {app.location && <span className="truncate">· {app.location}</span>}
                    {app.url && (
                      <a
                        href={app.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-fg/40 transition-colors hover:text-fg/70"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                <select
                  value={app.status}
                  onChange={(e) => setStatus(app, e.target.value as ApplicationStatus)}
                  disabled={busyId === app.id}
                  aria-label={`Status for ${app.title} at ${app.company}`}
                  className={`input-dark shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_TONE[app.status]}`}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>

                {next && (
                  <button
                    onClick={() => setStatus(app, next)}
                    disabled={busyId === app.id}
                    title={`Move to ${STATUS_LABEL[next]}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-panel/10 px-2.5 py-1 text-[11px] font-medium text-fg/50 transition-colors hover:text-fg disabled:opacity-50"
                  >
                    {STATUS_LABEL[next]} <ChevronRight className="h-3 w-3" />
                  </button>
                )}

                <button
                  onClick={() => remove(app)}
                  disabled={busyId === app.id}
                  aria-label={`Remove ${app.title}`}
                  className="shrink-0 text-fg/30 transition-colors hover:text-rose-400 disabled:opacity-50"
                >
                  {busyId === app.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
