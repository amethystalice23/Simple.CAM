import { describe, expect, it } from 'vitest';
import { segmentsForRadius } from '../meshSegments';

describe('segmentsForRadius (sagitta-scaled cylinder segments)', () => {
  it('small radii keep the 48 floor (rim circles stay fittable)', () => {
    expect(segmentsForRadius(0.5)).toBe(48);
    expect(segmentsForRadius(1)).toBe(48);
    expect(segmentsForRadius(2)).toBe(48);
  });

  it('scales with radius at the 0.02mm chord tolerance (the retical ring: Ø20)', () => {
    // the retical ring session (2026-11-03): a Ø20 part at the old fixed
    // 48 segments was "waaay too coarse… we did great on small scale
    // things, now we need to do better on large scale things too"
    expect(segmentsForRadius(10)).toBeGreaterThan(48);
    expect(segmentsForRadius(10)).toBeLessThanOrEqual(128); // ≈0.02mm chord
    expect(segmentsForRadius(25)).toBeGreaterThan(segmentsForRadius(10));
  });

  it('caps at 512 for huge radii', () => {
    expect(segmentsForRadius(1046)).toBe(512); // first radius hitting the cap
    expect(segmentsForRadius(10000)).toBe(512);
    expect(segmentsForRadius(1e9)).toBe(512);
  });

  it('every result is a multiple of 4 — a vertex lands on each cardinal', () => {
    // bounding-box measurements of the rendered cylinder stay exact (the
    // pinned primitive-bbox test caught a raw 50 putting no vertex at ±Y)
    for (const r of [0.5, 1, 3.175, 5, 10, 25, 100, 500, 1000]) {
      expect(segmentsForRadius(r) % 4).toBe(0);
    }
  });

  it('keeps chord deviation within the tolerance it promises', () => {
    for (const r of [10, 25, 100]) {
      const n = segmentsForRadius(r);
      const sag = r * (1 - Math.cos(Math.PI / n));
      expect(sag).toBeLessThanOrEqual(0.02 + 1e-12);
    }
  });

  it('degenerate inputs fall back to the floor', () => {
    expect(segmentsForRadius(0)).toBe(48);
    expect(segmentsForRadius(-1)).toBe(48);
    expect(segmentsForRadius(Number.NaN)).toBe(48);
  });
});
