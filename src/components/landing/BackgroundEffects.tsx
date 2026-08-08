"use client";

import AnimatedBackground from "@/components/fx/AnimatedBackground";

/**
 * Landing backdrop: aurora blobs + particle constellation + grid (shared with
 * the dashboard) plus a film-grain noise overlay for the luxury feel.
 */
export default function BackgroundEffects() {
  return (
    <>
      <AnimatedBackground />
      <div className="noise" aria-hidden />
    </>
  );
}
