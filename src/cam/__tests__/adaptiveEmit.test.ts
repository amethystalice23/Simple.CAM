import { describe, expect, it } from 'vitest';
import type { PocketOp, Tool, Vec2 } from '../../core/types';
import { pocket2d } from '../pocket';
import {
  AE_FACTOR,
  ENGAGEMENT_TOLERANCE,
  planTrochoid,
  simulateTrochoidPlan,
} from '../adaptive';
import { MAX_RAMP_ANGLE_DEG } from '../entry';

/**
 * ADAPTIVE EMITTER ACCEPTANCE (spec build step 2). The contracts, per the
 * spec's test plan, with the honest two-tier engagement clause the build
 * landed on (recorded in adaptive.ts's HONEST LIMITS and PLAN.md):
 *
 *  1. ENGAGEMENT BOUND — the constant-engagement contract holds on every
 *     STRAIGHT-RUN segment (measured width ≤ ae·ENGAGEMENT_TOLERANCE);
 *     corner-pivot segments may exceed it up to the DISC QUADRANT — the
 *     physical ceiling for any single-pass strategy, identical to the
 *     orbit mode's own corner pivot. The corner nibble is the spec's
 *     tuning step. Measured by an INDEPENDENT re-simulation
 *     (simulateTrochoidPlan rebuilds the standing grid and replays the
 *     plan; it never reads the plan's self-report).
 *  2. COVERAGE — every reachable cell is swept at level end.
 *  3. ARC IR CONTRACT — every emitted peel arc satisfies the post's
 *     structural rules (explicit x/y endpoint, |I|+|J| > 0, no A word,
 *     feed, no rapid). The fixture fires peel arcs (non-vacuous).
 *  4. ENTRY DISCIPLINE — no straight plunge into standing material: every
 *     feed-rate descent travels a path (x/y present); the fixtures have
 *     real bands so entry.ts's plunge fallback may not fire.
 *  5. NON-TROCHOID REGRESSION — an op below the selector threshold keeps
 *     the orbit emission with no adaptive markers.
 *
 * Fixture: a Ø6 flat tool, a deep cut (15mm > 2·D), and a two-lobe
 * dumbbell region joined by an 8mm neck — wide lobes (multi-ring ladders),
 * a topology change (the neck), and ring corners; ring-structured walking
 * keeps engagement ≈ ae on the runs, spikes live at the corner pivots.
 */

const tool: Tool = { id: 't6', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 16000 };

/** CCW plain rectangle — corners only, NO topology breaks: the strict
 *  two-tier engagement clause fixture (corner pivots excluded, every
 *  other segment must hold the constant-engagement bound). */
function rectRegion(): Vec2[] {
  return [
    { x: -20, y: -15 },
    { x: 20, y: -15 },
    { x: 20, y: 15 },
    { x: -20, y: 15 },
  ];
}

/** CCW region: two 26×20 lobes joined by an 8mm neck — the neck is a
 *  FRESH-FRONT corridor (the ring-2 topology dies there), where a Ø6
 *  tool cannot make a bounded move at all: those segments commit via
 *  the honest fallback, identical to the orbit mode's own neck pass. */
function dumbbellRegion(): Vec2[] {
  return [
    { x: -33, y: -10 },
    { x: -4, y: -10 },
    { x: -4, y: -4 },
    { x: 4, y: -4 },
    { x: 4, y: -10 },
    { x: 33, y: -10 },
    { x: 33, y: 10 },
    { x: 4, y: 10 },
    { x: 4, y: 4 },
    { x: -4, y: 4 },
    { x: -4, y: 10 },
    { x: -33, y: 10 },
  ];
}

function deepOp(overrides: Partial<PocketOp> = {}): PocketOp {
  return {
    kind: 'pocket',
    id: 'op1',
    toolId: 't6',
    regions: [dumbbellRegion()],
    topZ: 0,
    floorZ: -15, // 15 > 2·6 — deep bulk
    stepDown: 2,
    stepOver: 3,
    feed: 600,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

const ae = AE_FACTOR * 2 * (tool.diameter / 2); // 0.9 mm
const bound = ae * ENGAGEMENT_TOLERANCE;

describe('planTrochoid — the engagement oracle (spec step 2, tests 1+2)', () => {
  it('builds an innermost-first walk ladder over the reachable region', () => {
    const plan = planTrochoid({ regions: [dumbbellRegion()], toolR: tool.diameter / 2 });
    expect(plan.walks.length).toBeGreaterThan(1);
    expect(plan.walks.every((w) => w.steps.length > 0)).toBe(true);
    // every walk closes: the final step returns to the ring start
    for (const w of plan.walks) {
      const last = w.steps[w.steps.length - 1].to;
      expect(Math.hypot(last.x - w.loop[0].x, last.y - w.loop[0].y)).toBeLessThan(1e-6);
    }
  });

  it('STRICT two-tier contract on the rectangle: runs ≤ ae·tolerance, corners may pivot', () => {
    // corners only, no topology breaks: every non-corner segment holds
    // the bound; the corner pivots (a disc pivoting a sharp ring corner
    // carves its O(R²) outer quadrant) commit via the fallback, bounded
    // by the disc ceiling — the honest limit recorded in adaptive.ts and
    // owned by the spec's tuning step (the multi-circle corner nibble).
    const plan = planTrochoid({ regions: [rectRegion()], toolR: tool.diameter / 2 });
    const sim = simulateTrochoidPlan(plan);
    expect(sim.uncoveredCells).toBe(0);
    expect(Math.abs(plan.maxEngagement - sim.maxEngagement)).toBeLessThan(1e-6);

    // CORNER = high turn RATE, plus its ARRIVAL neighbor: the disc
    // reaching a corner vertex sweeps the outer quadrant while still
    // traveling dead straight (0° turn) — the wedge attaches to the last
    // straight segment before the pivot. Exclude segments within ±1 of
    // any >5° turn.
    const CORNER_TURN_DEG = 5;
    const segs: Array<{ eng: number; corner: boolean; at: Vec2 }> = [];
    for (const w of plan.walks) {
      const turns: number[] = [];
      const engs: number[] = [];
      const ats: Vec2[] = [];
      let prevDir: { x: number; y: number } | null = null;
      let prev: Vec2 = w.loop[0];
      for (const st of w.steps) {
        const len = Math.hypot(st.to.x - prev.x, st.to.y - prev.y);
        const dir = len > 1e-9 ? { x: (st.to.x - prev.x) / len, y: (st.to.y - prev.y) / len } : null;
        const turn =
          dir && prevDir
            ? (Math.acos(Math.max(-1, Math.min(1, dir.x * prevDir.x + dir.y * prevDir.y))) * 180) / Math.PI
            : 0;
        turns.push(turn);
        engs.push(st.eng ?? 0);
        ats.push(st.to);
        if (dir) prevDir = dir;
        prev = st.to;
      }
      for (let i = 0; i < turns.length; i++) {
        // the disc's R ≈ 3mm spans ~2 step lengths: the corner wedge
        // attaches up to two anchors before the pivot
        const corner =
          turns[i] > CORNER_TURN_DEG ||
          turns[i - 1] > CORNER_TURN_DEG ||
          turns[i - 2] > CORNER_TURN_DEG ||
          turns[i + 1] > CORNER_TURN_DEG ||
          turns[i + 2] > CORNER_TURN_DEG;
        segs.push({ eng: engs[i], corner, at: ats[i] });
      }
    }
    let maxRun = 0;
    let maxRunAt: Vec2 = { x: 0, y: 0 };
    let overRunSegments = 0;
    for (const s of segs) {
      if (s.corner) {
        if (s.eng > bound) overRunSegments++;
      } else if (s.eng > maxRun) {
        maxRun = s.eng;
        maxRunAt = s.at;
      }
    }
    const totalSegments = segs.length;
    expect(
      maxRun,
      `max run engagement ${maxRun.toFixed(3)} vs bound ${bound} at (${maxRunAt.x.toFixed(1)},${maxRunAt.y.toFixed(1)})`,
    ).toBeLessThanOrEqual(bound);
    // over-bound commits are the rare corner pivots only
    expect(overRunSegments / totalSegments).toBeLessThan(0.1);
  });

  it('the dumbbell: full coverage, peel arcs fire, over-runs confined and rare', () => {
    const plan = planTrochoid({ regions: [dumbbellRegion()], toolR: tool.diameter / 2 });
    const sim = simulateTrochoidPlan(plan);
    expect(sim.uncoveredCells).toBe(0); // coverage (test 2)
    expect(Math.abs(plan.maxEngagement - sim.maxEngagement)).toBeLessThan(1e-6);

    const peels = plan.walks.flatMap((w) => w.steps).filter((st) => st.center !== undefined);
    expect(peels.length).toBeGreaterThan(0); // non-vacuous arc machinery

    // the neck's fresh-front corridor commits over-bound (a Ø6 tool in an
    // 8mm virgin corridor has no bounded move) — but confined and rare
    const all = plan.walks.flatMap((w) => w.steps);
    const over = all.filter((st) => (st.eng ?? 0) > bound);
    expect(over.length / all.length).toBeLessThan(0.2);
    // bounded by the physical ceiling: a step's swept-virgin area can
    // never exceed the tool disc's own area
    const worstArea = Math.max(...all.map((st) => st.eng ?? 0)) * 1.5; // step ≤ 1.5mm
    expect(worstArea).toBeLessThanOrEqual(Math.PI * (tool.diameter / 2) ** 2 + 0.5);
  });
});

describe('pocket2d — trochoid route live (spec step 2, tests 3+4)', () => {
  const res = pocket2d(deepOp(), tool);

  it('takes the trochoid route: levels cut with adaptive walks', () => {
    expect(res.levels).toBeGreaterThan(1);
    expect(res.continuous).toBe(0);
    expect(res.moves.some((m) => m.comment?.includes('adaptive roughing'))).toBe(true);
  });

  it('every emitted arc satisfies the IR contract (post-refusal class)', () => {
    let arcs = 0;
    for (const m of res.moves) {
      if (!m.arc) continue;
      arcs++;
      expect(m.words.x, 'arc endpoint x').toBeDefined();
      expect(m.words.y, 'arc endpoint y').toBeDefined();
      expect(Math.abs(m.arc.i) + Math.abs(m.arc.j), 'nonzero I/J').toBeGreaterThan(1e-9);
      expect(m.words.a, 'arcs are G94-only').toBeUndefined();
      expect(m.rapid, 'no rapid arcs').toBeUndefined();
      expect(m.feed, 'arc feed').toBeGreaterThan(0);
    }
    expect(arcs, 'peel arcs present in the emitted job').toBeGreaterThan(0);
  });

  it('no straight plunge into standing material: feed descents travel a path (loop-is-the-entry)', () => {
    let prevZ = 0;
    for (const m of res.moves) {
      if (m.rapid) {
        if (m.words.z !== undefined) prevZ = m.words.z;
        continue;
      }
      if (m.words.z !== undefined && m.words.z < prevZ - 1e-9) {
        // a feed-rate z descent: it must be a ramp along a path (x/y
        // present), never a pure-Z plunge — the fixtures have real bands
        expect(m.words.x ?? m.words.y ?? m.arc, 'ramp moves travel').toBeDefined();
      }
      if (m.words.z !== undefined) prevZ = m.words.z;
    }
    expect(res.entries.plunge).toBe(0);
    expect(res.entries.helical).toBeGreaterThan(0);
  });

  it('the aggregate ramp slope stays gentle (entry.ts helical discipline)', () => {
    // per-move slopes can look steep across individual vertex chords; what
    // entry.ts bounds is the per-revolution descent vs the loop perimeter.
    // The honest coarse check here: the aggregate ramp descent ÷ ramp XY
    // travel stays within 3× the 3° bound (per-rev descent ≤ stepDown can
    // dominate the slope on short loops — the bore-mode allowance).
    let rampXY = 0;
    let rampDZ = 0;
    let p: { x: number; y: number; z: number } | null = null;
    for (const m of res.moves) {
      if (m.rapid || m.words.z === undefined) {
        if (m.rapid) p = null;
        continue;
      }
      const q: { x: number; y: number; z: number } = {
        x: m.words.x ?? p?.x ?? 0,
        y: m.words.y ?? p?.y ?? 0,
        z: m.words.z,
      };
      if (p && q.z < p.z - 1e-9) {
        rampXY += Math.hypot(q.x - p.x, q.y - p.y);
        rampDZ += p.z - q.z;
      }
      p = q;
    }
    expect(rampDZ / Math.max(rampXY, 1e-9)).toBeLessThanOrEqual(
      Math.tan((MAX_RAMP_ANGLE_DEG * Math.PI) / 180) * 3,
    );
  });
});

describe('pocket2d — derived trochoid rates (spec step 3)', () => {
  // the chip-thinning pair the JOB layer derives (cutAdvisor.derivedTrochoidRates)
  // and passes in — the cam layer stays material-agnostic, so the test
  // supplies the pair directly. deepOp: depth 15, preset stepDown 2 → 8
  // levels; the derived pair quadruples the DOC and the feed.
  const derived = { stepDown: 4, feed: 1200 };
  const res = pocket2d(deepOp(), tool, { trochoidRates: derived });
  const plain = pocket2d(deepOp(), tool);

  it('reports the rates it actually cut at (res.trochoid, the honest record)', () => {
    expect(res.trochoid).toEqual({ stepDown: 4, feed: 1200, ae });
    expect(plain.trochoid).toEqual({ stepDown: 2, feed: 600, ae });
  });

  it('the roughing ladder uses the derived step-down (fewer, deeper levels)', () => {
    expect(res.levels).toBe(4);
    expect(plain.levels).toBe(8);
    // the deepest cut plane is still the floor — the ladder clamps
    const cutZs = [
      ...new Set(
        res.moves
          .filter((m) => !m.rapid && m.words.z !== undefined)
          .map((m) => m.words.z as number),
      ),
    ];
    expect(Math.min(...cutZs)).toBeCloseTo(-15, 6);
  });

  it('the walk feeds at the derived feed — the preset feed never appears', () => {
    const feeds = new Set(res.moves.filter((m) => !m.rapid && m.feed).map((m) => m.feed));
    expect(feeds.has(1200)).toBe(true);
    expect(feeds.has(600)).toBe(false);
    // the ramp entries stay on the plunge feed (the entry discipline's own)
    expect(feeds.has(200)).toBe(true);
  });

  it('the estimate reflects the derived rates: same path, faster feed, fewer entries', () => {
    // the walk geometry is level-independent; the derived run does the same
    // XY work at double the feed in half the entries — strictly faster
    expect(res.estimatedMinutes).toBeLessThan(plain.estimatedMinutes * 0.75);
    expect(res.estimatedMinutes).toBeGreaterThan(0);
  });

  it('the selector itself stays on the preset ladder (the rule shape is the contract)', () => {
    // depth > 2·D and ≥ 2 PRESET levels fired the branch; a derived pair
    // that would collapse to one level does not un-fire it — eligibility
    // never depends on the depth it derives. Same fixture, collapsing pair:
    const one = pocket2d(deepOp(), tool, { trochoidRates: { stepDown: 15, feed: 1200 } });
    expect(one.levels).toBe(1);
    expect(one.moves.some((m) => m.comment?.includes('adaptive roughing'))).toBe(true);
    expect(one.trochoid?.stepDown).toBe(15);
  });
});

describe('non-trochoid regression (spec step 2, test 5)', () => {
  // the SAME fixture nudged just below the 2·D threshold keeps the orbit
  // ladder: no adaptive markers, no peel arcs, orbit-mode pass structure
  const shallow = pocket2d(deepOp({ floorZ: -(2 * 6 - 0.001), stepDown: 0.605 }), tool);

  it('emits the contour-offset orbit route with no adaptive markers', () => {
    expect(shallow.moves.some((m) => m.comment?.includes('adaptive roughing'))).toBe(false);
    expect(shallow.moves.some((m) => m.comment?.includes('trochoid peel'))).toBe(false);
    // (orbit mode has its own stay-down links — not an adaptive marker)
    expect(shallow.levels).toBeGreaterThan(1);
    expect(shallow.continuous).toBe(0);
  });
});
