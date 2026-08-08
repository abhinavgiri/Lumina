"use client";

/**
 * The Career Profile — what's true about the person, not about one document.
 *
 * Three things live here that no single resume can show: the roles they're
 * actually targeting, their skills tracked OVER TIME (so growth is visible),
 * and the learning they've committed to. Skills are synced from resumes by the
 * server, so this is populated the moment a resume exists.
 *
 * Theme tokens only, so it follows the accent/mode switcher.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserRound,
  Sparkles,
  GraduationCap,
  Plus,
  Trash2,
  Check,
  Loader2,
  Pencil,
} from "lucide-react";
import GlassCard from "@/components/fx/GlassCard";
import {
  addLearningItem,
  deleteLearningItem,
  fetchProfile,
  updateLearningItem,
  updateProfile,
  type CareerProfile,
  type LearningStatus,
} from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

const STATUS_LABEL: Record<LearningStatus, string> = {
  planned: "Planned",
  learning: "Learning",
  done: "Done",
};

const STATUS_TONE: Record<LearningStatus, string> = {
  planned: "border-panel/15 bg-panel/5 text-fg/55",
  learning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  done: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};

/** Next status in the loop, so one click moves things forward. */
const NEXT: Record<LearningStatus, LearningStatus> = {
  planned: "learning",
  learning: "done",
  done: "planned",
};

export default function CareerProfilePanel() {
  const [profile, setProfile] = useState<CareerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editingTargets, setEditingTargets] = useState(false);
  const [rolesDraft, setRolesDraft] = useState("");
  const [newSkill, setNewSkill] = useState("");

  const load = useCallback(async () => {
    try {
      setProfile(await fetchProfile());
    } catch (e) {
      setError(errorMessage(e, "Couldn't load your career profile."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTargets(e: React.FormEvent) {
    e.preventDefault();
    setBusy("targets");
    try {
      const roles = rolesDraft.split(",").map((r) => r.trim()).filter(Boolean);
      setProfile(await updateProfile({ targetRoles: roles }));
      setEditingTargets(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your target roles."));
    } finally {
      setBusy(null);
    }
  }

  async function addLearning(e: React.FormEvent) {
    e.preventDefault();
    if (!newSkill.trim()) return;
    setBusy("learning");
    setError(null);
    try {
      await addLearningItem({ skill: newSkill.trim() });
      setNewSkill("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't add that."));
    } finally {
      setBusy(null);
    }
  }

  async function cycleStatus(id: string, status: LearningStatus) {
    setBusy(id);
    try {
      await updateLearningItem(id, { status: NEXT[status] });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't update that."));
    } finally {
      setBusy(null);
    }
  }

  async function removeLearning(id: string) {
    setBusy(id);
    try {
      await deleteLearningItem(id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove that."));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <GlassCard className="p-6" hover={false}>
        <div className="h-4 w-40 animate-pulse rounded bg-panel/[0.08]" />
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-panel/[0.06]" />
      </GlassCard>
    );
  }
  if (!profile) {
    return (
      <GlassCard className="p-6" hover={false}>
        <p className="text-sm text-red-400">{error ?? "No profile available."}</p>
      </GlassCard>
    );
  }

  const recent = new Set(profile.recentlyAdded);

  return (
    <GlassCard className="p-6" hover={false} id="profile">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
          <UserRound className="h-4 w-4 text-primary" /> Career profile
        </h2>
        <span className="text-[11px] text-fg/35">
          {profile.skills.length} skill{profile.skills.length === 1 ? "" : "s"} tracked
          {profile.recentlyAdded.length > 0 && ` · ${profile.recentlyAdded.length} new in the last 90 days`}
        </span>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {/* Target roles */}
      <div className="mt-4 rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-fg/70">Target roles</h3>
          <button
            onClick={() => {
              setRolesDraft(profile.targetRoles.join(", "));
              setEditingTargets((v) => !v);
            }}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg/45 transition-colors hover:text-fg"
          >
            <Pencil className="h-3 w-3" /> {editingTargets ? "Cancel" : "Edit"}
          </button>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {editingTargets ? (
            <motion.form
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={saveTargets}
              className="mt-2.5 flex gap-2"
            >
              <input
                className="input-dark flex-1 px-3 py-2 text-xs"
                placeholder="Data Engineer, Analytics Engineer"
                value={rolesDraft}
                onChange={(e) => setRolesDraft(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy === "targets"}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-fg disabled:opacity-60"
              >
                {busy === "targets" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </button>
            </motion.form>
          ) : (
            <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {profile.targetRoles.length === 0 ? (
                <p className="mt-2 text-[11px] text-fg/40">
                  Not set — naming the roles you want sharpens job search and gap analysis.
                </p>
              ) : (
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {profile.targetRoles.map((r) => (
                    <li
                      key={r}
                      className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                    >
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Skills over time */}
        <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg/70">
            <Sparkles className="h-3.5 w-3.5 text-glow" /> Skills you&apos;ve shown
          </h3>
          {profile.skills.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-fg/40">
              Upload or build a resume and the skills it demonstrates will be tracked here over time.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-fg/40">
                Collected from your resumes. Ones marked new appeared in the last 90 days.
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <li
                    key={s.name}
                    title={`First seen ${new Date(s.firstSeenAt).toLocaleDateString()}`}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                      recent.has(s.name)
                        ? "border-emerald-400/30 bg-emerald-400/10 font-medium text-emerald-300"
                        : "border-panel/12 bg-panel/5 text-fg/60"
                    }`}
                  >
                    {s.name}
                    {recent.has(s.name) && <span className="ml-1 opacity-70">new</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Learning commitments */}
        <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg/70">
            <GraduationCap className="h-3.5 w-3.5 text-glow" /> Learning
          </h3>

          <form onSubmit={addLearning} className="mt-2.5 flex gap-2">
            <input
              className="input-dark flex-1 px-3 py-1.5 text-xs"
              placeholder="Add a skill to learn"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy === "learning"}
              aria-label="Add learning item"
              className="inline-flex items-center rounded-xl border border-panel/12 bg-panel/5 px-3 py-1.5 text-fg/60 transition-colors hover:text-fg disabled:opacity-50"
            >
              {busy === "learning" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </form>

          {profile.learning.length === 0 ? (
            <p className="mt-2.5 text-[11px] leading-relaxed text-fg/40">
              Nothing yet. Skill-gap roadmaps suggest what to learn — adding it here means the app can
              hold you to it.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-1.5">
              {profile.learning.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <button
                    onClick={() => cycleStatus(l.id, l.status)}
                    disabled={busy === l.id}
                    title={`Mark as ${STATUS_LABEL[NEXT[l.status]]}`}
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50 ${STATUS_TONE[l.status]}`}
                  >
                    {l.status === "done" ? <Check className="h-3 w-3" /> : STATUS_LABEL[l.status]}
                  </button>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs ${
                      l.status === "done" ? "text-fg/35 line-through" : "text-fg/75"
                    }`}
                  >
                    {l.skill}
                  </span>
                  {l.source === "roadmap" && (
                    <span className="shrink-0 text-[10px] text-fg/30">from roadmap</span>
                  )}
                  <button
                    onClick={() => removeLearning(l.id)}
                    disabled={busy === l.id}
                    aria-label={`Remove ${l.skill}`}
                    className="shrink-0 text-fg/25 transition-colors hover:text-rose-400 disabled:opacity-50"
                  >
                    {busy === l.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
