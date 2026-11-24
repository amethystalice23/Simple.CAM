/**
 * Raster-coupon planner tests — the interlace coupon and the greyscale
 * step-wedge (src/cam/rasterCoupons.ts). Numeric, testPattern-style: the
 * planners are pure, so every expectation is an exact number — column
 * positions and margins in pixels, the exact linspace, the fixed gray
 * refs, and the helper bitmaps' exact byte values. The UI materialization
 * (bitmaps + ops from the plan) is tested at the UI layer.
 */

import { describe, expect, it } from 'vitest';
import type { GrayBitmap } from '../../core/bitmapImport';
import { MAX_RASTER_MOVES, RASTER_PITCH_MM } from '../rasterEngrave';
import {
  DEFAULT_COLUMN_SPACING_MM,
  DEFAULT_WEDGE_BAND_MM,
  DEFAULT_WEDGE_MIN_POWER,
  grayPatches,
  gridToGray,
  planGreyscaleWedge,
  planInterlaceCoupon,
  solidBand,
  WEDGE_GRAY_REFS,
} from '../rasterCoupons';

describe('planInterlaceCoupon', () => {
  it('defaults: 0.1mm pitch, 0.8mm spacing, half-spacing margin, whole-pixel columns', () => {
    const plan = planInterlaceCoupon({ x: 40, y: 20 });
    // 40mm / 0.1mm → 400px, 20mm / 0.1mm → 200px
    expect(plan.grid).toEqual({ width: 400, height: 200 });
    expect(plan.pitch).toBe(RASTER_PITCH_MM); // 0.1
    // spacing snaps to 8px; margin is half that, 4px
    const first = 4;
    const last = 388; // 4 + 48·8 = 388 ≤ 400 − 1 − 4 = 395
    expect(plan.columns.length).toBe(49);
    expect(plan.columns[0]).toBe(first);
    expect(plan.columns[plan.columns.length - 1]).toBe(last);
    // uniform whole-pixel spacing
    for (let i = 1; i < plan.columns.length; i++) {
      expect(plan.columns[i] - plan.columns[i - 1]).toBe(8);
    }
    expect(plan.columns.every((x) => x >= 4 && x <= 395)).toBe(true);
    expect(plan.warnings).toEqual([]);
  });

  it('columns are single pixels running the FULL height when materialized', () => {
    const plan = planInterlaceCoupon({ x: 4, y: 4 }); // grid 40×40, 1px cols
    const gray = gridToGray(plan.grid, (x) => plan.columns.includes(x));
    expect(gray.width).toBe(40);
    expect(gray.height).toBe(40);
    // each fired column: one black pixel per row, its immediate neighbors white
    for (const col of plan.columns) {
      for (let y = 0; y < gray.height; y++) {
        expect(gray.data[y * gray.width + col]).toBe(0);
        expect(gray.data[y * gray.width + col - 1]).toBe(255);
        expect(gray.data[y * gray.width + col + 1]).toBe(255);
      }
    }
    const black = [...gray.data].filter((v) => v === 0).length;
    expect(black).toBe(gray.height * plan.columns.length);
  });

  it('custom pitch and spacing', () => {
    const plan = planInterlaceCoupon({ x: 30, y: 10 }, { pitch: 0.1, columnSpacing: 1.2 });
    expect(plan.grid).toEqual({ width: 300, height: 100 });
    expect(plan.columns.length).toBe(24); // 6 + 12k ≤ 293 → k ≤ 23
    expect(plan.columns[0]).toBe(6);
    expect(plan.columns[plan.columns.length - 1]).toBe(282);
    for (let i = 1; i < plan.columns.length; i++) {
      expect(plan.columns[i] - plan.columns[i - 1]).toBe(12);
    }
  });

  it('warns when the span fits fewer than 2 columns', () => {
    // grid 16×4; columns at 4 only (4 + 8 = 12 > 15 − 4 = 11)
    const plan = planInterlaceCoupon({ x: 1.6, y: 0.4 });
    expect(plan.columns).toEqual([4]);
    expect(plan.warnings.some((w) => w.includes('≥2 columns'))).toBe(true);
  });

  it('warns when the snapped spacing drops below 2px', () => {
    // 0.6mm / 0.5mm pitch → round(1.2) = 1px
    const plan = planInterlaceCoupon({ x: 5, y: 5 }, { pitch: 0.5, columnSpacing: 0.6 });
    expect(plan.warnings.some((w) => w.includes('under 2px'))).toBe(true);
    expect(plan.warnings.some((w) => w.includes('≥2 columns'))).toBe(false);
  });

  it('warns when a raster op would trip the MAX_RASTER_MOVES guard', () => {
    // 0.01mm pitch: grid 12000×10000, ~149 columns → 2·149·10000 > 10⁶
    const fine = planInterlaceCoupon({ x: 120, y: 100 }, { pitch: 0.01, columnSpacing: 0.8 });
    expect(fine.warnings.some((w) => w.includes(`${MAX_RASTER_MOVES} move guard`))).toBe(true);
    // the default coupon sits far under the guard
    const plain = planInterlaceCoupon({ x: 40, y: 20 });
    expect(plain.warnings.some((w) => w.includes('move guard'))).toBe(false);
  });

  it('defaults are the pinned constants', () => {
    expect(DEFAULT_COLUMN_SPACING_MM).toBe(0.8);
    expect(DEFAULT_WEDGE_MIN_POWER).toBe(0.05);
    expect(DEFAULT_WEDGE_BAND_MM).toBe(2);
  });

  it('is deterministic — same input, deep-equal plan', () => {
    expect(planInterlaceCoupon({ x: 40, y: 20 })).toEqual(planInterlaceCoupon({ x: 40, y: 20 }));
    expect(planInterlaceCoupon({ x: 30, y: 10 }, { pitch: 0.05, columnSpacing: 1 })).toEqual(
      planInterlaceCoupon({ x: 30, y: 10 }, { pitch: 0.05, columnSpacing: 1 }),
    );
  });
});

describe('planGreyscaleWedge', () => {
  it('default: 40mm span → 10 bands of 4mm, exact 0.05→1 linspace', () => {
    const plan = planGreyscaleWedge(40);
    expect(plan.bands.length).toBe(10); // floor(40/2)=20 fits, capped at 10
    expect(plan.bandHeight).toBe(4);
    const expected = Array.from(
      { length: 10 },
      (_, i) => (i === 9 ? 1 : DEFAULT_WEDGE_MIN_POWER + (0.95 * i) / 9),
    );
    expect(plan.bands).toEqual(expected);
    expect(plan.bands[0]).toBe(DEFAULT_WEDGE_MIN_POWER); // 0.05
    expect(plan.bands[plan.bands.length - 1]).toBe(1); // exact, no float dust
    expect(plan.warnings).toEqual([]);
  });

  it('mid span: 4 bands of 2.25mm at 9mm span, ladder exact', () => {
    // floor(9/2) = 4 → within 3..10, uncapped, unclamped
    const plan = planGreyscaleWedge(9);
    expect(plan.bands.length).toBe(4);
    expect(plan.bandHeight).toBe(9 / 4);
    expect(plan.bands).toEqual([
      0.05 + (0.95 * 0) / 3,
      0.05 + (0.95 * 1) / 3,
      0.05 + (0.95 * 2) / 3,
      1,
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it('custom bandHeight drives the count; returned height tiles the span', () => {
    const plan = planGreyscaleWedge(40, { bandHeight: 5 });
    expect(plan.bands.length).toBe(8); // floor(40/5) = 8
    expect(plan.bandHeight).toBe(5);
    expect(plan.bands[plan.bands.length - 1]).toBe(1);
    // rungs stay an exact linspace
    for (let i = 0; i < 7; i++) {
      expect(plan.bands[i]).toBeCloseTo(0.05 + (0.95 * i) / 7, 12);
    }
  });

  it('warns and squeezes to 3 bands when spanY is too small', () => {
    const plan = planGreyscaleWedge(8, { bandHeight: 5 }); // floor(8/5)=1
    expect(plan.bands.length).toBe(3);
    expect(plan.bandHeight).toBeCloseTo(8 / 3, 12);
    expect(plan.bands[plan.bands.length - 1]).toBe(1);
    expect(plan.warnings.some((w) => w.includes('too small for 3 bands'))).toBe(true);

    const defaulted = planGreyscaleWedge(5); // floor(5/2)=2 < 3 with the default target
    expect(defaulted.bands.length).toBe(3);
    expect(defaulted.warnings.some((w) => w.includes('too small for 3 bands'))).toBe(true);
  });

  it('warns on minPower ≥ maxPower: equal → flat ladder, inverted → read as swapped', () => {
    const flat = planGreyscaleWedge(20, { minPower: 0.5, maxPower: 0.5 });
    expect(flat.warnings.some((w) => w.includes('ladder is flat'))).toBe(true);
    expect(flat.bands.length).toBe(10);
    expect(flat.bands.every((b) => b === 0.5)).toBe(true);
    expect(flat.bands[flat.bands.length - 1]).toBe(0.5);

    const swapped = planGreyscaleWedge(20, { minPower: 0.7, maxPower: 0.3 });
    expect(swapped.warnings.some((w) => w.includes('read as swapped'))).toBe(true);
    expect(swapped.bands[0]).toBe(0.3);
    expect(swapped.bands[swapped.bands.length - 1]).toBe(0.7);
  });

  it('minPower/maxPower clamp into [0, 1]', () => {
    const plan = planGreyscaleWedge(20, { minPower: -0.2, maxPower: 1.5 });
    expect(plan.bands[0]).toBe(0);
    expect(plan.bands[plan.bands.length - 1]).toBe(1);
  });

  it('grayRefs are the FIXED [0.25, 0.5, 0.75] whatever the options', () => {
    expect(WEDGE_GRAY_REFS).toEqual([0.25, 0.5, 0.75]);
    for (const opts of [
      {},
      { minPower: 0.1, maxPower: 0.9 },
      { bandHeight: 5 },
      { minPower: 0.4, maxPower: 0.4 },
    ] as const) {
      expect(planGreyscaleWedge(20, opts).grayRefs).toEqual([0.25, 0.5, 0.75]);
    }
  });

  it('is deterministic — same input, deep-equal plan', () => {
    expect(planGreyscaleWedge(40)).toEqual(planGreyscaleWedge(40));
    expect(planGreyscaleWedge(17, { minPower: 0.02, bandHeight: 1.5 })).toEqual(
      planGreyscaleWedge(17, { minPower: 0.02, bandHeight: 1.5 }),
    );
  });
});

describe('coupon helpers', () => {
  it('solidBand: a solid black width×height strip', () => {
    const band = solidBand(8, 3);
    expect(band.width).toBe(8);
    expect(band.height).toBe(3);
    expect(band.data.length).toBe(24);
    expect([...band.data].every((v) => v === 0)).toBe(true);
  });

  it('grayPatches: equal thirds at the given grays, left→right', () => {
    const patches = grayPatches([0.25, 0.5, 0.75], 9, 2);
    expect(patches.width).toBe(9);
    expect(patches.height).toBe(2);
    // 0.25→64, 0.5→128, 0.75→191 (Math.round); thirds of 9px = 3px each
    expect([...patches.data]).toEqual([
      64, 64, 64, 128, 128, 128, 191, 191, 191, // row 0: cols [0,3) [3,6) [6,9)
      64, 64, 64, 128, 128, 128, 191, 191, 191, // row 1
    ]);
  });

  it('gridToGray: fired pixels black, everything else white, row-major', () => {
    const gray: GrayBitmap = gridToGray({ width: 4, height: 3 }, (x, y) => x === 1 && y < 2);
    expect(gray.width).toBe(4);
    expect(gray.height).toBe(3);
    expect([...gray.data]).toEqual([
      255, 0, 255, 255,
      255, 0, 255, 255,
      255, 255, 255, 255,
    ]);
  });

  it('gridToGray over an interlace plan reproduces exactly one black pixel per column per row', () => {
    const plan = planInterlaceCoupon({ x: 1.6, y: 0.4 }); // grid 16×4, columns [4]
    const gray = gridToGray(plan.grid, (x) => plan.columns.includes(x));
    expect(gray.data.length).toBe(64);
    for (let y = 0; y < 4; y++) {
      expect(gray.data[y * 16 + 4]).toBe(0);
      expect([...gray.data.slice(y * 16, y * 16 + 16)].filter((v) => v === 0).length).toBe(1);
    }
  });
});
