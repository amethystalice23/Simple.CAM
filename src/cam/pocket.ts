/**
 * 2.5D pocket clearing (PLAN.md Phase 1): stepped Z levels, contour-parallel
 * tool-center passes inset from the region (Clipper offsets, see clipper.ts).
 * Regions are machine-space XY contours (outer CCW, holes CW). v1 plunges
 * straight at each pass start (helical entry later).
 */

import type { Move, PocketOp, Tool, Vec2 } from '../core/types';
import { offsetInward } from './clipper';
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
  if (offsetInward(op.regions, toolR).length === 0) {
    throw new Error(`tool Ø${tool.diameter} does not fit the pocket region`);
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

  for (const levelZ of levels) {
    const approachZ = Math.max(levelZ, standingZ) + APPROACH_CLEARANCE;
    // passes from the wall inward in stepOver increments, until the region
    // vanishes under the offset
    for (let k = 0; k < 10000; k++) {
      const loops = offsetInward(op.regions, toolR + k * op.stepOver);
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

        // travel first at the machine's existing height (after a tool
        // change that is the swap macro's high park — never a diagonal
        // descent across the table), then descend at the destination
        moves.push({
          words: { x: start.x, y: start.y },
          feed: 0,
          rapid: true,
          comment: `level z${levelZ.toFixed(2)} pass ${k + 1}`,
        });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        // rapid down to the approach plane (clear of the standing material),
        // then feed the last stretch
        moves.push({ words: { z: approachZ }, feed: 0, rapid: true });
        moves.push({
          words: { z: levelZ },
          feed: op.plungeFeed,
          comment: `plunge ${(op.topZ - levelZ).toFixed(2)}mm below surface`,
        });
        minutes += (approachZ - levelZ) / op.plungeFeed;

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
    // this level cleared its region down to levelZ — the next level's
    // plunges meet nothing above that
    standingZ = levelZ;
  }

  return { moves, levels: levels.length, passes, estimatedMinutes: minutes, droppedLoops };
}