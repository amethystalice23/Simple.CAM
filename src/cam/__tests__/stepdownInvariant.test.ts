/**
 * THE GLOBAL CUT-BAND RULE (Alice, 2026-10-28 — the faceCylinder ladder fix,
 * pinned repo-wide the same day): a cut band may NEVER be deeper than the
 * step-down. Many materials break the tool on a deeper band — the old face
 * ladder's 0.95mm finish step on 0.8mm params was exactly this bug class.
 *
 * This suite reconstructs each generator's depth ladder from its EMITTED
 * moves and asserts, for every adversarial parameter shape:
 *
 *   1. every band ≤ stepDown — never a deeper step, not even the finish;
 *   2. no duplicate levels — a total that lands exactly on a rung is cut
 *      there once, never twice (the coupon's double-cut face);
 *   3. the ladder lands EXACTLY on its target — a shorter final remainder,
 *      never a stop short of it and never a step past.
 *
 * Reconstruction convention: discrete-level generators step depth as
 * Z-only feed moves (plunges / pecks / in-cut level steps at fixed XY/A).
 * Ramped entries (entry.ts, 2026-10-29) descend along the cut path as
 * coordinated XY+Z feed legs instead: a run of them collapses to its
 * LANDING z (the cut level it feeds), while the per-traversal band those
 * legs engage is pinned separately by assertRampBands. A generator that
 * re-ladders per path/strand/start/hole/edge (each starts again from its
 * own surface) splits into one ladder per group — each must satisfy the
 * rule alone. Rotaries coordinating Z with A (G93) never collapse.
 *
 * Out of scope, by the agreed convention: the finishingOnly single-pass
 * collapse (one level at the target — the op assumes the bulk above is
 * already gone; pinned as such in faceCylinder and honored identically by
 * pocket/profile/spiral/thread/cylChamfer/rotaryCarve), and the face
 * generator itself, whose ladder (rough target + laddered allowance band)
 * is pinned in faceCylinder.test.ts.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  CylChamferOp,
  DrillOp,
  Move,
  PocketOp,
  ProfileOp,
  RotaryCalibration,
  SpiralCarveOp,
  ThreadOp,
  Tool,
  Vec2,
} from '../../core/types';
import { zLadder } from '../paths';
import { pocket2d } from '../pocket';
import { profile2d } from '../profile';
import { drill } from '../drill';
import { engrave, type EngraveParams } from '../engrave';
import { spiralCarve } from '../spiralCarve';
import { thread, threadDepth, threadFaceDiameter } from '../thread';
import { cylChamfer } from '../cylChamfer';
import { waterlineRough, type WaterlineRoughOptions } from '../waterline';
import { rasterContour, type RasterContourOptions } from '../relief';
import { rotaryCarve, type RotaryCarveOptions } from '../rotaryCarve';

const EPS = 1e-9;

const flat2: Tool = { id: 'f2', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const vbit90: Tool = {
  id: 'v90',
  name: '90° chamfer bit',
  type: 'vbit',
  diameter: 6,
  vAngle: 90,
  spindleRpm: 12000,
};
const vbit60: Tool = {
  id: 'v60',
  name: '60° engraving bit',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 60,
  tipDiameter: 0.2,
  spindleRpm: 12000,
};

const cal25: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };
const cal12: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 12 };
const cal8175: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 };

/** CCW square contour spanning [min, min+size]². */
function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

/** Collapse consecutive duplicates — a level re-plunges once per loop/span,
 *  peck, or row without being a new rung. */
function dedupeConsecutive(xs: number[]): number[] {
  return xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > 1e-12);
}

/**
 * Feed-move z words → depth ladders below `topZ`, in emission order. A new
 * ladder starts whenever the depth falls back (a new path/strand/start/
 * hole/edge re-ladders from its own surface); duplicates inside a ladder
 * collapse. A run of ramp legs (coordinated XY+Z feed moves, entry.ts)
 * collapses to its LANDING depth — the cut level it feeds. Rotaries whose
 * level steps ride coordinated Z+A moves (the face's spiral) are pinned in
 * their own suites, not here.
 */
function depthLadders(moves: Move[], topZ: number): number[][] {
  const out: number[][] = [];
  let prev = -Infinity;
  let rampLanding: number | null = null;
  const rung = (z: number) => {
    const d = topZ - z;
    if (d < prev - 1e-9 || out.length === 0) out.push([]);
    out[out.length - 1].push(d);
    prev = d;
  };
  const flush = () => {
    if (rampLanding !== null) {
      rung(rampLanding);
      rampLanding = null;
    }
  };
  for (const m of moves) {
    if (m.rapid) {
      flush();
      continue;
    }
    const z = m.words.z;
    if (z === undefined) continue;
    if (m.words.a === undefined && m.words.x !== undefined) {
      rampLanding = z; // ramp leg — the run collapses to its last z
      continue;
    }
    flush();
    rung(z);
  }
  flush();
  return out.map(dedupeConsecutive);
}

/**
 * THE RAMP RULE on ramped entries: every run of ramp legs descends
 * monotonically (no re-ascent, no air double-plunge) and engages at most
 * `stepDown` of fresh material per traversal — a zigzag leg or a helical
 * revolution, whichever the geometry resolved to (entry.ts picks by
 * geometry; traversals are recovered from XY direction reversals and
 * returns to the entry point, whichever counts higher).
 */
function assertRampBands(moves: Move[], stepDown: number): void {
  const isRampLeg = (m: Move) =>
    !m.rapid && m.words.z !== undefined && m.words.a === undefined && m.words.x !== undefined;
  let run: Move[] = [];
  let entryX = 0;
  let entryY = 0;
  let fromZ = 0;
  const check = () => {
    if (run.length === 0) return;
    let prevZ = Infinity;
    let reversals = 0;
    let revisits = 0;
    let px = entryX;
    let py = entryY;
    let pdx = 0;
    let pdy = 0;
    for (let i = 0; i < run.length; i++) {
      const m = run[i];
      const x = m.words.x!;
      const y = m.words.y ?? py;
      const dx = x - px;
      const dy = y - py;
      const pd = Math.hypot(pdx, pdy);
      const d = Math.hypot(dx, dy);
      // a direction reversal is a zigzag leg turning back
      if (i > 0 && pd > 0 && d > 0 && (pdx * dx + pdy * dy) / (pd * d) < -1e-9) reversals++;
      // a return to the entry XY closes a helical revolution
      if (Math.hypot(x - entryX, y - entryY) < 1e-9) revisits++;
      expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
      prevZ = m.words.z!;
      px = x;
      py = y;
      pdx = dx;
      pdy = dy;
    }
    const traversals = Math.max(reversals + 1, revisits);
    expect(fromZ - run[run.length - 1].words.z!).toBeLessThanOrEqual(traversals * stepDown + 1e-9);
    run = [];
  };
  for (const m of moves) {
    if (isRampLeg(m)) {
      run.push(m);
      continue;
    }
    check();
    if (m.rapid && m.words.x !== undefined) {
      entryX = m.words.x;
      entryY = m.words.y ?? entryY;
    }
    if (m.rapid && m.words.z !== undefined) fromZ = m.words.z;
  }
  check();
}

/** THE RULE on one generator's moves: every band ≤ stepDown (never a
 *  deeper step), no duplicate rungs, and the ladder lands exactly on its
 *  target. */
function assertCutBands(moves: Move[], topZ: number, stepDown: number, target: number): void {
  const ladders = depthLadders(moves, topZ);
  expect(ladders.length).toBeGreaterThan(0);
  for (const ladder of ladders) {
    // the first band is one rung at most — never the whole depth past it
    expect(ladder[0]).toBeLessThanOrEqual(stepDown + EPS);
    for (let i = 1; i < ladder.length; i++) {
      const inc = ladder[i] - ladder[i - 1];
      // never a deeper band: a bigger step is tool breakage on hard stock
      expect(inc).toBeLessThanOrEqual(stepDown + EPS);
      // never the same depth twice: a total on a whole rung cuts once
      expect(inc).toBeGreaterThan(EPS);
    }
    // the ladder lands EXACTLY on its target — a shorter final remainder
    expect(ladder[ladder.length - 1]).toBeCloseTo(target, 9);
  }
}

describe('the global cut-band rule: never a band deeper than the step-down', () => {
  describe('zLadder — the helper pocket/profile/waterline share', () => {
    it('steps in even distribution, landing exactly on the floor', () => {
      expect(zLadder(0, -2.5, 1)).toEqual([
        -2.5 / 3,
        - (2 * 2.5) / 3,
        -2.5,
      ]);
    });

    it('an exact multiple of the rung never duplicates the floor level', () => {
      expect(zLadder(0, -3, 1)).toEqual([-1, -2, -3]);
    });

    it('a span shallower than one rung is a single level at the floor', () => {
      expect(zLadder(0, -0.4, 1)).toEqual([-0.4]);
    });

    it('property: every increment ≤ stepDown, never a duplicate, lands on the floor', () => {
      const shapes: [number, number, number][] = [
        [0, -2.5, 1],
        [0, -3, 1],
        [0, -0.4, 1],
        [5, -1.3, 0.7], // awkward remainder on a nonzero surface
        [2, -0.13, 0.29], // fp-hostile rung vs span
      ];
      for (const [top, floor, step] of shapes) {
        const lv = zLadder(top, floor, step);
        expect(lv[lv.length - 1]).toBe(floor);
        expect(top - lv[0]).toBeLessThanOrEqual(step + EPS);
        for (let i = 1; i < lv.length; i++) {
          expect(lv[i - 1] - lv[i]).toBeLessThanOrEqual(step + EPS);
          expect(lv[i - 1] - lv[i]).toBeGreaterThan(EPS);
        }
      }
    });
  });

  describe('pocket2d', () => {
    function pocketOp(over: Partial<PocketOp> = {}): PocketOp {
      return {
        kind: 'pocket',
        id: 'op1',
        toolId: 'f2',
        regions: [square(0, 10)],
        topZ: 0,
        floorZ: -1,
        stepDown: 1,
        stepOver: 1,
        feed: 500,
        plungeFeed: 200,
        safeClearance: 5,
        ...over,
      };
    }

    it('every Z band ≤ stepDown, the last landing exactly on the floor', () => {
      const shapes: { floorZ: number; stepDown: number }[] = [
        { floorZ: -2.5, stepDown: 1 }, // remainder rung 0.5
        { floorZ: -3, stepDown: 1 }, // exact multiple — the floor cut exactly once
        { floorZ: -0.4, stepDown: 1 }, // single shallow level
        { floorZ: -4.15, stepDown: 0.8 }, // her face-bug arithmetic: 5×0.8 + 0.15
      ];
      for (const s of shapes) {
        const res = pocket2d(pocketOp({ floorZ: s.floorZ, stepDown: s.stepDown }), flat2);
        assertCutBands(res.moves, 0, s.stepDown, -s.floorZ);
        assertRampBands(res.moves, s.stepDown);
      }
    });
  });

  describe('profile2d', () => {
    function profileOp(over: Partial<ProfileOp> = {}): ProfileOp {
      return {
        kind: 'profile',
        id: 'op1',
        toolId: 'f2',
        contours: [square(0, 10)],
        side: 'outside',
        bottomAllowance: 0,
        sideAllowance: 0,
        topZ: 0,
        floorZ: -2,
        stepDown: 1,
        feed: 500,
        plungeFeed: 200,
        safeClearance: 5,
        ...over,
      };
    }

    it('every level band ≤ stepDown, tab spans re-plunging at the level they belong to', () => {
      const shapes: { floorZ: number; stepDown: number }[] = [
        { floorZ: -2.5, stepDown: 1 },
        { floorZ: -3, stepDown: 1 }, // exact multiple
        { floorZ: -0.4, stepDown: 1 },
        { floorZ: -4.15, stepDown: 0.8 },
      ];
      for (const s of shapes) {
        const res = profile2d(profileOp({ floorZ: s.floorZ, stepDown: s.stepDown }), flat2);
        assertCutBands(res.moves, 0, s.stepDown, -s.floorZ);
        assertRampBands(res.moves, s.stepDown);
      }
      // tabbed: the deep levels cut span-by-span, all at their own level
      const tabbed = profile2d(
        profileOp({
          floorZ: -3,
          stepDown: 1,
          tabs: { count: 2, height: 0.5, length: 2 },
        }),
        flat2,
      );
      assertCutBands(tabbed.moves, 0, 1, 3);
      assertRampBands(tabbed.moves, 1);
    });
  });

  describe('drill', () => {
    function drillOp(over: Partial<DrillOp> = {}): DrillOp {
      return {
        kind: 'drill',
        id: 'op1',
        toolId: 'f2',
        targets: [{ x: 10, y: 20, topZ: 0, depth: 5 }],
        peckDepth: 2,
        plungeFeed: 300,
        safeClearance: 5,
        ...over,
      };
    }

    it('every peck ≤ peckDepth, the last one the shorter remainder on the floor', () => {
      const shapes: { depth: number; peck: number }[] = [
        { depth: 5, peck: 2 }, // pecks 2, 4, 5 — remainder 1
        { depth: 5, peck: 1.5 }, // 1.5, 3, 4.5, 5 — remainder 0.5
        { depth: 4, peck: 2 }, // exact multiple
        { depth: 2.5, peck: 0 }, // pecking off: one full-depth plunge
      ];
      for (const s of shapes) {
        const res = drill(
          drillOp({ targets: [{ x: 0, y: 0, topZ: 0, depth: s.depth }], peckDepth: s.peck }),
          flat2,
        );
        assertCutBands(res.moves, 0, s.peck > 0 ? s.peck : s.depth, s.depth);
      }
    });

    it('each hole ladders independently', () => {
      const res = drill(
        drillOp({
          targets: [
            { x: 0, y: 0, topZ: 0, depth: 3 },
            { x: 30, y: 0, topZ: 0, depth: 3 },
          ],
          peckDepth: 1.2,
        }),
        flat2,
      );
      assertCutBands(res.moves, 0, 1.2, 3);
    });
  });

  describe('engrave', () => {
    function engraveOp(over: Partial<EngraveParams> = {}): EngraveParams {
      return {
        id: 'e1',
        toolId: 'f2',
        paths: [
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
        ],
        depth: 1,
        stepDown: 1,
        feed: 400,
        plungeFeed: 100,
        clearance: 5,
        frame: { kind: 'flat', surfaceZ: 10 },
        ...over,
      };
    }

    it('depth levels step ≤ stepDown, the last exactly at the target depth', () => {
      const shapes: { depth: number; stepDown: number }[] = [
        { depth: 4.15, stepDown: 0.8 }, // 0.8×5 then a 0.15 remainder
        { depth: 2, stepDown: 1 }, // exact multiple
        { depth: 0.4, stepDown: 1 }, // single shallow pass
      ];
      for (const s of shapes) {
        const res = engrave(engraveOp({ depth: s.depth, stepDown: s.stepDown }));
        assertCutBands(res.moves, 10, s.stepDown, s.depth);
      }
    });

    it('each path ladders independently', () => {
      const res = engrave(
        engraveOp({
          depth: 1.5,
          stepDown: 0.7,
          paths: [
            [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            [
              { x: 5, y: 5 },
              { x: 7, y: 5 },
            ],
          ],
        }),
      );
      assertCutBands(res.moves, 10, 0.7, 1.5);
    });
  });

  describe('spiralCarve', () => {
    function spiralOp(over: Partial<SpiralCarveOp> = {}): SpiralCarveOp {
      return {
        kind: 'spiralCarve',
        id: 's1',
        toolId: 'f2',
        surfaceDiameter: 50,
        xStart: 0,
        xEnd: 50,
        spiralAngle: 45,
        count: 1,
        depth: 2,
        width: 0, // follow the lines: one fan pass per strand
        stepDown: 1,
        rotation: 'cw',
        feed: 400,
        plungeFeed: 100,
        ...over,
      };
    }

    it('groove levels step ≤ stepDown, the last exactly at the groove depth', () => {
      const shapes: { depth: number; stepDown: number }[] = [
        { depth: 4.15, stepDown: 0.8 },
        { depth: 2, stepDown: 1 }, // exact multiple
        { depth: 0.6, stepDown: 1 }, // single pass
      ];
      for (const s of shapes) {
        const res = spiralCarve(spiralOp({ depth: s.depth, stepDown: s.stepDown }), cal25, 2, 0);
        assertCutBands(res.moves, 25, s.stepDown, s.depth);
      }
    });

    it('each strand ladders independently', () => {
      const res = spiralCarve(spiralOp({ count: 2, depth: 1.5, stepDown: 0.8 }), cal25, 2, 0);
      assertCutBands(res.moves, 25, 0.8, 1.5);
    });
  });

  describe('thread', () => {
    // 90° bit, pitch 2, tolerance 0 → groove depth 0.5; root R = 10 − 0.5 = 9.5
    // in R12 stock → the ladder's full span is 2.5mm (surfaceZ = 12)
    const total = cal12.effectiveRadius - threadFaceDiameter(20, 0) / 2 + threadDepth(2, 90, 0);

    function threadOp(over: Partial<ThreadOp> = {}): ThreadOp {
      return {
        kind: 'thread',
        id: 'th1',
        toolId: 'v90',
        nominalDiameter: 20,
        xStart: 0,
        xEnd: 20,
        pitch: 2,
        starts: 1,
        tolerance: 0,
        stepDown: 0.5,
        rotation: 'cw',
        feed: 10000,
        plungeFeed: 100,
        surfaceDiameter: null,
        ...over,
      };
    }

    it('groove levels step ≤ stepDown and land on the root; the spring adds no depth', () => {
      const shapes: { stepDown: number }[] = [
        { stepDown: 0.5 }, // exact multiple — five rungs, plus the spring retrace
        { stepDown: 0.9 }, // 0.9, 1.8, then a 0.7 remainder
        { stepDown: 2.6 }, // the whole groove in one rung
      ];
      for (const s of shapes) {
        const res = thread(threadOp({ stepDown: s.stepDown }), cal12, vbit90, 0);
        assertCutBands(res.moves, 12, s.stepDown, total);
      }
    });

    it('each start ladders independently', () => {
      const res = thread(threadOp({ starts: 2, stepDown: 0.9 }), cal12, vbit90, 0);
      assertCutBands(res.moves, 12, 0.9, total);
    });
  });

  describe('cylChamfer', () => {
    function chamferOp(over: Partial<CylChamferOp> = {}): CylChamferOp {
      return {
        kind: 'cylChamfer',
        id: 'c1',
        toolId: 'v60',
        edges: [{ x: 40, diameter: 15 }],
        depth: 0.5,
        stepDown: 0.3,
        rotation: 'cw',
        plungeFeed: 100,
        ...over,
      };
    }

    it('flank radii step ≤ stepDown, the last exactly at the finished radius', () => {
      const shapes: { stepDown: number }[] = [
        { stepDown: 0.25 }, // exact multiple — 7.25, 7.0, no duplicate
        { stepDown: 0.3 }, // 7.2 then a 0.2 remainder
        { stepDown: 0.6 }, // the whole flank in one rung
      ];
      for (const s of shapes) {
        const res = cylChamfer(chamferOp({ stepDown: s.stepDown }), cal8175, vbit60, 0);
        // ladder top: the circle itself (depth > 0 cuts below it)
        assertCutBands(res.moves, 7.5, s.stepDown, 0.5);
      }
    });

    it('depth 0 anchors on the circle: the ladder comes down from the STOCK surface', () => {
      // 8.175 → 7.5 is 0.675mm: at 0.3 rungs → 0.3, 0.6, then 0.675 exactly
      const res = cylChamfer(chamferOp({ depth: 0, stepDown: 0.3 }), cal8175, vbit60, 0);
      assertCutBands(res.moves, 8.175, 0.3, 0.675);
    });

    it('each edge ladders independently', () => {
      const res = cylChamfer(
        chamferOp({
          stepDown: 0.3,
          edges: [
            { x: 20, diameter: 15 },
            { x: 40, diameter: 15 },
          ],
        }),
        cal8175,
        vbit60,
        0,
      );
      assertCutBands(res.moves, 7.5, 0.3, 0.5);
    });
  });

  describe('waterlineRough', () => {
    /**
     * n-gon cone standing in machine space: apex at (0,0,0), base ring of
     * radius r at z = −depth. Sections shrink upward, so every level shapes
     * the model — no skipped bands, no moat-only stop before the floor.
     */
    function cone(r: number, n: number, depth: number): Float32Array {
      const tri: number[] = [];
      for (let i = 0; i < n; i++) {
        const a0 = (2 * Math.PI * i) / n;
        const a1 = (2 * Math.PI * (i + 1)) / n;
        tri.push(
          0, 0, 0,
          Math.cos(a0) * r, Math.sin(a0) * r, -depth,
          Math.cos(a1) * r, Math.sin(a1) * r, -depth,
        );
      }
      return new Float32Array(tri);
    }

    function wopts(over: Partial<WaterlineRoughOptions> = {}): WaterlineRoughOptions {
      return {
        positions: cone(5, 32, 7),
        topZ: 0,
        floorZ: -7,
        stepDown: 3,
        stepOver: 1,
        allowance: 0,
        margin: 4,
        tool: flat2,
        feed: 500,
        plungeFeed: 200,
        safeClearance: 5,
        footprint: [square(-15, 30)],
        ...over,
      };
    }

    it('cut planes step ≤ stepDown and the ladder lands exactly on floor + allowance', () => {
      const shapes: { stepDown: number; allowance: number }[] = [
        { stepDown: 3, allowance: 0 },
        { stepDown: 3, allowance: 0.2 }, // each band DOC = stepDown − allowance
        { stepDown: 2.5, allowance: 0 }, // awkward remainder rung
        { stepDown: 7.5, allowance: 0 }, // one 7mm-deep first band fits one rung
      ];
      for (const s of shapes) {
        const res = waterlineRough(wopts({ stepDown: s.stepDown, allowance: s.allowance }));
        // every band emitted — the gaps below are honest cut bands, not skips
        expect(res.skippedLevels).toBe(0);
        expect(res.warnings.join(' ')).not.toMatch(/moat-only|allowance ≥ step-down/);
        const lv = res.levels;
        expect(lv.length).toBeGreaterThan(0);
        // the first band is one rung at most
        expect(0 - lv[0]).toBeLessThanOrEqual(s.stepDown + EPS);
        for (let i = 1; i < lv.length; i++) {
          const band = lv[i - 1] - lv[i];
          expect(band).toBeLessThanOrEqual(s.stepDown + EPS);
          expect(band).toBeGreaterThan(EPS); // no duplicate planes
        }
        // the rough ladder lands EXACTLY on its target: floor + allowance
        expect(lv[lv.length - 1]).toBeCloseTo(-7 + s.allowance, 9);
      }
    });
  });

  describe('rasterContour (relief)', () => {
    /**
     * Solid of revolution from a Z-descending radius profile — 64-gon rings
     * at each [z, r] pair, side walls between them. Flat-topped disc with
     * its top face at `topZ`: every surface cell sits exactly there, so the
     * rough ladder and the surface pass read as clean flat planes.
     */
    function lathe(profile: [number, number][]): Float32Array {
      const tri: number[] = [];
      const seg = 64;
      for (let i = 0; i + 1 < profile.length; i++) {
        const [z0, r0] = profile[i];
        const [z1, r1] = profile[i + 1];
        for (let s = 0; s < seg; s++) {
          const a0 = (2 * Math.PI * s) / seg;
          const a1 = (2 * Math.PI * (s + 1)) / seg;
          tri.push(
            Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
            Math.cos(a1) * r0, Math.sin(a1) * r0, z0,
            Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
          );
          tri.push(
            Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
            Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
            Math.cos(a0) * r1, Math.sin(a0) * r1, z1,
          );
        }
      }
      return new Float32Array(tri);
    }

    /** flat-topped disc, top face at zTop, wall 4mm down */
    function discAt(zTop: number): Float32Array {
      return lathe([
        [zTop, 0.001],
        [zTop, 5],
        [zTop - 4, 5],
      ]);
    }

    function ropts(over: Partial<RasterContourOptions> = {}): RasterContourOptions {
      return {
        positions: discAt(-2),
        pitch: 0.25,
        stepOver: 0.5,
        allowance: 0,
        topZ: 0,
        bottomZ: -10,
        tool: flat2,
        feed: 500,
        plungeFeed: 200,
        safeClearance: 5,
        ...over,
      };
    }

    it('rough levels step ≤ stepDown; the surface pass never takes more than one rung', () => {
      const shapes: { topZ: number; stepDown: number }[] = [
        { topZ: -2, stepDown: 1 }, // one rough level, then a 1mm finish band
        { topZ: -2, stepDown: 0.8 }, // 0.8, 1.6, then a 0.4 finish band
        { topZ: -2, stepDown: 2 }, // the whole depth is one rung: finish only
        { topZ: -1, stepDown: 1 }, // exact multiple: the finish IS the rung, cut once
      ];
      for (const s of shapes) {
        const res = rasterContour(ropts({ positions: discAt(s.topZ), stepDown: s.stepDown }));
        assertCutBands(res.moves, 0, s.stepDown, -s.topZ);
      }
    });
  });

  describe('rotaryCarve', () => {
    /** on-axis solid cylinder, axis ∥ X, centered at the origin */
    function cylinder(radius: number, length: number): Float32Array {
      const g = new THREE.CylinderGeometry(radius, radius, length, 48).toNonIndexed();
      g.rotateZ(Math.PI / 2); // geometry Y → machine X
      const attr = g.getAttribute('position') as THREE.BufferAttribute;
      return new Float32Array(attr.array as Float32Array);
    }

    function rcopts(over: Partial<RotaryCarveOptions> = {}): RotaryCarveOptions {
      return {
        positions: cylinder(5, 20),
        x0: -15,
        x1: 15,
        radius: 12,
        axisZ: 0,
        tool: flat2,
        stepDown: 2,
        stepOver: 1,
        allowance: 0,
        datumAngle: 0,
        feed: 300,
        plungeFeed: 100,
        safeClearance: 2,
        ...over,
      };
    }

    /** all feed (non-rapid) moves' z words — the cut radii (axisZ = 0). */
    const cutZs = (moves: Move[]): number[] =>
      moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);

    /** a 48-segment cylinder's sampled surface dips to the chord radius */
    const TESS = 5 * Math.cos(Math.PI / 48); // ≈ 4.9893

    it('radial bands ≤ stepDown — the finish never more than one rung below the last plane', () => {
      const shapes: { stepDown: number; levels: number }[] = [
        // planes 10, 8, 6; the finish takes ~1.01 below the last plane
        { stepDown: 2, levels: 3 },
        // planes 9.5, 7 — the finish's ~2.01 band is the shorter remainder
        { stepDown: 2.5, levels: 2 },
        // plane 6 only; the finish takes ~1
        { stepDown: 6, levels: 1 },
        // the whole 7.01mm depth fits one rung: no roughing at all
        { stepDown: 7.5, levels: 0 },
      ];
      for (const s of shapes) {
        const res = rotaryCarve(rcopts({ stepDown: s.stepDown }));
        expect(res.stats.levels).toBe(s.levels);
        // distinct cut radii, shallowest first: rough planes then the
        // finish's surface samples — every consecutive band ≤ stepDown
        const radii = [...new Set(cutZs(res.moves))].sort((a, b) => a - b);
        expect(radii.length).toBeGreaterThan(0);
        for (let i = 1; i < radii.length; i++) {
          expect(radii[i] - radii[i - 1]).toBeLessThanOrEqual(s.stepDown + 1e-6);
        }
        // the finish lands ON the compensated surface (the tessellated
        // chord radius on the waste floor) — never a step past it
        expect(Math.min(...radii)).toBeCloseTo(TESS, 2);
      }
    });
  });
});