/**
 * Chamfer along edge loops with a V-bit/chamfer tool (PLAN.md Phase 1).
 *
 * The machined chamfer surface IS the cone flank, placed so it passes
 * through the anchor loop (the original sharp edge line):
 *  - tip Z is `depth` beyond the loop's plane — 'down' along the wall
 *    below the edge (a rim) or 'up' the wall above it (a hole-floor
 *    edge). The rule references only the anchor plane, never the wall,
 *    so both edges of an already-chamfered model anchor the same cut.
 *  - the tool-center path is the loop offset rt (the flat-tip radius)
 *    toward the tool side: the tip's far edge then lands exactly on the
 *    loop at the chamfer's deepest point, and the flank meets the anchor
 *    plane `depth · tan(α)` out along the face (α = vAngle/2).
 *
 * Chamfers are single finishing passes — no step-down ladder.
 */

import type { ChamferLoop, ChamferOp, Move, Tool, Vec2 } from '../core/types';
import { offsetInward, offsetOutward } from './clipper';
import { APPROACH_CLEARANCE, rotateToNearest } from './paths';

/** Sampled segments per analytic circle loop. */
export const CIRCLE_SEGMENTS = 64;

export interface ChamferResult {
  moves: Move[];
  /** loops cut */
  loops: number;
  /** chamfer width where the flank meets the anchor plane, mm */
  width: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/** Signed area ×2; >0 = CCW. */
function signedArea2(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** Tool-center path for one loop, offset rt toward the cut side. */
function toolPath(loop: ChamferLoop, side: 'inside' | 'outside', rt: number): Vec2[][] {
  if (loop.kind === 'circle') {
    const r = side === 'inside' ? loop.radius - rt : loop.radius + rt;
    if (r <= 1e-9) throw new Error('chamfer loop is smaller than the tool tip');
    const pts: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: loop.center.x + r * Math.cos(a), y: loop.center.y + r * Math.sin(a) });
    }
    return [pts];
  }
  if (rt <= 0) return [loop.points];
  // clipper's inward offset grows hole-oriented (CW) loops — normalize to
  // CCW so "inside" always means the loop's bounded region, whichever way
  // the detector stitched it
  const ccw = signedArea2(loop.points) >= 0 ? loop.points : [...loop.points].reverse();
  const offset = side === 'inside' ? offsetInward([ccw], rt) : offsetOutward([ccw], rt);
  if (offset.length === 0) throw new Error('chamfer loop is smaller than the tool tip');
  return offset;
}

export function chamfer(op: ChamferOp, tool: Tool): ChamferResult {
  if (op.loops.length === 0) throw new Error('chamfer needs at least one loop');
  if (op.depth <= 0) throw new Error('chamfer depth must be positive');
  // vitest does not typecheck: an undefined side/direction (an op created
  // before the field existed) must fail loudly, not silently take the
  // else branch of a ternary — that draws the chamfer on the wrong side
  // of the edge while the panel still displays the default option.
  if (op.side !== 'auto' && op.side !== 'inside' && op.side !== 'outside') {
    throw new Error(`unknown chamfer side ${String(op.side)}`);
  }
  if (op.direction !== 'down' && op.direction !== 'up') {
    throw new Error(`unknown chamfer direction ${String(op.direction)}`);
  }
  if (tool.type !== 'vbit') {
    throw new Error('chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
  }
  if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
    throw new Error('chamfer tool needs a sane included tip angle (0–180°)');
  }
  const alpha = ((tool.vAngle / 2) * Math.PI) / 180;
  const rt = (tool.tipDiameter ?? 0) / 2;
  const width = op.depth * Math.tan(alpha);
  // the flank must reach the anchor plane before the shank starts
  if (rt + width > tool.diameter / 2 + 1e-9) {
    throw new Error(
      `chamfer of ${op.depth.toFixed(2)}mm needs ${(rt + width).toFixed(2)}mm of flank — ` +
        `the Ø${tool.diameter} bit's cone is too short`,
    );
  }
  if (op.feed <= 0) throw new Error('chamfer feed must be positive');
  if (op.plungeFeed <= 0) throw new Error('chamfer plunge feed must be positive');

  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let minutes = 0;
  let loops = 0;

  for (const loop of op.loops) {
    // 'auto' rides the void side of the edge: into the hole for a rim
    // (material outside the loop — the funnel cut), out around a boss
    // outline (material inside). The cone flank then removes the corner
    // where the face meets the wall, which is the conventional chamfer
    // in both cases.
    const side: 'inside' | 'outside' =
      op.side === 'auto' ? (loop.materialOutside ? 'inside' : 'outside') : op.side;
    const tipZ = op.direction === 'down' ? loop.z - op.depth : loop.z + op.depth;
    // retract above whichever is higher: the anchor plane ('down' cuts
    // below it) or the raised tip ('up' cuts above the anchor plane)
    const safeZ = (op.direction === 'down' ? loop.z : tipZ) + op.safeClearance;

    for (const raw of toolPath(loop, side, rt)) {
      const path = rotateToNearest(raw, cur);
      const start = path[0];

      moves.push({
        words: { x: start.x, y: start.y, z: safeZ },
        feed: 0,
        rapid: true,
        comment: `chamfer ${op.depth.toFixed(2)}mm deep, ${width.toFixed(2)}mm wide, side ${side}`,
      });
      moves.push({ words: { z: tipZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
      moves.push({
        words: { z: tipZ },
        feed: op.plungeFeed,
        comment: `plunge to chamfer tip z${tipZ.toFixed(2)}`,
      });
      minutes += APPROACH_CLEARANCE / op.plungeFeed;

      let prev = start;
      for (let i = 1; i <= path.length; i++) {
        const p = path[i % path.length];
        moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
        minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
        prev = p;
      }

      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      cur = start;
      loops++;
    }
  }

  return { moves, loops, width, estimatedMinutes: minutes };
}