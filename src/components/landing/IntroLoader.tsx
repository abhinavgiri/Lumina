"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Intro loader — three labelled cards (Resume · ATS · Job Search) hold for a
 * beat, then disintegrate into a swirling cloud of theme-coloured particles
 * that drifts off, revealing the site. Runs once per session; skipped for
 * reduced-motion users.
 */

const SESSION_KEY = "lumina-intro-shown";
const CARDS = ["Resume", "ATS Score", "Job Search"];

type P = {
  x: number;
  y: number;
  hx: number; // home (card) position
  hy: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
};

export default function IntroLoader() {
  const [show, setShow] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gated on sessionStorage, runs once
    setShow(true);
    document.body.style.overflow = "hidden";

    const t = setTimeout(() => {
      setShow(false);
      document.body.style.overflow = "";
    }, 3200);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, []);

  // Particle dissolve on the canvas once shown.
  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = (canvas.width = window.innerWidth * dpr);
    let h = (canvas.height = window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.scale(dpr, dpr);
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // theme colours
    const s = getComputedStyle(document.documentElement);
    const readVar = (n: string, fb: string) => {
      const v = s.getPropertyValue(n).trim();
      return v ? `rgb(${v})` : fb;
    };
    const colors = [
      readVar("--primary-rgb", "rgb(139,92,246)"),
      readVar("--secondary-rgb", "rgb(59,130,246)"),
      readVar("--glow-rgb", "rgb(6,182,212)"),
    ];

    // Build particles laid out as three cards centred on screen.
    const particles: P[] = [];
    const cardW = 92;
    const cardH = 120;
    const gap = 24;
    const totalW = CARDS.length * cardW + (CARDS.length - 1) * gap;
    const startX = vw / 2 - totalW / 2;
    const cy = vh / 2 - cardH / 2;
    const step = 5;
    CARDS.forEach((_, ci) => {
      const cx = startX + ci * (cardW + gap);
      for (let x = 0; x < cardW; x += step) {
        for (let y = 0; y < cardH; y += step) {
          particles.push({
            x: cx + x,
            y: cy + y,
            hx: cx + x,
            hy: cy + y,
            vx: 0,
            vy: 0,
            color: colors[ci % colors.length],
            size: 1.6 + Math.random() * 1.4,
          });
        }
      }
    });

    let raf = 0;
    const startTime = performance.now();
    const DISSOLVE_AT = 1500; // ms: cards hold, then burst
    let exploded = false;

    const draw = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, vw, vh);

      if (elapsed > DISSOLVE_AT && !exploded) {
        exploded = true;
        for (const p of particles) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 5;
          p.vx = Math.cos(ang) * sp;
          p.vy = Math.sin(ang) * sp - 1.2; // slight upward bias
        }
      }

      for (const p of particles) {
        if (exploded) {
          p.vy += 0.02; // gentle gravity
          p.vx *= 0.99;
          p.vy *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
        } else {
          // subtle shimmer before dissolve
          p.x = p.hx + Math.sin(now / 300 + p.hy) * 0.6;
          p.y = p.hy + Math.cos(now / 320 + p.hx) * 0.6;
        }
        const fade = exploded ? Math.max(0, 1 - (elapsed - DISSOLVE_AT) / 1500) : 1;
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    window.addEventListener("resize", onResize);
    void w;
    void h;

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
          exit={{ opacity: 0, filter: "blur(14px)" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* accent glow behind the cards */}
          <div
            className="pointer-events-none absolute h-72 w-72 rounded-full blur-[100px]"
            style={{ background: "rgb(var(--primary-rgb) / 0.25)" }}
          />

          {/* card labels (fade out as the particles burst) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.7, times: [0, 0.25, 0.7, 1] }}
            className="pointer-events-none absolute z-10 flex gap-6"
          >
            {CARDS.map((c) => (
              <span key={c} className="w-[92px] text-center text-[11px] font-medium text-fg/70">
                {c}
              </span>
            ))}
          </motion.div>

          {/* particle canvas */}
          <canvas ref={canvasRef} className="absolute inset-0" />

          {/* wordmark reveal */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 0.6 }}
            className="absolute bottom-[32%] flex items-center gap-2.5"
          >
            <span className="font-display text-2xl font-bold tracking-tight">
              <span className="gradient-text">Lumina</span>
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
