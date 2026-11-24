import { describe, expect, it } from 'vitest';
import { rasterEngrave, MAX_RASTER_MOVES } from '../rasterEngrave';
import { ROTARY_FEED_DEG_MIN } from '../faceCylinder';
import type { GrayBitmap } from '../../core/bitmapImport';

// ------------------------------------------------------------ helpers

const solid = (w: number, h: number, luma: number): GrayBitmap => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h).fill(luma),
});

/** 2-px-per-cell checkerboard — every pixel alternates, the worst case
 *  for run coalescing (each run is exactly one pixel) */
const checker = (w: number, h: number): GrayBitmap => {
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) d[y * w + x] = (x + y) % 2 === 0 ? 0 : 255;
  return { width: w, height: h, data: d };
};

/** left half black, right half white — one run per row on the left half */
const halfBlack = (w: number, h: number): GrayBitmap => {
  const d = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) d[y * w + x] = 0;
  return { width: w, height: h, data: d };
};

const BASE = {
  toolId: 't',
  bitmap: solid(4, 4, 0),
  face: { width: 4, height: 4 },
  origin: { x: 0, y: 0 },
  surfaceZ: 10,
  pitch: 1,
  feed: 1000,
  focus: 1,
  power: 0.3,
  method: 'bayer8' as const,
};

/** a compact move render for assertions: "R" = rapid, "S0.3 x5" = G1 at
 *  power 0.3 to x=5, "y" marks a Y word, "∅" a wordless (bare S) move */
const render = (moves: ReturnType<typeof rasterEngrave>['moves']): string[] =>
  moves.map((m) => {
    const w = m.words as { x?: number; y?: number; z?: number };
    const axes = [
      w.x !== undefined ? `x${w.x}` : '',
      w.y !== undefined ? `y${w.y}` : '',
      w.z !== undefined ? `z${w.z}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const tag = m.rapid ? 'R' : `S${m.power ?? '-'}`;
    return `${tag} ${axes || '∅'}`.trim();
  });

// ------------------------------------------------------------ shape

describe('rasterEngrave — emission shape (mirrors the dialect)', () => {
  it('solid black face: one fired run per row, constant velocity, no mid-raster rapids', () => {
    // 4×4 face at 1mm pitch, solid black: every row is ONE run spanning
    // the face — each row is a single lit G1 edge to edge
    const r = rasterEngrave({ ...BASE, bitmap: solid(4, 4, 0) });
    // moves: G0 position, G0 Z, then per row 1 lit G1 (+corner move),
    // final extinguish. Rows 0..2 fold Y into the lit... no: the last
    // span of every row is LIT here, so each row = lit span + pure-Y
    // corner move; the last row = lit span only, + extinguish.
    expect(r.moves[0]).toMatchObject({ rapid: true, words: { x: 0, y: 0.5 } }); // row 0 at its pixel CENTER
    expect(r.moves[1]).toMatchObject({ rapid: true, words: { z: 11 }, comment: 'laser focus height' });
    const body = render(r.moves.slice(2));
    expect(body[0]).toBe('S0.3 x4'); // row 0: one full-face lit run
    expect(body[1]).toBe('S0 y1.5'); // corner move (beam-off) — row 1's center
    expect(body.length).toBe(4 * 2 - 1 + 1); // 3 corner rows + last row + extinguish
    expect(body[body.length - 1]).toBe('S0 ∅');
    // zero rapids after the opening pair
    expect(r.moves.slice(2).every((m) => !m.rapid)).toBe(true);
  });

  it('beam-off spans travel at raster feed as G1 S0 (the pen-up)', () => {
    const r = rasterEngrave({ ...BASE, bitmap: halfBlack(4, 4) });
    // every row: gap (S0) to x2, lit run (S0.3) x2→…? left half black:
    // pixels 0,1 black → burn [0,2); run then gap to far edge
    const g1 = r.moves.filter((m) => !m.rapid);
    expect(g1.every((m) => m.feed === 1000)).toBe(true);
    const powers = g1.map((m) => m.power);
    expect(powers).toContain(0);
    expect(powers).toContain(0.3);
    // S alternates: no two consecutive equal powers in the traversal
    // (the post is modal; run boundaries flip)
    for (let i = 1; i < powers.length - 1; i++) {
      if (powers[i] === powers[i - 1]) {
        // allowed only for the corner/fold moves that also carry Y, or
        // the final extinguish — checked structurally below
      }
    }
  });

  it('runs coalesce: half-black rows are 2 spans each, not one per pixel', () => {
    const r = rasterEngrave({ ...BASE, bitmap: halfBlack(4, 4) });
    // every row is ONE lit run + ONE gap (folded or corner) — 8 X moves
    // across 4 rows, 4 of them lit — never one-per-pixel
    const xMoves = r.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    const lit = xMoves.filter((m) => m.power === 0.3);
    expect(xMoves.length).toBe(8);
    expect(lit.length).toBe(4);
  });

  it('checkerboard: one run per pixel — the move count matches pixels + rows', () => {
    const r = rasterEngrave({ ...BASE, bitmap: checker(4, 4) });
    // 4 rows × 4 px: per row 4 lit runs + gaps → ~8 X moves + corners
    const xMoves = r.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(xMoves.length).toBeGreaterThanOrEqual(16); // 4 runs per row
    expect(xMoves.length).toBeLessThanOrEqual(24); // plus up to 2 gaps per row
  });

  it('serpentine rows alternate direction; turns land at the face edges', () => {
    const r = rasterEngrave({ ...BASE, bitmap: halfBlack(8, 3), face: { width: 8, height: 3 } });
    // row 0 (+X): lit 0→4, folded gap 4→8 · row 1 (−X): gap 8→4, lit
    // 4→0, corner pure-Y · row 2 (+X): lit 0→4, gap 4→8
    const xs = r.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => (m.words as { x: number }).x);
    expect(xs.map((x) => Math.round(x * 1e6) / 1e6)).toEqual([4, 8, 4, 0, 4, 8]);
  });

  it('folds the row step into a beam-off final span (dialect form)', () => {
    const r = rasterEngrave({ ...BASE, bitmap: halfBlack(4, 4) });
    // forward rows end with a white gap → the last X move carries BOTH
    // x and y (the fold, `G1 X51.5 Y47.3 S0.0` form)
    const folded = r.moves.filter(
      (m) => !m.rapid && m.words.x !== undefined && m.words.y !== undefined,
    );
    expect(folded.length).toBe(2); // rows 0 and 2
    // reverse rows end LIT (the left-half run ends at the near edge) →
    // the row step is the dialect's pure-Y beam-off corner move
    const pureY = r.moves.filter(
      (m) => !m.rapid && m.words.x === undefined && m.words.y !== undefined,
    );
    expect(pureY.length).toBe(1); // row 1 (row 3 is last: no next row)
    expect(pureY[0].power).toBe(0);
  });

  it('closes with a bare extinguish move (the dialect G1 S0)', () => {
    const r = rasterEngrave({ ...BASE });
    const last = r.moves[r.moves.length - 1];
    expect(last.words).toEqual({});
    expect(last.power).toBe(0);
    expect(last.rapid).toBeFalsy();
  });

  it('rows sit at pixel-row CENTERS — symmetric face coverage (2026-11-24 ruling)', () => {
    // the probe-measured diagnosis: rows at pixel edges left the face's
    // bottom edge unburned (15.15 of 16mm at 1mm pitch). The X runs
    // traverse their whole span, but the Y step has no traversal — the
    // burn line must CENTER its pixel row: (j + 0.5)·py.
    const r = rasterEngrave({ ...BASE, bitmap: solid(4, 4, 0) });
    const ys = r.moves
      .filter((m) => m.words.y !== undefined)
      .map((m) => (m.words as { y: number }).y);
    expect(ys).toEqual([0.5, 1.5, 2.5, 3.5]); // positioning + 3 corners
  });
});

// ------------------------------------------------------------ knobs

describe('rasterEngrave — knobs', () => {
  it('one-way sweep: returns are G0 rapids, rows all run +X', () => {
    const r = rasterEngrave({
      ...BASE,
      bitmap: halfBlack(6, 3),
      face: { width: 6, height: 3 },
      sweep: 'one-way',
    });
    const rapids = r.moves.filter((m) => m.rapid);
    // opening position + Z + one return rapid per row transition
    expect(rapids.length).toBe(2 + 2);
    const returns = rapids.slice(2);
    for (const m of returns) {
      expect((m.words as { x: number }).x).toBe(0); // back to the near edge
      expect(m.power).toBeUndefined(); // G0 never fires
    }
    // every traversal G1 increases x monotonically within a row: the
    // max X overall is the far edge
    const xs = r.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => (m.words as { x: number }).x);
    expect(Math.max(...xs)).toBeCloseTo(6);
  });

  it('interlace shifts reverse-row fired runs only, by the signed mm', () => {
    const face = { width: 6, height: 2 };
    const args = { ...BASE, bitmap: halfBlack(6, 2), face };
    const plain = rasterEngrave(args);
    const comp = rasterEngrave({ ...args, interlace: 0.5 });
    // traversal X moves, plain: row0 lit→3, fold→6 · row1 gap→3, lit→0
    const xs = (r: typeof plain) =>
      r.moves
        .filter((m) => !m.rapid && m.words.x !== undefined)
        .map((m) => (m.words as { x: number }).x);
    const a = xs(plain);
    const b = xs(comp);
    expect(a.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([3, 6, 3, 0]);
    // row 0 unchanged; row 1's fired run shifts +0.5mm (both ends)
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
    expect(b[2]).toBeCloseTo(a[2] + 0.5); // the gap now ends at the shifted entry
    expect(b[3]).toBeCloseTo(a[3] + 0.5); // the lit exit
  });

  it('minPower floors the fired level (the diode lasing floor)', () => {
    const r = rasterEngrave({ ...BASE, power: 0.05, minPower: 0.15 });
    const lit = r.moves.find((m) => m.power !== undefined && m.power > 0);
    expect(lit?.power).toBe(0.15);
  });

  it('leadIn extends the leading edge backward and may close a gap', () => {
    // two black stripes with a 2px white gap: a 2mm lead closes it fully
    const d = new Uint8Array(8 * 1).fill(255);
    for (const x of [0, 1, 4, 5]) d[x] = 0;
    const bmp = { width: 8, height: 1, data: d };
    const plain = rasterEngrave({ ...BASE, bitmap: bmp, face: { width: 8, height: 1 } });
    const led = rasterEngrave({
      ...BASE,
      bitmap: bmp,
      face: { width: 8, height: 1 },
      leadIn: 2,
    });
    // plain: two fired runs; led: merged into one
    expect(plain.firedRuns).toBe(2);
    expect(led.firedRuns).toBe(1);
    const lit = led.moves.filter((m) => m.power === 0.3);
    expect(lit.length).toBe(1);
    expect((lit[0].words as { x: number }).x).toBeCloseTo(6); // burns [0,6)
  });

  it('pitch resamples: a finer pitch grows the grid, moves stay bounded', () => {
    const face = { width: 8, height: 8 };
    const coarse = rasterEngrave({ ...BASE, bitmap: halfBlack(8, 8), pitch: 2, face });
    const fine = rasterEngrave({ ...BASE, bitmap: halfBlack(8, 8), pitch: 0.5, face });
    expect(coarse.grid).toEqual({ width: 4, height: 4 });
    expect(fine.grid).toEqual({ width: 16, height: 16 });
    expect(fine.moves.length).toBeLessThan(MAX_RASTER_MOVES);
  });

  it('the halftone method runs through the geometric operator', () => {
    const r = rasterEngrave({
      ...BASE,
      bitmap: solid(8, 8, 128),
      method: 'halftone',
      screenSpacing: 2,
      pitch: 0.5,
      face: { width: 4, height: 4 },
    });
    expect(r.firedPixels).toBeGreaterThan(0);
    expect(r.firedPixels).toBeLessThan(16 * 16);
  });
});

// ------------------------------------------------------------ guards + time

describe('rasterEngrave — guards and time estimate', () => {
  it('rejects nothing-dark images, bad power/focus/feed/pitch', () => {
    expect(() => rasterEngrave({ ...BASE, bitmap: solid(4, 4, 255) })).toThrow(/nothing dark/);
    expect(() => rasterEngrave({ ...BASE, power: 0 })).toThrow();
    expect(() => rasterEngrave({ ...BASE, power: 1.5 })).toThrow();
    expect(() => rasterEngrave({ ...BASE, focus: -1 })).toThrow();
    expect(() => rasterEngrave({ ...BASE, feed: 0 })).toThrow();
    expect(() => rasterEngrave({ ...BASE, pitch: 0 })).toThrow();
  });

  it('estimates minutes from the constant-velocity traversal', () => {
    // solid black 4×4mm face at feed 1000 mm/min: every row traverses
    // 4mm of lit run + 1mm row step (corner), 4 rows → 16 + 3 = 19mm
    const r = rasterEngrave({ ...BASE });
    expect(r.estimatedMinutes).toBeCloseTo(19 / 1000, 5);
  });

  it('reports the fired counts for the op summary', () => {
    const r = rasterEngrave({ ...BASE, bitmap: halfBlack(4, 4) });
    expect(r.firedPixels).toBe(8); // 2 px per row × 4 rows
    expect(r.firedRuns).toBe(4);
  });
});

// ------------------------------------------------- wrapped (4th axis)

describe('rasterEngrave — wrapped (4th-axis frame)', () => {
  /** radius whose degPerMm is exactly 1: R = 180/π → circumference 360 */
  const R1 = 180 / Math.PI;
  const FRAME1 = { kind: 'wrapped' as const, radius: R1, startA: 0, datumAngle: 90 };
  const degPerMm1 = 180 / (Math.PI * R1); // = 1 (to float precision)
  /** 4×4 solid black, wrapped: rows step 1° of arc each */
  const solidWrapped = { ...BASE, frame: FRAME1 };

  const aMoves = (r: ReturnType<typeof rasterEngrave>) =>
    r.moves.filter((m) => m.words.a !== undefined && !m.rapid);

  it('flat mode stays byte-identical when frame is absent (guard)', () => {
    const r = rasterEngrave({ ...BASE });
    expect(r.moves).toEqual([
      { words: { x: 0, y: 0.5 }, feed: 0, rapid: true },
      { words: { z: 11 }, feed: 0, rapid: true, comment: 'laser focus height' },
      { words: { x: 4 }, feed: 1000, power: 0.3 }, // row 0 (forward): lit edge to edge
      { words: { y: 1.5 }, feed: 1000, power: 0 },
      { words: { x: 0 }, feed: 1000, power: 0.3 }, // row 1 (reverse): lit back to the near edge
      { words: { y: 2.5 }, feed: 1000, power: 0 },
      { words: { x: 4 }, feed: 1000, power: 0.3 },
      { words: { y: 3.5 }, feed: 1000, power: 0 },
      { words: { x: 0 }, feed: 1000, power: 0.3 }, // row 3 (reverse, last): no corner after
      { words: {}, feed: 1000, power: 0 },
    ]);
    expect(r.estimatedMinutes).toBeCloseTo(19 / 1000, 9);
  });

  it('row j burns at datumAngle + (origin.y + (j+0.5)·py)·degPerMm — pixel-row centers in arc', () => {
    const r = rasterEngrave(solidWrapped);
    // positioning rapid A = row 0's center
    expect(r.moves[0].words.a).toBeCloseTo(90 + 0.5 * degPerMm1, 9);
    // then each row ascends exactly py·degPerMm of arc
    const as = aMoves(r).map((m) => (m.words as { a: number }).a);
    expect(as.length).toBe(3);
    for (let j = 1; j < 4; j++) {
      expect(as[j - 1]).toBeCloseTo(90 + (0 + (j + 0.5) * 1) * degPerMm1, 9);
    }
  });

  it('no move carries both x and a — G93 never appears (serpentine and one-way)', () => {
    for (const sweep of ['serpentine', 'one-way'] as const) {
      for (const bmp of [solid(4, 4, 0), halfBlack(4, 4), checker(4, 4)]) {
        const r = rasterEngrave({ ...solidWrapped, bitmap: bmp, sweep });
        for (const m of r.moves) {
          expect(m.words.x === undefined || m.words.a === undefined).toBe(true);
        }
      }
    }
  });

  it('serpentine row steps are pure-A beam-off G1s at the rotary feed, ny−1 of them', () => {
    const r = rasterEngrave({ ...solidWrapped, bitmap: halfBlack(4, 4) });
    const steps = aMoves(r);
    expect(steps.length).toBe(3); // ny − 1
    for (const m of steps) {
      expect(m.feed).toBe(ROTARY_FEED_DEG_MIN); // beam-OFF, deg/min
      expect(m.power).toBe(0);
      expect(m.rapid).toBeFalsy();
    }
    // no folded moves: no wrapped G1 carries a y word (the flat fold is gone)
    expect(r.moves.some((m) => !m.rapid && m.words.x !== undefined && m.words.y !== undefined)).toBe(false);
  });

  it('one-way row steps are axis-separate rapids; a fired last span extinguishes bare first', () => {
    // solid black: every run reaches the far edge — no beam-off gap, so
    // each transition extinguishes bare (the flat corner move's wrapped
    // form) before the A rapid and the X rapid
    const r = rasterEngrave({ ...solidWrapped, bitmap: solid(4, 4, 0), sweep: 'one-way' });
    const rapids = r.moves.filter((m) => m.rapid);
    // opening a + x + z, then per transition: bare extinguish (G1) + a + x
    expect(rapids.length).toBe(3 + 2 * 3);
    const aRapids = rapids.filter((m) => m.words.a !== undefined);
    expect(aRapids.length).toBe(4); // positioning + 3 transitions
    for (const m of aRapids) expect(m.power).toBeUndefined(); // G0 never fires
    const extinguishes = r.moves.filter(
      (m) => !m.rapid && Object.keys(m.words).length === 0,
    );
    expect(extinguishes.length).toBe(4); // 3 bare transitions + the final one
    // halfway bitmap: the last span per row is the beam-off far-edge gap —
    // NO bare extinguish, just the two rapids per transition
    const r2 = rasterEngrave({ ...solidWrapped, bitmap: halfBlack(4, 4), sweep: 'one-way' });
    const bare2 = r2.moves.filter((m) => !m.rapid && Object.keys(m.words).length === 0);
    expect(bare2.length).toBe(1); // final extinguish only
    const aRapids2 = r2.moves.filter((m) => m.rapid && m.words.a !== undefined);
    expect(aRapids2.length).toBe(4); // positioning + 3 transitions
  });

  it('A positions by the SHORTEST rotation from startA, then ascends monotonically', () => {
    // startA 750: shortest rotation to row 0's arc (90.5°) is +60.5 —
    // the pile never unwinds; rows then ascend 1° each (810.5, 811.5, …)
    const r = rasterEngrave({
      ...solidWrapped,
      frame: { kind: 'wrapped', radius: R1, startA: 750, datumAngle: 90 },
    });
    const as = r.moves
      .filter((m) => m.words.a !== undefined && !m.rapid)
      .map((m) => (m.words as { a: number }).a);
    expect(as.length).toBe(3);
    as.forEach((a, i) => {
      const j = i + 1;
      expect(a).toBeCloseTo(810.5 + j, 9);
      expect(a % 360).toBeCloseTo((90 + (j + 0.5) * degPerMm1) % 360, 9);
      if (i > 0) expect(a).toBeGreaterThan(as[i - 1]); // monotone ascent
    });
  });

  it('minutes: X spans at feed + serpentine A steps at the rotary rate (rapids excluded)', () => {
    // solid black 4×4mm axial, 4 rows: 16mm of X at F1000, three 1°-of-arc
    // steps at ROTARY_FEED_DEG_MIN deg/min
    const r = rasterEngrave(solidWrapped);
    const xMin = (4 * 4) / 1000;
    const aMin = 3 * ((1 * degPerMm1) / ROTARY_FEED_DEG_MIN);
    expect(r.estimatedMinutes).toBeCloseTo(xMin + aMin, 12);
    // one-way: the A steps are rapids — minutes drop to the X travel alone
    const ow = rasterEngrave({ ...solidWrapped, sweep: 'one-way' });
    expect(ow.estimatedMinutes).toBeCloseTo(xMin, 12);
  });

  it('guards: artwork arc beyond the circumference throws; radius>0; shared messages kept', () => {
    // R1 circumference = 360: height 361 exceeds, 360 exactly fits
    expect(() =>
      rasterEngrave({ ...BASE, frame: FRAME1, face: { width: 4, height: 361 }, bitmap: solid(4, 4, 0) }),
    ).toThrow(/circumference/);
    expect(() =>
      rasterEngrave({ ...BASE, frame: FRAME1, face: { width: 4, height: 360 }, bitmap: solid(4, 4, 0) }),
    ).not.toThrow();
    expect(() =>
      rasterEngrave({
        ...BASE,
        frame: { kind: 'wrapped', radius: 0, startA: 0, datumAngle: 0 },
      }),
    ).toThrow(/radius/);
    // shared params keep the FLAT error messages
    expect(() => rasterEngrave({ ...solidWrapped, feed: 0 })).toThrow(/raster feed must be positive/);
    expect(() => rasterEngrave({ ...solidWrapped, pitch: 0 })).toThrow(/raster pitch/);
    expect(() => rasterEngrave({ ...solidWrapped, bitmap: solid(4, 4, 255) })).toThrow(/nothing dark/);
  });

  it('sweep/interlace/leadIn semantics identical: same span sequence as the equivalent flat call', () => {
    const xs = (r: ReturnType<typeof rasterEngrave>) =>
      r.moves.filter((m) => !m.rapid && m.words.x !== undefined).map((m) => (m.words as { x: number }).x);
    const powers = (r: ReturnType<typeof rasterEngrave>) =>
      r.moves.filter((m) => !m.rapid && m.words.x !== undefined).map((m) => m.power);
    for (const opts of [
      { sweep: 'serpentine' as const, interlace: 0.5 },
      { sweep: 'serpentine' as const, leadIn: 0.7, interlace: 0.3 },
      { sweep: 'one-way' as const, leadIn: 0.7 },
    ]) {
      const args = {
        ...BASE,
        bitmap: halfBlack(6, 3),
        face: { width: 6, height: 3 },
        origin: { x: 10, y: 20 },
        ...opts,
      };
      const flat = rasterEngrave(args);
      const wrap = rasterEngrave({ ...args, frame: { ...FRAME1 } });
      expect(xs(wrap)).toEqual(xs(flat));
      expect(powers(wrap)).toEqual(powers(flat));
    }
  });
});
