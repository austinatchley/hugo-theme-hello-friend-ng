import { wrap01 } from "./math.js";

/**
 * Shared hue spectrum (degrees) that all aurora bands sample from.
 * teal → cyan → blue → violet → magenta → amber → gold → (wraps to teal).
 */
export const SPECTRUM: readonly number[] = [
  168, 188, 210, 240, 315, 38, 42, 168,
];

/**
 * Sample the shared spectrum at position `pos` (0–1, wraps).
 * Linearly interpolates between adjacent hue stops.
 */
export function sampleSpectrum(pos: number): number {
  const scaled = wrap01(pos);
  const n = SPECTRUM.length - 1;
  const idx = scaled * n;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return SPECTRUM[lo] + (SPECTRUM[lo + 1] - SPECTRUM[lo]) * frac;
}
