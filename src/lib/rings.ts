export const RIPPLE_LIFE = 1.4;
export const MAX_RIPPLES = 7;

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
