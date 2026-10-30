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
import { arcTable, boreDescentFits, rampEntry, type EntryMode } from './entry';
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
  /**
   * 1 when the whole pocket took CONTINUOUS DESCENT (the single
   * helical cut for one-orbit pockets — the entry is the roughing).
   */
  continuous: number;
  /**
   * The tool-center orbit loops that SURVIVED the minLoopPerimeter drop,
   * flattened over inset passes (STAGE C: the standing stamp's swept area
   * is built from these — sliver orbits never ran, so their bands must
   * not be claimed as swept; the region's morphological opening
   * over-claims exactly by them).
   */
  orbits: Vec2[][];
}

/**
 * The STAY-DOWN LINK SAFETY TEST (Alice's condition, 2026-10-29: only
 * link when the material is cleared) — TWO clauses, both exact:
 *
 * 1. SWEPT-FOOTPRINT: the link's swept capsule must lie inside the union
 *    of the bands swept by the passes already cut at this level PLUS the
 *    target pass's own band.
 * 2. REMAINING MATERIAL (her 2026-10-29 nose-chop report, move 10182 of
 *    Knight-2op: a 48mm link swept diagonally across the knight's nose and
 *    removed 2,372 voxels of standing model): the capsule must also lie
 *    inside the OP'S CLEARING REGIONS. The bands of clause 1 are 2D XY
 *    areas — a band swept at this level says nothing about the material
 *    STANDING ABOVE it, and a moat ring's bands (waterline levels) bridge
 *    right across a narrow keep-out island: a chord over the island's
 *    crown passes the band test while its flute column plows the nose.
 *    The clearing region is the keep-out-respecting area the level was
 *    TOLD to clear — a link crossing out of it is by definition cutting
 *    something the op did not intend. Exact Clipper booleans; the µm-grid
 *    noise floor is absorbed by LINK_AREA_EPS.
 */
const LINK_AREA_EPS = 1e-4; // mm²

/** True when the straight link from→to provably cuts nothing extra. */
function linkIsClear(
  from: Vec2,
  to: Vec2,
  toolR: number,
  clearedBands: Vec2[][],
  target: Vec2[],
  regions: Vec2[][],
): boolean {
  const safe = union([...clearedBands, ...bandOf(target, toolR)]);
  const rest = difference(offsetSegment(from, to, toolR), safe);
  if (totalArea(rest) > LINK_AREA_EPS) return false;
  const outside = difference(offsetSegment(from, to, toolR), regions);
  return totalArea(outside) <= LINK_AREA_EPS;
}

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
 * (Also builds the stage-C stamp's swept bands from PocketResult.orbits.)
 */
export function bandOf(loop: Vec2[], toolR: number): Vec2[][] {
  return offsetOutward([signedArea(loop) < 0 ? [...loop].reverse() : loop], toolR);
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
  /**
   * CLEARED-SPACE LEAD-IN (2026-10-30, the FreeCAD-validated rest-
   * machining pattern): true when the entry disc at (x, y) is provably
   * swept clear to `zSafe` by earlier passes. When provided, an orbit
   * whose start vertex is NOT clear looks for the nearest vertex whose
   * entry IS clear; if one exists within the loop, the pocket rapids
   * THERE, descends at band-top height (a true plunge through air),
   * and FEEDS along the loop to the material — the wall is engaged by
   * the peripheral edge, never the tip. Falls back to today's
   * raised-approach entry when no vertex qualifies. Absent = today's
   * emission, byte-identical.
   */
  leadIn?: {
    sweptClear: (zSafe: number, x: number, y: number, toolR: number) => boolean;
    /** the height the lead-in plunge descends to (the band top) */
    zSafe: number;
  };
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
  // the highest material a plunge in this level can meet: the surface at the
  // first level, the previous level's cut plane after that (this level's
  // region was cleared down to it). The approach rapid must stop
  // APPROACH_CLEARANCE above THIS, not above the cut level — a step-down
  // taller than the clearance had the rapid itself plowing the band at every
  // loop start (the yellow streak at each contour's plunge, Alice 2026-10-26)
  let standingZ = op.topZ;
  const entries: Record<EntryMode, number> = { helical: 0, zigzag: 0, plunge: 0 };

  // HOIST the pass structure: the insets are level-independent (the region
  // is the same at every level), so the surviving orbits are computed once —
  // every level cut the identical offsets, re-derived per level until now.
  // EVERY orbit is REVERSED for CLIMB milling (Alice's ruling, 2026-10-29:
  // always climb, no option — the machine target is modern stiff-frame
  // desktop CNC, where climb's full-thickness tooth entry shears cleaner
  // and conventional's zero-thickness rub is pure loss, the same rub
  // mechanism as the bore entry ramp-up she pinned). Clipper preserves
  // winding through the offset, so the orientation names the family: a
  // CCW result is an outer-wall orbit (material outside the loop — CW
  // travel puts the wall on the LEFT), a CW result grew from a hole
  // (island orbit, material inside — CCW travel puts the island on the
  // LEFT). Both families reverse, uniformly.
  const orbits: Vec2[][][] = [];
  let droppedRaw = 0;
  for (let k = 0; k < 10000; k++) {
    let loops = offsetInward(op.regions, toolR + k * op.stepOver);
    if (op.footprint && op.footprint.length > 0) {
      loops = intersection(loops, op.footprint);
    }
    if (loops.length === 0) break;
    loops = loops.map((raw) => [...raw].reverse());
    const surviving = loops.filter((raw) => {
      if (opts.minLoopPerimeter === undefined) return true;
      let perim = 0;
      for (let i = 0; i < raw.length; i++) {
        const p = raw[i];
        const q = raw[(i + 1) % raw.length];
        perim += Math.hypot(q.x - p.x, q.y - p.y);
      }
      if (perim < opts.minLoopPerimeter) return false;
      return true;
    });
    droppedRaw += loops.length - surviving.length;
    orbits.push(surviving);
  }
  // the threshold drops were counted once here — the contract counts them
  // SUMMED OVER LEVELS (every level drops the same orbits)
  const droppedLoops = droppedRaw * levels.length;
  const flatPassCount = orbits.reduce((n, o) => n + o.length, 0);

  // CONTINUOUS DESCENT — the single helical cut (Alice's Studio note,
  // 2026-10-28: small circular pockets cut as ONE helix; slope ruling
  // 2026-10-29: the STEP-DOWN sets the steepness — per-rev descent is
  // the step-down, the slope follows from the perimeter). A pocket whose
  // whole clearable area is ONE orbit has no interior left to clear: the
  // orbit's band covers everything the tool can reach, so its ladder
  // collapses into one helical descent along the orbit plus the floor
  // lap — the entry IS the roughing. The only zero-chip-load stretch is
  // the first revolution's ramp-up; every turn after cuts a full
  // step-down band. Requires a real multi-level ladder (single-level
  // callers like the waterline bands keep today's emission
  // byte-identically), real material above (not the finishing
  // assumption), and a loop long enough to ramp at all.
  if (
    flatPassCount === 1 &&
    orbits[0].length === 1 &&
    levels.length > 1 &&
    !op.finishingOnly &&
    boreDescentFits(arcTable(orbits[0][0])[orbits[0][0].length], op.stepDown)
  ) {
    const loop = orbits[0][0];
    const start = loop[0];
    const cum = arcTable(loop);
    const approach = op.topZ + APPROACH_CLEARANCE;
    moves.push({
      words: { x: start.x, y: start.y },
      feed: 0,
      rapid: true,
      comment: `continuous descent to z${op.floorZ.toFixed(2)}`,
    });
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    moves.push({ words: { z: approach }, feed: 0, rapid: true });
    const entry = rampEntry({
      loop,
      cum,
      sStart: 0,
      stretch: cum[loop.length],
      closed: true,
      band: op.topZ - op.floorZ,
      fromZ: approach,
      toZ: op.floorZ,
      stepDown: op.stepDown,
      feed: op.plungeFeed,
      bore: true,
    });
    moves.push(...entry.moves);
    minutes += entry.minutes;
    entries[entry.mode]++;
    // the floor lap — the orbit's final full pass, exactly the lap the
    // stepped ladder would have finished on
    let prev = start;
    for (let i = 1; i <= loop.length; i++) {
      const p = loop[i % loop.length];
      moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
      minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
      prev = p;
    }
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    return {
      moves,
      levels: levels.length,
      passes: 1,
      estimatedMinutes: minutes,
      droppedLoops,
      entries,
      links: 0,
      continuous: 1,
      orbits: [loop],
    };
  }

  // stay-down state: after a pass the tool RESTS at `cur` at `restZ` — the
  // retract is deferred so the next pass of the same level may link at
  // depth. restZ survives across levels (a cross-level link would descend
  // diagonally at an uncontrolled ramp angle, so it never qualifies —
  // but the down-state must still flush the retract); clearedBands are
  // per-level (bands swept at another level are not clear here).
  let restZ: number | null = null;
  let clearedBands: Vec2[][] = [];
  let links = 0;
  let leadIns = 0;

  for (const levelZ of levels) {
    // the entry-disc ceiling (trimmed standing material the ladder never
    // cleared) raises the approach plane above the standing surface when
    // the caller knows one — absent, max() is a no-op on -Infinity
    const entryTop = Math.max(standingZ, op.approachCeiling ?? -Infinity);
    const approachZ = Math.max(levelZ, entryTop) + APPROACH_CLEARANCE;
    clearedBands = [];
    // passes from the wall inward in stepOver increments, until the region
    // vanishes under the offset
    for (let k = 0; k < orbits.length; k++) {
      for (const raw of orbits[k]) {
        const loop = rotateToNearest(raw, cur);
        const start = loop[0];
        const rest = restZ === levelZ ? cur : null;

        // THE RAISED-APPROACH ENTRY (the pre-lead-in emission, verbatim)
        // — shared by the fallback and no-lead-in paths so hooks-absent
        // behavior stays byte-identical.
        const emitRaisedEntry = (retraveled: boolean): void => {
          if (!retraveled && restZ !== null) {
            moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          }
          moves.push({
            words: { x: start.x, y: start.y },
            feed: 0,
            rapid: true,
            comment: `level z${levelZ.toFixed(2)} pass ${k + 1}`,
          });
          moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
          moves.push({ words: { z: approachZ }, feed: 0, rapid: true });
          const cum = arcTable(loop);
          const entry = rampEntry({
            loop,
            cum,
            sStart: 0,
            stretch: cum[loop.length],
            closed: true,
            band: op.finishingOnly ? 0 : entryTop - levelZ,
            fromZ: approachZ,
            toZ: levelZ,
            stepDown: op.stepDown,
            feed: op.plungeFeed,
          });
          moves.push(...entry.moves);
          minutes += entry.minutes;
          entries[entry.mode]++;
        };


        if (rest !== null && linkIsClear(rest, start, toolR, clearedBands, loop, op.regions)) {
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
        } else if (
          opts.leadIn &&
          !op.finishingOnly &&
          !opts.leadIn.sweptClear(levelZ, start.x, start.y, toolR)
        ) {
          // CLEARED-SPACE LEAD-IN: the orbit start's entry disc would
          // touch standing material (the trim's boundary streamers — the
          // 2026-10-30 yellow-streak class). Find the loop vertex whose
          // entry disc IS provably swept clear with the SHORTEST feed-back
          // arc to the start, rapid there, plunge through air to the cut,
          // then FEED the remaining arc — the wall is engaged by the
          // peripheral edge (Alice's 2026-10-30 intent), never a
          // tip-plunge. No clear vertex = the raised approach below.
          const cum = arcTable(loop);
          const total = cum[loop.length];
          let lead: { idx: number; back: number } | null = null;
          for (let v = 0; v < loop.length; v++) {
            if (!opts.leadIn.sweptClear(levelZ, loop[v].x, loop[v].y, toolR)) continue;
            const back = (total - cum[v]) % total;
            if (!lead || back < lead.back) lead = { idx: v, back };
          }
          if (lead && lead.back > 1e-6) {
            if (restZ !== null) {
              moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
            }
            const entryPt = loop[lead.idx];
            moves.push({
              words: { x: entryPt.x, y: entryPt.y },
              feed: 0,
              rapid: true,
              comment: `level z${levelZ.toFixed(2)} pass ${k + 1} — cleared-space lead-in`,
            });
            moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
            // sweptClear proved the disc clear ALL THE WAY DOWN TO levelZ,
            // so both the rapid to min(zSafe, approachZ) and the plunge
            // to the cut are through proven air
            moves.push({ words: { z: Math.min(opts.leadIn.zSafe, approachZ) }, feed: 0, rapid: true });
            moves.push({ words: { z: levelZ }, feed: op.plungeFeed, comment: 'lead-in plunge through swept air' });
            // feed the arc from the lead vertex around to the start —
            // every point on it is the loop's own cut path
            let prevPt = entryPt;
            for (let s = lead.idx + 1; s < loop.length; s++) {
              const p = loop[s];
              moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
              minutes += Math.hypot(p.x - prevPt.x, p.y - prevPt.y) / op.feed;
              prevPt = p;
            }
            for (let s = 0; s < 1; s++) {
              moves.push({ words: { x: start.x, y: start.y }, feed: op.feed, comment: 'lead-in engage' });
              minutes += Math.hypot(start.x - prevPt.x, start.y - prevPt.y) / op.feed;
            }
            leadIns++;
          } else {
            // no clear vertex on this loop: the lead-in branch emitted
            // NOTHING (no retract, no travel) — the raised entry must do
            // both, exactly like the plain no-lead-in path
            emitRaisedEntry(false);
          }
        } else {
          emitRaisedEntry(false);
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
    continuous: 0,
    orbits: orbits.flat(),
  };
}