/**
 * Laser-calibration coupon planners — the raster analogue of testPattern.ts:
 * pure planning, warnings, numeric reads, and the UI materializes ordinary
 * ops/bitmazes from the plan (the plan is the record).
 *
 * Both planners take SPANS, not Stock — the UI maps a box face or a
 * cylinder unwrap to a {x, y} mm rectangle, so the same coupon works flat
 * and wrapped (4th-axis) alike.
 *
 * Two coupons (PLAN.md §"Laser raster engrave" piece 3 + greyscale phase 2):
 *
 * 1. INTERLACE — single-pixel columns burned full-height, serpentine AND
 *    one-way, on one stock. Read the column shift between the two sweeps
 *    with a loupe/camera → that offset is the `interlace` knob's value.
 *    What the knob will NOT fix (PLAN.md): run-START fade-in is a magnitude
 *    error — its lever is minPower or leadIn, never this offset.
 *
 * 2. GREYSCALE STEP-WEDGE — a power ladder burned per band, plus fixed
 *    25/50/75% dithered gray patches at the job power. The user matches
 *    burned bands to the patches per material; that pairing is the
 *    per-material power curve the phase-2 greyscale mode gates on.
 *    NO calibration data = NO greyscale mode shown (the v1 gate stands).
 */

import type { GrayBitmap } from '../core/bitmapImport';
import { MAX_RASTER_MOVES, RASTER_PITCH_MM } from './rasterEngrave';

// ------------------------------------------------------------ interlace

/** mm between column centers — Studio's serpentine interlace misaligns
 *  far less than a pixel, so the columns sit well apart to read it. */
export const DEFAULT_COLUMN_SPACING_MM = 0.8;

export interface InterlaceCouponPlan {
  /** the pixel grid at the coupon pitch (the bitmap the UI materializes) */
  grid: { width: number; height: number };
  /** pixel x of each fired column — single pixels, full height */
  columns: number[];
  /** mm — the same pitch the raster op defaults to */
  pitch: number;
  warnings: string[];
}

/**
 * Plan the interlace coupon grid: all white except single-pixel-wide
 * fired columns running the full height, spaced `columnSpacing` apart,
 * starting a half-spacing in from the left edge so neither the first nor
 * the last column sits at the bitmap edge (edge pixels read ambiguously).
 *
 * Column spacing snaps to WHOLE PIXELS at the pitch — the grid is pixels,
 * so the burned spacing is the snapped value. Pure; deterministic.
 */
export function planInterlaceCoupon(
  span: { x: number; y: number },
  opts?: {
    /** mm, default RASTER_PITCH_MM (0.1 — the raster default) */
    pitch?: number;
    /** mm between column centers, default 0.8 */
    columnSpacing?: number;
  },
): InterlaceCouponPlan {
  const pitch = opts?.pitch ?? RASTER_PITCH_MM;
  const columnSpacing = opts?.columnSpacing ?? DEFAULT_COLUMN_SPACING_MM;
  if (!(pitch > 0)) throw new Error('coupon pitch must be positive');
  if (!(columnSpacing > 0)) throw new Error('column spacing must be positive');
  if (!(span.x > 0) || !(span.y > 0)) throw new Error('coupon span must be positive');

  const warnings: string[] = [];
  // same resample rule rasterEngrave uses: round(face/pitch), floored at 1
  const width = Math.max(1, Math.round(span.x / pitch));
  const height = Math.max(1, Math.round(span.y / pitch));

  const spacingPx = Math.max(1, Math.round(columnSpacing / pitch));
  if (spacingPx < 2) {
    warnings.push(
      `column spacing is ${spacingPx}px at ${pitch}mm pitch — under 2px the columns blur together and the read is unreliable; widen columnSpacing or coarsen the pitch`,
    );
  }
  // a half-spacing margin keeps the first/last columns off the bitmap edge
  const marginPx = Math.round(spacingPx / 2);
  const lastStart = width - 1 - marginPx;
  const columns: number[] = [];
  for (let x = marginPx; x <= lastStart; x += spacingPx) columns.push(x);
  if (columns.length < 2) {
    warnings.push(
      `this span fits only ${columns.length} column at ${columnSpacing}mm spacing — the coupon needs ≥2 columns (one serpentine pass, one one-way) to show an offset; widen the span or reduce the spacing`,
    );
  }

  // move-guard probe: each row coalesces one 1px run per column, and the
  // emitter spends ~2 G1s per run (the fired S move + the S0 traversal).
  // MAX_RASTER_MOVES guards ONE op's move list; the pair of ops (serpentine /
  // one-way) doubles the burn but trips the guard per op, so the warning
  // keys on this single-op estimate.
  const estMovesPerOp = 2 * columns.length * height;
  if (estMovesPerOp > MAX_RASTER_MOVES) {
    warnings.push(
      `~${estMovesPerOp} G1 moves per raster op would trip the ${MAX_RASTER_MOVES} move guard — coarsen the coupon pitch`,
    );
  }

  return { grid: { width, height }, columns, pitch, warnings };
}

// ------------------------------------------------------------- step wedge

/** the dithered reference grays: fixed by design — the patches are what
 *  "25% gray" means regardless of material; the LADDER is what you tune. */
export const WEDGE_GRAY_REFS: readonly number[] = [0.25, 0.5, 0.75];

/** default ladder floor — diodes barely lase below ~5% (the raster
 *  minPower floor's default end) */
export const DEFAULT_WEDGE_MIN_POWER = 0.05;

/** the default target band height, mm — the smallest band you can still
 *  read/photograph cleanly; larger spans GROW the bands past this, they
 *  do not multiply bands (the testPattern MAX_DIVISIONS lesson) */
export const DEFAULT_WEDGE_BAND_MM = 2;

/** the useful band count cap — calibration beyond 10 steps of S is
 *  unreadable, and every extra band is another op on the job list */
export const MAX_WEDGE_BANDS = 10;
export const MIN_WEDGE_BANDS = 3;

export interface GreyscaleWedgePlan {
  /** constant-power S levels, ascending, minPower → maxPower inclusive */
  bands: number[];
  /** the FIXED dithered reference grays the patches burn at */
  grayRefs: number[];
  /** mm — bands tile the span exactly (count × bandHeight = spanY) */
  bandHeight: number;
  warnings: string[];
}

/**
 * Plan the step-wedge: a linspace of powers over `spanY`, one solid-black
 * band bitmap + one raster op per band level. Bands tile spanY exactly.
 *
 * `opts.bandHeight` (default DEFAULT_WEDGE_BAND_MM) is the TARGET band
 * height that drives the count, not the returned height: count =
 * clamp(floor(spanY / target), 3, 10), then bandHeight = spanY / count so
 * the bands tile the span with no sliver. minPower/maxPower clamp into
 * [0, 1] (the op layer enforces the same range). A minPower AT or ABOVE
 * maxPower warns — an equal pair burns a flat ladder, an inverted pair is
 * read as swapped (ascending, testPattern's friendlier-box precedent).
 * Pure; deterministic.
 */
export function planGreyscaleWedge(
  spanY: number,
  opts?: {
    /** the wedge's floor — default 0.05 (DEFAULT_WEDGE_MIN_POWER) */
    minPower?: number;
    /** default 1 */
    maxPower?: number;
    /** mm, default DEFAULT_WEDGE_BAND_MM, capped so bands ≤ MAX_WEDGE_BANDS */
    bandHeight?: number;
  },
): GreyscaleWedgePlan {
  if (!(spanY > 0)) throw new Error('wedge span must be positive');
  const target = opts?.bandHeight ?? DEFAULT_WEDGE_BAND_MM;
  if (!(target > 0)) throw new Error('band height must be positive');

  const warnings: string[] = [];
  const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
  let maxPower = clamp01(opts?.maxPower ?? 1);
  let minPower = clamp01(opts?.minPower ?? DEFAULT_WEDGE_MIN_POWER);
  if (minPower >= maxPower) {
    if (minPower > maxPower) {
      warnings.push(
        `minPower ${minPower} was above maxPower ${maxPower} — read as swapped; the ladder ascends ${maxPower} → ${minPower}`,
      );
      [minPower, maxPower] = [maxPower, minPower];
    } else {
      warnings.push(
        `minPower equals maxPower (${maxPower}) — the ladder is flat; every band burns at the same level`,
      );
    }
  }

  const count = Math.min(MAX_WEDGE_BANDS, Math.max(MIN_WEDGE_BANDS, Math.floor(spanY / target)));
  if (count === MIN_WEDGE_BANDS && Math.floor(spanY / target) < MIN_WEDGE_BANDS) {
    warnings.push(
      `spanY ${spanY}mm is too small for ${MIN_WEDGE_BANDS} bands at ${target}mm — the wedge squeezes to ${MIN_WEDGE_BANDS} bands of ${(spanY / MIN_WEDGE_BANDS).toFixed(2)}mm each; the read may be too coarse`,
    );
  }
  const bandHeight = spanY / count;

  const bands: number[] = [];
  for (let i = 0; i < count; i++) {
    bands.push(minPower + ((maxPower - minPower) * i) / (count - 1));
  }
  // exact maxPower on the last rung — float dust on the ladder's top end
  // must never make the "did it hit full power?" read ambiguous
  bands[count - 1] = maxPower;

  return { bands, grayRefs: [...WEDGE_GRAY_REFS], bandHeight, warnings };
}

// ---------------------------------------------------------------- helpers

/** Fired pixels burn BLACK (0 luma), everything else stays WHITE (255).
 *  Row-major, row 0 = image top (the GrayBitmap convention). */
export function gridToGray(
  grid: { width: number; height: number },
  fired: (x: number, y: number) => boolean,
): GrayBitmap {
  const data = new Uint8Array(grid.width * grid.height).fill(255);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (fired(x, y)) data[y * grid.width + x] = 0;
    }
  }
  return { width: grid.width, height: grid.height, data };
}

/** A solid BLACK width×height strip — the one op per wedge band burns this
 *  rectangle at its S level; the caller sizes it to the band's span. */
export function solidBand(width: number, height: number): GrayBitmap {
  if (!(width >= 1) || !(height >= 1)) throw new Error('band must be at least 1px');
  return { width, height, data: new Uint8Array(width * height) };
}

/** The reference gray patches: width split into grayRefs.length EQUAL
 *  slices left→right in the refs' order; slice i fills gray
 *  Math.round(255 · grayRefs[i]) (luma 0–255, black 0). The caller sizes
 *  width/height to the spans; 3 refs at a 9px width → columns [0,3), [3,6),
 *  [6,9). Burns at the JOB power (one op), never at a ladder level. */
export function grayPatches(grayRefs: readonly number[], width: number, height: number): GrayBitmap {
  if (!(width >= 1) || !(height >= 1)) throw new Error('patches must be at least 1px');
  if (grayRefs.length < 1) throw new Error('grayPatches needs at least one gray');
  const data = new Uint8Array(width * height);
  for (let i = 0; i < grayRefs.length; i++) {
    const level = Math.min(255, Math.max(0, Math.round(255 * grayRefs[i])));
    const x0 = Math.floor((i * width) / grayRefs.length);
    const x1 = Math.floor(((i + 1) * width) / grayRefs.length);
    for (let y = 0; y < height; y++) {
      for (let x = x0; x < x1; x++) data[y * width + x] = level;
    }
  }
  return { width, height, data };
}
