/**
 * Waterline rough of a whole model (PLAN.md §"3D relief carving", Phase A):
 * constant-Z levels from the stock crown down to the model floor, each level
 * clearing the MODEL'S COLUMN — its XY silhouette grown by `margin` and
 * clipped to the stock footprint — minus the keep-out grown from the model's
 * cross-section at that cut plane. The rough stops at the model's boundary
 * (the coin workflow: rough the relief, then profile the coin out), so the
 * waste outside the column stays standing instead of milled to the floor —
 * and it stops CLIMBING DOWN the ladder at the first level that would cut
 * nothing but moat (see the moat-only stop below): the cut-out is the
 * profile op's job, tabs and all.
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

import type { Move, PocketOp, ProfileTabs, Tool, Vec2 } from '../core/types';
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
  /**
   * Cut-out bridges for rimless reliefs (a dome descending straight to the
   * stock floor — the rough itself severs the part at the deepest moat
   * rings): keep-out boxes spanning the moat annulus, subtracted from
   * every level below the bridge top (floorZ + allowance + height — the
   * height stands above the rough's effective floor, the allowance skin).
   * Absent/null = none. Applied AFTER the moat-only stop, so tabs never
   * influence the stop decision.
   */
  tabs?: ProfileTabs | null;
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

/** Perimeter of a closed contour. */
function perimeterOf(c: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    s += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return s;
}

/** Point and unit tangent at arc length s along a closed contour (linear
 *  scan — the simplified silhouette contours are small). */
function frameAt(c: Vec2[], s: number): { p: Vec2; t: Vec2 } {
  const n = c.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = c[i];
    const b = c[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= 1e-12) continue;
    if (s <= acc + len) {
      const f = (s - acc) / len;
      return {
        p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        t: { x: (b.x - a.x) / len, y: (b.y - a.y) / len },
      };
    }
    acc += len;
  }
  // s at/past the end: the last vertex and its incoming tangent
  const a = c[(n - 2 + n) % n];
  const b = c[n - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    p: { x: b.x, y: b.y },
    t: len > 0 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 },
  };
}

/** The tab-bridge radial padding, mm: the box must fully cross the moat
 *  annulus — past the tool-center path hugging the deep section on the
 *  inside, and past the rough's reach edge on the outside — so the bridge
 *  runs from the part into the surrounding stock. */
const TAB_CROSS_PAD = 0.1;

/**
 * Tab bridges for a silhouette: keep-out boxes placed on its contours and
 * subtracted from the pocketing region of every level below the bridge
 * top. The tab count distributes across the contours by perimeter share
 * (rounded, zeros dropped); a contour shorter than one tab length gets
 * none. Anchors sit at half-interval arc positions — the same
 * no-straddle rule as profile tabs. Pure, and the test oracle for box
 * placement. `notes` are informational (perimeter clamps, short contours).
 */
export function tabBridgesFor(
  silhouette: Vec2[][],
  tabs: ProfileTabs,
  geo: { allowance: number; margin: number; toolR: number },
): { boxes: Vec2[][]; notes: string[] } {
  const notes: string[] = [];
  const perims = silhouette.map((c) => ({ c, P: perimeterOf(c), area: signedAreaOf(c) }));
  const totalP = perims.reduce((s, p) => s + p.P, 0);

  const assigned: { c: Vec2[]; P: number; sign: number; n: number }[] = [];
  let total = 0;
  if (totalP > 0) {
    for (const { c, P, area } of perims) {
      if (P < tabs.length - 1e-9) {
        notes.push('contour too short for tabs — left unbridged');
        continue;
      }
      const n = Math.round((tabs.count * P) / totalP);
      if (n < 1) continue; // perimeter share too small — dropped
      total += n;
      assigned.push({ c, P, sign: area >= 0 ? 1 : -1, n });
    }
  }
  if (total < tabs.count) {
    notes.push(`tab count reduced to ${total} by the perimeter distribution`);
  }

  // radial span: from allowance + toolR (+pad) inside the silhouette —
  // past the innermost tool-center pass — to margin + allowance + toolR
  // (+pad) outside — past the reach edge
  const inR = geo.allowance + geo.toolR + TAB_CROSS_PAD;
  const outR = geo.margin + geo.allowance + geo.toolR + TAB_CROSS_PAD;
  const halfL = tabs.length / 2;

  const boxes: Vec2[][] = [];
  for (const { c, P, sign, n } of assigned) {
    for (let k = 0; k < n; k++) {
      const { p, t } = frameAt(c, ((k + 0.5) * P) / n);
      // outward from the model: right of travel on CCW outers, left on CW
      // holes — the side the roughing region lies on either way
      const nx = sign * t.y;
      const ny = -sign * t.x;
      const at = (a: number, b: number): Vec2 => ({
        x: p.x + t.x * a + nx * b,
        y: p.y + t.y * a + ny * b,
      });
      let box = [at(-halfL, -inR), at(halfL, -inR), at(halfL, outR), at(-halfL, outR)];
      if (signedAreaOf(box) < 0) box.reverse(); // oriented CCW
      boxes.push(box);
    }
  }
  return { boxes, notes };
}

export function waterlineRough(o: WaterlineRoughOptions): WaterlineRoughResult {
  if (!(o.floorZ < o.topZ)) {
    throw new Error('the model floor is at/above the stock crown — nothing to rough');
  }
  if (o.stepDown <= 0) throw new Error('stepDown must be positive');
  if (o.stepOver <= 0) throw new Error('stepOver must be positive');
  if (o.allowance < 0) throw new Error('allowance must not be negative');
  if (o.margin < 0) throw new Error('margin must not be negative');
  if (o.tabs) {
    if (!Number.isInteger(o.tabs.count) || o.tabs.count < 1) {
      throw new Error('tab count must be an integer >= 1');
    }
    if (o.tabs.height <= 0) throw new Error('tab height must be > 0');
    if (o.tabs.length <= 0) throw new Error('tab length must be > 0');
  }

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

  // Tab bridges (rimless reliefs): the bridge top sits `height` above the
  // rough's effective floor — the allowance skin — so the specified
  // thickness is what actually stands. A bridge reaching above the whole
  // roughing band leaves nothing standing anywhere — say so and cut like
  // tabs were never asked for. The boxes are built lazily at the first
  // level that actually bridges, so a ladder the moat-only stop ends
  // early never emits tab warnings (test: the rimmed coin).
  const tabs = o.tabs ?? null;
  const bridgeTop = tabs ? o.floorZ + o.allowance + tabs.height : -Infinity;
  const tabsNoOp = tabs !== null && bridgeTop >= nominal[0] + o.allowance - 1e-9;
  if (tabsNoOp) {
    warnings.push('tab height reaches above the roughing band — no bridges left standing');
  }
  let tabBridges: { boxes: Vec2[][]; notes: string[] } | null = null;

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

    // clearing region: the model's column minus the keep-out grown from THIS
    // level's section — the rough stops at the model's boundary, and the
    // constant radial wall stock comes from THIS level's contour, never the
    // previous level's. Above the model top the section is empty and the
    // whole column is cleared (still not the whole stock footprint).
    let region: Vec2[][];
    if (reach.length === 0) {
      region = []; // no shadow inside the stock — nothing to rough anywhere
    } else if (slice.contours.length === 0) {
      region = reach;
    } else {
      const keepOut =
        o.allowance > 0 ? offsetOutward(slice.contours, o.allowance) : slice.contours;
      region = difference(reach, keepOut);
    }
    if (region.length === 0) {
      skippedLevels++; // the section (grown by the allowance) covers the whole column
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
    let pocketRegion = region.map((c) => simplifyContour(c, SLICE_SIMPLIFY_TOL));

    // tab bridges — AFTER the moat-only stop, which ran on the untabbbed
    // region: tabs suppress cutting, they must never influence the stop.
    // Below the bridge top every level keeps clear of the boxes, leaving
    // the bridges standing from the part into the surrounding stock; at
    // and above it the levels cut through the box positions unbroken.
    if (tabs !== null && !tabsNoOp && cut < bridgeTop - 1e-9) {
      if (!tabBridges) {
        tabBridges = tabBridgesFor(silhouette, tabs, {
          allowance: o.allowance,
          margin: o.margin,
          toolR: o.tool.diameter / 2,
        });
        warnings.push(...tabBridges.notes);
      }
      pocketRegion = difference(pocketRegion, tabBridges.boxes);
      if (pocketRegion.length === 0) {
        // the bridge windows swallowed this level's whole region — nothing
        // to cut, same vanish as an empty region
        skippedLevels++;
        continue;
      }
    }

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