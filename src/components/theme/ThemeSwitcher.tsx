"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sun, Moon, Palette, Check } from "lucide-react";

export type Mode = "dark" | "light";
export type Accent = "violet" | "ocean" | "emerald" | "sunset";

const ACCENTS: { id: Accent; label: string; from: string; to: string }[] = [
  { id: "violet", label: "Violet", from: "#5b8cff", to: "#9b5cff" },
  { id: "ocean", label: "Ocean", from: "#38bdf8", to: "#3b82f6" },
  { id: "emerald", label: "Emerald", from: "#10b981", to: "#14b8a6" },
  { id: "sunset", label: "Sunset", from: "#fb923c", to: "#f43f5e" },
];

const MODE_KEY = "lumina-mode";
const ACCENT_KEY = "lumina-accent";

function apply(mode: Mode, accent: Accent) {
  const root = document.documentElement;
  root.setAttribute("data-mode", mode);
  root.setAttribute("data-accent", accent);
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
  } catch {
    /* ignore storage errors */
  }
}

/** Inline script string that sets the theme before first paint (no flash). */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${MODE_KEY}')||'dark';var a=localStorage.getItem('${ACCENT_KEY}')||'violet';var r=document.documentElement;r.setAttribute('data-mode',m);r.setAttribute('data-accent',a);}catch(e){}})();`;

export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("dark");
  const [accent, setAccent] = useState<Accent>("violet");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Hydrate from what the init script already applied to <html>.
  useEffect(() => {
    const root = document.documentElement;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the pre-hydration init script */
    setMode((root.getAttribute("data-mode") as Mode) || "dark");
    setAccent((root.getAttribute("data-accent") as Accent) || "violet");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggleMode() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    apply(next, accent);
  }
  function pickAccent(a: Accent) {
    setAccent(a);
    apply(mode, a);
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 rounded-xl border border-panel/10 bg-panel/[0.04] p-1 backdrop-blur-sm">
        <button
          onClick={toggleMode}
          aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg/70 transition-colors hover:bg-panel/10 hover:text-fg"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={mode}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {mode === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
        {!compact && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Choose accent color"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-fg/70 transition-colors hover:bg-panel/10 hover:text-fg"
          >
            <Palette className="h-4 w-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="glass-deep absolute right-0 z-50 mt-2 w-44 p-2"
          >
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg/40">Accent</p>
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAccent(a.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-fg/80 transition-colors hover:bg-panel/[0.06]"
              >
                <span
                  className="h-4 w-4 rounded-full ring-1 ring-panel/20"
                  style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
                />
                <span className="flex-1 text-left">{a.label}</span>
                {accent === a.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
