"use client";

import { useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

type Ripple = { x: number; y: number; id: number };

/**
 * Magnetic button: leans toward the cursor within its bounds, springs back on
 * leave, and emits a ripple on click. Renders a Next <Link> under the hood.
 */
export default function AnimatedButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ripples, setRipples] = useState<Ripple[]>([]);

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setOffset({ x: x * 0.25, y: y * 0.35 });
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const id = Date.now();
    setRipples((r) => [...r, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 700);
  }

  const base =
    variant === "primary"
      ? "btn-gradient text-fg"
      : "border border-panel/15 bg-panel/[0.04] text-fg/85 hover:bg-panel/[0.08] backdrop-blur-sm";

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setOffset({ x: 0, y: 0 })}
      onClick={onClick}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: "spring", stiffness: 200, damping: 16, mass: 0.5 }}
      whileTap={{ scale: 0.96 }}
      className={`relative inline-block overflow-hidden rounded-2xl ${className}`}
    >
      <Link
        href={href}
        className={`relative z-10 inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-semibold transition-colors ${base}`}
      >
        {children}
      </Link>
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ scale: 0, opacity: 0.35 }}
          animate={{ scale: 3.5, opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="pointer-events-none absolute z-0 h-24 w-24 rounded-full bg-panel"
          style={{ left: r.x - 48, top: r.y - 48 }}
        />
      ))}
    </motion.div>
  );
}
