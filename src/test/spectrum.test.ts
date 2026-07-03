import { describe, it, expect } from "vitest";
import { SPECTRUM, sampleSpectrum } from "../lib/spectrum.js";

describe("sampleSpectrum", () => {
  it("returns the first stop at pos=0", () => {
    expect(sampleSpectrum(0)).toBe(SPECTRUM[0]);
  });

  it("wraps pos=1 back to the first stop", () => {
    // pos=1 wraps to 0 → first stop
    expect(sampleSpectrum(1)).toBe(SPECTRUM[0]);
  });

  it("hits exact stops at fractional boundaries", () => {
    const n = SPECTRUM.length - 1;
    for (let i = 0; i <= n; i++) {
      expect(sampleSpectrum(i / n)).toBeCloseTo(SPECTRUM[i % SPECTRUM.length]);
    }
  });

  it("interpolates linearly between two stops", () => {
    const n = SPECTRUM.length - 1;
    // Halfway between stop 0 (168) and stop 1 (188) = 178
    const mid = sampleSpectrum(0.5 / n);
    expect(mid).toBeCloseTo((SPECTRUM[0] + SPECTRUM[1]) / 2);
  });

  it("handles negative pos by wrapping", () => {
    expect(sampleSpectrum(-1)).toBeCloseTo(sampleSpectrum(0));
  });
});
