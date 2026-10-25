/**
 * Z-slicing for 2.5D operations: intersect the placed mesh with a machine
 * plane Z = const and stitch closed contours for Clipper2 (outer CCW,
 * holes CW). Spec: docs/edge-tracing.md §2.
 */

import * as THREE from 'three';
import type { ModelTransform, Vec2 } from '../core/types';

export interface SliceResult {
  /** closed contours; outer boundaries CCW, holes CW (Clipper2 convention) */
  contours: Vec2[][];
  /** open chains dropped at this level (open/broken meshes) */
  droppedChains: number;
}

/** Machine-space positions of a (non-indexed) geometry under a transform. */
export function transformedPositions(
  geometry: THREE.BufferGeometry,
  t: ModelTransform,
): Float32Array {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(attr.count * 3);
  const rot = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (t.rotationDeg.x * Math.PI) / 180,
      (t.rotationDeg.y * Math.PI) / 180,
      (t.rotationDeg.z * Math.PI) / 180,
      'XYZ',
    ),
  );
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i);
    v.set(v.x * t.scale.x, v.y * t.scale.y, v.z * t.scale.z); // scale first
    v.applyQuaternion(rot);
    out[i * 3] = v.x + t.position.x;
    out[i * 3 + 1] = v.y + t.position.y;
    out[i * 3 + 2] = v.z + t.position.z;
  }
  return out;
}

const KEY_SCALE = 1e7; // endpoint matching at 1e-7 mm

function qkey(x: number, y: number): string {
  return `${Math.round(x * KEY_SCALE)} ${Math.round(y * KEY_SCALE)}`;
}

function dedupe(chain: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of chain) {
    if (out.length === 0 || qkey(p.x, p.y) !== qkey(out[out.length - 1].x, out[out.length - 1].y)) {
      out.push(p);
    }
  }
  while (
    out.length > 1 &&
    qkey(out[0].x, out[0].y) === qkey(out[out.length - 1].x, out[out.length - 1].y)
  ) {
    out.pop();
  }
  return out;
}

function signedArea(c: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInPoly(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (
      pi.y > pt.y !== pj.y > pt.y &&
      pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Z-span bucket index over a positions array: bucket i holds the face
 * indices whose (padded) Z span overlaps [minZ + i·bucketH, minZ + (i+1)·bucketH),
 * so a slice plane tests only the candidates in its one bucket instead of
 * scanning every triangle. Build once per mesh, slice many planes — the
 * waterline rough slices O(levels) planes, and on a 235k-triangle relief
 * the full scan per plane is what made generation O(levels × triangles).
 *
 * The bucket set is purely a candidate FILTER: a triangle that straddles
 * (or, within the on-plane epsilon, touches) a plane is guaranteed to be
 * in that plane's bucket — spans are padded by more than the epsilon —
 * and the accept/reject math is the shared per-triangle test, so indexed
 * and unindexed slices return identical results.
 */
export interface ZIndex {
  readonly minZ: number;
  readonly bucketH: number;
  /** face indices per bucket (ascending — the full-scan order) */
  readonly buckets: readonly (readonly number[])[];
}

/** Aim for ~64 candidate triangles per bucket on an evenly spread mesh. */
const BUCKET_TARGET = 64;

/**
 * Z-span padding, mm: must dominate the on-plane epsilon
 * (1e-9 · max(1, |z|)) at any sane machine Z so a touching triangle never
 * falls out of its plane's bucket, while staying far under a bucket height.
 */
function indexPad(minZ: number, maxZ: number): number {
  return 1e-6 * Math.max(1, Math.abs(minZ), Math.abs(maxZ));
}

/**
 * Build the Z-span bucket index for a positions array (flat xyz triples,
 * non-indexed — the same array `sliceAtZ` will be given). One pass over
 * the triangles; NaN-span faces are left out (they can never cross a
 * plane — the scan's side test reads them as on-plane and skips).
 */
export function buildZIndex(positions: ArrayLike<number>): ZIndex {
  const faceCount = Math.floor(positions.length / 9);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    const z = positions[i];
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minZ)) {
    minZ = 0; // empty mesh: one empty bucket keeps every query honest
    maxZ = 0;
  }
  const span = maxZ - minZ;
  const nBuckets = Math.max(1, Math.ceil(faceCount / BUCKET_TARGET));
  const bucketH = span > 0 ? span / nBuckets : 1;
  const pad = indexPad(minZ, maxZ);
  const buckets: number[][] = Array.from({ length: nBuckets }, () => []);
  for (let f = 0; f < faceCount; f++) {
    const o = f * 9;
    let lo = positions[o + 2];
    let hi = lo;
    for (let k = 1; k < 3; k++) {
      const z = positions[o + k * 3 + 2];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    let b0 = Math.floor((lo - pad - minZ) / bucketH);
    let b1 = Math.floor((hi + pad - minZ) / bucketH);
    if (b0 < 0) b0 = 0;
    if (b1 > nBuckets - 1) b1 = nBuckets - 1;
    for (let b = b0; b <= b1; b++) buckets[b].push(f);
  }
  return { minZ, bucketH, buckets };
}

/**
 * Slice machine-space positions (flat xyz triples, non-indexed) at Z = z.
 * Triangles exactly coplanar with the slice plane are skipped; the contour
 * comes from their neighbors' crossings. Open chains are dropped and
 * counted — the UI surfaces that as a broken-mesh warning.
 *
 * Pass a `ZIndex` built from the SAME positions array (see `buildZIndex`)
 * to test only the plane's candidate triangles; without one this is the
 * plain full scan over every triangle, with identical results.
 */
export function sliceAtZ(positions: ArrayLike<number>, z: number, index?: ZIndex): SliceResult {
  const eps = 1e-9 * Math.max(1, Math.abs(z));
  const side = (d: number) => (d > eps ? 1 : d < -eps ? -1 : 0);

  const segs: { a: Vec2; b: Vec2; used: boolean }[] = [];

  // one triangle's crossing test — shared verbatim by both candidate
  // paths, so an indexed slice accepts/rejects exactly what the scan would
  const collectFace = (o: number): void => {
    const vx: number[] = [];
    const vy: number[] = [];
    const d: number[] = [];
    for (let k = 0; k < 3; k++) {
      const v = o + k * 3;
      vx.push(positions[v]);
      vy.push(positions[v + 1]);
      d.push(positions[v + 2] - z);
    }
    const s = [side(d[0]), side(d[1]), side(d[2])];
    if (s[0] === s[1] && s[1] === s[2]) return; // no crossing (coplanar incl.)

    const pts: Vec2[] = [];
    const push = (x: number, y: number) => {
      if (!pts.some((p) => qkey(p.x, p.y) === qkey(x, y))) pts.push({ x, y });
    };
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      if (s[k] === 0) push(vx[k], vy[k]);
      if (s[k] * s[j] < 0) {
        const t = d[k] / (d[k] - d[j]);
        push(vx[k] + (vx[j] - vx[k]) * t, vy[k] + (vy[j] - vy[k]) * t);
      }
    }
    if (pts.length === 2) segs.push({ a: pts[0], b: pts[1], used: false });
  };

  if (index) {
    // the plane's single bucket: a superset of the straddling/touching
    // triangles (spans padded past the epsilon at insertion), pruned by
    // the same per-triangle test. Bucket faces are ascending, so the
    // segment order — and hence the stitched result — matches the scan.
    const b = Math.floor((z - index.minZ) / index.bucketH);
    const bi = b < 0 ? 0 : b >= index.buckets.length ? index.buckets.length - 1 : b;
    for (const f of index.buckets[bi]) collectFace(f * 9);
  } else {
    const faceCount = Math.floor(positions.length / 9);
    for (let f = 0; f < faceCount; f++) collectFace(f * 9);
  }

  // stitch segments into loops by shared endpoints
  const atKey = new Map<string, number[]>();
  segs.forEach((sg, i) => {
    for (const p of [sg.a, sg.b]) {
      const k = qkey(p.x, p.y);
      const arr = atKey.get(k);
      if (arr) arr.push(i);
      else atKey.set(k, [i]);
    }
  });

  const contours: Vec2[][] = [];
  let dropped = 0;
  const walk = (start: number, forward: boolean): { chain: Vec2[]; endKey: string | null } => {
    const chain: Vec2[] = [];
    const first = segs[start];
    first.used = true;
    const startKey = forward ? qkey(first.a.x, first.a.y) : qkey(first.b.x, first.b.y);
    let endKey = forward ? qkey(first.b.x, first.b.y) : qkey(first.a.x, first.a.y);
    chain.push(forward ? first.a : first.b, forward ? first.b : first.a);
    while (endKey !== null && endKey !== startKey) {
      const cand = atKey.get(endKey) ?? [];
      let next = -1;
      for (const c of cand) if (!segs[c].used) { next = c; break; }
      if (next < 0) return { chain, endKey: null };
      const s2 = segs[next];
      s2.used = true;
      const ka2 = qkey(s2.a.x, s2.a.y);
      if (ka2 === endKey) {
        chain.push(s2.b);
        endKey = qkey(s2.b.x, s2.b.y);
      } else {
        chain.push(s2.a);
        endKey = ka2;
      }
    }
    return { chain, endKey };
  };

  for (let i = 0; i < segs.length; i++) {
    if (segs[i].used) continue;
    const fwd = walk(i, true);
    if (fwd.endKey === null) {
      // open chain: consume the other direction too, count one drop
      walk(i, false);
      dropped++;
      continue;
    }
    const loop = dedupe(fwd.chain);
    if (loop.length >= 3) contours.push(loop);
  }

  // classify by nesting depth: even = outer (CCW), odd = hole (CW)
  const byArea = contours
    .map((c) => ({ c, area: signedArea(c) }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const result: Vec2[][] = [];
  for (const { c, area } of byArea) {
    let depth = 0;
    for (const placed of result) if (pointInPoly(c[0], placed)) depth++;
    const wantCCW = depth % 2 === 0;
    result.push((area > 0) === wantCCW ? c : [...c].reverse());
  }

  return { contours: result, droppedChains: dropped };
}