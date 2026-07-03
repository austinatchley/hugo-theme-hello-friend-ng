#!/usr/bin/env node
/**
 * Aurora scanline A/B perf harness — multi-trial with warmup.
 *
 * Launches headless Chromium, loads the real compiled crt-aurora.js for each
 * scanline strategy, discards warmup frames, then runs N trials that each
 * collect a fresh FrameMeter window.  Aggregated stats are printed in a table
 * I (an LLM) can read without eye-strain.
 *
 * Usage: npm run perf
 *
 * Requirements: playwright (devDependency), chromium installed via
 *   npx playwright install chromium
 *
 * Notes
 * -----
 * Headless Chromium typically falls back to SwiftShader (software GL).
 * Absolute numbers differ from your desktop GPU, but *relative* A/B
 * comparisons (rows vs pattern) are valid for regression detection.
 * The detected renderer is printed at the top of the output so you know
 * what you're looking at.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ── Config ─────────────────────────────────────────────────────────────────
const MODES = ["rows", "pattern"];
const WARMUP_FRAMES = 120;
const TRIAL_FRAMES = 240; // FrameMeter capacity
const TRIALS = 5;
const VIEWPORT = { width: 1280, height: 720 };

// ── Helpers ─────────────────────────────────────────────────────────────────
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function min(arr) {
  return arr.reduce((a, b) => (a < b ? a : b), Infinity);
}
function max(arr) {
  return arr.reduce((a, b) => (a > b ? a : b), -Infinity);
}
function fmt(n) {
  return n.toFixed(2).padStart(5) + "ms";
}

// 1. Rebuild so the compiled JS is fresh
console.log("→ Building TS...");
execSync("node build.mjs", { stdio: "pipe" });

// 2. Read the compiled aurora bundle
const js = readFileSync("static/js/crt-aurora.js", "utf8");

// 3. Write a minimal test page (inline script avoids file-relative issues)
const html =
  '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n<canvas id="crt-aurora"></canvas>\n<script>' +
  js +
  "</script>\n</body></html>";

const tmpDir = mkdtempSync(join(tmpdir(), "aurora-perf-"));
const tmpFile = join(tmpDir, "test.html");
writeFileSync(tmpFile, html);

let browser;
try {
  // 4. Launch headless Chromium
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  // Detect renderer string
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

  await page.exposeFunction("log", (msg) => console.log("  [page] " + msg));

  // 5. Run each scanline mode
  const results = {};
  for (const mode of MODES) {
    const url = "file://" + tmpFile + "?scanlines=" + mode;
    console.log("\n  " + mode + "  " + url);
    await page.goto(url, { waitUntil: "networkidle" });

    // ── Warmup: JIT-compile, canvas init, then discard ───────────────
    console.log("    warmup " + WARMUP_FRAMES + " frames…");
    await page.waitForFunction(
      (n) => {
        const m = window.__auroraMeter;
        return m && m.size() >= n;
      },
      WARMUP_FRAMES,
      { timeout: 30_000 },
    );

    // ── Multi-trial measurement ──────────────────────────────────────
    const trials = [];
    for (let t = 0; t < TRIALS; t++) {
      await page.evaluate(() => window.__resetAuroraMeter());
      await page.waitForFunction(
        (n) => {
          const m = window.__auroraMeter;
          return m && m.size() >= n;
        },
        TRIAL_FRAMES,
        { timeout: 30_000 },
      );
      const s = await page.evaluate(() => {
        const m = window.__auroraMeter;
        return m ? m.stats() : null;
      });
      if (s) {
        trials.push(s);
        console.log(
          "    trial " +
            (t + 1) +
            "/" +
            TRIALS +
            "  med " +
            s.median.toFixed(2) +
            "  p95 " +
            s.p95.toFixed(2) +
            "  max " +
            s.max.toFixed(2),
        );
      }
    }

    // Aggregate
    if (trials.length > 0) {
      const medians = trials.map((s) => s.median);
      const p95s = trials.map((s) => s.p95);
      const maxes = trials.map((s) => s.max);
      results[mode] = {
        medMin: min(medians),
        medAvg: avg(medians),
        medMax: max(medians),
        p95Min: min(p95s),
        p95Avg: avg(p95s),
        p95Max: max(p95s),
        maxMin: min(maxes),
        maxAvg: avg(maxes),
        maxMax: max(maxes),
        trials: trials.length,
      };
    } else {
      results[mode] = null;
    }
  }

  // 6. Print comparison table
  console.log("\n" + "=".repeat(64));
  console.log("  Aurora scanline  A / B  —  " + TRIALS + " trials each");
  console.log("=".repeat(64));
  console.log("  Renderer  " + renderer);
  console.log("  Viewport  " + VIEWPORT.width + " × " + VIEWPORT.height);
  console.log("  Warmup    " + WARMUP_FRAMES + " frames");
  console.log("  Trial     " + TRIAL_FRAMES + " frames / trial\n");

  // Header
  console.log(
    "  ┌──────────┬────────────┬────────────┬────────────┐",
  );
  console.log(
    "  │ Scanline │ med        │ p95        │ max        │",
  );
  console.log(
    "  ├──────────┼────────────┼────────────┼────────────┤",
  );

  for (const mode of MODES) {
    const r = results[mode];
    if (!r) {
      console.log("  │ " + mode.padEnd(8) + " │  — no data —                   │");
      continue;
    }
    const medStr = r.medAvg.toFixed(2) + "ms  [" + r.medMin.toFixed(1) + "–" + r.medMax.toFixed(1) + "]";
    const p95Str = r.p95Avg.toFixed(2) + "ms  [" + r.p95Min.toFixed(1) + "–" + r.p95Max.toFixed(1) + "]";
    const maxStr = r.maxAvg.toFixed(2) + "ms  [" + r.maxMin.toFixed(1) + "–" + r.maxMax.toFixed(1) + "]";
    console.log(
      "  │ " +
        mode.padEnd(8) +
        " │ " +
        medStr.padStart(10) +
        " │ " +
        p95Str.padStart(10) +
        " │ " +
        maxStr.padStart(10) +
        " │",
    );
  }
  console.log(
    "  └──────────┴────────────┴────────────┴────────────┘",
  );

  // Caveat
  if (renderer !== "unknown") {
    console.log(
      "  ⚠ Headless renderer (" +
        renderer +
        ") — relative A/B is valid,",
    );
    console.log(
      "    but tail spikes (max) may differ from your GPU-backed desktop.",
    );
  }
  console.log("");
} finally {
  if (browser) await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
}
