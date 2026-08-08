"use client";

import { useRef, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Cpu, KeyRound } from "lucide-react";
import AnimatedButton from "@/components/landing/AnimatedButton";

type Mode = "self" | "byok";

const TIERS = [
  {
    icon: Cpu,
    name: "Local",
    price: "$0",
    period: "forever",
    tagline: "The built-in heuristic engine. Instant, deterministic, fully offline.",
    features: [
      "Unlimited ATS scoring",
      "JD keyword matching",
      "Truthful resume tailoring",
      "Skill-gap roadmaps",
      "DOCX + PDF export",
      "Runs 100% offline",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    icon: Zap,
    name: "Free AI",
    price: "$0",
    period: "with free-tier models",
    tagline: "Plug in a free API key (Groq, Gemini) for genuine AI rewriting on top of local rules.",
    features: [
      "Everything in Local",
      "AI bullet rewriting",
      "Smarter summary drafting",
      "Deeper JD gap reasoning",
      "Multiple free providers",
      "Automatic local fallback",
    ],
    cta: "Coming soon",
    highlight: true,
  },
  {
    icon: KeyRound,
    name: "Pro AI",
    price: "Your key",
    period: "pay the provider, not us",
    tagline: "Bring your own Claude or GPT key for the highest-quality tailoring on jobs that matter.",
    features: [
      "Everything in Free AI",
      "Frontier-model tailoring",
      "Guided rewrite prompts",
      "Interview question prep",
      "Key stays in your browser",
      "We never see a cent",
    ],
    cta: "Coming soon",
    highlight: false,
  },
];

function PricingCard({ tier, delay }: { tier: (typeof TIERS)[number]; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [glow, setGlow] = useState({ x: 50, y: 50, on: false });

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setGlow({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100, on: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="relative h-full"
    >
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setGlow((g) => ({ ...g, on: false }))}
        className={`relative flex h-full flex-col overflow-hidden rounded-3xl p-8 ${
          tier.highlight ? "animated-border" : "glass-deep glow-card"
        }`}
      >
        {/* Mouse-tracking glow */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: glow.on ? 1 : 0,
            background: `radial-gradient(460px circle at ${glow.x}% ${glow.y}%, rgb(var(--primary-rgb) / 0.12), transparent 65%)`,
          }}
        />

        {tier.highlight && (
          <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-primary to-secondary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-fg">
            Recommended
          </span>
        )}

        <tier.icon className={`h-6 w-6 ${tier.highlight ? "text-secondary" : "text-primary"}`} />
        <h3 className="font-display mt-4 text-xl font-semibold">{tier.name}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tracking-tight">{tier.price}</span>
          <span className="text-xs text-fg/40">{tier.period}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{tier.tagline}</p>

        <ul className="mt-6 space-y-2.5">
          {tier.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-fg/70">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-8">
          {tier.cta === "Start free" ? (
            <AnimatedButton href="/dashboard" className="w-full [&>a]:w-full [&>a]:justify-center">
              {tier.cta}
            </AnimatedButton>
          ) : (
            <div className="inline-flex w-full cursor-default items-center justify-center rounded-2xl border border-panel/10 bg-panel/[0.03] px-7 py-3.5 text-sm font-semibold text-fg/35">
              {tier.cta}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Pricing() {
  const [mode, setMode] = useState<Mode>("self");

  return (
    <section id="pricing" className="relative mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Pricing</span>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Free isn&apos;t a trial here. <span className="gradient-text">It&apos;s the product.</span>
        </h2>

        {/* Animated toggle */}
        <div className="mt-8 inline-flex items-center rounded-full border border-panel/10 bg-panel/[0.04] p-1">
          {(
            [
              ["self", "Self-hosted"],
              ["byok", "Bring your own AI"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                mode === m ? "text-fg" : "text-fg/45 hover:text-fg/70"
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="pricing-toggle"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-secondary"
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-fg/35">
          {mode === "self"
            ? "Clone the repo, run it on your machine. Everything below is included."
            : "Optional AI upgrades use keys you control — you pay the model provider directly, never us."}
        </p>
      </motion.div>

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {TIERS.map((t, i) => (
          <PricingCard key={t.name} tier={t} delay={i * 0.08} />
        ))}
      </div>
    </section>
  );
}
