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

  // Default band definitions (offsets randomized on init)
  const DEFAULT_BANDS: Omit<Band, "offset">[] = [
    { speed: 0.26, xSpeed: 1.1, yFrac: 0.08, amp: 0.06 },
    { speed: 0.18, xSpeed: 0.8, yFrac: 0.26, amp: 0.05 },
    { speed: 0.22, xSpeed: 1.3, yFrac: 0.44, amp: 0.07 },
    { speed: 0.21, xSpeed: 0.9, yFrac: 0.62, amp: 0.06 },
    { speed: 0.24, xSpeed: 1.2, yFrac: 0.80, amp: 0.05 },
    { speed: 0.19, xSpeed: 0.7, yFrac: 0.92, amp: 0.04 },
  ];

  const AURORA_STORAGE_KEY = "aurora_state";

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
    const bands: Band[] = DEFAULT_BANDS.map(b => ({ ...b, offset: 0 }));

    return {
      bands,
      segments: getInt("segments", 20),
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
        const state = JSON.parse(saved) as { offsets: number[]; time: number };
        const offsets = state.offsets;
        for (let i = 0; i < CFG.bands.length && i < offsets.length; i++) {
          CFG.bands[i].offset = offsets[i];
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
    }
  }

  function saveAuroraState(): void {
    try {
      const state = {
        offsets: CFG.bands.map(b => b.offset),
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
  }

  const BANDS = CFG.bands;

  function drawAurora(): void {
    const segments = CFG.segments;
    const bandH = H * CFG.bandHeight;

    ctx!.globalCompositeOperation = "screen";
    for (let b = 0; b < BANDS.length; b++) {
      const band = BANDS[b];

      // Y-jitter: slow sine wobble so seams aren't static straight lines.
      const yJitter = Math.sin(t * CFG.yJitterSpeed + b * 1.7) * CFG.yJitterAmp;
      const centreY = H * (band.yFrac + yJitter + Math.sin(t * band.speed * 0.7 + b * 2.3) * band.amp);
      const top = centreY - bandH / 2;
      const bottom = top + bandH;

      // Horizontal gradient with jittered segment boundaries so vertical colour
      // edges are wavy instead of straight.
      const stops: { pos: number; col: string }[] = [];
      for (let s = 0; s < segments; s++) {
        const base = s / segments;
        const jitter = Math.sin(t * CFG.segmentJitterSpeed + s * 1.1 + b * 0.9) * CFG.segmentJitterAmp;
        const pos = Math.max(0, Math.min(1, base + jitter));
        const xMid = (pos + (s + 0.5) / segments) / 2;
        const col = auroraColumn(xMid, band.xSpeed, band.offset, t);
        stops.push({ pos, col: col.peak });
      }
      // Final stop at 1
      stops.push({ pos: 1, col: auroraColumn(1, band.xSpeed, band.offset, t).peak });

      const hGrad = ctx!.createLinearGradient(0, top, W, top);
      for (const st of stops) {
        hGrad.addColorStop(st.pos, st.col);
      }

      // Vertical fade mask (positioned at the band so the fade is centred on it).
      const vGrad = ctx!.createLinearGradient(0, top, 0, bottom);
      vGrad.addColorStop(0, "rgba(255,255,255,0)");
      vGrad.addColorStop(0.35, "rgba(255,255,255,1)");
      vGrad.addColorStop(0.65, "rgba(255,255,255,1)");
      vGrad.addColorStop(1, "rgba(255,255,255,0)");

      // Clip to band area so destination-in doesn't leak into background or
      // adjacent bands.
      ctx!.save();
      ctx!.beginPath();
      ctx!.rect(0, top, W, bandH);
      ctx!.clip();

      ctx!.globalCompositeOperation = "screen";
      ctx!.fillStyle = hGrad;
      ctx!.fillRect(0, top, W, bandH);

      ctx!.globalCompositeOperation = "destination-in";
      ctx!.fillStyle = vGrad;
      ctx!.fillRect(0, top, W, bandH);

      ctx!.restore();
      // restore removes clip and returns compositing to the value before
      // save() — but we explicitly set "screen" at the top of the function,
      // and after the loop we set "source-over", so this is fine.
    }
    ctx!.globalCompositeOperation = "source-over";
  }

  // ── Noise overlay ───────────────────────────────────────────────────────────
  // A static noise texture composited at very low opacity to break up synthetic
  // edges and give the aurora a slight organic texture. Generated once then
  // reused every frame.
  let noiseCanvas: HTMLCanvasElement | null = null;

  function ensureNoise(): HTMLCanvasElement {
    if (noiseCanvas) return noiseCanvas;
    noiseCanvas = document.createElement("canvas");
    const nw = CFG.noiseTileSize;
    const nh = CFG.noiseTileSize;
    noiseCanvas.width = nw;
    noiseCanvas.height = nh;
    const nctx = noiseCanvas.getContext("2d")!;
    const img = nctx.createImageData(nw, nh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 30 + Math.random() * 40; // subtle alpha
    }
    nctx.putImageData(img, 0, 0);
    return noiseCanvas;
  }

  function drawNoise(): void {
    const nc = ensureNoise();
    ctx!.globalCompositeOperation = "overlay";
    ctx!.globalAlpha = CFG.noiseOpacity;
    ctx!.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y += nc.height) {
      for (let x = 0; x < W; x += nc.width) {
        ctx!.drawImage(nc, x, y);
      }
    }
    ctx!.globalAlpha = 1;
    ctx!.imageSmoothingEnabled = true;
    ctx!.globalCompositeOperation = "source-over";
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

  function buildScanlinePattern(): void {
    const tile = document.createElement("canvas");
    tile.width = 1;
    tile.height = CFG.scanlineSpacing;
    const tctx = tile.getContext("2d");
    if (!tctx) return;
    tctx.fillStyle = "rgba(0,0,0," + CFG.scanlineOpacity + ")";
    tctx.fillRect(0, 0, 1, 1); // dark row; remaining rows stay transparent
    scanlinePattern = ctx!.createPattern(tile, "repeat");
  }

  function drawScanlines(): void {
    // multiply darkens only the stripe rows, preserving the colour underneath
    ctx!.globalCompositeOperation = "multiply";
    if (scanlineMode === "pattern" && scanlinePattern) {
      ctx!.fillStyle = scanlinePattern;
      ctx!.fillRect(0, 0, W, H);
    } else {
      ctx!.fillStyle = "rgba(0,0,0," + CFG.scanlineOpacity + ")";
      for (let y = 0; y < H; y += CFG.scanlineSpacing) {
        ctx!.fillRect(0, y, W, 1);
      }
    }
    ctx!.globalCompositeOperation = "source-over";

    // Slow vertical roll — a faint lighter band drifting downward.
    const rollY = ((t * CFG.rollSpeed) % (H + 100)) - 50;
    const rollGrad = ctx!.createLinearGradient(0, rollY, 0, rollY + CFG.rollHeight);
    rollGrad.addColorStop(0, "rgba(255,255,255,0)");
    rollGrad.addColorStop(0.5, "rgba(255,255,255,0.015)");
    rollGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx!.fillStyle = rollGrad;
    ctx!.fillRect(0, rollY, W, CFG.rollHeight);
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

    const workStart = performance.now();

    ctx!.clearRect(0, 0, W, H);

    // Base background — matches $dark-background in _variables.scss.
    ctx!.fillStyle = CFG.backgroundColor;
    ctx!.fillRect(0, 0, W, H);

    drawAurora();
    drawNoise();
    drawScanlines();
    maybeGlitch(dt);

    meter.record(performance.now() - workStart);

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
  buildScanlinePattern();
  requestAnimationFrame(loop);

  // Expose for Playwright perf harness (machine-readable JSON, not DOM text).
  (window as any).__auroraMeter = meter;
  (window as any).__scanlineMode = scanlineMode;
  (window as any).__resetAuroraMeter = () => meter.reset();
})();
