"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

/**
 * Fixed full-viewport backdrop: aurora gradient blobs (CSS-animated),
 * a drifting particle constellation on canvas with mouse parallax,
 * and a soft cursor glow. Honors prefers-reduced-motion.
 */
export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const blobsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    const mouse = { x: 0.5, y: 0.5 };
    const particles: Particle[] = [];

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      // The link pass below is O(n^2) per frame, so this cap is the single
      // biggest lever on its cost: 80 particles is ~3,160 pair checks EVERY
      // frame, 45 is ~990. Visually near-identical, roughly a third of the work.
      const count = Math.min(45, Math.floor((width * height) / 34000));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.6 + 0.6,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const px = (mouse.x - 0.5) * 24;
      const py = (mouse.y - 0.5) * 24;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
      }

      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 120 * 120) {
            const alpha = (1 - Math.sqrt(dist2) / 120) * 0.12;
            ctx.strokeStyle = `rgba(148, 163, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x + px, a.y + py);
            ctx.lineTo(b.x + px, b.y + py);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        ctx.fillStyle = "rgba(165, 180, 252, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x + px, p.y + py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const onMouse = (e: MouseEvent) => {
      mouse.x = e.clientX / width;
      mouse.y = e.clientY / height;
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
      }
      if (blobsRef.current) {
        const bx = (mouse.x - 0.5) * -30;
        const by = (mouse.y - 0.5) * -30;
        blobsRef.current.style.transform = `translate(${bx}px, ${by}px)`;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        raf = requestAnimationFrame(draw);
      }
    };

    resize();
    seed();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouse);
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduced) raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgb(var(--primary-rgb) / 0.14), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 70%, rgb(var(--glow-rgb) / 0.08), transparent 60%), radial-gradient(ellipse 50% 50% at 10% 80%, rgb(var(--secondary-rgb) / 0.1), transparent 60%)",
        }}
      />

      {/* Grid overlay */}
      <div className="absolute inset-0 bg-grid" />

      {/* Aurora blobs with mouse parallax */}
      <div ref={blobsRef} className="absolute inset-0 transition-transform duration-700 ease-out">
        <div className="blob blob-1 left-[8%] top-[-6%] h-[420px] w-[420px] bg-primary/50" />
        <div className="blob blob-2 right-[5%] top-[22%] h-[380px] w-[380px] bg-secondary/45" />
        <div className="blob blob-3 left-[30%] bottom-[-10%] h-[440px] w-[440px] bg-glow/30" />
      </div>

      {/* Particle constellation */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Cursor glow */}
      <div
        ref={glowRef}
        className="absolute left-0 top-0 h-[600px] w-[600px] rounded-full transition-transform duration-200 ease-out"
        style={{ background: "radial-gradient(circle, rgb(var(--primary-rgb) / 0.07), transparent 65%)" }}
      />

      {/* Vignette — fades to the page background in either mode */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 55%, var(--bg) 100%)" }}
      />
    </div>
  );
}
