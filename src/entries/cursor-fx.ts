/**
 * cursor-fx — cursor halo lighting + click ripples. Loads on all pages.
 */
import { clamp, lerp } from "../lib/math.js";
import {
  type Ripple,
  pushRipple,
  rippleStyle,
} from "../lib/rings.js";

(function () {
  "use strict";

  // ── Halo div (CSS radial gradient, mix-blend-mode: hard-light) ────────────
  const halo = document.createElement("div");
  halo.id = "cursor-halo";
  // Start off-screen so it does not flash at the top-left corner on load.
  halo.style.transform = "translate(-9999px,-9999px)";
  document.body.appendChild(halo);

  // ── Overlay canvas (click ripples) ─────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.id = "cursor-fx";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.style.opacity = "0";

  let W = 0;
  let H = 0;

  function resize(): void {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();

  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 40);
  });

  // ── Mouse tracking ────────────────────────────────────────────────────────
  let mx = -9999;
  let my = -9999;
  let hx = -9999; // lerped halo position
  let hy = -9999;

  // The halo is allowed to dim at rest but NEVER fades to zero — while the
  // pointer is over the page it always leaves a faint glow on the cursor.
  // Opacity transitions use the same ADSR idea as the chase: it rises fast
  // while chasing (attack) and decays slowly into the resting glow once
  // settled (decay), easing each frame instead of snapping.
  const HALO_MOVE_OPACITY = 1;
  const HALO_REST_OPACITY = 0.5;
  const HALO_OPACITY_ATTACK = 0.5; // per-frame lerp while opacity rising
  const HALO_OPACITY_DECAY = 0.05; // per-frame lerp while dimming to rest
  let haloOpacity = HALO_MOVE_OPACITY;

  function hideHalo(): void {
    halo.style.transform = "translate(-9999px,-9999px)";
  }

  // Envelope for the halo chase — synth ADSR style.
  // Far from the cursor the halo attacks hard and pounces; inside the
  // attack distance it eases off into a slower decay settle so it trails
  // gently into place instead of gliding at one constant speed.
  const HALO_ATTACK = 0.5; // per-frame lerp while chasing (far from cursor)
  const HALO_DECAY = 0.25; // per-frame lerp while settling (near cursor)
  const HALO_ATTACK_DIST = 120; // px cursor must be behind halo for "attack"

  window.addEventListener("pointermove", function (e) {
    if (mx === -9999) {
      hx = e.clientX;
      hy = e.clientY;
    }
    mx = e.clientX;
    my = e.clientY;
    canvas.style.opacity = "0.5";
    ensureRunning();
  });

  window.addEventListener("pointerleave", function () {
    mx = -9999;
    my = -9999;
    hideHalo();
    canvas.style.opacity = "0";
  });

  // ── Click ripples ─────────────────────────────────────────────────────────
  const ripples: Ripple[] = [];

  window.addEventListener("click", function (e) {
    pushRipple(ripples, e.clientX, e.clientY, t);
    canvas.style.opacity = "0.5";
    ensureRunning();
  });

  // ── Time ──────────────────────────────────────────────────────────────────
  let t = 0;
  let lastTime: number | null = null;
  let raf: number | null = null;

  // Park the rAF loop entirely when nothing needs drawing: the halo has
  // converged on the cursor, its opacity has decayed to the resting glow,
  // and no ripples are in flight. Restarted on the next pointermove/click.
  // Zero per-frame cost while idle instead of a 60fps loop drawing nothing.
  function isIdle(): boolean {
    return (
      mx === -9999 ||
      (Math.abs(mx - hx) < 0.5 &&
        Math.abs(my - hy) < 0.5 &&
        ripples.length === 0 &&
        Math.abs(haloOpacity - HALO_REST_OPACITY) < 0.01)
    );
  }

  function ensureRunning(): void {
    if (raf === null) {
      lastTime = null;
      raf = requestAnimationFrame(draw);
    }
  }

  function draw(now: number): void {
    raf = requestAnimationFrame(draw);
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    // Lerp halo div toward the cursor with an ADSR chase envelope, and fade
    // the opacity with its own attack/decay rates.
    if (mx !== -9999) {
      const dist = Math.hypot(mx - hx, my - hy);
      const k = lerp(
        HALO_DECAY,
        HALO_ATTACK,
        clamp(dist / HALO_ATTACK_DIST, 0, 1),
      );
      hx = lerp(hx, mx, k);
      hy = lerp(hy, my, k);
      halo.style.transform =
        "translate(" + (hx - 150) + "px," + (hy - 150) + "px)";

      // While still chasing, opacity attacks up to full brightness. Once the
      // halo converges on the cursor it decays down to the resting glow.
      const settled = dist < 0.5;
      haloOpacity = lerp(
        haloOpacity,
        settled ? HALO_REST_OPACITY : HALO_MOVE_OPACITY,
        settled ? HALO_OPACITY_DECAY : HALO_OPACITY_ATTACK,
      );
      halo.style.opacity = String(haloOpacity);
    }

    if (isIdle()) {
      // Converged and the decay has finished — park the loop with the halo
      // left sitting at its resting glow (never hidden, never zero).
      raf = null;
      lastTime = null;
      canvas.style.opacity = "0";
      return;
    }

    ctx!.clearRect(0, 0, W, H);

    // Click ripples.
    for (let j = ripples.length - 1; j >= 0; j--) {
      const style = rippleStyle(ripples[j], t);
      if (style.expired) {
        ripples.splice(j, 1);
        continue;
      }
      ctx!.beginPath();
      ctx!.arc(ripples[j].x, ripples[j].y, style.radius, 0, Math.PI * 2);
      ctx!.strokeStyle = "hsla(185,75%,65%," + style.alpha + ")";
      ctx!.lineWidth = 1.5;
      ctx!.stroke();
    }
  }

  ensureRunning();

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      lastTime = null;
    } else {
      // draw() parks itself immediately if still idle, so it's safe to always
      // kick one frame here.
      raf = requestAnimationFrame(draw);
    }
  });
})();