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
 * (only reduce a cell's r when its whole above-floor segment's plan
 * extent lies within ONE covered interval of the swept set — exact, no
 * sampled approximation), TRIM
 * conservatively (only subtract area certainly containing no work,
 * classified at the slab edge and shrunk by the wedge-vs-rect margin
 * before subtracting). The
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
 * TRIM FORMULATION (a deviation from the stage-C brief's recipe, forced
 * by the invariant — see trimBand below): the trim subtracts, per X
 * column, the COMPLEMENT of the union of live strips. A plan point
 * (x, y) can only carry work for a row whose above-plane material
 * projects onto it (the row's liveRange radial interval, mapped through
 * y = r·sin(φ)), so the gaps between merged padded live strips are
 * provably air for EVERY row of the column — including whole no-work
 * rays, whose honest span is everything above the cut plane
 * (r ∈ [r_cut, R]; the original per-cell band-slice wedge
 * [r_cut, r_top] died under the wedge-vs-rect margin m before Clipper —
 * measured ~0.08% trim on the bench job). Subtracting anywhere a live
 * ray projects would strand live material and under-stamp the neighbour
 * — uncut waste, the one forbidden direction — hence the strips, padded
 * by m for the ±dθ/2 slab-angle projection spread, are never touched
 * (strips narrower than the op's tool are widened to tool width —
 * pocket2d cannot enter them and would abandon the whole level — but
 * wide strips keep the plain m pad).
 *
 * Pure module: no worker/UI deps, no gcode; mutates only the grid it was
 * handed (which `adoptStanding` guarantees is the caller's own copy).
 * Stamping LOWERS cells monotonically; the grid stays stock-radius space
 * per the P1 contract.
 *
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
  /** the op's tool diameter — live strips narrower than this cannot be
   *  pocketed (pocket2d would abandon the level), so KEPT strips are
   *  dilated symmetrically up to this width before the subtraction;
   *  absent = no dilation */
  toolDiameter?: number,
): {
  /** trim the level's clearing region to cells with work; [] = skip the
   *  level (the input region is never mutated) */
  trimBand: (bandTop: number, cut: number, region: Vec2[][]) => Vec2[][];
  /** record the swept removal after the level's moves emitted; `swept` =
   *  the union of the tool-disc bands of the orbit passes actually cut,
   *  floored at `cut`. A cell is reduced to the plane's bound only when
   *  its whole above-floor segment's plan extent lies within ONE covered
   *  y interval of `swept` at the cell's column line (exact, all-or-
   *  nothing — a sampled test could straddle an unswept gap). */
  stampBand: (bandTop: number, cut: number, swept: Vec2[][]) => void;
  /** the underlying per-orientation view (tests/diagnostics) */
  view: StandingBandView;
  /** compute the honest standing ceiling over the level's kept cells */
  computeCeiling: (bandTop: number, cut: number, region: Vec2[][]) => number;
} {
  const A = (angleDeg * Math.PI) / 180;
  const nTheta = grid.nTheta;
  const dTheta = (2 * Math.PI) / nTheta;
  const cos = new Float64Array(nTheta);
  const sin = new Float64Array(nTheta);
  // the SLAB-EDGE cos: cos at the slab edge NEAREST the pole (φ = 0).
  // Material classified at the row's CENTER ray can stand up to
  // r·(cos_edge − cos_center) ≈ R·sin(dθ/2) above the plane at the slab
  // edge — a center-classified no-live row can be live at its edge (the
  // randomized oracle caught exactly this hole), so liveness classifies
  // at the worst case instead.
  const cHi = new Float64Array(nTheta);
  for (let j = 0; j < nTheta; j++) {
    const phi = j * dTheta - A;
    cos[j] = Math.cos(phi);
    sin[j] = Math.sin(phi);
    const nearest = Math.max(0, Math.abs(Math.atan2(sin[j], cos[j])) - dTheta / 2);
    cHi[j] = Math.cos(nearest);
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
   * Classified at the SLAB EDGE (cHi): if cHi > 0 the plane bounds the ray
   * at dz/cHi at the nearest edge, so live iff dz/cHi < r_st; if cHi ≤ 0
   * the whole slab sits at/below the axis height, so only a plane below
   * the axis leaves anything live. Feeds BOTH the trim and the level gate.
   */
  const liveRange = (i: number, j: number, cut: number): [number, number] | null => {
    const r = grid.r[j * grid.nx + i];
    const dz = cut - grid.axisZ;
    const cEdge = cHi[j];
    if (cEdge > 0) {
      const lo = Math.max(0, dz / cEdge);
      return lo < r ? [lo, r] : null;
    }
    if (dz >= -X_EPS) return null; // plane at/above the axis: slab fully below
    const hi = Math.min(r, dz / cEdge); // dz/cEdge > 0 here
    return hi > X_EPS ? [0, hi] : null;
  };

  const trimBand = (_bandTop: number, cut: number, region: Vec2[][]): Vec2[][] => {
    // 1. LEVEL GATE — one pass over the cells; a level with no live
    //    material anywhere returns [] before any Clipper work. This is
    //    where most of the Stage C savings live. (bandTop bounds the
    //    STAMP only — the trim skips everything provably above the cut
    //    plane. Liveness classifies at the slab edge via liveRange, the
    //    same predicate the subtraction below trusts.)
    let anyWork = false;
    gate: for (let j = 0; j < nTheta; j++) {
      for (let i = 0; i < grid.nx; i++) {
        if (liveRange(i, j, cut) !== null) {
          anyWork = true;
          break gate;
        }
      }
    }
    if (!anyWork) return [];

    // 2. Subtract everything PROVABLY air, per X column. A plan point
    //    (x, y) can only carry work for a row whose above-plane material
    //    projects onto it — liveRange's radial interval mapped through
    //    y = r·sin(φ_jw) — so the union of those live strips (padded by
    //    the wedge-vs-rect margin m, which covers the ±dθ/2 slab-angle
    //    projection spread) is the must-keep set, and the gaps between
    //    the merged strips are air for EVERY row of the column. x is
    //    exact (X doesn't rotate), so each gap subtracts as a rectangle
    //    spanning the column's x slab.
    //
    //    This subsumes a per-cell no-work wedge: a no-work cell
    //    contributes no strip, so its whole plan extent is subtractable
    //    wherever no live neighbour projects — and the honest no-work
    //    span is everything above the cut plane, r ∈ [r_cut, R], NOT the
    //    band slice [r_cut, r_top]: the band top bounds what the STAMP
    //    may claim, not what the TRIM may skip, and a stepDown-thin band
    //    slice never survives m anyway (measured: ~0.08% trim on the
    //    bench job, the Stage C failure this formulation replaces).
    const m = grid.radius * 2 * Math.sin(dTheta / 2) + X_EPS;
    // SELECTIVE STRIP DILATION: a kept live strip narrower than the tool
    // cannot be entered by pocket2d (the level gets abandoned wholesale —
    // "clearing frame thinner than the tool"), so thin strips are widened
    // symmetrically to tool diameter + 0.05 before the subtraction. Wide
    // strips keep the plain m pad — a blanket inset measured 29.6% savings
    // vs 75% unpadded, so the extra pad is for thin strips only.
    const minStrip = toolDiameter !== undefined ? toolDiameter + 0.05 : 0;
    // the gap range spans the region's own y-extent (a footprint may
    // carry a margin past the stock radius; anything outside the region
    // needs no subtraction anyway)
    let rLo = Infinity;
    let rHi = -Infinity;
    for (const loop of region) {
      for (const p of loop) {
        if (p.y < rLo) rLo = p.y;
        if (p.y > rHi) rHi = p.y;
      }
    }
    if (!Number.isFinite(rLo)) return []; // empty region: nothing to trim
    const rects: Vec2[][] = [];
    const iv: [number, number][] = [];
    for (let i = 0; i < grid.nx; i++) {
      iv.length = 0;
      for (let j = 0; j < nTheta; j++) {
        const live = liveRange(i, j, cut);
        if (!live) continue;
        const yLo = Math.min(live[0] * sin[j], live[1] * sin[j]) - m;
        const yHi = Math.max(live[0] * sin[j], live[1] * sin[j]) + m;
        if (yHi - yLo < minStrip) {
          const mid = (yLo + yHi) / 2;
          iv.push([mid - minStrip / 2, mid + minStrip / 2]);
        } else {
          iv.push([yLo, yHi]);
        }
      }
      iv.sort((a, b) => a[0] - b[0]);
      const xLo = xAt(i) - grid.pitchX / 2 - X_EPS;
      const xHi = xAt(i) + grid.pitchX / 2 + X_EPS;
      let prev = rLo;
      for (let k = 0; k < iv.length; k++) {
        if (iv[k][0] > prev) {
          rects.push([
            { x: xLo, y: prev },
            { x: xHi, y: prev },
            { x: xHi, y: iv[k][0] },
            { x: xLo, y: iv[k][0] },
          ]);
        }
        if (iv[k][1] > prev) prev = iv[k][1];
      }
      if (prev < rHi) {
        rects.push([
          { x: xLo, y: prev },
          { x: xHi, y: prev },
          { x: xHi, y: rHi },
          { x: xLo, y: rHi },
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

  /** The honest approach ceiling: the tallest standing material over the
   *  level's kept (trimmed) region, in the waterline frame. A cell
   *  contributes iff it still holds live material above the cut plane
   *  (liveRange — the same predicate the trim trusts) AND its (x,y)
   *  projection lands inside the region. The pocket's approach rapid
   *  stops above this, so a trimmed orientation never dives it through
   *  a column the ladder never cleared (the 2026-10-30 yellow-streak
   *  report). No live cell in-region = the band top is honest already.
   *  bbox pretest per cell — the point-in-polygon pass only runs on the
   *  region's own cells (stampBand culls the same way). */
  const computeCeiling = (bandTop: number, cut: number, region: Vec2[][]): number => {
    if (region.length === 0) return bandTop;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const loop of region) {
      for (const p of loop) {
        if (p.x < bx0) bx0 = p.x;
        if (p.x > bx1) bx1 = p.x;
        if (p.y < by0) by0 = p.y;
        if (p.y > by1) by1 = p.y;
      }
    }
    let maxZ = -Infinity;
    for (let j = 0; j < nTheta; j++) {
      const c = cHi[j];
      const s = sin[j];
      for (let i = 0; i < grid.nx; i++) {
        if (liveRange(i, j, cut) === null) continue;
        const x = xAt(i);
        const r = grid.r[j * grid.nx + i];
        const y = r * s;
        if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
        const z = grid.axisZ + r * c;
        if (z > maxZ && pointInRegion({ x, y }, region)) maxZ = z;
      }
    }
    return maxZ > cut ? maxZ : bandTop;
  };

  const pointInRegion = (pt: Vec2, region: Vec2[][]): boolean => {
    for (const loop of region) {
      if (pointInContour(pt, loop)) return true;
    }
    return false;
  };

  const pointInContour = (pt: Vec2, c: Vec2[]): boolean => {
    let inside = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const xi = c[i].x, yi = c[i].y, xj = c[j].x, yj = c[j].y;
      if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  const stampBand = (_bandTop: number, cut: number, swept: Vec2[][]): void => {
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
    // EXACT per-column coverage: walk the swept set's edges collecting
    // even-odd y-crossings at x = x_i (a grid ray keeps x constant), then
    // pair them into covered y intervals. Point-sampling the band segment
    // could straddle an unswept gap and OVER-STAMP (the forbidden
    // direction); the interval test is exact.
    const cov: ([number, number][] | null)[] = new Array(grid.nx).fill(null);
    for (let i = 0; i < grid.nx; i++) {
      const x = xAt(i);
      if (x < bx0 || x > bx1) continue;
      const ys: number[] = [];
      for (const loop of swept) {
        for (let e = 0, f = loop.length - 1; e < loop.length; f = e++) {
          const p = loop[e];
          const q = loop[f];
          if ((p.x > x) !== (q.x > x)) {
            ys.push(q.y + ((p.y - q.y) * (x - q.x)) / (p.x - q.x));
          }
        }
      }
      if (ys.length < 2) continue;
      ys.sort((a, b) => a - b);
      const iv: [number, number][] = [];
      for (let k = 0; k + 1 < ys.length; k += 2) iv.push([ys[k], ys[k + 1]]);
      cov[i] = iv;
    }
    const dz = cut - grid.axisZ;
    for (let j = 0; j < nTheta; j++) {
      const c = cos[j];
      if (c <= EQUATOR_EPS) continue; // near-equator + lower half: never stamped
      // (a cut lower-half band leaves an annular hole the solid
      // 0-to-r grid cannot represent; skipping under-stamps = safe)
      const rAbove = Math.max(0, dz / c); // the plane's bound = the stamp target
      const s = sin[j];
      const base = j * grid.nx;
      for (let i = 0; i < grid.nx; i++) {
        const iv = cov[i];
        if (!iv) continue;
        const r = grid.r[base + i];
        if (r <= rAbove + X_EPS) continue; // nothing standing above the plane
        // the cell's WHOLE above-floor segment [rAbove, r] — not the band
        // slice: material standing above bandTop was swept away by the
        // same tool passes, and claiming it is not over-claiming
        const yA = rAbove * s;
        const yB = r * s;
        const lo = Math.min(yA, yB);
        const hi = Math.max(yA, yB);
        // both segment ends inside ONE merged interval → the whole span
        // is covered (intervals are contiguous; a gap between intervals
        // would leave part of the segment unswept)
        for (const [a, b] of iv) {
          if (lo >= a && hi <= b) {
            grid.r[base + i] = rAbove;
            break;
          }
        }
      }
    }
  };

  return { trimBand, stampBand, view, computeCeiling };
}
