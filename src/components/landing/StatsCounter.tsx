"use client";

import { motion } from "framer-motion";
import CountUp from "@/components/fx/CountUp";

const STATS = [
  { value: 100, suffix: "%", label: "Free & open source" },
  { value: 30, suffix: "s", label: "Resume to full report" },
  { value: 110, suffix: "+", label: "Skills recognized with synonyms" },
  { value: 0, suffix: "", label: "Bytes sent to anyone's cloud" },
];

export default function StatsCounter() {
  return (
    <section className="relative mx-auto max-w-5xl px-4 pb-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass grid grid-cols-2 divide-panel/[0.06] rounded-3xl md:grid-cols-4 md:divide-x"
      >
        {STATS.map((s) => (
          <div key={s.label} className="px-6 py-8 text-center">
            <div className="font-display text-4xl font-bold tracking-tight">
              <CountUp to={s.value} suffix={s.suffix} className="gradient-text" />
            </div>
            <p className="mt-2 text-xs text-fg/40">{s.label}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
