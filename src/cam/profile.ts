/**
 * 2.5D profile pass (PLAN.md Phase 1): follow a contour with the tool
 * center offset to one side — outside (cut around a boss), inside (bore
 * along a hole rim), or online (cut on the line, engrave-like). One pass
 * per Z level; multi-radial roughing into a wall is a later refinement.
 *
 * Cut-out TABS (hold-down bridges) are op-level geometry: levels at or
 * above the tab top cut the full loop (the material above the bridges is
 * mopped up), deeper levels cut only the spans between them. Tab positions
 * are arc-length based and independent of the loop's starting vertex, so
 * they line up level to level — which is why a tabbed loop keeps the
 * canonical Clipper start instead of rotating to the nearest vertex.
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
  /** non-fatal notes: tab counts clamped, loops too short for tabs, … */
  warnings: string[];
}

/** Tabs resolved for ONE offset loop: how many fit and their half-length. */
interface LoopTabs {
  n: number;
  half: number;
}

/** Per-loop geometry cached across levels (arc table + resolved tabs). */
interface LoopGeo {
  loop: Vec2[];
  /** cum[i] = arc length at loop[i]; cum[n] = full perimeter */
  cum: number[];
  perimeter: number;
  tabs: LoopTabs | null;
}

/** Arc-length table of a closed loop (last entry closes back to vertex 0). */
function arcTable(loop: Vec2[]): number[] {
  const cum = [0];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cum;
}

/** Point at arc length `s` along the loop, interpolated on its segment
 *  (`s` wraps past the perimeter; binary search — relief-slice loops run
 *  to tens of thousands of vertices). */
function pointAtArc(loop: Vec2[], cum: number[], s: number): Vec2 {
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

/** Loop points strictly after arc `s0` up to and including `s1` (which may
 *  wrap past the perimeter): interior vertices kept whole, the end point
 *  interpolated on its segment. The start is NOT included — the plunge
 *  already sits there. */
function spanPoints(loop: Vec2[], cum: number[], s0: number, s1: number): Vec2[] {
  const n = loop.length;
  const P = cum[n];
  const pts: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const base = cum[k];
    if (base >= s1 - 1e-9) break; // past the span end; every later vertex is too
    // a vertex behind the start comes around again one perimeter later
    const a = base <= s0 + 1e-9 ? base + P : base;
    if (a >= s1 - 1e-9) continue;
    pts.push(loop[k]);
  }
  pts.push(pointAtArc(loop, cum, s1));
  return pts;
}

export function profile2d(op: ProfileOp, tool: Tool): ProfileResult {
  if (op.contours.length === 0) throw new Error('profile needs at least one contour');
  // top == floor is legal: a single level at the floor (finishing pass)
  if (op.floorZ > op.topZ) throw new Error('floorZ must not be above topZ');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.allowance < 0) throw new Error('allowance must be >= 0');
  if (op.tabs) {
    if (!Number.isInteger(op.tabs.count) || op.tabs.count < 1) {
      throw new Error('tab count must be an integer >= 1');
    }
    if (op.tabs.height <= 0) throw new Error('tab height must be > 0');
    if (op.tabs.length <= 0) throw new Error('tab length must be > 0');
  }
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

  const tabs = op.tabs ?? null;
  // the tab top sits `height` above the floor; levels at or above it cut
  // through unbroken. Reaching to/above the surface leaves no bridge
  // standing anywhere — say so and cut like tabs were never asked for.
  const tabTop = tabs ? op.floorZ + tabs.height : -Infinity;
  const tabsNoOp = tabs !== null && tabTop >= op.topZ - 1e-9;

  const warnings: string[] = [];
  if (tabsNoOp) {
    warnings.push('tab height reaches above the cut band — no bridges left standing');
  }

  // resolve tab placement per loop, once — arc positions must not drift
  // between levels, so a tabbed loop keeps its canonical start everywhere
  const geos: LoopGeo[] = paths.map((loop) => {
    const cum = arcTable(loop);
    let resolved: LoopTabs | null = null;
    if (tabs && !tabsNoOp) {
      const P = cum[loop.length];
      // (P − ε)/length: an exact fit would space the tabs edge to edge and
      // leave nothing to cut between them, so the last one drops off
      const fits = Math.floor((P - 1e-9) / tabs.length);
      if (fits < 1) {
        warnings.push('loop too short for tabs — cut through uncut');
      } else {
        if (fits < tabs.count) {
          warnings.push(`tab count clamped to ${fits} on a ${P.toFixed(1)}mm loop`);
        }
        resolved = { n: Math.min(tabs.count, fits), half: tabs.length / 2 };
      }
    }
    return { loop, cum, perimeter: cum[loop.length], tabs: resolved };
  });

  const levels = zLadder(op.topZ, op.floorZ, op.stepDown);
  const safeZ = op.topZ + op.safeClearance;
  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let passes = 0;
  let minutes = 0;

  for (const levelZ of levels) {
    // below the tab top the groove is interrupted; at/above it the loop
    // cuts through the bridge material unbroken
    const spanned = tabs !== null && !tabsNoOp && levelZ < tabTop - 1e-9;

    for (const geo of geos) {
      const loop: Vec2[] = geo.tabs ? geo.loop : rotateToNearest(geo.loop, cur);
      const start: Vec2 = loop[0];
      const levelTag = `level z${levelZ.toFixed(2)}`;

      if (!(spanned && geo.tabs)) {
        // travel first at the machine's existing height (after a tool change
        // that is the swap macro's high park — never a diagonal descent
        // across the table), then descend at the destination
        moves.push({
          words: { x: start.x, y: start.y },
          feed: 0,
          rapid: true,
          comment: levelTag,
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
      } else {
        // deep level: cut only the spans between the tabs. Tab k covers the
        // arc interval around (k + ½)·P/n — the half-interval offset keeps
        // a tab from ever straddling the loop start — so span k runs from
        // that tab's trailing edge to the next tab's leading edge.
        const { cum, perimeter: P } = geo;
        const t = geo.tabs;
        const spanLen = P / t.n - 2 * t.half;
        for (let k = 0; k < t.n; k++) {
          const s0 = ((k + 0.5) * P) / t.n + t.half;
          const s1 = s0 + spanLen;
          const from = pointAtArc(loop, cum, s0);

          moves.push({
            words: { x: from.x, y: from.y },
            feed: 0,
            rapid: true,
            comment: `${levelTag} span ${k + 1}/${t.n}`,
          });
          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          moves.push({ words: { z: levelZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
          moves.push({
            words: { z: levelZ },
            feed: op.plungeFeed,
            comment: `plunge ${(op.topZ - levelZ).toFixed(2)}mm below surface`,
          });
          minutes += APPROACH_CLEARANCE / op.plungeFeed;

          let prev = from;
          for (const p of spanPoints(loop, cum, s0, s1)) {
            moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
            minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
            prev = p;
          }

          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          cur = prev;
        }
      }
      passes++;
    }
  }

  return { moves, levels: levels.length, passes, estimatedMinutes: minutes, warnings };
}