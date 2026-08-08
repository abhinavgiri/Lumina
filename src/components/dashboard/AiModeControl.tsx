"use client";

/**
 * Where the user's resume gets processed — their decision, made knowingly.
 *
 * The consent dialog states plainly what leaves the machine and what doesn't.
 * It is deliberately specific ("your name, contact details and full work
 * history") rather than a vague "data may be shared", because a person can only
 * consent to something they actually understand. Local stays the default; the
 * dialog appears before the first cloud call, never after.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Cloud, ShieldCheck, X, Loader2, Check } from "lucide-react";
import { apiGet, apiPost, errorMessage } from "@/lib/api/client";

type AiModeState = {
  mode: "local" | "cloud";
  cloudAvailable: boolean;
  providerLabel: string | null;
};

export default function AiModeControl() {
  const [state, setState] = useState<AiModeState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await apiGet<AiModeState>("/api/ai/mode"));
    } catch {
      setState({ mode: "local", cloudAvailable: false, providerLabel: null });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(mode: "local" | "cloud") {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/ai/mode", { mode });
      setState((s) => (s ? { ...s, mode } : s));
      setConfirming(false);
    } catch (e) {
      setError(errorMessage(e, "Couldn't change the AI mode."));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  const isCloud = state.mode === "cloud";
  const provider = state.providerLabel ?? "the AI provider";

  return (
    <>
      <button
        onClick={() => (isCloud ? apply("local") : setConfirming(true))}
        disabled={busy || (!isCloud && !state.cloudAvailable)}
        title={
          state.cloudAvailable
            ? isCloud
              ? `Using ${provider}. Click to switch back to on-device only.`
              : `Processing on this device only. Click to enable ${provider}.`
            : "No cloud AI provider is configured — everything runs on this device."
        }
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:cursor-default ${
          isCloud
            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
            : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isCloud ? (
          <Cloud className="h-3 w-3" />
        ) : (
          <Cpu className="h-3 w-3" />
        )}
        {/* Label hides below sm: the header overflowed at 375px with four
            controls in the row. The icon + colour still carry the state, and
            the title attribute keeps it explicit on tap/hover. */}
        <span className="hidden sm:inline">{isCloud ? `${provider} AI` : "On-device only"}</span>
      </button>

      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
            onClick={() => setConfirming(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="glass-deep relative w-full max-w-md rounded-2xl p-6"
            >
              <button
                onClick={() => setConfirming(false)}
                aria-label="Close"
                className="absolute right-4 top-4 text-fg/40 transition-colors hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
                <Cloud className="h-4 w-4 text-amber-300" />
                Send your resume to {provider}?
              </h2>

              <p className="mt-3 text-sm leading-relaxed text-fg/70">
                To rewrite bullets and polish wording, {provider} needs to read your resume. That
                means <strong className="text-fg/90">your resume text is sent to their servers</strong> —
                including your name, contact details and full work history.
              </p>

              <div className="mt-4 space-y-2 rounded-xl border border-panel/10 bg-panel/[0.03] p-3.5 text-[11px] leading-relaxed">
                <p className="flex items-start gap-2 text-fg/60">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                  Sent: your resume text, when you use AI rewriting or polish.
                </p>
                <p className="flex items-start gap-2 text-fg/60">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  Not sent: anything else. Scoring, ATS checks, keyword matching and job search all
                  stay on this device either way.
                </p>
                <p className="flex items-start gap-2 text-fg/60">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  You can switch back to on-device only at any time, in one click.
                </p>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-fg/40">
                We don&apos;t control what {provider} does with what it receives — check their
                privacy policy before enabling this if that matters to you.
              </p>

              {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => apply("cloud")}
                  disabled={busy}
                  className="btn-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-fg disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Yes, use {provider}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-panel/12 px-4 py-2.5 text-sm font-medium text-fg/60 transition-colors hover:text-fg"
                >
                  Keep it local
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
