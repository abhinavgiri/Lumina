"use client";

import { useEffect, useRef } from "react";

/**
 * CursorFX — the custom cursor that sits on TOP of everything: a small glowing
 * white/purple dot with soft lerp motion. That's the whole cursor.
 *
 * The liquid trail itself is the WebGL fluid simulation (SplashCursor), which
 * renders behind the UI. When that fluid is active (it sets
 * `document.documentElement.dataset.fluid = "on"`) this component draws nothing
 * but the dot. If WebGL is unavailable, a very subtle canvas fallback trail
 * (behind content) kicks in so there's still a hint of motion.
 *
 * Disabled on touch / reduced-motion (native cursor left untouched).
 */

const FALLBACK: readonly [number, number, number][] = [
  [139, 92, 246],
  [112, 225, 255],
];

type Pt = { x: number; y: number; t: number };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function CursorFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    const canvas = canvasRef.current;
    const dot = dotRef.current;
    if (!canvas || !dot) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    document.documentElement.classList.add("cursor-fx");

    let palette: readonly (readonly [number, number, number])[] = FALLBACK;
    const readPalette = () => {
      const s = getComputedStyle(document.documentElement);
      const parse = (v: string): [number, number, number] | null => {
        const n = v.trim().split(/[\s,]+/).map(Number);
        return n.length === 3 && n.every((x) => !Number.isNaN(x)) ? [n[0], n[1], n[2]] : null;
      };
      const p = parse(s.getPropertyValue("--primary-rgb"));
      const g = parse(s.getPropertyValue("--glow-rgb"));
      if (p && g) palette = [p, g];
    };
    readPalette();
    const paletteObs = new MutationObserver(readPalette);
    paletteObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent", "data-mode"] });

    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let prevX = mouse.x;
    let prevY = mouse.y;
    const dotPos = { x: mouse.x, y: mouse.y };
    let visible = false;
    let smoothSpeed = 0;
    const points: Pt[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
      }
    };
    const onLeaveWindow = () => {
      visible = false;
      dot.style.opacity = "0";
    };

    const draw = (now: number) => {
      const inst = Math.hypot(mouse.x - prevX, mouse.y - prevY);
      prevX = mouse.x;
      prevY = mouse.y;
      smoothSpeed = lerp(smoothSpeed, inst, 0.25);

      // Fallback trail ONLY when the WebGL fluid isn't running.
      const fluidActive = document.documentElement.dataset.fluid === "on";
      ctx.clearRect(0, 0, w, h);
      if (!fluidActive) {
        if (visible && inst > 2.2) points.push({ x: mouse.x, y: mouse.y, t: now });
        const life = 200 + Math.min(smoothSpeed, 40) * 4;
        while (points.length && now - points[0].t > life) points.shift();
        if (points.length > 14) points.shift();
        if (points.length > 1) {
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          const [ar, ag, ab] = palette[0];
          const [br, bg, bb] = palette[palette.length - 1];
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1];
            const b = points[i];
            const f = 1 - (now - b.t) / life;
            const sf = Math.min(smoothSpeed / 26, 1);
            const alpha = f * 0.12 * (0.35 + 0.65 * sf);
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, `rgba(${ar},${ag},${ab},${alpha * 0.6})`);
            grad.addColorStop(1, `rgba(${br},${bg},${bb},${alpha})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 0.6 + f * 1.4 * (0.5 + 0.5 * sf);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "source-over";
        }
      }

      // the dot — small, glowing, white/purple, soft lerp
      dotPos.x = lerp(dotPos.x, mouse.x, 0.3);
      dotPos.y = lerp(dotPos.y, mouse.y, 0.3);
      dot.style.transform = `translate3d(${dotPos.x - 4}px, ${dotPos.y - 4}px, 0)`;

      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeaveWindow);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      paletteObs.disconnect();
      document.documentElement.classList.remove("cursor-fx");
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeaveWindow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <>
      {/* subtle fallback trail — behind content (only used if WebGL fluid is off) */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0" style={{ zIndex: -1 }} aria-hidden />
      {/* the cursor: a small glowing white/purple dot, on top of everything */}
      <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden>
        <div
          ref={dotRef}
          className="absolute left-0 top-0 h-2 w-2 rounded-full opacity-0 will-change-transform"
          style={{
            background: "#ffffff",
            boxShadow:
              "0 0 6px 1px rgb(var(--primary-rgb) / 0.7), 0 0 14px 3px rgb(var(--primary-rgb) / 0.35)",
          }}
        />
      </div>
    </>
  );
}
