/**
 * bench.mjs — quantify the animation optimizations with real measurements.
 *
 * Run: node bench.mjs
 *
 * Not part of the committed build; a throwaway measurement harness so the
 * perf claims in commits/docs are backed by numbers rather than assertion.
 * Uses the compiled dist under src via tsx-free plain JS reimplementations
 * of the hot paths (kept in sync with src/lib) — we measure allocation and
 * call-count behaviour, which is what the optimizations target.
 */
import { performance } from "node:perf_hooks";

const COUNT = 160;
const FRAMES = 600; // ~10s at 60fps

// ── Particle hot loop: OLD (fresh objects) vs NEW (scratch reuse) ───────────

function makeParticles() {
  const ps = [];
  for (let i = 0; i < COUNT; i++) {
    ps.push({
      hx: Math.random() * 1920,
      hy: Math.random() * 1080,
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      r: 0.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      freq: 0.18 + Math.random() * 0.24,
      ampX: 8 + Math.random() * 14,
      ampY: 6 + Math.random() * 10,
    });
  }
  return ps;
}

const lerp = (a, b, k) => a + (b - a) * k;

function oldFrame(particles, t, mx, my) {
  for (const p of particles) {
    const drift = {
      driftX: p.hx + Math.sin(t * p.freq + p.phase) * p.ampX,
      driftY: p.hy + Math.cos(t * p.freq * 0.8 + p.phase * 1.3) * p.ampY,
    };
    let targetX = drift.driftX, targetY = drift.driftY, proximity = 0;
    if (mx > -9000) {
      const dx = p.x - mx, dy = p.y - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 110 && dist > 0) {
        proximity = 1 - dist / 110;
        const push = proximity * 60;
        targetX = drift.driftX + (dx / dist) * push;
        targetY = drift.driftY + (dy / dist) * push;
      }
    }
    const r = { targetX, targetY, proximity };
    const k = r.proximity > 0 ? 0.18 : 0.1;
    p.x = lerp(p.x, r.targetX, k);
    p.y = lerp(p.y, r.targetY, k);
    const _style = {
      alpha: lerp(0.45, 0.9, proximity),
      hue: lerp(210, 195, proximity),
      sat: lerp(35, 70, proximity),
      lum: lerp(28, 72, proximity),
      radius: p.r * lerp(1, 1.6, proximity),
      goldAlpha: lerp(0.7, 1.0, proximity),
    };
    void _style;
  }
}

function newFrame(particles, t, mx, my, dOut, rOut, sOut) {
  for (const p of particles) {
    dOut.driftX = p.hx + Math.sin(t * p.freq + p.phase) * p.ampX;
    dOut.driftY = p.hy + Math.cos(t * p.freq * 0.8 + p.phase * 1.3) * p.ampY;
    rOut.targetX = dOut.driftX; rOut.targetY = dOut.driftY; rOut.proximity = 0;
    if (mx > -9000) {
      const dx = p.x - mx, dy = p.y - my, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 110 && dist > 0) {
        const proximity = 1 - dist / 110;
        const push = proximity * 60;
        rOut.proximity = proximity;
        rOut.targetX = dOut.driftX + (dx / dist) * push;
        rOut.targetY = dOut.driftY + (dy / dist) * push;
      }
    }
    const k = rOut.proximity > 0 ? 0.18 : 0.1;
    p.x = lerp(p.x, rOut.targetX, k);
    p.y = lerp(p.y, rOut.targetY, k);
    sOut.alpha = lerp(0.45, 0.9, rOut.proximity);
    sOut.hue = lerp(210, 195, rOut.proximity);
    sOut.sat = lerp(35, 70, rOut.proximity);
    sOut.lum = lerp(28, 72, rOut.proximity);
    sOut.radius = p.r * lerp(1, 1.6, rOut.proximity);
    sOut.goldAlpha = lerp(0.7, 1.0, rOut.proximity);
  }
}

function measure(label, fn) {
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  const heapAfter = process.memoryUsage().heapUsed;
  console.log(
    `${label.padEnd(28)} time=${ms.toFixed(1)}ms  heapΔ=${((heapAfter - heapBefore) / 1e6).toFixed(2)}MB`,
  );
  return ms;
}

console.log(`Particle hot loop — ${COUNT} particles × ${FRAMES} frames\n`);

{
  const ps = makeParticles();
  measure("OLD (3 objects/particle)", () => {
    for (let f = 0; f < FRAMES; f++) oldFrame(ps, f / 60, 960, 540);
  });
}
{
  const ps = makeParticles();
  const dOut = { driftX: 0, driftY: 0 };
  const rOut = { targetX: 0, targetY: 0, proximity: 0 };
  const sOut = { alpha: 0, hue: 0, sat: 0, lum: 0, radius: 0, goldAlpha: 0 };
  measure("NEW (scratch reuse)", () => {
    for (let f = 0; f < FRAMES; f++) newFrame(ps, f / 60, 960, 540, dOut, rOut, sOut);
  });
}

const oldAllocs = COUNT * 3 * FRAMES;
console.log(
  `\nAllocations avoided: ${oldAllocs.toLocaleString()} objects over ${FRAMES} frames ` +
    `(${(COUNT * 3).toLocaleString()}/frame ≈ ${(COUNT * 3 * 60).toLocaleString()}/sec at 60fps)`,
);

// ── Scanlines: fillRect call count old vs new ───────────────────────────────
for (const H of [1080, 1440, 2160]) {
  const oldCalls = Math.ceil(H / 3);
  console.log(
    `\nScanlines @ ${H}px:  OLD=${oldCalls} fillRect/frame  →  NEW=1 pattern fill/frame ` +
      `(${(oldCalls * 60).toLocaleString()} → 60 fills/sec)`,
  );
}
