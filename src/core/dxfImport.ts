/**
 * Hand-rolled from-spec ASCII DXF import (license policy: no GPL/AGPL
 * vector libraries — the spec is implemented here, no dxf-parser/ezdxf
 * code). Emits the SAME `ImportedArtwork` the SVG parser does, so a DXF
 * lands as the exact same artwork primitive with every op available.
 *
 * Scope (docs/PLAN.md "Engrave + artwork import", phase 3):
 * - Entities IN: LINE, LWPOLYLINE, POLYLINE/VERTEX (+ bulges — DXF arcs
 *   hide there), CIRCLE, ARC, ELLIPSE, SPLINE (control-point NURBS via
 *   de Boor; fit-points-only falls back to a Catmull-Rom approximation),
 *   INSERT→BLOCK (nested, insert point/scale/rotation; MINSERT arrays
 *   collapse to a single insert), HATCH (polyline boundaries + edge
 *   boundaries of line/circular-arc edges → `filled` paths for the
 *   engrave fill pass).
 * - Entities OUT: text (the CAD app's job, same policy as SVG fonts),
 *   dimensions, solids/3D content. Unknown entities skip, never crash.
 * - Conventions: native DXF is Y-UP in drawing units; this parser
 *   converts to mm (header $INSUNITS honored; unitless = mm, the
 *   CAM-world default) and to SVG's V-DOWN artwork convention (the
 *   primitive flips v back up — see artworkLocalPoints). width/height
 *   come from the flattened line work's bounds — within one chord
 *   tolerance of the CAD extents — NOT $EXTMIN/$EXTMAX (famously
 *   unreliable). OCS extrusion (210/220/230) must be (0,0,1) — the
 *   overwhelming majority of 2D CAD exports — else the entity skips.
 *   Binary DXF is refused with a clear message.
 *
 * Reading strategy: real R2000+ files wrap every entity in
 * handle/subclass-marker preamble (5/330/100/8…), so geometry is read
 * by FIRST-OCCURRENCE scans (unambiguous per entity type) and by
 * cursor `seek`s for the repeated-code lists (vertices, knots, loops).
 */

import type { Vec2 } from './types';
import type { ImportedArtwork } from './vectorImport';
import { apply, flattenCubic, matMul, type Mat } from './vectorImport';

// ------------------------------------------------------------ tokenization

/** one group-code/value pair — an ASCII DXF is a flat stream of these */
type G = { code: number; value: string };

function groupsOf(text: string): G[] {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const out: G[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    if (Number.isNaN(code)) continue; // junk line: drop the PAIR (DXF is strictly alternating)
    out.push({ code, value: lines[i + 1] });
  }
  return out;
}

/** first group value with this code (undefined if absent) */
function firstOf(gs: G[], code: number): number | undefined {
  for (const g of gs) if (g.code === code) {
    const v = parseFloat(g.value);
    if (Number.isFinite(v)) return v;
  }
  return undefined;
}

function firstStr(gs: G[], code: number): string | undefined {
  for (const g of gs) if (g.code === code) return g.value.trim();
  return undefined;
}

/**
 * Cursor over one entity's group slice for the repeated-code lists.
 * `seek` advances until it finds the code (consuming unknowns such as
 * the handle/subclass preamble); `peek`/`num` read positionally where
 * DXF order is strict (e.g. a 20 immediately after its 10).
 */
class Rd {
  i = 0;
  constructor(private gs: G[]) {}

  peek(): number | undefined {
    return this.gs[this.i]?.code;
  }
  num(code: number): number | undefined {
    if (this.peek() !== code) return undefined;
    return parseFloat(this.gs[this.i++].value);
  }
  seek(code: number): number | undefined {
    while (this.i < this.gs.length) {
      const g = this.gs[this.i++];
      if (g.code === code) {
        const v = parseFloat(g.value);
        return Number.isFinite(v) ? v : undefined;
      }
    }
    return undefined;
  }
  seekStr(code: number): string | undefined {
    while (this.i < this.gs.length) {
      const g = this.gs[this.i++];
      if (g.code === code) return g.value.trim();
    }
    return undefined;
  }
}

/** OCS check: extrusion (210,220,230) must be ≈(0,0,1) or absent.
 *  A tilted/mirrored plane would project garbage — skip instead. */
function ocsOk(gs: G[]): boolean {
  const idx = gs.findIndex((g) => g.code === 210);
  if (idx < 0) return true;
  const ex = firstOf(gs, 210) ?? 0;
  const ey = idx + 1 < gs.length && gs[idx + 1].code === 220 ? parseFloat(gs[idx + 1].value) : 0;
  const ez = idx + 2 < gs.length && gs[idx + 2].code === 230 ? parseFloat(gs[idx + 2].value) : 1;
  return Math.abs(ex) < 1e-9 && Math.abs(ey) < 1e-9 && ez > 0;
}

const T = (x: number, y: number): Mat => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
const S = (x: number, y: number): Mat => ({ a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
const R = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { a: c, b: s, c: -s, d: c, e: 0, f: 0 };
};
const IDENT: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** a safe OVERestimate of the matrix's max singular value
 *  (σ ≤ √(‖M‖₁·‖M‖∞)) — scaled/rotated INSERT children flatten their
 *  curves at tol/stretch so the post-transform chord error stays ≤ tol */
function matStretch(m: Mat): number {
  const col = Math.max(Math.abs(m.a) + Math.abs(m.b), Math.abs(m.c) + Math.abs(m.d));
  const row = Math.max(Math.abs(m.a) + Math.abs(m.c), Math.abs(m.b) + Math.abs(m.d));
  return Math.max(Math.sqrt(col * row), 1e-9);
}

// ------------------------------------------------------------ entity IR

/** parsed entities, BLOCK-local space, native units/y-up. Kept as IR so
 *  INSERTs can re-flatten curves at the tolerance their cumulative
 *  transform demands. */
type Entity =
  | { t: 'line'; p1: Vec2; p2: Vec2 }
  | { t: 'circle'; c: Vec2; r: number }
  | { t: 'arc'; c: Vec2; r: number; a0: number; a1: number } // radians, a1 > a0 (CCW sweep)
  | { t: 'poly'; pts: Vec2[]; bulges: number[]; closed: boolean } // LWPOLYLINE + POLYLINE unified
  | { t: 'ellipse'; c: Vec2; major: Vec2; ratio: number; t0: number; t1: number } // params, CCW
  | {
      t: 'spline';
      degree: number;
      knots: number[];
      ctrl: Vec2[];
      weights: number[];
      fit: Vec2[];
      closed: boolean;
    }
  | { t: 'insert'; name: string; at: Vec2; sx: number; sy: number; rot: number }
  | { t: 'hatch'; loops: HatchLoop[] };

/** one HATCH boundary loop: a bulged polyline (flag bit 2) or an edge
 *  chain of lines and circular arcs (the common edge kinds). */
type HatchLoop =
  | { kind: 'poly'; pts: Vec2[]; bulges: number[]; closed: boolean }
  | { kind: 'edges'; edges: (LineEdge | ArcEdge)[] };
type LineEdge = { e: 'line'; p1: Vec2; p2: Vec2 };
/** CCW-positive sweep in `sweep` (arc edges carry an explicit direction) */
type ArcEdge = { e: 'arc'; c: Vec2; r: number; a0: number; sweep: number };

interface Block {
  base: Vec2;
  entities: Entity[];
}

// ------------------------------------------------------------ flattening

/** center-form arc/circle → chord points (EXCLUDING the start, callers
 *  have it; a2 may be below a1 for clockwise). Sagitta-chord stepping,
 *  same tolerance semantics as the SVG arc flattener. */
function flattenCenterArc(c: Vec2, r: number, a1: number, a2: number, tol: number): Vec2[] {
  const sweep = a2 - a1;
  const arcLen = Math.abs(sweep) * r;
  const maxChord = Math.sqrt(8 * Math.max(r, 1e-9) * Math.max(tol, 1e-9));
  const steps = Math.max(2, Math.ceil(arcLen / Math.max(maxChord, 1e-6)));
  const out: Vec2[] = [];
  for (let s = 1; s <= steps; s++) {
    const a = a1 + (sweep * s) / steps;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}

/**
 * A LWPOLYLINE/POLYLINE bulge (b = tan(Δθ/4), Δθ CCW-positive) → arc
 * chord points from p1 to p2 (excluding p1). |b| ≈ 0 is a line.
 */
function flattenBulge(p1: Vec2, p2: Vec2, bulge: number, tol: number): Vec2[] {
  if (Math.abs(bulge) < 1e-10) return [p2];
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (d < 1e-12) return [p2];
  const sweep = 4 * Math.atan(bulge); // signed included angle
  const r = (d * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const h = Math.sqrt(Math.max(r * r - (d / 2) * (d / 2), 0));
  // CCW (b>0): center on the LEFT of p1→p2 — the arc is traversed
  // counterclockwise around it (the bulge definition)
  const nx = -(p2.y - p1.y) / d;
  const ny = (p2.x - p1.x) / d;
  const side = bulge > 0 ? 1 : -1;
  const c = { x: (p1.x + p2.x) / 2 + nx * h * side, y: (p1.y + p2.y) / 2 + ny * h * side };
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
  return flattenCenterArc(c, r, a1, a1 + sweep, tol);
}

/** expand a bulged polyline (closed wraps: last bulge → last→first) */
function flattenPoly(pts: Vec2[], bulges: number[], closed: boolean, tol: number): Vec2[] {
  const out: Vec2[] = [{ ...pts[0] }];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const b = bulges[i] ?? 0;
    const seg = Math.abs(b) < 1e-10 ? [p2] : flattenBulge(p1, p2, b, tol);
    for (const q of seg) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 1e-9) out.push(q);
    }
  }
  return out;
}

/** parametric ellipse p(t) = c + major·cos t + minor·sin t (minor is
 *  major rotated +90° × ratio — the extrusion-(0,0,1) convention) */
function ellipseAt(c: Vec2, major: Vec2, ratio: number, t: number): Vec2 {
  return {
    x: c.x + major.x * Math.cos(t) - major.y * ratio * Math.sin(t),
    y: c.y + major.y * Math.cos(t) + major.x * ratio * Math.sin(t),
  };
}

function flattenEllipse(
  c: Vec2,
  major: Vec2,
  ratio: number,
  t0: number,
  t1: number,
  tol: number,
): Vec2[] {
  const a = Math.hypot(major.x, major.y);
  const b = a * ratio;
  // max curvature is a/b² (at the major-axis ends): sagitta c²·κ/8 ≤ tol
  const maxChord = Math.sqrt((8 * tol * b * b) / Math.max(a, 1e-9));
  const steps = Math.max(4, Math.ceil((Math.abs(t1 - t0) * a) / Math.max(maxChord, 1e-6)));
  const out: Vec2[] = [];
  for (let s = 1; s <= steps; s++) out.push(ellipseAt(c, major, ratio, t0 + ((t1 - t0) * s) / steps));
  return out;
}

// ------------------------------------------------------------ NURBS (de Boor)

/** one curve point at parameter u (NURBS Book A2.2 in homogeneous
 *  form). Total on malformed data: degenerate spans collapse safely. */
function deBoor(u: number, d: number, knots: number[], ctrl: Vec2[], w: number[]): Vec2 {
  // controls 0..n (n = ctrl.length−1), knots 0..n+d+1; the valid domain
  // is [knots[d], knots[n+1]] and spans run k ∈ [d, n] (the span holding
  // u; at the domain end that is the LAST nonempty span)
  const n = ctrl.length - 1;
  let k = d;
  for (let j = d; j <= n; j++) {
    if (knots[j] <= u) k = j; // last span start ≤ u
    if (knots[j] > u) break;
  }
  k = Math.min(Math.max(k, d), n);
  const hx: number[] = [];
  const hy: number[] = [];
  const hw: number[] = [];
  for (let j = 0; j <= d; j++) {
    const c = ctrl[j + k - d];
    const wt = w[j + k - d] ?? 1;
    hx.push(c.x * wt);
    hy.push(c.y * wt);
    hw.push(wt);
  }
  for (let r = 1; r <= d; r++) {
    for (let j = d; j >= r; j--) {
      const lo = knots[j + k - d];
      const hi = knots[j + 1 + k - r];
      const alpha = hi - lo > 1e-12 ? (u - lo) / (hi - lo) : 1;
      hx[j] = (1 - alpha) * hx[j - 1] + alpha * hx[j];
      hy[j] = (1 - alpha) * hy[j - 1] + alpha * hy[j];
      hw[j] = (1 - alpha) * hw[j - 1] + alpha * hw[j];
    }
  }
  const wEnd = hw[d] || 1;
  return { x: hx[d] / wEnd, y: hy[d] / wEnd };
}

/** SPLINE → chord points by recursive bisection on the parameter
 *  domain (flatness = midpoint off the chord ≤ tol). Domain-clamped
 *  NURBS hit their first/last control point exactly at the ends. */
function flattenSpline(
  degree: number,
  knots: number[],
  ctrl: Vec2[],
  w: number[],
  tol: number,
): Vec2[] {
  const d = Math.min(Math.max(degree, 1), ctrl.length - 1);
  const u0 = knots[d];
  const u1 = knots[ctrl.length]; // domain end (knots has ctrl.length + d + 1 entries)
  if (!(u1 > u0)) return ctrl.map((p) => ({ ...p })); // degenerate knots: the control hull
  const evalAt = (u: number): Vec2 => deBoor(u, d, knots, ctrl, w);
  const out: Vec2[] = [{ ...ctrl[0] }];
  const rec = (lo: number, hi: number, pLo: Vec2, pHi: Vec2, depth: number): void => {
    const mid = (lo + hi) / 2;
    const pm = evalAt(mid);
    const abx = pHi.x - pLo.x;
    const aby = pHi.y - pLo.y;
    const len = Math.hypot(abx, aby) || 1e-12;
    const t = ((pm.x - pLo.x) * abx + (pm.y - pLo.y) * aby) / (len * len);
    const dev = Math.hypot(pm.x - (pLo.x + t * abx), pm.y - (pLo.y + t * aby));
    if (dev <= tol || depth > 16) {
      out.push(pHi);
      return;
    }
    rec(lo, mid, pLo, pm, depth + 1);
    rec(mid, hi, pm, pHi, depth + 1);
  };
  rec(u0, u1, out[0], evalAt(u1), 0);
  return out;
}

/** fit-points-only SPLINE fallback: a Catmull-Rom cubic through the
 *  fit points (documented approximation — exporters that omit control
 *  points are rare and lossy by construction) */
function flattenCatmullRom(fit: Vec2[], closed: boolean, tol: number): Vec2[] {
  const n = fit.length;
  const at = (i: number): Vec2 => (closed ? fit[(i + n) % n] : fit[Math.min(Math.max(i, 0), n - 1)]);
  const out: Vec2[] = [{ ...fit[0] }];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const m1 = { x: (p2.x - p0.x) / 2, y: (p2.y - p0.y) / 2 }; // Hermite tangents
    const m2 = { x: (p3.x - p1.x) / 2, y: (p3.y - p1.y) / 2 };
    // Hermite → Bézier: controls at ± tangent/3
    const c1 = { x: p1.x + m1.x / 3, y: p1.y + m1.y / 3 };
    const c2 = { x: p2.x - m2.x / 3, y: p2.y - m2.y / 3 };
    for (const q of flattenCubic(p1, c1, c2, p2, tol)) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 1e-9) out.push(q);
    }
  }
  return out;
}

// ------------------------------------------------------------ entity parsing

/** one entity from a group slice (already cut at 0-code boundaries);
 *  null = not line work / malformed / unsupported */
function parseEntity(name: string, gs: G[]): Entity | null {
  switch (name) {
    case 'LINE': {
      if (!ocsOk(gs)) return null;
      const p1 = { x: firstOf(gs, 10) ?? 0, y: firstOf(gs, 20) ?? 0 };
      const p2 = { x: firstOf(gs, 11) ?? p1.x, y: firstOf(gs, 21) ?? p1.y };
      return { t: 'line', p1, p2 };
    }
    case 'CIRCLE': {
      if (!ocsOk(gs)) return null;
      const c = { x: firstOf(gs, 10) ?? 0, y: firstOf(gs, 20) ?? 0 };
      const r = firstOf(gs, 40) ?? 0;
      return r > 0 ? { t: 'circle', c, r } : null;
    }
    case 'ARC': {
      if (!ocsOk(gs)) return null;
      const c = { x: firstOf(gs, 10) ?? 0, y: firstOf(gs, 20) ?? 0 };
      const r = firstOf(gs, 40) ?? 0;
      const a0 = ((firstOf(gs, 50) ?? 0) * Math.PI) / 180;
      const a1 = ((firstOf(gs, 51) ?? 0) * Math.PI) / 180;
      if (r <= 0 || a1 - a0 <= 1e-12) return null; // DXF arcs are ALWAYS CCW; equal = a point
      return { t: 'arc', c, r, a0, a1 };
    }
    case 'LWPOLYLINE': {
      if (!ocsOk(gs)) return null;
      const flags = firstOf(gs, 70) ?? 0;
      const pts: Vec2[] = [];
      const bulges: number[] = [];
      const rd = new Rd(gs);
      let x = rd.seek(10); // each vertex: 10 x, 20 y [, 42 bulge] [, 91 id]
      while (x !== undefined) {
        const y = rd.peek() === 20 ? (rd.num(20) ?? 0) : 0;
        const b = rd.peek() === 42 ? (rd.num(42) ?? 0) : 0;
        if (rd.peek() === 91) rd.num(91); // R2010+ vertex id, if present
        pts.push({ x, y });
        bulges.push(b);
        x = rd.seek(10);
      }
      if (pts.length === 0) return null;
      return { t: 'poly', pts, bulges, closed: (flags & 1) !== 0 };
    }
    case 'ELLIPSE': {
      if (!ocsOk(gs)) return null;
      const c = { x: firstOf(gs, 10) ?? 0, y: firstOf(gs, 20) ?? 0 };
      const major = { x: firstOf(gs, 11) ?? 0, y: firstOf(gs, 21) ?? 0 };
      const ratio = firstOf(gs, 40) ?? 1;
      let t0 = firstOf(gs, 41) ?? 0;
      let t1 = firstOf(gs, 42) ?? 2 * Math.PI;
      if (Math.hypot(major.x, major.y) < 1e-12 || ratio <= 0) return null;
      while (t1 <= t0) t1 += 2 * Math.PI;
      if (t1 - t0 > 2 * Math.PI) t1 = t0 + 2 * Math.PI; // clamp a malformed span
      return { t: 'ellipse', c, major, ratio, t0, t1 };
    }
    case 'SPLINE': {
      // codes are unambiguous within a SPLINE slice: 40 knot, 41 weight,
      // 10/20 control point, 11/21 fit point — order-independent scans
      const flags = firstOf(gs, 70) ?? 0;
      const degree = firstOf(gs, 71) ?? 3;
      const finite = (v: number): boolean => Number.isFinite(v);
      const knots: number[] = [];
      const weights: number[] = [];
      const ctrl: Vec2[] = [];
      const fit: Vec2[] = [];
      for (let idx = 0; idx < gs.length; idx++) {
        const g = gs[idx];
        const v = parseFloat(g.value);
        if (g.code === 40 && finite(v)) knots.push(v);
        else if (g.code === 41 && finite(v)) weights.push(v);
        else if (g.code === 10 && finite(v)) {
          const nx = gs[idx + 1];
          ctrl.push({ x: v, y: nx && nx.code === 20 && finite(parseFloat(nx.value)) ? parseFloat(nx.value) : 0 });
        } else if (g.code === 11 && finite(v)) {
          const nx = gs[idx + 1];
          fit.push({ x: v, y: nx && nx.code === 21 && finite(parseFloat(nx.value)) ? parseFloat(nx.value) : 0 });
        }
      }
      return { t: 'spline', degree, knots, ctrl, weights, fit, closed: (flags & 1) !== 0 };
    }
    case 'INSERT': {
      if (!ocsOk(gs)) return null;
      const block = firstStr(gs, 2);
      if (!block) return null;
      const at = { x: firstOf(gs, 10) ?? 0, y: firstOf(gs, 20) ?? 0 };
      const sx = firstOf(gs, 41) ?? 1;
      const sy = firstOf(gs, 42) ?? 1;
      const rot = firstOf(gs, 50) ?? 0; // 70/71 MINSERT counts ignored: single insert
      if (sx === 0 || sy === 0) return null; // collapsed insert
      return { t: 'insert', name: block, at, sx, sy, rot };
    }
    case 'HATCH':
      return parseHatch(gs);
    default:
      return null; // TEXT/MTEXT/DIMENSION/SOLID/POINT/3D…: the CAD app's job or not line work
  }
}

/** HATCH: every boundary loop becomes one `filled` path. Loops made of
 *  edge types we don't flatten (elliptic/spline edges, text boxes) or
 *  a tilted OCS make the WHOLE hatch skip — a half-guessed fill region
 *  is worse than none. Solid and pattern hatches alike read as their
 *  boundary region (the engrave fill pass decides per-path anyway). */
function parseHatch(gs: G[]): Entity | null {
  if (!ocsOk(gs)) return null;
  const rd = new Rd(gs);
  const nLoops = rd.seek(91) ?? 0; // number of boundary loops
  const loops: HatchLoop[] = [];
  for (let l = 0; l < nLoops; l++) {
    const flags = rd.seek(92);
    if (flags === undefined) break;
    if (flags & 2) {
      // polyline boundary: 72 has-bulge, 73 closed, 93 vertex count, then 10/20 [/42] per vertex
      const hasBulge = (rd.seek(72) ?? 0) === 1;
      const closed = (rd.seek(73) ?? 0) === 1;
      const nVerts = rd.seek(93) ?? 0;
      const pts: Vec2[] = [];
      const bulges: number[] = [];
      for (let v = 0; v < nVerts; v++) {
        const x = rd.seek(10);
        if (x === undefined) break;
        const y = rd.peek() === 20 ? (rd.num(20) ?? 0) : 0;
        const b = hasBulge && rd.peek() === 42 ? (rd.num(42) ?? 0) : 0;
        pts.push({ x, y });
        bulges.push(b);
      }
      if (pts.length >= 2) loops.push({ kind: 'poly', pts, bulges, closed });
    } else {
      // edge boundary: 72 edge count, then per edge 71 type + data
      const nEdges = rd.seek(72) ?? 0;
      const edges: (LineEdge | ArcEdge)[] = [];
      for (let e = 0; e < nEdges; e++) {
        const type = rd.seek(71);
        if (type === undefined) break;
        if (type === 1) {
          const p1 = { x: rd.num(10) ?? 0, y: rd.num(20) ?? 0 };
          const p2 = { x: rd.num(11) ?? p1.x, y: rd.num(21) ?? p1.y };
          edges.push({ e: 'line', p1, p2 });
        } else if (type === 2) {
          const c = { x: rd.num(10) ?? 0, y: rd.num(20) ?? 0 };
          const r = rd.num(40) ?? 0;
          const a0 = ((rd.num(50) ?? 0) * Math.PI) / 180;
          const aEnd = ((rd.num(51) ?? 0) * Math.PI) / 180;
          const ccw = (rd.num(73) ?? 1) === 1;
          let sweep = aEnd - a0;
          if (ccw) while (sweep <= 0) sweep += 2 * Math.PI;
          else while (sweep >= 0) sweep -= 2 * Math.PI;
          if (r > 0) edges.push({ e: 'arc', c, r, a0, sweep });
        } else {
          return null; // elliptic/spline edge or malformed: hatch skipped whole
        }
      }
      if (edges.length >= 2) loops.push({ kind: 'edges', edges });
    }
  }
  return loops.length > 0 ? { t: 'hatch', loops } : null;
}

// ------------------------------------------------------------ section walk

interface DxfDoc {
  insunits: number; // $INSUNITS (0/absent = unitless → treated as mm)
  blocks: Map<string, Block>; // keys UPPERCASE (DXF symbol lookup is case-insensitive)
  entities: Entity[];
}

function parseDoc(text: string): DxfDoc {
  const gs = groupsOf(text);
  const doc: DxfDoc = { insunits: 0, blocks: new Map(), entities: [] };
  let section = '';
  let block: Block | null = null; // the BLOCK currently being filled
  let i = 0;
  while (i < gs.length) {
    const g = gs[i];
    if (g.code === 0 && g.value.trim() === 'SECTION') {
      section = gs[i + 1]?.code === 2 ? gs[i + 1].value.trim() : '';
      i += 2;
      continue;
    }
    if (g.code === 0 && g.value.trim() === 'ENDSEC') {
      section = '';
      block = null;
      i++;
      continue;
    }
    if (section === 'HEADER' && g.code === 9) {
      if (g.value.trim() === '$INSUNITS') {
        const v = gs[i + 1]?.value; // 9 $INSUNITS, then 70 <value>
        if (v !== undefined) doc.insunits = parseInt(v, 10) || 0;
      }
      i += 2; // the variable and its (single) value group
      continue;
    }
    if (g.code === 0 && (section === 'BLOCKS' || section === 'ENTITIES')) {
      const name = g.value.trim();
      // slice to the next 0-code
      let j = i + 1;
      while (j < gs.length && gs[j].code !== 0) j++;
      const slice = gs.slice(i + 1, j);
      if (section === 'BLOCKS' && name === 'BLOCK') {
        const rd = new Rd(slice);
        const bname = rd.seekStr(2) ?? '';
        const base = { x: firstOf(slice, 10) ?? 0, y: firstOf(slice, 20) ?? 0 };
        block = { base, entities: [] };
        doc.blocks.set(bname.toUpperCase(), block);
      } else if (name === 'ENDBLK') {
        block = null;
      } else if (name === 'POLYLINE') {
        // old-style POLYLINE: VERTEX slices follow until SEQEND
        const poly = parsePolyline(gs, i + 1, j);
        if (poly) {
          if (section === 'BLOCKS') {
            if (block) block.entities.push(poly.entity);
          } else doc.entities.push(poly.entity);
          i = poly.next;
          continue;
        }
      } else {
        const e = parseEntity(name, slice);
        if (e) {
          if (section === 'BLOCKS') {
            if (block) block.entities.push(e); // stray entity outside a BLOCK: drop
          } else doc.entities.push(e);
        }
      }
      i = j;
      continue;
    }
    i++;
  }
  return doc;
}

/** old-style POLYLINE + VERTEX… + SEQEND, consumed across slices. 3D
 *  polylines/meshes skip (not 2D line work); curve/spline-FITTED
 *  polylines keep their authored vertices (frame vertices are flagged
 *  128/64 and dropped). */
function parsePolyline(gs: G[], start: number, end: number): { entity: Entity; next: number } | null {
  const header = gs.slice(start, end);
  if (!ocsOk(header)) return null;
  const flags = firstOf(header, 70) ?? 0;
  if (flags & (8 | 16 | 32 | 64)) return null; // 3D / mesh: not 2D line work
  const pts: Vec2[] = [];
  const bulges: number[] = [];
  let i = end;
  while (i < gs.length && gs[i].code === 0) {
    const vname = gs[i].value.trim();
    if (vname === 'SEQEND') {
      while (i < gs.length && gs[i].code !== 0) i++; // skip its data
      break;
    }
    if (vname !== 'VERTEX') break; // unexpected: stop the polyline here
    let j = i + 1;
    while (j < gs.length && gs[j].code !== 0) j++;
    const vslice = gs.slice(i + 1, j);
    const vflags = firstOf(vslice, 70) ?? 0;
    if (!(vflags & (64 | 128))) {
      // spline-fit frame vertices are NOT on the curve
      const x = firstOf(vslice, 10) ?? 0;
      const y = firstOf(vslice, 20) ?? 0;
      pts.push({ x, y });
      bulges.push(firstOf(vslice, 42) ?? 0);
    }
    i = j;
  }
  if (pts.length === 0) return null;
  return { entity: { t: 'poly', pts, bulges, closed: (flags & 1) !== 0 }, next: i };
}

// ------------------------------------------------------------ emission

interface Emitted {
  pts: Vec2[]; // native DXF space (y-up, drawing units)
  closed: boolean;
  filled: boolean;
}

/** `depth` caps block recursion — AutoCAD forbids cyclic blocks, but a
 *  malformed file must not hang us. */
function emitEntities(
  entities: Entity[],
  blocks: Map<string, Block>,
  mat: Mat,
  tol: number,
  out: Emitted[],
  depth: number,
): void {
  if (depth > 8) return;
  const push = (pts: Vec2[], closed: boolean, filled: boolean): void => {
    const mapped = pts.map((p) => apply(mat, p));
    if (mapped.length >= 2) out.push({ pts: mapped, closed, filled });
  };
  for (const e of entities) {
    switch (e.t) {
      case 'line':
        push([e.p1, e.p2], false, false);
        break;
      case 'circle':
        push(
          [{ x: e.c.x + e.r, y: e.c.y }, ...flattenCenterArc(e.c, e.r, 0, 2 * Math.PI, tol)],
          true,
          false,
        );
        break;
      case 'arc':
        push(
          [{ x: e.c.x + e.r * Math.cos(e.a0), y: e.c.y + e.r * Math.sin(e.a0) }, ...flattenCenterArc(e.c, e.r, e.a0, e.a1, tol)],
          false,
          false,
        );
        break;
      case 'poly':
        push(flattenPoly(e.pts, e.bulges, e.closed, tol), e.closed, false);
        break;
      case 'ellipse': {
        const full = e.t1 - e.t0 >= 2 * Math.PI - 1e-9;
        push(
          [ellipseAt(e.c, e.major, e.ratio, e.t0), ...flattenEllipse(e.c, e.major, e.ratio, e.t0, e.t1, tol)],
          full,
          false,
        );
        break;
      }
      case 'spline': {
        const n = e.ctrl.length;
        const d = Math.min(Math.max(e.degree, 1), Math.max(n - 1, 1));
        const sorted = e.knots.every((u, idx) => idx === 0 || u >= e.knots[idx - 1]);
        if (n >= 2 && e.knots.length === n + d + 1 && sorted) {
          push(flattenSpline(e.degree, e.knots, e.ctrl, e.weights, tol), e.closed, false);
        } else if (e.fit.length >= 2) {
          push(flattenCatmullRom(e.fit, e.closed, tol), e.closed, false);
        } else if (n >= 2) {
          push(e.ctrl, false, false); // malformed knots: the control hull, honestly labeled
        }
        break;
      }
      case 'hatch': {
        for (const loop of e.loops) {
          if (loop.kind === 'poly') {
            push(flattenPoly(loop.pts, loop.bulges, loop.closed, tol), true, true);
          } else {
            const first = loop.edges[0];
            const pts: Vec2[] = [first.e === 'line' ? first.p1 : arcStart(first as ArcEdge)];
            for (const edge of loop.edges) {
              const seg =
                edge.e === 'line'
                  ? [edge.p2]
                  : flattenCenterArc(edge.c, edge.r, edge.a0, edge.a0 + edge.sweep, tol);
              for (const q of seg) {
                const last = pts[pts.length - 1];
                if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 1e-9) pts.push(q);
              }
            }
            push(pts, true, true);
          }
        }
        break;
      }
      case 'insert': {
        const block = blocks.get(e.name.toUpperCase());
        if (!block) continue; // dangling block reference: skip
        // block point → (−base) → scale → rotate → insert point
        const child = matMul(
          matMul(matMul(matMul(mat, T(e.at.x, e.at.y)), R(e.rot)), S(e.sx, e.sy)),
          T(-block.base.x, -block.base.y),
        );
        emitEntities(block.entities, blocks, child, tol / matStretch(child), out, depth + 1);
        break;
      }
    }
  }
}

const arcStart = (a: ArcEdge): Vec2 => ({
  x: a.c.x + a.r * Math.cos(a.a0),
  y: a.c.y + a.r * Math.sin(a.a0),
});

// ------------------------------------------------------------ units + entry

/** mm per drawing unit from $INSUNITS (the AutoCAD table's common
 *  entries; anything unknown → 1, the CAM-world mm default) */
const MM_PER_UNIT: Record<number, number> = {
  0: 1, // unitless — assume mm
  1: 25.4, // inch
  2: 304.8, // foot
  3: 1609344, // mile
  4: 1, // mm
  5: 10, // cm
  6: 1000, // m
  7: 1e6, // km
  8: 2.54e-5, // microinch
  9: 0.0254, // mil (thou)
  10: 914.4, // yard
  12: 1e-6, // nanometer
  13: 0.001, // micron
  14: 100, // decimeter
};

/**
 * Extract the line work of an ASCII DXF as the SAME artwork form the
 * SVG importer produces (see module doc). Binary DXF throws a clear
 * error; files with no usable line work return empty paths (the caller
 * shows the "convert first" message).
 */
export function parseDxf(text: string, chordTol = 0.05): ImportedArtwork {
  if (text.slice(0, 30).includes('AutoCAD Binary DXF')) {
    throw new Error('binary DXF is not supported — re-export as ASCII DXF');
  }
  const doc = parseDoc(text);
  const k = MM_PER_UNIT[doc.insunits] ?? 1; // mm per drawing unit
  const emitted: Emitted[] = [];
  emitEntities(doc.entities, doc.blocks, IDENT, chordTol / k, emitted, 0);

  if (emitted.length === 0) return { paths: [], meta: [], width: 0, height: 0 };

  // geometry bounds (NOT $EXTMIN/$EXTMAX — unreliable in the wild)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of emitted)
    for (const p of e.pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  // native y-up → SVG's v-DOWN artwork convention (mm), origin top-left:
  // u grows right, v grows DOWN. The primitive's flipV turns it back
  // upright; a DXF fed through unflipped would land mirrored.
  const toArt: Mat = { a: k, b: 0, c: 0, d: -k, e: -k * minX, f: k * maxY };
  const paths: Vec2[][] = [];
  const meta: { closed: boolean; filled: boolean }[] = [];
  for (const e of emitted) {
    const ded: Vec2[] = [];
    for (const p of e.pts.map((p) => apply(toArt, p))) {
      const last = ded[ded.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) ded.push(p);
    }
    if (ded.length < 2) continue; // collapsed by a degenerate transform
    paths.push(ded);
    // an authored loop is a loop, flag or no flag (the SVG rule)
    const coincident =
      Math.hypot(ded[0].x - ded[ded.length - 1].x, ded[0].y - ded[ded.length - 1].y) <= chordTol;
    meta.push({ closed: e.closed || coincident, filled: e.filled });
  }
  return {
    paths,
    meta,
    width: (maxX - minX) * k,
    height: (maxY - minY) * k,
  };
}