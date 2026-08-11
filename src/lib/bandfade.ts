export interface BandFadeGeometry {
  /** Width (in px) of each vertical fade ramp. */
  fadePx: number
  /** Rounded index of the band's top row. */
  yTop: number
  /** Rounded index one past the band's bottom row. */
  yBot: number
  /** First plateau row. */
  midTop: number
  /** One past the last plateau row. */
  midBot: number
}

/**
 * Compute the per-row fade geometry for one aurora band.
 *
 * `maskFadeFrac` (0–1) is the fraction of the band height faded at each
 * edge. The result is clamped so `fadePx <= bandH/2`: any larger value
 * would make the top and bottom fade loops overlap, filling shared rows
 * twice and leaving a brighter seam where both ramps stack.
 */
export function bandFadeGeometry(
  top: number,
  bottom: number,
  maskFadeFrac: number,
): BandFadeGeometry {
  const bandH = bottom - top
  const fadePx = Math.max(1, Math.round(Math.min(bandH / 2, bandH * maskFadeFrac)))
  const yTop = Math.round(top)
  const yBot = Math.round(bottom)
  return {
    fadePx,
    yTop,
    yBot,
    midTop: yTop + fadePx,
    midBot: yBot - fadePx,
  }
}
