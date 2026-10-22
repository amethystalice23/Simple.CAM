/**
 * Mesh feature detection: planes (coplanar face groups), circles, and
 * straight edges, reimplemented from published algorithm descriptions
 * only — see docs/edge-tracing.md §1 and its license boundary (never
 * consult the AGPL reference source). v1 scope: lines and circles.
 */

import * as THREE from 'three';
import type {
  CircleFeature,
  EdgeFeature,
  HoleFeature,
  ModelTransform,
  PlaneFeature,
  Vec2,
  Vec3,
} from '../core/types';

export interface DetectedFeatures {
  planes: PlaneFeature[];
  circles: CircleFeature[];
  edges: EdgeFeature[];
  /** raw-geometry triangle index → plane index (−1 for degenerate drops) */
  faceToPlane: Int32Array;
  /**
   * Every plane's stitched border loops, as 3D point rings, with the owning
   * plane index. All loops per plane — circle-fitted ones and straight
   * outlines alike. The chamfer op traces a selected face's outline from
   * these; ids are not needed (selection goes through the plane feature).
   */
  planeLoops: { plane: number; points: Vec3[] }[];
}

/** Coplanar grouping tolerance, degrees. */
const ANGLE_TOL = 0.5;
/**
 * Adjacent faces deviating by more than this (degrees) form a feature edge.
 * Smooth tessellation joins (e.g. 24-segment cylinder walls at 15°) stay
 * below it; real corners (chamfers at 45°, flats, caps) clear it.
 */
const SHARP_DEG = 30;
/** Vertex welding precision, mm. */
const WELD = 1e6;

// ---------------------------------------------------------------- utilities

function vkey(x: number, y: number, z: number): string {
  return `${Math.round(x * WELD)} ${Math.round(y * WELD)} ${Math.round(z * WELD)}`;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
}

/** Geometric circle equality (id hashes can differ on axis sign). */
function sameCircle(a: CircleFeature, b: CircleFeature): boolean {
  const dc = Math.hypot(
    a.center.x - b.center.x,
    a.center.y - b.center.y,
    a.center.z - b.center.z,
  );
  return (
    dc < 1e-3 &&
    Math.abs(a.radius - b.radius) < 1e-4 &&
    Math.abs(Math.abs(dot(a.axis, b.axis)) - 1) < 1e-6
  );
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/** Stable id: FNV-1a over quantized parameters (model-space geometry). */
function featureId(kind: string, parts: (number | string)[]): string {
  const s = `${kind}|${parts
    .map((p) => (typeof p === 'number' ? Math.round(p * 1e4) : p))
    .join('|')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${kind}-${h.toString(16)}`;
}

// ------------------------------------------------------------- topology

interface Topo {
  verts: Vec3[];
  faces: [number, number, number][];
  /** raw-geometry triangle index of each kept (non-degenerate) face */
  rawIndexOf: number[];
  /** undirected edge key `a_b` (a<b) → adjacent face indices */
  edgeFaces: Map<string, number[]>;
  faceNormal: Vec3[];
}

function buildTopo(geometry: THREE.BufferGeometry): Topo {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const verts: Vec3[] = [];
  const vmap = new Map<string, number>();
  const faces: [number, number, number][] = [];
  const rawIndexOf: number[] = [];

  for (let f = 0; f + 2 < attr.count; f += 3) {
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
      const x = attr.getX(f + k);
      const y = attr.getY(f + k);
      const z = attr.getZ(f + k);
      const key = vkey(x, y, z);
      let id = vmap.get(key);
      if (id === undefined) {
        id = verts.length;
        verts.push({ x, y, z });
        vmap.set(key, id);
      }
      ids.push(id);
    }
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) {
      faces.push([ids[0], ids[1], ids[2]]);
      rawIndexOf.push(f / 3);
    }
  }

  const faceNormal: Vec3[] = faces.map(([a, b, c]) => {
    const A = verts[a];
    const B = verts[b];
    const C = verts[c];
    return normalize(cross({ x: B.x - A.x, y: B.y - A.y, z: B.z - A.z }, { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z }));
  });

  const edgeFaces = new Map<string, number[]>();
  faces.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      const a = f[k];
      const b = f[(k + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const arr = edgeFaces.get(key);
      if (arr) arr.push(i);
      else edgeFaces.set(key, [i]);
    }
  });

  return { verts, faces, rawIndexOf, edgeFaces, faceNormal };
}

/** Flood-fill faces into coplanar groups by normal angle. */
function groupPlanes(topo: Topo): { planeOf: Int32Array; normals: Vec3[] } {
  const { faces, faceNormal, edgeFaces } = topo;
  const planeOf = new Int32Array(faces.length).fill(-1);
  const normals: Vec3[] = [];
  const cosTol = Math.cos((ANGLE_TOL * Math.PI) / 180);
  for (let f = 0; f < faces.length; f++) {
    if (planeOf[f] !== -1) continue;
    const id = normals.length;
    const seed = faceNormal[f];
    normals.push(seed);
    planeOf[f] = id;
    const queue = [f];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (let k = 0; k < 3; k++) {
        const a = faces[cur][k];
        const b = faces[cur][(k + 1) % 3];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        for (const nb of edgeFaces.get(key) ?? []) {
          if (planeOf[nb] === -1 && dot(faceNormal[nb], seed) > cosTol) {
            planeOf[nb] = id;
            queue.push(nb);
          }
        }
      }
    }
  }
  return { planeOf, normals };
}

/** Newell normal + centroid of a closed vertex loop. */
function loopPlane(verts: Vec3[], loop: number[]): { point: Vec3; normal: Vec3 } {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = verts[loop[i]];
    const b = verts[loop[(i + 1) % loop.length]];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
    cx += a.x;
    cy += a.y;
    cz += a.z;
  }
  return {
    point: { x: cx / loop.length, y: cy / loop.length, z: cz / loop.length },
    normal: normalize({ x: nx, y: ny, z: nz }),
  };
}

/** In-plane 2D basis for a normal. */
function basis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const up = Math.abs(normal.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const u = normalize(cross(up, normal));
  const v = cross(normal, u);
  return { u, v };
}

// ------------------------------------------------------------ circle fitting

interface Circle2 {
  cx: number;
  cy: number;
  r: number;
}

/** Deterministic RNG so detection results are reproducible and testable. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circleFrom3(p1: Vec2, p2: Vec2, p3: Vec2): Circle2 | null {
  const ax = p2.x - p1.x;
  const ay = p2.y - p1.y;
  const bx = p3.x - p1.x;
  const by = p3.y - p1.y;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-12) return null; // collinear
  const s1 = (p1.x * p1.x + p1.y * p1.y) / 2;
  const s2 = (p2.x * p2.x + p2.y * p2.y) / 2;
  const s3 = (p3.x * p3.x + p3.y * p3.y) / 2;
  const cx = ((s2 - s1) * by - (s3 - s1) * ay) / det;
  const cy = (ax * (s3 - s1) - bx * (s2 - s1)) / det;
  return { cx, cy, r: Math.hypot(p1.x - cx, p1.y - cy) };
}

/** Kasa algebraic least-squares circle fit (refinement on RANSAC inliers). */
function kasaFit(pts: Vec2[]): Circle2 | null {
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  const n = pts.length;
  for (const p of pts) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    syy += p.y * p.y;
    sxy += p.x * p.y;
    sxz += p.x * z;
    syz += p.y * z;
    sz += z;
  }
  // normal equations for x²+y² + u x + v y + w = 0
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs = [-sxz, -syz, -sz];
  const det3 = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const D = det3(m);
  if (Math.abs(D) < 1e-12) return null;
  const solve = (col: number) => {
    const a = m.map((row, i) => row.map((val, j) => (j === col ? rhs[i] : val)));
    return det3(a) / D;
  };
  const u = solve(0);
  const v = solve(1);
  const w = solve(2);
  const r2 = (u * u) / 4 + (v * v) / 4 - w;
  if (r2 <= 0) return null;
  return { cx: -u / 2, cy: -v / 2, r: Math.sqrt(r2) };
}

/**
 * Circle recognition on a closed projected loop: RANSAC 3-point fits with an
 * inlier-distance vote, accepted only for loops of >8 segments with
 * roughly equal chords. Returns the refined (Kasa) fit, or null.
 */
function fitCircle(pts: Vec2[]): Circle2 | null {
  const n = pts.length;
  if (n < 9) return null;
  let minL = Infinity;
  let maxL = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    minL = Math.min(minL, l);
    maxL = Math.max(maxL, l);
  }
  if (minL <= 0 || maxL / minL > 1.5) return null; // not a uniform tessellation

  const rand = mulberry32(42);
  let best: { c: Circle2; tol: number; inliers: number } | null = null;
  const iters = Math.min(2000, n * 20);
  for (let it = 0; it < iters; it++) {
    const i = Math.floor(rand() * n);
    const j = Math.floor(rand() * n);
    const k = Math.floor(rand() * n);
    if (i === j || j === k || i === k) continue;
    const c = circleFrom3(pts[i], pts[j], pts[k]);
    if (!c || c.r <= 0) continue;
    const tol = Math.max(0.01, c.r * 0.005);
    let inliers = 0;
    for (const p of pts) {
      if (Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) <= tol) inliers++;
    }
    if (!best || inliers > best.inliers) best = { c, tol, inliers };
  }
  if (!best || best.inliers / n < 0.98) return null;
  const inlierPts = pts.filter(
    (p) => Math.abs(Math.hypot(p.x - best!.c.cx, p.y - best!.c.cy) - best!.c.r) <= best!.tol,
  );
  return kasaFit(inlierPts) ?? best.c;
}

// ---------------------------------------------- partial-circle recognition

/** Minimum angular envelope for fragment arcs to count as a circle: the
 * span from the start of the first fragment to the end of the last,
 * measured the short way through the largest gap between them (Alice's
 * "at least a third of a circle" rule). Slivers clustered inside a
 * smaller wedge are rejected — which is also where spurious fits live. */
const MIN_CIRCLE_ENVELOPE_DEG = 120;
/** A fragment needs at least one full chord of arc evidence. */
const MIN_FRAGMENT_VERTS = 2;
/** And the whole set needs at least this many vertices on the circle. */
const MIN_FRAGMENT_TOTAL_VERTS = 6;

interface CircleChain {
  /** which border loop (cycle) the chain lives in */
  cycle: number;
  /** vertex indices within that cycle, in walk order */
  verts: number[];
}

interface CircleFragments {
  c: Circle2;
  chains: CircleChain[];
  /** every vertex on the circle and one unbroken chain — a complete
   * circle too small for fitCircle's n ≥ 9 gate (no arcs field) */
  full: boolean;
}

/** A chord spanning more than this many degrees of the candidate circle is
 * a straight bridge across a gap, not tessellation — real arc chords are
 * smaller even on coarse meshes (a hexagon cap's chords are exactly 60°).
 * A D-shape's closing chord spans 180°, a fluted rim's gap bridges ~75°. */
const BRIDGE_STEP_MAX_DEG = 60;

/**
 * PARTIAL circles: a circle carried by surviving arc fragments of ONE
 * plane's border loops — fragments of a single broken loop (flutes cut
 * into a rim) or fragments split across SEVERAL loops (a cross-shaped
 * core rising from a base cap leaves one quadrant loop per surviving
 * rim arc, the gaps between them filled with solid wall instead of open
 * air — the rim is still one circle). RANSAC candidates from all the
 * cycles' points, then inliers are stitched into chains that break at
 * off-circle vertices, at chord steps too large to be tessellation of
 * THIS circle (a straight bridge across a gap — its endpoints sit on
 * the circle, so vertex inlierness alone can't split them), and at
 * cycle boundaries. The candidate is accepted when the chains' angular
 * ENVELOPE — 360° minus the largest gap between neighbouring chains —
 * reaches MIN_CIRCLE_ENVELOPE_DEG: four 15° slivers evenly spaced
 * (envelope 285°) qualify, the same slivers bunched in one 45° wedge do
 * not. Returns the Kasa-refined fit plus the chains.
 */
function fitCircleFragments(cycles: Vec2[][]): CircleFragments | null {
  const flat = cycles.flat();
  const n = flat.length;
  if (n < MIN_FRAGMENT_TOTAL_VERTS) return null;
  const angleOf = (p: Vec2, c: Circle2): number =>
    ((Math.atan2(p.y - c.cy, p.x - c.cx) * 180) / Math.PI + 360) % 360;
  const cycleOffset: number[] = [];
  {
    let o = 0;
    for (const cy of cycles) {
      cycleOffset.push(o);
      o += cy.length;
    }
  }

  const rand = mulberry32(43);
  let best: { c: Circle2; tol: number; chains: CircleChain[]; total: number; full: boolean } | null =
    null;
  const iters = Math.min(2000, n * 20);
  for (let it = 0; it < iters; it++) {
    const i = Math.floor(rand() * n);
    const j = Math.floor(rand() * n);
    const k = Math.floor(rand() * n);
    if (i === j || j === k || i === k) continue;
    const c = circleFrom3(flat[i], flat[j], flat[k]);
    if (!c || c.r <= 0) continue;
    const tol = Math.max(0.01, c.r * 0.005);
    const inlier = flat.map((p) => Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r) <= tol);

    let allInlier = true;
    let wrapStep = 0;
    const chains: CircleChain[] = [];
    for (let ci = 0; ci < cycles.length; ci++) {
      const m = cycles[ci].length;
      const offset = cycleOffset[ci];
      const loc = (s: number) => offset + (((s % m) + m) % m);
      const angleRaw = (s: number) => angleOf(flat[loc(s)], c);
      const inl = (s: number) => inlier[loc(s)];
      // the angular gap between neighbours, as the SMALL delta — a loop
      // may traverse its arcs forward and its bridges backward (a broken
      // hole rim's net winding is the bridges' sign, opposite the arcs'),
      // so chain splitting must be direction-free
      const stepDeg = (fromA: number, toA: number) => {
        const d = Math.abs(toA - fromA);
        return Math.min(d, 360 - d);
      };
      const stepRaw = (s: number) => stepDeg(angleRaw(s), angleRaw(s + 1));

      // start the walk at a chain BREAK so no chain crosses the walk's
      // seam and splits in two: just after an off-circle vertex when one
      // exists; for all-inlier cycles (every vertex on the circle — the
      // D-shape's chord endpoints included) just after a gap bridge, or
      // anywhere when there is none (a complete circle)
      let seed = 0;
      let outlierAt = -1;
      for (let s = 0; s < m; s++) {
        if (!inl(s)) {
          outlierAt = s;
          break;
        }
      }
      if (outlierAt !== -1) {
        seed = outlierAt;
        allInlier = false;
      } else {
        for (let s = 0; s < m; s++) {
          if (stepRaw(s) > BRIDGE_STEP_MAX_DEG) {
            seed = (s + 1) % m;
            break;
          }
        }
      }
      const at = (s: number) => (seed + s) % m;
      // the step closing the walk ring, from the last vertex back to the
      // first — the one the walk below never examines (single-cycle
      // loops only: it decides whether an all-inlier fit is complete)
      if (cycles.length === 1) wrapStep = stepRaw(at(m - 1));
      const mkChain = (s0: number, s1: number): CircleChain => {
        const verts: number[] = [];
        for (let s = s0; s <= s1; s++) verts.push(at(s));
        return { cycle: ci, verts };
      };

      let runStart = -1;
      let prevInlier = inl(at(m - 1));
      let prevA = angleRaw(at(m - 1));
      for (let s = 0; s < m; s++) {
        const curInlier = inl(at(s));
        const a = angleRaw(at(s));
        // chains break at off-circle vertices and at gap bridges; a
        // bridge endpoint OPENS the next chain (it is that fragment's
        // first vertex)
        const step = curInlier && prevInlier ? stepDeg(prevA, a) : Infinity;
        if (!curInlier) {
          if (runStart !== -1) {
            chains.push(mkChain(runStart, s - 1));
            runStart = -1;
          }
        } else if (runStart === -1 || step > BRIDGE_STEP_MAX_DEG) {
          if (runStart !== -1) chains.push(mkChain(runStart, s - 1));
          runStart = s;
        }
        prevA = a;
        prevInlier = curInlier;
      }
      if (runStart !== -1) chains.push(mkChain(runStart, m - 1));
    }

    // stray single vertices are not arc evidence — drop their chains,
    // then gate on total coverage and the angular envelope: the chains'
    // CCW intervals about the fitted center, 360° minus the largest gap
    // between neighbours, measured in each chain's own direction
    const kept = chains.filter((ch) => ch.verts.length >= MIN_FRAGMENT_VERTS);
    const t = kept.reduce((acc, ch) => acc + ch.verts.length, 0);
    let accepted = t >= MIN_FRAGMENT_TOTAL_VERTS;
    if (accepted && kept.length > 0) {
      const bounds = kept
        .map((ch) => {
          const base = cycleOffset[ch.cycle];
          const p0 = flat[base + ch.verts[0]];
          const p1 = flat[base + ch.verts[1]];
          const pN = flat[base + ch.verts[ch.verts.length - 1]];
          const ccw = (angleOf(p1, c) - angleOf(p0, c) + 360) % 360 < 180;
          return {
            from: angleOf(ccw ? p0 : pN, c),
            to: angleOf(ccw ? pN : p0, c),
          };
        })
        .sort((a, b) => a.from - b.from);
      let maxGap = 0;
      for (let r = 0; r < bounds.length; r++) {
        const next = bounds[(r + 1) % bounds.length];
        maxGap = Math.max(maxGap, (next.from - bounds[r].to + 720) % 360);
      }
      accepted = 360 - maxGap >= MIN_CIRCLE_ENVELOPE_DEG;
    }
    if (accepted && (!best || t > best.total)) {
      best = {
        c,
        tol,
        chains: kept,
        total: t,
        // every vertex on the circle AND one unbroken chain around it —
        // a full circle that was just too small for fitCircle's n ≥ 9
        full: allInlier && cycles.length === 1 && kept.length === 1 && wrapStep <= BRIDGE_STEP_MAX_DEG,
      };
    }
  }
  if (!best) return null;
  const inlierPts: Vec2[] = [];
  for (const ch of best.chains) {
    const base = cycleOffset[ch.cycle];
    for (const vi of ch.verts) inlierPts.push(flat[base + vi]);
  }
  return { c: kasaFit(inlierPts) ?? best.c, chains: best.chains, full: best.full };
}

// ---------------------------------------------------------------- detection

export function detectFeatures(geometry: THREE.BufferGeometry): DetectedFeatures {
  const topo = buildTopo(geometry);
  const { verts, faces } = topo;
  const { planeOf, normals } = groupPlanes(topo);

  // plane features: representative point = mean of member-face vertices
  const sums = normals.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
  faces.forEach((f, i) => {
    const s = sums[planeOf[i]];
    for (const v of f) {
      s.x += verts[v].x;
      s.y += verts[v].y;
      s.z += verts[v].z;
      s.n++;
    }
  });
  const planes: PlaneFeature[] = sums.map((s, i) => {
    const point = { x: s.x / s.n, y: s.y / s.n, z: s.z / s.n };
    return {
      kind: 'plane',
      id: featureId('plane', [
        normals[i].x,
        normals[i].y,
        normals[i].z,
        point.x,
        point.y,
        point.z,
      ]),
      point,
      normal: normals[i],
    };
  });

  // directed border edges: v→w where the edge's far face leaves the plane
  const borderNext = new Map<string, number>(); // `${plane}:${fromVertex}` → toVertex
  faces.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      const a = f[k];
      const b = f[(k + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const adj = topo.edgeFaces.get(key) ?? [];
      const other = adj.find((x) => x !== i); // non-manifold: first other (v1 approximation)
      if (other !== undefined && planeOf[other] === planeOf[i]) continue;
      borderNext.set(`${planeOf[i]}:${a}`, b);
    }
  });

  // stitch border loops
  const visited = new Set<string>();
  const loops: { plane: number; verts: number[] }[] = [];
  for (const key of [...borderNext.keys()]) {
    const colon = key.indexOf(':');
    const p = Number(key.slice(0, colon));
    const from = Number(key.slice(colon + 1));
    const loop: number[] = [];
    let cur = from;
    let guard = verts.length + 2;
    while (guard-- > 0) {
      const to = borderNext.get(`${p}:${cur}`);
      if (to === undefined) break;
      const ekey = `${p}:${cur}:${to}`;
      if (visited.has(ekey)) break;
      visited.add(ekey);
      loop.push(cur);
      cur = to;
    }
    if (loop.length >= 3) loops.push({ plane: p, verts: loop });
  }

  const circles: CircleFeature[] = [];
  const edges: EdgeFeature[] = [];
  const edgeKeys = new Set<string>();
  /**
   * Mesh edges lying along circle-classified loops — tessellation chords of
   * the circle, not meaningful straight edges. Suppressed from edge features
   * so they don't duplicate the circle (and out-vote it in hover snapping).
   */
  const circleEdges = new Set<string>();

  const emitEdge = (a: Vec3, b: Vec3) => {
    const ka = vkey(a.x, a.y, a.z);
    const kb = vkey(b.x, b.y, b.z);
    if (ka === kb) return;
    const ekey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (edgeKeys.has(ekey)) return;
    edgeKeys.add(ekey);
    edges.push({
      kind: 'edge',
      id: featureId('edge', [ekey]),
      a,
      b,
    });
  };

  // Pass 1: circle recognition, per PLANE: whole circles per loop, then
  // the plane's failed loops TOGETHER — co-circular rim fragments can be
  // split across several border loops of one plane (a cross-shaped core
  // rising from a base cap leaves one quadrant loop per surviving rim
  // arc, the gaps filled with solid wall instead of open air; the rim is
  // still one circle). The fitted center comes from the plane equation
  // (u·cx + v·cy + n·h with h = centroid·n) — the 2D fit is measured
  // from the origin, so adding it to the centroid would double the
  // in-plane offset on off-origin planes.
  const straightLoops: { pts3: Vec3[]; idx: number[] }[] = [];
  const loopsByPlane = new Map<number, number[][]>();
  for (const { plane: p, verts: loop } of loops) {
    const arr = loopsByPlane.get(p);
    if (arr) arr.push(loop);
    else loopsByPlane.set(p, [loop]);
  }
  for (const [p, planeLoops] of loopsByPlane) {
    // loops that carry no whole circle — candidates for the plane's
    // fragment merge, and their winding normals for the inner vote
    const failed: number[][] = [];
    const failedNormals: Vec3[] = [];
    for (const loop of planeLoops) {
      const lp = loopPlane(verts, loop);
      const { u, v } = basis(lp.normal);
      const pts2: Vec2[] = loop.map((vi) => {
        const w = verts[vi];
        return { x: dot(w, u), y: dot(w, v) };
      });

      const circ = fitCircle(pts2);
      if (circ) {
        const h = dot(lp.point, lp.normal); // plane offset along its normal
        const center = {
          x: u.x * circ.cx + v.x * circ.cy + lp.normal.x * h,
          y: u.y * circ.cx + v.y * circ.cy + lp.normal.y * h,
          z: u.z * circ.cx + v.z * circ.cy + lp.normal.z * h,
        };
        circles.push({
          kind: 'circle',
          id: featureId('circle', [
            center.x,
            center.y,
            center.z,
            lp.normal.x,
            lp.normal.y,
            lp.normal.z,
            circ.r,
          ]),
          center,
          axis: lp.normal,
          radius: circ.r,
          inner: dot(lp.normal, normals[p]) < 0,
        });
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i];
          const b = loop[(i + 1) % loop.length];
          circleEdges.add(a < b ? `${a}_${b}` : `${b}_${a}`);
        }
        continue;
      }

      failed.push(loop);
      failedNormals.push(lp.normal);
      // the loop's non-arc runs still become edges below; its arc
      // chords are suppressed as circle tessellation when the fragment
      // merge below claims them
      straightLoops.push({ pts3: loop.map((vi) => verts[vi]), idx: loop });
    }

    if (failed.length === 0) continue;
    // the plane's own frame: one basis for every failed loop
    const { u, v } = basis(normals[p]);
    const cycles: Vec2[][] = failed.map((loop) =>
      loop.map((vi) => {
        const w = verts[vi];
        return { x: dot(w, u), y: dot(w, v) };
      }),
    );
    const frag = fitCircleFragments(cycles);
    if (!frag) continue;
    const h = dot(planes[p].point, normals[p]);
    const center = {
      x: u.x * frag.c.cx + v.x * frag.c.cy + normals[p].x * h,
      y: u.y * frag.c.cx + v.y * frag.c.cy + normals[p].y * h,
      z: u.z * frag.c.cx + v.z * frag.c.cy + normals[p].z * h,
    };
    // inner vote across the merged loops, weighted by arc evidence: a
    // chain whose loop winds against the plane's faces is a hole rim
    let innerCount = 0;
    for (const ch of frag.chains) {
      if (dot(failedNormals[ch.cycle], normals[p]) < 0) innerCount += ch.verts.length;
    }
    const circle: CircleFeature = {
      kind: 'circle',
      id: featureId('circle', [
        center.x,
        center.y,
        center.z,
        normals[p].x,
        normals[p].y,
        normals[p].z,
        frag.c.r,
      ]),
      center,
      axis: normals[p],
      radius: frag.c.r,
      inner: innerCount * 2 > frag.chains.reduce((acc, ch) => acc + ch.verts.length, 0),
      // every vertex on the circle = a full circle that was just too
      // small for fitCircle's n ≥ 9 gate — no arcs field, so every
      // downstream op treats it as complete
      ...(frag.full
        ? {}
        : {
            arcs: frag.chains.map((ch) =>
              ch.verts.map((vi) => verts[failed[ch.cycle][vi]]),
            ),
          }),
    };
    if (circles.some((c) => sameCircle(c, circle))) continue;
    circles.push(circle);
    for (const ch of frag.chains) {
      const loop = failed[ch.cycle];
      const pairs = ch.verts.length - (frag.full ? 0 : 1); // full: wrap chord too
      for (let i = 0; i < pairs; i++) {
        const a = loop[ch.verts[i]];
        const b = loop[(ch.verts[i] + 1) % loop.length];
        circleEdges.add(a < b ? `${a}_${b}` : `${b}_${a}`);
      }
    }
  }

  // Pass 2: straight-edge runs on the remaining loops: split at direction
  // changes, merge collinear segments, skip runs that touch a circle chord.
  for (const { pts3, idx } of straightLoops) {
    const N = pts3.length;
    const emitRun = (start: number, end: number) => {
      for (let i = start; i !== end; i = (i + 1) % N) {
        const a = idx[i];
        const b = idx[(i + 1) % N];
        if (circleEdges.has(a < b ? `${a}_${b}` : `${b}_${a}`)) return;
      }
      emitEdge(pts3[start], pts3[end]);
    };
    let runStart = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const k = (j + 1) % N;
      const u1 = {
        x: pts3[j].x - pts3[i].x,
        y: pts3[j].y - pts3[i].y,
        z: pts3[j].z - pts3[i].z,
      };
      const u2 = {
        x: pts3[k].x - pts3[j].x,
        y: pts3[k].y - pts3[j].y,
        z: pts3[k].z - pts3[j].z,
      };
      const l1 = Math.hypot(u1.x, u1.y, u1.z);
      const l2 = Math.hypot(u2.x, u2.y, u2.z);
      const sameDir =
        l1 > 0 &&
        l2 > 0 &&
        dot(u1, u2) / (l1 * l2) > 1 - 1e-9; // collinear and same direction
      if (!sameDir) {
        emitRun(runStart, j);
        runStart = j;
      }
    }
  }

  // Pass 3: sharp-junction circles (chamfer roots). A chamfer's root circle
  // — the true wall/bore diameter — lies between two multi-plane surface
  // bands (chamfer + wall), so no single plane's border loop contains it.
  // Stitch mesh edges whose adjacent faces deviate sharply into loops
  // (taking the straightest continuation at junctions) and circle-fit them.
  const cosSharp = Math.cos((SHARP_DEG * Math.PI) / 180);
  const incident = new Map<number, { other: number; key: string }[]>();
  const featureKeys: string[] = [];
  for (const [key, faces] of topo.edgeFaces) {
    if (faces.length >= 2 && dot(topo.faceNormal[faces[0]], topo.faceNormal[faces[1]]) >= cosSharp) {
      continue; // smooth join, not a feature edge
    }
    featureKeys.push(key);
    const [a, b] = key.split('_').map(Number);
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const arr = incident.get(from);
      if (arr) arr.push({ other: to, key });
      else incident.set(from, [{ other: to, key }]);
    }
  }

  const walked = new Set<string>();
  for (const key of featureKeys) {
    if (walked.has(key)) continue;
    const [a, b] = key.split('_').map(Number);
    walked.add(key);
    const loop: number[] = [a, b];
    let prev = a;
    let cur = b;
    let guard = verts.length + 2;
    let closed = false;
    while (guard-- > 0) {
      const cands = (incident.get(cur) ?? []).filter((c) => !walked.has(c.key));
      if (cands.length === 0) break; // open chain: not a loop
      let pick = cands[0];
      if (cands.length > 1) {
        const dir = norm(sub(verts[cur], verts[prev]));
        let bestCos = -Infinity;
        for (const c of cands) {
          const cos = dot(dir, norm(sub(verts[c.other], verts[cur])));
          if (cos > bestCos) {
            bestCos = cos;
            pick = c;
          }
        }
      }
      walked.add(pick.key);
      if (pick.other === loop[0]) {
        closed = true;
        break;
      }
      loop.push(pick.other);
      prev = cur;
      cur = pick.other;
    }
    if (!closed) continue;

    const pts3 = loop.map((vi) => verts[vi]);
    const lp = loopPlane(pts3, pts3.map((_, i) => i));
    const { u, v } = basis(lp.normal);
    const pts2: Vec2[] = pts3.map((w) => ({ x: dot(w, u), y: dot(w, v) }));
    const circ = fitCircle(pts2);
    if (!circ) continue;

    const h = dot(lp.point, lp.normal);
    const center = {
      x: u.x * circ.cx + v.x * circ.cy + lp.normal.x * h,
      y: u.y * circ.cx + v.y * circ.cy + lp.normal.y * h,
      z: u.z * circ.cx + v.z * circ.cy + lp.normal.z * h,
    };
    // Hole test: vote on the radial component of the adjacent surface
    // normals at each ring edge — surfaces facing back toward the circle's
    // axis mean material outside the loop (a bore).
    let vote = 0;
    for (let i = 0; i < loop.length; i++) {
      const ea = loop[i];
      const eb = loop[(i + 1) % loop.length];
      const faces = topo.edgeFaces.get(ea < eb ? `${ea}_${eb}` : `${eb}_${ea}`) ?? [];
      if (faces.length < 2) continue;
      const m = norm({
        x: topo.faceNormal[faces[0]].x + topo.faceNormal[faces[1]].x,
        y: topo.faceNormal[faces[0]].y + topo.faceNormal[faces[1]].y,
        z: topo.faceNormal[faces[0]].z + topo.faceNormal[faces[1]].z,
      });
      const mid = {
        x: (verts[ea].x + verts[eb].x) / 2,
        y: (verts[ea].y + verts[eb].y) / 2,
        z: (verts[ea].z + verts[eb].z) / 2,
      };
      vote += dot(m, norm(sub(mid, center)));
    }

    const circle: CircleFeature = {
      kind: 'circle',
      id: featureId('circle', [
        center.x,
        center.y,
        center.z,
        lp.normal.x,
        lp.normal.y,
        lp.normal.z,
        circ.r,
      ]),
      center,
      axis: lp.normal,
      radius: circ.r,
      inner: vote < 0,
    };
    if (!circles.some((c) => sameCircle(c, circle))) circles.push(circle);
  }

  // raw-triangle → plane mapping for face picking and plane highlighting
  const rawTriCount = Math.floor((geometry.index ? geometry.toNonIndexed() : geometry).getAttribute('position').count / 3);
  const faceToPlane = new Int32Array(rawTriCount).fill(-1);
  faces.forEach((_, i) => {
    faceToPlane[topo.rawIndexOf[i]] = planeOf[i];
  });

  // border loops as 3D point rings for outline-following ops (chamfer);
  // `loops` order is deterministic (borderNext insertion order)
  const planeLoops = loops.map(({ plane, verts: lv }) => ({
    plane,
    points: lv.map((vi) => verts[vi]),
  }));

  return { planes, circles, edges, faceToPlane, planeLoops };
}

// ------------------------------------------------- machine-space derivation

/**
 * Drill targets: interior-loop circles whose (transformed) axis is parallel
 * to the machine Z axis. Model-space circle ids carry over.
 */
export function holesFromCircles(
  circles: CircleFeature[],
  transform: ModelTransform,
): HoleFeature[] {
  const rot = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (transform.rotationDeg.x * Math.PI) / 180,
      (transform.rotationDeg.y * Math.PI) / 180,
      (transform.rotationDeg.z * Math.PI) / 180,
      'XYZ',
    ),
  );
  const holes: HoleFeature[] = [];
  for (const c of circles) {
    // partial circles carry no bore: a broken hole rim doesn't bound a
    // drillable center — refuse rather than guess
    if (!c.inner || c.arcs) continue;
    const axis = new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z).applyQuaternion(rot);
    if (Math.abs(axis.z) < 0.999) continue;
    const center = new THREE.Vector3(c.center.x, c.center.y, c.center.z)
      .applyQuaternion(rot)
      .add(
        new THREE.Vector3(
          transform.position.x,
          transform.position.y,
          transform.position.z,
        ),
      );
    holes.push({
      kind: 'hole',
      id: `hole:${c.id}`,
      center: { x: center.x, y: center.y, z: center.z },
      diameter: c.radius * 2,
    });
  }
  return holes;
}

// ------------------------------------------------------ bounding measurement

/** Max radius of machine-space positions about the stock axis (machine X). */
export function boundingRadiusAboutX(positions: ArrayLike<number>): number {
  let r = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    r = Math.max(r, Math.hypot(positions[i + 1], positions[i + 2]));
  }
  return r;
}

/** Machine-space X extent [min, max] of the positions. */
export function axialExtentX(positions: ArrayLike<number>): readonly [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    min = Math.min(min, positions[i]);
    max = Math.max(max, positions[i]);
  }
  return [min, max];
}