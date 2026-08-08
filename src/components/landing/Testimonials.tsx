"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";

type T = { quote: string; name: string; role: string; initials: string; tint: string };

const ROW_A: T[] = [
  { quote: "Found out my two-column template was invisible to ATS bots. Fixed it, got three callbacks the same week.", name: "Priya S.", role: "Data Analyst", initials: "PS", tint: "--primary-rgb" },
  { quote: "The gap roadmap told me exactly which two skills to learn for the role I wanted. Two months later I had the offer.", name: "Rahul M.", role: "Backend Engineer", initials: "RM", tint: "--secondary-rgb" },
  { quote: "Every other tool wanted ₹2000/month to tell me what this does for free. And this one runs offline.", name: "Ananya K.", role: "New Graduate", initials: "AK", tint: "--glow-rgb" },
  { quote: "The 'gaps we didn't paper over' section is the most honest thing I've seen in a resume tool.", name: "James O.", role: "Product Manager", initials: "JO", tint: "--primary-rgb" },
];

const ROW_B: T[] = [
  { quote: "Tailored my resume for 12 applications in one evening. The keyword reordering alone is worth it.", name: "Sneha R.", role: "BI Engineer", initials: "SR", tint: "--secondary-rgb" },
  { quote: "I self-hosted it for our whole college placement cell. Zero cost, zero data leaving campus.", name: "Prof. Mehta", role: "Placement Officer", initials: "PM", tint: "--glow-rgb" },
  { quote: "It flagged that my JD asked for 5+ years and I showed 3 — and told me how to reframe instead of lying.", name: "Diego F.", role: "Cloud Engineer", initials: "DF", tint: "--primary-rgb" },
  { quote: "Open source means I could actually read the scoring rules. Trust through transparency.", name: "Lena W.", role: "OSS Contributor", initials: "LW", tint: "--secondary-rgb" },
];

function Card({ t }: { t: T }) {
  return (
    <figure className="glass-deep mx-3 w-[340px] shrink-0 p-6">
      <Quote className="h-5 w-5" style={{ color: `rgb(var(${t.tint}))` }} />
      <blockquote className="mt-3 text-sm leading-relaxed text-fg/70">{t.quote}</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold"
          style={{
            background: `rgb(var(${t.tint}) / 0.1)`,
            borderColor: `rgb(var(${t.tint}) / 0.25)`,
            color: `rgb(var(${t.tint}))`,
          }}
        >
          {t.initials}
        </motion.div>
        <div>
          <p className="text-sm font-semibold text-fg/85">{t.name}</p>
          <p className="text-xs text-fg/40">{t.role}</p>
        </div>
      </figcaption>
    </figure>
  );
}

export default function Testimonials() {
  return (
    <section className="relative overflow-hidden py-28">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-2xl px-4 text-center"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Loved by job seekers</span>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          The tool people <span className="gradient-text">wish existed sooner</span>
        </h2>
      </motion.div>

      <div className="relative mt-14 space-y-6">
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />

        <div className="flex overflow-hidden">
          <div className="marquee-track flex w-max">
            {[...ROW_A, ...ROW_A].map((t, i) => (
              <Card key={`a-${i}`} t={t} />
            ))}
          </div>
        </div>
        <div className="flex overflow-hidden">
          <div className="marquee-track marquee-reverse flex w-max">
            {[...ROW_B, ...ROW_B].map((t, i) => (
              <Card key={`b-${i}`} t={t} />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-[11px] text-fg/25">
        Illustrative testimonials — this project is young. Yours could be the first real one.
      </p>
    </section>
  );
}
