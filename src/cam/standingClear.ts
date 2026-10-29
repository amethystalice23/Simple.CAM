/**
 * STANDING-CLEAR (Stage C of the 4D contour op, P3): delta-aware emission
 * for the per-orientation waterline roughs. Today every orientation cuts
 * blind against pristine stock — later orientations re-cut air (~75% of
 * the motion, measured in Stage B). This module threads a STANDING GRID
 * through the emission: each orientation's rough is (a) TRIMMED to cells
 * with standing material and (b) STAMPED back with what it removed, so
 * later orientations only cut their delta.
 *
 * THE SAFETY INVARIANT (the one thing that cannot be wrong): if the
 * bookkeeping is ever wrong, the failure must be EXTRA CUTTING (wasted
 * motion), never uncut waste and never a gouge. So: STAMP conservatively
 * (only reduce a cell's r when the cell's whole sampled band segment is
 * certainly inside the area actually swept — all-or-nothing), TRIM
 * conservatively (only subtract area certainly containing no work,
 * shrunk by the wedge-vs-rect margin before subtracting). The
 * keep-out/upper-shadow logic stays 100% model-based — this module adds
 * nothing to safety, it only skips provably-empty air.
 *
 * GEOMETRY CONVENTIONS (pinned against the code, verified 2026-10-29):
 *
 *  - Row j of the standing grid sits at material angle
 *        θ_j = j·dTheta,   dTheta = 2π/nTheta,
 *    measured from +Z toward +Y (atan2(y, z − axisZ)): a material point
 *    at radius r, angle θ is at (x, r·sinθ, axisZ + r·cosθ) in the
 *    material frame. This is buildDexelMap's ray convention
 *    (rotaryCarve.ts: ray origin (x, (R+10)·sinθ, axisZ+(R+10)·cosθ),
 *    direction −(0, sinθ, cosθ)) and buildClearedMap's cell loop
 *    (clearedSet.ts: `const theta = j * dTheta`). X columns:
 *    x_i = gx0 + i·pitchX with pitchX = thetaStepOver/2,
 *    nx = floor((x1−x0)/pitchX)+1, nTheta = max(24, round(2πR/thetaStepOver)).
 *
 *  - At cutting orientation A (degrees), the material point maps into
 *    the cutting frame as
 *        y_cut = r·sin(θ_j − A_rad),   z_cut = axisZ + r·cos(θ_j − A_rad).
 *    Cross-checked BOTH ways against the code: indexedPointRotation(A)
 *    (indexing.ts) sends material (y, z) to (y·cosA − zrel·sinA,
 *    y·sinA + zrel·cosA), i.e. exactly this; and clearedSet.ts's
 *    machine→material ray transform (its `oy = yM·cosA + zRel·sinA`,
 *    `oz = −yM·sinA + zRel·cosA`, height `y·sinA + hRel·cosA`) is the
 *    inverse of the same map. A waterline plane z = cut therefore bounds
 *    the cell's ray at r_cut = (cut − axisZ)/cos(θ_j − A_rad), valid for
 *    cos > 0.
 *
 *  - `angleDeg` is the cutting orientation measured IN THE GRID'S DATUM
 *    FRAME: the cutting angle of row j is θ_j − A_rad with A_rad from
 *    this argument. A grid indexed at datum D cut at an orientation
 *    `pick` expressed in the datum-0 model frame (the contour4d
 *    convention: pick.angle is what indexedPointRotation and the
 *    cleared-set map share) must pass `pick + D`.
 *
 * BAND SEMANTICS per cell (band [bandTop, cut], orientation A):
 *  - |cos(θ_j − A)| < 1e-4 (near-equator): degenerate geometry — the
 *    cell is ALWAYS treated as having work and is NEVER stamped (the
 *    safe direction).
 *  - cos > 1e-4: the cell has work in the band iff its standing material
 *    extends above the cut plane, r_standing > r_cut. (r_cut ≤ 0 — cut
 *    plane at/below the axis — means the whole column is in the band.)
 *  - cos < −1e-4: the ray lies below the axis at every radius, so it is
 *    untouched by any level whose plane sits at/above the axis; only a
 *    band reaching below the axis gives it work. (Refinement over the
 *    bare "work iff cos > 1e-4" formula — without it, half the rows
 *    would forever read as work and the level gate would never fire;
 *    with it, the class stays provably empty, never a guess.)
 *
 * TRIM SAFETY REFINEMENT (a deviation from the stage-C brief's recipe,
 * forced by the invariant — see trimBand below): a no-work cell's own
 * wedge is provably empty FOR THAT CELL, but its PLAN-area rectangle can
 * still be crossed by a NEIGHBOURING cell's live material (a crown-side
 * cell whose ray passes through the same plan strip higher up).
 * Subtracting such a rectangle trims live work, and the following stamp's
 * radial samples then straddle the trimmed strip and under-stamp the
 * neighbour — uncut waste, the one forbidden direction. So every
 * candidate rectangle is filtered against the padded plan y-extents of
 * all LIVE above-plane material in its column before it may subtract.
 *
 * Pure module: no worker/UI deps, no gcode; mutates only the grid it was
 * handed (which `adoptStanding` guarantees is the caller's own copy).
 * Stamping LOWERS cells monotonically; the grid stays stock-radius space
 * per the P1 contract.
 */

import type { Vec2 } from '../core/types';
import { difference } from './clipper';
import { reindexStanding, type StandingGrid } from './rotaryCarve';

/** the cell grid's geometry, in the form every 4D consumer already has */
export interface StandingGeometry {
  x0: number;
  x1: number;
  radius: number;
  axisZ: number;
  /** cell pitch: X pitch = thetaStepOver/2, angular rows spaced this much
   *  of arc at the stock radius (the cleared-map convention) */
  thetaStepOver: number;
  /** the session datum the grid rows are indexed against, degrees */
  datumAngle: number;
}

/** cos below this (either sign) reads as the degenerate near-equator */
const EQUATOR_EPS = 1e-4;
/** Clipper µm-grid / float slack on exact slab edges */
const X_EPS = 1e-9;
/** Clipper-chunk size for the trim subtraction: one `difference` call per
 *  chunk, applied sequentially — a 10k-rect case stays seconds-class. */
const TRIM_CHUNK = 200;

interface GridShape {
  pitchX: number;
  nx: number;
  nTheta: number;
  dTheta: number;
}

function gridShape(g: StandingGeometry): GridShape {
  const pitchX = g.thetaStepOver / 2;
  const nx = Math.floor((g.x1 - g.x0) / pitchX) + 1;
  const nTheta = Math.max(24, Math.round((2 * Math.PI * g.radius) / g.thetaStepOver));
  return { pitchX, nx, nTheta, dTheta: (2 * Math.PI) / nTheta };
}

/** Fresh stock: r = radius everywhere, at the caller's datum. */
export function mintStandingStock(g: StandingGeometry): StandingGrid {
  const s = gridShape(g);
  return {
    r: new Float64Array(s.nx * s.nTheta).fill(g.radius),
    nx: s.nx,
    nTheta: s.nTheta,
    pitchX: s.pitchX,
    gx0: g.x0,
    radius: g.radius,
    axisZ: g.axisZ,
    datumAngle: g.datumAngle,
  };
}

/**
 * Adopt a previous op's grid for this op's geometry. Identical shape → a
 * reindexed COPY (the op stamps its grid; the donor's must not move).
 * Shape mismatch (different tool step-over, stock, or span) → a
 * conservative resample where each target cell's r = MAX over the source
 * cells its slab overlaps (± one source cell of padding, so a boundary
 * neighbour can never make the target UNDER-claim standing — under-claim
 * means later orientations skip live material, the one forbidden
 * direction). Undefined → fresh stock.
 */
export function adoptStanding(
  incoming: StandingGrid | undefined,
  g: StandingGeometry,
): StandingGrid {
  const fresh = mintStandingStock(g);
  if (!incoming || incoming.r.length === 0) return fresh;
  const sameShape =
    incoming.nx === fresh.nx &&
    incoming.nTheta === fresh.nTheta &&
    Math.abs(incoming.pitchX - fresh.pitchX) <= X_EPS &&
    Math.abs(incoming.gx0 - fresh.gx0) <= X_EPS &&
    Math.abs(incoming.radius - fresh.radius) <= X_EPS &&
    Math.abs(incoming.axisZ - fresh.axisZ) <= X_EPS;
  if (sameShape) {
    const re = reindexStanding(incoming, g.datumAngle, incoming.nTheta);
    return { ...re, r: new Float64Array(re.r) };
  }

  // CONSERVATIVE RESAMPLE: canonical material angle of a row is
  // α = θ_row − datum (mod 2π) — reindexStanding's shift rule is exactly
  // this relation, so mismatched grids meet in canonical angle space and
  // datum changes come along for free.
  const dT = (2 * Math.PI) / fresh.nTheta;
  const dS = (2 * Math.PI) / incoming.nTheta;
  const datumT = (g.datumAngle * Math.PI) / 180;
  const datumS = (incoming.datumAngle * Math.PI) / 180;
  for (let j = 0; j < fresh.nTheta; j++) {
    const alpha = j * dT - datumT;
    // source rows whose slab touches this target slab, padded ±1 source row
    const half = (dT + dS) / 2 + dS;
    const jLo = Math.ceil((alpha - datumS - half) / dS);
    const jHi = Math.floor((alpha + half - datumS) / dS);
    for (let i = 0; i < fresh.nx; i++) {
      const xc = g.x0 + i * fresh.pitchX;
      // source columns whose slab touches this target slab, padded ±1
      const xHalf = (fresh.pitchX + incoming.pitchX) / 2 + incoming.pitchX;
      const rel = xc - incoming.gx0;
      const iLo = Math.max(0, Math.ceil((rel - xHalf) / incoming.pitchX));
      const iHi = Math.min(incoming.nx - 1, Math.floor((rel + xHalf) / incoming.pitchX));
      let mx = -1; // max over the overlapping SOURCE cells; a hole in the
      // source (r=0) must read 0, fresh radius only where nothing overlaps
      for (let js = jLo; js <= jHi; js++) {
        const jw = ((js % incoming.nTheta) + incoming.nTheta) % incoming.nTheta;
        for (let is = iLo; is <= iHi; is++) {
          const v = incoming.r[jw * incoming.nx + is];
          if (v > mx) mx = v;
        }
      }
      fresh.r[j * fresh.nx + i] = Math.min(mx < 0 ? fresh.radius : mx, g.radius);
    }
  }
  return fresh;
}

/**
 * The per-orientation view of the standing grid: cos/sin of every row's
 * cutting angle plus the r_cut / r_top helpers and the shared work
 * predicate (see the module docs for the three cell classes).
 */
export interface StandingBandView {
  readonly grid: StandingGrid;
  /** cutting orientation actually applied, degrees (the constructor arg) */
  readonly angleDeg: number;
  /** cos(θ_j − A) per row */
  cosRow(j: number): number;
  /** sin(θ_j − A) per row */
  sinRow(j: number): number;
  /** the radius the plane z=cut bounds row j's ray at (±∞-tending near
   *  the equator — callers check the cos sign first) */
  rCut(cut: number, j: number): number;
  /** the band-top radius of row j, clamped to [0, radius] */
  rTop(bandTop: number, j: number): number;
  /** does cell (i,j) have work in the band [bandTop, cut]? */
  hasWork(i: number, j: number, bandTop: number, cut: number): boolean;
}

/**
 * Build the STAGE C hooks for one orientation. The returned closures
 * share the per-row trig (built once) and MUTATE `grid`'s cells on
 * stamp — pass a grid you own (`adoptStanding`/`mintStandingStock`
 * always hand out a private copy).
 */
export function standingHooksFor(
  grid: StandingGrid,
  angleDeg: number,
): {
  /** trim the level's clearing region to cells with work; [] = skip the
   *  level (the input region is never mutated) */
  trimBand: (bandTop: number, cut: number, region: Vec2[][]) => Vec2[][];
  /** record the swept removal after the level's moves emitted; `swept` =
   *  the tool-disc OPENING of the region actually pocketed, floored at
   *  `cut`. A cell is reduced only when ALL of its band-segment samples
   *  land inside `swept` (all-or-nothing). */
  stampBand: (bandTop: number, cut: number, swept: Vec2[][]) => void;
  /** the underlying per-orientation view (tests/diagnostics) */
  view: StandingBandView;
} {
  const A = (angleDeg * Math.PI) / 180;
  const nTheta = grid.nTheta;
  const dTheta = (2 * Math.PI) / nTheta;
  const cos = new Float64Array(nTheta);
  const sin = new Float64Array(nTheta);
  for (let j = 0; j < nTheta; j++) {
    const phi = j * dTheta - A;
    cos[j] = Math.cos(phi);
    sin[j] = Math.sin(phi);
  }
  const xAt = (i: number): number => grid.gx0 + i * grid.pitchX;

  const rTopAt = (bandTop: number, j: number): number =>
    Math.min(Math.max((bandTop - grid.axisZ) / cos[j], 0), grid.radius);

  const view: StandingBandView = {
    grid,
    angleDeg,
    cosRow: (j) => cos[j],
    sinRow: (j) => sin[j],
    rCut: (cut, j) => (cut - grid.axisZ) / cos[j],
    rTop: rTopAt,
    hasWork: (i, j, _bandTop, cut) => {
      const c = cos[j];
      if (Math.abs(c) < EQUATOR_EPS) return true; // near-equator: always work
      if (c > 0) {
        const rCut = (cut - grid.axisZ) / c;
        if (rCut <= 0) return true; // plane at/below the axis: whole column in band
        return grid.r[j * grid.nx + i] > rCut;
      }
      // below the cutting equator: work only when the band reaches the axis
      return cut < grid.axisZ - X_EPS;
    },
  };

  /**
   * The radial range of cell (i,j)'s material that stands ABOVE the plane
   * z=cut — empty (null) when nothing on its ray reaches above the plane.
   * This is the honest per-cell live set (the near-equator FORCED-work
   * treatment is deliberately not applied here: the interval exists to
   * protect real material from the trim rectangles, and near-equator rays
   * with the plane above the axis genuinely carry none).
   */
  const liveRange = (i: number, j: number, cut: number): [number, number] | null => {
    const c = cos[j];
    const r = grid.r[j * grid.nx + i];
    const dz = cut - grid.axisZ;
    if (c > EQUATOR_EPS) {
      const lo = Math.max(0, dz / c);
      return lo < r ? [lo, r] : null;
    }
    if (c < -EQUATOR_EPS) {
      if (dz >= -X_EPS) return null; // plane at/above the axis: ray fully below
      const hi = Math.min(r, dz / c); // dz/c > 0 here
      return hi > X_EPS ? [0, hi] : null;
    }
    // near-equator: material above the plane needs r·c > dz; the ray's
    // whole material sits within radius·EQUATOR_EPS of the axis height,
    // so only a plane above that provably clears it
    if (dz > grid.radius * EQUATOR_EPS) return null;
    return [0, r]; // plane at/below the ray's grazing height: whole ray live
  };

  const trimBand = (bandTop: number, cut: number, region: Vec2[][]): Vec2[][] => {
    // 1. LEVEL GATE — one pass over the cells; a level with no work
    //    anywhere returns [] before any Clipper work. This is where most
    //    of the Stage C savings live.
    let anyWork = false;
    gate: for (let j = 0; j < nTheta; j++) {
      const c = cos[j];
      if (Math.abs(c) < EQUATOR_EPS) {
        anyWork = true;
        break;
      }
      if (c > 0) {
        const rCut = (cut - grid.axisZ) / c;
        if (rCut <= 0) {
          anyWork = true;
          break;
        }
        for (let i = 0; i < grid.nx; i++) {
          if (grid.r[j * grid.nx + i] > rCut) {
            anyWork = true;
            break gate;
          }
        }
      } else if (cut < grid.axisZ - X_EPS) {
        anyWork = true;
        break;
      }
    }
    if (!anyWork) return [];

    // 2. Subtract one conservative rectangle per no-work cell — but only
    //    where the rectangle provably contains no live work from ANY cell
    //    of its column (the live-interval filter; module docs). The
    //    wedge-vs-rect margin m shrinks every rectangle and pads every
    //    live interval, so a rectangle survives only where no
    //    above-plane material's plan footprint (across the angular slab)
    //    reaches it. x is exact (X doesn't rotate).
    const m = grid.radius * 2 * Math.sin(dTheta / 2) + X_EPS;
    const rects: Vec2[][] = [];
    for (let j = 0; j < nTheta; j++) {
      const c = cos[j];
      const s = sin[j];
      if (Math.abs(c) < EQUATOR_EPS) continue; // degenerate: keep everything
      const rTop = rTopAt(bandTop, j);
      for (let i = 0; i < grid.nx; i++) {
        const r = grid.r[j * grid.nx + i];
        let yLo: number;
        let yHi: number;
        if (c > EQUATOR_EPS) {
          // no-work for this cell iff material stands at/below the cut
          // plane; the wedge is r ∈ [r_cut, r_top] (empty beyond radius)
          const rCut = (cut - grid.axisZ) / c;
          if (rCut <= 0 || r > rCut || rCut > grid.radius) continue;
          const y1 = rCut * s;
          const y2 = rTop * s;
          yLo = Math.min(y1, y2) + m;
          yHi = Math.max(y1, y2) - m;
        } else {
          // below the cutting equator with the plane at/above the axis:
          // the level provably touches nothing on this ray; the wedge is
          // the ray's whole plan extent r ∈ [0, r_standing] (sin < 0, so
          // y descends with r)
          if (cut >= grid.axisZ - X_EPS) continue;
          const ySurface = r * s;
          yLo = Math.min(0, ySurface) + m;
          yHi = Math.max(0, ySurface) - m;
        }
        if (yLo >= yHi) continue;
        // live-interval filter: any other cell of this column whose
        // above-plane material's padded plan y-extent meets the rect
        // kills it (its ray crosses the rect's plan strip above the plane)
        let blocked = false;
        for (let jw = 0; jw < nTheta && !blocked; jw++) {
          if (jw === j) continue;
          const live = liveRange(i, jw, cut);
          if (!live) continue;
          const yA = live[0] * sin[jw];
          const yB = live[1] * sin[jw];
          const lo = Math.min(yA, yB) - m;
          const hi = Math.max(yA, yB) + m;
          if (lo < yHi && hi > yLo) blocked = true;
        }
        if (blocked) continue;
        const xLo = xAt(i) - grid.pitchX / 2 - X_EPS;
        const xHi = xAt(i) + grid.pitchX / 2 + X_EPS;
        rects.push([
          { x: xLo, y: yLo },
          { x: xHi, y: yLo },
          { x: xHi, y: yHi },
          { x: xLo, y: yHi },
        ]);
      }
    }

    // 3. Chunked subtraction — many small `difference` calls beat one
    //    giant one on Clipper's superlinear path count.
    let out = region;
    for (let k = 0; k < rects.length; k += TRIM_CHUNK) {
      out = difference(out, rects.slice(k, k + TRIM_CHUNK));
      if (out.length === 0) return [];
    }
    return out;
  };

  const stampBand = (bandTop: number, cut: number, swept: Vec2[][]): void => {
    if (swept.length === 0) return;
    // bbox cull over the swept polygon set
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const loop of swept) {
      for (const p of loop) {
        if (p.x < bx0) bx0 = p.x;
        if (p.x > bx1) bx1 = p.x;
        if (p.y < by0) by0 = p.y;
        if (p.y > by1) by1 = p.y;
      }
    }
    for (let j = 0; j < nTheta; j++) {
      const c = cos[j];
      if (c <= EQUATOR_EPS) continue; // near-equator + lower half: never stamped
      const rCut = (cut - grid.axisZ) / c;
      if (rCut <= X_EPS) continue; // plane at/below the axis: not this level's bound
      const rTop = rTopAt(bandTop, j);
      const base = j * grid.nx;
      for (let i = 0; i < grid.nx; i++) {
        const r = grid.r[base + i];
        if (r <= rCut) continue; // nothing standing above the plane
        const hi = Math.min(r, rTop);
        // the band's radial segment, sampled at its ends and midpoint —
        // ALL three cutting-frame points must lie in the swept area for
        // the stamp (any sample outside → the cell stays untouched)
        let all = true;
        for (let k = 0; k < 3; k++) {
          const rr = k === 0 ? rCut : k === 1 ? (rCut + hi) / 2 : hi;
          const x = xAt(i);
          const y = rr * sin[j];
          if (x < bx0 || x > bx1 || y < by0 || y > by1 || !insideSwept(x, y, swept)) {
            all = false;
            break;
          }
        }
        if (all) grid.r[base + i] = Math.min(r, rCut);
      }
    }
  };

  return { trimBand, stampBand, view };
}

/** even-odd point-in-polygon over a contour set (Clipper output: outer
 *  loops CCW, holes CW — even-odd reads the nesting correctly) */
function insideSwept(x: number, y: number, contours: Vec2[][]): boolean {
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
