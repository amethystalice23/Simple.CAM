import { describe, expect, it } from 'vitest';
import {
  faceCylinder,
  MAX_ROTARY_RPM,
  ROTARY_FEED_DEG_MIN,
  SAFE_CLEARANCE,
} from '../faceCylinder';
import { APPROACH_CLEARANCE } from '../paths';
import type { FaceCylinderOp, RotaryCalibration, Stock, Tool } from '../../core/types';
import { isSimultaneous, rotaryCalibrationOf } from '../../core/types';

const tool: Tool = {
  id: 't1',
  name: '6mm flat',
  type: 'flat',
  diameter: 6,
  spindleRpm: 18000,
};

const stock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 }, // Ø50 stock, axis at Z0
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};

// the generator takes the resolved rotary geometry, not the stock itself
const calibration: RotaryCalibration = stock.calibration;

const op: FaceCylinderOp = {
  kind: 'faceCylinder',
  id: 'op1',
  toolId: 't1',
  targetDiameter: 40, // Ø40 target => 5mm radial depth
  xStart: 0,
  xEnd: 100,
  stepDown: 1,
  stepOver: 4.8, // 0.8·Ø
  finishAllowance: 0.2, // rough to 4.8 => levels at 1,2,3,4 + finish at 5
  plungeFeed: 300,
  rotation: 'cw',
  pattern: 'spiral',
  feed: 600,
  // tail stock cut-over: the raw spiral (helical entries, no edge rings) —
  // the default (off) is the sharp rotary pocket, pinned in the describe
  // below. This fixture keeps the original spiral pins intact.
  cutBeyondStock: true,
};

// even 0.96mm rough increments throughout, so every helical entry takes the same time
const entryMinutes = Math.max(1 / op.plungeFeed, (90 / 360) / MAX_ROTARY_RPM);

// the even ladder for this fixture (totalDepth 5, stepDown 1, allowance
// 0.2): the rough span 4.8 divides into n = ceil(4.8/1) = 5 equal 0.96
// rungs landing exactly on the rough target, then the 0.2 allowance band —
// written as the same arithmetic the generator runs, so the fp values
// compare exactly.
const roughTarget = 5 - 0.2;
const evenZs = [
  ...Array.from({ length: 4 }, (_, i) => 25 - ((i + 1) * roughTarget) / 5),
  25 - roughTarget,
  20,
];

describe('faceCylinder: spiral', () => {
  const res = faceCylinder(op, calibration, tool);
  const stepDowns = res.moves.filter(
    (m) => !m.rapid && m.words.z !== undefined && m.words.a !== undefined && m.words.x === undefined,
  );
  const sweeps = res.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);

  it('schedules roughing levels plus one finishing level', () => {
    // Alice's ladder rule (2026-10-28) with the even strategy she chose:
    // the rough span 4.8 divides into n=5 equal 0.96 rungs landing exactly ON
    // the rough target, the finish takes exactly the allowance band
    // (4.8 → 5) — never a thin remainder anywhere, never a step over the
    // step-down (the old ladder jumped the finish 0.8 + 0.2 = 1.0 > 1).
    expect(res.passes).toBe(6);
    expect(res.radialDepth).toBeCloseTo(5, 9);
    // lift + travel + (step-down + sweep) × 6 levels + final retract
    expect(res.moves.length).toBe(15);
  });

  it('steps down in the cut: one Z+A move per level at surface - depth', () => {
    expect(stepDowns.map((m) => m.words.z)).toEqual(evenZs);
    for (const s of stepDowns) expect(s.feed).toBeCloseTo(1 / entryMinutes, 3);
    // the first entry comes from safe Z; the rest step down at the sweep ends
    expect(stepDowns[0].comment).toMatch(/helical entry/);
    expect(stepDowns[5].comment).toMatch(/spiral step down/);
  });

  it('emits coordinated X+A sweeps in G93 form (feed = 1/passMinutes)', () => {
    expect(sweeps.length).toBe(6);
    const revs = 100 / (0.8 * 6); // span / stepOver
    const passMinutes = revs / MAX_ROTARY_RPM;
    for (const s of sweeps) expect(s.feed).toBeCloseTo(1 / passMinutes, 4);
  });

  it('retraces the helix: return sweeps rotate BACK, A stays bounded', () => {
    // each level: +90° step, then ±7500° following the sweep direction —
    // the return sweep comes back ALONG the groove instead of piling on
    // another 7500 (which wound the axis to levels×(7500+90) by the end)
    const advance = (100 / 4.8) * 360;
    expect(sweeps.map((s) => s.words.a)).toEqual([
      90 + advance, // forward
      180, // back along the helix
      270 + advance,
      360,
      450 + advance,
      540, // the finish level sweeps back along the helix
    ]);
    expect(sweeps.map((s) => s.words.x)).toEqual([100, 0, 100, 0, 100, 0]);
  });

  it('approaches with axis-separate rapids and retracts once', () => {
    // travel (X only) → descend (Z only) — the travel runs at the machine's
    // existing height (after a tool change, the swap macro's high park),
    // the descent happens over the destination. The spiral has no pattern
    // phase, so there is no positioning rotation at all; never a
    // coordinated X+A rapid. The fixture runs cutBeyondStock (no edge
    // rings): the descent stops APPROACH_CLEARANCE above the crown — the
    // helical entry then spirals the increment in from there instead of
    // spinning in air from the safe plane (Alice, 2026-11-07) — and the
    // final retract still lifts to the full safe plane.
    const zRapids = res.moves.filter((m) => m.rapid && m.words.z !== undefined && m.words.x === undefined);
    expect(zRapids.length).toBe(2); // entry descent + final retract
    expect(zRapids[0].words.z).toBe(25 + APPROACH_CLEARANCE); // above the crown
    expect(zRapids[1].words.z).toBe(25 + SAFE_CLEARANCE); // the final retract
    const xRapids = res.moves.filter((m) => m.rapid && m.words.x !== undefined);
    expect(xRapids).toHaveLength(1);
    expect(xRapids[0].words.x).toBe(op.xStart);
    expect(xRapids[0].comment).toMatch(/pass 1\/6/); // the pass label rides the travel
    // the travel PRECEDES the descent
    expect(res.moves[0].words.x).toBe(op.xStart);
    expect(res.moves[1].words.z).toBe(25 + APPROACH_CLEARANCE);
    expect(
      res.moves.some((m) => m.rapid && m.words.a !== undefined && m.words.x !== undefined),
    ).toBe(false);
  });

  it('keeps the safe-plane descent for squared-edge spirals (cut-over OFF)', () => {
    // the low entry descent is cut-over-ON only: with edge rings the
    // straight plunge happens before any A motion and the entry ring
    // squares the edge from passZ — the safe-plane descent stands
    const squared = faceCylinder(
      { ...op, cutBeyondStock: false },
      calibration,
      tool,
    );
    const zs = squared.moves
      .filter((m) => m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z);
    expect(zs).toEqual([25 + SAFE_CLEARANCE, 25 + SAFE_CLEARANCE]);
  });

  it('continues from the machine\'s A (startA) — never unwinds the pile', () => {
    // a face op after 4680° of prior work: sweeps continue from there,
    // no G0 A0 dragging the axis back through 13 revolutions
    const res = faceCylinder(op, calibration, tool, 4680);
    const first = res.moves.find((m) => !m.rapid && m.words.a !== undefined)!;
    expect(first.words.a).toBeCloseTo(4680 + 90, 3);
    expect(res.moves.some((m) => m.rapid && m.words.a !== undefined)).toBe(false);
  });

  it('estimates rotation-rate-limited time honestly', () => {
    // every level's helical entry is rotary-bound ((90/360)/RPM > any
    // increment/plungeFeed here), so one entryMinutes per level
    const passMinutes = 100 / 4.8 / MAX_ROTARY_RPM;
    expect(res.estimatedMinutes).toBeCloseTo(6 * (passMinutes + entryMinutes), 3);
  });

  it('reverses A for ccw rotation', () => {
    const ccw = faceCylinder({ ...op, rotation: 'ccw' }, calibration, tool);
    const ccwSweeps = ccw.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(ccwSweeps[0].words.a).toBeCloseTo(-(100 / 4.8) * 360 - 90, 3);
  });

  it('respects the axial range', () => {
    const narrow = faceCylinder({ ...op, xStart: 10, xEnd: 90 }, calibration, tool);
    const narrowSweeps = narrow.moves.filter(
      (m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined,
    );
    expect(narrowSweeps.map((s) => s.words.x)).toEqual([90, 10, 90, 10, 90, 10]);
  });

  it("enforces Alice's ladder rule: even bands ≤ stepDown, roughs land on totalDepth − allowance", () => {
    // the rule as she stated it (2026-10-28), with the even strategy she
    // chose: every band ≤ stepDown AND every rough band EQUALS span/n — the
    // max-min distribution, no thin remainder anywhere (acetal punishes a
    // thin chip: it rubs and melts instead of shearing)
    for (const [depth, sd, allow] of [
      [4.15, 0.8, 0.2], // her example: rough 3.95 in n=5 → 0.79 rungs, finish 0.2
      [4.15, 0.8, 0.1], // her saved job: rough 4.05 in n=6 → 0.675 rungs
      [5, 1, 0.2], // this fixture: rough 4.8 in n=5 → 0.96 rungs
      [4.0, 0.8, 0], // no allowance: exact multiple — 5 × 0.8, last level is the finish
      [3.0, 1.5, 0.4], // rough 2.6 in n=2 → 1.3 rungs
      [1.0, 2.0, 0.2], // single shallow rough level 0.8 (n=1), finish 0.2
    ] as const) {
      const r = faceCylinder(
        {
          ...op,
          targetDiameter: (25 - depth) * 2, // totalDepth = depth
          stepDown: sd,
          finishAllowance: allow,
        },
        calibration,
        tool,
      );
      expect(r.passes).toBeGreaterThan(0);
      // reconstruct the emitted ladder from the Z+A step-downs
      const ladder: number[] = [];
      for (const m of r.moves) {
        if (m.words.z !== undefined && m.words.a !== undefined && m.words.x === undefined && !m.rapid) {
          ladder.push(25 - m.words.z);
        }
      }
      const roughTarget = Math.max(depth - allow, 0);
      const roughN = roughTarget > 0 ? Math.ceil(roughTarget / sd) : 0;
      const finN = allow > 1e-9 ? Math.ceil(allow / sd) : 0;
      expect(ladder.length).toBe(roughN + finN);
      // every increment ≤ stepDown (never a bigger step)
      let prev = 0;
      for (const d of ladder) {
        expect(d - prev).toBeLessThanOrEqual(sd + 1e-9);
        prev = d;
      }
      // the even strategy: every rough band equals span/n, every finish
      // band equals allowance/m — no remainder rung anywhere
      for (let i = 1; i <= ladder.length; i++) {
        const band = ladder[i - 1] - (i >= 2 ? ladder[i - 2] : 0);
        const want = i <= roughN ? roughTarget / roughN : allow / finN;
        expect(band).toBeCloseTo(want, 9);
      }
      // the rough ladder lands EXACTLY on totalDepth − allowance
      if (allow > 0 && roughTarget > 0) {
        expect(ladder.some((d) => Math.abs(d - roughTarget) < 1e-9)).toBe(true);
      }
      // and the final level is exactly totalDepth
      expect(Math.abs(ladder[ladder.length - 1] - depth)).toBeLessThan(1e-9);
    }
  });
});

describe('faceCylinder: spiral with squared edges (cut-over OFF, the default)', () => {
  // Alice's 2026-10-27 rotary-pocket rule: with tail stock cut-over off,
  // every level opens with a fixed-X plunge to passZ then a full 360° edge
  // ring at the entry X (so the helical entry dives into PRE-CLEARED air —
  // no helical groove scarred into the end wall) and closes with an exit
  // ring at the sweep end (both ends flush). Rings run A-only at the G94
  // rotary feed, one per level + per end. PATH BOUNDS: the tool CENTER
  // travels inset by toolR (3 for this fixture), so the flute's EDGE cuts
  // exactly to the defined xStart/xEnd — never a radius past the line
  // (her "you are cutting too far" report).
  const res = faceCylinder({ ...op, cutBeyondStock: false }, calibration, tool);
  const toolR = tool.diameter / 2;
  const pX0 = Math.min(op.xStart + toolR, op.xEnd - toolR); // path bounds
  const pX1 = Math.max(op.xEnd - toolR, pX0);
  const edgeRings = res.moves.filter(
    (m) =>
      !m.rapid &&
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.z === undefined &&
      m.feed === ROTARY_FEED_DEG_MIN,
  );
  const plunges = res.moves.filter(
    (m) => !m.rapid && m.words.z !== undefined && m.words.a === undefined && m.words.x === undefined,
  );

  it('opens and closes every level with a 360° edge ring', () => {
    expect(edgeRings.length).toBe(12); // 6 levels × (entry ring + exit ring)
    for (const r of edgeRings) {
      expect(r.comment).toMatch(/entry ring 360|exit ring 360/);
      // rings sit ON the path bounds (tool-center inset by toolR)
      expect(r.comment).toMatch(new RegExp(`X(${pX0.toFixed(1)}|${pX1.toFixed(1)})`));
    }
  });

  it('plunges to each level at FIXED X before its entry ring', () => {
    // level 1 plunges from safe Z (the level-0 "surface"), the rest step
    // down one increment at the previous level's sweep end — both at the
    // entry X, straight (no A word), so the ring below cuts pre-cleared
    expect(plunges.map((m) => m.words.z)).toEqual(evenZs);
    expect(plunges.map((m) => m.feed)).toEqual(
      Array.from({ length: 6 }, () => op.plungeFeed), // G94 mm/min, A stationary
    );
    // each plunge PRECEDES its level's entry ring
    let pi = 0;
    for (let ri = 0; ri < edgeRings.length; ri += 2) {
      expect(res.moves.indexOf(plunges[pi])).toBeLessThan(res.moves.indexOf(edgeRings[ri]));
      pi++;
    }
  });

  it('squares both ends: ring X positions alternate with the sweep direction', () => {
    const xs = edgeRings.map((r) => r.comment!.match(/X([\d.]+)/)![1]);
    // levels alternate entry ends — the entry ring sits at the level's
    // sweep start (path bound), the exit ring at its sweep end
    expect(xs).toEqual([
      pX0.toFixed(1), pX1.toFixed(1), // level 1: entry then exit
      pX1.toFixed(1), pX0.toFixed(1), // level 2 (reversed)
      pX0.toFixed(1), pX1.toFixed(1),
      pX1.toFixed(1), pX0.toFixed(1),
      pX0.toFixed(1), pX1.toFixed(1),
      pX1.toFixed(1), pX0.toFixed(1),
    ]);
  });

  it('insets the tool-center path by toolR — the flute EDGE cuts to the line', () => {
    // every X word the op emits stays inside [xStart+toolR, xEnd-toolR];
    // the flute edge (center ± toolR) lands exactly on the defined lines
    const xs = res.moves
      .map((m) => m.words.x)
      .filter((x): x is number => x !== undefined);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(pX0 - 1e-9);
      expect(x).toBeLessThanOrEqual(pX1 + 1e-9);
    }
    // the swept endpoints ARE the path bounds: edge = bound ± toolR = line
    // (spiral sweeps coordinate X+A in G93 — the first sweep runs X0→X97)
    const sweepEnds = res.moves
      .filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined)
      .map((m) => m.words.x as number);
    expect(sweepEnds[0]).toBeCloseTo(pX1, 6);
    expect(sweepEnds[0] + toolR).toBeCloseTo(op.xEnd, 6); // edge on the line
  });

  it('charges each level honestly: plunge + 2 rings + entry + pass', () => {
    const ringMinutes = 1 / MAX_ROTARY_RPM;
    const pathSpan = pX1 - pX0;
    const passMinutes = pathSpan / op.stepOver / MAX_ROTARY_RPM;
    // the fixed-X plunges telescope: their increments sum to totalDepth (5)
    // — per-level increments [0.96 × 5, 0.2]; entryMinutes is rotary-bound
    // and equal every level
    expect(res.estimatedMinutes).toBeCloseTo(
      6 * (passMinutes + entryMinutes + 2 * ringMinutes) + 5 / op.plungeFeed,
      3,
    );
  });

  it('keeps the helical entry (into pre-cleared air) and the retrace', () => {
    const stepDowns = res.moves.filter(
      (m) => !m.rapid && m.words.z !== undefined && m.words.a !== undefined && m.words.x === undefined,
    );
    expect(stepDowns.map((m) => m.words.z)).toEqual(evenZs);
    const sweeps = res.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    // sweeps alternate between the PATH bounds (not the raw xStart/xEnd)
    expect(sweeps.map((s) => s.words.x)).toEqual([pX1, pX0, pX1, pX0, pX1, pX0]);
  });

  it('faces a flute-width band (span = tool Ø) with rings only — no dead sweep, finite feeds', () => {
    // the 2026-11-05 field halt (TDC_Adjust): a 2mm span cut with a 2mm
    // bit — her break-off tab channels. The tool-center path collapses to
    // a point (pathSpan 0), so the sweep is a dead move whose G93 feed
    // was 1/0 = Infinity and the post emitted a literal `FInfinity` that
    // halted the Z1 ("Invalid number in expression", 4% into the job).
    // The plunge + edge rings already face the whole band; the sweep must
    // simply not be emitted, and every emitted feed must be finite.
    const channelTool: Tool = { ...tool, name: '2mm flat', diameter: 2 };
    const res2 = faceCylinder(
      { ...op, xStart: 6.2, xEnd: 8.2, targetDiameter: 7, cutBeyondStock: false },
      calibration,
      channelTool,
    );
    // no X-bearing cut move at all: the path is a point, the flute covers
    // the band from its parked X — only plunges and A-only rings cut
    const xCuts = res2.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(xCuts).toEqual([]);
    // every emitted feed is finite (the regression the halt pinned)
    for (const m of res2.moves) {
      if (!m.rapid) expect(Number.isFinite(m.feed)).toBe(true);
    }
    // the rings still do the facing: one entry + exit ring per level.
    // Ø50 stock to Ø7 with stepDown 1 + 0.2 allowance = 23 even levels
    // (rough 21.3 in 22 rungs + finish 0.2) — the job's own parameters.
    const rings = res2.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined,
    );
    expect(rings.length).toBe(46); // 23 levels × 2 rings
  });
});

describe('faceCylinder: vertical (rings)', () => {
  const res = faceCylinder({ ...op, pattern: 'vertical' }, calibration, tool);
  const ringMoves = res.moves.filter(
    (m) => !m.rapid && m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined,
  );
  const plunges = res.moves.filter(
    (m) => !m.rapid && m.words.z !== undefined && m.words.x === undefined && m.words.a === undefined,
  );
  const xSteps = res.moves.filter(
    (m) => !m.rapid && m.words.x !== undefined && m.words.a === undefined,
  );
  const rapids = res.moves.filter((m) => m.rapid);

  it('cuts a ring at every step-over position, ending exactly at xEnd', () => {
    // span 100 / stepOver 4.8 => 21 rings at 4.8 spacing + a short final
    // ring at 100 => 22 rings per level; the ladder (Alice's rule, even) is
    // [0.96, 1.92, 2.88, 3.84, 4.8, 5] → 6 levels
    expect(ringMoves.length).toBe(6 * 22);
    const level0Xs = xSteps.slice(0, 21).map((m) => m.words.x);
    expect(level0Xs[0]).toBeCloseTo(4.8, 9);
    expect(level0Xs[19]).toBeCloseTo(96, 9);
    expect(level0Xs[20]).toBeCloseTo(100, 9);
  });

  it('snakes between levels, plunging to the next depth at the level end', () => {
    // one straight plunge per level, at the X where the previous level ended
    expect(plunges.length).toBe(6);
    expect(plunges.map((p) => p.words.z)).toEqual(evenZs);
    for (const p of plunges) expect(p.feed).toBe(300);
    // level 1 runs back over the same ring positions: 100 → 96 → … → 0
    expect(xSteps[21].words.x).toBeCloseTo(96, 9);
    expect(xSteps[41].words.x).toBeCloseTo(0, 9);
  });

  it('retracts only at the entry and after the final level', () => {
    // travel → descent → rings → final retract — no rapids between rings
    // or levels (the combined old X+Z entry is now split in two, travel
    // first, descend at the destination)
    expect(rapids.length).toBe(3);
    expect(rapids[0].words.x).toBeCloseTo(0, 9);
    expect(rapids[0].words.z).toBeUndefined(); // the travel carries no Z word
    expect(rapids[1].words.z).toBe(25 + SAFE_CLEARANCE); // the descent
    expect(rapids[2].words.z).toBe(25 + SAFE_CLEARANCE); // the final retract
    expect(res.moves.length).toBe(45 + 5 * 44 + 2); // 267: 6 levels × 44 + entry 3
  });

  it('runs full revolutions as A-only moves at the rotary limit (G94 deg/min)', () => {
    // A-only moves are NOT simultaneous, so the post runs them in G94 —
    // the feed is deg/min: one revolution takes 1/MAX_ROTARY_RPM minutes
    expect(ringMoves.every((m) => !isSimultaneous(m))).toBe(true);
    expect(ringMoves.every((m) => m.feed === ROTARY_FEED_DEG_MIN)).toBe(true);
    expect(ROTARY_FEED_DEG_MIN).toBeCloseTo(MAX_ROTARY_RPM * 360, 9); // ≈2376
  });

  it('turns every ring the same way (A accumulates, like the spiral)', () => {
    const aVals = ringMoves.map((m) => m.words.a ?? 0);
    for (let i = 1; i < aVals.length; i++) {
      expect(aVals[i] - aVals[i - 1]).toBeCloseTo(360, 6);
    }
    expect(aVals[0]).toBeCloseTo(360, 6);
    expect(aVals[aVals.length - 1]).toBeCloseTo(132 * 360, 3); // 6 levels × 22 rings
  });

  it('steps X in the cut at the cut feed (G94, A stationary)', () => {
    expect(xSteps.length).toBe(6 * 21);
    for (const s of xSteps) {
      expect(s.feed).toBe(600);
      expect(s.words.a).toBeUndefined();
      expect(s.words.z).toBeUndefined();
    }
    // no coordinated-A cutting moves outside the plunge-free ring pattern
    expect(res.moves.filter((m) => isSimultaneous(m) && !m.rapid)).toHaveLength(0);
  });

  it('reverses A for ccw rotation', () => {
    const ccw = faceCylinder({ ...op, pattern: 'vertical', rotation: 'ccw' }, calibration, tool);
    const ccwRings = ccw.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined,
    );
    expect(ccwRings[0].words.a).toBeCloseTo(-360, 6);
  });

  it('estimates time as plunges + revolutions + X steps', () => {
    // plunges telescope to totalDepth (5mm) at plungeFeed; 6 levels × 22
    // revolutions at the rotary limit; 6 levels × span at the cut feed
    expect(res.estimatedMinutes).toBeCloseTo(
      5 / 300 + (6 * 22) / MAX_ROTARY_RPM + (6 * 100) / 600,
      3,
    );
  });
});

describe('faceCylinder: horizontal (indexed passes)', () => {
  const res = faceCylinder({ ...op, pattern: 'horizontal' }, calibration, tool);
  const sweeps = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
  const plunges = res.moves.filter((m) => !m.rapid && m.words.z !== undefined);
  const indexRapids = res.moves.filter((m) => m.rapid && m.words.a !== undefined);

  it('indexes the full 360° per level at a step-over arc on the cut radius', () => {
    // level arcs at r = 24.04, 23.08, 22.12, 21.16, 20.2, 20 (the even
    // ladder [0.96, 1.92, 2.88, 3.84, 4.8, 5])
    // => 32+31+29+28+27+27 = 174 passes
    expect(sweeps.length).toBe(174);
    const stepDeg = (4.8 / (25 - (1 * roughTarget) / 5)) * (180 / Math.PI); // level 0 cuts at r = 25 − 0.96
    const a0 = indexRapids[0]?.words.a ?? 0;
    const a1 = indexRapids[1]?.words.a ?? 0;
    expect(a1 - a0).toBeCloseTo(stepDeg, 3);
  });

  it('zigzags X so A only ever advances one way', () => {
    expect(sweeps.map((s) => s.words.x)).toEqual(
      Array.from({ length: 174 }, (_, i) => (i % 2 === 0 ? 100 : 0)),
    );
    const aVals = indexRapids.map((m) => m.words.a ?? 0);
    for (let i = 1; i < aVals.length; i++) expect(aVals[i]).toBeGreaterThan(aVals[i - 1]);
  });

  it('plunges straight (G94 plungeFeed, A stationary) then sweeps at the cut feed', () => {
    expect(plunges.length).toBe(174);
    for (const p of plunges) {
      expect(p.feed).toBe(300);
      expect(p.words.a).toBeUndefined();
    }
    expect(sweeps.every((s) => s.feed === 600 && s.words.a === undefined)).toBe(true);
    // no coordinated A cutting moves — the whole pattern runs in G94
    // (positioning rapids are axis-separate too: the rotary step is its
    // own A-only rapid, the return travel its own X-only rapid)
    expect(res.moves.filter((m) => isSimultaneous(m) && !m.rapid)).toHaveLength(0);
    // depth per level: 32×z24.04, 31×z23.08, 29×z22.12, 28×z21.16, 27×z20.2, 27×z20
    const zs = plunges.map((p) => p.words.z);
    expect(zs[0]).toBe(25 - (1 * roughTarget) / 5);
    expect(zs[31]).toBe(25 - (1 * roughTarget) / 5);
    expect(zs[32]).toBe(25 - (2 * roughTarget) / 5);
    expect(zs[120]).toBeCloseTo(20.2, 9);
    expect(zs[173]).toBe(20);
  });

  it('retracts between passes and repositions on axis-separate rapids', () => {
    // every pass ends lifted to the clearance height (plus one entry lift)
    const zRapids = res.moves.filter((m) => m.rapid && m.words.z !== undefined);
    expect(zRapids.length).toBe(175);
    expect(zRapids.every((m) => m.words.z === 25 + SAFE_CLEARANCE)).toBe(true);
    // the pass-to-pass step arc is an A-only rapid, the return an X-only one
    const travels = res.moves.filter((m) => m.rapid && m.words.x !== undefined && m.words.a === undefined);
    expect(travels).toHaveLength(174);
    expect(travels.every((m) => m.words.z === undefined)).toBe(true);
    expect(res.moves.some((m) => m.rapid && m.words.a !== undefined && (m.words.x !== undefined || m.words.z !== undefined))).toBe(false);
  });

  it('estimates time from plunge + sweep feeds', () => {
    // each pass charges its LEVEL's increment at plungeFeed (the pass count
    // per level: 32+31+29+28+27+27): five levels at the even 0.96 rung and
    // the finish at 0.2 → (147 × 0.96 + 27 × 0.2) = 146.52mm at plungeFeed
    expect(res.estimatedMinutes).toBeCloseTo((147 * 0.96 + 27 * 0.2) / 300 + (174 * 100) / 600, 3);
  });
});

describe('faceCylinder: validation', () => {
  it('rejects a target above stock diameter', () => {
    expect(() =>
      faceCylinder({ ...op, targetDiameter: 60 }, calibration, tool),
    ).toThrowError(/not below stock radius/);
  });

  it('rejects a channel narrower than the tool when cut-over is off — in channel terms', () => {
    // Alice's 2026-11-06 ruling: the span is a channel WIDTH. Narrower
    // than the tool with cut-over OFF is the error; the old "xStart and
    // xEnd must differ" refused legitimate centerline channels.
    // (this fixture runs cutBeyondStock: true — the guard must not fire)
    expect(() =>
      faceCylinder({ ...op, cutBeyondStock: false, xEnd: 0 }, calibration, tool),
    ).toThrowError(/channel width .* narrower than the tool/);
  });

  it('accepts a centerline channel (xStart == xEnd) with cut-over on — plunge + rings', () => {
    // her U-channel: a ball-nose channel specified by its centerline —
    // legal as a tool-width plunge cut when "allow tail stock cut-over"
    // is enabled. Zero span, cut-over ON: the guard must NOT fire, and
    // the result must carry only finite feeds (no dead sweeps).
    const ball: Tool = { ...tool, name: '1mm ball', type: 'ball', diameter: 1 };
    const res = faceCylinder({ ...op, xStart: 8.2, xEnd: 8.2, targetDiameter: 4.18 }, calibration, ball);
    expect(res.moves.filter((m) => !m.rapid).length).toBeGreaterThan(0);
    for (const m of res.moves) {
      if (!m.rapid) expect(Number.isFinite(m.feed)).toBe(true);
    }
  });

  it('accepts a tool-width channel with cut-over off — rings only, finite feeds', () => {
    // span == tool Ø exactly: the inset collapses the path to a point but
    // the guard (span < Ø) must not fire — the rings face the band.
    const ch: Tool = { ...tool, name: '2mm flat', diameter: 2 };
    const res = faceCylinder(
      { ...op, xStart: 6.2, xEnd: 8.2, cutBeyondStock: false, targetDiameter: 40 },
      calibration,
      ch,
    );
    for (const m of res.moves) {
      if (!m.rapid) expect(Number.isFinite(m.feed)).toBe(true);
    }
  });

  it('rejects a non-positive cut feed', () => {
    expect(() => faceCylinder({ ...op, feed: 0 }, calibration, tool)).toThrowError(/feed must be positive/);
  });

  it('rejects a non-positive step-over', () => {
    expect(() => faceCylinder({ ...op, stepOver: 0 }, calibration, tool)).toThrowError(/stepOver must be positive/);
  });

  it('rejects a zero-diameter tool', () => {
    expect(() => faceCylinder(op, calibration, { ...tool, diameter: 0 })).toThrowError(/tool diameter/);
  });
});

describe('faceCylinder: 4-axis box stock (derived diagonal calibration)', () => {
  const box: Extract<Stock, { kind: 'box' }> = {
    kind: 'box',
    sizeX: 100,
    sizeY: 20,
    sizeZ: 30,
    origin: { x: 'min', y: 'mid', z: 'min' },
    axisMode: '4-axis',
    materialId: 'aluminum-6061',
  };
  const calib = rotaryCalibrationOf(box);
  // corners of a 20(Y)×30(Z) box sit at half the Y-Z diagonal
  const r0 = Math.hypot(20, 30) / 2;

  it('derives box rotary geometry: axis at the Z-span center, radius = half-diagonal', () => {
    expect(calib.aOriginDeg).toBe(0);
    expect(calib.axisZ).toBe(15); // origin z 'min' => box spans machine Z 0…30
    expect(calib.effectiveRadius).toBeCloseTo(r0, 9);
  });

  it('derives axisZ from the origin placement', () => {
    const flipped = rotaryCalibrationOf({ ...box, origin: { ...box.origin, z: 'max' } });
    expect(flipped.axisZ).toBe(-15); // origin z 'max' => box spans machine Z −30…0
    expect(flipped.effectiveRadius).toBeCloseTo(r0, 9);
  });

  it('passes the cylinder stock calibration through unchanged', () => {
    expect(rotaryCalibrationOf(stock)).toBe(stock.calibration);
  });

  it('faces the corners first: surface at axisZ + half-diagonal', () => {
    const res = faceCylinder({ ...op, targetDiameter: 30 }, calib, tool);
    expect(res.radialDepth).toBeCloseTo(r0 - 15, 9); // Ø30 target on Ø36.06 box corners
    // first Z cut sits one EVEN rung below the corner surface — the rough
    // span (r0 − 15 − allowance) divides into n = ceil(span/stepDown) equal
    // bands; the flats are lower still, so this pass cuts air over them —
    // never a gouge
    const firstZ = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    const roughSpan = r0 - 15 - op.finishAllowance;
    expect(firstZ?.words.z).toBeCloseTo(
      15 + r0 - roughSpan / Math.ceil(roughSpan / op.stepDown),
      6,
    );
  });
});
describe('faceCylinder: clearance override', () => {
  it('lifts the approach to the ⚡ clearance above the stock surface', () => {
    // stock R25 surface at Z25: default clearance 5 → safe Z30, override 9 → Z34.
    // The override governs the FINAL RETRACT and the safe-plane descent
    // everywhere the helix does not start below it; the cut-over spiral's
    // ENTRY descent still stops APPROACH_CLEARANCE above the crown (the
    // op knows the declared crown is clear — that is the one altitude it
    // must not second-guess), so the first rapid reads 25.5 here.
    const res = faceCylinder({ ...op, clearance: 9 }, calibration, tool);
    const zs = res.moves.filter((m) => m.rapid && m.words.z !== undefined).map((m) => m.words.z);
    expect(zs.length).toBeGreaterThan(0);
    expect(zs[0]).toBeCloseTo(25 + APPROACH_CLEARANCE, 6); // the cut-over entry descent
    for (const z of zs.slice(1)) expect(z).toBeCloseTo(34, 6); // retract at the override
    const plain = faceCylinder(op, calibration, tool);
    const plainZ = plain.moves.find((m) => m.rapid && m.words.z !== undefined)?.words.z;
    expect(plainZ).toBeCloseTo(25 + APPROACH_CLEARANCE, 6);
  });
});
