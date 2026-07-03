/**
 * particles — magnetic particle field layered above the CRT aurora canvas.
 * Particles drift organically and scatter away from the cursor, snapping
 * back when it moves on. Loaded with `defer` only on the home page.
 */
import {
  type Particle,
  initParticles,
  drift,
  repel,
  stepParticle,
  particleStyle,
} from "../lib/particles-core.js";

(function () {
  "use strict";

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.id = "particle-field";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let W = 0;
  let H = 0;
  let particles: Particle[] = [];

  function resize(): void {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // Recalculate home positions so particles don't cluster at old coords.
    for (let i = 0; i < particles.length; i++) {
      particles[i].hx = Math.random() * W;
      particles[i].hy = Math.random() * H;
    }
  }

  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Mouse tracking ────────────────────────────────────────────────────────
  let mx = -9999;
  let my = -9999;

  window.addEventListener("mousemove", function (e) {
    mx = e.clientX;
    my = e.clientY;
  });

  // Intentionally no mouseleave handler — particles stay repelled from the
  // last known cursor position so they react to the rings even when the
  // mouse is still.

  // ── Draw loop ─────────────────────────────────────────────────────────────
  let t = 0;
  let lastTime: number | null = null;
  let raf: number | null = null;

  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    ctx!.clearRect(0, 0, W, H);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      const { driftX, driftY } = drift(p, t);
      const r = repel(p, driftX, driftY, mx, my);
      stepParticle(p, r);

      const style = particleStyle(p, r.proximity);

      // Radial gradient: gold pinpoint core → teal/blue body → transparent.
      const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, style.radius);
      grad.addColorStop(0, "hsla(48,100%,78%," + style.goldAlpha + ")");
      grad.addColorStop(
        0.35,
        "hsla(" + style.hue + "," + style.sat + "%," + style.lum + "%," + style.alpha + ")",
      );
      grad.addColorStop(
        1,
        "hsla(" + style.hue + "," + style.sat + "%," + style.lum + "%, 0)",
      );

      ctx!.beginPath();
      ctx!.arc(p.x, p.y, style.radius, 0, Math.PI * 2);
      ctx!.fillStyle = grad;
      ctx!.fill();
    }
  }

  // ── Visibility — pause when tab is hidden ─────────────────────────────────
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(loop);
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  // W/H must be set before initParticles so home positions are valid.
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  particles = initParticles(W, H);
  requestAnimationFrame(loop);
})();
