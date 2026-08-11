import { wrap01 } from './math.js'

/**
 * Shared hue spectrum (degrees) that all aurora bands sample from.
 * green → teal → blue → violet → magenta → deep-red → yellow → (wraps to green).
 */
export const SPECTRUM: readonly number[] = [130, 170, 210, 260, 320, 350, 50, 130]

/**
 * Sample the shared spectrum at position `pos` (0–1, wraps).
 * Linearly interpolates between adjacent hue stops.
 */
export function sampleSpectrum(pos: number): number {
  const scaled = wrap01(pos)
  const n = SPECTRUM.length - 1
  const idx = scaled * n
  const lo = Math.floor(idx)
  const frac = idx - lo
  const a = SPECTRUM[lo]
  const b = SPECTRUM[lo + 1]
  let diff = b - a
  // Take the shorter path around the hue circle.
  if (diff > 180) diff -= 360
  else if (diff < -180) diff += 360
  return a + diff * frac
}

export interface AuroraColumn {
  /** hsla color-stop strings for gradient offsets 0, 0.35, 0.65, 1. */
  edge: string // offsets 0 and 1 (transparent)
  peak: string // offsets 0.35 and 0.65 (peak alpha)
}

/**
 * Compute the aurora vertical-gradient colour stops for one column of a band.
 *
 * `xMid` is the column centre as a fraction (0–1), `xSpeed`/`offset` come from
 * the band, and `t` is the animation clock. Returns the two distinct hsla
 * strings used by the four gradient stops (edges are transparent, the middle
 * pair share the peak alpha). Kept pure so the per-column colour maths can be
 * unit-tested without a canvas.
 */
export function auroraColumn(
  xMid: number,
  xSpeed: number,
  offset: number,
  t: number,
): AuroraColumn {
  const phase = xMid * Math.PI * 2.8 + t * xSpeed
  const v = Math.sin(phase) * 0.5 + 0.5
  const specPos = ((phase * 0.18) / (Math.PI * 2) + offset) % 1
  const finalHue = sampleSpectrum(specPos)
  const finalSat = 70 + v * 25
  const peakAlpha = v * 0.13

  const prefix = 'hsla(' + finalHue + ',' + finalSat + '%,60%,'
  return {
    edge: prefix + '0)',
    peak: prefix + peakAlpha + ')',
  }
}
