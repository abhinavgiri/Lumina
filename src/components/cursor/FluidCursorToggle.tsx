"use client";

/**
 * Opt-in switch for the WebGL fluid cursor.
 *
 * The effect is genuinely nice and was deliberately built — but it's a
 * full-screen fluid simulation running every frame, and with it on the app was
 * measurably heavy to use. Default off, one click to bring it back, and the
 * cost is stated honestly rather than hidden behind a pretty label.
 */
import { useEffect, useState } from "react";
import { Waves } from "lucide-react";
import { FLUID_CURSOR_KEY } from "@/components/cursor/SplashCursor";

export default function FluidCursorToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(localStorage.getItem(FLUID_CURSOR_KEY) === "on");
  }, []);

  function toggle() {
    const next = !on;
    localStorage.setItem(FLUID_CURSOR_KEY, next ? "on" : "off");
    setOn(next);
    // The simulation sets up once on mount, so a reload is the honest way to
    // start or fully tear it down.
    location.reload();
  }

  return (
    <button
      onClick={toggle}
      title={
        on
          ? "Fluid cursor is ON — it's GPU-heavy and can make the app feel sluggish. Click to turn off."
          : "Turn on the fluid cursor effect (looks great, but noticeably heavier)."
      }
      aria-pressed={on}
      aria-label="Toggle fluid cursor effect"
      className={`hidden rounded-full border p-1.5 transition-colors sm:inline-flex ${
        on
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-panel/10 bg-panel/5 text-fg/40 hover:text-fg/70"
      }`}
    >
      <Waves className="h-3.5 w-3.5" />
    </button>
  );
}
