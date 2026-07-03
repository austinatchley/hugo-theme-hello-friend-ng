/**
 * Frame-timing instrumentation for the canvas animations.
 *
 * A FrameMeter records the wall-clock duration of each frame's work (measured
 * with performance.now() around the draw call, NOT the RAF interval) and
 * reports rolling median / p95 / max over a window. Pure and DOM-free so it can
 * be unit-tested; the optional on-screen HUD lives in the entry files.
 *
 * Enable in the browser via `?perfhud` in the URL or
 * localStorage.setItem("perfhud", "1").
 */

export interface FrameStats {
  /** Number of samples in the window. */
  count: number;
  median: number;
  p95: number;
  max: number;
  /** Mean frames-per-second implied by the median frame-work time. */
  fpsFromMedian: number;
}

export class FrameMeter {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 240) {
    this.capacity = capacity;
  }

  /** Record one frame's work duration in milliseconds. */
  record(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  /** Number of recorded samples currently in the window. */
  size(): number {
    return this.samples.length;
  }

  /** Compute rolling stats. Returns null when there are no samples. */
  stats(): FrameStats | null {
    const n = this.samples.length;
    if (n === 0) return null;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    return {
      count: n,
      median,
      p95: percentile(sorted, 0.95),
      max: sorted[n - 1],
      fpsFromMedian: median > 0 ? 1000 / median : 0,
    };
  }
}

/** Linear-interpolated percentile of a pre-sorted ascending array. */
export function percentile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = q * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** Whether the perf HUD is enabled via URL query or localStorage. */
export function perfHudEnabled(): boolean {
  try {
    if (typeof location !== "undefined" && /[?&]perfhud\b/.test(location.search)) {
      return true;
    }
    if (typeof localStorage !== "undefined" && localStorage.getItem("perfhud") === "1") {
      return true;
    }
  } catch {
    /* SSR / sandboxed contexts: treat as disabled */
  }
  return false;
}

export function formatStats(label: string, s: FrameStats): string {
  return (
    label +
    "  med " +
    s.median.toFixed(2) +
    "ms  p95 " +
    s.p95.toFixed(2) +
    "ms  max " +
    s.max.toFixed(2) +
    "ms  (" +
    s.fpsFromMedian.toFixed(0) +
    " fps)"
  );
}
