"use client";

import { motion } from "framer-motion";
import { Gauge, Target, Wand2, Map, ShieldCheck, GitBranch } from "lucide-react";
import AnimatedCard from "@/components/landing/AnimatedCard";
import type { PrivacyCopy } from "@/lib/ai/privacyMode";

const FEATURES = [
  {
    icon: Gauge,
    title: "ATS Score in seconds",
    body: "Rule-based formatting checks plus content-quality scoring — a transparent 0-100 with every deduction explained, not a black-box number.",
    tint: "--primary-rgb",
  },
  {
    icon: Target,
    title: "Job-description matching",
    body: "Semantic keyword matching that knows \"GCP\" means Google Cloud. See matched skills, missing must-haves, and experience gaps per job.",
    tint: "--secondary-rgb",
  },
  {
    icon: Wand2,
    title: "Truthful tailoring",
    body: "Reorders and rewrites around what each JD wants — and refuses to invent skills you don't have. Gaps get flagged, never papered over.",
    tint: "--glow-rgb",
  },
  {
    icon: Map,
    title: "Skill-gap roadmaps",
    body: "Every missing skill becomes a prioritized learning plan with honest time estimates and project ideas that prove it on your resume.",
    tint: "--primary-rgb",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    // Body is injected at render time — the honest claim depends on whether an
    // LLM tier is active (see lib/ai/privacyMode.ts).
    body: "",
    tint: "--secondary-rgb",
  },
  {
    icon: GitBranch,
    title: "Open source",
    body: "Every scoring rule is inspectable code. Swap the AI engine for your own model with one interface — no vendor lock-in, ever.",
    tint: "--glow-rgb",
  },
];

export default function FeatureGrid({ privacy }: { privacy: PrivacyCopy }) {
  // The "Private by design" card states whichever claim is actually true.
  const features = FEATURES.map((f) =>
    f.title === "Private by design" ? { ...f, body: privacy.long } : f
  );

  return (
    <section id="features" className="relative mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</span>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Everything the paid tools do.
          <br />
          <span className="gradient-text">Nothing they charge for.</span>
        </h2>
      </motion.div>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <AnimatedCard key={f.title} delay={i * 0.06} className="h-full">
            <div className="p-7">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl border"
                style={{
                  background: `rgb(var(${f.tint}) / 0.08)`,
                  borderColor: `rgb(var(${f.tint}) / 0.2)`,
                  boxShadow: `0 0 24px -6px rgb(var(${f.tint}) / 0.25)`,
                }}
              >
                <f.icon className="h-5 w-5" style={{ color: `rgb(var(${f.tint}))` }} />
              </div>
              <h3 className="font-display mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          </AnimatedCard>
        ))}
      </div>
    </section>
  );
}
