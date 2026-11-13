/**
 * ADAPTIVE CLEARING SELECTOR (PLAN.md, "Adaptive clearing — constant-
 * engagement roughing", SPEC 2026-11-13): the deep-bulk third route for
 * flat area-clearing ops. Adaptive/trochoidal roughing is NOT an operation
 * and NOT a user choice — it is picked automatically the way the
 * continuous-descent path already is, inside `pocket2d`.
 *
 * Ownership of the three strategies:
 *  - `descent` is NOT decided here. pocket2d's existing continuous-descent
 *    branch (single surviving orbit, bore-fits, real ladder, not
 *    finishingOnly) takes precedence and stays exactly where it is — it
 *    returns before this selector is ever consulted. The value exists in
 *    the union because callers reason about all three routes; this
 *    function never returns it.
 *  - `trochoid` fires when the cut is DEEP in bulk stock, per the spec
 *    rule (constants are first-cut, the RULE SHAPE is the contract —
 *    depth × area, never material-dependent, never user-set):
 *
 *        trochoid  ⇔  depth > 2·D  AND  levels ≥ 2  AND  orbitCount > 1
 *
 *    `depth` = topZ − floorZ in mm; D is the tool diameter (depth in tool
 *    diameters is the real variable); `levels` = the z-ladder count;
 *    `orbitCount` = flatPassCount, the summed surviving-loop count the
 *    emitter already works from.
 *  - `orbits` is everything else: today's contour-offset emission,
 *    byte-identical (the minLoopPerimeter/leadIn precedent: absent ⇒
 *    unchanged). Shallow or single-orbit cuts stay on contour offsets —
 *    they are shorter and gentler there (spec, "what it will NOT address").
 */

export type ClearingStrategy = 'descent' | 'orbits' | 'trochoid';

export interface ClearingFacts {
  /** cutting diameter of the tool, mm */
  toolDiameter: number;
  /** topZ − floorZ, mm */
  depth: number;
  /** roughing z-ladder level count */
  levels: number;
  /** flatPassCount: summed surviving clearing loops (all inset passes) */
  orbitCount: number;
}

/**
 * The two GEOMETRY-INDEPENDENT legs of the trochoid rule (depth in tool
 * diameters, real ladder). The third leg — orbitCount > 1 — needs the
 * region's offset ladder, so only the generator knows it; the ⚡ popup
 * (which knows the op's depth/step-down but not the region shape) calls
 * this to say "eligible on depth; the region decides at generate".
 */
export function trochoidDepthLegs(toolDiameter: number, depth: number, levels: number): boolean {
  return depth > 2 * toolDiameter && levels >= 2;
}

export function chooseClearingStrategy(f: ClearingFacts): ClearingStrategy {
  return trochoidDepthLegs(f.toolDiameter, f.depth, f.levels) && f.orbitCount > 1
    ? 'trochoid'
    : 'orbits';
}

/**
 * ADAPTIVE EMITTER (spec build step 2) — the constant-engagement roughing
 * plan, pure geometry, NO Move[]: pocket2d replays the plan per Z level.
 * The plan is LEVEL-INDEPENDENT (the region is identical at every level,
 * the same fact the hoisted orbit ladder rests on), so the walk decisions
 * are measured ONCE against a rasterized standing grid and replayed.
 *
 * Strategy per ring, WALKED INNERMOST-FIRST: the entry ramp along a ring's
 * own loop (entry.ts, the app-wide entry discipline) pre-sweeps that
 * ring's band, so a ramped ring's walk is the cleaning lap; a LINKED
 * ring (stay-down from the previous walk's end, provably swept) does the
 * ring-to-ring clearing — walking it, the virgin strip between the rings
 * is exactly ae wide almost everywhere. Straight G1 where the MEASURED
 * engagement stays ≤ ae·ENGAGEMENT_TOLERANCE (the bulk of every ring); a
 * backward PEEL LOOP (one semicircular arc swinging into swept space)
 * where it would exceed it — concave corners, fresh sub-regions. The
 * engagement metric is the honest operational one: newly-swept standing
 * area ÷ path length (area per length = width).
 *
 * HONEST LIMITS (recorded per the spec's discipline clauses):
 *  - ENTRY EXCEPTION: the FIRST ramp revolution of an entry cuts virgin
 *    material at full disc width — bounded by the entry.ts descent
 *    discipline (≤ 3° slope, ≤ stepDown fresh material per revolution),
 *    the same accepted behavior as every existing pocket entry.
 *  - CORNER PIVOTS: a disc pivoting a sharp ring corner carves an O(R²)
 *    outer-quadrant wedge that no semicircle peel can dilute (the wedge
 *    does not shrink with ρ); those candidates commit over-bound via the
 *    straight fallback, bounded by the disc quadrant itself — the
 *    physical ceiling for ANY single-pass strategy and identical to the
 *    orbit mode's own corner pivot. The multi-circle corner nibble
 *    belongs to the spec's tuning step. Over-bound commits are rare
 *    (corner anchors and pinches narrower than the tool) and recorded
 *    in the steps' `eng` — the re-simulation surfaces them honestly.
 */

import type { Vec2 } from '../core/types';
import { intersection, offsetInward, offsetOutward } from './clipper';
import { arcTable } from './entry';
import { pointAtArc } from './clipUtils';
import { rotateToNearest } from './paths';

/** Radial engagement target, fraction of tool Ø (first-cut per spec; the
 *  spec's tuning step owns the value). */
export const AE_FACTOR = 0.15;
/** Measured engagement bound multiplier: ae × this is the walk contract. */
export const ENGAGEMENT_TOLERANCE = 1.25;
/** Peel semicircle radius as a fraction of tool radius (first-cut). */
const PEEL_R_FACTOR = 0.6;
/** Peel shrink floor — below this the peel degenerates; straight commit. */
const PEEL_R_MIN = 0.15;
/** Walk subdivision length: decisions are measured at this granularity. */
const STEP_MAX = 0.5;

/** One committed XY move of a walk. `center` present ⇒ a G2/G3 peel arc. */
export interface TrochoidStep {
  to: Vec2;
  /** absolute arc center (I/J are computed at emission, relative to the
   *  move's start point) */
  center?: Vec2;
  cw?: boolean;
  /** engagement measured at plan time (area/length, mm) — cross-checked
   *  against the independent re-simulation by the tests */
  eng?: number;
}

export interface TrochoidWalk {
  /** the ring as walked, rotated so [0] is the walk start */
  loop: Vec2[];
  steps: TrochoidStep[];
  /** final position — loop[0] again (closed walk) */
  end: Vec2;
  /**
   * Walk j>0 only: the capsule from walks[j−1].end to loop[0] lies in
   * swept, in-region grid cells end to end — a stay-down link at depth
   * is safe and pocket2d emits one. False ⇒ raised approach + ramp entry
   * (which pre-sweeps the ring's band before the walk, entry.ts).
   */
  linkStayDown: boolean;
}

export interface TrochoidPlan {
  /** innermost ring first, walk order */
  walks: TrochoidWalk[];
  /** kept ladder loops per ring (k = 0 is wall-adjacent) — for callers */
  ladder: Vec2[][][];
  /** ladder loops dropped by minLoopPerimeter */
  dropped: number;
  ae: number;
  /** measured max engagement over committed walk segments, mm */
  maxEngagement: number;
  /** every reachable cell swept by the plan (dropped slivers aside) */
  covered: boolean;
  /** the reachable material (morphological opening of the region) — the
   *  re-simulation rebuilds its grid from this */
  opening: Vec2[][];
  toolR: number;
}

// ---- the standing grid (module-private) ----

interface Grid {
  x0: number;
  y0: number;
  /** cell pitch, mm */
  p: number;
  nx: number;
  ny: number;
  /** 1 = the tool disc can reach this material (inside the opening) */
  mask: Uint8Array;
  /** 1 = swept by the plan so far (level-independent 2D abstraction:
   *  every level cuts the same XY footprint) */
  swept: Uint8Array;
  /** visit tokens for probe de-duplication across overlapping discs */
  visit: Uint32Array;
  token: number;
}

function bboxOf(paths: Vec2[][]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const path of paths) {
    for (const v of path) {
      if (v.x < x0) x0 = v.x;
      if (v.y < y0) y0 = v.y;
      if (v.x > x1) x1 = v.x;
      if (v.y > y1) y1 = v.y;
    }
  }
  return { x0, y0, x1, y1 };
}

/** Even-odd point-in-polygon-set (clipper output: outer CCW, holes CW). */
function inPolySet(paths: Vec2[][], x: number, y: number): boolean {
  let inside = false;
  for (const poly of paths) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** Rasterize the reachable material. Pitch = ae/4 (the spec's oracle
 *  granularity); the bbox carries a one-pitch margin. */
function buildGrid(opening: Vec2[][], p: number): Grid {
  const bb = bboxOf(opening);
  const nx = Math.max(1, Math.ceil((bb.x1 - bb.x0) / p) + 3);
  const ny = Math.max(1, Math.ceil((bb.y1 - bb.y0) / p) + 3);
  const mask = new Uint8Array(nx * ny);
  const x0 = bb.x0 - p;
  const y0 = bb.y0 - p;
  for (let iy = 0; iy < ny; iy++) {
    const y = y0 + (iy + 0.5) * p;
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + (ix + 0.5) * p;
      if (inPolySet(opening, x, y)) mask[iy * nx + ix] = 1;
    }
  }
  return { x0, y0, p, nx, ny, mask, swept: new Uint8Array(nx * ny), visit: new Uint32Array(nx * ny), token: 0 };
}

/** Mark every cell within R of (cx, cy) swept. */
function stampDisc(g: Grid, cx: number, cy: number, R: number): void {
  const p = g.p;
  const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
  const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
  const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
  const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
  const r2 = (R + 0.7071 * p) * (R + 0.7071 * p); // cell-center tolerance
  for (let iy = iy0; iy <= iy1; iy++) {
    const dy = g.y0 + (iy + 0.5) * p - cy;
    for (let ix = ix0; ix <= ix1; ix++) {
      const dx = g.x0 + (ix + 0.5) * p - cx;
      if (dx * dx + dy * dy <= r2) g.swept[iy * g.nx + ix] = 1;
    }
  }
}

/** Stamp tool discs along a straight segment (spacing ≤ R/2). */
function stampSegment(g: Grid, from: Vec2, to: Vec2, R: number): void {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / (R / 2)));
  for (let i = 0; i <= n; i++) {
    stampDisc(g, from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n, R);
  }
}

/** Stamp tool discs along a circular arc (start `from` on the circle; cw
 *  or ccw sweep of `sweep` radians; spacing ≤ toolR/2 along the arc). */
function stampArc(g: Grid, from: Vec2, c: Vec2, cw: boolean, sweep: number, toolR: number): void {
  const rho = Math.hypot(from.x - c.x, from.y - c.y);
  if (rho < 1e-9) return;
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const n = Math.max(2, Math.ceil((sweep * rho) / (toolR / 2)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (cw ? -1 : 1) * (sweep * i) / n;
    stampDisc(g, c.x + Math.cos(a) * rho, c.y + Math.sin(a) * rho, toolR);
  }
}

/** Count STANDING (in-mask, unswept) cells within R of the segment, each
 *  counted once — the newly-swept material of the candidate move. */
function probeSegment(g: Grid, from: Vec2, to: Vec2, R: number): number {
  const tok = ++g.token;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / (R / 2)));
  let count = 0;
  const p = g.p;
  for (let i = 0; i <= n; i++) {
    const cx = from.x + ((to.x - from.x) * i) / n;
    const cy = from.y + ((to.y - from.y) * i) / n;
    const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
    const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
    const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
    const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
    const r2 = (R + 0.7071 * p) * (R + 0.7071 * p);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = g.y0 + (iy + 0.5) * p - cy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const idx = iy * g.nx + ix;
        if (g.visit[idx] === tok) continue;
        const dx = g.x0 + (ix + 0.5) * p - cx;
        if (dx * dx + dy * dy > r2) continue;
        g.visit[idx] = tok;
        if (g.mask[idx] && !g.swept[idx]) count++;
      }
    }
  }
  return count;
}

/** Count standing cells within R of an arc sweep (each cell once). */
function probeArc(g: Grid, from: Vec2, c: Vec2, cw: boolean, sweep: number, toolR: number): number {
  const tok = ++g.token;
  const rho = Math.hypot(from.x - c.x, from.y - c.y);
  if (rho < 1e-9) return 0;
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const n = Math.max(2, Math.ceil((sweep * rho) / (toolR / 2)));
  let count = 0;
  const p = g.p;
  const R = toolR;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (cw ? -1 : 1) * (sweep * i) / n;
    const cx = c.x + Math.cos(a) * rho;
    const cy = c.y + Math.sin(a) * rho;
    const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
    const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
    const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
    const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
    const r2 = (R + 0.7071 * p) * (R + 0.7071 * p);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = g.y0 + (iy + 0.5) * p - cy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const idx = iy * g.nx + ix;
        if (g.visit[idx] === tok) continue;
        const dx = g.x0 + (ix + 0.5) * p - cx;
        if (dx * dx + dy * dy > r2) continue;
        g.visit[idx] = tok;
        if (g.mask[idx] && !g.swept[idx]) count++;
      }
    }
  }
  return count;
}

/** True when every cell within R of the segment lies OUTSIDE the mask
 *  (the move would stay in cut/air — never beyond the reachable wall). */
function segmentInsideMask(g: Grid, from: Vec2, to: Vec2, R: number): boolean {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / (R / 2)));
  const p = g.p;
  for (let i = 0; i <= n; i++) {
    const cx = from.x + ((to.x - from.x) * i) / n;
    const cy = from.y + ((to.y - from.y) * i) / n;
    const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
    const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
    const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
    const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
    const r2 = (R + 0.7071 * p) * (R + 0.7071 * p);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = g.y0 + (iy + 0.5) * p - cy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = g.x0 + (ix + 0.5) * p - cx;
        if (dx * dx + dy * dy > r2) continue;
        if (!g.mask[iy * g.nx + ix] && !g.swept[iy * g.nx + ix]) return false;
      }
    }
  }
  return true;
}

/** Same containment test for an arc sweep. */
function arcInsideMask(g: Grid, from: Vec2, c: Vec2, cw: boolean, sweep: number, toolR: number): boolean {
  const rho = Math.hypot(from.x - c.x, from.y - c.y);
  if (rho < 1e-9) return false;
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const n = Math.max(2, Math.ceil((sweep * rho) / (toolR / 2)));
  const p = g.p;
  const R = toolR;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (cw ? -1 : 1) * (sweep * i) / n;
    const cx = c.x + Math.cos(a) * rho;
    const cy = c.y + Math.sin(a) * rho;
    const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
    const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
    const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
    const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
    const r2 = (R + 0.7071 * p) * (R + 0.7071 * p);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = g.y0 + (iy + 0.5) * p - cy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = g.x0 + (ix + 0.5) * p - cx;
        if (dx * dx + dy * dy > r2) continue;
        if (!g.mask[iy * g.nx + ix] && !g.swept[iy * g.nx + ix]) return false;
      }
    }
  }
  return true;
}

/** Fraction of in-mask cells near (cx, cy) already swept — picks the peel
 *  side (swing into swept space, never into the wall). */
function sweptFractionNear(g: Grid, cx: number, cy: number, R: number): number {
  const p = g.p;
  const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
  const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
  const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
  const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
  let inMask = 0;
  let swept = 0;
  const r2 = (R * 0.7) * (R * 0.7);
  for (let iy = iy0; iy <= iy1; iy++) {
    const dy = g.y0 + (iy + 0.5) * p - cy;
    for (let ix = ix0; ix <= ix1; ix++) {
      const dx = g.x0 + (ix + 0.5) * p - cx;
      if (dx * dx + dy * dy > r2) continue;
      const idx = iy * g.nx + ix;
      if (g.mask[idx]) {
        inMask++;
        if (g.swept[idx]) swept++;
      }
    }
  }
  return inMask === 0 ? 0 : swept / inMask;
}

/** Subdivide a closed loop's perimeter into arc-length anchors ≤ stepMax
 *  apart, keeping the loop's own vertices whole (walk decision points). */
function walkAnchors(cum: number[], stepMax: number): number[] {
  const out: number[] = [0];
  for (let i = 1; i <= cum.length - 1; i++) {
    const s0 = out[out.length - 1];
    const s1 = cum[i];
    const n = Math.max(1, Math.ceil((s1 - s0) / stepMax));
    for (let m = 1; m <= n; m++) out.push(s0 + ((s1 - s0) * m) / n);
  }
  return out; // last anchor = P (the closing vertex)
}

/** Squared distance from a point to a segment. */
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-12 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Min distance from a point to a loop's polyline. */
function distToLoop(loop: Vec2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const d = distToSeg(x, y, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * THE STAY-DOWN LINK TEST (pocket2d's clause-1 analogue, grid form): every
 * STANDING cell the link capsule touches must lie within the TARGET RING'S
 * OWN BAND — the ring's walk re-cuts its band, so the link sweeping it
 * removes nothing the walk was not about to remove (the 2026-10-29
 * provable-nothing rule). Cells outside that band and still standing mean
 * the link would plow virgin material: retract and ramp instead. Returns
 * the count of such violations.
 */
function capsuleViolations(
  g: Grid,
  from: Vec2,
  to: Vec2,
  R: number,
  target: Vec2[],
  toolR: number,
): number {
  const tok = ++g.token;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(len / (R / 2)));
  let violations = 0;
  const p = g.p;
  const exc = toolR + 0.7071 * p; // the target band's dilated tolerance
  for (let i = 0; i <= n; i++) {
    const cx = from.x + ((to.x - from.x) * i) / n;
    const cy = from.y + ((to.y - from.y) * i) / n;
    const ix0 = Math.max(0, Math.floor((cx - R - g.x0) / p));
    const ix1 = Math.min(g.nx - 1, Math.ceil((cx + R - g.x0) / p));
    const iy0 = Math.max(0, Math.floor((cy - R - g.y0) / p));
    const iy1 = Math.min(g.ny - 1, Math.ceil((cy + R - g.y0) / p));
    const r2 = (R + 0.7071 * p) * (R + 0.7071 * p);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = g.y0 + (iy + 0.5) * p - cy;
      for (let ix = ix0; ix <= ix1; ix++) {
        const idx = iy * g.nx + ix;
        if (g.visit[idx] === tok) continue;
        const dx = g.x0 + (ix + 0.5) * p - cx;
        if (dx * dx + dy * dy > r2) continue;
        g.visit[idx] = tok;
        if (g.mask[idx] && !g.swept[idx] && distToLoop(target, g.x0 + (ix + 0.5) * p, g.y0 + (iy + 0.5) * p) > exc) {
          violations++;
        }
      }
    }
  }
  return violations;
}

export interface TrochoidPlanOptions {
  regions: Vec2[][];
  footprint?: Vec2[][];
  toolR: number;
  minLoopPerimeter?: number;
}

/**
 * Plan the constant-engagement walk (innermost ring first). Pure: same
 * inputs ⇒ same plan; no wall clock, no randomness.
 */
export function planTrochoid(o: TrochoidPlanOptions): TrochoidPlan {
  const ae = AE_FACTOR * 2 * o.toolR;
  const bound = ae * ENGAGEMENT_TOLERANCE;
  const stepMax = STEP_MAX * o.toolR;
  const p = Math.max(ae / 4, 1e-3);

  // the reachable material: the morphological opening of the region by the
  // tool disc — sub-tool slivers stay standing and are NOT the plan's to
  // take (the minLoopPerimeter honesty, geometric form)
  const centerReach = offsetInward(o.regions, o.toolR);
  const opening = centerReach.length > 0 ? offsetOutward(centerReach, o.toolR) : [];
  // an empty opening means no tool-center path exists anywhere — the
  // ladder below is necessarily empty too (its k=0 ring is the same
  // offset), so no walk ever consults the grid. The early return keeps
  // every probe/stamp call below unconditionally non-null.
  if (opening.length === 0) {
    return {
      walks: [],
      ladder: [],
      dropped: 0,
      ae,
      maxEngagement: 0,
      covered: true,
      opening,
      toolR: o.toolR,
    };
  }
  const g = buildGrid(opening, p);

  // the ae inset ladder (the hoist's structure at ae spacing): reversed
  // for climb uniformly, minLoopPerimeter-filtered, footprint-clipped
  const ladder: Vec2[][][] = [];
  let dropped = 0;
  const minPerim = o.minLoopPerimeter;
  for (let k = 0; k < 10000; k++) {
    let loops = offsetInward(o.regions, o.toolR + k * ae);
    if (o.footprint && o.footprint.length > 0) {
      loops = intersection(loops, o.footprint);
    }
    if (loops.length === 0) break;
    loops = loops.map((raw) => [...raw].reverse());
    if (minPerim !== undefined) {
      const surviving = loops.filter((raw) => {
        let perim = 0;
        for (let i = 0; i < raw.length; i++) {
          const a = raw[i];
          const b = raw[(i + 1) % raw.length];
          perim += Math.hypot(b.x - a.x, b.y - a.y);
        }
        return perim >= minPerim;
      });
      dropped += loops.length - surviving.length;
      loops = surviving;
    }
    if (loops.length === 0) {
      // everything at this inset dropped: the rings inward of it would
      // re-cut swept space only — stop the ladder here
      break;
    }
    ladder.push(loops);
  }

  const walks: TrochoidWalk[] = [];
  let cur: Vec2 | null = null;
  let maxEngagement = 0;

  const cellArea = g.p * g.p;

  for (let k = ladder.length - 1; k >= 0; k--) {
    for (const raw of ladder[k]) {
      const loop: Vec2[] = cur ? rotateToNearest(raw, cur) : raw;
      const start = loop[0];
      const cum = arcTable(loop);
      const P = cum[loop.length];
      if (P < 1e-9) {
        walks.push({ loop, steps: [], end: start, linkStayDown: false });
        continue;
      }
      const anchors = walkAnchors(cum, stepMax);

      // the stay-down link test (pocket2d's clause-1 analogue): the
      // capsule from the previous walk's end to this ring's start must be
      // in-region, and every STANDING cell it touches must lie within the
      // target ring's own band — else the link plows virgin material
      let linkStayDown = false;
      if (cur !== null) {
        linkStayDown =
          segmentInsideMask(g, cur, start, o.toolR) &&
          capsuleViolations(g, cur, start, o.toolR, loop, o.toolR) === 0;
        if (linkStayDown) {
          // the link's own motion sweeps its capsule (pocket2d's model: it
          // cuts nothing the target walk was not about to remove — here
          // exactly the target band's strip). Stamp it, or the walk's
          // first step would re-count those cells as newly swept and the
          // engagement metric inflates to full-disc.
          stampSegment(g, cur, start, o.toolR);
        }
      }

      // an entry (no stay-down link) ramps along the ring's own loop —
      // pre-sweep the band the ramp clears (level-independent 2D model)
      if (!linkStayDown) {
        stampSegment(g, loop[0], loop[1 % loop.length], o.toolR);
        for (let i = 1; i < loop.length; i++) {
          stampSegment(g, loop[i - 1], loop[i], o.toolR);
        }
        stampSegment(g, loop[loop.length - 1], loop[0], o.toolR);
      }

      const steps: TrochoidStep[] = [];
      let pos: Vec2 = start;
      let s = 0;
      let ai = 1; // next anchor index
      while (s < P - 1e-9) {
        const sNext = Math.min(anchors[Math.min(ai, anchors.length - 1)], P);
        const b = pointAtArc(loop, cum, sNext);
        const len = Math.max(sNext - s, 1e-9);
        const measured = (probeSegment(g, pos, b, o.toolR) * cellArea) / len;

        if (measured <= bound) {
          steps.push({ to: b, eng: measured });
          stampSegment(g, pos, b, o.toolR);
          pos = b;
          s = sNext;
          if (measured > maxEngagement) maxEngagement = measured;
        } else {
          // PEEL — three tiers (the spec's "insert a backward trochoid
          // loop where it would exceed"):
          const dl = Math.hypot(b.x - pos.x, b.y - pos.y);
          const d = { x: (b.x - pos.x) / dl, y: (b.y - pos.y) / dl };
          // swept side: the semicircle swings into swept space — LEFT of
          // d sweeps CW (angles 180°→90°→0° around M = pos + ρ·d̂)
          const fl = sweptFractionNear(g, pos.x + -d.y * o.toolR, pos.y + d.x * o.toolR, o.toolR);
          const fr = sweptFractionNear(g, pos.x + d.y * o.toolR, pos.y - d.x * o.toolR, o.toolR);
          const cw = fl >= fr;
          let peeled = false;
          // TIER 1 — the semicircle D-peel: one arc through the swept
          // side, net advance 2ρ along the path (the cheap case)
          let rho = PEEL_R_FACTOR * o.toolR;
          while (rho >= PEEL_R_MIN * o.toolR) {
            const M = { x: pos.x + rho * d.x, y: pos.y + rho * d.y };
            const end = { x: pos.x + 2 * rho * d.x, y: pos.y + 2 * rho * d.y };
            const peelEng = (probeArc(g, pos, M, cw, Math.PI, o.toolR) * cellArea) / (Math.PI * rho);
            if (peelEng <= bound && arcInsideMask(g, pos, M, cw, Math.PI, o.toolR)) {
              steps.push({ to: end, center: M, cw, eng: peelEng });
              if (peelEng > maxEngagement) maxEngagement = peelEng;
              stampArc(g, pos, M, cw, Math.PI, o.toolR);
              stampSegment(g, pos, end, o.toolR);
              pos = end;
              // the peel consumed ~2ρ of walk arc length: rejoin the loop
              s = Math.min(P, s + 2 * rho);
              const rejoin = pointAtArc(loop, cum, s);
              const rLen = Math.hypot(rejoin.x - pos.x, rejoin.y - pos.y);
              const rEng = (probeSegment(g, pos, rejoin, o.toolR) * cellArea) / Math.max(rLen, 1e-9);
              steps.push({ to: rejoin, eng: rEng });
              if (rEng > maxEngagement) maxEngagement = rEng;
              stampSegment(g, pos, rejoin, o.toolR);
              pos = rejoin;
              peeled = true;
              break;
            }
            rho *= 0.5;
          }
          // TIER 2 — the FULL-CIRCLE trochoid: the corner-pivot case. A
          // disc pivoting a sharp ring corner carves an O(R²) outer-
          // quadrant wedge in one step; no semicircle dilutes it (the
          // wedge does not shrink with ρ). A full circle sweeps the same
          // wedge over its 2πρ path, so engagement = wedge/(2πρ) — take
          // the LARGEST contained radius (bigger dilutes better). The
          // circle returns to pos; the candidate then re-measures swept.
          // TIER 2 — the full-circle trochoid for the corner-pivot case
          // was tried here and REMOVED (2026-11-13, step 2): a disc
          // pivoting a sharp ring corner carves an O(R²) outer-quadrant
          // wedge, and the circle's own sweep of the un-walked strip
          // ahead keeps cEng = (wedge + strip·ρ)/(2πρ) above the bound
          // for every contained radius — no win, only path cost. The
          // honest v1: corner pivots commit over-bound (≤ the disc
          // quadrant, the physical ceiling for ANY single-pass strategy,
          // identical to the orbit mode's own corner pivot); the
          // multi-circle corner nibble belongs to the spec's tuning step.
          if (!peeled) {
            // TIER 3 — straight fallback: no bounded loop fits (pinches
            // narrower than the tool, or the wall-adjacent ring's corner
            // where even the smallest circle leaves the opening), or the
            // tiers stalled without progress twice (the wedge lies beyond
            // any loop's reach). Commit over-bound — stalling clears
            // nothing, the level must complete, and this is no worse than
            // today's orbit pivot.
            steps.push({ to: b, eng: measured });
            stampSegment(g, pos, b, o.toolR);
            pos = b;
            s = sNext;
            if (measured > maxEngagement) maxEngagement = measured;
          }
        }

        // advance the anchor cursor past the committed arc position
        while (ai < anchors.length - 1 && anchors[ai] <= s + 1e-9) ai++;
      }

      walks.push({ loop, steps, end: pos, linkStayDown });
      cur = pos;
    }
  }

  let covered = true;
  for (let i = 0; i < g.mask.length; i++) {
    if (g.mask[i] && !g.swept[i]) {
      covered = false;
      break;
    }
  }

  return {
    walks,
    ladder,
    dropped,
    ae,
    maxEngagement,
    covered,
    opening,
    toolR: o.toolR,
  };
}

/**
 * INDEPENDENT RE-SIMULATION (the tests' oracle, and the honesty check the
 * plan's self-report is cross-checked against): rebuild the standing grid
 * from the plan's opening, replay the walks exactly as pocket2d would
 * (entry ramps pre-sweep their ring's band; linked walks do not), and
 * measure every committed step's engagement from scratch. Returns the max
 * engagement over walk moves (entry-excluded, per the module contract) and
 * the unswept reachable cell count at the end.
 */
export function simulateTrochoidPlan(plan: TrochoidPlan): {
  maxEngagement: number;
  uncoveredCells: number;
} {
  const p = Math.max(plan.ae / 4, 1e-3);
  if (plan.opening.length === 0) return { maxEngagement: 0, uncoveredCells: 0 };
  const g = buildGrid(plan.opening, p);
  const cellArea = g.p * g.p;
  let maxEngagement = 0;
  const stampWalkBand = (loop: Vec2[]): void => {
    stampSegment(g, loop[0], loop[1 % loop.length], plan.toolR);
    for (let i = 1; i < loop.length; i++) stampSegment(g, loop[i - 1], loop[i], plan.toolR);
    stampSegment(g, loop[loop.length - 1], loop[0], plan.toolR);
  };
  for (let j = 0; j < plan.walks.length; j++) {
    const w = plan.walks[j];
    if (j > 0 && w.linkStayDown) {
      // the stay-down link sweeps its capsule first (mirrors the planner)
      const prevEnd = plan.walks[j - 1].end;
      stampSegment(g, prevEnd, w.loop[0], plan.toolR);
    } else {
      stampWalkBand(w.loop);
    }
    let pos: Vec2 = w.loop[0];
    for (const st of w.steps) {
      if (st.center && st.cw !== undefined) {
        const rho = Math.hypot(st.center.x - pos.x, st.center.y - pos.y);
        const eng = (probeArc(g, pos, st.center, st.cw, Math.PI, plan.toolR) * cellArea) / Math.max(Math.PI * rho, 1e-9);
        if (eng > maxEngagement) maxEngagement = eng;
        stampArc(g, pos, st.center, st.cw, Math.PI, plan.toolR);
        stampSegment(g, pos, st.to, plan.toolR);
      } else {
        const len = Math.hypot(st.to.x - pos.x, st.to.y - pos.y);
        const eng = len > 1e-9 ? (probeSegment(g, pos, st.to, plan.toolR) * cellArea) / len : 0;
        if (eng > maxEngagement) maxEngagement = eng;
        stampSegment(g, pos, st.to, plan.toolR);
      }
      pos = st.to;
    }
  }
  let uncovered = 0;
  for (let i = 0; i < g.mask.length; i++) {
    if (g.mask[i] && !g.swept[i]) uncovered++;
  }
  return { maxEngagement, uncoveredCells: uncovered };
}
