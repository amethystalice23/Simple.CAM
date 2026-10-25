import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/types';
import { difference, intersection, offsetInward, union } from '../clipper';

/** signed area via the shoelace formula */
const area = (c: Vec2[]): number => {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[][] => [
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
];

describe('difference (boolean a − b)', () => {
  it('subtracts a contained region, leaving a ring', () => {
    const outer = rect(0, 0, 10, 10);
    const hole = rect(4, 4, 6, 6);
    const res = difference(outer, hole);
    expect(res).toHaveLength(2); // outer + hole (CCW/CW nesting)
    const areas = res.map((c) => area(c)).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(-4, 5); // the hole, CW
    expect(areas[1]).toBeCloseTo(100, 5); // the outer, untouched
  });

  it('returns the subject untouched when the clip is empty', () => {
    const outer = rect(0, 0, 10, 10);
    expect(difference(outer, [])).toBe(outer);
  });

  it('returns [] when the subject is empty', () => {
    expect(difference([], rect(0, 0, 1, 1))).toEqual([]);
  });

  it('holes in the subject survive as holes of the difference', () => {
    // a ring subject minus a corner patch: nesting is preserved
    const ring = [rect(0, 0, 10, 10)[0], [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }].reverse()];
    const res = difference(ring, rect(8, 8, 12, 12));
    expect(res.length).toBeGreaterThanOrEqual(2);
    // the ring's hole is still present (a small CW loop)
    expect(res.some((c) => area(c) < 0)).toBe(true);
  });
});

describe('union (boolean a ∪ b ∪ …)', () => {
  it('merges overlapping squares into one CCW contour', () => {
    const res = union([...rect(0, 0, 10, 10), ...rect(5, 0, 15, 10)]);
    expect(res).toHaveLength(1);
    // [0,15]×[0,10] = 150, not the 200 of naive addition
    expect(area(res[0])).toBeCloseTo(150, 5);
    expect(area(res[0])).toBeGreaterThan(0); // CCW outer
  });

  it('preserves holes that no member covers (non-zero nesting)', () => {
    // a ring (CCW outer + CW hole) unioned with a disjoint square: the
    // hole survives as a CW loop, the disjoint outer stays separate
    const ring = [
      rect(0, 0, 10, 10)[0],
      [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }].reverse(),
    ];
    const res = union([...ring, ...rect(12, 12, 18, 18)]);
    expect(res.length).toBeGreaterThanOrEqual(3); // outer + hole + disjoint outer
    expect(res.filter((c) => area(c) > 0)).toHaveLength(2);
    expect(res.filter((c) => area(c) < 0)).toHaveLength(1);
    expect(area(res.find((c) => area(c) < 0)!)).toBeCloseTo(-4, 5);
  });

  it('fills a hole that a member covers', () => {
    // the same ring plus a square swallowing the hole: non-zero winding
    // (outer +1, hole −1, patch +1) fills the hole → a solid 10×10
    const ring = [
      rect(0, 0, 10, 10)[0],
      [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }].reverse(),
    ];
    const res = union([...ring, ...rect(3, 3, 7, 7)]);
    expect(res).toHaveLength(1);
    expect(area(res[0])).toBeCloseTo(100, 5);
  });

  it('returns [] for empty input', () => {
    expect(union([])).toEqual([]);
  });
});

describe('intersection (boolean a ∩ b)', () => {
  it('keeps only the overlap of two squares', () => {
    const res = intersection(rect(0, 0, 10, 10), rect(5, 5, 15, 15));
    expect(res).toHaveLength(1);
    const [c] = res;
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(5, 3);
    expect(Math.max(...xs)).toBeCloseTo(10, 3);
    expect(Math.min(...ys)).toBeCloseTo(5, 3);
    expect(Math.max(...ys)).toBeCloseTo(10, 3);
    expect(area(c)).toBeCloseTo(25, 5);
    expect(area(c)).toBeGreaterThan(0); // CCW outer
  });

  it('preserves holes from the subject (non-zero nesting)', () => {
    // ring ∩ a square straddling the hole: the hole is outside the
    // subject's non-zero winding, so it stays a hole of the intersection
    const ring = [
      rect(0, 0, 10, 10)[0],
      [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }].reverse(),
    ];
    const res = intersection(ring, rect(2, 2, 8, 8));
    expect(res).toHaveLength(2); // [2,8]² outer + [4,6]² hole
    const hole = res.find((c) => area(c) < 0);
    const outer = res.find((c) => area(c) > 0);
    expect(hole).toBeDefined();
    expect(outer).toBeDefined();
    expect(area(hole!)).toBeCloseTo(-4, 5); // the hole, CW
    expect(area(outer!)).toBeCloseTo(36, 5); // net region = 36 − 4 = 32
  });

  it('returns [] for disjoint inputs', () => {
    expect(intersection(rect(0, 0, 1, 1), rect(5, 5, 6, 6))).toEqual([]);
  });

  it('returns [] when either side is empty', () => {
    expect(intersection([], rect(0, 0, 1, 1))).toEqual([]);
    expect(intersection(rect(0, 0, 1, 1), [])).toEqual([]);
  });
});

describe('offsetInward (existing kernel, sanity alongside difference)', () => {
  it('insets a rectangle by delta', () => {
    const res = offsetInward(rect(0, 0, 10, 10), 1);
    expect(res).toHaveLength(1);
    const [c] = res;
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(1, 3);
    expect(Math.max(...xs)).toBeCloseTo(9, 3);
    expect(Math.min(...ys)).toBeCloseTo(1, 3);
    expect(Math.max(...ys)).toBeCloseTo(9, 3);
  });
});
