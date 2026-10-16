/**
 * Toolpath preview (PLAN.md "Toolpath preview"): Move[] IR → machine-space
 * segments for the viewport. Modal axis accumulation over the move list,
 * feeds and rapids separated. For rotary moves (A-word, cylinder stock)
 * the preview frame is the un-rotated stock, so the tool's YZ position is
 * rotated back about the stock axis by −A — wrapped cuts draw on the
 * cylinder surface where they'll actually happen.
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
  const feed: number[] = [];
  const rapid: number[] = [];

  const emit = (target: number[], x: number, y: number, z: number) => {
    target.push(x, y, z);
  };

  // the first move only positions the tool — no segment into it (the
  // machine's true start position is unknown, and drawing from the origin
  // invents a phantom plunge)
  let prev: { x: number; y: number; z: number } | null = null;

  for (const m of moves) {
    pos.x = m.words.x ?? pos.x;
    pos.y = m.words.y ?? pos.y;
    pos.z = m.words.z ?? pos.z;
    pos.a = m.words.a ?? pos.a;

    // a pure-A move (an Index op) rotates the stock, not the tool: it
    // cuts nothing and moves nothing in XYZ — draw no segment for it,
    // and don't let the wrap map the tool to a mirrored phantom position
    const aOnly =
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.y === undefined &&
      m.words.z === undefined;

    let x = pos.x;
    let y = pos.y;
    let z = pos.z;
    if (isCylinder && m.words.a !== undefined) {
      // rotate the tool YZ position back about the stock axis by A
      const th = (pos.a * Math.PI) / 180;
      const zrel = pos.z - axisZ;
      y = pos.y * Math.cos(th) + zrel * Math.sin(th);
      z = -pos.y * Math.sin(th) + zrel * Math.cos(th) + axisZ;
    }

    if (prev && !aOnly) {
      const target = m.rapid ? rapid : feed;
      emit(target, prev.x, prev.y, prev.z);
      emit(target, x, y, z);
    }
    if (!aOnly) prev = { x, y, z };
  }

  return { feed, rapid };
}