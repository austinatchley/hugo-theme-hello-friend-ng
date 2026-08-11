import { describe, it, expect } from "vitest";
import {
  MAX_RIPPLES,
  type Ripple,
  pushRipple,
  rippleStyle,
} from "../lib/rings.js";

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
