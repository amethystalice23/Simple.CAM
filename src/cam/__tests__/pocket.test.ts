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
    // every pass's ENTRY lands on its level — the ramp's last z word
    const unique = [...new Set(entryLandings(res.moves).map((z) => z.toFixed(3)))];
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

  it('clamps clearing loops to the stock footprint (tail-stock cut-over off)', () => {
    // 10mm region, footprint a 3.5mm square over its corner: every
    // tool-center move stays inside the stock, the boundary loop rides the
    // footprint edge, and the run fits fewer inset passes than the free one
    // (free: insets 1..4 → 4 passes; clamped: the 3.5mm crop → 3)
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
    // the clamped boundary loop rides the footprint edge (x = 3.5)
    expect(xy.some((m) => Math.abs(m.words.x! - 3.5) < 1e-9)).toBe(true);
  });

  it('a region entirely outside the stock does not fit — honest throw', () => {
    expect(() =>
      pocket2d(op({ regions: [square(20, 10)], footprint: [square(0, 6)] }), tool),
    ).toThrowError(/does not fit the pocket region/);
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
    // no material band at the entry: the honest entry is a straight plunge
    // through air — z-only moves, every one at the finishing plane. Passes
    // that provably link at depth do so instead (the safety test is
    // geometric; the finishing plane is all air, so bands still hold).
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
    // the estimate is the emitted geometry itself: every feed move's 3D
    // length at its own feed rate — ramp entries at plunge feed (they cut),
    // loops at cut feed. Ramps replaced v1's vertical plunges, so the old
    // per-pass (approach→depth)/plungeFeed term is gone with them.
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
    // gap-analysis #4: an end mill plunging vertically rubs its center at
    // zero peripheral speed. Every pass that meets material enters along
    // the loop (helical descent) or LINKS at depth from the previous
    // pass (provably clear); a finishing level (band 0) plunges through
    // air instead — pinned in its own test above.
    const res = pocket2d(op({ floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.passes).toBe(12); // 3 levels × 4 inset loops
    expect(res.entries.helical + res.links + res.entries.plunge).toBe(12);
    expect(res.entries.plunge).toBe(0);
    expect(res.links).toBeGreaterThan(0);
    // each helical entry: strictly descending z on every leg, landing
    // exactly on the cut level
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
    // Alice's condition (2026-10-29): link only when the material is
    // cleared — every point the tool sweeps on the link must lie within
    // one tool radius of a pass loop it or a neighbor was going to cut.
    // The 10mm pocket: k1 and k3 link; k1→k2's corner diagonal pokes
    // outside the band union and honestly retracts instead.
    const res = pocket2d(op(), tool);
    expect(res.links).toBe(2);
    const linkIdx = res.moves
      .map((m, i) => (m.comment?.includes('stay-down link') ? i : -1))
      .filter((i) => i >= 0);
    expect(linkIdx).toHaveLength(2);
    const toolR = 1;
    const loops = passLoops(res.moves);
    // the INDEPENDENT safety pin: sample each link segment (from the
    // previous move's XY) and require every sample within toolR of some
    // cut loop's path — the link provably sweeps no virgin material
    for (const i of linkIdx) {
      const m = res.moves[i];
      expect(m.rapid).toBeFalsy();
      expect(m.words.z).toBeUndefined(); // flat at the cut level, never a diagonal
      expect(m.feed).toBe(500); // a cut move, not an entry
      // the prior position: walk back over this pass's feed moves
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
            if (ab2 < 1e-18) continue; // the duplicated closing vertex
            const f = Math.max(0, Math.min(1, ((sx - a.x) * abx + (sy - a.y) * aby) / ab2));
            best = Math.min(best, Math.hypot(sx - (a.x + abx * f), sy - (a.y + aby * f)));
          }
          if (best <= toolR + 1e-6) break;
        }
        expect(best).toBeLessThanOrEqual(toolR + 1e-6);
      }
    }
    // stay-down means exactly that: no rapid between the previous pass's
    // last cut and the link, and none between the link and the next cut
    for (const i of linkIdx) {
      for (let j = i - 1; j >= i - 2; j--) expect(res.moves[j].rapid).toBeFalsy();
      expect(res.moves[i + 1].rapid).toBeFalsy();
    }
  });

  it('pins the helical entry geometry: full revolutions of the cut loop', () => {
    // the 10mm region, Ø2 tool: the k=0 pass rides an 8mm square with
    // rounded corners. Level 1 descends 0.5 air + 1.0 band = 1.5mm;
    // per-rev is bounded by stepDown (1) and slope (3°) → 2 revolutions
    // of 0.75mm each, riding the loop's own geometry and closing each
    // revolution back on the start vertex.
    const res = pocket2d(op(), tool);
    expect(res.entries.helical).toBe(2); // k0 and k2 enter; k1, k3 link at depth
    // ramp runs = maximal chains of coordinated XY+Z feed moves
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
    expect(runs.length).toBe(2); // one ramp per unlinked entry (k0, k2)
    const run = runs[0];
    const last = run[run.length - 1];
    // the run lands exactly on the cut level, back on its start vertex
    expect(last.words.z).toBeCloseTo(-1, 9);
    // two full traversals of the k=0 loop: the cut pass that follows the
    // ramp shares its geometry, so its perimeter is the rev length
    const firstLoop = passLoops(res.moves)[0];
    let perim = 0;
    for (let i = 0; i < firstLoop.length; i++) {
      const p = firstLoop[i];
      const q = firstLoop[(i + 1) % firstLoop.length];
      perim += Math.hypot(q.x - p.x, q.y - p.y);
    }
    // the entry position: the last x/y rapid before the run's first leg
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
      // every leg rides the path at ≤ the max ramp slope
      if (i > 0 && dz > 0) {
        expect(dz / Math.max(dxy, 1e-12)).toBeLessThanOrEqual(Math.tan((3 * Math.PI) / 180) + 1e-9);
      }
      if (Math.hypot(m.words.x! - last.words.x!, m.words.y! - last.words.y!) < 1e-9) closes++;
      expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
      prevZ = m.words.z!;
      px = m.words.x!;
      py = m.words.y!;
    }
    expect(closes).toBe(2); // each of the two revolutions closes on the start
    expect(len).toBeCloseTo(2 * perim, 5);
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

  it('single-orbit pockets bore as ONE continuous helix (step-down sets the slope)', () => {
    // Alice's test_block report (2026-10-29): a small-deep pocket whose
    // ladder collapses to ONE orbit must cut as a single helical bore,
    // not N per-level overlapping spirals. Her ruling: the STEP-DOWN
    // sets the slope — per-revolution descent = stepDown, so the turn
    // count is the ladder's level count (the 3° entry cap would have
    // demanded 35 turns on a 4.7mm orbit and fallen back to the ladder).
    // 4.6mm square, Ø2 tool, 1.3 step-over: inset 1 leaves a 2.6mm
    // square (perimeter 10.4), inset 2 (3.3mm offset) vanishes → one
    // orbit, 4 levels of 1mm.
    const o = op({
      regions: [square(-2.3, 4.6)],
      floorZ: -4,
      stepDown: 1,
      stepOver: 1.3,
    });
    const res = pocket2d(o, tool);
    expect(res.continuous).toBe(1);
    expect(res.levels).toBe(4);
    expect(res.passes).toBe(1);
    expect(res.entries.helical).toBe(1);
    expect(res.links).toBe(0);
    // ONE helical run: every ramp leg strictly descends, riding the
    // orbit's own vertices, and the descent lands exactly on the floor
    const rampLegs = res.moves.filter(
      (m) => !m.rapid && m.words.x !== undefined && m.words.z !== undefined,
    );
    expect(rampLegs.length).toBeGreaterThan(4 * 4); // 4 levels ≥ 4 revs of >4 legs
    let prevZ = Infinity;
    for (const m of rampLegs) {
      expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
      prevZ = m.words.z!;
    }
    expect(rampLegs[rampLegs.length - 1].words.z).toBeCloseTo(o.floorZ, 9);
    // per-revolution descent is the step-down: the run closes back on
    // the orbit start once per revolution, and the FULL descent spans
    // ceil(levels) revolutions of the orbit's perimeter
    const loops = passLoops(res.moves);
    expect(loops).toHaveLength(1); // the single floor lap after the bore
    let perim = 0;
    for (let i = 0; i < loops[0].length; i++) {
      const p = loops[0][i];
      const q = loops[0][(i + 1) % loops[0].length];
      perim += Math.hypot(q.x - p.x, q.y - p.y);
    }
    // the bore is ONE continuous cut: between the first and last feed
    // move there is no rapid at all — no per-level re-positioning, no
    // mid-cut retract (the entry sequence's rapids all precede it)
    const firstFeed = res.moves.findIndex((m) => !m.rapid);
    const lastFeed = res.moves.map((m) => !m.rapid).lastIndexOf(true);
    expect(res.moves.slice(firstFeed, lastFeed + 1).some((m) => m.rapid)).toBe(false);
  });

  it('a pocket with multiple orbits never bores (the ladder stays)', () => {
    // the continuous-descent gate is single-orbit ONLY: a 10mm pocket
    // with real interior keeps its stepped ladder and its links
    const res = pocket2d(op({ floorZ: -2.5, stepDown: 1 }), tool);
    expect(res.continuous).toBe(0);
    expect(res.passes).toBe(12); // 3 levels × 4 orbits
  });
});