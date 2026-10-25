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

/** Distance from `p` to the segment ab (clamped to the segment, so points
 * beyond an endpoint measure their true distance, never 0). */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + tc * dx), p.y - (a.y + tc * dy));
}

/**
 * Douglas-Peucker for a CLOSED contour (last point implicitly joins to
 * first; anchors = the two most-distant vertices so no direction is
 * privileged). Collinear-ish vertices within `toleranceMm` of the retained
 * chords drop out. Contours shorter than 3 points return unchanged.
 *
 * The anchor pair is found with the two-pass farthest heuristic (farthest
 * vertex from an arbitrary start, then farthest from that): the exact
 * diameter is an O(n²) search, pointless on the tens-of-thousands-of-
 * vertices relief slices this exists for, and on convex contours the
 * heuristic lands on antipodes anyway. A contour that collapses entirely
 * under the tolerance is returned unchanged rather than as a degenerate
 * 2-point "loop".
 */
export function simplifyContour(points: Vec2[], toleranceMm: number): Vec2[] {
  const n = points.length;
  if (n < 3) return points.slice();

  const farthestFrom = (from: Vec2): number => {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      const d = (points[i].x - from.x) ** 2 + (points[i].y - from.y) ** 2;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const a0 = farthestFrom(points[0]);
  const a1 = farthestFrom(points[a0]);

  const keep = new Uint8Array(n);
  // DP over one open stretch of the ring, start..end walking forward
  // (mod n, both endpoints included and always kept). Iterative with an
  // explicit stack — the recursion depth on a 30k-vertex slice is not
  // worth risking.
  const simplifyStretch = (start: number, end: number): void => {
    keep[start] = 1;
    keep[end] = 1;
    const m = ((end - start + n) % n) + 1; // vertices in the stretch
    if (m <= 2) return;
    const idxAt = (k: number) => (start + k) % n;
    const stack: [number, number][] = [[0, m - 1]];
    while (stack.length > 0) {
      const [s, e] = stack.pop()!;
      const A = points[idxAt(s)];
      const B = points[idxAt(e)];
      let maxD = -1;
      let maxI = -1;
      for (let k = s + 1; k < e; k++) {
        const d = segmentDistance(points[idxAt(k)], A, B);
        if (d > maxD) {
          maxD = d;
          maxI = k;
        }
      }
      if (maxD > toleranceMm) {
        keep[idxAt(maxI)] = 1;
        stack.push([s, maxI], [maxI, e]);
      }
    }
  };
  simplifyStretch(a1, a0);
  simplifyStretch(a0, a1);

  // assemble survivors in ring order, starting at anchor a1
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const i = (a1 + k) % n;
    if (keep[i]) out.push(points[i]);
  }
  return out.length >= 3 ? out : points.slice();
}