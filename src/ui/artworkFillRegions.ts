/**
 * Artwork FILL shading — the region triangulator (Alice, 2026-10-31:
 * "when you turn on fill areas it should shade the areas it thinks are
 * filled ... a lighter/more transparent infill of the same blue").
 *
 * Pure geometry, no React and no scene: the artwork's closed+filled
 * paths → triangles in the artwork's LOCAL space, lifted LIFT off the
 * surface (flat: along +Z; wrapped: radially off the artwork's own
 * cylinder) so the shade never z-fights the model or stock.
 * DISPLAY-ONLY — nothing downstream consumes the mesh (no sim, no
 * export), except the region-click pick, which resolves to a triangle's
 * OWNING path (the outline feature, never a region feature).
 *
 * POLYGONIZATION (round 2, Alice: "we should maybe not try to honour
 * the path's actual segments but create our own"): the raw path points
 * never reach the triangulator. Nesting depth comes from pointInLoop
 * parity, then the region is rebuilt through the clipper module —
 * region = difference(union(even-depth loops), union(odd-depth loops)).
 * The boolean output is clean rings (no duplicate/collinear vertices,
 * no self-intersections), but it lists outer and hole rings FLAT — so
 * fillRegions2D re-pairs every hole with its contour over the CLEAN
 * contours before earcut sees them. Earcut on the raw paths fanned
 * overlapping triangles on Alice's real ankh (both paths selected: the
 * counter passed as a raw hole list); on the polygonized rings the
 * overlap area is exactly zero (probes/ankh-fill-artifact.probetest.ts).
 *
 * TWO TRIANGLE SETS, one lifted vertex pool:
 *  - pick: every fill loop fans its OWN surface, unselected loops
 *    included — a region must be clickable BEFORE anything is selected
 *    (round 2: "i am unable to click within the ankh to select it").
 *    Nested loops overlap coplanarly, so each triangle carries its
 *    loop's depth: the picker takes the deepest hit (the counter beats
 *    the outline around it).
 *  - shade: ONLY the selected loops' region (the polygonized one, so it
 *    reads as what the raster will actually clear), for the visible
 *    infill. Unselected regions stay invisible-but-pickable.
 *
 * PARAMETRIZATION — regions are built in 2D and mapped back:
 *  - FLAT: (x, y) of the local points directly.
 *  - WRAPPED: (u, v) = (arc length around the cylinder, axial x), the u
 *    unwrapped CONTINUOUSLY along the loop (each step the short way) —
 *    the same unwrap the engrave wiring gives the fill raster, so a
 *    loop straddling the seam stays one loop and triangulates whole.
 */

import { ShapeUtils, Vector2 } from 'three';
import { difference, union } from '../cam/clipper';
import type { Vec3 } from '../core/types';

/** surface lift, mm — the shade floats this far off the model/stock */
export const FILL_SHADE_LIFT = 0.05;

/**
 * wrapped lift, mm — RADIAL lift off the cylinder. Round 3 needed 0.2
 * here, but that was the COARSE MESH losing the fight, not the lift:
 * measured (probes/measure-fill-dip.mjs) the round-3 shade's interior
 * triangles dipped up to 0.45mm below the lifted surface (9 of 99
 * triangles dove under the true cylinder) — no lift below 0.45 could
 * ever clear, so 0.2 only half-worked and showed as a visible gap where
 * it did. With subdivision (FILL_SUBDIVIDE_MAX_EDGE) the worst dip on
 * the same ankh is ~0.013mm, so 0.05 — the same as flat — clears with
 * 4x margin and the shade reads glued on again (round 4 sweep,
 * probes/sweep-fill-shade.mjs).
 */
export const FILL_SHADE_LIFT_WRAPPED = 0.05;

/**
 * max 2D edge, mm — the fineness constraint that fixed round 4 (Alice:
 * "you either need way more polygons, or render the fills on a 2d
 * surface and wrap it" — the (u,v) domain WAS the 2D surface, it just
 * had no fineness rule). Every triangle is midpoint-subdivided in (u,v)
 * — surface-mm, where Euclidean length is the honest arc length — until
 * its longest edge fits, THEN mapped to the cylinder. Measured sweep
 * (probes/fill-subdiv-sweep.probetest.ts, her ankh on R10): worst dip
 * below the lifted surface is r*(1-cos(maxEdge/2r)) ≈ 0.05 at 2mm,
 * 0.0125 at 1mm, 0.003 at 0.5mm. 1.0 gives a 4x margin under the 0.05
 * lift at ~4-5k triangles (pick+shade); 0.25 quadruples that for a dip
 * saving nothing visible. The stock renders 128 segments (0.003 chord
 * dip) — at 1mm the shade finally tessellates FINER than the stock, her
 * actual complaint.
 */
export const FILL_SUBDIVIDE_MAX_EDGE = 1.0;

/** one artwork path as the callers hold it (PathFeature-shape) */
export interface FillPath {
  points: Vec3[];
  closed?: boolean;
  filled?: boolean;
}

/** the fill candidates: closed AND painted (the generation rule verbatim) */
const isFillLoop = (p: FillPath): boolean => p.closed === true && p.filled === true;

/** even-odd point-in-loop, half-open on the high end ([lo,hi) crossings —
 * the engraveFillSpans convention, so a vertex shared by two segments
 * counts exactly once) */
export function pointInLoop(
  px: number,
  py: number,
  loop: { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const yi = loop[i].y;
    const yj = loop[j].y;
    if (yi > py !== yj > py) {
      const cx = loop[j].x + ((py - yi) * (loop[i].x - loop[j].x)) / (yj - yi);
      if (px < cx) inside = !inside;
    }
  }
  return inside;
}

/** nesting depth per loop: the loops strictly containing its sample
 * point (pointInLoop parity). EVEN depth bounds filled ground; ODD
 * depth is a hole in the loop directly around it. */
export function fillLoopDepths(loops: { x: number; y: number }[][]): number[] {
  const usable = loops.filter((l) => l.length >= 3);
  return usable.map((l, i) => {
    let d = 0;
    for (let k = 0; k < usable.length; k++) {
      if (k !== i && pointInLoop(l[0].x, l[0].y, usable[k])) d++;
    }
    return d;
  });
}

/**
 * The raw loops, rebuilt as CLEAN polygons through the clipper module
 * (Alice, round 2: "we should maybe not try to honour the path's actual
 * segments but create our own"): depth parity splits even (filled) from
 * odd (holes), difference carves the odd union out of the even union,
 * and the boolean output — simple rings, no duplicate/collinear
 * vertices, no self-intersections — is decomposed into contour+hole
 * regions by the SAME even-odd rule over the clean contours. The raw
 * path points never reach the triangulator: earcut on the ankh's raw
 * both-selected pair (body + counter as a hole list) fans overlapping
 * triangles; on the polygonized rings it cannot.
 */
export function polygonizeRegion2D(
  loops: { x: number; y: number }[][],
): FillRegion2D[] {
  const usable = loops.filter((l) => l.length >= 3);
  if (usable.length === 0) return [];
  const depth = fillLoopDepths(usable);
  const even = usable.filter((_, i) => depth[i] % 2 === 0);
  const odd = usable.filter((_, i) => depth[i] % 2 === 1);
  const holes = union(odd);
  const clean = holes.length > 0 ? difference(union(even), holes) : union(even);
  // the boolean solution lists outer and hole rings FLAT (orientation
  // aside) — the even-odd pass re-pairs every hole with its contour
  return fillRegions2D(clean);
}

export interface FillRegion2D {
  contour: { x: number; y: number }[];
  holes: { x: number; y: number }[][];
  /** the CONTOUR's index into the caller's loop array — triangle ownership */
  loopIndex: number;
}

/**
 * The even-odd region set: each loop's nesting depth counts the loops
 * strictly containing its sample point; even depth is a filled contour
 * whose holes are its DIRECT children (one level deeper, inside it).
 */
export function fillRegions2D(
  loops: { x: number; y: number }[][],
): FillRegion2D[] {
  const usable = loops.filter((l) => l.length >= 3);
  const depth = fillLoopDepths(usable);
  const regions: FillRegion2D[] = [];
  for (let i = 0; i < usable.length; i++) {
    if (depth[i] % 2 !== 0) continue; // odd depth: someone's hole, not a region
    const holes: { x: number; y: number }[][] = [];
    for (let k = 0; k < usable.length; k++) {
      if (k === i) continue;
      if (
        depth[k] === depth[i] + 1 &&
        pointInLoop(usable[k][0].x, usable[k][0].y, usable[i])
      ) {
        holes.push(usable[k]);
      }
    }
    regions.push({ contour: usable[i], holes, loopIndex: i });
  }
  return regions;
}

/**
 * Triangulate the regions with three's own earcut wrapper (built-in, no
 * new deps). The wrapper trims an EXACT duplicate end point and mutates
 * the arrays it is handed — fresh vectors go in, and the kept verts are
 * read back AFTER the call so the face indices always line up.
 */
export function triangulateRegions(regions: FillRegion2D[]): Tris2D {
  const verts: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const owners: number[] = [];
  for (const r of regions) {
    const contourV = r.contour.map((p) => new Vector2(p.x, p.y));
    const holesV = r.holes.map((h) => h.map((p) => new Vector2(p.x, p.y)));
    const all = [...contourV, ...holesV.flat()];
    if (all.length < 3) continue;
    const base = verts.length;
    const faces = ShapeUtils.triangulateShape(contourV, holesV);
    for (const f of faces) {
      indices.push(base + f[0], base + f[1], base + f[2]);
      owners.push(r.loopIndex);
    }
    for (const v of all) verts.push({ x: v.x, y: v.y });
  }
  return { verts, indices, owners };
}

export interface Tris2D {
  verts: { x: number; y: number }[];
  /** 3 per triangle, into verts */
  indices: number[];
  /** per triangle: the owning region's contour loop index */
  owners: number[];
}

/** a triangle over the shared 2D pool, carrying the ordinal of the
 * ORIGINAL triangle it came from (pick owner+depth / shade membership
 * ride on the tag through the subdivision) */
interface TaggedTri2D {
  idx: [number, number, number];
  tag: number;
}

/**
 * Recursive midpoint subdivision in the 2D surface domain (round 4,
 * Alice: the fill's cylinder segments rendered way coarser than the
 * stock — the flat interior triangles spanned up to 86° of arc on her
 * R10 ankh and cut chords up to 0.45mm below the lifted surface, twice
 * the lift, burying the shade in the stock). (u,v) are surface-mm, so a
 * Euclidean max-edge test here is the honest fineness constraint: split
 * every too-long triangle into 4 until it fits, THEN map to 3D. Shared
 * edges take ONE midpoint (deduped by vertex pair) so the mesh stays
 * watertight — no cracks between triangles at different split depths.
 * The pick fans go through the same pass so one code path owns the
 * tessellation for both meshes.
 */
function subdivideTris2D(
  verts: { x: number; y: number }[],
  tris: TaggedTri2D[],
  maxEdge: number,
): { verts: { x: number; y: number }[]; tris: TaggedTri2D[] } {
  const pool = verts.slice();
  const mid = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = mid.get(key);
    if (hit !== undefined) return hit;
    const i = pool.length;
    pool.push({ x: (pool[a].x + pool[b].x) / 2, y: (pool[a].y + pool[b].y) / 2 });
    mid.set(key, i);
    return i;
  };
  const edge = (a: number, b: number): number =>
    Math.hypot(pool[a].x - pool[b].x, pool[a].y - pool[b].y);
  let work = tris;
  const fine: TaggedTri2D[] = [];
  while (work.length > 0) {
    const next: TaggedTri2D[] = [];
    for (const t of work) {
      const [a, b, c] = t.idx;
      const longest = Math.max(edge(a, b), edge(b, c), edge(c, a));
      if (longest <= maxEdge) {
        fine.push(t);
        continue;
      }
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push(
        { idx: [a, ab, ca], tag: t.tag },
        { idx: [ab, b, bc], tag: t.tag },
        { idx: [ca, bc, c], tag: t.tag },
        { idx: [ab, bc, ca], tag: t.tag },
      );
    }
    work = next;
  }
  return { verts: pool, tris: fine };
}

/**
 * The artwork OUTLINE polylines get the same fineness rule as the fill
 * shade (round 5, Alice: "do the same to the outline as well"). The
 * wrapped bend is baked into the local points (artworkLocalPoints), so a
 * long document segment arrives as ONE straight 3D chord across a curving
 * arc — on her ankh (Ø20, R10) the worst raw edge spanned 24.7° and dipped
 * 0.23mm below the cylinder (probes/measure-outline-dip.mjs, "before").
 * Densify in the SAME (u,v) surface domain the shade uses — u = arc
 * length (angle unwrapped the short way per step, wrapLoop's convention),
 * v = axial x — splitting each edge into ceil(len/maxEdge) pieces, then
 * re-mapping every new point ONTO the cylinder at radius r. The outline
 * carries no lift (depthTest-false x-ray lines, nothing to z-fight), so
 * this is the shade's map minus the radial lift. Endpoints pass through
 * EXACTLY; a chord with r <= 0 returns unchanged (the flat fallback).
 */
export function densifyWrappedPath(
  points: Vec3[],
  diameter: number,
  maxEdge: number = FILL_SUBDIVIDE_MAX_EDGE,
): Vec3[] {
  const r = diameter / 2;
  if (!(r > 0) || points.length < 2) return points;
  const circ = 2 * Math.PI * r;
  const out: Vec3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    out.push(a);
    const ua = Math.atan2(a.y, a.z) * r;
    let ub = Math.atan2(b.y, b.z) * r;
    while (ub - ua > circ / 2) ub -= circ; // the short way, per step
    while (ua - ub > circ / 2) ub += circ;
    const n = Math.ceil(Math.hypot(ub - ua, b.x - a.x) / maxEdge);
    for (let k = 1; k < n; k++) {
      const th = (ua + ((ub - ua) * k) / n) / r;
      out.push({
        x: a.x + ((b.x - a.x) * k) / n,
        y: r * Math.sin(th),
        z: r * Math.cos(th),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** one pick triangle: its verts, its loop (the CALLER's paths index),
 * and the loop's depth (the tie-break when nested fans stack) */
export interface FillTri {
  v: [number, number, number];
  owner: number;
  depth: number;
}

export interface FillShadeTris {
  /** triangle vertices in the artwork's LOCAL space, lifted off the surface */
  verts: Vec3[];
  /** full-coverage pick triangles: every fill loop, selected or not */
  pick: FillTri[];
  /** the selected region only, polygonized — vertex triples into verts */
  shade: [number, number, number][];
}

/** flat 2D: the local (x, y) directly (z is the plane, ignored) */
function flatLoop(points: Vec3[]): { x: number; y: number }[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

/** wrapped 2D: (arc length around the cylinder, axial x), the arc
 * unwrapped continuously along the loop (shortest way per step) */
function wrapLoop(points: Vec3[], diameter: number): { x: number; y: number }[] {
  const r = diameter / 2;
  if (!(r > 0)) return flatLoop(points); // no declared Ø: fall back to flat math
  const circ = 2 * Math.PI * r;
  const out: { x: number; y: number }[] = [];
  points.forEach((p, i) => {
    let u = Math.atan2(p.y, p.z) * r;
    if (i > 0) {
      const prev = out[i - 1].x;
      while (u - prev > circ / 2) u -= circ;
      while (prev - u > circ / 2) u += circ;
    }
    out.push({ x: u, y: p.x });
  });
  return out;
}

/**
 * All fill loops of one artwork source → pick + shade triangles in local
 * space. `selected` holds the CALLER's indices of the paths the op
 * currently selects; the shade polygonizes those loops' region, the pick
 * surface covers every fill loop so a region click can select the FIRST
 * time. Loops triangulate with three's own earcut wrapper (built-in, no
 * new deps) — it trims an EXACT duplicate end point and mutates the
 * arrays it is handed, so fresh vectors go in and the kept verts are
 * read back AFTER the call and the face indices always line up.
 */
export function artworkFillTris(
  paths: FillPath[],
  selected: ReadonlySet<number>,
  presentation: 'flat' | 'wrapped',
  wrapDiameter: number,
  // measurement seam only — probes sweep the threshold; the app never
  // passes it (probes/fill-subdiv-sweep.probetest.ts)
  maxEdgeOverride?: number,
): FillShadeTris {
  // owners carry the CALLER's index through the filter, so a pick stays
  // aligned with the feature array the Viewport holds
  const fill = paths
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isFillLoop(p) && p.points.length >= 3);
  const loops2d = fill.map(({ p }) =>
    presentation === 'wrapped'
      ? wrapLoop(p.points, wrapDiameter)
      : flatLoop(p.points),
  );
  const verts2d: { x: number; y: number }[] = [];
  const pick: FillTri[] = [];
  const shade: [number, number, number][] = [];

  // pick fans: one loop at a time, no holes carved — an unselected
  // counter keeps its own surface; depth rides along for the picker
  const depth = fillLoopDepths(loops2d);
  for (let i = 0; i < loops2d.length; i++) {
    const contour = loops2d[i].map((p) => new Vector2(p.x, p.y));
    const faces = ShapeUtils.triangulateShape(contour, []);
    const base = verts2d.length;
    for (const f of faces) {
      pick.push({ v: [base + f[0], base + f[1], base + f[2]], owner: fill[i].i, depth: depth[i] });
    }
    for (const v of contour) verts2d.push({ x: v.x, y: v.y });
  }

  // shade region: the SELECTED loops only (what the raster will clear),
  // polygonized through clipper before any triangle is made
  const selLoops = loops2d.filter((_, i) => selected.has(fill[i].i));
  const s = triangulateRegions(polygonizeRegion2D(selLoops));
  const sBase = verts2d.length;
  for (const v of s.verts) verts2d.push(v);
  for (let i = 0; i + 2 < s.indices.length; i += 3) {
    shade.push([sBase + s.indices[i], sBase + s.indices[i + 1], sBase + s.indices[i + 2]]);
  }

  // THE FINENESS PASS (round 4): both meshes subdivide together in the
  // 2D domain — tags carry pick owner+depth (tag < pick.length) and
  // shade membership through — so a wrapped region maps to the cylinder
  // as many small facets instead of a few long chords
  const tagged: TaggedTri2D[] = [];
  for (let i = 0; i < pick.length; i++) tagged.push({ idx: pick[i].v, tag: i });
  for (let i = 0; i < shade.length; i++) tagged.push({ idx: shade[i], tag: pick.length + i });
  const sub = subdivideTris2D(verts2d, tagged, maxEdgeOverride ?? FILL_SUBDIVIDE_MAX_EDGE);
  const finePick: FillTri[] = [];
  const fineShade: [number, number, number][] = [];
  for (const t of sub.tris) {
    if (t.tag < pick.length) finePick.push({ ...pick[t.tag], v: t.idx });
    else fineShade.push(t.idx);
  }

  const r = wrapDiameter / 2;
  const map =
    presentation === 'wrapped' && r > 0
      ? (v: { x: number; y: number }): Vec3 => {
          const th = v.x / r;
          const rr = r + FILL_SHADE_LIFT_WRAPPED; // radial lift off the cylinder
          return { x: v.y, y: rr * Math.sin(th), z: rr * Math.cos(th) };
        }
      : (v: { x: number; y: number }): Vec3 => ({
          x: v.x,
          y: v.y,
          z: FILL_SHADE_LIFT, // plane lift
        });
  return { verts: sub.verts.map(map), pick: finePick, shade: fineShade };
}
