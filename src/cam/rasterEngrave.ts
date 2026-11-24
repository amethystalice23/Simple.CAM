/**
 * Laser raster engrave (docs/PLAN.md "Laser raster engrave", SPEC
 * 2026-11-23): a dithered 1-bit bitmap burned at CONSTANT power,
 * mirroring the measured Studio "Laser Image" dialect exactly
 * (docs/makera-dialect.md §"Laser Image" — the golden reference):
 *
 *  - CONSTANT-VELOCITY SERPENTINE, rows along the machine's fast X,
 *    stepped in Y; beam-off spans are `G1 S0.0` moves at the SAME feed
 *    (velocity never changes — no mid-raster rapids, one `G0` positioning
 *    at op start, one G0 Z to focus height).
 *  - RUNS, NOT PIXELS: consecutive same-value pixels coalesce into one
 *    G1; the S word flips on run boundaries (the post stamps S from
 *    `Move.power`, modal between changes).
 *  - the row step folds into the row's LAST X move (a beam-off span) —
 *    a row whose last span is FIRED instead gets a pure-Y beam-off corner
 *    move, the dialect's occasional corner-pixel form. One deliberate
 *    simplification: the corner move is always S0 (the next row's first
 *    fired run re-stamps S), so a lit corner pixel burns from the run
 *    that reaches it, never from the corner move itself.
 *
 * WRAPPED (`frame`, 2026-11-24): the face reinterprets on the cylinder —
 * width = machine X (axial), height = ARC length around the stock, and the
 * rows step in A, not Y. The raster NEVER folds the row step into the last
 * X span there (a fold would be a coordinated X+A move → G93): serpentine
 * row steps are pure-A beam-off G1s at ROTARY_FEED_DEG_MIN; one-way row
 * steps are axis-separate rapids (a coordinated rapid would run at the
 * rotary clamp — engrave.ts precedent). NO move carries both x and a —
 * G93 never appears. The dither itself is src/core/dither.ts; the
 * artwork stays grayscale and the method applies here, at the op.
 *
 * Knobs beyond pitch/feed/power (the spec's piece 3):
 *  - `sweep`: 'serpentine' (default, fast) | 'one-way' — the QUALITY
 *    mode whose returns are `G0` rapids (deliberate divergence from
 *    Studio's constant-feed returns: constant speed is already broken
 *    by the turnaround).
 *  - `interlace`: signed mm, applied to REVERSE-ROW fired runs only —
 *    the serpentine interlace artifact (Studio field reports) has an
 *    untested S-settling mechanism (~3 ms at F1000 ≈ 0.05 mm = half a
 *    pixel, sign flipping with row direction); the testPattern coupon
 *    calibrates the value. It is a POSITION error; it will NOT fix
 *    run-start FADE-IN (a magnitude error — that lever is minPower or
 *    leadIn, never this offset).
 *  - `minPower`: diodes barely lase below ~10–15% — the fired level is
 *    floored here so the darkest fired pixel never drops under it.
 *  - `leadIn`: mm of lit travel prepended to each fired run's LEADING
 *    edge (the fade-in lever). Unlike the VECTOR lead-in (closed paths
 *    re-burn their lead, invisible), a raster lead-in burns pixels that
 *    were authored WHITE — it shortens the visible gap ahead of every
 *    fired run. That trade is real, so the raster default is 0 (the
 *    vector's 0.3 would bridge three 0.1mm pixels ahead of every run);
 *    the coupon decides whether it earns its keep. Clamped to the face
 *    rect and to the previous run — it may close a gap fully but never
 *    overlaps an earlier run.
 */

import type { Move } from '../core/types';
import type { GrayBitmap } from '../core/bitmapImport';
import {
  DEFAULT_DITHER_METHOD,
  ditherGray,
  resampleGray,
  type DitherMethod,
} from '../core/dither';
import { ROTARY_FEED_DEG_MIN, shortestATo } from './faceCylinder';

/** the SPEC default pitch — the Studio corpus runs 0.1 mm both axes */
export const RASTER_PITCH_MM = 0.1;

/** hard guard: the move list is memory the UI previews and the post
 *  formats; Studio's reference burned 52k G1s on a ~54×86 face, and a
 *  million runs means the pitch is wrong for the face */
export const MAX_RASTER_MOVES = 1_000_000;

export interface RasterEngraveParams {
  toolId: string;
  /** the grayscale ARTWORK (row 0 = image top) — never dithered upstream;
   *  the method applies here, at the op (material-dependent intent) */
  bitmap: GrayBitmap;
  /** the artwork's face size, mm — the bitmap stretches onto it.
   *  FLAT: width/height are machine X/Y. WRAPPED (`frame` present): width
   *  is the AXIAL span (machine X), height is the ARC LENGTH around the
   *  cylinder — the UI force-scales it under the circumference; the
   *  generator still guards. */
  face: { width: number; height: number };
  /** machine-space position of the face rect's corner with the smaller
   *  X and Y (the bottom-left in a standard frame) — the caller maps the
   *  artwork primitive's transform; the raster runs [x, x+width] ×
   *  [y, y+height]. WRAPPED: x is the machine X of the small-X edge, y is
   *  the arc-mm of the artwork's LEADING edge (row 0's A derives from it) */
  origin: { x: number; y: number };
  /** machine Z of the engraved plane (the face rides at focus above it).
   *  WRAPPED: the crown Z of the stock cylinder */
  surfaceZ: number;
  /** pixel pitch, mm (default RASTER_PITCH_MM) — the image resamples to
   *  round(face/pitch) pixels, effective pitch re-derives from the face */
  pitch?: number;
  /** raster feed, mm/min — constant: beam-off spans travel at it too */
  feed: number;
  /** beam focus height above the surface, mm */
  focus: number;
  /** beam power, 0–1 (the single fired S level — v1 is 1-bit) */
  power: number;
  /** the fired level never drops under this floor (diode lasing floor) */
  minPower?: number;
  /** dither method applied at the op (default Atkinson) */
  method?: DitherMethod;
  /** 'halftone' method only: screen cell size, mm */
  screenSpacing?: number;
  sweep?: 'serpentine' | 'one-way';
  /** signed mm, reverse-row fired runs only (serpentine; default 0) */
  interlace?: number;
  /** mm of lit travel before each fired run's leading edge (default 0) */
  leadIn?: number;
  /** WRAPPED (4th-axis) frame — absent = FLAT, byte-identical behavior */
  frame?: RasterWrappedFrame;
}

/** WRAPPED (4th-axis): burn the artwork around the stock cylinder —
 *  axial = machine X, arc = A. Row j burns at
 *  datumAngle + (origin.y + (j + 0.5)·py)·degPerMm,
 *  degPerMm = 180/(π·radius). A accumulates continuously past 360°. */
export interface RasterWrappedFrame {
  kind: 'wrapped';
  /** stock radius, mm (>0) */
  radius: number;
  /** machine A before the op (positioning origin) */
  startA: number;
  /** machine A when the around-origin sits at arc 0 */
  datumAngle: number;
}

export interface RasterEngraveResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids — consistent with
   *  engraveLaser: the raster feed is dominated by the G1 travel) */
  estimatedMinutes: number;
  /** the resampled grid the dither ran on (the summary reports it) */
  grid: { width: number; height: number };
  /** fired run count — the G1 count the S word alternates on */
  firedRuns: number;
  /** total fired pixels (sanity: the dither's tone, roughly the dark
   *  fraction of the image — zero means nothing to engrave) */
  firedPixels: number;
}

/** one row's coalesced fired span in pixel units, x inclusive */
interface Run {
  x0: number;
  x1: number;
}

export function rasterEngrave(op: RasterEngraveParams): RasterEngraveResult {
  const pitch = op.pitch ?? RASTER_PITCH_MM;
  if (!(pitch > 0)) throw new Error('raster pitch must be positive');
  if (!(op.face.width > 0) || !(op.face.height > 0)) {
    throw new Error('raster face must have positive dimensions');
  }
  if (op.power <= 0 || op.power > 1) throw new Error('laser power must be within (0, 1]');
  if (op.focus < 0) throw new Error('laser focus must not be negative');
  if (!(op.feed > 0)) throw new Error('raster feed must be positive');
  const leadIn = op.leadIn ?? 0;
  if (leadIn < 0) throw new Error('laser lead-in must not be negative');
  const interlace = op.interlace ?? 0;
  const sweep = op.sweep ?? 'serpentine';
  const method = op.method ?? DEFAULT_DITHER_METHOD;
  const firedPower = Math.min(1, Math.max(op.power, op.minPower ?? 0));

  // WRAPPED frame guards — after the shared ones, so a wrapped call with
  // a bad shared param still throws the FLAT message
  const frame = op.frame;
  let degPerMm = 0;
  if (frame) {
    if (!(frame.radius > 0)) throw new Error('radius must be positive');
    const circumference = 2 * Math.PI * frame.radius;
    if (op.face.height > circumference) {
      throw new Error(
        `artwork arc ${op.face.height.toFixed(2)}mm exceeds the cylinder circumference ` +
          `${circumference.toFixed(2)}mm — scale the artwork to fit`,
      );
    }
    degPerMm = 180 / (Math.PI * frame.radius);
  }

  // the grid: round(face/pitch) pixels, effective pitch re-derived so the
  // raster spans the face EXACTLY (the resample is the op's tone step)
  const nx = Math.max(1, Math.round(op.face.width / pitch));
  const ny = Math.max(1, Math.round(op.face.height / pitch));
  const px = op.face.width / nx;
  const py = op.face.height / ny;
  // row 0's absolute A: the machine's accumulated A takes the SHORTEST
  // rotation to row 0's arc position — never unwind the pile (engrave.ts
  // precedent); rows then ascend monotonically from it (steps are small
  // and one-directional, so no shortestATo between rows)
  const aRow0 = frame
    ? frame.startA +
      shortestATo(frame.datumAngle + (op.origin.y + 0.5 * py) * degPerMm, frame.startA)
    : 0;
  const grid = resampleGray(op.bitmap, nx, ny);
  const bits = ditherGray(grid, method, { pitch: px, screenSpacing: op.screenSpacing });

  // per-row fired runs, bottom row first: grid row 0 is the IMAGE top
  // (v-down), so machine row j (bottom-up) reads image row ny−1−j
  const rows: Run[][] = [];
  let firedPixels = 0;
  let firedRuns = 0;
  for (let j = 0; j < ny; j++) {
    const gy = ny - 1 - j;
    const runs: Run[] = [];
    for (let gx = 0; gx < nx; ) {
      if (!bits.bits[gy * nx + gx]) {
        gx++;
        continue;
      }
      let end = gx;
      while (end + 1 < nx && bits.bits[gy * nx + end + 1]) end++;
      runs.push({ x0: gx, x1: end });
      firedPixels += end - gx + 1;
      gx = end + 1;
    }
    firedRuns += runs.length;
    rows.push(runs);
  }
  if (firedPixels === 0) {
    throw new Error('nothing dark to engrave — the dither fired no pixels at this pitch');
  }

  // knob surgery on the runs, per row and direction:
  //   serpentine row j runs +X on even j, −X on odd; one-way always +X
  //   (its returns are G0 rapids, emitted below).
  //   interlace shifts reverse-row fired runs; leadIn extends each
  //   fired run's LEADING edge backward along travel (a pixel-span
  //   shift: the lead may close a white gap fully — merging the runs —
  //   but never reaches into an earlier run).
  const x0mm = op.origin.x;
  const x1mm = op.origin.x + op.face.width;
  for (let j = 0; j < ny; j++) {
    const dir = sweep === 'serpentine' ? (j % 2 === 0 ? 1 : -1) : 1;
    const runs = rows[j];
    for (const r of runs) {
      if (dir < 0 && interlace !== 0) {
        r.x0 += interlace / px;
        r.x1 += interlace / px;
      }
      if (leadIn > 0) {
        if (dir > 0) r.x0 -= leadIn / px;
        else r.x1 += leadIn / px;
      }
      r.x0 = Math.max(0, Math.min(nx - 1, r.x0)); // clamp into the face
      r.x1 = Math.max(r.x0, Math.min(nx - 1, r.x1));
    }
    // interlace/lead shifts preserve order except the lead's reach
    // toward the next run — merge what now touches or overlaps (the
    // emission requires ordered, disjoint spans; an overlap would only
    // re-burn, but the span builder assumes monotone travel)
    const cleaned: Run[] = [];
    for (const r of [...runs].sort((a, b) => a.x0 - b.x0)) {
      const last = cleaned[cleaned.length - 1];
      if (last && r.x0 <= last.x1 + 1) {
        last.x1 = Math.max(last.x1, r.x1);
        firedRuns--;
      } else {
        cleaned.push(r);
      }
    }
    rows[j] = cleaned;
  }

  const moves: Move[] = [];
  let minutes = 0;

  // pixel column k BURNS the machine span [k·px, (k+1)·px) — a one-pixel
  // run is a full pixel wide, not a zero-length flash. Rows sit at
  // PIXEL-ROW CENTERS (Alice, 2026-11-24: probe-measured — rows at the
  // row edges left the face's bottom ~0.85 of 16mm unburned; the X runs
  // traverse their whole span but the Y step has no traversal, so each
  // burn line must center its pixel row. Studio's first row at Y0.5, not
  // Y0, corroborates a centered/margined convention): row j burns at
  // (j + 0.5)·py, symmetric over the face.
  const runStart = (r: Run): number => x0mm + r.x0 * px;
  const runEnd = (r: Run): number => x0mm + (r.x1 + 1) * px;
  const ym = (j: number): number => op.origin.y + (j + 0.5) * py;

  // the ONE positioning rapid + the op's one Z move to focus height
  // (the post arms M3 after it; from here the beam can only meet the
  // surface — same ordering contract as engraveLaser).
  // WRAPPED positions axis-separate (engrave.ts precedent — a coordinated
  // rapid would run at the rotary clamp): A to row 0's arc center, then X
  // to the near edge, then the focus Z.
  if (frame) {
    moves.push({ words: { a: aRow0 }, feed: 0, rapid: true });
    moves.push({ words: { x: x0mm }, feed: 0, rapid: true });
  } else {
    moves.push({ words: { x: x0mm, y: ym(0) }, feed: 0, rapid: true });
  }
  moves.push({ words: { z: op.surfaceZ + op.focus }, feed: 0, rapid: true, comment: 'laser focus height' });

  let curX = x0mm;
  for (let j = 0; j < ny; j++) {
    const dir = sweep === 'serpentine' ? (j % 2 === 0 ? 1 : -1) : 1;
    const runs = rows[j];
    const yNext = j + 1 < ny ? ym(j + 1) : null;
    // WRAPPED: rows ascend monotonically in A — each row steps exactly
    // py·degPerMm of arc from the previous one (no shortestATo here)
    const aNext = frame && j + 1 < ny ? aRow0 + (j + 1) * py * degPerMm : null;

    /** emit one traversal span at raster feed; stamps the S word on the
     *  span (the post is modal — a same-power move emits no S) */
    const span = (toX: number, lit: boolean, foldY: boolean) => {
      const words: { x?: number; y?: number } = { x: toX };
      if (foldY && yNext !== null) words.y = yNext;
      moves.push({ words, feed: op.feed, power: lit ? firedPower : 0 });
      minutes += Math.abs(toX - curX) / op.feed;
      curX = toX;
    };

    // spans from the near edge to the far edge: gap, run, gap, run, …
    // (a serpentine reverse row starts where the previous row ended —
    // the corner move already carried the Y step)
    const near = dir > 0 ? x0mm : x1mm;
    const far = dir > 0 ? x1mm : x0mm;
    const spans: { toX: number; lit: boolean }[] = [];
    let x = near;
    // x-ascending storage; reverse rows meet the rightmost run first
    const ordered = dir > 0 ? runs : [...runs].reverse();
    for (const r of ordered) {
      const a = dir > 0 ? runStart(r) : runEnd(r); // leading edge
      const b = dir > 0 ? runEnd(r) : runStart(r); // trailing edge
      if (Math.abs(a - x) > 1e-9) spans.push({ toX: a, lit: false });
      spans.push({ toX: b, lit: true });
      x = b;
    }
    if (Math.abs(far - x) > 1e-9) spans.push({ toX: far, lit: false });

    if (frame) {
      // WRAPPED: rows scan X at fixed A; the step NEVER folds into the
      // last span (a fold would be a coordinated X+A move → G93).
      // Serpentine steps are pure-A beam-off G1s at the rotary limit;
      // one-way steps are axis-separate rapids (a coordinated rapid would
      // run at the rotary clamp — engrave.ts precedent).
      for (let s = 0; s < spans.length; s++) {
        span(spans[s].toX, spans[s].lit, false);
      }
      if (aNext !== null) {
        if (sweep === 'serpentine') {
          moves.push({ words: { a: aNext }, feed: ROTARY_FEED_DEG_MIN, power: 0 });
          minutes += (py * degPerMm) / ROTARY_FEED_DEG_MIN;
        } else {
          // the QUALITY mode: return as rapids — constant speed is already
          // broken by the turnaround (deliberate divergence from Studio,
          // spec's wording). A fired last span (the run reached the far
          // edge, no beam-off gap) extinguishes bare first — the flat
          // pure-Y corner move's wrapped form.
          if (spans[spans.length - 1].lit) {
            moves.push({ words: {}, feed: op.feed, power: 0 });
          }
          moves.push({ words: { a: aNext }, feed: 0, rapid: true });
          moves.push({ words: { x: x0mm }, feed: 0, rapid: true });
          curX = x0mm;
        }
      }
    } else {
      // emit; the row step folds into the LAST span when it is beam-off,
      // otherwise a pure-Y beam-off corner move follows (dialect form)
      for (let s = 0; s < spans.length; s++) {
        const last = s === spans.length - 1;
        if (last && spans[s].lit) {
          span(spans[s].toX, true, false);
          if (yNext !== null) {
            moves.push({ words: { y: yNext }, feed: op.feed, power: 0 });
            minutes += py / op.feed;
          }
        } else {
          span(spans[s].toX, spans[s].lit, last && yNext !== null);
        }
      }

      if (sweep === 'one-way' && yNext !== null) {
        // the QUALITY mode: return above the work as a rapid — constant
        // speed is already broken by the turnaround, so the return buys
        // nothing (deliberate divergence from Studio, spec's wording)
        moves.push({ words: { x: x0mm, y: yNext }, feed: 0, rapid: true });
        curX = x0mm;
      }
    }
  }

  // the last row ends beam-on or beam-off; the dialect closes with a
  // bare `G1 S0` before the M05/M322 tail — extinguish
  moves.push({ words: {}, feed: op.feed, power: 0 });

  if (moves.length > MAX_RASTER_MOVES) {
    throw new Error(
      `raster too fine: ${moves.length} moves on a ${op.face.width.toFixed(0)}×${op.face.height.toFixed(0)}mm face — increase the pitch`,
    );
  }

  return { moves, estimatedMinutes: minutes, grid: { width: nx, height: ny }, firedRuns, firedPixels };
}
