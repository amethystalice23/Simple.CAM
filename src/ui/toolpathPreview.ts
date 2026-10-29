/**
 * Toolpath preview (PLAN.md "Toolpath preview"): Move[] IR → segments in
 * the DISPLAY frame — the un-rotated stock/model as shown at A=0 — so
 * paths draw over the features they cut. Modal axis accumulation; feeds
 * and rapids separated. Mapping into the display frame (4-axis stock,
 * cylinder or box):
 *  - rotary moves (A-word): the tool's YZ position rotates back about the
 *    stock axis by −A — wrapped cuts draw on the stock surface where they
 *    happen;
 *  - pure-A RAPID moves (an Index op) draw nothing (the stock rotates, not
 *    the tool) but establish the datum for what follows. A-only FEED moves
 *    are cuts (vertical facing's full-revolution rings) and draw;
 *  - flat moves are un-rotated by the running accumulated A, so an indexed
 *    pocket draws over its feature as currently displayed and a facing
 *    plunge draws at the angle the stock is actually at. The emitted
 *    G-code is untouched machine coordinates — only the drawing is
 *    display-frame.
 */

import type { Move, Stock } from '../core/types';
import { rotaryCalibrationOf } from '../core/types';

export interface PreviewSegments {
  /** flat xyz pairs per segment: [x0,y0,z0, x1,y1,z1, ...] */
  feed: number[];
  rapid: number[];
}

/**
 * Segments + the MOVE INDEX each segment belongs to (the playback trail,
 * 2026-10-29): one index per emitted segment pair, matching the feed/rapid
 * arrays pair-for-pair, so the viewport can fade paths by their distance in
 * move order from the transport's current move. Segments subdivided from
 * one long rotary move share that move's index (the trail fades the whole
 * interpolated helix as one move — the transport walks move indices).
 */
export interface PreviewSegmentMoves {
  feed: number[];
  rapid: number[];
  /** move index per feed segment (length = feed.length / 6) */
  feedMoves: number[];
  /** move index per rapid segment (length = rapid.length / 6) */
  rapidMoves: number[];
}

export function movesToSegments(moves: Move[], stock: Stock | null): PreviewSegments {
  return segmentize(moves, stock);
}

export function movesToSegmentMoves(moves: Move[], stock: Stock | null): PreviewSegmentMoves {
  const s = segmentize(moves, stock);
  return { feed: s.feed, rapid: s.rapid, feedMoves: s.feedMoves, rapidMoves: s.rapidMoves };
}

function segmentize(moves: Move[], stock: Stock | null): PreviewSegmentMoves {
  const rotary = stock?.axisMode === '4-axis';
  const axisZ = rotary ? rotaryCalibrationOf(stock).axisZ : 0;
  const pos = { x: 0, y: 0, z: 0, a: 0 };
  const feed: number[] = [];
  const rapid: number[] = [];
  const feedMoves: number[] = [];
  const rapidMoves: number[] = [];

  // one SEGMENT (vertex pair) per call — the move index pushed exactly
  // once with the pair. The length-modulo pairing this replaces fired on
  // alternating pushes (every OTHER segment got an index) and misaligned
  // indices with positions (caught by the synthetic coherence check).
  const emit = (
    target: number[],
    targetMoves: number[],
    mi: number,
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
  ) => {
    target.push(x0, y0, z0, x1, y1, z1);
    targetMoves.push(mi);
  };

  // the first move only positions the tool — no segment into it (the
  // machine's true start position is unknown, and drawing from the origin
  // invents a phantom plunge). prevM tracks machine space for subdividing
  // long rotary moves; prev is the mapped display point.
  let prev: { x: number; y: number; z: number } | null = null;
  let prevM: { x: number; y: number; z: number; a: number } | null = null;
  let mIdx = 0;

  const toDisplay = (th: number, y: number, z: number): [number, number] => {
    const zrel = z - axisZ;
    return [y * Math.cos(th) + zrel * Math.sin(th), -y * Math.sin(th) + zrel * Math.cos(th) + axisZ];
  };

  /** Max degrees of rotation per drawn chord — finer would only cost
   * geometry for no visible gain on a 25mm-scale cylinder. */
  const ROT_STEP_DEG = 15;

  for (const m of moves) {
    // mi = the ARRAY index, 0-based — the same basis the worker's
    // progress.move reports (the pre-increment this replaces shifted
    // every segment's move index +1, splitting the trail one move off
    // the tool marker's position)
    const mi = mIdx;
    mIdx++;
    pos.x = m.words.x ?? pos.x;
    pos.y = m.words.y ?? pos.y;
    pos.z = m.words.z ?? pos.z;
    pos.a = m.words.a ?? pos.a;

    // a pure-A RAPID move (an Index op) rotates the stock, not the tool:
    // it cuts nothing, moves nothing in XYZ, and only sets the A the flat
    // moves after it un-rotate by. An A-only FEED move is a cut (a vertical
    // facing ring) and must draw, so it falls through to the rotary path.
    const aOnly =
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.y === undefined &&
      m.words.z === undefined;
    if (aOnly && m.rapid) {
      prevM = { ...pos };
      continue;
    }

    const target = m.rapid ? rapid : feed;
    const targetMoves = m.rapid ? rapidMoves : feedMoves;
    const isRotary = rotary && m.words.a !== undefined;
    const da = isRotary && prevM ? pos.a - prevM.a : 0;

    if (isRotary && prev && prevM && Math.abs(da) > ROT_STEP_DEG) {
      // a long rotary sweep (a facing pass is thousands of degrees in one
      // move): interpolate in machine space and map each step, so the
      // helix draws as a helix instead of one giant chord
      const n = Math.ceil(Math.abs(da) / ROT_STEP_DEG);
      const from = prevM;
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const mx = from.x + (pos.x - from.x) * t;
        const my = from.y + (pos.y - from.y) * t;
        const mz = from.z + (pos.z - from.z) * t;
        const ma = from.a + da * t;
        const [dy, dz] = toDisplay((ma * Math.PI) / 180, my, mz);
        emit(target, targetMoves, mi, prev.x, prev.y, prev.z, mx, dy, dz);
        prev = { x: mx, y: dy, z: dz };
      }
    } else {
      let x = pos.x;
      let y = pos.y;
      let z = pos.z;
      if (isRotary) {
        // rotary move: un-rotate by its own accumulated A
        [y, z] = toDisplay((pos.a * Math.PI) / 180, pos.y, pos.z);
      } else if (rotary) {
        // flat move: un-rotate by the stock's current A (the index op's
        // angle for indexed jobs, the pass angle mid-facing) so it draws
        // where the material actually is. A=0 (or flat stock) is identity.
        [y, z] = toDisplay((pos.a * Math.PI) / 180, pos.y, pos.z);
      }
      if (prev) {
        emit(target, targetMoves, mi, prev.x, prev.y, prev.z, x, y, z);
      }
      prev = { x, y, z };
    }
    prevM = { ...pos };
  }

  return { feed, rapid, feedMoves, rapidMoves };
}