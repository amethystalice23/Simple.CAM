/**
 * 2.5D profile pass (PLAN.md Phase 1): follow a contour with the tool
 * center offset to one side — outside (cut around a boss), inside (bore
 * along a hole rim), or online (cut on the line, engrave-like). One pass
 * per Z level; multi-radial roughing into a wall is a later refinement.
 */

import type { Move, ProfileOp, Tool, Vec2 } from '../core/types';
import { offsetInward, offsetOutward } from './clipper';
import { APPROACH_CLEARANCE, rotateToNearest, zLadder } from './paths';

export interface ProfileResult {
  moves: Move[];
  levels: number;
  /** wall passes cut (levels × offset loops) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

export function profile2d(op: ProfileOp, tool: Tool): ProfileResult {
  if (op.contours.length === 0) throw new Error('profile needs at least one contour');
  // top == floor is legal: a single level at the floor (finishing pass)
  if (op.floorZ > op.topZ) throw new Error('floorZ must not be above topZ');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.allowance < 0) throw new Error('allowance must be >= 0');
  const toolR = tool.diameter / 2;

  let paths: Vec2[][];
  if (op.side === 'online') {
    paths = op.contours;
  } else {
    const offset = toolR + op.allowance;
    paths = op.side === 'outside' ? offsetOutward(op.contours, offset) : offsetInward(op.contours, offset);
  }
  if (paths.length === 0) {
    throw new Error('profile offset leaves no path — tool too large for an inside profile?');
  }

  const levels = zLadder(op.topZ, op.floorZ, op.stepDown);
  const safeZ = op.topZ + op.safeClearance;
  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let passes = 0;
  let minutes = 0;

  for (const levelZ of levels) {
    for (const raw of paths) {
      const loop = rotateToNearest(raw, cur);
      const start = loop[0];

      // travel first at the machine's existing height (after a tool change
      // that is the swap macro's high park — never a diagonal descent
      // across the table), then descend at the destination
      moves.push({
        words: { x: start.x, y: start.y },
        feed: 0,
        rapid: true,
        comment: `level z${levelZ.toFixed(2)}`,
      });
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      moves.push({ words: { z: levelZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
      moves.push({
        words: { z: levelZ },
        feed: op.plungeFeed,
        comment: `plunge ${(op.topZ - levelZ).toFixed(2)}mm below surface`,
      });
      minutes += APPROACH_CLEARANCE / op.plungeFeed;

      let prev = start;
      for (let i = 1; i <= loop.length; i++) {
        const p = loop[i % loop.length];
        moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
        minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
        prev = p;
      }

      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      cur = start;
      passes++;
    }
  }

  return { moves, levels: levels.length, passes, estimatedMinutes: minutes };
}