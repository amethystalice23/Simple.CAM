/**
 * The laser calibration coupons end to end — the raster analogue of the
 * cutting coupon's test file: plan (rasterCoupons.ts) → materialize into
 * ORDINARY OPS + bitmap primitives → every op generates through the real
 * pipeline. Also the launcher registry's shape (id/label/ideogram/
 * component) and the laser-only gate the panels enforce.
 */

import { describe, expect, it } from 'vitest';
import { identityTransform } from '../../core/types';
import type { Primitive, Stock, Tool } from '../../core/types';
import { rotaryCalibrationOf } from '../../core/types';
import { bitmapKernelGray, sourcesFor } from '../featureSources';
import {
  generateJobOp,
  laserCouponLadder,
  materializeGreyscaleWedge,
  materializeInterlaceCoupon,
  type GenContext,
} from '../jobGeneration';
import {
  DEFAULT_COLUMN_SPACING_MM,
  DEFAULT_WEDGE_BAND_MM,
  gridToGray,
  planGreyscaleWedge,
  planInterlaceCoupon,
  WEDGE_GRAY_REFS,
} from '../../cam/rasterCoupons';
import { RASTER_PITCH_MM } from '../../cam/rasterEngrave';
import { CALIBRATION_GENERATORS, calibrationGenerator } from '../CalibrationLauncher';
import { lasersForCoupons } from '../LaserCouponPanels';

/** the coupon rod: Ø16.35 (effective radius 8.175), 50mm, delrin, 4-axis */
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

const LASER: Tool = {
  id: 'l1',
  name: 'laser module',
  type: 'laser',
  diameter: 0.1,
  spindleRpm: 80, // the spindleRpm slot is beam power % on a laser
};

function ctx(stock: Stock, primitives: Primitive[]): GenContext {
  return {
    stock,
    geometry: null,
    features: null,
    transform: identityTransform(),
    tools: [LASER],
    primitives,
    sources: sourcesFor(null, null, identityTransform(), primitives),
    datumAngle: 0,
    startA: 0,
  };
}

// ------------------------------------------------------------- the registry

describe('calibration launcher registry', () => {
  it('lists the three generators with ideograms and live components', () => {
    expect(CALIBRATION_GENERATORS.map((g) => g.id)).toEqual([
      'feeds-speeds',
      'laser-interlace',
      'greyscale-power',
    ]);
    for (const g of CALIBRATION_GENERATORS) {
      expect(g.ideogram.length).toBeGreaterThan(0);
      expect(g.label.length).toBeGreaterThan(0);
      expect(typeof g.component).toBe('function');
    }
    expect(calibrationGenerator('laser-interlace')?.label).toBe('Laser interlacing');
    expect(calibrationGenerator('nope')).toBeUndefined();
  });

  it('gates both laser panels on a laser tool existing', () => {
    const BIT: Tool = { id: 'b', name: 'flat', type: 'flat', diameter: 3.175, spindleRpm: 12000 };
    expect(lasersForCoupons([BIT])).toEqual([]);
    expect(lasersForCoupons([BIT, LASER])).toEqual([LASER]);
  });
});

// ------------------------------------------------------------------ ladder

describe('laserCouponLadder — the slot layout both panels and both materializers share', () => {
  it('flat: slots stack along Y above the crown, x spans the stock', () => {
    const ladder = laserCouponLadder(BOX, 2);
    expect(ladder.wrapped).toBe(false);
    expect(ladder.span.x).toBeCloseTo(100, 6);
    expect(ladder.span.y).toBeCloseTo((60 - 2) / 2, 6);
    const a = ladder.place(0);
    const b = ladder.place(1);
    expect(a.position.z).toBeCloseTo(20, 6); // the crown
    // slot 0 lowest, ascending, exactly one gap apart
    expect(a.position.y).toBeCloseTo(-30 + ladder.span.y / 2, 6);
    expect(b.position.y - a.position.y).toBeCloseTo(ladder.span.y + 2, 6);
    expect(b.position.y + ladder.span.y / 2).toBeCloseTo(30, 6); // fills to the top edge
  });

  it('wrapped: slots bend around the arc on the rotation axis, ascending in A', () => {
    const ladder = laserCouponLadder(ROD, 2);
    expect(ladder.wrapped).toBe(true);
    const circ = 2 * Math.PI * 8.175;
    expect(ladder.span.y).toBeCloseTo((circ - 2) / 2, 6);
    const a = ladder.place(0);
    const b = ladder.place(1);
    const degPerMm = 180 / (Math.PI * 8.175);
    // slot i's wrap window centers at arc height/2 + i·(height+gap); a +Rx
    // rotation reads as NEGATIVE arc (the ascending direction)
    expect(a.rotationDeg.x).toBeCloseTo(-((ladder.span.y / 2) * degPerMm), 6);
    expect(b.rotationDeg.x).toBeCloseTo(-((ladder.span.y * 1.5 + 2) * degPerMm), 6);
    // on the axis, like every wrapped bitmap (the generation check)
    expect(a.position.y).toBe(0);
    expect(a.position.z).toBeCloseTo(rotaryCalibrationOf(ROD).axisZ, 6);
  });
});

// --------------------------------------------------------------- interlace

describe('materializeInterlaceCoupon — the interlace coupon as ops', () => {
  const span = laserCouponLadder(ROD, 2).span;
  const plan = planInterlaceCoupon(span, { pitch: 0.1, columnSpacing: DEFAULT_COLUMN_SPACING_MM });

  it('makes two identical bitmaps + one raster op per sweep', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, ROD, LASER);
    expect(ops).toHaveLength(2);
    expect(primitives).toHaveLength(2);
    const [serp, oneWay] = primitives as Extract<Primitive, { kind: 'bitmap' }>[];
    // identical grids — the read is the SWEEP's shift, never the artwork's
    expect(oneWay.gray.data).toEqual(serp.gray.data);
    // the WRAPPED store is the inverse of bitmapKernelGray (the face-up
    // transpose): round-tripping the stored gray reproduces the kernel
    // grid, fired ONLY at the plan's columns, single pixels, full height
    const kernel = bitmapKernelGray(serp.gray);
    expect(kernel.width).toBe(plan.grid.width);
    expect(kernel.height).toBe(plan.grid.height);
    const fired = new Set<number>();
    kernel.data.forEach((v, i) => {
      if (v === 0) fired.add(i % kernel.width);
    });
    expect([...fired].sort((a, b) => a - b)).toEqual([...plan.columns].sort((a, b) => a - b));
    expect(kernel.data.filter((v) => v === 0)).toHaveLength(plan.columns.length * kernel.height);
    // each op burns its own bitmap at the plan's pitch, sweep the only difference
    ops.forEach((op, i) => {
      if (op.kind !== 'rasterEngrave') throw new Error('expected raster ops');
      expect(op.sweep).toBe(i === 0 ? 'serpentine' : 'one-way');
      expect(op.pitch).toBe(plan.pitch);
      expect(op.toolId).toBe(LASER.id);
      expect(op.featureIds).toEqual([`p:${primitives[i].id}:bitmap:0`]);
    });
    // no rate overrides — both sweeps fall back to the SAME tool feed/power
    ops.forEach((op) => expect(op.rates).toBeUndefined());
    // the wrapped bitmaps carry the drop convention: own Ø = the stock's
    expect(serp.presentation).toBe('wrapped');
    expect(serp.wrapDiameter).toBeCloseTo(16.35, 6);
    expect(serp.width).toBeCloseTo(plan.grid.width * 0.1, 6);
    expect(serp.height).toBeCloseTo(plan.grid.height * 0.1, 6);
  });

  it('flat stock: the two bitmaps sit on the crown, stacked along Y', () => {
    const flatPlan = planInterlaceCoupon(laserCouponLadder(BOX, 2).span, {});
    const { primitives } = materializeInterlaceCoupon(flatPlan, BOX, LASER);
    const [serp, oneWay] = primitives as Extract<Primitive, { kind: 'bitmap' }>[];
    expect(serp.presentation).toBeUndefined(); // flat like an imported bitmap
    expect(serp.transform.position.z).toBeCloseTo(20, 6);
    expect(oneWay.transform.position.y - serp.transform.position.y).toBeCloseTo(flatPlan.grid.height * 0.1 + 2, 6);
  });

  it('generates every op cleanly through the real pipeline (wrapped 4-axis)', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, ROD, LASER);
    const c = ctx(ROD, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      // no cut move carries both x and a (G93 never appears in a raster)
      for (const m of res.moves) {
        if (m.rapid) continue;
        expect(m.words.x === undefined || m.words.a === undefined).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------- the wedge

describe('materializeGreyscaleWedge — the step-wedge coupon as ops', () => {
  // the strip the panel derives: 10 ladder slots share the rod's arc
  const spanY = laserCouponLadder(ROD, 11).span.y * 10;
  const plan = planGreyscaleWedge(spanY, { bandHeight: DEFAULT_WEDGE_BAND_MM });

  it('plans an ascending ladder from minPower to exactly maxPower', () => {
    expect(plan.bands.length).toBe(10);
    expect(plan.bands[0]).toBeCloseTo(0.05, 6);
    expect(plan.bands[plan.bands.length - 1]).toBe(1);
    for (let i = 1; i < plan.bands.length; i++) expect(plan.bands[i]).toBeGreaterThan(plan.bands[i - 1]);
    expect(plan.grayRefs).toEqual([...WEDGE_GRAY_REFS]);
  });

  it('makes one solid band bitmap + one op per band, plus the gray-refs slot', () => {
    const { ops, primitives } = materializeGreyscaleWedge(plan, ROD, LASER);
    expect(ops).toHaveLength(plan.bands.length + 1);
    expect(primitives).toHaveLength(plan.bands.length + 1);
    const prims = primitives as Extract<Primitive, { kind: 'bitmap' }>[];
    ops.forEach((op, i) => {
      if (op.kind !== 'rasterEngrave') throw new Error('expected raster ops');
      expect(op.pitch).toBe(RASTER_PITCH_MM);
      expect(op.featureIds).toEqual([`p:${prims[i].id}:bitmap:0`]);
      if (i < plan.bands.length) {
        // the band's S level IS the op's power (the ⚡ override, beam %)
        expect(op.rates?.spindleRpm).toBe(Math.round(plan.bands[i] * 100));
      } else {
        // the refs op burns at the JOB's power — no override
        expect(op.rates).toBeUndefined();
      }
    });
    // band bitmaps are solid black; the refs bitmap carries the 3 gray
    // slices — read after the bitmapKernelGray round-trip (the wrapped
    // store is the inverse transpose)
    for (let i = 0; i < plan.bands.length; i++) {
      expect(bitmapKernelGray(prims[i].gray).data.every((v) => v === 0)).toBe(true);
    }
    const refs = bitmapKernelGray(prims[prims.length - 1].gray);
    const slices = [...new Set([...Array(refs.width).keys()].map((x) => refs.data[x]))].sort((a, b) => a - b);
    expect(slices).toEqual(WEDGE_GRAY_REFS.map((g) => Math.round(255 * g)));
  });

  it('generates every op cleanly through the real pipeline', () => {
    const { ops, primitives } = materializeGreyscaleWedge(plan, ROD, LASER);
    const c = ctx(ROD, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
    }
  });

  it('flat stock: bands tile the crown strip with the refs slot on top', () => {
    const flatPlan = planGreyscaleWedge(laserCouponLadder(BOX, 6).span.y * 5, {});
    const { ops, primitives } = materializeGreyscaleWedge(flatPlan, BOX, LASER);
    const prims = primitives as Extract<Primitive, { kind: 'bitmap' }>[];
    const ys = prims.map((p) => p.transform.position.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    expect(prims[prims.length - 1].transform.position.z).toBeCloseTo(20, 6);
    expect(ops).toHaveLength(flatPlan.bands.length + 1);
  });

  it('surfaces the planner warnings — an inverted ladder reads as swapped', () => {
    const swapped = planGreyscaleWedge(20, { minPower: 0.9, maxPower: 0.2 });
    expect(swapped.warnings.length).toBeGreaterThan(0);
    expect(swapped.bands[0]).toBeCloseTo(0.2, 6);
  });
});

// ------------------------------------------------------ planner consumption

describe('planner consumption — gridToGray fires black on fired pixels', () => {
  it('the interlace gray burns ONLY the planned columns, full height', () => {
    const plan = planInterlaceCoupon({ x: 20, y: 10 }, { pitch: 0.1 });
    const gray = gridToGray(plan.grid, (x) => plan.columns.includes(x));
    for (let y = 0; y < gray.height; y++) {
      for (let x = 0; x < gray.width; x++) {
        expect(gray.data[y * gray.width + x]).toBe(plan.columns.includes(x) ? 0 : 255);
      }
    }
  });

  it('a too-fine column spacing warns before anything is cut', () => {
    const plan = planInterlaceCoupon({ x: 5, y: 5 }, { pitch: 0.1, columnSpacing: 0.05 });
    expect(plan.warnings.some((w) => w.includes('blur together'))).toBe(true);
  });

  it('the default column spacing is sub-pixel-safe at the Studio pitch', () => {
    const plan = planInterlaceCoupon({ x: 40, y: 10 }, { pitch: RASTER_PITCH_MM });
    expect(plan.warnings).toEqual([]);
    expect(plan.columns.length).toBeGreaterThanOrEqual(2);
  });
});
