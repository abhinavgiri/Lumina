"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, ChevronDown } from "lucide-react";
import AnimatedButton from "@/components/landing/AnimatedButton";
import type { PrivacyCopy } from "@/lib/ai/privacyMode";

const Hero3D = dynamic(() => import("@/components/landing/Hero3D"), {
  ssr: false,
  loading: () => null,
});

const TYPED_WORDS = ["the ATS decides.", "the recruiter skims.", "you hit apply.", "rejection emails."];

function useTypewriter(words: string[]) {
  const [text, setText] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx % words.length];
    const delay = deleting ? 38 : text.length === word.length ? 2200 : 70;

    const t = setTimeout(() => {
      if (!deleting && text.length === word.length) {
        setDeleting(true);
      } else if (deleting && text.length === 0) {
        setDeleting(false);
        setWordIdx((i) => i + 1);
      } else {
        setText(word.slice(0, text.length + (deleting ? -1 : 1)));
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text, deleting, wordIdx, words]);

  return text;
}

const fadeUp = {
  hidden: { opacity: 0, y: 32, filter: "blur(8px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, delay: 0.25 + i * 0.13, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Hero({ privacy }: { privacy: PrivacyCopy }) {
  const typed = useTypewriter(TYPED_WORDS);
  // Only mount the WebGL orb on larger screens — on phones it hurts
  // readability (text sits over it) and drains battery. Mobile gets the
  // lighter global animated background instead.
  const [showOrb, setShowOrb] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setShowOrb(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 pt-28 pb-16 md:px-4 md:pt-24">
      {/* 3D orb — desktop only, floats behind/right of the copy */}
      {showOrb && (
        <div className="pointer-events-auto absolute inset-0 left-auto right-[-8%] z-0 w-[58%] opacity-80">
          <Hero3D />
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-4xl text-center md:text-left md:mx-0 md:mr-auto md:pl-[8vw]">
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
          <span className="inline-flex items-center gap-2 rounded-full border border-panel/10 bg-panel/[0.04] px-4 py-1.5 text-xs font-medium text-fg/60 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-glow" />
            Open-source AI resume intelligence
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              100% free
            </span>
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          className="font-display mt-6 text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Know if your resume
          <br />
          is <span className="gradient-text">good enough</span>
          <br />
          <span className="text-fg/85">before </span>
          <span className="text-fg/85">{typed}</span>
          <span className="typing-caret ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.12em] bg-glow" />
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted md:mx-0"
        >
          Upload your resume, paste any job description, and get an instant ATS score, keyword gaps, and a
          personalized roadmap to close them. {privacy.mode === "local"
            ? "Private by design — it all runs on your machine."
            : "Scoring runs on your machine; AI rewriting is powered by your configured provider."}
        </motion.p>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={3}
          className="mt-9 flex flex-wrap items-center justify-center gap-4 md:justify-start"
        >
          <AnimatedButton href="/dashboard">
            Analyze my resume <ArrowRight className="h-4 w-4" />
          </AnimatedButton>
          <AnimatedButton href="#demo" variant="ghost">
            Watch it work
          </AnimatedButton>
        </motion.div>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={4}
          className="mt-6 text-xs text-fg/30"
        >
          No sign-up · No subscription · {privacy.short}
        </motion.p>
      </div>

      {/* Scroll indicator */}
      <motion.a
        href="#features"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
        aria-label="Scroll to features"
      >
        <div className="flex h-10 w-6 items-start justify-center rounded-full border border-panel/20 p-1.5">
          <div className="scroll-dot h-1.5 w-1.5 rounded-full bg-glow" />
        </div>
        <ChevronDown className="mx-auto mt-1 h-4 w-4 text-fg/25" />
      </motion.a>

      {/* Bottom fade into next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
