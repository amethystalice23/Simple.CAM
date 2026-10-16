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
  // invents a phantom plunge)
  let prev: { x: number; y: number; z: number } | null = null;

  const toDisplay = (th: number, y: number, z: number): [number, number] => {
    const zrel = z - axisZ;
    return [y * Math.cos(th) + zrel * Math.sin(th), -y * Math.sin(th) + zrel * Math.cos(th) + axisZ];
  };

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
      continue;
    }

    let x = pos.x;
    let y = pos.y;
    let z = pos.z;
    if (isCylinder && m.words.a !== undefined) {
      // rotary move: un-rotate by its own accumulated A
      [y, z] = toDisplay((pos.a * Math.PI) / 180, pos.y, pos.z);
    } else if (isCylinder && datum !== 0) {
      // flat move under an index datum: un-rotate back over the feature
      [y, z] = toDisplay((datum * Math.PI) / 180, pos.y, pos.z);
    }

    if (prev) {
      const target = m.rapid ? rapid : feed;
      emit(target, prev.x, prev.y, prev.z);
      emit(target, x, y, z);
    }
    prev = { x, y, z };
  }

  return { feed, rapid };
}