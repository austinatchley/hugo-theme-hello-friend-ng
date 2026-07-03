import { describe, it, expect } from "vitest";
import {
  MAX_RIPPLES,
  type Ripple,
  ringStyle,
  pushRipple,
  rippleStyle,
} from "../lib/rings.js";

describe("ringStyle", () => {
  it("is gold and fully opaque-ish when just born (phase≈0)", () => {
    const s = ringStyle(0, 0);
    expect(s.radius).toBeCloseTo(0);
    expect(s.hue).toBeCloseTo(48); // gold
    expect(s.alpha).toBeCloseTo(0.18);
  });

  it("expands and fades toward teal as phase increases", () => {
    const born = ringStyle(0, 0);
    const later = ringStyle(0, 0.9 * 1.8); // ~0.9 through the period
    expect(later.radius).toBeGreaterThan(born.radius);
    expect(later.alpha).toBeLessThan(born.alpha);
    expect(later.hue).toBeGreaterThan(born.hue); // toward 185 teal
  });
});

describe("pushRipple", () => {
  it("appends ripples", () => {
    const ripples: Ripple[] = [];
    pushRipple(ripples, 10, 20, 1);
    expect(ripples).toEqual([{ x: 10, y: 20, born: 1 }]);
  });

  it("evicts the oldest at capacity", () => {
    const ripples: Ripple[] = [];
    for (let i = 0; i < MAX_RIPPLES + 3; i++) {
      pushRipple(ripples, i, i, i);
    }
    expect(ripples).toHaveLength(MAX_RIPPLES);
    // oldest (0,1,2) evicted; first remaining is index 3
    expect(ripples[0].x).toBe(3);
  });
});

describe("rippleStyle", () => {
  it("starts small and unexpired", () => {
    const s = rippleStyle({ x: 0, y: 0, born: 0 }, 0);
    expect(s.radius).toBeCloseTo(0);
    expect(s.expired).toBe(false);
    expect(s.alpha).toBeCloseTo(0.4);
  });

  it("expires after its lifetime", () => {
    const s = rippleStyle({ x: 0, y: 0, born: 0 }, 2); // > RIPPLE_LIFE (1.4)
    expect(s.expired).toBe(true);
  });
});
