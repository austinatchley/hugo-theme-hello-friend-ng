/** Linear interpolation between `a` and `b` by factor `k` (unclamped). */
export function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

/** Clamp `v` into the inclusive range [`min`, `max`]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Wrap `v` into the half-open range [0, 1). */
export function wrap01(v: number): number {
  return ((v % 1) + 1) % 1
}
