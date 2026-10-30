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
import { difference, intersection, offsetInward, offsetOutward, union } from './clipper';
import { simplifyContour, zLadder } from './paths';
import { bandOf, pocket2d } from './pocket';
import { sliceAtZ, buildZIndex, type SliceResult } from './slicing';

export interface WaterlineRoughOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  already datum-rotated by the caller when an Index op precedes) */
  positions: ArrayLike<number>;
  /** stock footprint in XY, outer CCW contours — OPTIONAL: absent (or empty)
   *  = allow tail stock cut-over, skipping the reach clip so the boundary
   *  pass may run outside the declared stock (Alice's 2026-10-26 toggle) */
  footprint?: Vec2[][];
  /** stock crown, machine Z — the ladder starts here */
  topZ: number;
  /** model floor, machine Z — the ladder ends here (caller already clamped
   *  to the stock bottom; must be below topZ or the generator throws) */
  floorZ: number;
  /**
   * MAX DEPTH (Alice, 2026-10-26, the 4-axis short-tool throttle): stop the
   * ladder this many mm below the crown, ahead of the model floor — the
   * tool never cuts deeper than this. For 4-axis indexed roughing around
   * tall features (her knight's A=0 shelf): limit each orientation's op to
   * the depth its tool can reach alongside the wall, and the sim's red
   * shank marks show where the collet would hit. 0/undefined = unlimited.
   */
  maxDepth?: number;
  /**
   * CLEAR EXCESS STOCK (Alice, 2026-10-26): the clearing region becomes the
   * whole stock FOOTPRINT minus the keep-out, instead of the silhouette +
   * margin — every level clears the waste clear out to the stock edge as
   * the ladder descends, so no shelf of uncleared stock survives outside
   * the model's column (4-axis: leftover shelves can bottom out the
   * collet, and indexing can break uncleared chunks loose). Requires the
   * footprint. The moat-only stop and the keep-out still bound the rough:
   * it never cuts the part free.
   */
  clearToStock?: boolean;
  stepDown: number;
  stepOver: number;
  /** BOTH-axis roughing allowance, mm */
  allowance: number;
  /**
   * FINISHING PASS ONLY (Alice, 2026-10-26): scrub only where the tool
   * touches the model SURFACE — per shaping level the clearing region is
   * a contour-hugging band around the keep-out (every section ring;
   * width = tool Ø + step over), never the waste beyond it. Levels above
   * the model (empty section) have no surface to scrub and are skipped.
   * The level where the ladder bottoms out (moat-only — the floor level)
   * keeps the FULL region: the floor/waste clearance the cut-out profile
   * rides in. The stop rule and all warnings are computed on the FULL
   * region exactly as in roughing mode, so the ladder behaves
   * identically — only what each level actually clears changes.
   */
  finishingOnly?: boolean;
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
  /**
   * STAGE C standing-awareness (the 4D contour threads this): absent =
   * byte-identical behavior. trimBand runs before pocketing (the
   * moat-only stop and the undercut check still see the FULL region —
   * decided behavior, the stop firing late costs Clipper work, never
   * correctness); stampBand runs after a level's moves emitted
   * successfully (never on the does-not-fit catch, which cut nothing).
   */
  standing?: {
    trimBand: (bandTop: number, cut: number, region: Vec2[][]) => Vec2[][];
    stampBand: (bandTop: number, cut: number, swept: Vec2[][]) => void;
    /** honest approach ceiling over the trimmed region — the tallest
     *  standing material, so the pocket's approach rapid never dives
     *  through a column the ladder never cleared. Optional: a caller
     *  without grid knowledge falls back to the band top (the ladder
     *  assumption, today's behavior). */
    computeCeiling?: (bandTop: number, cut: number, region: Vec2[][]) => number;
  };

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
  /** levels the standing-awareness hooks proved empty (STAGE C: the level
   *  gate in trimBand returned [] — 0 when no hooks were threaded) */
  standingSkips: number;
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

/** Is point pt inside contour c (even-odd crossing)? */
function pointInContour(pt: Vec2, c: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const xi = c[i].x, yi = c[i].y, xj = c[j].x, yj = c[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Orient a section's contours BY NESTING DEPTH: even depth → CCW (solid),
 * odd → CW (hole). Depth = how many other contours contain this one. A
 * relief slices to nested RINGS (rim, valley, island, …) and Clipper's
 * union/difference treat a CCW inner ring as SOLID — blanket-CCW
 * normalization erases every valley, so the rough never cuts an interior
 * (Alice's 2026-10-26 coin diagnosis). Containment is decided on each
 * contour's first vertex (rings from one slice never cross — depth via
 * first-vertex containment is exact for them).
 */
function orientByNesting(contours: Vec2[][]): Vec2[][] {
  const n = contours.length;
  const depth = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (pointInContour(contours[i][0], contours[j])) depth[i]++;
    }
  }
  return contours.map((c, i) => {
    const wantPositive = depth[i] % 2 === 0; // even depth = solid = CCW
    return (signedAreaOf(c) > 0) === wantPositive ? c : c.slice().reverse();
  });
}

export function waterlineRough(o: WaterlineRoughOptions): WaterlineRoughResult {
  if (o.stepDown <= 0) throw new Error('stepDown must be positive');
  if (o.stepOver <= 0) throw new Error('stepOver must be positive');
  if (o.allowance < 0) throw new Error('allowance must not be negative');
  if (o.margin < 0) throw new Error('margin must not be negative');

  // MAX DEPTH: the ladder bottoms at crown − maxDepth when that is above
  // the model floor — the depth throttle for short tools beside tall walls
  // (the caller's floorZ is already the model-floor/stock-bottom clamp)
  const floorZ =
    o.maxDepth !== undefined && o.maxDepth > 0 ? Math.max(o.floorZ, o.topZ - o.maxDepth) : o.floorZ;
  if (!(floorZ < o.topZ)) {
    throw new Error('the model floor is at/above the stock crown — nothing to rough');
  }

  // nominal ladder z_1..z_n (z_n = floorZ); the band above level i is
  // [z_{i-1}, z_i] with z_0 = the crown. Cut planes sit allowance above the
  // nominal levels, so a plane can rise into its own band when the allowance
  // swallows the whole step (allowance ≥ increment) — those levels have
  // nothing left to clear and are counted as skipped.
  const nominal = zLadder(o.topZ, floorZ, o.stepDown);
  const span = o.topZ - floorZ;
  const n = Math.ceil(span / o.stepDown);
  const increment = n > 0 ? span / n : 0;
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
    // simplification. Orientation is normalized BY NESTING DEPTH, not
    // blanket-CCW: even depth → CCW (solid), odd → CW (hole). A relief's
    // section at a level plane is nested RINGS (rim, valley, island, …) —
    // blanket-CCW unions a valley ring as SOLID, swallowing its parent and
    // erasing the entire interior (Alice's 2026-10-26 diagnosis: "it is as
    // if the outer rim is casting a shadow that prevents the interior of
    // the contour being traced" — the union kept the rough outside the rim
    // forever). Depth-based orientation keeps holes as holes, so union/
    // difference/offset all see the interior they must cut. (An inverted-
    // winding mesh is still healed: its solids arrive CW, reversed to CCW.)
    const s: SliceResult = {
      contours: orientByNesting(
        raw.contours.map((c) => simplifyContour(c, SLICE_SIMPLIFY_TOL)),
      ),
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
  // TAIL-STOCK CUT-OVER (Alice, 2026-10-26): no footprint = skip the clip —
  // the boundary pass completes outside the declared stock instead of
  // pinching off at its edge. The moat-only stop still bounds the ladder,
  // and the unclipped reach is the silhouette + margin, so the rough never
  // wanders past one margin of the model's own shadow.
  // CLEAR EXCESS STOCK (Alice, 2026-10-26): the reach IS the footprint —
  // every level clears the waste right out to the stock edge, so no shelf
  // of uncleared stock survives outside the model's column (4-axis:
  // leftover shelves bottom out the collet, and indexing can break
  // uncleared chunks loose). Guarded on a non-empty silhouette: a model
  // casting no shadow still reaches nothing (the op is a ROUGH of the
  // model, never a face-mill of the whole stock).
  const reachRaw = silhouette.length === 0 ? [] : offsetOutward(silhouette, o.margin);
  let reach: Vec2[][];
  if (o.clearToStock && silhouette.length > 0) {
    if (!o.footprint || o.footprint.length === 0) {
      throw new Error('clear excess stock needs the stock footprint — turn off tail stock cut-over');
    }
    // the model must cast its shadow INSIDE the stock: a model placed off
    // the stock is nothing to rough, never a license to mill the whole blank
    reach = intersection(silhouette, o.footprint).length > 0 ? o.footprint : [];
  } else {
    reach =
      reachRaw.length === 0 || !o.footprint || o.footprint.length === 0
        ? reachRaw
        : intersection(reachRaw, o.footprint);
  }

  const moves: Move[] = [];
  const levels: number[] = [];
  const warnings: string[] = [];
  let passes = 0;
  let minutes = 0;
  let skippedLevels = 0;
  let standingSkips = 0;
  let allowanceSkips = 0;
  let droppedSlivers = 0;
  let undercutWarned = false;
  let unreachableWarned = false;

  const shadowPlanes = [...sliceCache.keys()].sort((a, b) => b - a);
  let shadowPtr = 0;
  /** union of all sections at/above the current cut plane (upper shadow) */
  let upperShadow: Vec2[][] = [];
  /** consecutive moat-only levels — two in a row = the ladder is done
   *  (see the moat-only stop below) */
  let moatOnlyRun = 0;

  for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
    const { bandTop, cut } = bands[bandIndex];
    // Allowance ≥ step-down: the cut plane rises to/above its own band top,
    // so ROUGHING has no band left to clear (skipped, warned). FINISHING
    // mode is exempt (Alice, 2026-10-26): the step-down is pure ladder
    // rung density and the allowance is a raise-plus-offset — unrelated
    // knobs. A finishing level with no band scrubs AT its cut plane.
    if (!o.finishingOnly && cut >= bandTop) {
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
    // allowance. Alice's rule: only ever cut down as far as the highest
    // point in each vertical — overhangs cast a keep-out shadow, so the
    // tool can never be programmed into material above its cut plane
    // (never a collision). For heightfield surfaces (relief coins) the
    // section AT the plane already equals this union — the two rules
    // coincide there — so the shadow costs nothing on reliefs and is
    // REQUIRED for overhung parts (goblet stems under bowls, knight
    // overhangs). (The section-only keep-out was tried 2026-10-25 and
    // REJECTED: it programs tool-flute passes into overhanging walls.)
    while (shadowPtr < shadowPlanes.length && shadowPlanes[shadowPtr] >= cut - 1e-9) {
      const above = sliceCache.get(shadowPlanes[shadowPtr])!.contours;
      upperShadow =
        upperShadow.length === 0 ? above : union([...upperShadow, ...above]);
      shadowPtr++;
    }
    let region: Vec2[][];
    let keepOut: Vec2[][] = upperShadow;
    if (reach.length === 0) {
      region = []; // no shadow inside the stock — nothing to rough anywhere
    } else if (upperShadow.length === 0) {
      region = reach;
    } else {
      keepOut =
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
    // tabs; the rough must not cut the object out itself). BUT a single
    // moat-only level does NOT prove the ladder is done: relief parts have
    // transient wide sections between their top and their base (the coin's
    // rim band; a chess piece's collar) where one level legitimately has
    // nothing to clear beside the model while levels below DO. The old
    // stop-on-first-moat-only killed those ladders after one level (the
    // 2026-10-25 regression report: "it just removed the entire area and
    // didn't trace the contours"). The rule now requires TWO consecutive
    // moat-only levels before stopping — the transient band passes
    // through one, the walls below the widest section produce them all the
    // way down. The first moat-only level STILL EMITS (its moat is the
    // clearance band the profile op rides in); the second triggers the
    // stop. moatOnlyRun resets on any shaping level.
    const isMoatOnly = intersection(region, silhouette).length === 0;
    if (isMoatOnly) {
      moatOnlyRun++;
      if (moatOnlyRun >= 2) {
        warnings.push(
          `ladder stopped at z${fmt(cut)}: levels below only clear the moat — cut out with a profile op (tabs)`,
        );
        break;
      }
      // first moat-only level: fall through and emit it (moat = clearance)
    } else {
      moatOnlyRun = 0;
    }

    // FINISHING PASS ONLY (Alice, 2026-10-26): at a shaping level, scrub
    // only where the tool TOUCHES the model — to the SIDE (the contour band
    // around the keep-out: walls, islands, interior contours) or BELOW
    // within one step-down (the FLATS: horizontal surfaces exposed between
    // this cut plane and the NEXT — `section(nextCut) − shadow(cut)`, grown
    // by the tool radius so the disc covers them). Everything else is free
    // space the rough already cleared — waggling there is discarded.
    // Alice's rule verbatim: "if this move touches the model, either to the
    // side or below then keep it, otherwise discard" — so the BELOW check
    // runs FIRST: a level whose cut plane has no section (above the model
    // top, where the TALL features' top surfaces sit within a step below)
    // still scrubs the model's top slab through its flats (her "it ignored
    // the taller features" — the skip-on-empty-keep-out discarded them
    // without ever checking below). A level touches nothing only when BOTH
    // are empty. A moat-only level (where the ladder bottoms out) keeps the
    // FULL region — the floor/waste clearance the cut-out profile rides in.
    // Physics honesty: a flat is scrubbed at the level plane ABOVE its
    // surface (a constant-Z pass cannot ride an arbitrary height), so a
    // sub-step-down skin can remain on it unless a plane lands exactly on
    // the surface — the raster (or a finer step-down) finishes it.
    let finFlats: Vec2[][] | null = null;
    if (o.finishingOnly && !isMoatOnly) {
      // the flats: model at the next cut plane that the current shadow
      // does not cover — the tool touches them from below within one step
      const nextCut =
        (bandIndex + 1 < nominal.length
          ? nominal[bandIndex + 1]
          : Math.max(floorZ, cut - increment)) + o.allowance;
      finFlats = difference(sliceAt(nextCut).contours, upperShadow);
      if (keepOut.length === 0 && finFlats.length === 0) {
        skippedLevels++; // touches nothing — no surface above or below
        continue;
      }
      const side = keepOut.length > 0 ? offsetOutward(keepOut, o.tool.diameter + o.stepOver) : [];
      const below = finFlats.length > 0 ? offsetOutward(finFlats, o.tool.diameter / 2) : [];
      const scrub =
        below.length === 0 ? side : side.length === 0 ? below : union([...side, ...below]);
      const finRegion = difference(intersection(scrub, reach), keepOut);
      if (finRegion.length === 0) {
        skippedLevels++; // the touch areas fall outside the reach — nothing to scrub
        continue;
      }
      region = finRegion;
    }

    // STAGE C standing-awareness: trim the region to cells with standing
    // material before pocketing. Runs AFTER the moat-only stop and the
    // finishing branch (both decided on the FULL region — the stop firing
    // late costs Clipper work, never correctness) and BEFORE the
    // unreachable-opening block. An empty trim = the level provably cuts
    // nothing but air: skip it without any Clipper pocketing at all.
    let approachCeiling: number | undefined;
    if (o.standing) {
      const trimmedRegion = o.standing.trimBand(bandTop, cut, region);
      if (trimmedRegion.length === 0) {
        standingSkips++;
        continue;
      }
      region = trimmedRegion;
    }

    // UNREACHABLE-STOCK HONESTY (clear-excess, Alice's 2026-10-26 knight
    // report): the morphological OPENING of the region by the tool — erode
    // by toolR, regrow by toolR — is exactly the area the disc can sweep
    // from centers inside the region; whatever it misses is a gap narrower
    // than the tool that NO pass can clear (her end slivers: the model's X
    // tips 0.9mm from the stock's end faces — no tool-center track fits,
    // and shearing from beyond the end would gouge the keep-out, so
    // cut-over cannot help: the obstacle is the model, not the stock edge).
    // Warn once and leave it standing — silently clean-looking it is not.
    if (o.clearToStock && !unreachableWarned) {
      const toolR = o.tool.diameter / 2;
      const opening = offsetOutward(offsetInward(region, toolR), toolR);
      const missed = difference(region, opening);
      if (totalArea(missed) > 1) {
        warnings.push(
          `stock the tool cannot reach below z${fmt(cut)} — a gap narrower than the tool ` +
            '(e.g. between the model and the stock end); left standing',
        );
        unreachableWarned = true;
      }
    }

    // HONEST APPROACH CEILING (Alice's 2026-10-30 yellow-streak report):
    // the pocket's approach rapid assumes this orientation's previous
    // level cleared everything above the band top at the loop start — the
    // trim broke that premise (kept cells hold material the ladder never
    // cleared, and the trim leaves a one-voxel boundary skin). The rapid
    // can only plow what sits under the ENTRY DISC's footprint, so the
    // ceiling is the tallest standing material over the OPENING — the
    // area the disc can sweep — never over the whole region (never-swept
    // residue at the crown would re-ladder every band; measured 20× the
    // moves). It raises ONLY the approach plane and the entry ramp's
    // fresh-material bound; the ladder itself stays single-level.
    if (o.standing?.computeCeiling) {
      const toolR = o.tool.diameter / 2;
      const opening = offsetOutward(offsetInward(region, toolR), toolR);
      const ceiling = o.standing.computeCeiling(bandTop, cut, opening);
      // CLAMP to the skin class: one step-down above the band top. A cell
      // on the region boundary conflates MODEL material beyond it (never
      // touchable — the disc edge rides the boundary) into its standing
      // z, so the raw ceiling re-machined whole boundary columns in the
      // entry ramps (measured 3× the moves). The genuine plow risk is the
      // trim/stamp residue, which the seeded safety oracle bounds to the
      // skin — a band-worth of clamp covers it with the whole step-down
      // to spare, at one extra ramp turn of cost.
      approachCeiling = Math.max(bandTop, Math.min(ceiling, bandTop + o.stepDown));
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
    // already happened. TRAVEL at the crown + clearance, NOT band-top +
    // clearance: the uncleared stock outside the clearing region and the
    // upper-shadow keep-out islands inside it both stand to the stock crown
    // (the raw stock starts there), so a lateral rapid at band-top height
    // plows through them — the knight's "erratic zigzags" (2026-10-26
    // probe: level z6.20 pass 2's G0 swept 7.8k voxels of the standing
    // knight). The plunge comment's "below surface" reference stays the
    // band top (honest: the plunge is measured from the material the
    // previous level left).
    const op: PocketOp = {
      kind: 'pocket',
      id: 'waterline',
      toolId: o.tool.id,
      regions: pocketRegion,
      // finishing levels with allowance ≥ step-down have no band above the
      // cut plane — topZ clamps to the cut so the pass scrubs AT the plane
      // (pocket2d takes top == floor as a single level; roughing keeps the
      // band because its allowance-skip already suppressed those levels)
      topZ: Math.max(bandTop, cut),
      // the honest approach ceiling (may be undefined — hooks absent):
      // raises the approach plane and the entry ramp, never the ladder
      approachCeiling,

      travelZ: o.topZ + o.safeClearance,
      floorZ: cut,
      stepDown: Math.max(bandTop - cut, 1e-9),
      stepOver: o.stepOver,
      feed: o.feed,
      plungeFeed: o.plungeFeed,
      safeClearance: o.safeClearance,
    };
    try {
      const res = pocket2d(op, o.tool, {
        minLoopPerimeter: o.tool.diameter,
        startFilter: o.standing?.entryClear
          ? (p) => o.standing.entryClear!(
              Math.max(bandTop, Math.min(
                o.standing.computeCeiling
                  ? o.standing.computeCeiling(bandTop, cut, opening)
                  : bandTop,
                bandTop + o.stepDown,
              )) + APPROACH_CLEARANCE,
              p.x,
              p.y,
              o.tool.diameter / 2,
            )
          : undefined,
      });
      moves.push(...res.moves);
      levels.push(cut);
      passes += res.passes;
      minutes += res.estimatedMinutes;
      droppedSlivers += res.droppedLoops;
      // STAGE C: record the removal only after the level actually emitted
      // moves — the does-not-fit catch below cut nothing, so nothing may
      // be stamped for it. The swept area is the union of the SURVIVING
      // orbits' tool-disc bands — NOT the region's morphological opening,
      // which over-claims by the sliver orbits minLoopPerimeter dropped
      // (their bands never ran). Built only when hooks are present; the
      // hooks-absent path stays byte-identical.
      if (o.standing) {
        const toolR = o.tool.diameter / 2;
        const bands = res.orbits.flatMap((orbit) => bandOf(orbit, toolR));
        const swept = bands.length > 0 ? union(bands) : [];
        o.standing.stampBand(bandTop, cut, swept);
      }
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
      `allowance ≥ increment: ${allowanceSkips} level(s) had no band left to clear`,
    );
  }
  // THE FLUTE-LIMIT REPORT (the 2026-10-29 pre-populate ruling's "warn
  // not prevent" half): when maxDepth binds above the model floor, the
  // ladder stops short on purpose and the user must SEE it — a silent
  // short ladder looks like a finished rough. The default maxDepth is
  // the tool's flute length (the shaft-in-stock ceiling), so this fires
  // exactly where a short bit meets a deep part.
  if (o.maxDepth !== undefined && o.maxDepth > 0 && floorZ > o.floorZ + 1e-9) {
    warnings.push(
      `max depth ${o.maxDepth}mm: ladder stops at z${fmt(floorZ)} — ` +
        `${fmt(o.floorZ)} floor left standing (deeper cuts exceed the set depth; raise Max depth for a longer flute)`,
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
    standingSkips,
    warnings,
  };
}