import { describe, expect, it } from 'vitest';
import type { PocketOp, Tool, Vec2 } from '../../core/types';
import { chooseClearingStrategy, trochoidDepthLegs } from '../adaptive';
import { pocket2d } from '../pocket';

const tool: Tool = { id: 't3', name: '3mm flat', type: 'flat', diameter: 3, spindleRpm: 18000 };

// ---- boundary tests for the selector (SPEC 2026-11-13) ----

describe('trochoidDepthLegs (spec step 3: the popup-checkable half of the rule)', () => {
  it('is the selector without the orbit leg — identical boundaries', () => {
    expect(trochoidDepthLegs(3, 10, 3)).toBe(true);
    expect(trochoidDepthLegs(3, 2 * 3, 3)).toBe(false);
    expect(trochoidDepthLegs(3, 2 * 3 + 0.001, 3)).toBe(true);
    expect(trochoidDepthLegs(3, 10, 1)).toBe(false);
    expect(trochoidDepthLegs(3, 10, 2)).toBe(true);
  });
});

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

// ---- trochoid-route divergence regression (SPEC build steps 1→2) ----
//
// The step-1 inertness pin straddled the depth leg with two ops identical
// except that one crosses the 2·D threshold (A: Ø3 tool, region Ø40, depth
// 10 → trochoid; B: depth 5.999 = 2·D − 0.001 → orbits). Step 2 made the
// route LIVE: the deep twin now diverges onto the adaptive walk (the old
// canonical deep-equal was retired with the fall-through it pinned). The
// shallow side of the pair survives below as the orbit-mode regression —
// with the full pocket suite pinning orbit emission throughout.

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

describe('pocket2d — the trochoid route is LIVE (spec step 2)', () => {
  // The SAME pair the step-1 inertness pin used. Step 2 replaced the inert
  // fall-through with the emitter: the deep twin now DIVERGES onto the
  // adaptive route; the shallow twin keeps today's orbit emission (that
  // side of the old pin survives as the regression test, joined by the
  // full pocket suite, which pins orbit-mode behavior throughout).
  // stepDown 0.605: ceil(5.999/0.605) = ceil(9.916) = 10 — the SAME level
  // count as the deep op, so the pair is genuinely comparable.
  const deep = pocket2d(op(), tool, { minLoopPerimeter: 30 });
  const shallow = pocket2d(op({ floorZ: -(2 * 3 - 0.001), stepDown: 0.605 }), tool, {
    minLoopPerimeter: 30,
  });
  const shallowSpan = 2 * 3 - 0.001; // 5.999, just BELOW the 2·D threshold

  it('the pair straddles the selector exactly as pocket2d computes it', () => {
    expect(chooseClearingStrategy({ toolDiameter: 3, depth: 10, levels: deep.levels, orbitCount: deep.orbits.length })).toBe('trochoid');
    expect(chooseClearingStrategy({ toolDiameter: 3, depth: shallowSpan, levels: shallow.levels, orbitCount: shallow.orbits.length })).toBe('orbits');
    expect(deep.continuous).toBe(0);
    expect(shallow.continuous).toBe(0); // neither takes the descent branch
  });

  it('the deep twin emits the adaptive route (walks, ae ladder)', () => {
    expect(deep.moves.some((m) => m.comment?.includes('adaptive roughing'))).toBe(true);
    expect(deep.levels).toBe(10);
    // the ae ladder (0.45mm spacing) rings the region far denser than the
    // 4 surviving step-over orbits: many more walk passes per level
    expect(deep.passes).toBeGreaterThan(shallow.passes);
  });

  it('the shallow twin keeps today\'s orbit emission, no adaptive markers', () => {
    expect(shallow.moves.some((m) => m.comment?.includes('adaptive roughing'))).toBe(false);
    expect(shallow.moves.some((m) => m.comment?.includes('trochoid peel'))).toBe(false);
    expect(shallow.orbits.length).toBe(4);
    expect(shallow.passes).toBe(40);
    expect(shallow.moves.length).toBeGreaterThan(0);
  });
});
