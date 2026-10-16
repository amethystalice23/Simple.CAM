/**
 * Toolpath preview (PLAN.md "Toolpath preview"): Move[] IR → segments in
 * the DISPLAY frame — the un-rotated stock/model as shown at A=0 — so
 * paths draw over the features they cut. Modal axis accumulation; feeds
 * and rapids separated. Mapping into the display frame:
 *  - rotary moves (A-word, cylinder stock): the tool's YZ position rotates
 *    back about the stock axis by −A — wrapped cuts draw on the cylinder
 *    surface where they happen;
 *  - pure-A Index moves draw nothing (the stock rotates, not the tool) but
 *    establish the datum for what follows;
 *  - flat moves under an index datum are un-rotated by that datum, so an
 *    indexed pocket draws over its feature as currently displayed, not
 *    over the mirrored machine position. The emitted G-code is untouched
 *    machine coordinates — only the drawing is display-frame.
 */

import type { Move, Stock } from '../core/types';

export interface PreviewSegments {
  /** flat xyz pairs per segment: [x0,y0,z0, x1,y1,z1, ...] */
  feed: number[];
  rapid: number[];
}

export function movesToSegments(moves: Move[], stock: Stock | null): PreviewSegments {
  const isCylinder = stock?.kind === 'cylinder';
  const axisZ = isCylinder ? stock.calibration.axisZ : 0;
  const pos = { x: 0, y: 0, z: 0, a: 0 };
  let datum = 0; // absolute A established by the latest Index op
  const feed: number[] = [];
  const rapid: number[] = [];

  const emit = (target: number[], x: number, y: number, z: number) => {
    target.push(x, y, z);
  };

  // the first move only positions the tool — no segment into it (the
  // machine's true start position is unknown, and drawing from the origin
  // invents a phantom plunge). prevM tracks machine space for subdividing
  // long rotary moves; prev is the mapped display point.
  let prev: { x: number; y: number; z: number } | null = null;
  let prevM: { x: number; y: number; z: number; a: number } | null = null;

  const toDisplay = (th: number, y: number, z: number): [number, number] => {
    const zrel = z - axisZ;
    return [y * Math.cos(th) + zrel * Math.sin(th), -y * Math.sin(th) + zrel * Math.cos(th) + axisZ];
  };

  /** Max degrees of rotation per drawn chord — finer would only cost
   * geometry for no visible gain on a 25mm-scale cylinder. */
  const ROT_STEP_DEG = 15;

  for (const m of moves) {
    pos.x = m.words.x ?? pos.x;
    pos.y = m.words.y ?? pos.y;
    pos.z = m.words.z ?? pos.z;
    pos.a = m.words.a ?? pos.a;

    // a pure-A move (an Index op) rotates the stock, not the tool: it
    // cuts nothing, moves nothing in XYZ, and only establishes the datum
    const aOnly =
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.y === undefined &&
      m.words.z === undefined;
    if (aOnly) {
      datum = pos.a;
      prevM = { ...pos };
      continue;
    }

    const target = m.rapid ? rapid : feed;
    const rotary = isCylinder && m.words.a !== undefined;
    const da = rotary && prevM ? pos.a - prevM.a : 0;

    if (rotary && prev && prevM && Math.abs(da) > ROT_STEP_DEG) {
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
        emit(target, prev.x, prev.y, prev.z);
        emit(target, mx, dy, dz);
        prev = { x: mx, y: dy, z: dz };
      }
    } else {
      let x = pos.x;
      let y = pos.y;
      let z = pos.z;
      if (rotary) {
        // rotary move: un-rotate by its own accumulated A
        [y, z] = toDisplay((pos.a * Math.PI) / 180, pos.y, pos.z);
      } else if (isCylinder && datum !== 0) {
        // flat move under an index datum: un-rotate back over the feature
        [y, z] = toDisplay((datum * Math.PI) / 180, pos.y, pos.z);
      }
      if (prev) {
        emit(target, prev.x, prev.y, prev.z);
        emit(target, x, y, z);
      }
      prev = { x, y, z };
    }
    prevM = { ...pos };
  }

  return { feed, rapid };
}