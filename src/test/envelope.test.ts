import { describe, it, expect } from 'vitest'
import { chaseFactor, haloOpacityStep } from '../lib/envelope.js'
import { bandFadeGeometry } from '../lib/bandfade.js'

const CHASE = { attack: 0.5, decay: 0.25, attackDist: 120 }

describe('chaseFactor', () => {
  it('uses the decay rate when fully settled (dist 0)', () => {
    expect(chaseFactor(CHASE, 0)).toBe(0.25)
  })

  it('uses the attack rate when far behind (dist >= attackDist)', () => {
    expect(chaseFactor(CHASE, 120)).toBe(0.5)
    expect(chaseFactor(CHASE, 1000)).toBe(0.5)
  })

  it('eases linearly between decay and attack in between', () => {
    expect(chaseFactor(CHASE, 60)).toBeCloseTo(0.375) // halfway
    expect(chaseFactor(CHASE, 0)).toBeLessThan(chaseFactor(CHASE, 60))
    expect(chaseFactor(CHASE, 60)).toBeLessThan(chaseFactor(CHASE, 120))
  })
})

const OPACITY = {
  attack: 0.5,
  decay: 0.05,
  settleDist: 0.5,
  restOpacity: 0.5,
  moveOpacity: 1,
}

describe('haloOpacityStep', () => {
  it('attacks toward full opacity while chasing', () => {
    const s = haloOpacityStep(OPACITY, 10)
    expect(s).toEqual({ factor: 0.5, target: 1 })
  })

  it('decays toward resting glow once settled', () => {
    const s = haloOpacityStep(OPACITY, 0.4)
    expect(s).toEqual({ factor: 0.05, target: 0.5 })
  })
})

describe('bandFadeGeometry', () => {
  it('centres the fade at the configured fraction of band height', () => {
    const g = bandFadeGeometry(100, 200, 0.3) // bandH 100 → fadePx 30
    expect(g.fadePx).toBe(30)
    expect(g.yTop).toBe(100)
    expect(g.yBot).toBe(200)
    expect(g.midTop).toBe(130)
    expect(g.midBot).toBe(170)
  })

  it('clamps fadePx to half the band height so ramps never overlap', () => {
    const g = bandFadeGeometry(100, 200, 0.8) // bandH 100 → would be 80
    expect(g.fadePx).toBe(50) // clamped to 100/2
    expect(g.midTop).toBe(150)
    expect(g.midBot).toBe(150) // degenerate single-row plateau, no overlap
  })

  it('still reserves at least 1px for tiny bands', () => {
    const g = bandFadeGeometry(0, 1, 0.3)
    expect(g.fadePx).toBe(1)
  })
})
