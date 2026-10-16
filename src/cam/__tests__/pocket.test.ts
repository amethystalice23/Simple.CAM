import { describe, expect, it } from 'vitest';
import type { PocketOp, Tool, Vec2 } from '../../core/types';
import { pocket2d } from '../pocket';

const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

/** CCW square contour. */
function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

function op(overrides: Partial<PocketOp> = {}): PocketOp {
  return {
    kind: 'pocket',
    id: 'op1',
    toolId: 't1',
    regions: [square(0, 10)],
    topZ: 0,
    floorZ: -1,
    stepDown: 1,
    stepOver: 1,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

function loopArea(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Extract the XY loops of all cutting passes (plunge → segments → retract). */
function passLoops(moves: ReturnType<typeof pocket2d>['moves']): Vec2[][] {
  const loops: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let lastX: number | null = null;
  let lastY: number | null = null;
  for (const m of moves) {
    if (m.words.x !== undefined) {
      lastX = m.words.x;
      lastY = m.words.y!;
    }
    if (m.rapid) {
      if (current && current.length > 2) loops.push(current);
      current = null;
      continue;
    }
    if (m.words.z !== undefined) {
      // plunge: the loop starts at the XY the rapid just positioned
      if (current && current.length > 2) loops.push(current);
      current = lastX !== null && lastY !== null ? [{ x: lastX, y: lastY }] : null;
      continue;
    }
    if (m.words.x !== undefined && current) {
      current.push({ x: m.words.x, y: m.words.y! });
    }
  }
  if (current && current.length > 2) loops.push(current);
  return loops;
}

describe('pocket2d', () => {
  it('cuts contour-parallel passes shrinking by the step-over', () => {
    const res = pocket2d(op(), tool);
    expect(res.levels).toBe(1);
    // 10mm square, Ø2 tool, 1mm step-over: insets 1..4 leave 8/6/4/2mm
    // loops; the fifth inset degenerates to a point and drops out
    expect(res.passes).toBe(4);
    const loops = passLoops(res.moves);
    const areas = loops.map(loopArea).sort((a, b) => b - a);
    // largest pass ≈ 8mm square with round corners (8² − (4−π))
    expect(areas[0]).toBeGreaterThan(60);
    expect(areas[0]).toBeLessThanOrEqual(64);
    expect(areas[areas.length - 1]).toBeGreaterThan(0);
    // outer loops are CCW (positive area) — conventional for pockets
    expect(areas[0]).toBeGreaterThan(0);
  });

  it('steps Z levels clamped to the floor', () => {
    const res = pocket2d(op({ topZ: 0, floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.levels).toBe(3);
    const plunges = res.moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!)
      .sort((a, b) => b - a);
    const unique = [...new Set(plunges.map((z) => z.toFixed(3)))];
    expect(unique).toEqual(['-1.000', '-2.000', '-2.500']);
  });

  it('clears around islands (holes grow as passes shrink)', () => {
    const outer = square(0, 10);
    const hole: Vec2[] = [...square(3, 4)].reverse(); // CW hole
    const res = pocket2d(op({ regions: [outer, hole] }), tool);
    // the ring is 3mm wide; each pass narrows it by 2×step-over (the hole
    // grows while the outer shrinks), so only the first inset survives
    expect(res.passes).toBe(2);
    const loops = passLoops(res.moves);
    expect(loops.length).toBe(2); // outer wall + island wall in one pass
  });

  it('rejects a tool that cannot fit the region', () => {
    expect(() => pocket2d(op({ regions: [square(0, 1)] }), { ...tool, diameter: 4 }, )).toThrowError(
      /does not fit/,
    );
  });

  it('cuts a single level when top equals floor (finishing pass)', () => {
    const res = pocket2d(op({ topZ: -2, floorZ: -2 }), tool);
    expect(res.levels).toBe(1);
    const plunges = res.moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!);
    expect(plunges.every((z) => z === -2)).toBe(true);
  });

  it('rejects invalid parameters', () => {
    expect(() => pocket2d(op({ floorZ: 1 }), tool)).toThrowError(/above topZ/);
    expect(() => pocket2d(op({ stepDown: 0 }), tool)).toThrowError(/stepDown/);
    expect(() => pocket2d(op({ regions: [] }), tool)).toThrowError(/region/);
  });

  it('emits an explicit feed on every G1', () => {
    const res = pocket2d(op(), tool);
    for (const m of res.moves) {
      if (!m.rapid) expect(m.feed).toBeGreaterThan(0);
    }
  });

  it('estimates cutting time from path lengths', () => {
    const res = pocket2d(op(), tool);
    expect(res.estimatedMinutes).toBeGreaterThan(0);
    const loops = passLoops(res.moves);
    let len = 0;
    for (const l of loops) {
      for (let i = 0; i < l.length; i++) {
        const p = l[i];
        const q = l[(i + 1) % l.length];
        len += Math.hypot(q.x - p.x, q.y - p.y);
      }
    }
    // plunges: passes × approach depth at plungeFeed; loops at cut feed
    expect(res.estimatedMinutes).toBeCloseTo(len / 500 + (res.passes * 0.5) / 200, 5);
  });
});