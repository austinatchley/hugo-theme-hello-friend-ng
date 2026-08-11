import { clamp, lerp } from './math.js'

export interface ChaseEnvelope {
  attack: number
  decay: number
  attackDist: number
}

/**
 * Chase interpolation factor for the cursor halo, synth-ADSR style.
 * `dist` is how far behind the cursor the halo currently lags.
 *
 * Far from the cursor (dist >= attackDist) the halo attacks hard and
 * pounces (returns `attack`); at dist 0 it settles at `decay`. Between the
 * two the factor eases linearly, so the halo glides gently into place
 * instead of moving at one constant speed.
 */
export function chaseFactor(e: ChaseEnvelope, dist: number): number {
  const t = clamp(dist / e.attackDist, 0, 1)
  return lerp(e.decay, e.attack, t)
}

export interface HaloOpacityEnvelope {
  attack: number
  decay: number
  settleDist: number
  restOpacity: number
  moveOpacity: number
}

/**
 * Opacity envelope for the halo.
 *
 * While still chasing (dist >= settleDist) the halo attacks up to
 * `moveOpacity`; once settled within `settleDist` it decays toward
 * `restOpacity`. Returns the per-frame lerp factor and the target opacity.
 */
export function haloOpacityStep(
  e: HaloOpacityEnvelope,
  dist: number,
): { factor: number; target: number } {
  const settled = dist < e.settleDist
  return {
    factor: settled ? e.decay : e.attack,
    target: settled ? e.restOpacity : e.moveOpacity,
  }
}
