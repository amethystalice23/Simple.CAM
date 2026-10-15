/**
 * 2.5D pocket clearing (PLAN.md Phase 1): stepped Z levels, contour-parallel
 * tool-center passes inset from the region (Clipper offsets, see clipper.ts).
 * Regions are machine-space XY contours (outer CCW, holes CW). v1 plunges
 * straight at each pass start (helical entry later).
 */

import type { Move, PocketOp, Tool, Vec2 } from '../core/types';
import { offsetInward } from './clipper';

/** Rapid approach above material before a feed plunge, mm. */
export const APPROACH_CLEARANCE = 0.5;

export interface PocketResult {
  moves: Move[];
  /** number of Z levels cut */
  levels: number;
  /** total clearing loops cut (levels × inset passes × loops) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/** Rotate a closed loop so it starts at the vertex nearest `from`. */
function rotateToNearest(loop: Vec2[], from: Vec2 | null): Vec2[] {
  if (!from || loop.length === 0) return loop;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const d = (loop[i].x - from.x) ** 2 + (loop[i].y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [...loop.slice(best), ...loop.slice(0, best)];
}

export function pocket2d(op: PocketOp, tool: Tool): PocketResult {
  if (op.regions.length === 0) throw new Error('pocket needs at least one region contour');
  if (op.floorZ >= op.topZ) throw new Error('floorZ must be below topZ');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.stepOver <= 0) throw new Error('stepOver must be positive');
  const toolR = tool.diameter / 2;

  // Z ladder from the surface, clamped to the floor
  const levels: number[] = [];
  for (let z = op.topZ - op.stepDown; z > op.floorZ + 1e-9; z -= op.stepDown) {
    levels.push(z);
  }
  levels.push(op.floorZ);

  // sanity: the tool must fit in the region at all
  if (offsetInward(op.regions, toolR).length === 0) {
    throw new Error(`tool Ø${tool.diameter} does not fit the pocket region`);
  }

  const safeZ = op.topZ + op.safeClearance;
  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let passes = 0;
  let minutes = 0;

  for (const levelZ of levels) {
    // passes from the wall inward in stepOver increments, until the region
    // vanishes under the offset
    for (let k = 0; k < 10000; k++) {
      const loops = offsetInward(op.regions, toolR + k * op.stepOver);
      if (loops.length === 0) break;

      for (const raw of loops) {
        const loop = rotateToNearest(raw, cur);
        const start = loop[0];

        moves.push({
          words: { x: start.x, y: start.y, z: safeZ },
          feed: 0,
          rapid: true,
          comment: `level z${levelZ.toFixed(2)} pass ${k + 1}`,
        });
        // rapid down to the approach plane, then feed the last stretch
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
  }

  return { moves, levels: levels.length, passes, estimatedMinutes: minutes };
}