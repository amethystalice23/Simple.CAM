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

/** Extract the XY loops of all cutting passes (entry ramp → segments →
 *  retract). Ramp legs are entry, not loop geometry — they position the
 *  pass start; a straight plunge (the air/degenerate fallback) opens the
 *  loop at the XY the rapids just positioned, as in v1. */
function passLoops(moves: ReturnType<typeof pocket2d>['moves']): Vec2[][] {
  const loops: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let lastX: number | null = null;
  let lastY: number | null = null;
  const close = () => {
    if (current && current.length > 2) loops.push(current);
    current = null;
  };
  for (const m of moves) {
    if (m.words.x !== undefined) {
      lastX = m.words.x;
      lastY = m.words.y!;
    }
    if (m.rapid) {
      close();
      continue;
    }
    if (m.comment?.includes('stay-down link')) {
      close(); // a link ENDS the previous pass and starts the next
      continue;
    }
    if (m.words.z !== undefined && m.words.x !== undefined) continue; // ramp leg
    if (m.words.z !== undefined) {
      // straight-plunge fallback: the loop starts where the rapid positioned
      close();
      current = lastX !== null && lastY !== null ? [{ x: lastX, y: lastY }] : null;
      continue;
    }
    if (m.words.x !== undefined) {
      if (current === null && lastX !== null && lastY !== null) {
        current = [{ x: lastX, y: lastY }]; // post-ramp cut start
      }
      if (current) current.push({ x: m.words.x, y: m.words.y! });
    }
  }
  close();
  return loops;
}

/** Landing depths of every entry — the z each pass's ramp or plunge ends
 *  on (the cut level). Ramp runs collapse to their last z; a new run
 *  starts whenever the depth does not descend. */
function entryLandings(moves: ReturnType<typeof pocket2d>['moves']): number[] {
  const zs = moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);
  const runs: number[][] = [];
  for (const z of zs) {
    const last = runs[runs.length - 1];
    if (!last || z > last[last.length - 1] + 1e-12) runs.push([z]);
    else last.push(z);
  }
  return runs.map((r) => r[r.length - 1]);
}

describe('pocket2d', () => {
  it('cuts contour-parallel passes shrinking by the step-over', () => {
    const res = pocket2d(op(), tool);
    expect(res.levels).toBe(1);
    // 10mm square, Ø2 tool, 1mm step-over: insets 1..4 leave 8/6/4/2mm
    // loops; the fifth inset degenerates to a point and drops out
    expect(res.passes).toBe(4);
    const loops = passLoops(res.moves);
    const areas = loops.map((l) => Math.abs(loopArea(l))).sort((a, b) => b - a);
    // largest pass ≈ 8mm square with round corners (8² − (4−π))
    expect(areas[0]).toBeGreaterThan(60);
    expect(areas[0]).toBeLessThanOrEqual(64);
    expect(areas[areas.length - 1]).toBeGreaterThan(0);
    // CLIMB MILLING (Alice's ruling, 2026-10-29: always climb): outer-wall
    // orbits travel CW — the material (the wall, outside the loop) sits on
    // the LEFT of travel. CW = negative shoelace area.
    expect(loopArea(loops[0])).toBeLessThan(0);
  });

  it('steps Z levels clamped to the floor', () => {
    const res = pocket2d(op({ topZ: 0, floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.levels).toBe(3);
    // every pass's ENTRY lands on on its level — the ramp's last z word
    const unique = [...new Set(entryLandings(res.moves).map((z) => z.toFixed(3)))];
    // even ladder (Alice's strategy, 2026-10-28): 2.5mm in n=3 equal
    // 0.8333… rungs — no thin remainder at the floor
    expect(unique).toEqual(['-0.833', '-1.667', '-2.500']);
  });

  it('approach rapids stay above the standing material (the sim yellow-streak fix)', () => {
    const o = op({ topZ: 0, floorZ: -2.5, stepDown: 1 });
    const res = pocket2d(o, tool);
    const safeZ = o.travelZ ?? o.topZ + o.safeClearance;
    let standing = o.topZ;
    const approachZ = new Set<string>();
    const offenders: string[] = [];
    for (const m of res.moves) {
      const z = m.words.z;
      if (z === undefined) continue;
      if (m.rapid) {
        if (z >= safeZ - 1e-6) continue;
        approachZ.add(z.toFixed(3));
        if (z < standing + 0.5 - 1e-6) {
          offenders.push(`G0 Z${z} descends below standing ${standing} + 0.5`);
        }
      } else {
        standing = Math.min(standing, z);
      }
    }
    expect(offenders).toEqual([]);
    expect([...approachZ].map(Number).sort((a, b) => a - b)).toEqual([-1.167, -0.333, 0.5]);
  });

  it('clamps clearing loops to the stock footprint (tail-stock cut-over off)', () => {
    const region = [square(0, 10)];
    const footprint = [square(0, 3.5)];
    const clamped = pocket2d(op({ regions: region, footprint }), tool);
    const free = pocket2d(op({ regions: region }), tool);
    expect(clamped.passes).toBeGreaterThan(0);
    expect(clamped.passes).toBeLessThan(free.passes);
    const xy = clamped.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(xy.length).toBeGreaterThan(0);
    for (const m of xy) {
      expect(m.words.x!).toBeGreaterThanOrEqual(-1e-6);
      expect(m.words.x!).toBeLessThanOrEqual(3.5 + 1e-6);
      expect(m.words.y!).toBeGreaterThanOrEqual(-1e-6);
      expect(m.words.y!).toBeLessThanOrEqual(3.5 + 1e-6);
    }
    expect(xy.some((m) => Math.abs(m.words.x! - 3.5) < 1e-9)).toBe(true);
  });

  it('a region entirely outside the stock does not fit — honest throw', () => {
    expect(() =>
      pocket2d(op({ regions: [square(20, 10)], footprint: [square(0, 6)] }), tool),
    ).toThrowError(/does not fit the pocket region/);
  });

  it('clears around islands (holes grow as passes shrink)', () => {
    const outer = square(0, 10);
    const hole: Vec2[] = [...square(3, 4)].reverse();
    const res = pocket2d(op({ regions: [outer, hole] }), tool);
    expect(res.passes).toBe(2);
    const loops = passLoops(res.moves);
    expect(loops.length).toBe(2);
  });

  it('rejects a tool that cannot fit the region', () => {
    expect(() => pocket2d(op({ regions: [square(0, 1)] }), { ...tool, diameter: 4 }, )).toThrowError(
      /does not fit/,
    );
  });

  it('cuts a single level when top equals floor (finishing pass)', () => {
    const res = pocket2d(op({ topZ: -2, floorZ: -2 }), tool);
    expect(res.levels).toBe(1);
    expect(res.entries.helical).toBe(0);
    expect(res.entries.plunge + res.links).toBe(res.passes);
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
    let x = 0;
    let y = 0;
    let z = 0;
    let minutes = 0;
    for (const m of res.moves) {
      const nx = m.words.x ?? x;
      const ny = m.words.y ?? y;
      const nz = m.words.z ?? z;
      if (!m.rapid) minutes += Math.hypot(nx - x, ny - y, nz - z) / m.feed;
      x = nx;
      y = ny;
      z = nz;
    }
    expect(res.estimatedMinutes).toBeCloseTo(minutes, 6);
  });

  it('ramps every material entry — never a straight plunge into stock', () => {
    const res = pocket2d(op({ floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.passes).toBe(12);
    expect(res.entries.helical + res.links + res.entries.plunge).toBe(12);
    expect(res.entries.plunge).toBe(0);
    expect(res.links).toBeGreaterThan(0);
    let i = 0;
    while (i < res.moves.length) {
      if (res.moves[i].words.z === undefined || res.moves[i].rapid || res.moves[i].words.x === undefined) {
        i++;
        continue;
      }
      const run: typeof res.moves = [];
      while (
        i < res.moves.length &&
        !res.moves[i].rapid &&
        res.moves[i].words.z !== undefined &&
        res.moves[i].words.x !== undefined
      ) {
        run.push(res.moves[i]);
        i++;
      }
      expect(run.length).toBeGreaterThan(1);
      let prevZ = Infinity;
      for (const m of run) {
        expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
        prevZ = m.words.z!;
      }
    }
  });

  it('stay-down links: passes that provably clear feed straight at depth', () => {
    const res = pocket2d(op(), tool);
    expect(res.links).toBe(2);
    const linkIdx = res.moves
      .map((m, i) => (m.comment?.includes('stay-down link') ? i : -1))
      .filter((i) => i >= 0);
    expect(linkIdx).toHaveLength(2);
    const toolR = 1;
    const loops = passLoops(res.moves);
    for (const i of linkIdx) {
      const m = res.moves[i];
      expect(m.rapid).toBeFalsy();
      expect(m.words.z).toBeUndefined();
      expect(m.feed).toBe(500);
      const priorPos = { x: 0, y: 0 };
      let px = 0;
      let py = 0;
      for (let j = i - 1; j >= 0; j--) {
        const q = res.moves[j];
        if (q.words.x !== undefined) {
          px = q.words.x;
          py = q.words.y!;
          break;
        }
      }
      const len = Math.hypot(m.words.x! - px, m.words.y! - py);
      const steps = Math.max(2, Math.ceil(len / 0.05));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const sx = px + (m.words.x! - px) * t;
        const sy = py + (m.words.y! - py) * t;
        let best = Infinity;
        for (const l of loops) {
          for (let v = 0; v < l.length; v++) {
            const a = l[v];
            const b = l[(v + 1) % l.length];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const ab2 = abx * abx + aby * aby;
            if (ab2 < 1e-18) continue;
            const f = Math.max(0, Math.min(1, ((sx - a.x) * abx + (sy - a.y) * aby) / ab2));
            const dist = Math.hypot(sx - (a.x + abx * f), sy - (a.y + aby * f));
            best = Math.min(best, dist);
          }
        }
        expect(best).toBeLessThanOrEqual(toolR + 1e-6);
      }
    }
    // fix: use a valid index for the rapid check
    const firstFeedIdx = res.moves.findIndex(m => !m.rapid);
    expect(res.moves.slice(firstFeedIdx, firstFeedIdx + 2).some((m) => m.rapid)).toBe(false);
  });

  it('pins the helical entry geometry: full revolutions of the cut loop', () => {
    const res = pocket2d(op(), tool);
    expect(res.entries.helical).toBe(2);
    const runs: ReturnType<typeof pocket2d>['moves'][] = [];
    let cur: ReturnType<typeof pocket2d>['moves'] = [];
    for (const m of res.moves) {
      if (!m.rapid && m.words.x !== undefined && m.words.z !== undefined) cur.push(m);
      else if (cur.length > 0) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) runs.push(cur);
    expect(runs.length).toBe(2);
    const run = runs[0];
    const last = run[run.length - 1];
    expect(last.words.z).toBeCloseTo(-1, 9);
    const firstLoop = passLoops(res.moves)[0];
    let perim = 0;
    for (let i = 0; i < firstLoop.length; i++) {
      const p = firstLoop[i];
      const q = firstLoop[(i + 1) % firstLoop.length];
      perim += Math.hypot(q.x - p.x, q.y - p.y);
    }
    const firstIdx = res.moves.indexOf(run[0]);
    let entryX = 0;
    let entryY = 0;
    for (let i = firstIdx - 1; i >= 0; i--) {
      if (res.moves[i].words.x !== undefined) {
        entryX = res.moves[i].words.x!;
        entryY = res.moves[i].words.y!;
        break;
      }
    }
    let len = 0;
    let closes = 0;
    let px = entryX;
    let py = entryY;
    let prevZ = Infinity;
    for (let i = 0; i < run.length; i++) {
      const m = run[i];
      const dxy = Math.hypot(m.words.x! - px, m.words.y! - py);
      len += dxy;
      const dz = prevZ - m.words.z!;
      if (i > 0 && dz > 0) {
        expect(dz / Math.max(dxy, 1e-12)).toBeLessThanOrEqual(Math.tan((3 * Math.PI) / 180) + 1e-9);
      }
      if (Math.hypot(m.words.x! - last.words.x!, m.words.y! - last.words.y!) < 1e-9) closes++;
      expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
      prevZ = m.words.z!;
      px = m.words.x!;
      py = m.words.y!;
    }
    expect(closes).toBe(2);
    expect(len).toBeCloseTo(2 * perim, 5);
  });

  it('drops closed passes shorter than minLoopPerimeter, counting them', () => {
    const res = pocket2d(op({ regions: [square(-2.1, 4.2)] }), tool);
    expect(res.passes).toBe(2);
    expect(res.droppedLoops).toBe(0);
    expect(passLoops(res.moves).length).toBe(2);
    const filtered = pocket2d(op({ regions: [square(-2.1, 4.2)] }), tool, { minLoopPerimeter: 2 });
    expect(filtered.passes).toBe(1);
    expect(filtered.droppedLoops).toBe(1);
    const loops = passLoops(filtered.moves);
    expect(loops).toHaveLength(1);
    expect(Math.abs(loopArea(loops[0]))).toBeCloseTo(2.2 * 2.2, 5);
  });

  it('a pocket with multiple orbits never bores (the ladder stays)', () => {
    const res = pocket2d(op({ floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.continuous).toBe(0);
    expect(res.passes).toBe(12);
  });

  it('ALWAYS CLIMB: walls on the left — outer orbits CW, island orbits CCW', () => {
    const res = pocket2d(op({ regions: [square(0, 14), [...square(5, 4)].reverse()], stepOver: 2 }), tool);
    expect(res.passes).toBe(2);
    const loops = passLoops(res.moves);
    const [small, big] = [...loops].sort((u, v) => Math.abs(loopArea(u)) - Math.abs(loopArea(v)));
    expect(loopArea(small)).toBeGreaterThan(0);
    expect(loopArea(big)).toBeLessThan(0);
  });
});
