/**
 * Utility for profile clipping and interval extraction.
 */
import type { Vec2 } from '../core/types';

/** Even-odd point-in-polygon over a contour SET. */
export function insideContours(x: number, y: number, contours: Vec2[][]): boolean {
  let inside = false;
  for (const c of contours) {
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const yi = c[i].y;
      const yj = c[j].y;
      if ((yi > y) !== (yj > y) && x < ((c[j].x - c[i].x) * (y - yi)) / (yj - yi) + c[i].x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Point at arc length `s` along the loop.
 */
export function pointAtArc(loop: Vec2[], cum: number[], s: number): Vec2 {
  const n = loop.length;
  const P = cum[n];
  let t = s % P;
  if (t < 0) t += P;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  const i = lo;
  const segLen = cum[i + 1] - cum[i];
  if (segLen <= 0) return loop[i];
  const f = (t - cum[i]) / segLen;
  const a = loop[i];
  const b = loop[(i + 1) % n];
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
}

/**
 * Extract arc-length intervals [s0, s1] of a loop that lie INSIDE the
 * footprint, sampled at 0.05mm. CONSERVATIVE at both ends: an interval runs
 * from the first inside sample to the LAST inside sample, never onto an
 * outside one — the tool center can undershoot the stock edge by at most
 * one sample (0.05mm) but never leaves the declared stock, which is the
 * entire point of the clamp. Intervals shorter than 0.1mm drop.
 */
export function extractClipIntervals(
  loop: Vec2[],
  cum: number[],
  footprint: Vec2[][],
): [number, number][] {
  const P = cum[loop.length];
  const res = 0.05;
  const intervals: [number, number][] = [];
  let start: number | null = null;
  let lastInside = 0;

  for (let s = 0; s <= P + res; s += res) {
    const clampedS = Math.min(s, P);
    const p = pointAtArc(loop, cum, clampedS);
    const inside = insideContours(p.x, p.y, footprint);

    if (inside) {
      if (start === null) start = clampedS;
      lastInside = clampedS;
    } else if (start !== null) {
      if (lastInside - start >= 0.1) {
        intervals.push([start, lastInside]);
      }
      start = null;
    }
  }
  if (start !== null && lastInside - start >= 0.1) {
    intervals.push([start, lastInside]);
  }
  return intervals;
}
