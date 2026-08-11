import { describe, it, expect } from 'vitest'
import {
  COUNT,
  REPEL_RADIUS,
  MAX_DISPLACE,
  type Particle,
  initParticles,
  makeParticle,
  makeDriftTarget,
  makeRepulsion,
  makeParticleStyle,
  drift,
  repel,
  stepParticle,
  particleStyle,
} from '../lib/particles-core.js'

/** Deterministic RNG returning a fixed value. */
const constRng = (v: number) => () => v

function baseParticle(overrides: Partial<Particle> = {}): Particle {
  return {
    hx: 100,
    hy: 100,
    x: 100,
    y: 100,
    r: 1,
    phase: 0,
    freq: 0.2,
    ampX: 10,
    ampY: 8,
    ...overrides,
  }
}

describe('initParticles', () => {
  it('creates COUNT particles within bounds', () => {
    const ps = initParticles(800, 600, constRng(0.5))
    expect(ps).toHaveLength(COUNT)
    for (const p of ps) {
      expect(p.hx).toBeGreaterThanOrEqual(0)
      expect(p.hx).toBeLessThanOrEqual(800)
      expect(p.hy).toBeGreaterThanOrEqual(0)
      expect(p.hy).toBeLessThanOrEqual(600)
    }
  })

  it('places current position at home on creation', () => {
    const p = makeParticle(500, 500, constRng(0.4))
    expect(p.x).toBe(p.hx)
    expect(p.y).toBe(p.hy)
  })
})

describe('repel', () => {
  it('does nothing when there is no cursor (mx < -9000)', () => {
    const p = baseParticle()
    const r = repel(p, 120, 130, -9999, -9999)
    expect(r.proximity).toBe(0)
    expect(r.targetX).toBe(120)
    expect(r.targetY).toBe(130)
  })

  it('does nothing when cursor is beyond the repel radius', () => {
    const p = baseParticle({ x: 0, y: 0 })
    const r = repel(p, 0, 0, REPEL_RADIUS + 50, 0)
    expect(r.proximity).toBe(0)
  })

  it('pushes the particle away, proximity approaching 1 at the cursor', () => {
    const p = baseParticle({ x: 100, y: 100 })
    // cursor 10px to the left → particle pushed to the right
    const r = repel(p, 100, 100, 90, 100)
    expect(r.proximity).toBeGreaterThan(0)
    expect(r.proximity).toBeLessThanOrEqual(1)
    expect(r.targetX).toBeGreaterThan(100) // pushed +x
    expect(r.targetY).toBeCloseTo(100)
  })

  it('caps displacement at MAX_DISPLACE', () => {
    const p = baseParticle({ x: 100, y: 100 })
    // cursor 1px away → proximity ~1 → push ~MAX_DISPLACE
    const r = repel(p, 100, 100, 99, 100)
    const displacement = r.targetX - 100
    expect(displacement).toBeLessThanOrEqual(MAX_DISPLACE + 1e-9)
  })
})

describe('stepParticle', () => {
  it('moves faster when fleeing than when returning', () => {
    const fleeing = baseParticle({ x: 0, y: 0 })
    stepParticle(fleeing, { targetX: 100, targetY: 0, proximity: 0.8 })

    const returning = baseParticle({ x: 0, y: 0 })
    stepParticle(returning, { targetX: 100, targetY: 0, proximity: 0 })

    expect(fleeing.x).toBeGreaterThan(returning.x)
  })
})

describe('drift', () => {
  it('returns home position at t=0 with phase 0', () => {
    const p = baseParticle({ phase: 0 })
    const d = drift(p, 0)
    // sin(0)=0 so driftX == hx; cos(0)=1 so driftY == hy + ampY
    expect(d.driftX).toBeCloseTo(p.hx)
    expect(d.driftY).toBeCloseTo(p.hy + p.ampY)
  })
})

describe('particleStyle', () => {
  it('shifts toward teal/brighter as proximity rises', () => {
    const p = baseParticle()
    const far = particleStyle(p, 0)
    const near = particleStyle(p, 1)
    expect(near.alpha).toBeGreaterThan(far.alpha)
    expect(near.radius).toBeGreaterThan(far.radius)
    expect(near.hue).toBeLessThan(far.hue) // 210 → 195
  })
})

describe('scratch-object reuse (allocation-free hot loop)', () => {
  it('drift writes into the provided out-object and returns it', () => {
    const p = baseParticle({ phase: 0.4 })
    const out = makeDriftTarget()
    const ret = drift(p, 1.23, out)
    expect(ret).toBe(out) // same reference — no allocation
  })

  it('repel writes into the provided out-object and returns it', () => {
    const p = baseParticle({ x: 100, y: 100 })
    const out = makeRepulsion()
    const ret = repel(p, 100, 100, 95, 100, out)
    expect(ret).toBe(out)
  })

  it('particleStyle writes into the provided out-object and returns it', () => {
    const p = baseParticle()
    const out = makeParticleStyle()
    const ret = particleStyle(p, 0.5, out)
    expect(ret).toBe(out)
  })

  it('produces identical values whether allocating or reusing a scratch object', () => {
    const p = baseParticle({ phase: 0.7, freq: 0.3 })
    const t = 2.5
    const mx = 90
    const my = 105

    // Fresh-allocation path (default params).
    const dFresh = drift(p, t)
    const rFresh = repel(p, dFresh.driftX, dFresh.driftY, mx, my)
    const sFresh = particleStyle(p, rFresh.proximity)

    // Reused-scratch path.
    const dOut = makeDriftTarget()
    const rOut = makeRepulsion()
    const sOut = makeParticleStyle()
    drift(p, t, dOut)
    repel(p, dOut.driftX, dOut.driftY, mx, my, rOut)
    particleStyle(p, rOut.proximity, sOut)

    expect(dOut).toEqual(dFresh)
    expect(rOut).toEqual(rFresh)
    expect(sOut).toEqual(sFresh)
  })

  it('reusing one scratch trio across many particles stays correct per-particle', () => {
    const particles = initParticles(
      800,
      600,
      (() => {
        let n = 0
        return () => ((n = (n + 0.137) % 1), n)
      })(),
    )
    const dOut = makeDriftTarget()
    const rOut = makeRepulsion()
    const sOut = makeParticleStyle()

    for (const p of particles) {
      drift(p, 3.14, dOut)
      const r = repel(p, dOut.driftX, dOut.driftY, 400, 300, rOut)
      // The returned repulsion must reflect THIS particle, not a stale one.
      const expected = repel(p, dOut.driftX, dOut.driftY, 400, 300)
      expect(r.targetX).toBeCloseTo(expected.targetX)
      expect(r.targetY).toBeCloseTo(expected.targetY)
      expect(r.proximity).toBeCloseTo(expected.proximity)
      particleStyle(p, r.proximity, sOut)
      expect(sOut.radius).toBeCloseTo(particleStyle(p, r.proximity).radius)
    }
  })
})
