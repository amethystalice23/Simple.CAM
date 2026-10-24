/**
 * Test-pattern planner tests. The rotary expectations are pinned to the
 * SHIPPED v5 Delrin coupon (jobs/coupon-delrin-feed-matrix.cam.json and
 * couponFeedMatrix.test.ts): the same stock (Ø16.35 extruded bar, 50mm),
 * the same 3.175mm flat bit, Alice's own feed/RPM ladders — the planner
 * must reproduce that validated geometry from the fields alone. The flat
 * side pins the pocket-grid math on a box. The plan's materialization
 * into ops is tested at the UI level (src/ui/__tests__/testPattern.test.ts).
 */

import { describe, expect, it } from 'vitest';
import type { Stock, Tool } from '../../core/types';
import {
  axisSpread,
  planCell,
  planTestPattern,
  type MatrixDefaults,
  type TestPatternFields,
} from '../testPattern';

/** the v5 coupon bar: raw Ø16.35 (probe radius 8.175), 50mm, X centered */
const ROD: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 50,
  xOrigin: 'mid',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 },
  axisMode: '4-axis',
  materialId: 'delrin',
};

/** the coupon cutter: Makera's 3.175mm spiral-O flat */
const BIT: Tool = {
  id: 'bit',
  name: 'Spiral O flat',
  type: 'flat',
  diameter: 3.175,
  spindleRpm: 18000,
};

/** the Plastic-row preset values for that bit (delrin → Plastic) */
const DELRIN: MatrixDefaults = { feed: 1000, spindleRpm: 12000, stepDown: 1, stepOver: 1.6 };

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


describe('planTestPattern — rotary (pinned to the shipped v5 coupon)', () => {
  it('reproduces the coupon geometry: 5 strands × 5 groupings on the faced Ø15.75', () => {
    const plan = planTestPattern(V5, ROD, BIT, DELRIN);
    expect(plan.error).toBeNull();
    expect(plan.mode).toBe('rotary');
    // the face pass skins 0.3mm radial off the raw bar, whole length,
    // 1mm ring spacing (endmills are not perfectly flat at the end)
    expect(plan.rotary?.face).toEqual({
      targetDiameter: 15.75,
      xStart: -25,
      xEnd: 25,
      feed: 1000,
      rpm: 12000,
      stepDown: 0.3,
      stepOver: 1,
    });
    expect(plan.rotary?.surfaceDiameter).toBe(15.75);
    expect(plan.rotary?.angle).toBe(60);
    expect(plan.rotary?.span).toBe(5);
    expect(plan.rotary?.tailStep).toBe(0.5); // ranked tails: 0.5mm steps, longest 2mm
    // 5 groupings at 8mm pitch, centered: 37mm block on the 50mm bar
    expect(plan.cols).toBe(5);
    expect(plan.rotary?.groupXs).toEqual([-18.5, -10.5, -2.5, 5.5, 13.5]);
    // the arc math fits exactly 5 strands — the coupon's count
    expect(plan.rows).toBe(5);
    expect(plan.rotary?.spinStep).toBe(72);
    // the ladders are Alice's own: feeds by strand, RPMs by grouping
    expect(plan.rowValues).toEqual([450, 500, 550, 600, 650]);
    expect(plan.colValues).toEqual([7000, 7750, 8500, 9250, 10000]);
    // the controls: single full-depth pass (step-down = the tested DOC),
    // tool-width groove
    expect(plan.fixed.stepDown).toBe(1);
    expect(plan.fixed.stepOver).toBe(3.175);
  });

  it('warns that feeds past ~632 mm/min clamp at the rotary ceiling (the 650 edge probe)', () => {
    const plan = planTestPattern(V5, ROD, BIT, DELRIN);
    const ceiling = plan.warnings.find((w) => w.includes('rotary ceiling'));
    expect(ceiling).toBeDefined();
    expect(ceiling).toMatch(/~63\d mm\/min/);
    // the recommended arrangement (RPM by grouping) stays quiet
    expect(plan.warnings.some((w) => w.includes('strand axis'))).toBe(false);
  });

  it('warns when RPM goes on the strand axis (the v5 spindle-settle lesson)', () => {
    const plan = planTestPattern(
      { ...V5, rowParam: 'spindleRpm', colParam: 'feed', rowMin: 7000, rowMax: 10000, colMin: 450, colMax: 650 },
      ROD,
      BIT,
      DELRIN,
    );
    expect(plan.warnings.some((w) => w.includes('strand axis'))).toBe(true);
    // ...and then the feed ceiling no longer matters (450–650 still clamps)
    expect(plan.warnings.some((w) => w.includes('rotary ceiling'))).toBe(true);
  });

  it('clamps a step-down axis below the axis and warns', () => {
    const hairline: Extract<Stock, { kind: 'cylinder' }> = {
      ...ROD,
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 2 }, // Ø4 rod
      length: 30,
    };
    const plan = planTestPattern(
      { ...V5, rowParam: 'stepDown', rowMin: 0.5, rowMax: 3 },
      hairline,
      BIT,
      DELRIN,
    );
    // depth limit r − 0.1 = 1.9
    expect(Math.max(...plan.rowValues)).toBeLessThanOrEqual(1.9);
    expect(plan.warnings.some((w) => w.includes('past the axis'))).toBe(true);
  });

  it('caps strands at 6 on a large bar and spreads the width ladder across the room', () => {
    const bigRod: Extract<Stock, { kind: 'cylinder' }> = {
      ...ROD,
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 20 }, // Ø40
      length: 60,
    };
    const plan = planTestPattern(
      { ...V5, rowParam: 'stepOver', rowMin: 3.2, rowMax: 9.4, colParam: 'feed', colMin: 500, colMax: 900, faceFirst: false },
      bigRod,
      BIT,
      DELRIN,
    );
    expect(plan.error).toBeNull();
    expect(plan.rows).toBe(6); // capped — 15 would fit geometrically
    // the widest groove keeps 2mm walls at 6 strands
    expect(Math.max(...plan.rowValues)).toBeCloseTo(9.4, 1);
    expect(plan.rowValues[0]).toBe(3.2); // tool width at the low end
    // the grouping pitch carries the width fan: fewer, wider-spaced cells
    expect(plan.cols).toBe(3);
  });

  it('caps groupings at 10 on a long bar — the grooves GROW to fill it', () => {
    const longBar: Extract<Stock, { kind: 'cylinder' }> = { ...ROD, length: 200 };
    const plan = planTestPattern(V5, longBar, BIT, DELRIN);
    expect(plan.error).toBeNull();
    // 24 groupings would fit at the minimum pitch; the cap leaves 10,
    // and the span stretches from 5mm to fill the bar
    expect(plan.cols).toBe(10);
    expect(plan.rotary?.span).toBe(16.4);
    expect(plan.rotary?.groupXs[0]).toBe(-95.5); // block centered on the bar
    expect(plan.rotary?.groupXs[9]).toBeCloseTo(-95.5 + 9 * 19.4, 6);
    // the ladder endpoints still land on the user's min/max
    expect(plan.colValues[0]).toBe(7000);
    expect(plan.colValues[9]).toBe(10000);
    // the feed ceiling shifts with the longer grooves (~634) — the 650
    // edge probe still warns
    expect(plan.warnings.some((w) => w.includes('rotary ceiling'))).toBe(true);
  });

  it('fails a cylinder in 3-axis mode, and a tool that fits no cell', () => {
    const flatMode = planTestPattern(V5, { ...ROD, axisMode: '3-axis' }, BIT, DELRIN);
    expect(flatMode.error).toMatch(/4-axis/);

    const huge: Tool = { ...BIT, diameter: 30 };
    const tiny = planTestPattern(V5, { ...ROD, length: 12 }, huge, DELRIN);
    // a Ø30 tool at 60° spans 60mm of arc — no strand fits, or no group
    expect(tiny.error !== null || tiny.rows < 1 || tiny.cols < 1).toBe(true);
  });
});

describe('planTestPattern — flat (pocket grid)', () => {
  const BOX: Extract<Stock, { kind: 'box' }> = {
    kind: 'box',
    sizeX: 100,
    sizeY: 60,
    sizeZ: 20,
    origin: { x: 'mid', y: 'mid', z: 'min' },
    axisMode: '3-axis',
    materialId: 'delrin',
  };
  const op: TestPatternFields = {
    rowParam: 'spindleRpm',
    rowMin: 9000,
    rowMax: 15000,
    colParam: 'stepDown',
    colMin: 0.35,
    colMax: 1,
    faceFirst: false,
  };

  it('lays out rows × columns of ≥3-tool-Ø pockets that grow to fill the stock', () => {
    const plan = planTestPattern(op, BOX, BIT, DELRIN);
    expect(plan.error).toBeNull();
    expect(plan.mode).toBe('flat');
    expect(plan.rows).toBe(4);
    expect(plan.cols).toBe(7);
    // the perimeter is wider than the inter-cell gap (spacing + 2)…
    expect(plan.flat?.cellW).toBeCloseTo(70.6 / 7, 6);
    expect(plan.flat?.cellH).toBeCloseTo(40.125 / 4, 6);
    // …and cell 1/1 grows into it — the origin marker
    expect(plan.flat?.originGrowth).toBe(2);
    expect(plan.flat?.crownZ).toBe(20);
    expect(plan.flat?.totalDepth).toBe(1);
    // rpm ladder over 4 rows, pass-depth ladder over 7 columns
    expect(plan.rowValues).toEqual([9000, 11000, 13000, 15000]);
    expect(plan.colValues[0]).toBe(0.35);
    expect(plan.colValues[6]).toBe(1);
    // the recommended arrangement (RPM on rows) stays quiet
    expect(plan.warnings).toEqual([]);
  });

  it('caps the grid at 10 × 10 on big stock — the pockets GROW instead', () => {
    const plate: Extract<Stock, { kind: 'box' }> = { ...BOX, sizeX: 300, sizeY: 200 };
    const plan = planTestPattern(
      {
        rowParam: 'spindleRpm',
        rowMin: 9000,
        rowMax: 15000,
        colParam: 'stepDown',
        colMin: 0.35,
        colMax: 1,
        faceFirst: false,
      },
      plate,
      BIT,
      DELRIN,
    );
    expect(plan.error).toBeNull();
    expect(plan.rows).toBe(10); // 15 would fit on Y
    expect(plan.cols).toBe(10); // 23 would fit on X
    // the cells grow to fill: ~26.1 × 16.1mm each
    expect(plan.flat?.cellW).toBeCloseTo(261.075 / 10, 5);
    expect(plan.flat?.cellH).toBeCloseTo(161.075 / 10, 5);
  });

  it('fails cleanly when the tool leaves no room for a cell', () => {
    const huge: Tool = { ...BIT, diameter: 25 };
    const plan = planTestPattern(op, BOX, huge, DELRIN);
    expect(plan.error).toMatch(/fits none/);
  });
});

describe('axisSpread — the min/max prefills', () => {
  it('spreads around the preset: feed ±30%, RPM ±25%, depths per mode', () => {
    expect(axisSpread('feed', { mode: 'rotary', tool: BIT, defaults: DELRIN, surfaceDiameter: 15.75 })).toEqual([700, 1300]);
    expect(axisSpread('spindleRpm', { mode: 'flat', tool: BIT, defaults: DELRIN, surfaceDiameter: 0 })).toEqual([9000, 15000]);
    expect(axisSpread('stepDown', { mode: 'rotary', tool: BIT, defaults: DELRIN, surfaceDiameter: 15.75 })).toEqual([0.5, 1.5]);
    // flat: a third of the pocket depth up to single-pass
    expect(axisSpread('stepDown', { mode: 'flat', tool: BIT, defaults: DELRIN, surfaceDiameter: 0 })).toEqual([0.35, 1]);
    // flat step-over: ¼–¾ of the tool Ø
    expect(axisSpread('stepOver', { mode: 'flat', tool: BIT, defaults: DELRIN, surfaceDiameter: 0 })).toEqual([0.8, 2.4]);
  });

  it('prefills the rotary step-over axis from tool width to the strand budget', () => {
    // the coupon bar: 5 strands, so the budget is (49.48/5 − 2)·cos60 ≈ 3.9
    const [lo, hi] = axisSpread('stepOver', {
      mode: 'rotary',
      tool: BIT,
      defaults: DELRIN,
      surfaceDiameter: 15.75,
    });
    expect(lo).toBe(3.2);
    expect(hi).toBe(3.9);
  });
});

describe('planCell — the constant controls', () => {
  it('holds every parameter not on an axis at the preset default', () => {
    const plan = planTestPattern(V5, ROD, BIT, DELRIN);
    const c = planCell(plan, 2, 3);
    expect(c.feed).toBe(550); // row axis
    expect(c.spindleRpm).toBe(9250); // col axis (grouping 4 of 5)
    expect(c.stepDown).toBe(1); // constant — never a confound
    expect(c.stepOver).toBe(3.175);
  });

  it('warns when both axes name the same parameter', () => {
    const plan = planTestPattern({ ...V5, colParam: 'feed', colMin: 400, colMax: 700 }, ROD, BIT, DELRIN);
    expect(plan.warnings.some((w) => w.includes('same parameter'))).toBe(true);
    // the row ladder wins
    expect(planCell(plan, 0, 2).feed).toBe(450);
  });
});