import { describe, expect, it } from 'vitest';
import { cylChamfer } from '../cylChamfer';
import { ROTARY_FEED_DEG_MIN } from '../faceCylinder';
import type { CylChamferOp, RotaryCalibration, Tool } from '../../core/types';

const cal: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 };
const vbit: Tool = {
  id: 'v1',
  name: '60° engraving bit',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 60,
  tipDiameter: 0.2,
  spindleRpm: 12000,
};

/** Ø15 anchor inside a Ø16.35 stock, 0.5mm below the rim — the classic
 * depth>0 "down from the circle" case. */
const rimOp: CylChamferOp = {
  kind: 'cylChamfer',
  id: 'c1',
  toolId: 'v1',
  edges: [{ x: 40, diameter: 15 }],
  depth: 0.5,
  stepDown: 0.3,
  rotation: 'cw',
  plungeFeed: 100,
};

/** Ø15 step edge inside the same stock, anchored on the circle — the
 * depth-0 "cut up-and-out" case. */
const stepOp: CylChamferOp = { ...rimOp, edges: [{ x: 20, diameter: 15 }], depth: 0 };

/** Ø1 ball end mill — Alice's U-channel ask (2026-11-05). */
const ball: Tool = {
  id: 'b1',
  name: 'Ø1 ball end mill',
  type: 'ball',
  diameter: 1,
  spindleRpm: 12000,
};
const ballOp: CylChamferOp = { ...rimOp, edges: [{ x: 40, diameter: 15 }], depth: 0.5 };

describe('cylChamfer', () => {
  it('depth > 0: plunges below the circle, sweeps exactly 360° per level (G94 A-only)', () => {
    const res = cylChamfer(rimOp, cal, vbit, 90);
    // 0.5mm of tip travel in 0.3 steps → two levels: 7.25, 7.0
    expect(res.passes).toBe(2);
    const sweeps = res.moves.filter((m) => m.words.a !== undefined && !m.rapid);
    expect(sweeps).toHaveLength(2);
    // first sweep continues from startA, each advances exactly one turn
    expect(sweeps[0].words.a).toBeCloseTo(450, 6);
    expect(sweeps[1].words.a).toBeCloseTo(810, 6);
    // A-only cuts run G94 at the rotary deg/min rate
    for (const s of sweeps) expect(s.feed).toBe(ROTARY_FEED_DEG_MIN);
    // the Z ladder tops out AT the circle (r = 7.5), not the stock surface
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges.map((p) => p.words.z).length).toBe(2);
    expect(plunges[0].words.z!).toBeCloseTo(7.25, 9); // even rung: 0.5mm span in n=2 → 0.25
    expect(plunges[1].words.z!).toBeCloseTo(7.0, 9); // exactly the tip depth
    expect(res.moves[0].rapid).toBe(true);
    expect(res.moves[0].words.z).toBeUndefined(); // travel first, at the existing height
    expect(res.moves[1].words.z).toBeCloseTo(8.175 + 5, 6); // then descend to safeZ
    // the X stays parked on the edge through the whole cut
    for (const m of res.moves) if (m.words.x !== undefined) expect(m.words.x).toBe(40);
  });

  it('depth 0: ladder descends from the STOCK surface to the anchor, finishing exactly on it', () => {
    // 8.175 → 7.5 is 0.675mm: at a 0.3 rung → n=3 even 0.225 steps:
    // 7.95, 7.725, then 7.5 exactly
    const res = cylChamfer(stepOp, cal, vbit, 0);
    expect(res.passes).toBe(3);
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges.length).toBe(3);
    expect(plunges[0].words.z!).toBeCloseTo(7.95, 9);
    expect(plunges[1].words.z!).toBeCloseTo(7.725, 9);
    expect(plunges[2].words.z!).toBeCloseTo(7.5, 9); // finished flank exactly on the anchor
    // A accumulates monotonically (no unwind between levels)
    const aWords = res.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);
    expect(aWords).toEqual([360, 720, 1080]);
    // estimated minutes: plunge increments + one ceiling-rev per sweep
    const plungeMin = 0.675 / 100; // three even 0.225 rungs telescope to the span
    expect(res.estimatedMinutes).toBeCloseTo(plungeMin + 3 / 6.6, 6);
  });

  it('a shallow depth is a single straight-in pass ("already the highest point")', () => {
    const res = cylChamfer({ ...rimOp, depth: 0.25 }, cal, vbit, 0);
    expect(res.passes).toBe(1);
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges.length).toBe(1);
    expect(plunges[0].words.z!).toBeCloseTo(7.25, 9);
  });

  it('multiple edges thread A continuity and retract between edges', () => {
    const res = cylChamfer(
      { ...rimOp, edges: [{ x: 10, diameter: 15 }, { x: 40, diameter: 14 }], depth: 0.4 },
      cal,
      vbit,
      0,
    );
    expect(res.passes).toBe(4); // 2 levels each
    // retraction above the stock surface between edges
    const rapids = res.moves.filter((m) => m.rapid && m.words.z !== undefined);
    expect(rapids.length).toBe(3); // initial lift + retract per edge
    // A never winds back: 4 sweeps, +360 each
    const aWords = res.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);
    expect(aWords).toEqual([360, 720, 1080, 1440]);
  });

  it('reports the chamfer angle from the tool and the width from the depth', () => {
    expect(cylChamfer(rimOp, cal, vbit, 0).chamferAngleDeg).toBe(60); // 90 − 30
    expect(cylChamfer(rimOp, cal, vbit, 0).width).toBeCloseTo(0.5 * Math.tan(Math.PI / 6), 6);
  });

  it('refuses impossible geometry with a message that explains itself', () => {
    // non-V-bit, non-ball (the flat refusal lives in its own ball-era test below)
    // anchor above the stock surface
    expect(() =>
      cylChamfer({ ...rimOp, edges: [{ x: 10, diameter: 17 }] }, cal, vbit, 0),
    ).toThrow(/above the stock surface/);
    // depth 0 on a circle at the stock Ø — nothing rises above the anchor
    expect(() =>
      cylChamfer({ ...rimOp, edges: [{ x: 10, diameter: 16.35 }], depth: 0 }, cal, vbit, 0),
    ).toThrow(/nothing rises above it/);
    // depth reaching past the axis
    expect(() =>
      cylChamfer({ ...rimOp, edges: [{ x: 10, diameter: 2 }], depth: 1.5 }, cal, vbit, 0),
    ).toThrow(/past the axis/);
    // flank too short for the depth
    expect(() =>
      cylChamfer({ ...rimOp, depth: 3 }, cal, vbit, 0),
    ).toThrow(/cone is too short/);
    expect(() => cylChamfer({ ...rimOp, edges: [] }, cal, vbit, 0)).toThrow(/at least one edge/);
  });

  it('ccw rotation sweeps negative', () => {
    const res = cylChamfer({ ...rimOp, rotation: 'ccw' }, cal, vbit, 0);
    const aWords = res.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);
    expect(aWords).toEqual([-360, -720]);
  });

  it('ball-nose: depth = radius cuts the full semicircle U (width = tool Ø, center on the surface)', () => {
    // Ø15 anchor, 0.5mm deep with a Ø1 ball → the classic 1mm U channel
    const res = cylChamfer(ballOp, cal, ball, 0);
    expect(res.width).toBeCloseTo(1, 9); // 2·√(0.5² − 0²) = the full Ø
    expect(res.chamferAngleDeg).toBeNaN(); // an arc, not a flank
    expect(res.warnings).toBeUndefined();
    // motion identical to the V-bit case: 0.5 span at 0.3 step → 2 levels,
    // tip Z ladder 7.25 → 7.0 (the ball's center lands on the surface at 7.5)
    expect(res.passes).toBe(2);
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges[0].words.z!).toBeCloseTo(7.25, 9);
    expect(plunges[1].words.z!).toBeCloseTo(7.0, 9);
  });

  it('ball-nose: shallow depth is a circular-bottom groove narrower than the tool', () => {
    // 0.3mm deep with the Ø1 ball: half-width = √(0.5² − 0.2²) = √0.21
    const res = cylChamfer({ ...ballOp, depth: 0.3 }, cal, ball, 0);
    expect(res.width).toBeCloseTo(2 * Math.sqrt(0.21), 9);
    expect(res.warnings).toBeUndefined();
  });

  it('ball-nose: depth past the equator warns, width caps at the tool Ø', () => {
    const res = cylChamfer({ ...ballOp, depth: 0.7 }, cal, ball, 0);
    expect(res.width).toBeCloseTo(1, 9); // capped — the shank runs straight below
    expect(res.warnings).toBeDefined();
    expect(res.warnings!.join(' ')).toMatch(/equator/);
  });

  it('ball-nose cannot anchor on the circle (depth 0 is meaningless without a flank)', () => {
    expect(() => cylChamfer({ ...ballOp, depth: 0 }, cal, ball, 0)).toThrow(/cannot anchor/);
  });

  it('flat tools remain refused with an updated message', () => {
    expect(() =>
      cylChamfer(rimOp, cal, { ...vbit, type: 'flat' }, 0),
    ).toThrow(/needs a V-bit or a ball-nose/);
  });
});