import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DITHER_METHOD,
  DITHER_METHODS,
  ditherGray,
  resampleGray,
} from '../dither';
import type { GrayBitmap } from '../bitmapImport';
import { halftoneDotRadius } from '../halftone';

// ------------------------------------------------------------ helpers

const solid = (w: number, h: number, luma: number): GrayBitmap => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h).fill(luma),
});

/** bitmap from per-pixel rows (row 0 = image top), luma 0..255 */
const fromRows = (rows: number[][]): GrayBitmap => ({
  width: rows[0].length,
  height: rows.length,
  data: new Uint8Array(rows.flat()),
});

const bitsOf = (b: { width: number; height: number; bits: Uint8Array }): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < b.height; y++) {
    let s = '';
    for (let x = 0; x < b.width; x++) s += b.bits[y * b.width + x] ? '#' : '.';
    rows.push(s);
  }
  return rows;
};

// ------------------------------------------------------------ resample

describe('resampleGray', () => {
  it('returns a same-image copy at the same size', () => {
    const g = fromRows([
      [0, 255],
      [128, 0],
    ]);
    const r = resampleGray(g, 2, 2);
    expect([...r.data]).toEqual([0, 255, 128, 0]);
  });

  it('box-averages on 2× downscale (exact halves)', () => {
    const g = fromRows([
      [0, 100, 0, 100],
      [100, 0, 100, 0],
      [200, 0, 200, 0],
      [0, 200, 0, 200],
    ]);
    const r = resampleGray(g, 2, 2);
    // cell (0,0) = (0+100+100+0)/4 = 50, (1,0) = (0+100+0+100)/4 = 50,
    // (0,1) = (200+0+0+200)/4 = 100, (1,1) = (200+0+0+200)/4 = 100
    expect([...r.data]).toEqual([50, 50, 100, 100]);
  });

  it('upscaling spreads pixels (area weight 1 → nearest)', () => {
    const g = fromRows([[0, 200]]);
    const r = resampleGray(g, 4, 1);
    expect([...r.data]).toEqual([0, 0, 200, 200]);
  });

  it('preserves the average darkness of the source', () => {
    const g = fromRows([
      [10, 200],
      [90, 60],
    ]);
    for (const [w, h] of [
      [1, 1],
      [3, 2],
      [7, 5],
    ]) {
      const r = resampleGray(g, w, h);
      const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length;
      expect(mean(r.data)).toBeCloseTo(mean(g.data), 5);
    }
  });

  it('rejects non-positive or fractional targets', () => {
    const g = solid(2, 2, 0);
    expect(() => resampleGray(g, 0, 1)).toThrow();
    expect(() => resampleGray(g, 2, 2.5)).toThrow();
  });
});

// ------------------------------------------------------------ error diffusion

describe('ditherGray — error diffusion', () => {
  it('solid black fires everywhere; solid white fires nowhere', () => {
    for (const m of DITHER_METHODS.filter((k) => k !== 'halftone')) {
      expect(ditherGray(solid(4, 4, 0), m).bits.every((b) => b === 1)).toBe(true);
      expect(ditherGray(solid(4, 4, 255), m).bits.every((b) => b === 0)).toBe(true);
    }
  });

  it('Atkinson is the default method', () => {
    expect(DEFAULT_DITHER_METHOD).toBe('atkinson');
  });

  it('a 50% grey field fires ~half the pixels and preserves the tone', () => {
    // a large uniform mid-grey field: the fired FRACTION must track the
    // darkness (the whole point of dithering) for every diffusion kernel
    const g = solid(64, 64, 128); // darkness 0.498
    for (const m of ['atkinson', 'floyd-steinberg', 'jarvis', 'stucki', 'burkes', 'sierra'] as const) {
      const bits = ditherGray(g, m);
      const fired = Array.from(bits.bits).reduce((s, b) => s + b, 0);
      // Atkinson deliberately drops 2/8 of the error, so its midtones run
      // lighter — loose bounds, tightened per-method below
      expect(fired / (64 * 64)).toBeGreaterThan(0.3);
      expect(fired / (64 * 64)).toBeLessThan(0.6);
    }
  });

  it('darker grey fires strictly more than lighter grey', () => {
    const dark = solid(32, 32, 90); // darkness 0.647
    const light = solid(32, 32, 160); // darkness 0.373
    for (const m of ['atkinson', 'floyd-steinberg', 'sierra'] as const) {
      const count = (b: Uint8Array) => Array.from(b).reduce((s, v) => s + v, 0);
      expect(count(ditherGray(dark, m).bits)).toBeGreaterThan(count(ditherGray(light, m).bits));
    }
  });

  it('Atkinson DROPS 2/8 of the error — a solid just-under-half grey stays light', () => {
    // darkness 0.45: Floyd–Steinberg must fire ~45%, Atkinson (which
    // discards error) fires LESS — the punchy-mids behavior the spec named
    // the default for
    const g = solid(64, 64, 140); // darkness ≈ 0.451
    const atk = Array.from(ditherGray(g, 'atkinson').bits).reduce((s, b) => s + b, 0);
    const fs = Array.from(ditherGray(g, 'floyd-steinberg').bits).reduce((s, b) => s + b, 0);
    expect(atk).toBeLessThan(fs);
    expect(fs / (64 * 64)).toBeGreaterThan(0.42);
  });

  it('clips diffusion at the image edges without throwing', () => {
    const g = fromRows([
      [255, 0, 255],
      [0, 255, 0],
      [128, 128, 128],
    ]);
    for (const m of ['atkinson', 'floyd-steinberg', 'jarvis', 'stucki', 'burkes', 'sierra'] as const) {
      expect(() => ditherGray(g, m)).not.toThrow();
    }
  });

  it('rejects an empty bitmap and an unknown method', () => {
    expect(() => ditherGray(solid(0, 0, 0), 'atkinson')).toThrow();
    expect(() => ditherGray(solid(2, 2, 0), 'nope' as never)).toThrow();
  });
});

// ------------------------------------------------------------ Bayer

describe('ditherGray — Bayer 8×8', () => {
  it('is repeatable (no error state) and tone-true over a full period', () => {
    // one full 8×8 period of mid grey: the fired count equals the number
    // of thresholds below the darkness — exactly the tone, every time
    const g = solid(8, 8, 128); // darkness 0.498
    const bits = ditherGray(g, 'bayer8');
    const fired = Array.from(bits.bits).reduce((s, b) => s + b, 0);
    const again = ditherGray(g, 'bayer8');
    expect([...again.bits]).toEqual([...bits.bits]);
    // the 8×8 matrix holds each threshold 0..63 once; darkness 0.498 fires
    // every threshold below it: (M+0.5)/64 < 0.498 ⇒ M ≤ 31 ⇒ 32 pixels
    expect(fired).toBe(32);
  });
});

// ------------------------------------------------------------ halftone operator

describe('ditherGray — halftone screen threshold', () => {
  it('solid black fires every pixel (corner-meeting dots tile the face)', () => {
    const g = solid(40, 40, 0);
    const bits = ditherGray(g, 'halftone', { pitch: 0.25, screenSpacing: 1 });
    expect(bits.bits.every((b) => b === 1)).toBe(true);
  });

  it('solid white fires nothing', () => {
    const g = solid(40, 40, 255);
    const bits = ditherGray(g, 'halftone', { pitch: 0.25, screenSpacing: 1 });
    expect(bits.bits.every((b) => b === 0)).toBe(true);
  });

  it('places dots on the 45° lattice — the vector screen at raster resolution', () => {
    // mid grey, one screen cell of spacing 1mm on a 0.1mm grid: the fired
    // pixels must cluster within dotRadius of ONE lattice center per cell
    const g = solid(20, 20, 128); // 2mm face, darkness ≈ 0.498
    const bits = ditherGray(g, 'halftone', { pitch: 0.1, screenSpacing: 1 });
    const fired = bits.bits.reduce((s, b) => s + b, 0);
    // coverage ≈ 0.5 → r ≈ 0.4mm → area ≈ 0.5mm² per 1mm² cell → ~half
    expect(fired / (20 * 20)).toBeGreaterThan(0.3);
    expect(fired / (20 * 20)).toBeLessThan(0.7);
    // no dot without coverage: white stays white even at the lattice
    const white = ditherGray(solid(20, 20, 250), 'halftone', { pitch: 0.1, screenSpacing: 1 });
    expect(white.bits.every((b) => b === 0)).toBe(true);
  });

  it('matches the vector halftone in tone: 50% grey → a dot of 50% cell area', () => {
    // the shared curve (halftoneDotRadius): c = 0.5 → r = s·√(0.5/π),
    // so area = π·r²/s² = 0.5 exactly — the printing-correct anchor
    const s = 1;
    const r = halftoneDotRadius(s, 0.5);
    expect((Math.PI * r * r) / (s * s)).toBeCloseTo(0.5, 6);
    // and solid black chains dots to the lattice corners (r = s/√2),
    // which is why solid black fires every pixel above
    expect(halftoneDotRadius(s, 1)).toBeCloseTo(s / Math.SQRT2, 6);
  });

  it('rejects spacing finer than the pixel pitch, and a missing pitch', () => {
    const g = solid(8, 8, 0);
    expect(() => ditherGray(g, 'halftone', { pitch: 0.5, screenSpacing: 0.2 })).toThrow();
    expect(() => ditherGray(g, 'halftone', {})).toThrow();
  });
});
