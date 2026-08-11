import { lerp } from './math.js'

export const COUNT = 250
export const REPEL_RADIUS = 110
export const MAX_DISPLACE = 60
export const LERP_RETURN = 0.1 // how fast particles snap back
export const LERP_FLEE = 0.18 // how fast they flee

export interface Particle {
  hx: number // home x
  hy: number // home y
  x: number // current x
  y: number // current y
  r: number // radius 0.6–2.0
  phase: number // drift phase offset
  freq: number // drift frequency
  ampX: number // drift amplitude x
  ampY: number // drift amplitude y
}

/** A source of randomness, injectable so tests can be deterministic. */
export type Rng = () => number

/** Create a single particle with a random home position within W×H. */
export function makeParticle(w: number, h: number, rng: Rng = Math.random): Particle {
  const hx = rng() * w
  const hy = rng() * h
  return {
    hx,
    hy,
    x: hx,
    y: hy,
    r: 0.6 + rng() * 1.4,
    phase: rng() * Math.PI * 2,
    freq: 0.18 + rng() * 0.24,
    ampX: 8 + rng() * 14,
    ampY: 6 + rng() * 10,
  }
}

/** Build the full particle field. */
export function initParticles(w: number, h: number, rng: Rng = Math.random): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < COUNT; i++) {
    particles.push(makeParticle(w, h, rng))
  }
  return particles
}

export interface DriftTarget {
  driftX: number
  driftY: number
}

/** Create a zeroed DriftTarget for reuse across frames. */
export function makeDriftTarget(): DriftTarget {
  return { driftX: 0, driftY: 0 }
}

/**
 * Organic drift position around a particle's home, at time `t`, written into
 * `out`. Returns `out` so callers can reuse a single scratch object per frame
 * and avoid per-particle allocation in the render loop.
 */
export function drift(p: Particle, t: number, out: DriftTarget = makeDriftTarget()): DriftTarget {
  out.driftX = p.hx + Math.sin(t * p.freq + p.phase) * p.ampX
  out.driftY = p.hy + Math.cos(t * p.freq * 0.8 + p.phase * 1.3) * p.ampY
  return out
}

export interface Repulsion {
  targetX: number
  targetY: number
  /** 0 = far/none, 1 = right at cursor. */
  proximity: number
}

/** Create a zeroed Repulsion for reuse across frames. */
export function makeRepulsion(): Repulsion {
  return { targetX: 0, targetY: 0, proximity: 0 }
}

/**
 * Given a particle's drift target and the cursor position, compute the
 * repelled target and proximity into `out`. `mx < -9000` means "no cursor".
 * Returns `out` for reuse across frames.
 */
export function repel(
  p: Particle,
  driftX: number,
  driftY: number,
  mx: number,
  my: number,
  out: Repulsion = makeRepulsion(),
): Repulsion {
  out.targetX = driftX
  out.targetY = driftY
  out.proximity = 0

  if (mx > -9000) {
    const dx = p.x - mx
    const dy = p.y - my
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < REPEL_RADIUS && dist > 0) {
      const proximity = 1 - dist / REPEL_RADIUS
      const push = proximity * MAX_DISPLACE
      out.proximity = proximity
      out.targetX = driftX + (dx / dist) * push
      out.targetY = driftY + (dy / dist) * push
    }
  }

  return out
}

/** Advance a particle toward its target in-place. Fleeing is faster than return. */
export function stepParticle(p: Particle, r: Repulsion): void {
  const k = r.proximity > 0 ? LERP_FLEE : LERP_RETURN
  p.x = lerp(p.x, r.targetX, k)
  p.y = lerp(p.y, r.targetY, k)
}

export interface ParticleStyle {
  alpha: number
  hue: number
  sat: number
  lum: number
  radius: number
  goldAlpha: number
}

/** Create a zeroed ParticleStyle for reuse across frames. */
export function makeParticleStyle(): ParticleStyle {
  return { alpha: 0, hue: 0, sat: 0, lum: 0, radius: 0, goldAlpha: 0 }
}

/**
 * Colour/size for a particle given its cursor proximity, written into `out`.
 * Returns `out` for reuse across frames.
 */
export function particleStyle(
  p: Particle,
  proximity: number,
  out: ParticleStyle = makeParticleStyle(),
): ParticleStyle {
  out.alpha = lerp(0.45, 0.9, proximity)
  out.hue = lerp(210, 195, proximity)
  out.sat = lerp(35, 70, proximity)
  out.lum = lerp(28, 72, proximity)
  out.radius = p.r * lerp(1, 1.6, proximity)
  out.goldAlpha = lerp(0.7, 1.0, proximity)
  return out
}
