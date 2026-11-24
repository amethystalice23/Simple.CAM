/**
 * The laser calibration coupons end to end — the raster analogue of the
 * cutting coupon's test file: plan (rasterCoupons.ts) → materialize into
 * ORDINARY OPS + bitmap primitives → every op generates through the real
 * pipeline. Also the launcher registry's shape (id/label/ideogram/
 * component) and the laser-only gate the panels enforce.
 */

import { describe, expect, it } from 'vitest';
import { identityTransform } from '../../core/types';
import type { JobOp, Primitive, Stock, Tool } from '../../core/types';
import { rotaryCalibrationOf } from '../../core/types';
import { bitmapKernelGray, sourcesFor } from '../featureSources';
import {
  generateJobOp,
  INTERLACE_LADDER_MM,
  INTERLACE_BLOCK_GAP_MM,
  INTERLACE_PATCH_MM,
  interlaceLabel,
  laserCouponLadder,
  materializeGreyscaleWedge,
  materializeInterlaceCoupon,
  planInterlaceCouponV2,
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
// v2 (Alice's 2026-11-24 ruling): nine 1×1cm patches at 0.12mm interlace
// steps within ±0.5, zero included, each labeled — one pass, replacing the
// whole-stock twin-bitmap design.

describe('planInterlaceCouponV2 — the ladder and the row layout', () => {
  it('the ladder: 0.12mm multiples within ±0.5, zero included, ascending', () => {
    expect(INTERLACE_LADDER_MM).toEqual([-0.48, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.48]);
    expect(INTERLACE_LADDER_MM).toContain(0);
    for (const v of INTERLACE_LADDER_MM) {
      expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(v / 0.12).toBeCloseTo(Math.round(v / 0.12), 9);
    }
    // the label text reads unambiguously — sign explicit, zero bare
    expect(interlaceLabel(0)).toBe('0');
    expect(interlaceLabel(-0.48)).toBe('-0.48');
    expect(interlaceLabel(0.36)).toBe('+0.36');
  });

  it('the 50mm rod fits 3 patches per row, 3 rows, no warnings', () => {
    const plan = planInterlaceCouponV2(ROD);
    expect(plan.perRow).toBe(3);
    expect(plan.rows).toBe(3);
    expect(plan.patch).toBe(INTERLACE_PATCH_MM);
    expect(plan.slotHeight).toBeGreaterThan(INTERLACE_PATCH_MM); // room for the label
    expect(plan.warnings).toEqual([]);
    expect(plan.size.y).toBeCloseTo(3 * plan.slotHeight + 2 * INTERLACE_BLOCK_GAP_MM, 6);
  });

  it('a wide box wraps into 2 rows; a patch narrower than the stock warns', () => {
    const boxPlan = planInterlaceCouponV2(BOX); // 100mm span → 7 per row
    expect(boxPlan.perRow).toBe(7);
    expect(boxPlan.rows).toBe(2);
    const tiny = { ...BOX, sizeX: 8 };
    expect(planInterlaceCouponV2(tiny).warnings.length).toBeGreaterThan(0);
  });
});

describe('materializeInterlaceCoupon v2 — nine patches + labels, one pass', () => {
  const plan = planInterlaceCouponV2(ROD);

  it('materializes 9 patch bitmaps + 9 text labels and 10 ops (9 raster + 1 engrave)', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, ROD, LASER);
    expect(ops).toHaveLength(10);
    expect(primitives).toHaveLength(18);
    const rasters = ops.filter((o) => o.kind === 'rasterEngrave');
    const engraves = ops.filter((o) => o.kind === 'engrave');
    expect(rasters).toHaveLength(9);
    expect(engraves).toHaveLength(1); // ONE op burns every label
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    expect(bitmaps).toHaveLength(9);
    expect(texts).toHaveLength(9);
    // each patch: serpentine at its ladder setting, the SAME 1cm grid,
    // no rate overrides — the settings are the only variable
    rasters.forEach((op, i) => {
      const r = op as Extract<JobOp, { kind: 'rasterEngrave' }>;
      expect(r.sweep).toBe('serpentine');
      expect(r.interlace).toBe(INTERLACE_LADDER_MM[i]);
      expect(r.pitch).toBe(RASTER_PITCH_MM);
      expect(r.toolId).toBe(LASER.id);
      expect(r.featureIds).toEqual([`p:${bitmaps[i].id}:bitmap:0`]);
      expect(r.rates).toBeUndefined();
      expect(bitmaps[i].width).toBeCloseTo(INTERLACE_PATCH_MM, 6);
      expect(bitmaps[i].height).toBeCloseTo(INTERLACE_PATCH_MM, 6);
      // the fired columns are the plan's, single pixels, full height (the
      // wrapped store round-trips through bitmapKernelGray)
      const kernel = bitmapKernelGray(bitmaps[i].gray);
      const fired = new Set<number>();
      kernel.data.forEach((v, j) => {
        if (v === 0) fired.add(j % kernel.width);
      });
      const patch = planInterlaceCoupon(
        { x: INTERLACE_PATCH_MM, y: INTERLACE_PATCH_MM },
        { pitch: RASTER_PITCH_MM, columnSpacing: DEFAULT_COLUMN_SPACING_MM },
      );
      expect(fired.size).toBe(patch.columns.length);
      expect(kernel.data.filter((v) => v === 0)).toHaveLength(
        patch.columns.length * kernel.height,
      );
    });
    // the labels: one text primitive per setting, its text IS the setting
    texts.forEach((t, i) => {
      expect(t.text).toBe(interlaceLabel(INTERLACE_LADDER_MM[i]));
      expect(t.size).toBe(3); // INTERLACE_LABEL_CAP_MM
      expect(t.paths.length).toBeGreaterThan(0);
      expect(t.presentation).toBe('wrapped');
      expect(t.wrapDiameter).toBeCloseTo(16.35, 6);
    });
    // the engrave op targets EVERY label path, and nothing else
    const e = engraves[0] as Extract<JobOp, { kind: 'engrave' }>;
    const allPaths = texts.flatMap((t) => t.paths.map((_, k) => `p:${t.id}:path:${k}`));
    expect(e.featureIds).toHaveLength(allPaths.length);
    expect(new Set(e.featureIds)).toEqual(new Set(allPaths));
    expect(e.toolId).toBe(LASER.id);
  });

  it('wrapped: patches in a row along X, labels above on the arc', () => {
    const { primitives } = materializeInterlaceCoupon(plan, ROD, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    // row 0 holds perRow=3 blocks: X spacing is exactly patch + gap
    const xs = bitmaps.slice(0, 3).map((b) => b.transform.position.x);
    expect(xs[1] - xs[0]).toBeCloseTo(INTERLACE_PATCH_MM + plan.gap, 6);
    expect(xs[2] - xs[1]).toBeCloseTo(INTERLACE_PATCH_MM + plan.gap, 6);
    // on the axis (the wrapped drop convention), own Ø = the stock's
    for (const b of bitmaps) {
      expect(b.presentation).toBe('wrapped');
      expect(b.transform.position.z).toBeCloseTo(0, 6);
      expect(b.transform.position.y).toBe(0);
    }
    // the label rides ABOVE its patch: ascending arc = more-negative Rx
    for (let i = 0; i < 9; i++) {
      expect(texts[i].transform.rotationDeg.x).toBeLessThan(bitmaps[i].transform.rotationDeg.x);
      expect(texts[i].transform.position.x).toBeCloseTo(bitmaps[i].transform.position.x, 6);
      // the patch sits BELOW the row slot's center, the label above it
      expect(Math.abs(bitmaps[i].transform.rotationDeg.x)).toBeLessThan(
        Math.abs(laserCouponLadder(ROD, plan.rows, plan.gap, plan.slotHeight).place(Math.floor(i / 3)).rotationDeg.x),
      );
    }
  });

  it('flat stock: patches on the crown, labels above in +Y, rows centered', () => {
    const boxPlan = planInterlaceCouponV2(BOX);
    const { primitives } = materializeInterlaceCoupon(boxPlan, BOX, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    expect(bitmaps[0].presentation).toBeUndefined(); // flat like an import
    expect(texts[0].presentation).toBe('flat');
    for (let i = 0; i < 9; i++) {
      expect(bitmaps[i].transform.position.z).toBeCloseTo(20, 6); // the crown
      expect(texts[i].transform.position.z).toBeCloseTo(20, 6);
      expect(texts[i].transform.position.y).toBeGreaterThan(bitmaps[i].transform.position.y);
      expect(texts[i].transform.position.x).toBeCloseTo(bitmaps[i].transform.position.x, 6);
    }
    // row 1 holds the remaining 2 patches, centered under the 7 above
    const row1 = bitmaps.slice(7).map((b) => b.transform.position.x);
    const row0Mid = (bitmaps[0].transform.position.x + bitmaps[6].transform.position.x) / 2;
    expect((row1[0] + row1[1]) / 2).toBeCloseTo(row0Mid, 6);
  });

  it('generates every op cleanly through the real pipeline (wrapped 4-axis)', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, ROD, LASER);
    const c = ctx(ROD, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      // no CUT move of a RASTER carries both x and a (G93 never appears in
      // a raster); the label engrave op is a vector burn — its wrapped
      // strokes legitimately coordinate X with A (G93 inverse-time)
      if (op.kind !== 'rasterEngrave') continue;
      for (const m of res.moves) {
        if (m.rapid) continue;
        expect(m.words.x === undefined || m.words.a === undefined).toBe(true);
      }
    }
  });

  it('generates cleanly on flat stock too (labels + patches)', () => {
    const boxPlan = planInterlaceCouponV2(BOX);
    const { ops, primitives } = materializeInterlaceCoupon(boxPlan, BOX, LASER);
    const c = ctx(BOX, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
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
