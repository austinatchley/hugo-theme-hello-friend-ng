#!/usr/bin/env node
/**
 * Aurora scanline A/B perf harness.
 *
 * Launches headless Chromium, loads the real compiled crt-aurora.js for each
 * scanline strategy, drains the FrameMeter to capacity, and prints a
 * comparison table I (an LLM) can read without eye-strain.
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

const MODES = ["rows", "pattern"];
const TARGET_SAMPLES = 240; // FrameMeter capacity

// 1. Rebuild so the compiled JS is fresh
console.log("→ Building TS...");
execSync("node build.mjs", { stdio: "pipe" });

// 2. Read the compiled aurora bundle
const js = readFileSync("static/js/crt-aurora.js", "utf8");

// 3. Write a minimal test page (inline script avoids file-relative issues)
const html = '<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n<canvas id="crt-aurora"></canvas>\n<script>' + js + '</script>\n</body></html>';

const tmpDir = mkdtempSync(join(tmpdir(), "aurora-perf-"));
const tmpFile = join(tmpDir, "test.html");
writeFileSync(tmpFile, html);

let browser;
try {
  // 4. Launch headless Chromium
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
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

  // 5. Run each scanline mode
  const results = {};
  for (const mode of MODES) {
    const url = "file://" + tmpFile + "?scanlines=" + mode;
    console.log("  " + mode + "  " + url);
    await page.goto(url, { waitUntil: "networkidle" });

    // Wait until the meter has filled its capacity
    await page.waitForFunction(
      (n) => {
        const m = window.__auroraMeter;
        return m && m.size() >= n;
      },
      TARGET_SAMPLES,
      { timeout: 30_000 },
    );

    const stats = await page.evaluate(() => {
      const m = window.__auroraMeter;
      return m ? m.stats() : null;
    });

    if (!stats) {
      console.error("  ✗ " + mode + ": no stats");
      results[mode] = { median: -1, p95: -1, max: -1 };
    } else {
      results[mode] = {
        median: stats.median,
        p95: stats.p95,
        max: stats.max,
      };
    }
  }

  // 6. Print comparison table
  console.log("\n" + "=".repeat(46));
  console.log("  Aurora scanline  A / B  (headless)");
  console.log("=".repeat(46));
  console.log("  Renderer  " + renderer);
  console.log("  Viewport  1280 × 720");
  console.log("  Samples   ~" + TARGET_SAMPLES + " frames per mode\n");
  console.log("  ┌──────────┬────────┬────────┬────────┐");
  console.log("  │ Scanline │ med    │ p95    │ max    │");
  console.log("  ├──────────┼────────┼────────┼────────┤");
  for (const mode of MODES) {
    const r = results[mode];
    console.log(
      "  │ " +
        mode.padEnd(8) +
        " │ " +
        r.median.toFixed(2).padStart(5) +
        "ms │ " +
        r.p95.toFixed(2).padStart(5) +
        "ms │ " +
        r.max.toFixed(2).padStart(5) +
        "ms │",
    );
  }
  console.log("  └──────────┴────────┴────────┴────────┘");

  // Caveat: headless software GL ≠ desktop GPU for tail latency.
  if (renderer !== "unknown") {
    console.log("  ⚠ Headless renderer (" + renderer + ") — relative A/B is valid,");
    console.log("    but tail spikes (max) may differ from your GPU-backed desktop.");
  }
  console.log("");
} finally {
  if (browser) await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
}
