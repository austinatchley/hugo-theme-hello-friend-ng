/**
 * cursor-fx — cursor halo div + rings + click ripples. Loads on all pages.
 */
import { lerp } from "../lib/math.js";
import {
  RING_COUNT,
  ringStyle,
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

  // ── Overlay canvas (rings + click ripples) ────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.id = "cursor-fx";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  // How aggressively the halo chases the cursor each frame (0–1).
  const HALO_LERP = 0.31;

  window.addEventListener("pointermove", function (e) {
    if (mx === -9999) {
      hx = e.clientX;
      hy = e.clientY;
    }
    mx = e.clientX;
    my = e.clientY;
  });

  window.addEventListener("pointerleave", function () {
    mx = -9999;
    my = -9999;
    halo.style.transform = "translate(-9999px,-9999px)";
  });

  // ── Click ripples ─────────────────────────────────────────────────────────
  const ripples: Ripple[] = [];

  window.addEventListener("click", function (e) {
    pushRipple(ripples, e.clientX, e.clientY, t);
  });

  // ── Time ──────────────────────────────────────────────────────────────────
  let t = 0;
  let lastTime: number | null = null;
  let raf: number | null = null;

  function draw(now: number): void {
    raf = requestAnimationFrame(draw);
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    // Lerp halo div toward the cursor.
    if (mx !== -9999) {
      hx = lerp(hx, mx, HALO_LERP);
      hy = lerp(hy, my, HALO_LERP);
      halo.style.transform =
        "translate(" + (hx - 150) + "px," + (hy - 150) + "px)";
    }

    ctx!.clearRect(0, 0, W, H);

    // Cursor rings — gold near centre, teal as they expand.
    if (mx > 0) {
      for (let i = 0; i < RING_COUNT; i++) {
        const s = ringStyle(i, t);
        ctx!.beginPath();
        ctx!.arc(mx, my, s.radius, 0, Math.PI * 2);
        ctx!.strokeStyle =
          "hsla(" + s.hue + "," + s.sat + "%," + s.lum + "%," + s.alpha + ")";
        ctx!.lineWidth = 1.25;
        ctx!.stroke();
      }
    }

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

  requestAnimationFrame(draw);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(draw);
    }
  });
})();
