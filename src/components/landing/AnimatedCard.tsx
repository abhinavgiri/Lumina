"use client";

import { useRef, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";

/**
 * 3D tilt card with a mouse-tracked light reflection sweep and an optional
 * animated conic-gradient border. Reveals on scroll.
 */
export default function AnimatedCard({
  children,
  className = "",
  delay = 0,
  animatedBorder = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  animatedBorder?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [light, setLight] = useState({ x: 50, y: 50, visible: false });

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ rx: (0.5 - py) * 8, ry: (px - 0.5) * 10 });
    setLight({ x: px * 100, y: py * 100, visible: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ perspective: 900 }}
    >
      <motion.div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          setTilt({ rx: 0, ry: 0 });
          setLight((l) => ({ ...l, visible: false }));
        }}
        animate={{ rotateX: tilt.rx, rotateY: tilt.ry }}
        transition={{ type: "spring", stiffness: 220, damping: 18, mass: 0.6 }}
        className={`group relative overflow-hidden rounded-3xl ${
          animatedBorder ? "animated-border" : "glass-deep glow-card"
        } ${className}`}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Mouse-tracked light reflection */}
        <div
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
          style={{
            opacity: light.visible ? 1 : 0,
            background: `radial-gradient(420px circle at ${light.x}% ${light.y}%, rgb(var(--primary-rgb) / 0.1), rgb(var(--secondary-rgb) / 0.05) 45%, transparent 70%)`,
          }}
        />
        {/* Top edge highlight */}
        <div className="pointer-events-none absolute inset-x-8 top-0 z-0 h-px bg-gradient-to-r from-transparent via-panel/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="relative z-10">{children}</div>
      </motion.div>
    </motion.div>
  );
}
