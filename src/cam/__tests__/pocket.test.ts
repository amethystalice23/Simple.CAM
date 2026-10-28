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
    // even ladder (Alice's strategy, 2026-10-28): 2.5mm in n=3 equal
    // 0.8333… rungs — no thin remainder at the floor
    expect(unique).toEqual(['-0.833', '-1.667', '-2.500']);
  });

  it('approach rapids stay above the standing material (the sim yellow-streak fix)', () => {
    // step-down 1 > the 0.5 approach clearance: levelZ + 0.5 sits BELOW the
    // standing surface, so every loop-start rapid plowed the band — in the
    // carve sim that painted a yellow streak at each contour's plunge point
    // (Alice, 2026-10-26). The approach plane must clear the SURFACE at the
    // first level and the PREVIOUS level's cut after that.
    const o = op({ topZ: 0, floorZ: -2.5, stepDown: 1 });
    const res = pocket2d(o, tool);
    const safeZ = o.travelZ ?? o.topZ + o.safeClearance;
    let standing = o.topZ; // nothing in-region stands above the surface… yet
    const approachZ = new Set<string>();
    const offenders: string[] = [];
    for (const m of res.moves) {
      const z = m.words.z;
      if (z === undefined) continue;
      if (m.rapid) {
        if (z >= safeZ - 1e-6) continue; // the travel retract, not an approach
        approachZ.add(z.toFixed(3));
        if (z < standing + 0.5 - 1e-6) {
          offenders.push(`G0 Z${z} descends below standing ${standing} + 0.5`);
        }
      } else {
        // feed z words are plunge targets: after level N's plunges, the
        // region stands no higher than the deepest one seen
        standing = Math.min(standing, z);
      }
    }
    expect(offenders).toEqual([]);
    // one approach plane per level: surface + 0.5, then each previous even
    // cut + 0.5 — 0.8333…/1.6667… rungs → −0.333, −1.167 (toFixed-rounded)
    expect([...approachZ].map(Number).sort((a, b) => a - b)).toEqual([-1.167, -0.333, 0.5]);
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
    // plunges: passes × (approach-plane → cut depth) at plungeFeed; loops at
    // cut feed. The approach plane sits APPROACH_CLEARANCE above the
    // STANDING material (topZ at the first level — never a rapid through
    // stock), so the plunge feeds 1.5 (0.5 air + the 1mm band) per pass
    expect(res.estimatedMinutes).toBeCloseTo(len / 500 + (res.passes * 1.5) / 200, 5);
  });

  it('drops closed passes shorter than minLoopPerimeter, counting them', () => {
    // a 4.2mm square pockets to an 8.8mm-perimeter orbit at k=0, then a
    // 0.8mm-perimeter orbit at k=1 — a plunge-wiggle shorter than the tool
    // itself. The threshold drops it and says so; without one (the plain
    // pocket op's contract) every orbit is cut.
    const region = [square(-2.1, 4.2)];
    const plain = pocket2d(op({ regions: region }), tool);
    expect(plain.passes).toBe(2);
    expect(plain.droppedLoops).toBe(0);
    expect(passLoops(plain.moves)).toHaveLength(2);

    const filtered = pocket2d(op({ regions: region }), tool, { minLoopPerimeter: 2 });
    expect(filtered.passes).toBe(1);
    expect(filtered.droppedLoops).toBe(1);
    const loops = passLoops(filtered.moves);
    expect(loops).toHaveLength(1);
    expect(loopArea(loops[0])).toBeCloseTo(2.2 * 2.2, 5);
  });
});