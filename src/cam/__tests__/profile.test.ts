import { describe, expect, it } from 'vitest';
import type { Move, ProfileOp, ProfileTabs, Tool, Vec2 } from '../../core/types';
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

/** One cut pass: the XY the plunge landed on plus every feed XY endpoint. */
interface CutPass {
  plunge: Vec2;
  points: Vec2[];
}

/** Cut passes whose plunge sits at `levelZ` (plunge → feed moves → retract). */
function cutPasses(moves: Move[], levelZ: number): CutPass[] {
  const passes: CutPass[] = [];
  let lastXY: Vec2 | null = null;
  let current: CutPass | null = null;
  const close = () => {
    if (current) passes.push(current);
    current = null;
  };
  for (const m of moves) {
    if (m.words.x !== undefined) lastXY = { x: m.words.x, y: m.words.y! };
    if (m.rapid) {
      close();
      continue;
    }
    if (m.words.z !== undefined) {
      close();
      if (Math.abs(m.words.z - levelZ) < 1e-9 && lastXY) current = { plunge: lastXY, points: [] };
      continue;
    }
    if (m.words.x !== undefined && current) current.points.push({ x: m.words.x, y: m.words.y! });
  }
  close();
  return passes;
}

/** Total feed-move distance of a pass chain, plunge point included. */
function passLength(p: CutPass): number {
  let len = 0;
  let prev = p.plunge;
  for (const q of p.points) {
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return len;
}

/**
 * Arc position on the ONLINE square(0, 10) tool path (perimeter 40): the
 * bottom edge is arc 0…10, right 10…20, top 20…30 (reversed), left 30…40.
 * Throws when a point is off the loop — every cut must ride it exactly.
 */
function arcOf(p: Vec2): number {
  const e = 1e-6;
  if (Math.abs(p.y) < e) return p.x;
  if (Math.abs(p.x - 10) < e) return 10 + p.y;
  if (Math.abs(p.y - 10) < e) return 20 + (10 - p.x);
  if (Math.abs(p.x) < e) return 30 + (10 - p.y);
  throw new Error(`point off the square loop: ${p.x},${p.y}`);
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
    expect([...new Set(plunges.map((z) => z.toFixed(3)))]).toEqual(['-0.833', '-1.667', '-2.500']);
    // one safe-Z retract per pass (plus the entry rapids carry safeZ too)
    const safeRetracts = res.moves.filter((m) => m.rapid && m.words.z === 5);
    expect(safeRetracts.length).toBe(6); // 3 entries + 3 retracts
    // approach rapids stop half a mm above each even level (2.5/3 rungs)
    const approaches = res.moves.filter((m) => m.rapid && m.words.z !== undefined && m.words.z !== 5);
    expect(approaches.length).toBe(3);
    expect(approaches.map((m) => m.words.z)).toEqual([0.5 - 2.5 / 3, 0.5 - (2 * 2.5) / 3, -2.5 + 0.5]);
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

  it('pins the no-tabs output to the pre-tabs baseline', () => {
    const res = profile2d(op(), tool);
    expect(res.warnings).toEqual([]);
    expect(res.moves.length).toBe(50); // 2 levels × (entry 4 + 20 loop cuts + retract)
    expect(res.passes).toBe(2);
    expect(res.estimatedMinutes).toBeCloseTo(0.1899418798617789, 6);
  });
});

describe('profile2d tabs', () => {
  // the ONLINE square rides the line exactly: perimeter 40, corners at
  // arc 0/10/20/30 — the only mode where tab arc positions are hand-checkable
  const tabs = (overrides: Partial<ProfileTabs> = {}): ProfileTabs => ({
    count: 3,
    height: 0.5,
    length: 3,
    ...overrides,
  });

  /** default tabbed op: 2 levels (−1, −2), tab top at −1.5 between them */
  function tabOp(overrides: Partial<ProfileOp> = {}, tabOverrides: Partial<ProfileTabs> = {}): ProfileOp {
    return op({ side: 'online', tabs: tabs(tabOverrides), ...overrides });
  }

  /** arc-distance of a point to the nearest tab center (≤ tab half-length → inside). */
  function tabDeflection(a: number, count: number): number {
    const P = 40;
    let best = Infinity;
    for (let k = 0; k < count; k++) {
      const c = ((k + 0.5) * P) / count;
      let d = Math.abs(a - c) % P;
      if (d > P / 2) d = P - d;
      best = Math.min(best, d);
    }
    return best;
  }

  it('cuts the shallow level unbroken and the deep level as spans between tabs', () => {
    const res = profile2d(tabOp(), tool);
    expect(res.warnings).toEqual([]);
    expect(res.levels).toBe(2);

    // level −1 is above the tab top (−1.5): ONE closed full pass
    const shallow = cutPasses(res.moves, -1);
    expect(shallow.length).toBe(1);
    const s = shallow[0];
    const last = s.points[s.points.length - 1];
    expect(last.x).toBeCloseTo(s.plunge.x, 6);
    expect(last.y).toBeCloseTo(s.plunge.y, 6);
    expect(passLength(s)).toBeCloseTo(40, 6); // the whole perimeter

    // level −2 is below: exactly 3 cut spans, retract + travel between them
    const deep = cutPasses(res.moves, -2);
    expect(deep.length).toBe(3);

    // no cut move endpoint — nor any plunge — inside a tab arc window
    for (const p of deep) {
      for (const q of [p.plunge, ...p.points]) {
        expect(tabDeflection(arcOf(q), 3)).toBeGreaterThanOrEqual(1.5 - 1e-6);
      }
    }
    // the uncut 9mm is exactly 3 tabs of 3mm; the deep level cuts the rest
    const cut = deep.reduce((sum, p) => sum + passLength(p), 0);
    expect(cut).toBeCloseTo(40 - 3 * 3, 6);
    expect(cut).toBeLessThan(40);

    // span entries follow the pass convention and never combine Z with XY
    for (const m of res.moves) {
      if (m.words.z !== undefined) {
        expect(m.words.x).toBeUndefined();
        expect(m.words.y).toBeUndefined();
      }
    }
  });

  it('places tab centers clear of the loop start so none straddle it', () => {
    const res = profile2d(tabOp(), tool);
    const deep = cutPasses(res.moves, -2);
    // centers (k + ½)·40/3 → 6.67, 20, 33.33: all clear of arc 0, so the
    // loop start belongs to a SPAN — the wrap-around span crosses it and
    // cuts through the origin vertex
    const wrap = deep.find((p) => arcOf(p.plunge) > 30);
    expect(wrap).toBeDefined();
    expect(arcOf(wrap!.plunge)).toBeCloseTo(100 / 3 + 1.5, 6);
    expect(wrap!.points.some((q) => q.x === 0 && q.y === 0)).toBe(true);
  });

  it('cuts the FULL loop on a level exactly at the tab top', () => {
    // height 1 → tab top at −1, exactly level −1's z: through-cut allowed
    const res = profile2d(tabOp({}, { height: 1 }), tool);
    expect(cutPasses(res.moves, -1).length).toBe(1);
    expect(cutPasses(res.moves, -2).length).toBe(3);
  });

  it('clamps the tab count to what the perimeter fits, with a warning', () => {
    // 40mm loop, 3mm tabs → 13 fit; 20 asked → clamped
    const res = profile2d(
      tabOp({ topZ: 0, floorZ: -2, stepDown: 2 }, { count: 20 }),
      tool,
    );
    expect(res.warnings).toEqual(['tab count clamped to 13 on a 40.0mm loop']);
    // single level −2, below the tab top (−1): 13 spans
    expect(cutPasses(res.moves, -2).length).toBe(13);
    const cut = cutPasses(res.moves, -2).reduce((sum, p) => sum + passLength(p), 0);
    expect(cut).toBeCloseTo(40 - 13 * 3, 6);
  });

  it('keeps an unfitted count as-is (no clamp warning)', () => {
    // 10 tabs of 3mm fit the 40mm loop — nothing to warn about
    const res = profile2d(tabOp({ stepDown: 2 }, { count: 10 }), tool);
    expect(res.warnings).toEqual([]);
    expect(cutPasses(res.moves, -2).length).toBe(10);
  });

  it('cuts a loop shorter than one tab unbroken, with a warning', () => {
    const res = profile2d(tabOp({ floorZ: -2, stepDown: 2 }, { length: 45 }), tool);
    expect(res.warnings).toEqual(['loop too short for tabs — cut through uncut']);
    // even the floor level cuts the full loop in one piece
    const deep = cutPasses(res.moves, -2);
    expect(deep.length).toBe(1);
    expect(passLength(deep[0])).toBeCloseTo(40, 6);
  });

  it('is a no-op when the tab height reaches above the cut band', () => {
    // height 2 → tab top at 0 = the surface: no bridge survives anywhere
    const res = profile2d(tabOp({ floorZ: -2, stepDown: 2 }, { height: 2 }), tool);
    expect(res.warnings).toEqual(['tab height reaches above the cut band — no bridges left standing']);
    // and the moves are exactly the tabs-free op's
    const plain = profile2d(op({ side: 'online', floorZ: -2, stepDown: 2 }), tool);
    expect(res.moves).toEqual(plain.moves);
  });

  it('applies identically to inside and outside offsets', () => {
    for (const side of ['inside', 'outside'] as const) {
      const res = profile2d(tabOp({ side }), tool);
      expect(res.warnings).toEqual([]);
      expect(cutPasses(res.moves, -1).length).toBe(1); // above the tab top
      expect(cutPasses(res.moves, -2).length).toBe(3); // spans below it
    }
  });

  it('rejects invalid tab parameters', () => {
    expect(() => profile2d(tabOp({}, { count: 0 }), tool)).toThrowError(/count/);
    expect(() => profile2d(tabOp({}, { count: 2.5 }), tool)).toThrowError(/count/);
    expect(() => profile2d(tabOp({}, { height: 0 }), tool)).toThrowError(/height/);
    expect(() => profile2d(tabOp({}, { length: 0 }), tool)).toThrowError(/length/);
  });
});