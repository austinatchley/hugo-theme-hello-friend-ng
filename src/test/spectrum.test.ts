import { describe, it, expect } from "vitest";
import { SPECTRUM, sampleSpectrum, auroraColumn } from "../lib/spectrum.js";

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

describe("auroraColumn", () => {
  /**
   * Reference implementation matching the ORIGINAL pre-optimization inline
   * code in crt-aurora, so we prove the extracted/deduplicated version is a
   * byte-identical port of the colour-stop strings.
   */
  function reference(xMid: number, xSpeed: number, offset: number, t: number) {
    const phase = xMid * Math.PI * 2.8 + t * xSpeed;
    const v = Math.sin(phase) * 0.5 + 0.5;
    const specPos = ((phase * 0.18) / (Math.PI * 2) + offset) % 1;
    const finalHue = sampleSpectrum(specPos);
    const finalSat = 65 + v * 25;
    const peakAlpha = v * 0.13;
    return {
      stop0: "hsla(" + finalHue + "," + finalSat + "%,60%,0)",
      stop035: "hsla(" + finalHue + "," + finalSat + "%,60%," + peakAlpha + ")",
      stop065: "hsla(" + finalHue + "," + finalSat + "%,60%," + peakAlpha + ")",
      stop1: "hsla(" + finalHue + "," + finalSat + "%,60%,0)",
    };
  }

  const cases: Array<[number, number, number, number]> = [
    [0.5 / 14, 1.1, 0.123, 0],
    [13.5 / 14, 0.8, 0.777, 2.5],
    [7.5 / 14, 1.3, 0.041, 12.34],
    [0.5 / 14, 0.9, 0.5, 100.7],
  ];

  it("matches the original inline colour-stop strings exactly", () => {
    for (const [xMid, xSpeed, offset, t] of cases) {
      const col = auroraColumn(xMid, xSpeed, offset, t);
      const ref = reference(xMid, xSpeed, offset, t);
      // The four gradient stops map to: edge, peak, peak, edge.
      expect(col.edge).toBe(ref.stop0);
      expect(col.peak).toBe(ref.stop035);
      expect(col.peak).toBe(ref.stop065);
      expect(col.edge).toBe(ref.stop1);
    }
  });

  it("edge stops are transparent (alpha 0) and peak carries the band alpha", () => {
    const col = auroraColumn(0.3, 1.0, 0.2, 5);
    expect(col.edge.endsWith(",60%,0)")).toBe(true);
    expect(col.peak).not.toBe(col.edge);
  });
});
