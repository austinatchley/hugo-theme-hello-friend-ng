/**
 * crt-aurora — CRT scanline + aurora background. Loaded with `defer` only on
 * the home page via layouts/partials/extra-head.html.
 */
import { auroraColumn } from "../lib/spectrum.js";
import { FrameMeter, perfHudEnabled, formatStats } from "../lib/perf.js";

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
  let frameCount = 0;

  // Cursor rings and click ripples are handled globally by cursor-fx.

  // ── Configuration ────────────────────────────────────────────────────────────
  // All tunable knobs in one place. Override via URL params if needed:
  //   ?bands=4&segments=16&bandHeight=0.55&noiseOpacity=0.03
  interface AuroraConfig {
    bands: Band[];
    segments: number;
    bandHeight: number;      // fraction of screen height
    yJitterAmp: number;      // sine amplitude for band y-position wobble
    yJitterSpeed: number;    // sine speed for y-jitter
    segmentJitterAmp: number; // sine amplitude for segment boundary wobble
    segmentJitterSpeed: number; // sine speed for segment jitter
    noiseOpacity: number;     // global noise overlay opacity
    noiseTileSize: number;    // noise texture size (square)
    scanlineOpacity: number;  // scanline darkness
    scanlineSpacing: number;  // pixels between scanlines
    rollSpeed: number;        // vertical roll drift rate
    rollHeight: number;       // roll gradient height in px
    glitchCooldownMin: number;
    glitchCooldownMax: number;
    glitchShiftMax: number;
    glitchHeightMax: number;
    backgroundColor: string;
  }

  // Default band definitions (phaseOffsets randomized on init)
  const DEFAULT_BANDS: Omit<Band, "offset" | "phaseOffset">[] = [
    { speed: 0.26, xSpeed: 1.6, yFrac: 0.08, amp: 0.06 },
    { speed: 0.18, xSpeed: 1.2, yFrac: 0.26, amp: 0.05 },
    { speed: 0.22, xSpeed: 1.9, yFrac: 0.44, amp: 0.07 },
    { speed: 0.21, xSpeed: 1.4, yFrac: 0.62, amp: 0.06 },
    { speed: 0.24, xSpeed: 1.8, yFrac: 0.80, amp: 0.05 },
    { speed: 0.19, xSpeed: 1.0, yFrac: 0.92, amp: 0.04 },
  ];

  const AURORA_STORAGE_KEY = "aurora_state";

  // ── Quality tier ─────────────────────────────────────────────────────────────
  // Determined by: ?quality=low|medium|high URL param (highest priority),
  // then prefers-reduced-motion media query, then default 'high'.
  type Quality = "high" | "medium" | "low";

  function detectQuality(): Quality {
    try {
      const q = new URLSearchParams(location.search).get("quality");
      if (q === "low" || q === "medium" || q === "high") return q;
    } catch { /* ignore */ }

    try {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "low";
    } catch { /* ignore */ }

    return "high";
  }

  const QUALITY = detectQuality();

  // Quality presets: [bandCount, segments, noise, scanlines, glitch, dither]
  const QUALITY_PRESETS: Record<Quality, {
    bandCount: number;
    segments: number;
    noiseEnabled: boolean;
    scanlinesEnabled: boolean;
    glitchEnabled: boolean;
    ditherEnabled: boolean;
  }> = {
    high:   { bandCount: 6, segments: 20, noiseEnabled: true,  scanlinesEnabled: true, glitchEnabled: true, ditherEnabled: true },
    medium: { bandCount: 4, segments: 14, noiseEnabled: false, scanlinesEnabled: true, glitchEnabled: true, ditherEnabled: true },
    low:    { bandCount: 2, segments: 10, noiseEnabled: false, scanlinesEnabled: false, glitchEnabled: false, ditherEnabled: true },
  };

  // Build config with URL param overrides
  function buildConfig(): AuroraConfig {
    const params = new URLSearchParams(location.search);
    const getFloat = (key: string, fallback: number) => {
      const v = params.get(key);
      return v !== null ? parseFloat(v) : fallback;
    };
    const getInt = (key: string, fallback: number) => {
      const v = params.get(key);
      return v !== null ? parseInt(v, 10) : fallback;
    };
    const getStr = (key: string, fallback: string) => params.get(key) ?? fallback;

    // Offsets are set later (restore or randomize)
    const bands: Band[] = DEFAULT_BANDS.map(b => ({ ...b, offset: 0, phaseOffset: 0 }));

    return {
      bands,
      segments: getInt("segments", QUALITY_PRESETS[QUALITY].segments),
      bandHeight: getFloat("bandHeight", 0.6),
      yJitterAmp: getFloat("yJitterAmp", 0.02),
      yJitterSpeed: getFloat("yJitterSpeed", 0.43),
      segmentJitterAmp: getFloat("segmentJitterAmp", 0.04),
      segmentJitterSpeed: getFloat("segmentJitterSpeed", 0.6),
      noiseOpacity: getFloat("noiseOpacity", 0.08),
      noiseTileSize: getInt("noiseTileSize", 256),
      scanlineOpacity: getFloat("scanlineOpacity", 0.55),
      scanlineSpacing: getInt("scanlineSpacing", 3),
      rollSpeed: getFloat("rollSpeed", 38),
      rollHeight: getInt("rollHeight", 100),
      glitchCooldownMin: getFloat("glitchCooldownMin", 3.5),
      glitchCooldownMax: getFloat("glitchCooldownMax", 5),
      glitchShiftMax: getFloat("glitchShiftMax", 16),
      glitchHeightMax: getInt("glitchHeightMax", 2),
      backgroundColor: getStr("bgColor", "#15202b"),
    };
  }

  const CFG = buildConfig();
  let QP = { ...QUALITY_PRESETS[QUALITY] };
  let currentQuality: Quality = QUALITY;
  const QUALITY_ORDER: Quality[] = ["high", "medium", "low"];

  // Downgrade quality if p95 frame time exceeds threshold for 120 consecutive
  // frames. Monitored once per second (~60 frames at 60fps).
  function checkFrameBudget(): void {
    if (currentQuality === "low") return;
    const s = meter.stats();
    if (!s || s.count < 60) return;
    const threshold = currentQuality === "high" ? 16 : 20;
    if (s.p95 > threshold) {
      const idx = QUALITY_ORDER.indexOf(currentQuality);
      if (idx < QUALITY_ORDER.length - 1) {
        currentQuality = QUALITY_ORDER[idx + 1];
        QP = { ...QUALITY_PRESETS[currentQuality] };
      }
    }
  }

  // ── State persistence ────────────────────────────────────────────────────────
  // Save band offsets and current time so the animation is seamless across page
  // navigations. Cleared on full page reload (Cmd+R / F5).
  function restoreAuroraState(): void {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav && nav.type === "reload") {
        localStorage.removeItem(AURORA_STORAGE_KEY);
        randomizeOffsets();
        return;
      }
    } catch {
      /* navigation API not available */
    }

    const saved = localStorage.getItem(AURORA_STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved) as { offsets: number[]; phaseOffsets: number[]; time: number };
        const offsets = state.offsets;
        const phaseOffsets = state.phaseOffsets;
        for (let i = 0; i < CFG.bands.length && i < offsets.length; i++) {
          CFG.bands[i].offset = offsets[i];
        }
        for (let i = 0; i < CFG.bands.length && i < phaseOffsets.length; i++) {
          CFG.bands[i].phaseOffset = phaseOffsets[i];
        }
        t = state.time || 0;
        return;
      } catch {
        /* corrupt state */
        localStorage.removeItem(AURORA_STORAGE_KEY);
      }
    }

    randomizeOffsets();
  }

  function randomizeOffsets(): void {
    for (const band of CFG.bands) {
      band.offset = Math.random();
      band.phaseOffset = Math.random() * Math.PI * 2;
    }
  }

  function saveAuroraState(): void {
    try {
      const state = {
        offsets: CFG.bands.map(b => b.offset),
        phaseOffsets: CFG.bands.map(b => b.phaseOffset),
        time: t,
      };
      localStorage.setItem(AURORA_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }

  // ── Aurora bands ──────────────────────────────────────────────────────────
  interface Band {
    speed: number;
    xSpeed: number;
    yFrac: number;
    amp: number;
    offset: number;
    phaseOffset: number;
  }

  const BANDS = CFG.bands;

  // ── Gradient cache ─────────────────────────────────────────────────────────
  // Vertical mask gradients are reused when band y-position hasn't moved >1px.
  // Cleared on resize (when H changes).
  const vGradCache: { top: number; gradient: CanvasGradient }[] = [];
  for (let i = 0; i < BANDS.length; i++) {
    vGradCache.push({ top: -9999, gradient: ctx!.createLinearGradient(0, 0, 0, 1) });
  }

  function drawAurora(c: CanvasRenderingContext2D): void {
    const segments = QP.segments;
    const bandCount = Math.min(QP.bandCount, BANDS.length);
    const bandH = H * CFG.bandHeight;

    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 0.69;
    for (let b = 0; b < bandCount; b++) {
      const band = BANDS[b];

        // Y-jitter: slow sine wobble so seams aren't static straight lines.
      const yJitter = Math.sin(t * CFG.yJitterSpeed + band.phaseOffset) * CFG.yJitterAmp;
      const centreY = H * (band.yFrac + yJitter + Math.sin(t * band.speed * 0.7 + band.phaseOffset * 1.353) * band.amp);
      const top = centreY - bandH / 2;
      const bottom = top + bandH;

      // Horizontal gradient with jittered segment boundaries so vertical colour
      // edges are wavy instead of straight.
      const stops: { pos: number; col: string }[] = [];
      for (let s = 0; s < segments; s++) {
        const base = s / segments;
        const jitter = Math.sin(t * CFG.segmentJitterSpeed + s * 1.1 + band.phaseOffset * 0.692) * CFG.segmentJitterAmp;
        const pos = Math.max(0, Math.min(1, base + jitter));
        const xMid = (pos + (s + 0.5) / segments) / 2;
        const col = auroraColumn(xMid, band.xSpeed, band.offset, t);
        stops.push({ pos, col: col.peak });
      }
      // Final stop at 1
      stops.push({ pos: 1, col: auroraColumn(1, band.xSpeed, band.offset, t).peak });

      const hGrad = c.createLinearGradient(0, top, W, top);
      for (const st of stops) {
        hGrad.addColorStop(st.pos, st.col);
      }

      // Vertical fade mask (positioned at the band so the fade is centred on it).
      // Cached per-band — rebuilt only when top moves by more than 1px.
      const cached = vGradCache[b];
      let vGrad: CanvasGradient;
      if (Math.abs(cached.top - top) > 1) {
        vGrad = c.createLinearGradient(0, top, 0, bottom);
        vGrad.addColorStop(0, "rgba(255,255,255,0)");
        vGrad.addColorStop(0.3, "rgba(255,255,255,1)");
        vGrad.addColorStop(0.7, "rgba(255,255,255,1)");
        vGrad.addColorStop(1, "rgba(255,255,255,0)");
        cached.top = top;
        cached.gradient = vGrad;
      } else {
        vGrad = cached.gradient;
      }

      // Clip to band area so destination-in doesn't leak into background or
      // adjacent bands. Top and bottom edges have a sine wave to break up the
      // straight horizontal fade lines.
      const waveAmp = bandH * 0.048;
      const waveFreq = 0.002;
      const wavePhase = t * 0.3 + band.phaseOffset;
      const steps = Math.ceil(W / 8);
      c.save();
      c.beginPath();
      c.moveTo(0, top + Math.sin(0 + wavePhase) * waveAmp);
      for (let i = 1; i <= steps; i++) {
        const x = (i / steps) * W;
        const wave = Math.sin(x * waveFreq + wavePhase) * waveAmp;
        c.lineTo(x, top + wave);
      }
      for (let i = steps; i >= 0; i--) {
        const x = (i / steps) * W;
        const wave = Math.sin(x * waveFreq + wavePhase) * waveAmp;
        c.lineTo(x, bottom + wave);
      }
      c.closePath();
      c.clip();

      c.fillStyle = hGrad;
      c.fillRect(0, top, W, bandH);

      c.globalCompositeOperation = "destination-in";
      c.fillStyle = vGrad;
      c.fillRect(0, top, W, bandH);

      c.restore();
    }
    c.globalAlpha = 1;
  }

  // ── Noise overlay (CSS) ─────────────────────────────────────────────────────
  // A fixed div with a pre-generated noise PNG as background-image, composited
  // by the browser's GPU layer. Zero per-frame JS cost.
  function injectNoiseOverlay(): void {
    if (!QP.noiseEnabled) return;
    // Generate noise PNG once as a base64 data URL
    const nc = document.createElement("canvas");
    const nw = CFG.noiseTileSize;
    const nh = CFG.noiseTileSize;
    nc.width = nw;
    nc.height = nh;
    const nctx = nc.getContext("2d")!;
    const img = nctx.createImageData(nw, nh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 30 + Math.random() * 40;
    }
    nctx.putImageData(img, 0, 0);
    const dataUrl = nc.toDataURL("image/png");

    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;inset:0;z-index:900;pointer-events:none;" +
      "background-image:url('" + dataUrl + "');" +
      "background-repeat:repeat;" +
      "background-size:" + nw + "px " + nh + "px;" +
      "opacity:" + CFG.noiseOpacity + ";" +
      "mix-blend-mode:overlay;";
    document.body.appendChild(div);
  }

  // ── Scanlines ─────────────────────────────────────────────────────────────
  // The scanline stripes are static (a 1px dark row every 3px). Two strategies:
  //   "pattern" — bake a 1×3 tile once, paint one repeating-pattern fill/frame.
  //   "rows"    — the original: one thin fillRect per stripe row.
  // On a CPU-backed canvas (willReadFrequently) the pattern fill touches every
  // pixel while "rows" touches only 1/3 of them, so "rows" can be faster there.
  // Selectable via ?scanlines=rows|pattern for live A/B measurement.
  let scanlineMode: "pattern" | "rows" = "rows";
  try {
    const m = new URLSearchParams(location.search).get("scanlines");
    if (m === "rows" || m === "pattern") scanlineMode = m;
  } catch {
    /* ignore */
  }

  let scanlinePattern: CanvasPattern | null = null;

  function buildScanlinePattern(c: CanvasRenderingContext2D): void {
    const tile = document.createElement("canvas");
    tile.width = 1;
    tile.height = CFG.scanlineSpacing;
    const tctx = tile.getContext("2d");
    if (!tctx) return;
    tctx.fillStyle = "rgba(0,0,0," + CFG.scanlineOpacity + ")";
    tctx.fillRect(0, 0, 1, 1); // dark row; remaining rows stay transparent
    scanlinePattern = c.createPattern(tile, "repeat");
  }

  function drawScanlines(c: CanvasRenderingContext2D): void {
    // multiply darkens only the stripe rows, preserving the colour underneath
    c.globalCompositeOperation = "multiply";
    if (scanlineMode === "pattern" && scanlinePattern) {
      c.fillStyle = scanlinePattern;
      c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = "rgba(0,0,0," + CFG.scanlineOpacity + ")";
      for (let y = 0; y < H; y += CFG.scanlineSpacing) {
        c.fillRect(0, y, W, 1);
      }
    }
    c.globalCompositeOperation = "source-over";

    // Slow vertical roll — a faint lighter band drifting downward.
    const rollY = ((t * CFG.rollSpeed) % (H + 100)) - 50;
    const rollGrad = c.createLinearGradient(0, rollY, 0, rollY + CFG.rollHeight);
    rollGrad.addColorStop(0, "rgba(255,255,255,0)");
    rollGrad.addColorStop(0.5, "rgba(255,255,255,0.015)");
    rollGrad.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rollGrad;
    c.fillRect(0, rollY, W, CFG.rollHeight);
  }

  // ── Ordered dithering (8-bit 3-3-2 Bayer) ─────────────────────────────────
  const BAYER4 = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5],
  ];

  function drawDither(): void {
    const data = ctx!.getImageData(0, 0, W, H);
    const d = data.data;
    for (let y = 0; y < H; y++) {
      const by = y & 3;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const th = (BAYER4[by][x & 3] + 0.5) / 16;

        // R — 3 bits (8 levels, step 32)
        const r = d[i];
        let rq = (r / 32) | 0;
        if (r % 32 / 32 > th) rq = Math.min(rq + 1, 7);
        d[i] = rq * 32;

        // G — 3 bits (8 levels)
        const g = d[i + 1];
        let gq = (g / 32) | 0;
        if (g % 32 / 32 > th) gq = Math.min(gq + 1, 7);
        d[i + 1] = gq * 32;

        // B — 2 bits (4 levels, step 64)
        const b = d[i + 2];
        let bq = (b / 64) | 0;
        if (b % 64 / 64 > th) bq = Math.min(bq + 1, 3);
        d[i + 2] = bq * 64;
      }
    }
    ctx!.putImageData(data, 0, 0);
  }

  // ── Horizontal glitch ─────────────────────────────────────────────────────
  let glitchCooldown = 4;

  function maybeGlitch(dt: number): void {
    glitchCooldown -= dt;
    if (glitchCooldown > 0) return;
    glitchCooldown = CFG.glitchCooldownMin + Math.random() * (CFG.glitchCooldownMax - CFG.glitchCooldownMin);

    const lineY = Math.floor(Math.random() * H);
    const lineH = Math.floor(Math.random() * CFG.glitchHeightMax) + 1;
    const shift = (Math.random() - 0.5) * CFG.glitchShiftMax;

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
    // Invalidate cached gradients — bandH (H * CFG.bandHeight) changed.
    for (const c of vGradCache) c.top = -9999;
  }

  let resizeTimer: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Perf HUD (opt-in) ──────────────────────────────────────────────────────
  const meter = new FrameMeter();
  const hudOn = perfHudEnabled();
  let hud: HTMLDivElement | null = null;
  let hudCooldown = 0;

  if (hudOn) {
    hud = document.createElement("div");
    hud.id = "aurora-perf-hud";
    hud.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:100000;font:12px/1.4 monospace;" +
      "color:#0f0;background:rgba(0,0,0,0.7);padding:6px 8px;white-space:pre;" +
      "pointer-events:none;border-radius:4px;";
    document.body.appendChild(hud);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;
    frameCount++;

    const workStart = performance.now();

    // Throttle aurora to 30fps (every other vblank) so cursor-fx gets more
    // main-thread time. On skip frames we leave the previous frame's pixels in
    // place — only the glitch still runs.
    if (frameCount % 2 === 0) {
      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = CFG.backgroundColor;
      ctx!.fillRect(0, 0, W, H);
      drawAurora(ctx!);
      if (QP.scanlinesEnabled) drawScanlines(ctx!);
    }
    if (QP.ditherEnabled) drawDither();
    if (QP.glitchEnabled) maybeGlitch(dt);

    meter.record(performance.now() - workStart);

    // Check frame budget every ~60 frames (roughly once per second)
    if (frameCount % 60 === 0) checkFrameBudget();

    if (hudOn && hud) {
      hudCooldown -= dt;
      if (hudCooldown <= 0) {
        hudCooldown = 0.25; // refresh HUD text ~4×/sec
        const s = meter.stats();
        if (s) {
          hud.textContent =
            formatStats("aurora[" + scanlineMode + "]", s) +
            "\nsamples " + s.count + "  " + W + "×" + H;
        }
      }
    }
  }

  // ── Visibility — save state on navigate-away, pause when tab hidden ────────
  // pagehide fires on navigation (not just tab switch), which is when we
  // want to persist state so the next page load can restore it.
  window.addEventListener("pagehide", saveAuroraState);

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
  restoreAuroraState();
  injectNoiseOverlay();
  buildScanlinePattern(ctx!);
  requestAnimationFrame(loop);

  // Expose for Playwright perf harness (machine-readable JSON, not DOM text).
  window.__auroraMeter = meter;
  window.__scanlineMode = scanlineMode;
  window.__resetAuroraMeter = () => meter.reset();
})();
