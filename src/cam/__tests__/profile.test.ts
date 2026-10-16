import { describe, expect, it } from 'vitest';
import type { ProfileOp, Tool, Vec2 } from '../../core/types';
import { profile2d } from '../profile';

const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

function op(overrides: Partial<ProfileOp> = {}): ProfileOp {
  return {
    kind: 'profile',
    id: 'op1',
    toolId: 't1',
    contours: [square(0, 10)],
    side: 'outside',
    allowance: 0,
    topZ: 0,
    floorZ: -2,
    stepDown: 1,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

/** XY loops cut per level (plunge → segments → retract), averaged. */
function loopExtents(moves: ReturnType<typeof profile2d>['moves']): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of moves) {
    if (!m.rapid && m.words.x !== undefined) {
      xs.push(m.words.x);
      ys.push(m.words.y!);
    }
  }
  return { xs, ys };
}

describe('profile2d', () => {
  it('offsets outside paths by the tool radius', () => {
    const res = profile2d(op(), tool);
    // 10mm square, Ø2 tool, outside: center path ≈ 12mm square with
    // rounded corners (12² − 4 corner areas + arcs)
    const { xs, ys } = loopExtents(res.moves);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(11.9);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(12.05);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(11.9);
  });

  it('offsets inside paths into the contour', () => {
    const res = profile2d(op({ side: 'inside' }), tool);
    const { xs } = loopExtents(res.moves);
    // 10mm square inset by 1mm: 8mm across
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(7.9);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(8.05);
  });

  it('follows the line exactly in online mode', () => {
    const res = profile2d(op({ side: 'online' }), tool);
    const { xs } = loopExtents(res.moves);
    expect(Math.max(...xs)).toBeCloseTo(10, 5);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
  });

  it('honors a wall allowance', () => {
    const res = profile2d(op({ allowance: 0.5 }), tool);
    const { xs } = loopExtents(res.moves);
    // outside + radius + allowance = 1.5mm out each side → 13mm across
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(12.9);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(13.05);
  });

  it('steps levels and retracts safely between passes', () => {
    const res = profile2d(op({ topZ: 0, floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.levels).toBe(3);
    expect(res.passes).toBe(3); // one wall pass per level
    const plunges = res.moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!)
      .sort((a, b) => b - a);
    expect([...new Set(plunges.map((z) => z.toFixed(3)))]).toEqual(['-1.000', '-2.000', '-2.500']);
    // one safe-Z retract per pass (plus the entry rapids carry safeZ too)
    const safeRetracts = res.moves.filter((m) => m.rapid && m.words.z === 5);
    expect(safeRetracts.length).toBe(6); // 3 entries + 3 retracts
    // approach rapids stop half a mm above each level
    const approaches = res.moves.filter((m) => m.rapid && m.words.z !== undefined && m.words.z !== 5);
    expect(approaches.length).toBe(3);
    expect(approaches.map((m) => m.words.z)).toEqual([-0.5, -1.5, -2]);
  });

  it('rejects an inside profile the tool cannot fit', () => {
    expect(() => profile2d(op({ side: 'inside', contours: [square(0, 1)] }), tool)).toThrowError(
      /leaves no path/,
    );
  });

  it('cuts a single level when top equals floor (finishing pass)', () => {
    const res = profile2d(op({ topZ: -2, floorZ: -2 }), tool);
    expect(res.levels).toBe(1);
    expect(res.passes).toBe(1);
  });

  it('rejects invalid parameters', () => {
    expect(() => profile2d(op({ floorZ: 1 }), tool)).toThrowError(/above topZ/);
    expect(() => profile2d(op({ contours: [] }), tool)).toThrowError(/contour/);
    expect(() => profile2d(op({ allowance: -1 }), tool)).toThrowError(/allowance/);
  });
});