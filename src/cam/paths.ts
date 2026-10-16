/**
 * Shared pass-generation helpers for the 2.5D generators (pocket, profile).
 */

import type { Vec2 } from '../core/types';

/** Rapid approach above material before a feed plunge, mm. */
export const APPROACH_CLEARANCE = 0.5;

/**
 * Z ladder from a surface down to a floor in fixed steps, clamped so the
 * final level lands exactly on the floor (e.g. top 0, floor −2.5, step 1 →
 * [−1, −2, −2.5]).
 */
export function zLadder(topZ: number, floorZ: number, stepDown: number): number[] {
  const levels: number[] = [];
  for (let z = topZ - stepDown; z > floorZ + 1e-9; z -= stepDown) {
    levels.push(z);
  }
  levels.push(floorZ);
  return levels;
}

/** Rotate a closed loop so it starts at the vertex nearest `from`. */
export function rotateToNearest(loop: Vec2[], from: Vec2 | null): Vec2[] {
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