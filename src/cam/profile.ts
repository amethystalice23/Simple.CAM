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
import { intersection, offsetInward, offsetOutward } from './clipper';
import { arcTable, helicalDescentFits, rampEntry, type EntryMode } from './entry';
import { APPROACH_CLEARANCE, rotateToNearest, zLadder } from './paths';
import { extractClipIntervals, pointAtArc } from './clipUtils';

export interface ProfileResult {
  moves: Move[];
  levels: number;
  /** wall passes cut (levels × offset loops) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** non-fatal notes: tab counts clamped, loops too short for tabs, … */
  warnings: string[];
  /** how each pass entered: helical / zigzag ramps, straight plunges */
  entries: Record<EntryMode, number>;
  /**
   * Loops that took CONTINUOUS DESCENT (Alice's B, 2026-10-29): the
   * stepped ladder collapsed into one helical descent along the loop
   * plus a final full-depth lap — no per-level re-entry at all.
   */
  continuous: number;
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
  clip: [number, number][] | null;
}

/** Area of a closed polygon (signed). */
function calculateArea(loop: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    area += p.x * q.y - q.x * p.y;
  }
  return Math.abs(area) / 2;
}

/** Loop points strictly after arc `s0` up to and including `s1` (which may
 *  wrap past the perimeter): interior vertices kept whole, the end point
 *  interpolated on its segment. The start is NOT included — the entry
 *  already sits there. Wrapped-span vertices behind s0 come around one
 *  perimeter later, so hits are collected then sorted by TRAVEL arc —
 *  base-arc order jumps ahead and back on spans holding vertices on both
 *  sides of the wrap (dense contours; invisible on coarse squares). */
function spanPoints(loop: Vec2[], cum: number[], s0: number, s1: number): Vec2[] {
  const n = loop.length;
  const P = cum[n];
  const hits: { a: number; k: number }[] = [];
  for (let k = 0; k < n; k++) {
    const base = cum[k];
    if (base >= s1 - 1e-9) break;
    const a = base <= s0 + 1e-9 ? base + P : base;
    if (a >= s1 - 1e-9) continue;
    hits.push({ a, k });
  }
  hits.sort((u, v) => u.a - v.a);
  const pts = hits.map(({ k }) => loop[k]);
  pts.push(pointAtArc(loop, cum, s1));
  return pts;
}

export function profile2d(op: ProfileOp, tool: Tool): ProfileResult {
  if (op.contours.length === 0) throw new Error('profile needs at least one contour');
  // top == floor is legal: a single level at the floor (finishing pass)
  if (op.floorZ > op.topZ) throw new Error('floorZ must not be above topZ');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  // SIDE allowance is SIGNED (Alice, 2026-10-28 — the split): negative
  // steps the tool-center path INSIDE the contour, turning a boss down
  // below its modeled Ø (the thread prep lands the crest at
  // nominal − 2·tolerance); the path offset is toolR + sideAllowance,
  // whichever sign. The old single-allowance clamp is gone — the prep
  // insert no longer needs it, and the floor/bottom split carries the
  // forced-≥0 rule where it belongs (jobGeneration).
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
    const offset = toolR + op.sideAllowance;
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

    // Footprint clip intervals
    let clip: [number, number][] | null = null;
    if (op.footprint && op.footprint.length > 0) {
      const clipped = intersection([loop], op.footprint);
      // Entirely inside check: relative area difference < 1e-6
      const isEntirelyInside = clipped.length === 1 &&
        Math.abs(calculateArea(clipped[0]) - calculateArea(loop)) / calculateArea(loop) < 1e-6;

      if (!isEntirelyInside) {
        clip = extractClipIntervals(loop, cum, op.footprint);
        if (clip.length === 0) {
          warnings.push('loop lies outside the declared stock — nothing to cut there');
        }
      }
    }

    return { loop, cum, perimeter: cum[loop.length], tabs: resolved, clip };
  });

  const levels = zLadder(op.topZ, op.floorZ, op.stepDown);
  const safeZ = op.topZ + op.safeClearance;
  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let passes = 0;
  let minutes = 0;
  // the level entries' approach plane rides ABOVE STANDING MATERIAL —
  // the pocket2d convention (its 2026-10-26 yellow-streak fix): level 1
  // stands at the surface (topZ), each later level at the PREVIOUS
  // level's cut, so the approach rapid ends standing + clearance and
  // the G1 plunge feeds the honest descent. profile2d's old
  // `levelZ + clearance` rapid ended 0.5 INSIDE the standing wall at
  // every level start — a rapid removing stock, a yellow streak down
  // the side one entry wide (Alice's 2026-10-28 sim report: 84 voxels
  // × 10 levels).
  let prevCut = op.topZ;
  const entries: Record<EntryMode, number> = { helical: 0, zigzag: 0, plunge: 0 };
  let continuous = 0;

  // CONTINUOUS DESCENT (Alice's B, 2026-10-29): a loop that every level
  // would cut FULL and unbroken — no tabs, no stock-clip spans, real
  // material above (not the finishing assumption), and a helical
  // descent that fits without degenerating — collapses the stepped
  // ladder into ONE descent along the loop plus a final full-depth lap.
  // The wall is finished identically: every Z of it gets its final cut
  // from the tool at that Z, from the descent's revolutions instead of
  // the ladder's laps. Mode resolves by geometry alone, like the entry
  // ladder (no knob); anything else keeps the stepped ladder below.
  const steppedGeos: LoopGeo[] = [];
  const continuousGeos: LoopGeo[] = [];
  for (const geo of geos) {
    const descent = op.topZ + APPROACH_CLEARANCE - op.floorZ;
    const qualifies =
      geo.tabs === null &&
      geo.clip === null &&
      !op.finishingOnly &&
      helicalDescentFits(geo.perimeter, descent, op.stepDown);
    (qualifies ? continuousGeos : steppedGeos).push(geo);
  }

  // The stepped ladder stays LEVEL-major: prevCut is shared standing-
  // material state across geos per level, and geo-major would make a
  // later geo's approach assume an earlier geo's floor.
  for (const levelZ of levels) {
    // below the tab top the groove is interrupted; at/above it the loop
    // cuts through the bridge material unbroken
    const spannedByTabs = tabs !== null && !tabsNoOp && levelZ < tabTop - 1e-9;

    for (const geo of steppedGeos) {
      const { loop, cum, perimeter: P, tabs: loopTabs, clip } = geo;

      // Combine clip intervals and tab intervals
      let activeIntervals: [number, number][] = [];
      if (clip === null) {
        // No clipping or entirely inside
        if (spannedByTabs && loopTabs) {
          const t = loopTabs;
          const spanLen = P / t.n - 2 * t.half;
          for (let k = 0; k < t.n; k++) {
            const s0 = ((k + 0.5) * P) / t.n + t.half;
            const s1 = s0 + spanLen;
            activeIntervals.push([s0, s1]);
          }
        } else {
          activeIntervals = [[0, P]];
        }
      } else {
        // Clipped to footprint. A tab span may WRAP past the perimeter (its
        // s1 legitimately exceeds P) — split wrapping intervals at P before
        // intersecting, or the wrapped overlap with the stock clip silently
        // drops (raw max/min sees numbers, not arcs).
        const splitWrap = (list: [number, number][]): [number, number][] => {
          const out: [number, number][] = [];
          for (const [s0, s1] of list) {
            if (s1 > P) out.push([s0, P], [0, s1 - P]);
            else out.push([s0, s1]);
          }
          return out;
        };
        const clips = splitWrap(clip);
        if (spannedByTabs && loopTabs) {
          const t = loopTabs;
          const spanLen = P / t.n - 2 * t.half;
          const tabIntervals: [number, number][] = [];
          for (let k = 0; k < t.n; k++) {
            const s0 = ((k + 0.5) * P) / t.n + t.half;
            tabIntervals.push([s0, s0 + spanLen]);
          }
          const tabSpans = splitWrap(tabIntervals);
          // Intersect clip intervals with tab intervals
          for (const [cs0, cs1] of clips) {
            for (const [ts0, ts1] of tabSpans) {
              const s0 = Math.max(cs0, ts0);
              const s1 = Math.min(cs1, ts1);
              if (s1 > s0 + 1e-9) activeIntervals.push([s0, s1]);
            }
          }
        } else {
          activeIntervals = clips;
        }
      }

      if (activeIntervals.length === 0) {
        continue;
      }

      if (activeIntervals.length === 1 && activeIntervals[0][0] <= 1e-9 && activeIntervals[0][1] >= P - 1e-9) {
        // Unclipped loop: today's emission. A tabbed loop keeps its CANONICAL
        // start (tab arc positions must not drift between levels); only
        // untabbed loops rotate to the nearest vertex to save travel.
        const rotatedLoop = geo.tabs ? loop : rotateToNearest(loop, cur);
        const start: Vec2 = rotatedLoop[0];
        const levelTag = `level z${levelZ.toFixed(2)}`;

        moves.push({
          words: { x: start.x, y: start.y },
          feed: 0,
          rapid: true,
          comment: levelTag,
        });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        const approach = Math.max(levelZ, prevCut) + APPROACH_CLEARANCE;
        moves.push({ words: { z: approach }, feed: 0, rapid: true });
        // FEED the entry along the loop (helical descent) — never a
        // straight plunge into standing material (entry.ts)
        const cum = geo.tabs ? geo.cum : arcTable(rotatedLoop);
        const entry = rampEntry({
          loop: rotatedLoop,
          cum,
          sStart: 0,
          stretch: cum[rotatedLoop.length],
          closed: true,
          // finishing-only assumes the bulk above is gone — air entry
          band: op.finishingOnly ? 0 : prevCut - levelZ,
          fromZ: approach,
          toZ: levelZ,
          stepDown: op.stepDown,
          feed: op.plungeFeed,
        });
        moves.push(...entry.moves);
        minutes += entry.minutes;
        entries[entry.mode]++;

        let prev = start;
        for (let i = 1; i <= rotatedLoop.length; i++) {
          const p = rotatedLoop[i % rotatedLoop.length];
          moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
          minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
          prev = p;
        }

        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        cur = start;
        prevCut = levelZ;
      } else {
        // Cut as open spans
        const levelTag = `level z${levelZ.toFixed(2)}`;
        for (let i = 0; i < activeIntervals.length; i++) {
          const [s0, s1] = activeIntervals[i];
          const from = pointAtArc(loop, cum, s0);

          moves.push({
            words: { x: from.x, y: from.y },
            feed: 0,
            rapid: true,
            comment: `${levelTag} span ${i + 1}/${activeIntervals.length}`,
          });
          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          const approach = Math.max(levelZ, prevCut) + APPROACH_CLEARANCE;
          moves.push({ words: { z: approach }, feed: 0, rapid: true });
          // FEED the entry as a zigzag over the first stretch of the span —
          // it stays inside [s0, s1], never cutting a tab bridge or leaving
          // the declared stock (entry.ts)
          const entry = rampEntry({
            loop,
            cum,
            sStart: s0,
            stretch: s1 - s0,
            closed: false,
            // finishing-only assumes the bulk above is gone — air entry
            band: op.finishingOnly ? 0 : prevCut - levelZ,
            fromZ: approach,
            toZ: levelZ,
            stepDown: op.stepDown,
            feed: op.plungeFeed,
          });
          moves.push(...entry.moves);
          minutes += entry.minutes;
          entries[entry.mode]++;

          let prev = from;
          for (const p of spanPoints(loop, cum, s0, s1)) {
            moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
            minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
            prev = p;
          }

          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          cur = prev;
        }
        prevCut = levelZ;
      }
      passes++;
    }
  }

  // the continuous-descent loops run AFTER the stepped ladder, each on
  // its own full depth — they share nothing with prevCut (their material
  // is untouched until they run, so they approach from the surface)
  for (const geo of continuousGeos) {
    const rotatedLoop = rotateToNearest(geo.loop, cur);
    const start: Vec2 = rotatedLoop[0];
    const cum = arcTable(rotatedLoop);
    const approach = op.topZ + APPROACH_CLEARANCE;

    moves.push({
      words: { x: start.x, y: start.y },
      feed: 0,
      rapid: true,
      comment: `continuous descent to z${op.floorZ.toFixed(2)}`,
    });
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    moves.push({ words: { z: approach }, feed: 0, rapid: true });
    // the whole ladder in one helical descent along the loop — the same
    // rampEntry machinery, toZ the floor (per-revolution band ≤ stepDown
    // by construction, pinned by assertRampBands)
    const entry = rampEntry({
      loop: rotatedLoop,
      cum,
      sStart: 0,
      stretch: cum[rotatedLoop.length],
      closed: true,
      band: op.topZ - op.floorZ,
      fromZ: approach,
      toZ: op.floorZ,
      stepDown: op.stepDown,
      feed: op.plungeFeed,
    });
    moves.push(...entry.moves);
    minutes += entry.minutes;
    entries[entry.mode]++;
    // the final full-depth lap — the wall's last cut, exactly the lap
    // the stepped ladder would have finished on
    let prev = start;
    for (let i = 1; i <= rotatedLoop.length; i++) {
      const p = rotatedLoop[i % rotatedLoop.length];
      moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
      minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
      prev = p;
    }
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    cur = start;
    passes++;
    continuous++;
  }

  return { moves, levels: levels.length, passes, estimatedMinutes: minutes, warnings, entries, continuous };
}