"use client";

import { useEffect, useRef } from "react";

/**
 * SplashCursor — a real GPU fluid simulation (Navier–Stokes, à la the React Bits
 * "Splash Cursor") rendered as a transparent full-screen overlay, so moving the
 * mouse leaves a swirling liquid trail over the page.
 *
 * - Theme-aware: splat colours are read from the active accent CSS vars.
 * - Desktop + motion only; requires WebGL. If any of those are missing it
 *   renders nothing and sets no flag, so CursorFX's lightweight canvas trail
 *   remains as the graceful fallback.
 * - On successful init it sets `document.documentElement.dataset.fluid = "on"`
 *   so CursorFX suppresses its own particle trail (keeping the crisp cursor,
 *   hover glow, and click shockwave on top of the fluid).
 *
 * Fluid-sim core adapted from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
 */

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}
interface DoubleFBO {
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  read: FBO;
  write: FBO;
  swap: () => void;
}

/** localStorage flag the toggle in the header writes. */
export const FLUID_CURSOR_KEY = "lumina:fluid-cursor";

export default function SplashCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // OPT-IN, off by default. This is a full-screen Navier-Stokes fluid
    // simulation: a large float texture re-simulated and re-rendered every
    // frame, on top of an already animation-heavy app. Measured on the
    // dashboard it saturated the renderer badly enough that a plain
    // requestAnimationFrame loop couldn't complete. It looks great, so it stays
    // available — but a tool has to be usable first, and nobody opts into a
    // slow app by accident.
    if (localStorage.getItem(FLUID_CURSOR_KEY) !== "on") return;
    // Touch/mobile is supported too — driven by finger drag + scroll velocity.
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- original smoke feel (first version): density / area / dissipation.
    // Kept: reversed splat direction (smoke trails opposite to motion) + the
    // current cursor dot size (handled in CursorFX). ----
    const config = {
      SIM_RESOLUTION: 96,
      // 1024 was the visible cost centre; 512 looks near-identical at
      // typical window sizes for roughly a quarter of the fill rate.
      DYE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 2.6, // lingers a bit longer → more visible trail
      VELOCITY_DISSIPATION: 2.0,
      PRESSURE: 0.1,
      PRESSURE_ITERATIONS: 20,
      CURL: 3,
      SPLAT_RADIUS: 0.21,
      SPLAT_FORCE: 6000,
      MIN_SPEED: 0.0,
      SPEED_REF: 0.16,
      DYE_INTENSITY: 0.42, // brighter / denser so it's clearly visible
      DISPLAY_OPACITY: 1.0,
    };

    // Lighter simulation on phones to keep it smooth + easy on the battery.
    if (coarse) {
      config.SIM_RESOLUTION = 96;
      config.DYE_RESOLUTION = 512;
    }

    // ---- context ----
    const params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: false };
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext(
      "webgl2",
      params
    ) as WebGL2RenderingContext | null;
    const isWebGL2 = !!gl;
    if (!gl) {
      gl =
        (canvas.getContext("webgl", params) as WebGLRenderingContext | null) ??
        (canvas.getContext("experimental-webgl", params) as WebGLRenderingContext | null);
    }
    if (!gl) return; // no WebGL → fall back to CursorFX canvas trail

    const glc = gl as WebGL2RenderingContext & WebGLRenderingContext;

    // extensions / supported texture formats
    let halfFloat: OES_texture_half_float | null = null;
    let supportLinear = true;
    if (isWebGL2) {
      glc.getExtension("EXT_color_buffer_float");
      supportLinear = !!glc.getExtension("OES_texture_float_linear");
    } else {
      halfFloat = glc.getExtension("OES_texture_half_float");
      supportLinear = !!glc.getExtension("OES_texture_half_float_linear");
    }
    const halfFloatType = isWebGL2 ? (glc as WebGL2RenderingContext).HALF_FLOAT : halfFloat?.HALF_FLOAT_OES ?? 0;

    type Fmt = { internalFormat: number; format: number } | null;
    const getSupportedFormat = (internalFormat: number, format: number, type: number): Fmt => {
      if (!supportRenderTextureFormat(internalFormat, format, type)) {
        if (isWebGL2) {
          const g2 = glc as WebGL2RenderingContext;
          if (internalFormat === g2.R16F) return getSupportedFormat(g2.RG16F, g2.RG, type);
          if (internalFormat === g2.RG16F) return getSupportedFormat(g2.RGBA16F, glc.RGBA, type);
        }
        return null;
      }
      return { internalFormat, format };
    };
    function supportRenderTextureFormat(internalFormat: number, format: number, type: number) {
      const texture = glc.createTexture();
      glc.bindTexture(glc.TEXTURE_2D, texture);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, glc.NEAREST);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, glc.NEAREST);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, glc.CLAMP_TO_EDGE);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, glc.CLAMP_TO_EDGE);
      glc.texImage2D(glc.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      const fbo = glc.createFramebuffer();
      glc.bindFramebuffer(glc.FRAMEBUFFER, fbo);
      glc.framebufferTexture2D(glc.FRAMEBUFFER, glc.COLOR_ATTACHMENT0, glc.TEXTURE_2D, texture, 0);
      const status = glc.checkFramebufferStatus(glc.FRAMEBUFFER);
      glc.bindFramebuffer(glc.FRAMEBUFFER, null);
      return status === glc.FRAMEBUFFER_COMPLETE;
    }

    const g2 = glc as WebGL2RenderingContext;
    const rgba = isWebGL2
      ? getSupportedFormat(g2.RGBA16F, glc.RGBA, halfFloatType)
      : getSupportedFormat(glc.RGBA, glc.RGBA, halfFloatType);
    const rg = isWebGL2 ? getSupportedFormat(g2.RG16F, g2.RG, halfFloatType) : getSupportedFormat(glc.RGBA, glc.RGBA, halfFloatType);
    const r = isWebGL2 ? getSupportedFormat(g2.R16F, g2.RED, halfFloatType) : getSupportedFormat(glc.RGBA, glc.RGBA, halfFloatType);
    if (!rgba || !rg || !r) return;

    const texType = halfFloatType;
    const filtering = supportLinear ? glc.LINEAR : glc.NEAREST;

    // ---- shader helpers ----
    const compile = (type: number, source: string) => {
      const shader = glc.createShader(type)!;
      glc.shaderSource(shader, source);
      glc.compileShader(shader);
      if (!glc.getShaderParameter(shader, glc.COMPILE_STATUS)) {
        console.warn("SplashCursor shader:", glc.getShaderInfoLog(shader));
      }
      return shader;
    };
    const createProgram = (vs: WebGLShader, fs: WebGLShader) => {
      const program = glc.createProgram()!;
      glc.attachShader(program, vs);
      glc.attachShader(program, fs);
      glc.linkProgram(program);
      return program;
    };
    const getUniforms = (program: WebGLProgram) => {
      const uniforms: Record<string, WebGLUniformLocation | null> = {};
      const count = glc.getProgramParameter(program, glc.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = glc.getActiveUniform(program, i)!.name;
        uniforms[name] = glc.getUniformLocation(program, name);
      }
      return uniforms;
    };

    const baseVertex = compile(
      glc.VERTEX_SHADER,
      `precision highp float; attribute vec2 aPosition; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform vec2 texelSize;
       void main(){ vUv=aPosition*0.5+0.5; vL=vUv-vec2(texelSize.x,0.0); vR=vUv+vec2(texelSize.x,0.0); vT=vUv+vec2(0.0,texelSize.y); vB=vUv-vec2(0.0,texelSize.y); gl_Position=vec4(aPosition,0.0,1.0); }`
    );
    const prog = (fsSource: string) => {
      const p = createProgram(baseVertex, compile(glc.FRAGMENT_SHADER, fsSource));
      return { program: p, uniforms: getUniforms(p) };
    };
    const clearProg = prog(`precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value; void main(){ gl_FragColor=value*texture2D(uTexture,vUv); }`);
    const splatProg = prog(`precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius; void main(){ vec2 p=vUv-point.xy; p.x*=aspectRatio; vec3 splat=exp(-dot(p,p)/radius)*color; vec3 base=texture2D(uTarget,vUv).xyz; gl_FragColor=vec4(base+splat,1.0); }`);
    const advectionProg = prog(`precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
      vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){ vec2 st=uv/tsize-0.5; vec2 iuv=floor(st); vec2 fuv=fract(st); vec4 a=texture2D(sam,(iuv+vec2(0.5,0.5))*tsize); vec4 b=texture2D(sam,(iuv+vec2(1.5,0.5))*tsize); vec4 c=texture2D(sam,(iuv+vec2(0.5,1.5))*tsize); vec4 d=texture2D(sam,(iuv+vec2(1.5,1.5))*tsize); return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y); }
      void main(){ vec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize; vec4 result=bilerp(uSource,coord,dyeTexelSize); float decay=1.0+dissipation*dt; gl_FragColor=result/decay; }`);
    const divergenceProg = prog(`precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;
      void main(){ float L=texture2D(uVelocity,vL).x; float R=texture2D(uVelocity,vR).x; float T=texture2D(uVelocity,vT).y; float B=texture2D(uVelocity,vB).y; vec2 C=texture2D(uVelocity,vUv).xy; if(vL.x<0.0){L=-C.x;} if(vR.x>1.0){R=-C.x;} if(vT.y>1.0){T=-C.y;} if(vB.y<0.0){B=-C.y;} float div=0.5*(R-L+T-B); gl_FragColor=vec4(div,0.0,0.0,1.0); }`);
    const curlProg = prog(`precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uVelocity;
      void main(){ float L=texture2D(uVelocity,vL).y; float R=texture2D(uVelocity,vR).y; float T=texture2D(uVelocity,vT).x; float B=texture2D(uVelocity,vB).x; float vorticity=R-L-T+B; gl_FragColor=vec4(0.5*vorticity,0.0,0.0,1.0); }`);
    const vorticityProg = prog(`precision highp float; precision highp sampler2D; varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
      void main(){ float L=texture2D(uCurl,vL).x; float R=texture2D(uCurl,vR).x; float T=texture2D(uCurl,vT).x; float B=texture2D(uCurl,vB).x; float C=texture2D(uCurl,vUv).x; vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L)); force/=length(force)+0.0001; force*=curl*C; force.y*=-1.0; vec2 velocity=texture2D(uVelocity,vUv).xy; velocity+=force*dt; velocity=min(max(velocity,-1000.0),1000.0); gl_FragColor=vec4(velocity,0.0,1.0); }`);
    const pressureProg = prog(`precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uPressure; uniform sampler2D uDivergence;
      void main(){ float L=texture2D(uPressure,vL).x; float R=texture2D(uPressure,vR).x; float T=texture2D(uPressure,vT).x; float B=texture2D(uPressure,vB).x; float divergence=texture2D(uDivergence,vUv).x; float pressure=(L+R+B+T-divergence)*0.25; gl_FragColor=vec4(pressure,0.0,0.0,1.0); }`);
    const gradientProg = prog(`precision mediump float; precision mediump sampler2D; varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB; uniform sampler2D uPressure; uniform sampler2D uVelocity;
      void main(){ float L=texture2D(uPressure,vL).x; float R=texture2D(uPressure,vR).x; float T=texture2D(uPressure,vT).x; float B=texture2D(uPressure,vB).x; vec2 velocity=texture2D(uVelocity,vUv).xy; velocity.xy-=vec2(R-L,T-B); gl_FragColor=vec4(velocity,0.0,1.0); }`);
    const displayProg = prog(`precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTexture; uniform float opacity; void main(){ vec3 c=texture2D(uTexture,vUv).rgb; float a=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c, a*opacity); }`);

    // ---- fullscreen quad ----
    const buffer = glc.createBuffer();
    glc.bindBuffer(glc.ARRAY_BUFFER, buffer);
    glc.bufferData(glc.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), glc.STATIC_DRAW);
    const elem = glc.createBuffer();
    glc.bindBuffer(glc.ELEMENT_ARRAY_BUFFER, elem);
    glc.bufferData(glc.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), glc.STATIC_DRAW);
    glc.vertexAttribPointer(0, 2, glc.FLOAT, false, 0, 0);
    glc.enableVertexAttribArray(0);
    const blit = (target: FBO | null) => {
      if (!target) {
        glc.viewport(0, 0, glc.drawingBufferWidth, glc.drawingBufferHeight);
        glc.bindFramebuffer(glc.FRAMEBUFFER, null);
      } else {
        glc.viewport(0, 0, target.width, target.height);
        glc.bindFramebuffer(glc.FRAMEBUFFER, target.fbo);
      }
      glc.drawElements(glc.TRIANGLES, 6, glc.UNSIGNED_SHORT, 0);
    };

    // ---- FBOs ----
    const createFBO = (w: number, h: number, internalFormat: number, format: number, type: number, filter: number): FBO => {
      glc.activeTexture(glc.TEXTURE0);
      const texture = glc.createTexture()!;
      glc.bindTexture(glc.TEXTURE_2D, texture);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MIN_FILTER, filter);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_MAG_FILTER, filter);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_S, glc.CLAMP_TO_EDGE);
      glc.texParameteri(glc.TEXTURE_2D, glc.TEXTURE_WRAP_T, glc.CLAMP_TO_EDGE);
      glc.texImage2D(glc.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
      const fbo = glc.createFramebuffer()!;
      glc.bindFramebuffer(glc.FRAMEBUFFER, fbo);
      glc.framebufferTexture2D(glc.FRAMEBUFFER, glc.COLOR_ATTACHMENT0, glc.TEXTURE_2D, texture, 0);
      glc.viewport(0, 0, w, h);
      glc.clear(glc.COLOR_BUFFER_BIT);
      const texelSizeX = 1 / w;
      const texelSizeY = 1 / h;
      return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach(id: number) {
          glc.activeTexture(glc.TEXTURE0 + id);
          glc.bindTexture(glc.TEXTURE_2D, texture);
          return id;
        },
      };
    };
    const createDoubleFBO = (w: number, h: number, internalFormat: number, format: number, type: number, filter: number): DoubleFBO => {
      let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
      let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
      return {
        width: w,
        height: h,
        texelSizeX: fbo1.texelSizeX,
        texelSizeY: fbo1.texelSizeY,
        get read() {
          return fbo1;
        },
        set read(v) {
          fbo1 = v;
        },
        get write() {
          return fbo2;
        },
        set write(v) {
          fbo2 = v;
        },
        swap() {
          const t = fbo1;
          fbo1 = fbo2;
          fbo2 = t;
        },
      };
    };

    const getResolution = (resolution: number) => {
      let aspect = glc.drawingBufferWidth / glc.drawingBufferHeight;
      if (aspect < 1) aspect = 1 / aspect;
      const min = Math.round(resolution);
      const max = Math.round(resolution * aspect);
      return glc.drawingBufferWidth > glc.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
    };

    let dye: DoubleFBO;
    let velocity: DoubleFBO;
    let divergence: FBO;
    let curl: FBO;
    let pressure: DoubleFBO;

    const initFramebuffers = () => {
      const simRes = getResolution(config.SIM_RESOLUTION);
      const dyeRes = getResolution(config.DYE_RESOLUTION);
      dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba!.internalFormat, rgba!.format, texType, filtering);
      velocity = createDoubleFBO(simRes.width, simRes.height, rg!.internalFormat, rg!.format, texType, filtering);
      divergence = createFBO(simRes.width, simRes.height, r!.internalFormat, r!.format, texType, glc.NEAREST);
      curl = createFBO(simRes.width, simRes.height, r!.internalFormat, r!.format, texType, glc.NEAREST);
      pressure = createDoubleFBO(simRes.width, simRes.height, r!.internalFormat, r!.format, texType, glc.NEAREST);
    };

    const resizeCanvas = () => {
      const w = Math.floor(window.innerWidth * Math.min(window.devicePixelRatio, 2));
      const h = Math.floor(window.innerHeight * Math.min(window.devicePixelRatio, 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        return true;
      }
      return false;
    };
    resizeCanvas();
    initFramebuffers();

    // ---- theme colours ----
    let palette: [number, number, number][] = [
      [139, 92, 246],
      [59, 130, 246],
      [6, 182, 212],
    ];
    const readPalette = () => {
      const s = getComputedStyle(document.documentElement);
      const parse = (v: string): [number, number, number] | null => {
        const n = v.trim().split(/[\s,]+/).map(Number);
        return n.length === 3 && n.every((x) => !Number.isNaN(x)) ? [n[0], n[1], n[2]] : null;
      };
      const p = parse(s.getPropertyValue("--primary-rgb"));
      const se = parse(s.getPropertyValue("--secondary-rgb"));
      const g = parse(s.getPropertyValue("--glow-rgb"));
      if (p && se && g) palette = [p, se, g];
    };
    readPalette();
    const paletteObs = new MutationObserver(readPalette);
    paletteObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent", "data-mode"] });

    // ---- pointer ----
    type Pointer = { x: number; y: number; dx: number; dy: number; down: boolean; moved: boolean };
    const pointer: Pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false };
    const splatStack: { x: number; y: number; dx: number; dy: number; color: [number, number, number] }[] = [];

    const nextColor = (intensity = 1) => {
      const c = palette[Math.floor(Math.random() * palette.length)];
      const k = config.DYE_INTENSITY * intensity;
      return [(c[0] / 255) * k, (c[1] / 255) * k, (c[2] / 255) * k] as [number, number, number];
    };
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      pointer.dx = (x - pointer.x) * 5;
      pointer.dy = (y - pointer.y) * 5;
      pointer.x = x;
      pointer.y = y;
      pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    };
    const onDown = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight;
      // small, subtle click ripple
      for (let i = 0; i < 3; i++) {
        splatStack.push({ x, y, dx: (Math.random() - 0.5) * 220, dy: (Math.random() - 0.5) * 220, color: nextColor(0.8) });
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });

    // ---- scroll-driven splats (mobile / touch) ----
    // A finger drag already fires pointermove, but momentum scrolling doesn't,
    // so on touch devices we also emit smoke from scroll velocity, at the last
    // touch x. Passive listener → never blocks or lags the scroll itself.
    let lastScrollY = window.scrollY;
    let lastScrollT = performance.now();
    const onScroll = () => {
      if (!coarse) return; // desktop already has the pointer-driven fluid
      const now = performance.now();
      const dtMs = Math.max(now - lastScrollT, 1);
      const dyPx = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      lastScrollT = now;
      const vel = dyPx / dtMs; // px per ms (signed)
      if (Math.abs(vel) < 0.15) return;
      const x = pointer.x || 0.5;
      const y = pointer.y || 0.5;
      // inject vertical velocity opposite to the scroll (smoke trails the motion)
      const force = Math.max(-1, Math.min(1, vel * 0.05)) * 3200;
      splatStack.push({ x, y, dx: 0, dy: force, color: nextColor(1) });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      if (resizeCanvas()) initFramebuffers();
    };
    window.addEventListener("resize", onResize);

    // ---- program runner ----
    const bindProgram = (p: { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }) => glc.useProgram(p.program);

    const splat = (x: number, y: number, dx: number, dy: number, color: [number, number, number]) => {
      bindProgram(splatProg);
      glc.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0));
      glc.uniform1f(splatProg.uniforms.aspectRatio, canvas.width / canvas.height);
      glc.uniform2f(splatProg.uniforms.point, x, y);
      glc.uniform3f(splatProg.uniforms.color, dx, dy, 0);
      glc.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS / 100);
      blit(velocity.write);
      velocity.swap();

      glc.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0));
      glc.uniform3f(splatProg.uniforms.color, color[0], color[1], color[2]);
      blit(dye.write);
      dye.swap();
    };

    let lastTime = performance.now();
    let raf = 0;

    const step = (dt: number) => {
      glc.disable(glc.BLEND);

      bindProgram(curlProg);
      glc.uniform2f(curlProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);

      bindProgram(vorticityProg);
      glc.uniform2f(vorticityProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(vorticityProg.uniforms.uVelocity, velocity.read.attach(0));
      glc.uniform1i(vorticityProg.uniforms.uCurl, curl.attach(1));
      glc.uniform1f(vorticityProg.uniforms.curl, config.CURL);
      glc.uniform1f(vorticityProg.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();

      bindProgram(divergenceProg);
      glc.uniform2f(divergenceProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);

      bindProgram(clearProg);
      glc.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0));
      glc.uniform1f(clearProg.uniforms.value, config.PRESSURE);
      blit(pressure.write);
      pressure.swap();

      bindProgram(pressureProg);
      glc.uniform2f(pressureProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(pressureProg.uniforms.uDivergence, divergence.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        glc.uniform1i(pressureProg.uniforms.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      bindProgram(gradientProg);
      glc.uniform2f(gradientProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(gradientProg.uniforms.uPressure, pressure.read.attach(0));
      glc.uniform1i(gradientProg.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      bindProgram(advectionProg);
      glc.uniform2f(advectionProg.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform2f(advectionProg.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      glc.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0));
      glc.uniform1i(advectionProg.uniforms.uSource, velocity.read.attach(0));
      glc.uniform1f(advectionProg.uniforms.dt, dt);
      glc.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      glc.uniform2f(advectionProg.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      glc.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0));
      glc.uniform1i(advectionProg.uniforms.uSource, dye.read.attach(1));
      glc.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();
    };

    const render = () => {
      glc.enable(glc.BLEND);
      glc.blendFunc(glc.ONE, glc.ONE_MINUS_SRC_ALPHA);
      bindProgram(displayProg);
      glc.uniform1i(displayProg.uniforms.uTexture, dye.read.attach(0));
      glc.uniform1f(displayProg.uniforms.opacity, config.DISPLAY_OPACITY);
      blit(null);
    };

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.016666);
      lastTime = now;

      while (splatStack.length) {
        const s = splatStack.pop()!;
        splat(s.x, s.y, s.dx, s.dy, s.color);
      }
      if (pointer.moved) {
        pointer.moved = false;
        // Inject velocity OPPOSITE to the cursor's movement so the smoke billows
        // out behind the cursor (trails away from the direction of travel).
        splat(pointer.x, pointer.y, -pointer.dx * config.SPLAT_FORCE, -pointer.dy * config.SPLAT_FORCE, nextColor(1));
      }

      step(dt);
      // clear the screen (transparent) then draw dye with alpha
      glc.bindFramebuffer(glc.FRAMEBUFFER, null);
      glc.viewport(0, 0, glc.drawingBufferWidth, glc.drawingBufferHeight);
      glc.clearColor(0, 0, 0, 0);
      glc.clear(glc.COLOR_BUFFER_BIT);
      render();

      raf = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        lastTime = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Success: tell CursorFX to suppress its own canvas trail.
    document.documentElement.dataset.fluid = "on";
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      paletteObs.disconnect();
      delete document.documentElement.dataset.fluid;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    // Rendered OVER the page (like the reference Splash Cursor); pointer-events
    // stay off so clicks pass through. The cursor dot sits just above at z-9999.
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 9998 }}
      aria-hidden
    />
  );
}
