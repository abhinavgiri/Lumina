"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";
import CountUp from "@/components/fx/CountUp";

function ringColor(score: number): [string, string] {
  if (score >= 80) return ["#34d399", "#22d3ee"];
  if (score >= 60) return ["#fbbf24", "#a78bfa"];
  return ["#f87171", "#fb923c"];
}

export default function ScoreRing({
  score,
  label,
  size = 148,
  suffix = "",
}: {
  score: number;
  label: string;
  size?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [progress, setProgress] = useState(0);

  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const [c1, c2] = ringColor(score);
  const gradId = `ring-${label.replace(/\s+/g, "-").toLowerCase()}`;

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, score, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: setProgress,
    });
    return () => controls.stop();
  }, [inView, score]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={c1} />
              <stop offset="100%" stopColor={c2} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (progress / 100) * circumference}
            style={{ filter: `drop-shadow(0 0 8px ${c1}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <CountUp to={score} suffix={suffix} className="text-3xl font-bold tracking-tight" />
        </div>
      </div>
      <p className="text-sm text-fg/50 font-medium">{label}</p>
    </div>
  );
}
