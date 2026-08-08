"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

type GlassCardProps = HTMLMotionProps<"div"> & {
  hover?: boolean;
  delay?: number;
};

/** Reveal-on-scroll glass panel with optional hover lift + glow. */
export default function GlassCard({
  hover = true,
  delay = 0,
  className = "",
  children,
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -4 } : undefined}
      className={`glass-deep glow-card ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
