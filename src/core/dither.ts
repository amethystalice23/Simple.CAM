/**
 * 1-bit dithering for the laser raster engrave (docs/PLAN.md "Laser raster
 * engrave", SPEC 2026-11-23). The ARTWORK stays grayscale (the 'bitmap'
 * primitive carries the GrayBitmap untouched); the METHOD is applied at the
 * OP because dithering is material-dependent intent — this module is the
 * op-side operator.
 *
 * All algorithms are published, DESCRIBED-ONLY implementations (the license
 * policy: never read or copy GPL source — Photoshop/GIMP plugin code is off
 * limits; these kernels are textbook).
 *
 * Error diffusion (serpentine within a ROW is not done — rows are one
 * direction here; the OP's serpentine sweep is a toolpath matter, not a
 * dithering one): the pixel's dark value plus accumulated diffused error is
 * thresholded at 0.5; the quantization error diffuses to unvisited
 * neighbors by the kernel weights. Atkinson (DEFAULT — punchy mids, 6/8 of
 * the error spreads, 2/8 is dropped), Floyd–Steinberg, Jarvis-Judice-Ninke,
 * Stucki, Burkes, Sierra.
 *
 * Ordered: Bayer 8×8 — no error propagation (no dot gain), repeatable,
 * patterned (the screen door look; its strength).
 *
 * Halftone screen as a threshold operator: halftone.ts's coverage→radius
 * curve REUSED for dot PLACEMENT (which pixels fire), not dot shape (the
 * circle-vector emission is the mill case and stays). A square lattice at
 * 45° (the classic monochrome screen angle — off-axis from the raster rows
 * so dots don't column up with the sweep) covers the face; each cell's dark
 * coverage sizes a disc by the same curve, and pixels inside the disc fire.
 * The result reads like the vector halftone at raster resolution.
 */

import type { GrayBitmap } from './bitmapImport';
import { halftoneDotRadius } from './halftone';

export type DitherMethod =
  | 'atkinson'
  | 'floyd-steinberg'
  | 'jarvis'
  | 'stucki'
  | 'burkes'
  | 'sierra'
  | 'bayer8'
  | 'halftone';

export const DITHER_METHODS: DitherMethod[] = [
  'atkinson',
  'floyd-steinberg',
  'jarvis',
  'stucki',
  'burkes',
  'sierra',
  'bayer8',
  'halftone',
];

/** the SPEC default for photos: Atkinson's dropped 2/8 error keeps midtones
 *  punchy — the reason it's the classic photo laser setting */
export const DEFAULT_DITHER_METHOD: DitherMethod = 'atkinson';

/** 1-bit result: 1 = fire (dark), row-major, row 0 = image TOP (same
 * orientation as GrayBitmap) */
export interface BitBitmap {
  width: number;
  height: number;
  bits: Uint8Array;
}

/** one error-diffusion kernel tap: push `weight/divisor` of the error to
 *  (x+dx, y+dy) — dy ≥ 0, and dy = 0 taps must have dx > 0 (unvisited) */
interface Kernel {
  divisor: number;
  taps: [dx: number, dy: number, weight: number][];
}

const KERNELS: Record<string, Kernel> = {
  //        X  1/8 1/8
  //     1/8 1/8 1/8
  //         1/8            — 6 taps of 1/8; the remaining 2/8 is DROPPED
  atkinson: {
    divisor: 8,
    taps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  //        X  7
  //     3  5  1        — ÷16
  'floyd-steinberg': {
    divisor: 16,
    taps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  //        X  7  5
  //     3  5  7  5  3
  //     1  3  5  3  1  — ÷48
  jarvis: {
    divisor: 48,
    taps: [
      [1, 0, 7],
      [2, 0, 5],
      [-2, 1, 3],
      [-1, 1, 5],
      [0, 1, 7],
      [1, 1, 5],
      [2, 1, 3],
      [-2, 2, 1],
      [-1, 2, 3],
      [0, 2, 5],
      [1, 2, 3],
      [2, 2, 1],
    ],
  },
  //        X  8  4
  //     2  4  8  4  2
  //     1  2  4  2  1  — ÷40
  stucki: {
    divisor: 40,
    taps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
      [-2, 2, 1],
      [-1, 2, 2],
      [0, 2, 4],
      [1, 2, 2],
      [2, 2, 1],
    ],
  },
  //        X  8  4
  //     2  4  8  4  2  — ÷32
  burkes: {
    divisor: 32,
    taps: [
      [1, 0, 8],
      [2, 0, 4],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 8],
      [1, 1, 4],
      [2, 1, 2],
    ],
  },
  //        X  5  3
  //     2  4  5  4  2
  //        2  3  2     — ÷32
  sierra: {
    divisor: 32,
    taps: [
      [1, 0, 5],
      [2, 0, 3],
      [-2, 1, 2],
      [-1, 1, 4],
      [0, 1, 5],
      [1, 1, 4],
      [2, 1, 2],
      [-1, 2, 2],
      [0, 2, 3],
      [1, 2, 2],
    ],
  },
};

/** the standard 8×8 Bayer threshold matrix (recursive construction) */
const BAYER8: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export interface DitherOptions {
  /** halftone method only: screen cell size, mm in FACE space (default 0.5) */
  screenSpacing?: number;
  /** halftone method only: coverage below which a cell emits no dot
   *  (default 0.04 — halftone.ts's floor) */
  minCoverage?: number;
  /** halftone method only: mm per PIXEL of the (resampled) grid — the
   *  operator is geometric, so it needs the pixel size; required for
   *  'halftone' */
  pitch?: number;
}

/**
 * Dither a grayscale bitmap to 1-bit fire/no-fire pixels. Error diffusion
 * and Bayer operate per pixel; the halftone operator is geometric (see
 * module header) and requires `pitch`. Neighbors outside the image simply
 * don't receive error (diffusion is clipped at the edges — standard).
 */
export function ditherGray(
  gray: GrayBitmap,
  method: DitherMethod,
  opts: DitherOptions = {},
): BitBitmap {
  const { width: w, height: h } = gray;
  if (w === 0 || h === 0) throw new Error('empty bitmap');
  const dark = new Float32Array(w * h);
  for (let p = 0; p < dark.length; p++) dark[p] = 1 - gray.data[p] / 255;

  if (method === 'halftone') {
    const pitch = opts.pitch;
    if (pitch === undefined || pitch <= 0) {
      throw new Error('halftone dithering needs the pixel pitch (mm per pixel)');
    }
    return halftoneThreshold(dark, w, h, pitch, opts);
  }

  const bits = new Uint8Array(w * h);

  if (method === 'bayer8') {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = (BAYER8[y & 7][x & 7] + 0.5) / 64;
        if (dark[y * w + x] > t) bits[y * w + x] = 1;
      }
    }
    return { width: w, height: h, bits };
  }

  const kernel = KERNELS[method];
  if (!kernel) throw new Error(`unknown dither method: ${method}`);
  const err = new Float32Array(w * h); // accumulated diffused error
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const v = dark[p] + err[p];
      const fired = v >= 0.5 ? 1 : 0;
      bits[p] = fired;
      const e = v - fired; // −0.5..0.5
      if (e === 0) continue;
      for (const [dx, dy, wt] of kernel.taps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue; // clipped at the edges
        err[ny * w + nx] += (e * wt) / kernel.divisor;
      }
    }
  }
  return { width: w, height: h, bits };
}

/**
 * The halftone screen as a threshold operator: a 45° square lattice of
 * `spacing`-mm cells covers the face; each cell's dark coverage (average of
 * the pixels mapping to it) sizes a disc by halftone.ts's curve, and every
 * pixel inside the disc fires. Dot PLACEMENT only — the vector dot emission
 * (halftoneArtwork) is the mill case and stays.
 */
function halftoneThreshold(
  dark: Float32Array,
  w: number,
  h: number,
  pitch: number,
  opts: DitherOptions,
): BitBitmap {
  const spacing = opts.screenSpacing ?? 0.5;
  const floor = opts.minCoverage ?? 0.04;
  if (spacing <= 0) throw new Error('screen spacing must be positive');
  if (spacing < pitch) {
    throw new Error('screen spacing is finer than the pixel pitch — raise it');
  }

  // face-space pixel centers, face origin (0,0) at image BOTTOM-left (row 0
  // is the TOP): x = (i+0.5)·pitch, y = (h−1−j+0.5)·pitch
  const fw = w * pitch;
  const fh = h * pitch;
  const c = Math.SQRT1_2; // cos/sin of 45°
  const cosA = c;
  const sinA = c;

  /** pixel index → its lattice cell (i, j), packed; nearest center in the
   *  rotated frame == the rotated square cell containing it */
  const cellOf = new Int32Array(w * h);
  const sums = new Map<number, { sum: number; count: number }>();
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const px = (i + 0.5) * pitch - fw / 2;
      const py = (h - 1 - j + 0.5) * pitch - fh / 2;
      // rotate by −45° about the face center, then snap to the lattice
      const lx = (px * cosA + py * sinA) / spacing;
      const ly = (-px * sinA + py * cosA) / spacing;
      // injective integer pair key (lj recovered by subtraction, so no
      // sign/modulo traps); |lj| < 2^19 covers any sane face/spacing
      const cell = Math.round(lx) * 1048576 + Math.round(ly);
      cellOf[j * w + i] = cell;
      let acc = sums.get(cell);
      if (!acc) {
        acc = { sum: 0, count: 0 };
        sums.set(cell, acc);
      }
      acc.sum += dark[j * w + i];
      acc.count += 1;
    }
  }

  // cell center (mm, face frame) for the fire test
  const centerX = new Map<number, number>();
  const centerY = new Map<number, number>();
  for (const cell of sums.keys()) {
    const li = Math.round(cell / 1048576); // trunc would break negative li
    const lj = cell - li * 1048576;
    const lx = li * spacing;
    const ly = lj * spacing;
    // rotate +45° back to face space
    centerX.set(cell, lx * cosA - ly * sinA + fw / 2);
    centerY.set(cell, lx * sinA + ly * cosA + fh / 2);
  }

  const bits = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      const cell = cellOf[p];
      const acc = sums.get(cell)!;
      const coverage = acc.sum / acc.count;
      if (coverage < floor) continue;
      const r = halftoneDotRadius(spacing, coverage);
      const dx = (i + 0.5) * pitch - centerX.get(cell)!;
      const dy = (h - 1 - j + 0.5) * pitch - centerY.get(cell)!;
      if (Math.hypot(dx, dy) <= r) bits[p] = 1;
    }
  }
  return { width: w, height: h, bits };
}

/**
 * Area-weighted resample of a grayscale bitmap to an exact target size
 * (the raster op's pixel-pitch step): each SOURCE pixel contributes its
 * luma to every target cell it overlaps, weighted by overlap area — the
 * correct box filter for downscaling, and area weight 1 on upscale means
 * nearest-neighbor (upscaling adds no detail; it only spreads pixels).
 */
export function resampleGray(gray: GrayBitmap, width: number, height: number): GrayBitmap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('resample target must be positive integers');
  }
  // SOURCE pixels per TARGET cell (downscale > 1, upscale < 1); a source
  // pixel spans TARGET-CELL coords [i/sx, (i+1)/sx) — note the DIVISION:
  // sx is the target-cell size in source pixels
  const sx = gray.width / width;
  const sy = gray.height / height;
  const sums = new Float64Array(width * height);
  const weights = new Float64Array(width * height);
  for (let j = 0; j < gray.height; j++) {
    const y0 = j / sy;
    const y1 = (j + 1) / sy;
    const tj0 = Math.floor(y0);
    const tj1 = Math.min(height, Math.ceil(y1));
    for (let i = 0; i < gray.width; i++) {
      const x0 = i / sx;
      const x1 = (i + 1) / sx;
      const ti0 = Math.floor(x0);
      const ti1 = Math.min(width, Math.ceil(x1));
      const v = gray.data[j * gray.width + i];
      for (let tj = tj0; tj < tj1; tj++) {
        const oy = Math.min(y1, tj + 1) - Math.max(y0, tj);
        if (oy <= 0) continue;
        for (let ti = ti0; ti < ti1; ti++) {
          const ox = Math.min(x1, ti + 1) - Math.max(x0, ti);
          if (ox <= 0) continue;
          const a = ox * oy;
          sums[tj * width + ti] += v * a;
          weights[tj * width + ti] += a;
        }
      }
    }
  }
  const out = new Uint8Array(width * height);
  for (let p = 0; p < out.length; p++) {
    const wt = weights[p];
    out[p] = wt > 0 ? Math.round(sums[p] / wt) : 0;
  }
  return { width, height, data: out };
}
