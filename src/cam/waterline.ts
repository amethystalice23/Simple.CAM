/**
 * Waterline rough of a whole model (PLAN.md §"3D relief carving", Phase A):
 * constant-Z levels from the stock crown down to the model floor, each level
 * clearing the MODEL'S COLUMN — its XY silhouette grown by `margin` and
 * clipped to the stock footprint — minus the UPPER SHADOW: the union of
 * every cross-section at/above that level's cut plane (what blocks a
 * vertical tool from above, overhangs included), grown by the allowance. The rough stops at the model's boundary
 * (the coin workflow: rough the relief, then profile the coin out), so the
 * waste outside the column stays standing instead of milled to the floor —
 * and it stops CLIMBING DOWN the ladder at the first level that would cut
 * nothing but moat (see the moat-only stop below). The upper shadow makes
 * the stop structural: at the deepest cut plane the shadow IS the whole
 * silhouette, so that level is always moat-only and the ladder always
 * ends above it — the rough can never cut a part free, and the cut-out is
 * the profile op's job, tabs and all.
 *
 * BOTH-axis allowance (the Carvera omission, twice-flagged by Alice): the
 * floor allowance raises EVERY level's cut plane (the deeper levels' bands
 * re-clear the raised sliver, netting `allowance` of stock on the model
 * floor), and the side allowance insets every level's clearing region from
 * the MODEL contour at that level by one constant radial stock — never from
 * the previous level, so no taper is inherited downward.
 *
 * Pure 3-axis: G94 feeds only, no A words ever (that is the post's business
 * anyway). Honest about what a 3-axis machine cannot reach: bands that widen
 * upward (undercuts) are warned about, not silently mis-cut.
 */

import type { Move, PocketOp, Tool, Vec2 } from '../core/types';
import { difference, intersection, offsetOutward, union } from './clipper';
import { simplifyContour, zLadder } from './paths';
import { pocket2d } from './pocket';
import { sliceAtZ, buildZIndex, type SliceResult } from './slicing';

export interface WaterlineRoughOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  already datum-rotated by the caller when an Index op precedes) */
  positions: ArrayLike<number>;
  /** stock footprint in XY, outer CCW contours */
  footprint: Vec2[][];
  /** stock crown, machine Z — the ladder starts here */
  topZ: number;
  /** model floor, machine Z — the ladder ends here (caller already clamped
   *  to the stock bottom; must be below topZ or the generator throws) */
  floorZ: number;
  stepDown: number;
  stepOver: number;
  /** BOTH-axis roughing allowance, mm */
  allowance: number;
  /**
   * Clearance around the model's XY silhouette, mm — the rough stops at the
   * model's boundary instead of clearing the whole stock down to the floor.
   * Callers derive the default as tool Ø + allowance + step over: the moat
   * is then two tool passes wide, so its tool-center track keeps at least
   * one step-over of width even at the widest-section level where the
   * model-vs-silhouette gap collapses to wall-tessellation noise (±0.05mm
   * on a fine relief mesh — exactly one pass wide shatters there; see the
   * dropped-sliver warning below). The wall skin still comes from the
   * allowance growing the keep-out.
   */
  margin: number;
  tool: Tool;
  /** G94 mm/min */
  feed: number;
  plungeFeed: number;
  safeClearance: number;
}

export interface WaterlineRoughResult {
  moves: Move[];
  /** cut planes actually cut, machine Z, descending */
  levels: number[];
  /** total clearing loops (sum over levels) */
  passes: number;
  estimatedMinutes: number;
  /** open chains dropped by sliceAtZ, summed over levels */
  droppedChains: number;
  /** levels skipped because the clearing region vanished (the model section
   *  covers its whole silhouette column at that plane) */
  skippedLevels: number;
  /** human-readable, surfaced verbatim in the op panel */
  warnings: string[];
}

const fmt = (z: number): string => z.toFixed(2);

/**
 * Slice-contour simplification tolerance — far under any CAM tolerance; a
 * fine relief slice carries tens of thousands of vertices that make the
 * Clipper offsets take minutes. Applied at the single point contours
 * enter the generator, before any consumer touches them.
 */
const SLICE_SIMPLIFY_TOL = 0.01;

/** Total |area| of a contour set (shoelace, holes contribute positively). */
function totalArea(contours: Vec2[][]): number {
  let a = 0;
  for (const c of contours) {
    let s = 0;
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      s += p.x * q.y - q.x * p.y;
    }
    a += Math.abs(s / 2);
  }
  return a;
}

/** Signed shoelace area of one contour (positive = CCW). */
function signedAreaOf(c: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function waterlineRough(o: WaterlineRoughOptions): WaterlineRoughResult {
  if (!(o.floorZ < o.topZ)) {
    throw new Error('the model floor is at/above the stock crown — nothing to rough');
  }
  if (o.stepDown <= 0) throw new Error('stepDown must be positive');
  if (o.stepOver <= 0) throw new Error('stepOver must be positive');
  if (o.allowance < 0) throw new Error('allowance must not be negative');
  if (o.margin < 0) throw new Error('margin must not be negative');

  // nominal ladder z_1..z_n (z_n = floorZ); the band above level i is
  // [z_{i-1}, z_i] with z_0 = the crown. Cut planes sit allowance above the
  // nominal levels, so a plane can rise into its own band when the allowance
  // swallows the whole step (allowance ≥ stepDown) — those levels have
  // nothing left to clear and are counted as skipped.
  const nominal = zLadder(o.topZ, o.floorZ, o.stepDown);
  const bands = nominal.map((z, i) => ({
    bandTop: i === 0 ? o.topZ : nominal[i - 1],
    cut: z + o.allowance,
  }));

  // one slice per distinct plane: the cut plane of level i and the band top
  // of level i+1 share z_i when allowance is 0, so cache rather than re-slice.
  // The Z-span index is built once and shared by every plane — the O(levels)
  // slices below are what made a 50-level rough on a 235k-triangle relief
  // O(levels × triangles).
  const zIndex = buildZIndex(o.positions);
  const sliceCache = new Map<number, SliceResult>();
  const sliceAt = (z: number): SliceResult => {
    const hit = sliceCache.get(z);
    if (hit) return hit;
    const raw = sliceAtZ(o.positions, z, zIndex);
    // Simplify every contour right here — the single consumption point,
    // before the silhouette union, the undercut area comparison, the
    // offsetOutward keep-out, and the difference. droppedChains still counts
    // the RAW slice, so broken-mesh reporting is unaffected by
    // simplification. Orientation is normalized to CCW too: a mesh with
    // inverted facet windings slices to CW contours, which offsetOutward
    // would SHRINK — the keep-out would eat its own allowance and the
    // rough would gouge the model it is supposed to leave stock on.
    const s: SliceResult = {
      contours: raw.contours.map((c) => {
        const closed = simplifyContour(c, SLICE_SIMPLIFY_TOL);
        return signedAreaOf(closed) < 0 ? closed.slice().reverse() : closed;
      }),
      droppedChains: raw.droppedChains,
    };
    sliceCache.set(z, s);
    return s;
  };

  // The model's XY silhouette — its shadow on the stock — is the union of
  // the section contours over EVERY plane the ladder touches: each level's
  // cut plane (sliced up front; the per-level loop consumes the same cached
  // results) plus the band tops the undercut check slices anyway, which
  // only add overhang coverage to the shadow. Slicing everything up front
  // also makes droppedChains count every distinct plane exactly once.
  const shadowParts: Vec2[][][] = [];
  for (const b of bands) {
    shadowParts.push(sliceAt(b.cut).contours, sliceAt(b.bandTop).contours);
  }
  const silhouette = union(shadowParts.flat());
  let droppedChains = 0;
  for (const s of sliceCache.values()) droppedChains += s.droppedChains;

  // the rough's reach: the silhouette grown by the margin, clipped to the
  // stock footprint — the model's column, never the whole stock. A model
  // casting no shadow inside the footprint (placed off the stock, or wholly
  // above/below the range) reaches nothing and every level skips, honestly.
  const reach =
    silhouette.length === 0
      ? []
      : intersection(offsetOutward(silhouette, o.margin), o.footprint);

  const moves: Move[] = [];
  const levels: number[] = [];
  const warnings: string[] = [];
  let passes = 0;
  let minutes = 0;
  let skippedLevels = 0;
  let allowanceSkips = 0;
  let droppedSlivers = 0;
  let undercutWarned = false;

  const shadowPlanes = [...sliceCache.keys()].sort((a, b) => b - a);
  let shadowPtr = 0;
  /** union of all sections at/above the current cut plane (upper shadow) */
  let upperShadow: Vec2[][] = [];

  for (const { bandTop, cut } of bands) {
    if (cut >= bandTop) {
      skippedLevels++;
      allowanceSkips++;
      continue;
    }

    const slice = sliceAt(cut);

    // Undercut honesty check (warning only, no geometry change): a band whose
    // section at the top is LARGER than at the cut plane widens upward — the
    // 3-axis machine cannot reach under the overhang. Skipped when the cut
    // plane has no section at all (the band top then holds the model's top
    // face, not an undercut).
    if (!undercutWarned && slice.contours.length > 0) {
      const topArea = totalArea(sliceAt(bandTop).contours);
      const cutArea = totalArea(slice.contours);
      if (topArea > cutArea * (1 + 1e-9) + 1e-9) {
        warnings.push(
          `undercut between z${fmt(bandTop)} and z${fmt(cut)} — 3-axis roughing cannot reach under overhangs; check the preview`,
        );
        undercutWarned = true;
      }
    }

    // Clearing region: the model's column minus the UPPER SHADOW — the
    // union of every section at/above this cut plane, grown by the
    // allowance. A level's own section alone understates what blocks a
    // VERTICAL tool: wherever the model widens going up (an overhang), the
    // tool body has to pass beside the overhanging material, so the whole
    // shadow above the plane is keep-out. Alice's rule, 2026-10-25 (the
    // 4-axis trial made it visible — paths underneath a part the machine
    // never re-orients — but the 3-axis case is the dangerous one: a
    // section-only keep-out programs the tool UNDER overhangs and into
    // the material). Monotone parts (sections only widening downward)
    // are unaffected: their upper shadow IS the level's own section, the
    // widest of everything above. The wall stock is still measured from
    // THIS level's contour (the shadow union contains it), never from the
    // previous level. Above the model top the shadow is empty and the
    // whole column is cleared (still not the whole stock footprint).
    while (shadowPtr < shadowPlanes.length && shadowPlanes[shadowPtr] >= cut - 1e-9) {
      const above = sliceCache.get(shadowPlanes[shadowPtr])!.contours;
      upperShadow =
        upperShadow.length === 0 ? above : union([...upperShadow, ...above]);
      shadowPtr++;
    }
    let region: Vec2[][];
    if (reach.length === 0) {
      region = []; // no shadow inside the stock — nothing to rough anywhere
    } else if (upperShadow.length === 0) {
      region = reach;
    } else {
      const keepOut =
        o.allowance > 0 ? offsetOutward(upperShadow, o.allowance) : upperShadow;
      region = difference(reach, keepOut);
    }
    if (region.length === 0) {
      skippedLevels++; // the upper shadow (grown by the allowance) covers the whole column
      continue;
    }

    // Moat-only stop (Alice's coin workflow): a level whose clearing region
    // misses the model's silhouette entirely would shape NOTHING — pure
    // moat around the part, which is the profile op's territory (with
    // tabs; the rough must not cut the object out itself). Levels above
    // the stop still cut their moat — that is the clearance band the
    // profile rides in — but below this plane the ladder ends: for
    // normal parts sections only grow downward, so the remaining levels
    // are even more moat-only. (An undercut band below could re-engage the
    // silhouette, but that is already warned territory — the undercut
    // warning — so stopping is the honest choice.) Stopped levels are NOT
    // skipped levels: the ladder ended, it did not skip.
    if (intersection(region, silhouette).length === 0) {
      warnings.push(
        `ladder stopped at z${fmt(cut)}: levels below only clear the moat — cut out with a profile op (tabs)`,
      );
      break;
    }

    // Clipper's round-join offsets tessellate the region boundary at 25µm —
    // hundreds of near-collinear vertices per contour that make every pass
    // offset ~20× slower and the emitted gcode ~5× longer, for boundary
    // fidelity far under the slice simplification tolerance. Simplify the
    // pocketing region (the stop check above ran on the raw region).
    // The bridge-window vanish case is gone with the tabs: the upper
    // shadow + moat-only stop already guarantee the rough never severs.
    const pocketRegion = region.map((c) => simplifyContour(c, SLICE_SIMPLIFY_TOL));

    // pocket the band in a single pocket level — the ladder's own stepping
    // already happened; pocket2d raises its own safeZ from the band top, so
    // travel heights step down with the job
    const op: PocketOp = {
      kind: 'pocket',
      id: 'waterline',
      toolId: o.tool.id,
      regions: pocketRegion,
      topZ: bandTop,
      floorZ: cut,
      stepDown: bandTop - cut,
      stepOver: o.stepOver,
      feed: o.feed,
      plungeFeed: o.plungeFeed,
      safeClearance: o.safeClearance,
    };
    try {
      const res = pocket2d(op, o.tool, { minLoopPerimeter: o.tool.diameter });
      moves.push(...res.moves);
      levels.push(cut);
      passes += res.passes;
      minutes += res.estimatedMinutes;
      droppedSlivers += res.droppedLoops;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/does not fit/.test(msg)) throw e;
      // the clearing frame is thinner than the tool somewhere in this band:
      // leave it standing for the finishing op rather than failing the op
      warnings.push(
        `level at z${fmt(cut)} — clearing frame thinner than the tool there, left standing`,
      );
    }
  }

  if (allowanceSkips > 0) {
    warnings.push(
      `allowance ≥ step-down: ${allowanceSkips} level(s) had no band left to clear`,
    );
  }
  if (droppedSlivers > 0) {
    // pinch noise, not a shape anyone asked for: a fine-mesh wall wobbles
    // ±0.05mm around its true circle, and where the moat's tool-center
    // track is about that wide the offset pass shatters into sub-tool-Ø
    // arcs — plunge-cut-plunge around the perimeter. Each is dropped (the
    // stock it would take is thinner than the tool); say so once.
    warnings.push(
      `${droppedSlivers} sliver pass(es) thinner than the tool dropped — left for the finishing op`,
    );
  }

  return {
    moves,
    levels,
    passes,
    estimatedMinutes: minutes,
    droppedChains,
    skippedLevels,
    warnings,
  };
}