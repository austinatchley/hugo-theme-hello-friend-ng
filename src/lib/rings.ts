import { lerp } from "./math.js";

export const RING_PERIOD = 1.8;
export const RING_COUNT = 3;
export const RIPPLE_LIFE = 1.4;
export const MAX_RIPPLES = 7;

export interface RingStyle {
  radius: number;
  alpha: number;
  hue: number;
  sat: number;
  lum: number;
}

/**
 * Style for cursor ring `i` at time `t`. Rings pulse outward over
 * RING_PERIOD seconds, lerping gold (hue 48°) when born → teal (185°)
 * as they expand and fade.
 */
export function ringStyle(i: number, t: number): RingStyle {
  const phase = ((t / RING_PERIOD) + i / RING_COUNT) % 1;
  return {
    radius: phase * 75,
    alpha: (1 - phase) * 0.18,
    hue: lerp(48, 185, phase), // gold → teal
    sat: lerp(100, 80, phase),
    lum: lerp(78, 70, phase),
  };
}

export interface Ripple {
  x: number;
  y: number;
  born: number;
}

/** Push a ripple, evicting the oldest if at capacity. */
export function pushRipple(ripples: Ripple[], x: number, y: number, born: number): void {
  if (ripples.length >= MAX_RIPPLES) ripples.shift();
  ripples.push({ x, y, born });
}

export interface RippleStyle {
  radius: number;
  alpha: number;
  /** True once the ripple has exceeded its lifetime and should be removed. */
  expired: boolean;
}

/** Style for a ripple at time `t`; expands to 90px over RIPPLE_LIFE seconds. */
export function rippleStyle(ripple: Ripple, t: number): RippleStyle {
  const progress = (t - ripple.born) / RIPPLE_LIFE;
  return {
    radius: progress * 90,
    alpha: (1 - progress) * 0.4,
    expired: progress >= 1,
  };
}
