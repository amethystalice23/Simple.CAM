import { describe, expect, it } from 'vitest';
import {
  faceCylinder,
  MAX_ROTARY_RPM,
  ROTARY_FEED_DEG_MIN,
  SAFE_CLEARANCE,
} from '../faceCylinder';
import type { FaceCylinderOp, Stock, Tool } from '../../core/types';
import { isSimultaneous } from '../../core/types';

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
  materialId: 'aluminum-6061',
};

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
};

// 1mm radial increments throughout, so every helical entry takes the same time
const entryMinutes = Math.max(1 / op.plungeFeed, (90 / 360) / MAX_ROTARY_RPM);

describe('faceCylinder: spiral', () => {
  const res = faceCylinder(op, stock, tool);
  const stepDowns = res.moves.filter(
    (m) => !m.rapid && m.words.z !== undefined && m.words.a !== undefined && m.words.x === undefined,
  );
  const sweeps = res.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);

  it('schedules roughing levels plus one finishing level', () => {
    expect(res.passes).toBe(5);
    expect(res.radialDepth).toBeCloseTo(5, 9);
    // approach + (step-down + sweep) × 5 levels + final retract
    expect(res.moves.length).toBe(12);
  });

  it('steps down in the cut: one Z+A move per level at surface - depth', () => {
    expect(stepDowns.map((m) => m.words.z)).toEqual([24, 23, 22, 21, 20]);
    for (const s of stepDowns) expect(s.feed).toBeCloseTo(1 / entryMinutes, 3);
    // the first entry comes from safe Z; the rest step down at the sweep ends
    expect(stepDowns[0].comment).toMatch(/helical entry/);
    expect(stepDowns[4].comment).toMatch(/spiral step down/);
  });

  it('emits coordinated X+A sweeps in G93 form (feed = 1/passMinutes)', () => {
    expect(sweeps.length).toBe(5);
    const revs = 100 / (0.8 * 6); // span / stepOver
    const passMinutes = revs / MAX_ROTARY_RPM;
    for (const s of sweeps) expect(s.feed).toBeCloseTo(1 / passMinutes, 4);
  });

  it('accumulates A continuously past 360 degrees, alternating sweep direction', () => {
    const perLevel = (100 / 4.8) * 360 + 90; // 7500° sweep + 90° entry
    expect(sweeps[0].words.a).toBeCloseTo(perLevel, 3);
    expect(sweeps[4].words.a).toBeCloseTo(5 * perLevel, 3); // 37950
    expect(sweeps.map((s) => s.words.x)).toEqual([100, 0, 100, 0, 100]);
  });

  it('approaches once and retracts once', () => {
    const safeRetracts = res.moves.filter((m) => m.rapid && m.words.z !== undefined && m.words.x === undefined);
    expect(safeRetracts.length).toBe(1);
    expect(safeRetracts[0].words.z).toBe(25 + SAFE_CLEARANCE);
    const entryRapids = res.moves.filter((m) => m.rapid && m.words.x !== undefined);
    expect(entryRapids.length).toBe(1);
  });

  it('estimates rotation-rate-limited time honestly', () => {
    const passMinutes = 100 / 4.8 / MAX_ROTARY_RPM;
    expect(res.estimatedMinutes).toBeCloseTo(5 * (passMinutes + entryMinutes), 3);
  });

  it('reverses A for ccw rotation', () => {
    const ccw = faceCylinder({ ...op, rotation: 'ccw' }, stock, tool);
    const ccwSweeps = ccw.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(ccwSweeps[0].words.a).toBeCloseTo(-(100 / 4.8) * 360 - 90, 3);
  });

  it('respects the axial range', () => {
    const narrow = faceCylinder({ ...op, xStart: 10, xEnd: 90 }, stock, tool);
    const narrowSweeps = narrow.moves.filter(
      (m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined,
    );
    expect(narrowSweeps.map((s) => s.words.x)).toEqual([90, 10, 90, 10, 90]);
  });
});

describe('faceCylinder: vertical (rings)', () => {
  const res = faceCylinder({ ...op, pattern: 'vertical' }, stock, tool);
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
    // ring at 100 => 22 rings per level, 5 levels
    expect(ringMoves.length).toBe(5 * 22);
    const level0Xs = xSteps.slice(0, 21).map((m) => m.words.x);
    expect(level0Xs[0]).toBeCloseTo(4.8, 9);
    expect(level0Xs[19]).toBeCloseTo(96, 9);
    expect(level0Xs[20]).toBeCloseTo(100, 9);
  });

  it('snakes between levels, plunging to the next depth at the level end', () => {
    // one straight plunge per level, at the X where the previous level ended
    expect(plunges.length).toBe(5);
    expect(plunges.map((p) => p.words.z)).toEqual([24, 23, 22, 21, 20]);
    for (const p of plunges) expect(p.feed).toBe(300);
    // level 1 runs back over the same ring positions: 100 → 96 → … → 0
    expect(xSteps[21].words.x).toBeCloseTo(96, 9);
    expect(xSteps[41].words.x).toBeCloseTo(0, 9);
  });

  it('retracts only twice: the initial approach and after the final level', () => {
    // approach rapid + final retract — nothing between rings or levels
    expect(rapids.length).toBe(2);
    expect(rapids[0].words.x).toBeCloseTo(0, 9);
    expect(rapids[0].words.z).toBe(25 + SAFE_CLEARANCE);
    expect(rapids[1].words.z).toBe(25 + SAFE_CLEARANCE);
    expect(res.moves.length).toBe(45 + 4 * 44 + 1); // 222
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
    expect(aVals[aVals.length - 1]).toBeCloseTo(110 * 360, 3);
  });

  it('steps X in the cut at the cut feed (G94, A stationary)', () => {
    expect(xSteps.length).toBe(5 * 21);
    for (const s of xSteps) {
      expect(s.feed).toBe(600);
      expect(s.words.a).toBeUndefined();
      expect(s.words.z).toBeUndefined();
    }
    // no coordinated-A cutting moves outside the plunge-free ring pattern
    expect(res.moves.filter((m) => isSimultaneous(m) && !m.rapid)).toHaveLength(0);
  });

  it('reverses A for ccw rotation', () => {
    const ccw = faceCylinder({ ...op, pattern: 'vertical', rotation: 'ccw' }, stock, tool);
    const ccwRings = ccw.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined,
    );
    expect(ccwRings[0].words.a).toBeCloseTo(-360, 6);
  });

  it('estimates time as plunges + revolutions + X steps', () => {
    expect(res.estimatedMinutes).toBeCloseTo(
      5 / 300 + (5 * 22) / MAX_ROTARY_RPM + (5 * 100) / 600,
      3,
    );
  });
});

describe('faceCylinder: horizontal (indexed passes)', () => {
  const res = faceCylinder({ ...op, pattern: 'horizontal' }, stock, tool);
  const sweeps = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
  const plunges = res.moves.filter((m) => !m.rapid && m.words.z !== undefined);
  const indexRapids = res.moves.filter((m) => m.rapid && m.words.a !== undefined);
  const retracts = res.moves.filter((m) => m.rapid && m.words.a === undefined);

  it('indexes the full 360° per level at a step-over arc on the cut radius', () => {
    // level arcs at r = 24,23,22,21,20 => 32+31+29+28+27 = 147 passes
    expect(sweeps.length).toBe(147);
    const stepDeg = (4.8 / 24) * (180 / Math.PI); // level 0 cuts at r=24
    const a0 = indexRapids[0]?.words.a ?? 0;
    const a1 = indexRapids[1]?.words.a ?? 0;
    expect(a1 - a0).toBeCloseTo(stepDeg, 3);
  });

  it('zigzags X so A only ever advances one way', () => {
    expect(sweeps.map((s) => s.words.x)).toEqual(
      Array.from({ length: 147 }, (_, i) => (i % 2 === 0 ? 100 : 0)),
    );
    const aVals = indexRapids.map((m) => m.words.a ?? 0);
    for (let i = 1; i < aVals.length; i++) expect(aVals[i]).toBeGreaterThan(aVals[i - 1]);
  });

  it('plunges straight (G94 plungeFeed, A stationary) then sweeps at the cut feed', () => {
    expect(plunges.length).toBe(147);
    for (const p of plunges) {
      expect(p.feed).toBe(300);
      expect(p.words.a).toBeUndefined();
    }
    expect(sweeps.every((s) => s.feed === 600 && s.words.a === undefined)).toBe(true);
    // no coordinated A cutting moves — the whole pattern runs in G94
    // (the approach rapids do carry X+Z+A, but rapids ignore feed modes)
    expect(res.moves.filter((m) => isSimultaneous(m) && !m.rapid)).toHaveLength(0);
    // depth per level: 32×z24, 31×z23, 29×z22, 28×z21, 27×z20
    const zs = plunges.map((p) => p.words.z);
    expect(zs[0]).toBe(24);
    expect(zs[31]).toBe(24);
    expect(zs[32]).toBe(23);
    expect(zs[146]).toBe(20);
  });

  it('retracts between passes', () => {
    expect(retracts.length).toBe(147);
    expect(retracts.every((m) => m.words.z === 25 + SAFE_CLEARANCE)).toBe(true);
  });

  it('estimates time from plunge + sweep feeds', () => {
    expect(res.estimatedMinutes).toBeCloseTo(147 * (1 / 300 + 100 / 600), 3);
  });
});

describe('faceCylinder: validation', () => {
  it('rejects a target above stock diameter', () => {
    expect(() =>
      faceCylinder({ ...op, targetDiameter: 60 }, stock, tool),
    ).toThrowError(/not below stock radius/);
  });

  it('rejects a zero-length axial range', () => {
    expect(() => faceCylinder({ ...op, xEnd: 0 }, stock, tool)).toThrowError(/must differ/);
  });

  it('rejects a non-positive cut feed', () => {
    expect(() => faceCylinder({ ...op, feed: 0 }, stock, tool)).toThrowError(/feed must be positive/);
  });

  it('rejects a non-positive step-over', () => {
    expect(() => faceCylinder({ ...op, stepOver: 0 }, stock, tool)).toThrowError(/stepOver must be positive/);
  });

  it('rejects a zero-diameter tool', () => {
    expect(() => faceCylinder(op, stock, { ...tool, diameter: 0 })).toThrowError(/tool diameter/);
  });
});