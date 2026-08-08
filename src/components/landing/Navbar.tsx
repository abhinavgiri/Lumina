"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Menu, X, ArrowRight } from "lucide-react";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.28 10.28 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

const LINKS = [
  { label: "Features", href: "#features" },
  { label: "Live Demo", href: "#demo" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      className="fixed inset-x-0 top-4 z-50 px-4"
    >
      <nav
        className={`mx-auto flex max-w-5xl items-center gap-6 rounded-2xl border px-5 py-3 transition-all duration-500 ${
          scrolled
            ? "border-panel/10 bg-background/80 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30">
            <Zap className="h-4 w-4 text-fg" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Lumina</span>
        </Link>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative rounded-lg px-3.5 py-2 text-sm text-fg/60 transition-colors hover:text-fg"
            >
              {l.label}
              <span className="absolute inset-x-3.5 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-primary to-secondary transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-fg/60 transition-colors hover:text-fg"
            aria-label="GitHub"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
          <ThemeSwitcher />
          <Link
            href="/dashboard"
            className="btn-gradient ml-2 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-fg"
          >
            Launch App <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <ThemeSwitcher compact />
          <button
            className="rounded-lg p-2 text-fg/70"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-deep mx-auto mt-2 max-w-5xl p-4 md:hidden"
          >
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-fg/70 hover:bg-panel/5 hover:text-fg"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/dashboard"
              className="btn-gradient mt-2 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-fg"
            >
              Launch App <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
