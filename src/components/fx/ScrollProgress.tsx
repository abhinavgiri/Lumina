"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Thin accent bar at the very top that fills as you scroll the page. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[90] h-0.5 origin-left bg-gradient-to-r from-primary via-secondary to-glow"
      aria-hidden
    />
  );
}
