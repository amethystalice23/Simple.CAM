/**
 * 2.5D pocket clearing (PLAN.md Phase 1): stepped Z levels, contour-parallel
 * tool-center passes inset from the region (Clipper offsets, see clipper.ts).
 * Regions are machine-space XY contours (outer CCW, holes CW). Entries ramp
 * along the loop — helical descent, straight plunge only through air
 * (entry.ts, gap-analysis #4).
 */

import type { Move, PocketOp, Tool, Vec2 } from '../core/types';
import {
  difference,
  intersection,
  offsetInward,
  offsetOutward,
  offsetSegment,
  totalArea,
  union,
} from './clipper';
import { arcTable, rampEntry, type EntryMode } from './entry';
import { APPROACH_CLEARANCE, rotateToNearest, zLadder } from './paths';

export interface PocketResult {
  moves: Move[];
  /** number of Z levels cut */
  levels: number;
  /** total clearing loops cut (levels × inset passes × loops) */
  passes: number;
  /** clearing time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /**
   * Loops dropped by `opts.minLoopPerimeter` (summed over levels). The
   * caller decides whether that is worth reporting; 0 when no threshold.
   */
  droppedLoops: number;
  /** how each pass entered: helical / zigzag ramps, straight plunges */
  entries: Record<EntryMode, number>;
  /**
   * Stay-down links cut (Alice, 2026-10-29): passes that fed straight to
   * their start at depth instead of retracting — each one provably
   * removed nothing the adjacent passes were not going to remove.
   */
  links: number;
}

/**
 * The STAY-DOWN LINK SAFETY TEST (Alice's condition, 2026-10-29: only
 * link when the material is cleared): the link's swept capsule must lie
 * inside the union of the bands swept by the passes already cut at this
 * level PLUS the target pass's own band. The link may cross a sliver of
 * not-yet-cleared band, but never anything the adjacent passes were not
 * going to remove anyway — and never a wall, an island, or virgin stock
 * (those lie outside the union and the test rejects the link, falling
 * back to retract + ramp). Exact Clipper booleans, no sampling error;
 * the µm-grid noise floor is absorbed by LINK_AREA_EPS.
 */
const LINK_AREA_EPS = 1e-4; // mm²

/** Signed polygon area (shoelace) — CCW positive. */
function signedArea(loop: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * The band swept by a cut pass: the loop dilated by the tool radius.
 * Orientation is forced CCW — a CW ring (an island orbit) SHRINKS under
 * a plain outward offset, but the band is orientation-free geometry.
 */
function bandOf(loop: Vec2[], toolR: number): Vec2[][] {
  return offsetOutward([signedArea(loop) < 0 ? [...loop].reverse() : loop], toolR);
}

/** True when the straight link from→to provably cuts nothing extra. */
function linkIsClear(from: Vec2, to: Vec2, toolR: number, clearedBands: Vec2[][], target: Vec2[]): boolean {
  const safe = union([...clearedBands, ...bandOf(target, toolR)]);
  const rest = difference(offsetSegment(from, to, toolR), safe);
  return totalArea(rest) <= LINK_AREA_EPS;
}

export interface PocketOptions {
  /**
   * Drop closed clearing passes whose perimeter is below this, mm. A pass
   * shorter than the tool's own diameter spends more time plunging than
   * cutting, and removes at most a lens narrower than the tool — a
   * sliver of a pinched region (wall-tessellation noise on a near-exact
   * fit), not a shape anyone asked for. The stock it would have taken
   * stays standing, thinner than the tool can usefully reach. Roughing
   * ops want this; a pocket small enough to need sub-tool-Ø loops is
   * really a "does not fit" the caller should surface instead.
   */
  minLoopPerimeter?: number;
}

export function pocket2d(op: PocketOp, tool: Tool, opts: PocketOptions = {}): PocketResult {
  if (op.regions.length === 0) throw new Error('pocket needs at least one region contour');
  // top == floor is legal: a single level at the floor (finishing pass,
  // where roughing already removed everything above)
  if (op.floorZ > op.topZ) throw new Error('floorZ must not be above topZ');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.stepOver <= 0) throw new Error('stepOver must be positive');
  const toolR = tool.diameter / 2;

  const levels = zLadder(op.topZ, op.floorZ, op.stepDown);

  // sanity: the tool must fit in the region at all
  const effectiveRegions = (op.footprint && op.footprint.length > 0)
    ? intersection(op.regions, op.footprint)
    : op.regions;

  if (offsetInward(effectiveRegions, toolR).length === 0) {
    throw new Error(`tool Ø${tool.diameter} does not fit the pocket region${op.footprint?.length ? ' (clamped to stock)' : ''}`);
  }

  const safeZ = op.travelZ ?? op.topZ + op.safeClearance;
  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let passes = 0;
  let minutes = 0;
  let droppedLoops = 0;
  // the highest material a plunge in this level can meet: the surface at the
  // first level, the previous level's cut plane after that (this level's
  // region was cleared down to it). The approach rapid must stop
  // APPROACH_CLEARANCE above THIS, not above the cut level — a step-down
  // taller than the clearance had the rapid itself plowing the band at every
  // loop start (the yellow streak at each contour's plunge, Alice 2026-10-26)
  let standingZ = op.topZ;
  const entries: Record<EntryMode, number> = { helical: 0, zigzag: 0, plunge: 0 };
  // stay-down state: after a pass the tool RESTS at `cur` at `restZ` — the
  // retract is deferred so the next pass of the same level may link at
  // depth. restZ survives across levels (a cross-level link would descend
  // diagonally at an uncontrolled ramp angle, so it never qualifies —
  // but the down-state must still flush the retract); clearedBands are
  // per-level (bands swept at another level are not clear here).
  let restZ: number | null = null;
  let clearedBands: Vec2[][] = [];
  let links = 0;

  for (const levelZ of levels) {
    const approachZ = Math.max(levelZ, standingZ) + APPROACH_CLEARANCE;
    clearedBands = [];
    // passes from the wall inward in stepOver increments, until the region
    // vanishes under the offset
    for (let k = 0; k < 10000; k++) {
      let loops = offsetInward(op.regions, toolR + k * op.stepOver);
      if (op.footprint && op.footprint.length > 0) {
        loops = intersection(loops, op.footprint);
      }
      if (loops.length === 0) break;

      for (const raw of loops) {
        // a closed pass shorter than the threshold is pinch noise, not
        // clearing (see PocketOptions.minLoopPerimeter)
        if (opts.minLoopPerimeter !== undefined) {
          let perim = 0;
          for (let i = 0; i < raw.length; i++) {
            const p = raw[i];
            const q = raw[(i + 1) % raw.length];
            perim += Math.hypot(q.x - p.x, q.y - p.y);
          }
          if (perim < opts.minLoopPerimeter) {
            droppedLoops++;
            continue;
          }
        }
        const loop = rotateToNearest(raw, cur);
        const start = loop[0];
        const rest = restZ === levelZ ? cur : null;

        if (rest !== null && linkIsClear(rest, start, toolR, clearedBands, loop)) {
          // STAY DOWN: feed straight to the next pass's start at depth —
          // provably nothing the adjacent passes wouldn't remove anyway.
          // No entry at all: the tool is already at the cut level there.
          moves.push({
            words: { x: start.x, y: start.y },
            feed: op.feed,
            comment: `level z${levelZ.toFixed(2)} pass ${k + 1} — stay-down link`,
          });
          minutes += Math.hypot(start.x - rest.x, start.y - rest.y) / op.feed;
          links++;
        } else {
          // retract the deferred previous pass, then travel first at the
          // machine's existing height (after a tool change that is the
          // swap macro's high park — never a diagonal descent across the
          // table), then descend at the destination
          if (restZ !== null) {
            moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          }
          moves.push({
            words: { x: start.x, y: start.y },
            feed: 0,
            rapid: true,
            comment: `level z${levelZ.toFixed(2)} pass ${k + 1}`,
          });
          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          // rapid down to the approach plane (clear of the standing material),
          // then FEED the entry: a helical descent along the loop itself —
          // never a straight plunge into material (entry.ts)
          moves.push({ words: { z: approachZ }, feed: 0, rapid: true });
          const cum = arcTable(loop);
          const entry = rampEntry({
            loop,
            cum,
            sStart: 0,
            stretch: cum[loop.length],
            closed: true,
            // finishing-only assumes the bulk above is gone — the entry is
            // through air and plunges straight (the finishingOnly convention)
            band: op.finishingOnly ? 0 : standingZ - levelZ,
            fromZ: approachZ,
            toZ: levelZ,
            stepDown: op.stepDown,
            feed: op.plungeFeed,
          });
          moves.push(...entry.moves);
          minutes += entry.minutes;
          entries[entry.mode]++;
        }

        let prev = start;
        for (let i = 1; i <= loop.length; i++) {
          const p = loop[i % loop.length];
          moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
          minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
          prev = p;
        }

        cur = start;
        restZ = levelZ;
        clearedBands = union([...clearedBands, ...bandOf(loop, toolR)]);
        passes++;
      }
    }
    // this level cleared its region down to levelZ — the next level's
    // plunges meet nothing above that
    standingZ = levelZ;
  }

  // the final pass's retract is deferred like all the others
  if (restZ !== null) {
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
  }

  return {
    moves,
    levels: levels.length,
    passes,
    estimatedMinutes: minutes,
    droppedLoops,
    entries,
    links,
  };
}