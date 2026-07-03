#!/usr/bin/env node
/**
 * Generic frame-timing harness for browser animations.
 *
 * Launches headless Chromium, loads a page with the animation JS, discards
 * warmup frames, then runs N trials that each collect a fresh FrameMeter
 * window.  Aggregated stats across trials are printed in a table.
 *
 * Usage
 * -----
 *   node perf.mjs                          # default: aurora scanline A/B
 *   node perf.mjs --input static/js/particles.js  # benchmark any animation
 *   node perf.mjs --scanlines rows         # single-mode aurora test
 *   node perf.mjs --scanlines rows --scanlines pattern  # explicit A/B list
 *
 * Requirements: playwright (devDependency), chromium installed via
 *   npx playwright install chromium
 *
 * Notes
 * -----
 * Headless Chromium typically falls back to SwiftShader (software GL).
 * Absolute numbers differ from your desktop GPU, but *relative* comparisons
 * are valid for regression detection.  Renderer string is printed in output.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ── Defaults ────────────────────────────────────────────────────────────────
const WARMUP_FRAMES = 120;
const TRIAL_FRAMES = 240;
const TRIALS = 5;
const VIEWPORT = { width: 1280, height: 720 };

// ── Stats helpers ────────────────────────────────────────────────────────────
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function min(arr) {
  return arr.reduce((a, b) => (a < b ? a : b), Infinity);
}
function max(arr) {
  return arr.reduce((a, b) => (a > b ? a : b), -Infinity);
}

// ── Benchmark runner ─────────────────────────────────────────────────────────
/**
 * Measure frame timing for a page animation.
 *
 * @param {import('playwright').Page} page  – Playwright page with animation running
 * @param {object} options
 * @param {string}  options.meterGlobal  – name of the FrameMeter on `window`, e.g. "__auroraMeter"
 * @param {string}  [options.label]      – label for logging
 * @param {number}  [options.warmup]     – frames to discard (default 120)
 * @param {number}  [options.trials]     – number of trials (default 5)
 * @param {number}  [options.trialFrames] – frames per trial (default 240)
 * @param {(page: import('playwright').Page, trialIndex: number) => Promise<void>}
 *                  [options.setupTrial]  – optional async callback before each trial
 * @returns {object|null}  { medMin, medAvg, medMax, p95Min, p95Avg, p95Max,
 *                           maxMin, maxAvg, maxMax, trials } or null if no data
 */
async function benchmark(page, options) {
  const {
    meterGlobal,
    label = meterGlobal,
    warmup = WARMUP_FRAMES,
    trials = TRIALS,
    trialFrames = TRIAL_FRAMES,
    setupTrial,
  } = options;

  const mg = meterGlobal;

  // ── Warmup ──────────────────────────────────────────────────────────
  console.log("    warmup " + warmup + " frames…");
  await page.waitForFunction(
    (args) => {
      const [mg, n] = args;
      const m = window[mg];
      return m && m.size && m.size() >= n;
    },
    [mg, warmup],
    { timeout: 30_000 },
  );

  // ── Multi-trial ─────────────────────────────────────────────────────
  const trialResults = [];
  for (let t = 0; t < trials; t++) {
    if (setupTrial) await setupTrial(page, t);

    await page.evaluate((mg) => {
      const m = window[mg];
      if (m && m.reset) m.reset();
    }, mg);

    await page.waitForFunction(
      (args) => {
        const [mg, n] = args;
        const m = window[mg];
        return m && m.size && m.size() >= n;
      },
      [mg, trialFrames],
      { timeout: 30_000 },
    );

    const s = await page.evaluate((mg) => {
      const m = window[mg];
      return m && m.stats ? m.stats() : null;
    }, mg);

    if (s) {
      trialResults.push(s);
      console.log(
        "    trial " +
          (t + 1) +
          "/" +
          trials +
          "  med " +
          s.median.toFixed(2) +
          "  p95 " +
          s.p95.toFixed(2) +
          "  max " +
          s.max.toFixed(2),
      );
    }
  }

  // ── Aggregate ───────────────────────────────────────────────────────
  if (trialResults.length === 0) return null;

  const medians = trialResults.map((s) => s.median);
  const p95s = trialResults.map((s) => s.p95);
  const maxes = trialResults.map((s) => s.max);

  return {
    medMin: min(medians),
    medAvg: avg(medians),
    medMax: max(medians),
    p95Min: min(p95s),
    p95Avg: avg(p95s),
    p95Max: max(p95s),
    maxMin: min(maxes),
    maxAvg: avg(maxes),
    maxMax: max(maxes),
    trials: trialResults.length,
  };
}

// ── Page helpers ────────────────────────────────────────────────────────────
function buildTestPage(jsPath) {
  const js = readFileSync(jsPath, "utf8");
  // Insert a minimal canvas for canvas-based animations; other setups
  // (like cursor-fx which attaches to the document) work without it.
  return (
    '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n<canvas id="crt-aurora"></canvas>\n<script>' +
    js +
    "</script>\n</body></html>"
  );
}

function createTempPage(html) {
  const dir = mkdtempSync(join(tmpdir(), "anim-perf-"));
  const file = join(dir, "test.html");
  writeFileSync(file, html);
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── Table output ─────────────────────────────────────────────────────────────
function printResults(rows, { renderer, viewport, warmup, trialFrames, title }) {
  console.log("\n" + "=".repeat(64));
  console.log("  " + title);
  console.log("=".repeat(64));
  console.log("  Renderer  " + renderer);
  console.log("  Viewport  " + viewport.width + " × " + viewport.height);
  console.log("  Warmup    " + warmup + " frames");
  console.log("  Trial     " + trialFrames + " frames / trial\n");

  // Header
  console.log("  ┌──────────┬────────────┬────────────┬────────────┐");
  console.log("  │ Label    │ med        │ p95        │ max        │");
  console.log("  ├──────────┼────────────┼────────────┼────────────┤");

  for (const { label, result } of rows) {
    if (!result) {
      console.log("  │ " + label.padEnd(8) + " │  — no data —                   │");
      continue;
    }
    const medStr = result.medAvg.toFixed(2) + "ms  [" + result.medMin.toFixed(1) + "–" + result.medMax.toFixed(1) + "]";
    const p95Str = result.p95Avg.toFixed(2) + "ms  [" + result.p95Min.toFixed(1) + "–" + result.p95Max.toFixed(1) + "]";
    const maxStr = result.maxAvg.toFixed(2) + "ms  [" + result.maxMin.toFixed(1) + "–" + result.maxMax.toFixed(1) + "]";
    console.log(
      "  │ " +
        label.padEnd(8) +
        " │ " +
        medStr.padStart(10) +
        " │ " +
        p95Str.padStart(10) +
        " │ " +
        maxStr.padStart(10) +
        " │",
    );
  }
  console.log("  └──────────┴────────────┴────────────┴────────────┘");

  if (renderer !== "unknown") {
    console.log("  ⚠ Headless renderer (" + renderer + ") — relative comparison is valid,");
    console.log("    but tail spikes (max) may differ from your GPU-backed desktop.");
  }
  console.log("");
}

// ── CLI parsing ──────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { scanlines: [], input: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scanlines") {
      opts.scanlines.push(args[++i]);
    } else if (args[i] === "--input") {
      opts.input = args[++i];
    }
  }
  return opts;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  // 1. Rebuild TS
  console.log("→ Building TS...");
  execSync("node build.mjs", { stdio: "pipe" });

  // 2. Determine what to benchmark
  const jsPath = opts.input || "static/js/crt-aurora.js";
  const html = buildTestPage(jsPath);
  const tmp = createTempPage(html);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();

    // Detect renderer
    const renderer = await page.evaluate(() => {
      try {
        const c = document.createElement("canvas");
        const gl = c.getContext("webgl");
        if (!gl) return "no-webgl";
        return gl.getParameter(gl.RENDERER);
      } catch {
        return "unknown";
      }
    });

    // Build list of scenarios to run
    const scenarios = [];

    if (opts.input) {
      // Single-animation benchmark (any JS with a FrameMeter on window)
      // User must supply the global name via query param or we guess.
      const mg = opts.input.includes("crt-aurora") ? "__auroraMeter"
             : opts.input.includes("particles") ? "__particleMeter"
             : opts.input.includes("cursor-fx") ? "__cursorMeter"
             : "__auroraMeter";
      scenarios.push({ label: opts.input, meterGlobal: mg, url: "file://" + tmp.file });
    } else {
      // Default: aurora scanline A/B
      const modes = opts.scanlines.length > 0 ? opts.scanlines : ["rows", "pattern"];
      for (const mode of modes) {
        scenarios.push({
          label: mode,
          meterGlobal: "__auroraMeter",
          url: "file://" + tmp.file + "?scanlines=" + mode,
        });
      }
    }

    // 3. Run each scenario
    const results = [];
    for (const sc of scenarios) {
      console.log("\n  " + sc.label + "  " + sc.url);
      await page.goto(sc.url, { waitUntil: "networkidle" });

      const result = await benchmark(page, {
        meterGlobal: sc.meterGlobal,
        label: sc.label,
      });
      results.push({ label: sc.label, result });
    }

    // 4. Print comparison table
    const title = opts.input
      ? "Animation benchmark  —  " + TRIALS + " trials"
      : "Aurora scanline  A / B  —  " + TRIALS + " trials each";
    printResults(results, {
      renderer,
      viewport: VIEWPORT,
      warmup: WARMUP_FRAMES,
      trialFrames: TRIAL_FRAMES,
      title,
    });
  } finally {
    if (browser) await browser.close();
    tmp.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
