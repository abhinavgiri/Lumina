"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Makes every framer-motion animation in the app respect the operating system's
 * "reduce motion" setting.
 *
 * The CSS media query only covered hand-written keyframes; the app's motion is
 * overwhelmingly framer-motion, which ignores that query unless told. Without
 * this, someone with vestibular sensitivity got the full effect regardless of
 * their system preference.
 *
 * `reducedMotion="user"` keeps opacity fades (which don't trigger motion
 * sickness) while dropping transforms.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
