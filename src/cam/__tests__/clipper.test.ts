import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/types';
import { difference, offsetInward } from '../clipper';

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
