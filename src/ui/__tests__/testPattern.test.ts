/**
 * The calibration coupon end to end: plan (pinned to the v5 coupon's
 * geometry) → materialize into ORDINARY OPS → every op generates through
 * the real pipeline. This is the user's "refer back" guarantee: the ops
 * list IS the record — per-cell rates, tails, and pass depths all
 * verifiable from the materialized ops alone.
 */

import { describe, expect, it } from 'vitest';
import { identityTransform } from '../../core/types';
import type { Primitive, Stock, Tool } from '../../core/types';
import { sourcesFor } from '../featureSources';
import {
  generateJobOp,
  materializeTestPattern,
  testPatternDefaults,
  type GenContext,
} from '../jobGeneration';
import {
  planTestPattern,
  type TestPatternFields,
} from '../../cam/testPattern';
import { MAX_ROTARY_RPM } from '../../cam/faceCylinder';

/** the v5 coupon bar: raw Ø16.35 (probe radius 8.175), 50mm, delrin */
const ROD: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 50,
  xOrigin: 'mid',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 },
  axisMode: '4-axis',
  materialId: 'delrin',
};

const BOX: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 100,
  sizeY: 60,
  sizeZ: 20,
  origin: { x: 'mid', y: 'mid', z: 'min' },
  axisMode: '3-axis',
  materialId: 'delrin',
};

/** Makera's 3.175 spiral-O flat with its Plastic-row preset (delrin) */
const BIT: Tool = {
  id: 'bit',
  name: 'Spiral O flat',
  type: 'flat',
  diameter: 3.175,
  spindleRpm: 18000,
  presets: [
    { material: 'Plastic', spindleRpm: 12000, feed: 1000, plungeFeed: 300, stepDown: 1, rampFeed: 333 },
  ],
};

/** Alice's v5 axes: feed by strand, RPM by X grouping */
const V5: TestPatternFields = {
  rowParam: 'feed',
  colParam: 'spindleRpm',
  rowMin: 450,
  rowMax: 650,
  colMin: 7000,
  colMax: 10000,
  faceFirst: true,
};

function ctx(stock: Stock, primitives: Primitive[] = []): GenContext {
  return {
    stock,
    geometry: null,
    features: null,
    transform: identityTransform(),
    tools: [BIT],
    primitives,
    sources: sourcesFor(null, null, identityTransform(), primitives),
    datumAngle: 0,
    startA: 0,
  };
}

describe('materializeTestPattern — rotary (the v5 coupon, as ops)', () => {
  const plan = planTestPattern(V5, ROD, BIT, testPatternDefaults(BIT, 'delrin'));

  it('makes a face op + one spiral carve op per cell, grouping-outer', () => {
    const { ops, primitives } = materializeTestPattern(plan, BIT, 'delrin');
    expect(primitives).toEqual([]);
    expect(ops).toHaveLength(1 + 25);
    expect(ops[0].kind).toBe('faceCylinder');
    const cells = ops.slice(1);
    cells.forEach((op) => expect(op.kind).toBe('spiralCarve'));
    if (ops[0].kind !== 'faceCylinder') return;
    // the whole-bar face at the v4 skin cut, preset rates
    expect(ops[0].targetDiameter).toBe(15.75);
    expect(ops[0].xStart).toBe(-25);
    expect(ops[0].xEnd).toBe(25);
    expect(ops[0].rates?.spindleRpm).toBe(12000);
    // grouping 1, strands 1..5: feed ladders up, RPM constant
    const c0 = cells[0];
    if (c0.kind !== 'spiralCarve') throw new Error('expected a spiral carve op');
    expect(c0.rates?.feed).toBe(450);
    expect(cells[4].kind === 'spiralCarve' && cells[4].rates?.feed).toBe(650);
    expect(c0.rates?.spindleRpm).toBe(7000);
    expect(cells[5].kind === 'spiralCarve' && cells[5].rates?.spindleRpm).toBe(7750);
    // single full-depth pass at tool width (the v4 verdict)
    expect(c0.depth).toBe(1);
    expect(c0.stepDown).toBe(1);
    expect(c0.width).toBe(3.175);
    // strand phases: 0, 72, 144… around the cylinder
    expect(cells.map((o) => (o.kind === 'spiralCarve' ? o.spin : -1)).slice(0, 5)).toEqual([
      0, 72, 144, 216, 288,
    ]);
    // the RANKED +X tails: strand 1 longest, shortening strand by strand —
    // every groove self-identifies (0.5mm steps: spans 7 → 5)
    expect(
      cells.slice(0, 5).map((o) => (o.kind === 'spiralCarve' ? o.xEnd - o.xStart : 0)),
    ).toEqual([7, 6.5, 6, 5.5, 5]);
    // the shortest tail is strand N's — every grouping repeats the ranking
    expect(
      cells.slice(20, 25).map((o) => (o.kind === 'spiralCarve' ? o.xEnd - o.xStart : 0)),
    ).toEqual([7, 6.5, 6, 5.5, 5]);
  });

  it('generates every op cleanly, chained like the machine runs them', () => {
    const { ops } = materializeTestPattern(plan, BIT, 'delrin');
    const c = ctx(ROD);
    let a = 0;
    let minutes = 0;
    for (const op of ops) {
      const res = generateJobOp(op, { ...c, startA: a });
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      a = res.finalA;
      minutes += res.minutes;
    }
    // the face pass dominates (~7.6 min at the rotary ceiling — ONE level:
    // Alice's ladder rule kills the old duplicate rough+finish at the same
    // depth when totalDepth lands exactly on a step-down); the 25 single
    // spiral passes add a few more
    expect(minutes).toBeGreaterThan(10);
    // DATUM DISCIPLINE: no Index op in the plan, so the final datum is the
    // INITIAL datum (0) — every rotary op borrowed and handed it back.
    // (The pile lives inside each op's moves — the axis did plenty of
    // cutting, verified by the minutes above.)
    expect(a).toBeCloseTo(0, 6);
  });

  it('carries per-cell S lines and honors the rotary feed clamp', () => {
    const { ops } = materializeTestPattern(plan, BIT, 'delrin');
    const c = ctx(ROD);
    // grouping 1's first cell stamps its own RPM, not the face's
    const g1s1 = generateJobOp(ops[1], c);
    expect(g1s1.moves[0].spindleRpm).toBe(7000);
    // grouping 5, strand 5 — feed 650: clamped at the ceiling (~632), the
    // G93 F word is the clamp rate, not 650's own
    const g5s5 = generateJobOp(ops[25], { ...c, startA: 1000 });
    const r = 15.75 / 2;
    const advance = (5 / (2 * Math.PI * r * Math.tan((60 * Math.PI) / 180))) * 360;
    const ceilingF = 1 / (advance / 360 / MAX_ROTARY_RPM);
    const sweep = g5s5.moves.find(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x === 13.5 + 5,
    );
    expect(sweep).toBeDefined();
    expect(Math.abs((sweep?.feed ?? 0) - ceilingF)).toBeLessThan(1e-6);
    expect(g5s5.moves[0].spindleRpm).toBe(10000);
  });

  it('returns nothing for an impossible plan', () => {
    const bad = planTestPattern(V5, { ...ROD, axisMode: '3-axis' }, BIT, testPatternDefaults(BIT, 'delrin'));
    expect(materializeTestPattern(bad, BIT, 'delrin')).toEqual({ ops: [], primitives: [] });
  });
});

describe('materializeTestPattern — flat (the pocket grid, as ops)', () => {
  const fields: TestPatternFields = {
    rowParam: 'spindleRpm',
    rowMin: 9000,
    rowMax: 15000,
    colParam: 'stepDown',
    colMin: 0.35,
    colMax: 1,
    faceFirst: false,
  };
  const plan = planTestPattern(fields, BOX, BIT, testPatternDefaults(BIT, 'delrin'));

  it('makes one outline plate + one pocket op per cell, row-outer', () => {
    const { ops, primitives } = materializeTestPattern(plan, BIT, 'delrin');
    expect(ops).toHaveLength(28); // 4 rows × 7 cols
    expect(primitives).toHaveLength(28);
    // every op is a pocket selecting its own plate's top face
    ops.forEach((op, i) => {
      expect(op.kind).toBe('pocket');
      expect(op.featureIds).toHaveLength(1);
      const prim = primitives[i] as Extract<Primitive, { kind: 'box' }>;
      expect(op.featureIds[0].startsWith(`p:${prim.id}:`)).toBe(true);
      if (op.kind !== 'pocket') return;
      // row-outer: the first 7 ops are row 1 (rpm 9000)
      expect(op.rates?.spindleRpm).toBe(i < 7 ? 9000 : i < 14 ? 11000 : i < 21 ? 13000 : 15000);
      expect(op.endDepth).toBe(1); // every pocket cuts the same total depth
    });
    // the pass-depth ladder down column 1 → 7 (0.05-rounded linspaced)
    expect(
      ops.slice(0, 7).map((op) => (op.kind === 'pocket' ? op.stepDown : 0)),
    ).toEqual([0.35, 0.45, 0.55, 0.7, 0.8, 0.9, 1]);
    // cell 1/1 is the TOP-LEFT cell: bigger plate, extended left and up
    // into the perimeter; rows number top to bottom
    const f = plan.flat;
    if (!f) throw new Error('expected a flat plan');
    const p0 = primitives[0] as Extract<Primitive, { kind: 'box' }>;
    const p1 = primitives[1] as Extract<Primitive, { kind: 'box' }>;
    const p7 = primitives[7] as Extract<Primitive, { kind: 'box' }>;
    expect(p0.size.x).toBeCloseTo(f.cellW + f.originGrowth, 5);
    expect(p0.size.y).toBeCloseTo(f.cellH + f.originGrowth, 5);
    const topRowLowY = f.y0 + (4 - 1) * (f.cellH + f.spacing); // rows = 4
    expect(p0.transform.position.x).toBeCloseTo(f.x0 - f.originGrowth + (f.cellW + f.originGrowth) / 2, 5);
    expect(p0.transform.position.y).toBeCloseTo(topRowLowY + (f.cellH + f.originGrowth) / 2, 5);
    // ALIGNMENT: the origin cell's inner edges sit flush with the grid —
    // its bottom edge is the top row's bottom edge, its right edge the
    // column's left edge (it only bulges into the perimeter)
    expect(p0.transform.position.y - (f.cellH + f.originGrowth) / 2).toBeCloseTo(topRowLowY, 5);
    expect(p0.transform.position.x + (f.cellW + f.originGrowth) / 2).toBeCloseTo(f.x0 + f.cellW, 5);
    // row 1's other cells share the top row, un-grown
    expect(p1.size.x).toBeCloseTo(f.cellW, 5);
    expect(p1.transform.position.x).toBeCloseTo(f.x0 + (f.cellW + f.spacing) + f.cellW / 2, 5);
    expect(p1.transform.position.y).toBeCloseTo(topRowLowY + f.cellH / 2, 5);
    // row 2 (the 8th op, r1c0) sits one row DOWN
    expect(p7.transform.position.y).toBeCloseTo(f.y0 + 2 * (f.cellH + f.spacing) + f.cellH / 2, 5);
  });

  it('generates every cell pocket cleanly with varying pass depths', () => {
    const { ops, primitives } = materializeTestPattern(plan, BIT, 'delrin');
    const c = ctx(BOX, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
    }
    // the step-down ladder shows in the level comments: column 1 steps
    // 0.35 (three levels), column 7 cuts single-level at the floor
    const c1 = generateJobOp(ops[0], c);
    const c7 = generateJobOp(ops[6], c);
    expect(c1.moves.some((m) => m.comment?.includes('level z19.65'))).toBe(true);
    expect(c7.moves.some((m) => m.comment?.includes('level z19.00'))).toBe(true);
    expect(c7.moves.some((m) => m.comment?.includes('level z19.65'))).toBe(false);
    // the per-op S lines: row 1 runs 9000, row 4 runs 15000
    expect(c1.moves[0].spindleRpm).toBe(9000);
    const r4 = generateJobOp(ops[21], c);
    expect(r4.moves[0].spindleRpm).toBe(15000);
  });
});