/**
 * Vertex-clustering decimation for FEATURE DETECTION ONLY — never the
 * viewport, never a generation input (those keep full resolution). Fine
 * reliefs (~240k triangles) make detectFeatures take seconds and build a
 * huge plane set; a clustered approximation at a few thousand triangles
 * carries the same macro features.
 *
 * Why clustering (not edge-collapse/QEM): grid-snapping welds flat
 * regions into genuinely planar patches — exactly what plane/circle/edge
 * detection wants — and a welded vertex is the average of the input
 * positions sharing its cell, so it can never leave the input convex hull
 * (the output bbox is always inside the input bbox). Fidelity is
 * irrelevant here: this is a detection approximation, not a rendering
 * asset.
 *
 * detectFeatures (features.ts buildTopo) reads ONLY the position
 * attribute and computes its own face normals from it, so the result
 * carries position and nothing else.
 */

import * as THREE from 'three';

export interface DecimatedMesh {
  /**
   * Fresh non-indexed geometry (never the caller's instance), position
   * attribute only. detectFeatures derives normals from positions, so
   * no normal attribute is needed or produced.
   */
  geometry: THREE.BufferGeometry;
  /** triangle count of `geometry` */
  triangles: number;
  /**
   * Accepted cluster pitch, mm — the cell edge the vertices were snapped
   * to. 0 when the input came back unchanged (no clustering happened).
   */
  pitch: number;
}

/** Initial grid resolution: pitch = bbox diagonal / 256. */
const START_GRID = 256;
/** Pitch-doubling rounds bound; past this the coarsest result is returned. */
const MAX_ROUNDS = 8;
/** Exact-position weld precision, mm (matches features.ts WELD). */
const WELD = 1e6;

export function decimateForDetection(
  geometry: THREE.BufferGeometry,
  maxTriangles: number,
): DecimatedMesh {
  if (maxTriangles < 1) throw new Error('maxTriangles must be at least 1');
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = src.getAttribute('position') as THREE.BufferAttribute;
  const n = attr.count;
  const triCount = Math.floor(n / 3);

  // Always hand back a fresh instance, even for the trivial copy: the
  // caller passes geometries to sources that read/mutate attributes, and
  // a copy keeps ownership unambiguous.
  const build = (positions: Float32Array, pitch: number): DecimatedMesh => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: g, triangles: positions.length / 9, pitch };
  };

  // At/below the cap: non-indexed copy, byte-for-byte, no clustering.
  if (triCount <= maxTriangles) {
    const flat = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      flat[i * 3] = attr.getX(i);
      flat[i * 3 + 1] = attr.getY(i);
      flat[i * 3 + 2] = attr.getZ(i);
    }
    return build(flat, 0);
  }

  // Weld identical corner uses once into unique vertices — the triangle
  // soup repeats every interior vertex ~6×, and the clustering rounds
  // below then run over unique positions instead of corner uses.
  const uniq: number[] = []; // flat xyz
  const cornerVert = new Int32Array(n); // corner use → unique vertex
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const x = attr.getX(i);
    const y = attr.getY(i);
    const z = attr.getZ(i);
    const key = `${Math.round(x * WELD)}|${Math.round(y * WELD)}|${Math.round(z * WELD)}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = uniq.length / 3;
      seen.set(key, id);
      uniq.push(x, y, z);
    }
    cornerVert[i] = id;
  }
  const vertCount = uniq.length / 3;

  // Bounding box over unique vertices → the initial pitch.
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let v = 0; v < vertCount; v++) {
    const x = uniq[v * 3];
    const y = uniq[v * 3 + 1];
    const z = uniq[v * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  let pitch = Math.max(diag, 1e-9) / START_GRID; // guard the flat/degenerate bbox

  // One clustering round: snap unique vertices to pitch-sized grid cells,
  // weld each cell to the MEAN of the distinct input positions in it (the
  // mean stays inside the cell, so pull-in is bounded by one pitch), and
  // rebuild the triangle soup from the welded corners — dropping any
  // triangle whose corners collapsed together.
  const clusterOnce = (p: number): Float32Array => {
    const cellVert = new Int32Array(vertCount);
    const sums: number[] = []; // per cell: sumX, sumY, sumZ, count
    const cells = new Map<string, number>();
    for (let v = 0; v < vertCount; v++) {
      const x = uniq[v * 3];
      const y = uniq[v * 3 + 1];
      const z = uniq[v * 3 + 2];
      const key = `${Math.floor(x / p)}|${Math.floor(y / p)}|${Math.floor(z / p)}`;
      let cell = cells.get(key);
      if (cell === undefined) {
        cell = sums.length / 4;
        cells.set(key, cell);
        sums.push(0, 0, 0, 0);
      }
      sums[cell * 4] += x;
      sums[cell * 4 + 1] += y;
      sums[cell * 4 + 2] += z;
      sums[cell * 4 + 3] += 1;
      cellVert[v] = cell;
    }
    const reps = new Float32Array((sums.length / 4) * 3); // cell representatives
    for (let c = 0; c < sums.length / 4; c++) {
      reps[c * 3] = sums[c * 4] / sums[c * 4 + 3];
      reps[c * 3 + 1] = sums[c * 4 + 1] / sums[c * 4 + 3];
      reps[c * 3 + 2] = sums[c * 4 + 2] / sums[c * 4 + 3];
    }
    const out: number[] = [];
    for (let t = 0; t < triCount; t++) {
      const a = cellVert[cornerVert[t * 3]];
      const b = cellVert[cornerVert[t * 3 + 1]];
      const c = cellVert[cornerVert[t * 3 + 2]];
      if (a === b || b === c || a === c) continue; // collapsed to an edge/point
      out.push(
        reps[a * 3], reps[a * 3 + 1], reps[a * 3 + 2],
        reps[b * 3], reps[b * 3 + 1], reps[b * 3 + 2],
        reps[c * 3], reps[c * 3 + 1], reps[c * 3 + 2],
      );
    }
    return new Float32Array(out);
  };

  // Double the pitch until under the cap; if MAX_ROUNDS isn't enough,
  // return the coarsest result rather than failing.
  let coarsest: Float32Array | null = null;
  let coarsestPitch = pitch;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const welded = clusterOnce(pitch);
    coarsest = welded;
    coarsestPitch = pitch;
    if (welded.length / 3 <= maxTriangles) return build(welded, pitch);
    pitch *= 2;
  }
  return build(coarsest!, coarsestPitch);
}