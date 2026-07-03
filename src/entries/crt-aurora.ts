/**
 * crt-aurora — CRT scanline + aurora background. Loaded with `defer` only on
 * the home page via layouts/partials/extra-head.html.
 */
import { auroraColumn } from "../lib/spectrum.js";

(function () {
  "use strict";

  const canvas = document.getElementById("crt-aurora") as HTMLCanvasElement | null;
  if (!canvas) return;

  // willReadFrequently hints the browser to keep the backing store on the CPU,
  // which speeds up the per-frame getImageData/putImageData glitch effect.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  let W = 0;
  let H = 0;
  let t = 0;
  let raf: number | null = null;
  let lastTime: number | null = null;

  // Cursor rings and click ripples are handled globally by cursor-fx.

  // ── Aurora bands ──────────────────────────────────────────────────────────
  interface Band {
    speed: number;
    xSpeed: number;
    yFrac: number;
    amp: number;
    offset: number;
  }

  const BANDS: Band[] = [
    { speed: 0.26, xSpeed: 1.1, yFrac: 0.1, amp: 0.06, offset: Math.random() },
    { speed: 0.18, xSpeed: 0.8, yFrac: 0.37, amp: 0.05, offset: Math.random() },
    { speed: 0.22, xSpeed: 1.3, yFrac: 0.63, amp: 0.07, offset: Math.random() },
    { speed: 0.21, xSpeed: 0.9, yFrac: 0.88, amp: 0.06, offset: Math.random() },
  ];

  function drawAurora(): void {
    const segments = 14;
    const bandH = H * 0.36;

    ctx!.globalCompositeOperation = "screen";
    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b];
      const centreY = H * (band.yFrac + Math.sin(t * band.speed * 0.7 + b * 2.3) * band.amp);
      const top = centreY - bandH / 2;
      const bottom = top + bandH;

      // Horizontal colour gradient — one strip per segment column.
      for (let s = 0; s < segments; s++) {
        const x0 = (s / segments) * W;
        const x1 = ((s + 1) / segments) * W;
        const xMid = (s + 0.5) / segments;
        const col = auroraColumn(xMid, band.xSpeed, band.offset, t);

        // Vertical fade: transparent → full at centre → transparent.
        const vGrad = ctx!.createLinearGradient(0, top, 0, bottom);
        vGrad.addColorStop(0, col.edge);
        vGrad.addColorStop(0.35, col.peak);
        vGrad.addColorStop(0.65, col.peak);
        vGrad.addColorStop(1, col.edge);

        ctx!.fillStyle = vGrad;
        ctx!.fillRect(x0, top, x1 - x0, bandH);
      }
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  // ── Scanlines ─────────────────────────────────────────────────────────────
  // The scanline stripes are static (a 1px dark row every 3px), so we bake a
  // 1×3 tile once and paint it as a repeating pattern each frame — one fill
  // instead of ~H/3 individual fillRect calls.
  let scanlinePattern: CanvasPattern | null = null;

  function buildScanlinePattern(): void {
    const tile = document.createElement("canvas");
    tile.width = 1;
    tile.height = 3;
    const tctx = tile.getContext("2d");
    if (!tctx) return;
    tctx.fillStyle = "rgba(0,0,0,0.55)";
    tctx.fillRect(0, 0, 1, 1); // dark row; rows 1–2 stay transparent
    scanlinePattern = ctx!.createPattern(tile, "repeat");
  }

  function drawScanlines(): void {
    // multiply darkens only the stripe rows, preserving the colour underneath
    if (scanlinePattern) {
      ctx!.globalCompositeOperation = "multiply";
      ctx!.fillStyle = scanlinePattern;
      ctx!.fillRect(0, 0, W, H);
      ctx!.globalCompositeOperation = "source-over";
    }

    // Slow vertical roll — a faint lighter band drifting downward.
    const rollY = ((t * 38) % (H + 100)) - 50;
    const rollGrad = ctx!.createLinearGradient(0, rollY, 0, rollY + 100);
    rollGrad.addColorStop(0, "rgba(255,255,255,0)");
    rollGrad.addColorStop(0.5, "rgba(255,255,255,0.015)");
    rollGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx!.fillStyle = rollGrad;
    ctx!.fillRect(0, rollY, W, 100);
  }

  // ── Horizontal glitch ─────────────────────────────────────────────────────
  let glitchCooldown = 4;

  function maybeGlitch(dt: number): void {
    glitchCooldown -= dt;
    if (glitchCooldown > 0) return;
    glitchCooldown = 3.5 + Math.random() * 5;

    const lineY = Math.floor(Math.random() * H);
    const lineH = Math.floor(Math.random() * 2) + 1;
    const shift = (Math.random() - 0.5) * 16;

    try {
      const slice = ctx!.getImageData(0, lineY, W, lineH);
      ctx!.putImageData(slice, shift, lineY);
    } catch {
      /* ignore cross-origin errors */
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize(): void {
    W = canvas!.width = window.innerWidth;
    H = canvas!.height = window.innerHeight;
  }

  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Main loop ─────────────────────────────────────────────────────────────
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    ctx!.clearRect(0, 0, W, H);

    // Base background — matches $dark-background in _variables.scss.
    ctx!.fillStyle = "#15202b";
    ctx!.fillRect(0, 0, W, H);

    drawAurora();
    drawScanlines();
    maybeGlitch(dt);
  }

  // ── Visibility — pause when tab is hidden ─────────────────────────────────
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (raf !== null) cancelAnimationFrame(raf);
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(loop);
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  resize();
  buildScanlinePattern();
  requestAnimationFrame(loop);
})();
