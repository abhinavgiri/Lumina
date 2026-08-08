"use client";

/**
 * Optional account control for the dashboard header.
 *
 * The app works fully signed-out — that's the "no sign-up" promise on the
 * landing page — so this is framed as *saving* work, never as a gate. The copy
 * says what the user gets ("keep your resumes across devices"), and signing up
 * while anonymous keeps everything already created.
 *
 * Styling uses theme tokens only (text-fg, bg-panel, text-primary…), never
 * hardcoded hex or text-white, so it follows the accent/mode switcher.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, LogOut, UserRound, Loader2, X } from "lucide-react";
import { fetchMe, signIn, signOut, signUp, type PublicUser } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

type Mode = "signin" | "signup";

export default function AuthMenu() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
      setUser(next);
      setOpen(false);
      setEmail("");
      setPassword("");
      // Server Components (dashboard history, saved resume) read the session,
      // so refresh to pick up the newly-claimed account's data.
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const signedIn = user && !user.isAnonymous;

  if (signedIn) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden items-center gap-1.5 rounded-full border border-panel/10 bg-panel/5 px-3 py-1 text-[11px] font-medium text-fg/60 sm:inline-flex"
          title={user.email ?? undefined}
        >
          <UserRound className="h-3 w-3 text-glow" />
          {user.email}
        </span>
        <button
          onClick={handleSignOut}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-panel/10 px-3 py-1.5 text-xs font-medium text-fg/60 transition-colors hover:text-fg disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Save your work to an account"
        className="inline-flex items-center gap-1.5 rounded-full border border-panel/10 bg-panel/5 px-3 py-1.5 text-xs font-medium text-fg/60 transition-colors hover:text-fg"
      >
        <LogIn className="h-3.5 w-3.5 text-glow" />
        {/* Label hidden on small screens — the header row overflowed at 375px. */}
        <span className="hidden sm:inline">Save my work</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="glass-deep relative w-full max-w-sm rounded-2xl p-6"
            >
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 text-fg/40 transition-colors hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="font-display text-lg font-semibold">
                {mode === "signup" ? "Keep your work" : "Welcome back"}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {mode === "signup"
                  ? "Optional — the app works without an account. Sign up to keep your resumes and scores across devices. Everything you've already made comes with you."
                  : "Sign in to get back to your saved resumes and analysis history."}
              </p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-dark w-full px-3 py-2.5 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-dark w-full px-3 py-2.5 text-sm"
                />

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-fg disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>

              <button
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError(null);
                }}
                className="mt-4 w-full text-center text-xs text-fg/45 transition-colors hover:text-fg/70"
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
