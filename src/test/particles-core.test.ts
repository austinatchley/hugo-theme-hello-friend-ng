import { describe, it, expect } from "vitest";
import {
  COUNT,
  REPEL_RADIUS,
  MAX_DISPLACE,
  type Particle,
  initParticles,
  makeParticle,
  drift,
  repel,
  stepParticle,
  particleStyle,
} from "../lib/particles-core.js";

/** Deterministic RNG returning a fixed value. */
const constRng = (v: number) => () => v;

function baseParticle(overrides: Partial<Particle> = {}): Particle {
  return {
    hx: 100,
    hy: 100,
    x: 100,
    y: 100,
    r: 1,
    phase: 0,
    freq: 0.2,
    ampX: 10,
    ampY: 8,
    ...overrides,
  };
}

describe("initParticles", () => {
  it("creates COUNT particles within bounds", () => {
    const ps = initParticles(800, 600, constRng(0.5));
    expect(ps).toHaveLength(COUNT);
    for (const p of ps) {
      expect(p.hx).toBeGreaterThanOrEqual(0);
      expect(p.hx).toBeLessThanOrEqual(800);
      expect(p.hy).toBeGreaterThanOrEqual(0);
      expect(p.hy).toBeLessThanOrEqual(600);
    }
  });

  it("places current position at home on creation", () => {
    const p = makeParticle(500, 500, constRng(0.4));
    expect(p.x).toBe(p.hx);
    expect(p.y).toBe(p.hy);
  });
});

describe("repel", () => {
  it("does nothing when there is no cursor (mx < -9000)", () => {
    const p = baseParticle();
    const r = repel(p, 120, 130, -9999, -9999);
    expect(r.proximity).toBe(0);
    expect(r.targetX).toBe(120);
    expect(r.targetY).toBe(130);
  });

  it("does nothing when cursor is beyond the repel radius", () => {
    const p = baseParticle({ x: 0, y: 0 });
    const r = repel(p, 0, 0, REPEL_RADIUS + 50, 0);
    expect(r.proximity).toBe(0);
  });

  it("pushes the particle away, proximity approaching 1 at the cursor", () => {
    const p = baseParticle({ x: 100, y: 100 });
    // cursor 10px to the left → particle pushed to the right
    const r = repel(p, 100, 100, 90, 100);
    expect(r.proximity).toBeGreaterThan(0);
    expect(r.proximity).toBeLessThanOrEqual(1);
    expect(r.targetX).toBeGreaterThan(100); // pushed +x
    expect(r.targetY).toBeCloseTo(100);
  });

  it("caps displacement at MAX_DISPLACE", () => {
    const p = baseParticle({ x: 100, y: 100 });
    // cursor 1px away → proximity ~1 → push ~MAX_DISPLACE
    const r = repel(p, 100, 100, 99, 100);
    const displacement = r.targetX - 100;
    expect(displacement).toBeLessThanOrEqual(MAX_DISPLACE + 1e-9);
  });
});

describe("stepParticle", () => {
  it("moves faster when fleeing than when returning", () => {
    const fleeing = baseParticle({ x: 0, y: 0 });
    stepParticle(fleeing, { targetX: 100, targetY: 0, proximity: 0.8 });

    const returning = baseParticle({ x: 0, y: 0 });
    stepParticle(returning, { targetX: 100, targetY: 0, proximity: 0 });

    expect(fleeing.x).toBeGreaterThan(returning.x);
  });
});

describe("drift", () => {
  it("returns home position at t=0 with phase 0", () => {
    const p = baseParticle({ phase: 0 });
    const d = drift(p, 0);
    // sin(0)=0 so driftX == hx; cos(0)=1 so driftY == hy + ampY
    expect(d.driftX).toBeCloseTo(p.hx);
    expect(d.driftY).toBeCloseTo(p.hy + p.ampY);
  });
});

describe("particleStyle", () => {
  it("shifts toward teal/brighter as proximity rises", () => {
    const p = baseParticle();
    const far = particleStyle(p, 0);
    const near = particleStyle(p, 1);
    expect(near.alpha).toBeGreaterThan(far.alpha);
    expect(near.radius).toBeGreaterThan(far.radius);
    expect(near.hue).toBeLessThan(far.hue); // 210 → 195
  });
});
