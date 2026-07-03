import { describe, it, expect, afterEach } from "vitest";
import {
  FrameMeter,
  percentile,
  perfHudEnabled,
  formatStats,
} from "../lib/perf.js";

describe("percentile", () => {
  it("returns 0 for an empty array", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("returns the single element for length 1", () => {
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("computes median of an odd-length sorted array", () => {
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
  });

  it("interpolates between neighbours", () => {
    // p50 of [10,20] = index 0.5 -> 15
    expect(percentile([10, 20], 0.5)).toBe(15);
  });

  it("computes p95 near the top of the range", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // idx = 0.95 * 99 = 94.05 -> between sorted[94]=95 and sorted[95]=96
    expect(percentile(sorted, 0.95)).toBeCloseTo(95.05, 5);
  });
});

describe("FrameMeter", () => {
  it("returns null stats with no samples", () => {
    expect(new FrameMeter().stats()).toBeNull();
  });

  it("aggregates recorded samples", () => {
    const m = new FrameMeter();
    for (const v of [4, 1, 2, 3, 5]) m.record(v);
    const s = m.stats()!;
    expect(s.count).toBe(5);
    expect(s.median).toBe(3);
    expect(s.max).toBe(5);
    expect(s.fpsFromMedian).toBeCloseTo(1000 / 3);
  });

  it("evicts oldest samples beyond capacity", () => {
    const m = new FrameMeter(3);
    m.record(100); // should be evicted
    m.record(1);
    m.record(2);
    m.record(3);
    const s = m.stats()!;
    expect(s.count).toBe(3);
    expect(s.max).toBe(3); // the 100 is gone
  });

  it("derives fps from the median frame-work time", () => {
    const m = new FrameMeter();
    for (let i = 0; i < 10; i++) m.record(16.67);
    expect(m.stats()!.fpsFromMedian).toBeCloseTo(60, 0);
  });
});

describe("perfHudEnabled", () => {
  const origSearch = window.location.search;

  afterEach(() => {
    // restore
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: origSearch },
      writable: true,
      configurable: true,
    });
    localStorage.clear();
  });

  function setSearch(search: string): void {
    Object.defineProperty(window, "location", {
      value: { ...window.location, search },
      writable: true,
      configurable: true,
    });
  }

  it("is false with no flag", () => {
    setSearch("");
    localStorage.clear();
    expect(perfHudEnabled()).toBe(false);
  });

  it("is true with ?perfhud", () => {
    setSearch("?perfhud");
    expect(perfHudEnabled()).toBe(true);
  });

  it("is true with ?perfhud among other params", () => {
    setSearch("?foo=1&perfhud&bar=2");
    expect(perfHudEnabled()).toBe(true);
  });

  it("does not match a substring like ?perfhudxyz", () => {
    setSearch("?perfhudxyz=1");
    expect(perfHudEnabled()).toBe(false);
  });

  it("is true when localStorage perfhud=1", () => {
    setSearch("");
    localStorage.setItem("perfhud", "1");
    expect(perfHudEnabled()).toBe(true);
  });
});

describe("formatStats", () => {
  it("renders a compact single-line summary", () => {
    const line = formatStats("aurora[pattern]", {
      count: 240,
      median: 2.5,
      p95: 4.1,
      max: 9.0,
      fpsFromMedian: 400,
    });
    expect(line).toContain("aurora[pattern]");
    expect(line).toContain("med 2.50ms");
    expect(line).toContain("p95 4.10ms");
    expect(line).toContain("400 fps");
  });
});
