import { describe, expect, it } from 'vitest';
import type { Move, PocketOp, Tool, Vec2 } from '../../core/types';
import { chooseClearingStrategy } from '../adaptive';
import { pocket2d } from '../pocket';

const tool: Tool = { id: 't3', name: '3mm flat', type: 'flat', diameter: 3, spindleRpm: 18000 };

// ---- boundary tests for the selector (SPEC 2026-11-13) ----

describe('chooseClearingStrategy', () => {
  // every leg satisfied: the deep-bulk case
  const facts = { toolDiameter: 3, depth: 10, levels: 3, orbitCount: 3 };

  it('selects trochoid when every leg holds (depth > 2D, levels ≥ 2, orbitCount > 1)', () => {
    expect(chooseClearingStrategy(facts)).toBe('trochoid');
  });

  it('depth leg: exactly 2·D is NOT trochoid (strict >), just above is', () => {
    expect(chooseClearingStrategy({ ...facts, depth: 2 * 3 })).toBe('orbits');
    expect(chooseClearingStrategy({ ...facts, depth: 2 * 3 + 0.001 })).toBe('trochoid');
    expect(chooseClearingStrategy({ ...facts, depth: 2 * 3 - 0.001 })).toBe('orbits');
  });

  it('levels leg: 1 level is not enough, 2 is (≥ 2)', () => {
    expect(chooseClearingStrategy({ ...facts, levels: 1 })).toBe('orbits');
    expect(chooseClearingStrategy({ ...facts, levels: 2 })).toBe('trochoid');
  });

  it('orbitCount leg: a single orbit is not enough, two are (> 1)', () => {
    expect(chooseClearingStrategy({ ...facts, orbitCount: 1 })).toBe('orbits');
    expect(chooseClearingStrategy({ ...facts, orbitCount: 2 })).toBe('trochoid');
  });

  it('combinations: any single leg failing keeps today\'s orbits', () => {
    // deep but single orbit — the continuous-descent shape. Descent is NOT
    // decided here (pocket2d's branch owns it and takes precedence), so the
    // selector's answer for that shape is still 'orbits'.
    expect(chooseClearingStrategy({ ...facts, orbitCount: 1 })).toBe('orbits');
    // deep, multi-orbit, but a single level (nothing to re-strategize per Z)
    expect(chooseClearingStrategy({ ...facts, levels: 1 })).toBe('orbits');
    // multi-orbit, ≥2 levels, but shallow relative to the tool
    expect(chooseClearingStrategy({ ...facts, depth: 5 })).toBe('orbits');
    // every leg AT its threshold simultaneously: 2D exactly, 2 levels, 2 orbits
    expect(chooseClearingStrategy({ toolDiameter: 3, depth: 6, levels: 2, orbitCount: 2 })).toBe(
      'orbits',
    );
  });

  it('the selector never returns descent', () => {
    for (const levels of [0, 1, 2, 5]) {
      for (const orbitCount of [0, 1, 2, 7]) {
        for (const depth of [0, 2, 6, 6.001, 40]) {
          expect(
            ['orbits', 'trochoid'],
          ).toContain(chooseClearingStrategy({ toolDiameter: 3, depth, levels, orbitCount }));
        }
      }
    }
  });
});

// ---- inertness regression (SPEC build step 1) ----
//
// The selector is wired into pocket2d but the trochoid emitter does not
// exist yet, so a trochoid-selected op must emit EXACTLY today's contour-
// offset orbits. The pin straddles the depth leg with two ops identical
// except that one crosses the 2·D threshold:
//
//   A: Ø3 tool, region Ø40, stepOver 4 → 4 surviving circular inset
//      loops (r 18.5 / 14.5 / 10.5 / 6.5; the r 2.5 fifth is dropped by
//      minLoopPerimeter), depth 10 > 2·3 · 10 levels → TROCHOID
//   B: the same op with depth 5.999 = 2·D − 0.001 → ORBITS
//
// A full Move[] deep-equal is impossible BY CONSTRUCTION between any
// depth-nudged pair: the z ladder itself scales with depth (rung =
// span/levels, rapids sit at clearance above it, ramp z's interpolate
// across it), so z-bearing words can never coincide. The pin therefore
// compares the DEPTH-FREE canonical form — rapid/feed kind, XY words,
// feed, arc vectors, z-word PRESENCE, comments with the level-z token
// masked — plus the real z structure at the level landings, whose
// depth-fractions (k/10) coincide because both ladders carry the SAME
// level count (B's stepDown 0.605 keeps n = 10).

/** CCW 64-gon — the region shape opTargets emits for a circular feature. */
function circle64(cx: number, cy: number, r: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

function op(overrides: Partial<PocketOp> = {}): PocketOp {
  return {
    kind: 'pocket',
    id: 'op1',
    toolId: 't3',
    regions: [circle64(0, 0, 20)],
    topZ: 0,
    floorZ: -10,
    stepDown: 1.05, // ceil(10/1.05) = 10 levels — the SAME n as the nudged op
    stepOver: 4,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

/** Depth-free canonical form of a move list (see the block comment). */
function canonical(moves: Move[]): unknown[] {
  return moves.map((m) => ({
    rapid: m.rapid ?? false,
    feed: m.rapid ? 0 : m.feed,
    x: m.words.x ?? null,
    y: m.words.y ?? null,
    // z PRESENCE only: the z VALUES are the nudge itself (ladder scaling)
    zWord: m.words.z === undefined ? null : 'z',
    a: m.words.a ?? null,
    arc: m.arc ? { i: m.arc.i, j: m.arc.j, cw: m.arc.cw } : null,
    // `level z-1.00` tokens scale with depth; pass/turn structure does not
    comment: m.comment?.replace(/z-?[\d.]+/g, 'z#') ?? null,
  }));
}

/** Landing z of every entry run (the cut level), as a DEPTH FRACTION of
 *  the op's span: k/levels for the k-th rung — identical for both ladders. */
function landingFractions(moves: Move[], span: number): number[] {
  const zs = moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);
  const runs: number[][] = [];
  for (const z of zs) {
    const last = runs[runs.length - 1];
    if (!last || z > last[last.length - 1] + 1e-12) runs.push([z]);
    else last.push(z);
  }
  return runs.map((r) => Number(((0 - r[r.length - 1]) / span).toFixed(5)));
}

describe('pocket2d — adaptive selector wired, inert (spec step 1)', () => {
  // stepDown 0.605: ceil(5.999/0.605) = ceil(9.916) = 10 — the SAME level
  // count as the deep op, so pass structure is genuinely comparable
  const deep = pocket2d(op(), tool, { minLoopPerimeter: 30 });
  const shallow = pocket2d(op({ floorZ: -(2 * 3 - 0.001), stepDown: 0.605 }), tool, {
    minLoopPerimeter: 30,
  });
  const shallowSpan = 2 * 3 - 0.001; // 5.999, just BELOW the 2·D threshold

  it('the pair straddles the selector exactly as pocket2d computes it', () => {
    expect(chooseClearingStrategy({ toolDiameter: 3, depth: 10, levels: deep.levels, orbitCount: deep.orbits.length })).toBe('trochoid');
    expect(chooseClearingStrategy({ toolDiameter: 3, depth: shallowSpan, levels: shallow.levels, orbitCount: shallow.orbits.length })).toBe('orbits');
    expect(shallow.levels).toBe(deep.levels); // 10 = 10, by the stepDown choice
    expect(deep.continuous).toBe(0);
    expect(shallow.continuous).toBe(0); // neither takes the descent branch
  });

  it('a trochoid-selected op emits today\'s orbit ladder (inert fall-through)', () => {
    expect(canonical(shallow.moves)).toEqual(canonical(deep.moves));
  });

  it('level landings sit on the same depth fractions (k/10) in both', () => {
    const a = landingFractions(deep.moves, 10);
    const b = landingFractions(shallow.moves, shallowSpan);
    expect(b).toEqual(a);
    // every rung exactly once per pass-ladder: first landing 1/10, last 1
    expect(a[0]).toBeCloseTo(0.1, 5);
    expect(a[a.length - 1]).toBeCloseTo(1, 5);
  });

  it('pass structure is identical (4 surviving circles × 10 levels)', () => {
    expect(deep.levels).toBe(10);
    expect(deep.passes).toBe(40);
    expect(shallow.passes).toBe(40);
    expect(shallow.orbits.length).toBe(4);
    expect(shallow.links).toBe(deep.links);
    expect(shallow.entries).toEqual(deep.entries);
    expect(shallow.moves.length).toBe(deep.moves.length);
  });
});
