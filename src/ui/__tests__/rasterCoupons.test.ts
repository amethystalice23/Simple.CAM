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
  deriveInterlaceLadder,
  deriveWedgeLadder,
  generateJobOp,
  INTERLACE_GAP_CLEARANCE_MM,
  INTERLACE_MAX_PER_SIDE,
  INTERLACE_MIN_BLOCK_GAP_MM,
  INTERLACE_PATCH_MM,
  interlaceLabel,
  laserCouponLadder,
  materializeGreyscaleWedge,
  materializeInterlaceCoupon,
  planInterlaceCouponV2,
  planWedgeCouponV2,
  wedgeLabel,
  WEDGE_BAND_MM,
  WEDGE_GAP_CLEARANCE_MM,
  WEDGE_LABEL_CAP_MM,
  WEDGE_MIN_BLOCK_GAP_MM,
  type GenContext,
} from '../jobGeneration';
import {
  DEFAULT_COLUMN_SPACING_MM,
  gridToGray,
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
// v2 (Alice's 2026-11-24 rulings): the ladder derives from RANGE BOXES on
// the panel (prefill −0.5…+0.5 → 5 + 5 steps of 0.1 + the zero reference),
// the nonzero values split into two rows, zero burns as its OWN column
// beside them centered across the seam, and the block gap derives from the
// widest label so labels never overlap.

describe('deriveInterlaceLadder — the range boxes', () => {
  it('prefill −0.5…+0.5: 5 + 5 steps of 0.1 plus the zero reference', () => {
    const l = deriveInterlaceLadder(-0.5, 0.5);
    expect(l.values).toEqual([
      -0.5, -0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5,
    ]);
    expect(l.zeroIndex).toBe(5);
    expect(l.steps).toEqual([0.1, 0.1]);
    expect(l.warnings).toEqual([]);
  });

  it('asymmetric −0.2…+0.4: zero included, per-side even steps', () => {
    const l = deriveInterlaceLadder(-0.2, 0.4);
    expect(l.values).toEqual([-0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4]);
    expect(l.zeroIndex).toBe(2);
    expect(l.steps).toEqual([0.1, 0.1]);
  });

  it('zero absent 0.1…0.9: one inclusive span, nine steps of 0.1', () => {
    const l = deriveInterlaceLadder(0.1, 0.9);
    expect(l.values).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(l.zeroIndex).toBeNull();
    expect(l.steps).toEqual([0.1]);
  });

  it('a backwards range reads as swapped (the wedge precedent)', () => {
    const l = deriveInterlaceLadder(0.5, -0.5);
    expect(l.values).toEqual(deriveInterlaceLadder(-0.5, 0.5).values);
    expect(l.warnings.length).toBeGreaterThan(0);
  });

  it('a degenerate range (equal endpoints) warns and yields no ladder', () => {
    const l = deriveInterlaceLadder(0.3, 0.3);
    expect(l.values).toEqual([]);
    expect(l.warnings.some((w) => /two distinct values/.test(w))).toBe(true);
  });

  it('a wide range clamps to 10 per side (21 patches incl. zero) and warns', () => {
    const l = deriveInterlaceLadder(-5, 5);
    expect(l.values).toHaveLength(2 * INTERLACE_MAX_PER_SIDE + 1);
    expect(l.values[l.zeroIndex!]).toBe(0);
    expect(l.values.filter((v) => v < 0)).toHaveLength(INTERLACE_MAX_PER_SIDE);
    expect(l.warnings.some((w) => /clamped/.test(w))).toBe(true);
  });

  it('labels read unambiguously: sign explicit, zero bare, trailing zeros trimmed', () => {
    expect(interlaceLabel(0)).toBe('0');
    expect(interlaceLabel(-0.5)).toBe('-0.5');
    expect(interlaceLabel(0.125)).toBe('+0.125');
    expect(interlaceLabel(-0.375)).toBe('-0.375');
    expect(interlaceLabel(0.4)).toBe('+0.4');
  });
});

describe('planInterlaceCouponV2 — rows, zero column, derived gap, live totals', () => {
  // the tests' rod is only 50mm along X — the 5+5+zero grid needs more, so
  // the layout tests run on a 100mm rod (the app's default stock length)
  const LONGROD: Stock = { ...ROD, length: 100 };

  it('prefill plan: two even rows of 5 + the zero column; gap fits the labels', () => {
    const plan = planInterlaceCouponV2(LONGROD);
    expect(plan.values).toHaveLength(11);
    expect(plan.row1).toEqual([-0.5, -0.4, -0.3, -0.2, -0.1]);
    expect(plan.row2).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(plan.zero).toBe(0);
    expect(plan.gap).toBeCloseTo(
      Math.max(INTERLACE_MIN_BLOCK_GAP_MM, plan.labelWidth - plan.patch + INTERLACE_GAP_CLEARANCE_MM),
      9,
    );
    expect(plan.gap).toBeGreaterThanOrEqual(INTERLACE_MIN_BLOCK_GAP_MM);
    expect(plan.slotHeight).toBeGreaterThan(INTERLACE_PATCH_MM); // room for the label
    expect(plan.size.y).toBeCloseTo(2 * plan.slotHeight + plan.gap, 6);
    expect(plan.size.x).toBeCloseTo(5 * plan.patch + 4 * plan.gap + plan.gap + plan.patch, 6);
    expect(plan.warnings).toEqual([]);
  });

  it('asymmetric range: rows as even as possible (negatives first)', () => {
    const plan = planInterlaceCouponV2(LONGROD, -0.2, 0.4);
    expect(plan.values).toHaveLength(7);
    expect(plan.row1).toEqual([-0.2, -0.1, 0.1]);
    expect(plan.row2).toEqual([0.2, 0.3, 0.4]);
    expect(plan.zero).toBe(0);
  });

  it('zero-absent range: no zero column, rows split 5+4', () => {
    const plan = planInterlaceCouponV2(LONGROD, 0.1, 0.9);
    expect(plan.values).toHaveLength(9);
    expect(plan.row1).toHaveLength(5);
    expect(plan.row2).toHaveLength(4);
    expect(plan.zero).toBeNull();
    expect(plan.size.x).toBeCloseTo(5 * plan.patch + 4 * plan.gap, 6);
  });

  it('the 50mm rod cannot fit the row grid along X and says so', () => {
    const plan = planInterlaceCouponV2(ROD);
    expect(plan.warnings.some((w) => /run past the edge/.test(w))).toBe(true);
  });
});

describe('materializeInterlaceCoupon v2 — patches + labels + zero column', () => {
  const LONGROD: Stock = { ...ROD, length: 100 };
  const plan = planInterlaceCouponV2(LONGROD);

  it('materializes 11 patch bitmaps + 11 text labels and 12 ops (11 raster + 1 engrave)', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, LONGROD, LASER);
    expect(ops).toHaveLength(12);
    expect(primitives).toHaveLength(22);
    const rasters = ops.filter((o) => o.kind === 'rasterEngrave');
    const engraves = ops.filter((o) => o.kind === 'engrave');
    expect(rasters).toHaveLength(11);
    expect(engraves).toHaveLength(1); // ONE op burns every label
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    expect(bitmaps).toHaveLength(11);
    expect(texts).toHaveLength(11);
    // every ladder value burned exactly once, serpentine, at its setting
    const burned = rasters.map(
      (op) => (op as Extract<JobOp, { kind: 'rasterEngrave' }>).interlace,
    );
    expect(new Set(burned)).toEqual(new Set(plan.values));
    expect(burned).toContain(0); // the zero reference burns too
    rasters.forEach((op, i) => {
      const r = op as Extract<JobOp, { kind: 'rasterEngrave' }>;
      expect(r.sweep).toBe('serpentine');
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
      expect(t.text).toBe(interlaceLabel(burned[i]!));
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

  it('flat: the zero column sits after the rows, centered across the seam', () => {
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
    // patches burn in plan order: row 1, row 2, zero last
    const row1 = bitmaps.slice(0, boxPlan.row1.length);
    const zero = bitmaps[bitmaps.length - 1];
    // row spacing is patch + gap along X, left-aligned ascending
    for (let i = 1; i < row1.length; i++) {
      expect(row1[i].transform.position.x - row1[i - 1].transform.position.x).toBeCloseTo(
        boxPlan.patch + boxPlan.gap,
        6,
      );
    }
    // the zero column is a full gap past the row grid's right edge
    const rowsRight = Math.max(...row1.map((b) => b.transform.position.x)) + boxPlan.patch / 2;
    expect(zero.transform.position.x - rowsRight).toBeCloseTo(boxPlan.gap + boxPlan.patch / 2, 6);
    // ... and centered across the seam between the two row slots
    const slot = laserCouponLadder(BOX, 2, boxPlan.gap, boxPlan.slotHeight);
    const seamY = (slot.place(0).position.y + slot.place(1).position.y) / 2;
    expect(zero.transform.position.y).toBeCloseTo(seamY, 6);
    // zero's label rides directly above the zero patch
    const zeroLabel = texts[texts.length - 1];
    expect(zeroLabel.transform.position.x).toBeCloseTo(zero.transform.position.x, 6);
    expect(zeroLabel.transform.position.y).toBeGreaterThan(zero.transform.position.y);
    expect(zeroLabel.text).toBe('0');
  });

  it('flat: no label rect intersects another label or a neighbor patch', () => {
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
    // primitives interleave bitmap,label per patch — own pairs may touch
    const rects = [
      ...bitmaps.map((b, i) => ({
        x0: b.transform.position.x - b.width / 2,
        x1: b.transform.position.x + b.width / 2,
        y0: b.transform.position.y - b.height / 2,
        y1: b.transform.position.y + b.height / 2,
        owner: i,
        kind: 'patch' as const,
      })),
      ...texts.map((t, i) => ({
        x0: t.transform.position.x - t.width / 2,
        x1: t.transform.position.x + t.width / 2,
        y0: t.transform.position.y - t.height / 2,
        y1: t.transform.position.y + t.height / 2,
        owner: i,
        kind: 'label' as const,
      })),
    ];
    // a VIOLATION is two rects from DIFFERENT patches intersecting — a
    // label may overhang its own patch
    const overlaps = (a: (typeof rects)[number], b: (typeof rects)[number]): boolean =>
      a.owner !== b.owner &&
      a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j]), `rects ${i} (${rects[i].kind}) and ${j} (${rects[j].kind}) overlap`).toBe(false);
      }
    }
  });

  it('wrapped: the zero column centers across the seam on the arc', () => {
    const { primitives } = materializeInterlaceCoupon(plan, LONGROD, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const row1 = bitmaps.slice(0, plan.row1.length);
    const row2 = bitmaps.slice(plan.row1.length, plan.row1.length + plan.row2.length);
    const zero = bitmaps[bitmaps.length - 1];
    const mid = (a: number, b: number) => (a + b) / 2;
    // the zero patch's Rx sits BETWEEN the two rows' patch rotations —
    // centered across the seam (ascending arc = more-negative Rx)
    const r1 = row1[0].transform.rotationDeg.x;
    const r2 = row2[0].transform.rotationDeg.x;
    expect(zero.transform.rotationDeg.x).toBeLessThan(r1);
    expect(zero.transform.rotationDeg.x).toBeGreaterThan(r2);
    // its arc offset from row 1 equals row 2's from it (the seam midpoint
    // of the SLOT bases; the patch offset dPatch is common to all three,
    // so the zero rotation is the slot-midpoint MINUS that common offset)
    const seamExpect = mid(r1, r2) - ((plan.slotHeight - plan.patch) / 2) * (180 / (Math.PI * 8.175));
    expect(zero.transform.rotationDeg.x).toBeCloseTo(seamExpect, 3);
    expect(zero.transform.position.y).toBe(0);
  });

  it('generates every op cleanly through the real pipeline (wrapped 4-axis)', () => {
    const { ops, primitives } = materializeInterlaceCoupon(plan, LONGROD, LASER);
    const c = ctx(LONGROD, primitives);
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

  it('generates cleanly on flat stock too (labels + patches + zero column)', () => {
    const boxPlan = planInterlaceCouponV2(BOX);
    const { ops, primitives } = materializeInterlaceCoupon(boxPlan, BOX, LASER);
    const c = ctx(BOX, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
    }
  });

  it('a degenerate range materializes nothing', () => {
    const empty = planInterlaceCouponV2(BOX, 0.3, 0.3);
    const { ops, primitives } = materializeInterlaceCoupon(empty, BOX, LASER);
    expect(ops).toHaveLength(0);
    expect(primitives).toHaveLength(0);
  });
});


// ---------------------------------------------------------------- the wedge
// v2 (Alice's 2026-11-24): the interlace idioms applied to the wedge —
// range boxes derive the band ladder (prefill 0.05…1.0 → 10 bands),
// compact square blocks at the Band height field, a label above every
// band, the 25/50/75% refs as a column beside the rows.

describe('deriveWedgeLadder — the power range boxes', () => {
  it('prefill 0.05…1.0: ten ascending bands, endpoints exact', () => {
    const l = deriveWedgeLadder(0.05, 1);
    expect(l.bands).toHaveLength(10);
    expect(l.bands[0]).toBeCloseTo(0.05, 9);
    expect(l.bands[l.bands.length - 1]).toBe(1); // exact maxPower, no dust
    for (let i = 1; i < l.bands.length; i++) {
      expect(l.bands[i]).toBeGreaterThan(l.bands[i - 1]);
      // even increments (bands round to 6 decimals for clean labels)
      expect(l.bands[i] - l.bands[i - 1]).toBeCloseTo(l.steps[0], 5);
    }
    expect(l.warnings).toEqual([]);
  });

  it('an in-range count derives from the range (0.5…1.0 → 5 bands of 0.125)', () => {
    const l = deriveWedgeLadder(0.5, 1);
    expect(l.bands).toEqual([0.5, 0.625, 0.75, 0.875, 1]);
    expect(l.steps).toEqual([0.125]);
    expect(l.warnings).toEqual([]);
  });

  it('a narrow range squeezes to the old 3-band floor and warns', () => {
    const l = deriveWedgeLadder(0.05, 0.1);
    expect(l.bands).toHaveLength(3);
    expect(l.bands[0]).toBeCloseTo(0.05, 9);
    expect(l.bands[2]).toBeCloseTo(0.1, 9);
    expect(l.warnings.some((w) => /squeezes/.test(w))).toBe(true);
  });

  it('an inverted range reads as swapped (the wedge precedent)', () => {
    const l = deriveWedgeLadder(0.9, 0.2);
    expect(l.bands[0]).toBeCloseTo(0.2, 9);
    expect(l.bands[l.bands.length - 1]).toBeCloseTo(0.9, 9);
    expect(l.warnings.some((w) => /swapped/.test(w))).toBe(true);
  });

  it('an equal range warns flat and still derives bands', () => {
    const l = deriveWedgeLadder(0.5, 0.5);
    expect(l.bands.every((b) => Math.abs(b - 0.5) < 1e-9)).toBe(true);
    expect(l.bands.length).toBeGreaterThanOrEqual(3);
    expect(l.warnings.some((w) => /flat/.test(w))).toBe(true);
  });

  it('band labels are beam-power percent (the ⚡ unit), trimmed', () => {
    expect(wedgeLabel(0.05)).toBe('5%');
    expect(wedgeLabel(1)).toBe('100%');
    expect(wedgeLabel(0.156)).toBe('15.6%');
  });
});

describe('planWedgeCouponV2 — rows, refs column, derived gap, live totals', () => {
  const LONGROD: Stock = { ...ROD, length: 100 };

  it('prefill plan: 10 bands in two even rows + the refs column', () => {
    const plan = planWedgeCouponV2(LONGROD);
    expect(plan.bands).toHaveLength(10);
    expect(plan.row1).toHaveLength(5);
    expect(plan.row2).toHaveLength(5);
    expect(plan.grayRefs).toEqual([0.25, 0.5, 0.75]);
    expect(plan.patch).toBe(WEDGE_BAND_MM);
    expect(plan.gap).toBeCloseTo(
      Math.max(WEDGE_MIN_BLOCK_GAP_MM, plan.labelWidth - plan.patch + WEDGE_GAP_CLEARANCE_MM),
      9,
    );
    expect(plan.slotHeight).toBeGreaterThan(WEDGE_BAND_MM); // room for the label
    expect(plan.size.y).toBeCloseTo(2 * plan.slotHeight + plan.gap, 6);
    // the refs column rides a full gap+patch past the band grid
    expect(plan.size.x).toBeCloseTo(5 * plan.patch + 4 * plan.gap + plan.gap + plan.patch, 6);
    expect(plan.warnings).toEqual([]);
  });

  it('a narrow power range still lays out (3 bands, one row + refs)', () => {
    const plan = planWedgeCouponV2(LONGROD, 0.05, 0.1);
    expect(plan.row1).toHaveLength(2);
    expect(plan.row2).toHaveLength(1);
    expect(plan.size.x).toBeCloseTo(2 * plan.patch + plan.gap + plan.gap + plan.patch, 6);
  });

  it('a wide range warns when it exceeds the stock span', () => {
    const long = planWedgeCouponV2(LONGROD, 0, 1, 20); // 20mm blocks overflow
    expect(long.warnings.some((w) => /run past the edge/.test(w))).toBe(true);
  });
});

describe('materializeGreyscaleWedge v2 — bands + labels + refs column', () => {
  const LONGROD: Stock = { ...ROD, length: 100 };
  const plan = planWedgeCouponV2(LONGROD);

  it('materializes 10 band bitmaps + 10 labels + refs block + refs label (22 prims, 12 ops)', () => {
    const { ops, primitives } = materializeGreyscaleWedge(plan, LONGROD, LASER);
    expect(ops).toHaveLength(12); // 10 band rasters + 1 refs raster + 1 engrave
    expect(primitives).toHaveLength(22); // (10 bands + refs) × (bitmap + label)
    const rasters = ops.filter((o) => o.kind === 'rasterEngrave');
    const engraves = ops.filter((o) => o.kind === 'engrave');
    expect(rasters).toHaveLength(11);
    expect(engraves).toHaveLength(1); // ONE op burns every label
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    expect(bitmaps).toHaveLength(11);
    expect(texts).toHaveLength(11);
    // every band burns as its own raster at ITS power (the ⚡ override),
    // ascending with the ladder; the refs raster carries NO override
    rasters.forEach((op, i) => {
      const r = op as Extract<JobOp, { kind: 'rasterEngrave' }>;
      expect(r.pitch).toBe(RASTER_PITCH_MM);
      expect(r.featureIds).toEqual([`p:${bitmaps[i].id}:bitmap:0`]);
      if (i < plan.bands.length) {
        expect(r.rates?.spindleRpm).toBe(Math.round(plan.bands[i] * 100));
      } else {
        expect(r.rates).toBeUndefined(); // the refs burn at the JOB's power
      }
      expect(bitmaps[i].width).toBeCloseTo(WEDGE_BAND_MM, 6);
      expect(bitmaps[i].height).toBeCloseTo(WEDGE_BAND_MM, 6);
    });
    // the band bitmaps are SOLID black; the refs bitmap carries the fixed
    // gray slices (read after the bitmapKernelGray round-trip)
    for (let i = 0; i < plan.bands.length; i++) {
      expect(bitmapKernelGray(bitmaps[i].gray).data.every((v) => v === 0)).toBe(true);
    }
    const refs = bitmapKernelGray(bitmaps[bitmaps.length - 1].gray);
    const slices = [...new Set([...Array(refs.width).keys()].map((x) => refs.data[x]))].sort(
      (a, b) => a - b,
    );
    expect(slices).toEqual(WEDGE_GRAY_REFS.map((g) => Math.round(255 * g)));
    // the labels: one per band (its S as percent) + the refs label
    texts.forEach((t, i) => {
      expect(t.text).toBe(i < plan.bands.length ? wedgeLabel(plan.bands[i]) : 'refs');
      expect(t.size).toBe(WEDGE_LABEL_CAP_MM);
      expect(t.presentation).toBe('wrapped');
    });
    // the engrave op targets EVERY label path, and nothing else
    const e = engraves[0] as Extract<JobOp, { kind: 'engrave' }>;
    const allPaths = texts.flatMap((t) => t.paths.map((_, k) => `p:${t.id}:path:${k}`));
    expect(e.featureIds).toHaveLength(allPaths.length);
    expect(new Set(e.featureIds)).toEqual(new Set(allPaths));
    expect(e.toolId).toBe(LASER.id);
  });

  it('flat: bands in rows on the crown, refs column after them, on the seam', () => {
    const boxPlan = planWedgeCouponV2(BOX);
    const { primitives } = materializeGreyscaleWedge(boxPlan, BOX, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    const row1 = bitmaps.slice(0, boxPlan.row1.length);
    const refs = bitmaps[bitmaps.length - 1];
    // rows left-aligned ascending along X, patches + gap apart
    for (let i = 1; i < row1.length; i++) {
      expect(row1[i].transform.position.x - row1[i - 1].transform.position.x).toBeCloseTo(
        boxPlan.patch + boxPlan.gap,
        6,
      );
    }
    // the refs column sits a full gap past the band grid's right edge,
    // centered across the seam between the two row slots
    const rowsRight = Math.max(...row1.map((b) => b.transform.position.x)) + boxPlan.patch / 2;
    expect(refs.transform.position.x - rowsRight).toBeCloseTo(boxPlan.gap + boxPlan.patch / 2, 6);
    const slot = laserCouponLadder(BOX, 2, boxPlan.gap, boxPlan.slotHeight);
    const seamY = (slot.place(0).position.y + slot.place(1).position.y) / 2;
    expect(refs.transform.position.y).toBeCloseTo(seamY, 6);
    // the refs label rides directly above the refs block
    const refsLabel = texts[texts.length - 1];
    expect(refsLabel.text).toBe('refs');
    expect(refsLabel.transform.position.x).toBeCloseTo(refs.transform.position.x, 6);
    expect(refsLabel.transform.position.y).toBeGreaterThan(refs.transform.position.y);
    // every label sits above its own block, on the crown
    for (let i = 0; i < texts.length; i++) {
      expect(texts[i].transform.position.z).toBeCloseTo(20, 6);
      expect(texts[i].transform.position.y).toBeGreaterThan(bitmaps[i].transform.position.y);
      expect(texts[i].transform.position.x).toBeCloseTo(bitmaps[i].transform.position.x, 6);
    }
  });

  it('flat: no label rect intersects another label or a neighbor block', () => {
    const boxPlan = planWedgeCouponV2(BOX);
    const { primitives } = materializeGreyscaleWedge(boxPlan, BOX, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const texts = primitives.filter((p) => p.kind === 'text') as Extract<
      Primitive,
      { kind: 'text' }
    >[];
    const rects = [
      ...bitmaps.map((b, i) => ({
        x0: b.transform.position.x - b.width / 2,
        x1: b.transform.position.x + b.width / 2,
        y0: b.transform.position.y - b.height / 2,
        y1: b.transform.position.y + b.height / 2,
        owner: i,
        kind: 'block' as const,
      })),
      ...texts.map((t, i) => ({
        x0: t.transform.position.x - t.width / 2,
        x1: t.transform.position.x + t.width / 2,
        y0: t.transform.position.y - t.height / 2,
        y1: t.transform.position.y + t.height / 2,
        owner: i,
        kind: 'label' as const,
      })),
    ];
    // a VIOLATION is two rects from DIFFERENT blocks intersecting — a
    // label may overhang its own block
    const overlaps = (a: (typeof rects)[number], b: (typeof rects)[number]): boolean =>
      a.owner !== b.owner &&
      a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(
          overlaps(rects[i], rects[j]),
          `rects ${i} (${rects[i].kind}) and ${j} (${rects[j].kind}) overlap`,
        ).toBe(false);
      }
    }
  });

  it('wrapped: the refs column centers across the seam on the arc', () => {
    const { primitives } = materializeGreyscaleWedge(plan, LONGROD, LASER);
    const bitmaps = primitives.filter((p) => p.kind === 'bitmap') as Extract<
      Primitive,
      { kind: 'bitmap' }
    >[];
    const row1 = bitmaps.slice(0, plan.row1.length);
    const row2 = bitmaps.slice(plan.row1.length, plan.row1.length + plan.row2.length);
    const refs = bitmaps[bitmaps.length - 1];
    const r1 = row1[0].transform.rotationDeg.x;
    const r2 = row2[0].transform.rotationDeg.x;
    // the refs block's Rx sits BETWEEN the two rows' rotations — centered
    // across the seam (ascending arc = more-negative Rx)
    expect(refs.transform.rotationDeg.x).toBeLessThan(r1);
    expect(refs.transform.rotationDeg.x).toBeGreaterThan(r2);
    const seamExpect =
      (r1 + r2) / 2 - ((plan.slotHeight - plan.patch) / 2) * (180 / (Math.PI * 8.175));
    expect(refs.transform.rotationDeg.x).toBeCloseTo(seamExpect, 3);
    expect(refs.transform.position.y).toBe(0);
  });

  it('generates every op cleanly through the real pipeline (wrapped 4-axis)', () => {
    const { ops, primitives } = materializeGreyscaleWedge(plan, LONGROD, LASER);
    const c = ctx(LONGROD, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
    }
  });

  it('generates cleanly on flat stock too (bands + labels + refs)', () => {
    const boxPlan = planWedgeCouponV2(BOX);
    const { ops, primitives } = materializeGreyscaleWedge(boxPlan, BOX, LASER);
    const c = ctx(BOX, primitives);
    for (const op of ops) {
      const res = generateJobOp(op, c);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
    }
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
