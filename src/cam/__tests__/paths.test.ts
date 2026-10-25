import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/types';
import { simplifyContour } from '../paths';

/** CCW ring of n points on a circle of radius r. */
function circleRing(n: number, r: number): Vec2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/** CCW square of half-width w with `per` points per edge (corners kept). */
function subdividedSquare(w: number, per: number): Vec2[] {
  const corners: Vec2[] = [
    { x: w, y: -w },
    { x: w, y: w },
    { x: -w, y: w },
    { x: -w, y: -w },
  ];
  const out: Vec2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function signedArea(c: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Max distance from any original vertex to the simplified ring's edges —
 * the DP guarantee is that nothing strays further than the tolerance. */
function maxDeviation(original: Vec2[], simplified: Vec2[]): number {
  let worst = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i < simplified.length; i++) {
      const a = simplified[i];
      const b = simplified[(i + 1) % simplified.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      best = Math.min(best, Math.hypot(p.x - (a.x + tc * dx), p.y - (a.y + tc * dy)));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('simplifyContour', () => {
  it('loses most vertices on a fine circle while staying within tolerance', () => {
    const original = circleRing(100, 1);
    const simplified = simplifyContour(original, 0.01);
    expect(simplified.length).toBeGreaterThanOrEqual(3);
    expect(simplified.length).toBeLessThan(50); // most of the 100 dropped
    // no original vertex strays further than the tolerance from the result
    expect(maxDeviation(original, simplified)).toBeLessThanOrEqual(0.01);
    // and the enclosed area survives: an inscribed ring, but within ~2%
    // (n kept ≈ 360°/14.4° from the 16.3° split threshold)
    const a = Math.abs(signedArea(simplified));
    expect(a).toBeLessThanOrEqual(Math.PI);
    expect(a).toBeGreaterThanOrEqual(0.98 * Math.PI);
  });

  it('keeps the sharp corners of a polygon and drops only collinear runs', () => {
    const original = subdividedSquare(2, 25); // 100 points, 4 true corners
    const simplified = simplifyContour(original, 0.01);
    expect(simplified).toHaveLength(4);
    expect(maxDeviation(original, simplified)).toBeLessThanOrEqual(1e-9);
    for (const corner of [
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: -2, y: -2 },
    ]) {
      expect(simplified.some((p) => Math.abs(p.x - corner.x) < 1e-9 && Math.abs(p.y - corner.y) < 1e-9)).toBe(true);
    }
    // winding and area preserved
    expect(signedArea(simplified)).toBeCloseTo(16, 9);
  });

  it('returns sub-3-point contours unchanged', () => {
    expect(simplifyContour([], 0.01)).toEqual([]);
    const two: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(simplifyContour(two, 0.01)).toEqual(two);
  });

  it('refuses to collapse a contour that is entirely under the tolerance', () => {
    // everything within 0.001mm of one point: a 2-vertex "loop" would be
    // degenerate — the original comes back instead
    const tiny: Vec2[] = [
      { x: 0, y: 0 },
      { x: 0.0005, y: 0 },
      { x: 0.0005, y: 0.0005 },
      { x: 0, y: 0.0005 },
    ];
    const res = simplifyContour(tiny, 1);
    expect(res).toHaveLength(4);
  });
});