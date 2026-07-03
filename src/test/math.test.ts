import { describe, it, expect } from "vitest";
import { lerp, clamp, wrap01 } from "../lib/math.js";

describe("lerp", () => {
  it("returns endpoints at k=0 and k=1", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("interpolates the midpoint", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("extrapolates for k outside [0,1]", () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe("clamp", () => {
  it("clamps below min and above max", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("passes through in-range values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe("wrap01", () => {
  it("wraps into [0,1)", () => {
    expect(wrap01(0.25)).toBeCloseTo(0.25);
    expect(wrap01(1.25)).toBeCloseTo(0.25);
    expect(wrap01(-0.25)).toBeCloseTo(0.75);
  });

  it("maps whole numbers to 0", () => {
    expect(wrap01(0)).toBe(0);
    expect(wrap01(3)).toBe(0);
  });
});
