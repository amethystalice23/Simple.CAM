/**
 * TRUE 4D FINISHING — the CONTACT MAP (PLAN.md "The true 4D finishing
 * pass — normal-following contact envelopes", milestone 1). The spindle
 * never tilts, so the PART supplies every contact angle: per surface
 * point, rotation A sweeps its normal through every non-X-parallel
 * attitude once per revolution. This module samples that attitude —
 * per (x,θ) surface cell it records WHERE the surface is, WHICH way it
 * faces, and the index angle A* that brings that face against the
 * tool's flank. Milestones 2+ (column clearance, patch segmentation,
 * the G93 sweep writer) all read this map; it emits NO moves.
 *
 * FRAME CONVENTIONS (matched to buildDexelMap so the grids interoperate
 * with the rough's standing material): the mesh arrives in the stock's
 * MATERIAL frame at A=0, machine-space xyz triples, non-indexed. The
 * grid is θ-major, cell (i,j) at index j·nx + i; column i sits at
 * x = x0 + i·pitchX with pitchX = thetaStepOver/2 (the rotaryCarve grid
 * contract); row j sits at θ = j·2π/nTheta with
 * nTheta = max(24, round(2πR/thetaStepOver)) — rows spaced thetaStepOver
 * of ARC at the stock radius. Sampling is OUTWARD radial raycasts
 * (direction (0,−sinθ,−cosθ) from radius+10 inward): the first hit is
 * the outer boundary, exactly the dexel map's from-outside trick (a ray
 * from the axis would report a tube's inner wall as the surface). Air
 * cells (no hit) are absent from the map — their index slot is AIR.
 *
 * THE ALIGNMENT FORMULA (derived once, pinned by tests). A material
 * direction d at stock angle A rotates as (indexedPointRotation's
 * convention about the axis, applied to directions):
 *   d.y' = d.y·cosA − d.z·sinA
 *   d.z' = d.y·sinA + d.z·cosA
 * Write the normal's YZ projection as n.y = ρ sinφ, n.z = ρ cosφ with
 * φ = atan2(n.y, n.z). Then
 *   d.z' = ρ cos(A − φ),   d.y' = ρ sin(φ − A)
 * Flank (SWARF) contact wants the rotated normal HORIZONTAL pointing at
 * the tool on machine −Y: d.z' = 0 with d.y' < 0 gives A − φ = ±90° and
 * sin(φ − A) < 0 ⇒
 *   align = φ + 90°  =  atan2(n.y, n.z) + 90°, normalized to [0, 360)
 * (PLAN.md's "A* = YZ angle − 90°" is the +Y contact attitude; this map
 * pins the −Y attitude, which PLAN itself notes is A*+180° — the two
 * agree modulo the contact side). Cross-check that doubles as the
 * convention proof: indexToAlignDirection(n) = φ carries n to +Z, and
 * since A = +90° carries +Y onto +Z under this rotation, one MORE +90°
 * carries +Z onto −Y — so align = indexToAlignDirection(n) + 90°, NOT
 * −90° (the rotated-normal test in swarfFinish.test.ts verifies the
 * sign end-to-end through indexedPointRotation itself).
 *
 * NORMALS, HEALED: the geometric (winding) normal is computed straight
 * from the hit triangle's three positions and flipped if it opposes the
 * incoming ray — the outward face normal must OPPOSE the ray that
 * arrived from outside. This heals inverted-winding meshes by
 * construction (the waterline's lesson): a DoubleSide hit with unresolved
 * winding still yields the outward normal, because "outward" here is
 * DEFINED as against-the-ray, not as winding. The choice to use the
 * single raycastFirst hit's face normal (rather than angle-weighted
 * averaging over a ray bundle) is deliberate: raycastFirst already IS
 * the nearest-surface contract the dexel map uses, and per-cell face
 * normals keep the map pure and reproducible. Degenerate (zero-area)
 * triangles produce no cell rather than a garbage normal. CAVEAT pinned
 * by the healing fixture: three-mesh-bvh re-indexes non-indexed input,
 * so faceIndex is resolved through the post-build index buffer — a raw
 * `positions[9·faceIndex]` read silently lands on the WRONG triangle.
 *
 * RAKE (the honesty metric): n.x, the signed axial component of the
 * healed normal. |rake| near 1 = the normal is nearly parallel to X =
 * the flank engagement is razor-thin (PLAN's "near-X normals" class);
 * rake 0 = pure radial face, the healthy SWARF case. Pure-X normals
 * (y = z = 0) are the implicit unreachable class — atan2(0,0) collapses
 * to 0, so their align is meaningless; the milestone-2 clearance check
 * and the coverage report own that verdict, not this map.
 *
 * DATA LAYOUT: a compact per-cell LIST (`cells`) plus a dense lookup
 * grid (`cellIndex`, j·nx + i → cell index or AIR). Patch segmentation
 * (milestone 3) walks neighbors through cellIndex in O(1) and only ever
 * touches listed cells, so sparse parts (a blade in a big stock) don't
 * pay for the empty stock cells twice.
 *
 * Pure: geometry in, map out, three-mesh-bvh raycasts — vitest covers
 * it without worker harnesses (the relief.ts precedent).
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export interface ContactMapOptions {
  /** machine-space xyz triples, non-indexed, in the stock's MATERIAL
   *  frame at A=0 (the transformed-positions contract) */
  positions: ArrayLike<number>;
  /** stock axial span, machine X, mm — the grid covers exactly this */
  x0: number;
  x1: number;
  /** stock radius, mm — the raycast stand-off and the θ row spacing
   *  (arc = thetaStepOver at this radius) are measured from it */
  radius: number;
  /** stock axis height, machine Z, mm */
  axisZ: number;
  /** the θ grid step (arc length at the stock radius, mm) — the X pitch
   *  is half of it (the rotaryCarve grid contract), so the map matches
   *  the rough's standing grid cell-for-cell */
  thetaStepOver: number;
}

/** One surface cell of the contact map. */
export interface ContactCell {
  /** the cell's own material-frame angle, radians (= row j·2π/nTheta) —
   *  kept per cell so downstream patch code never re-derives it */
  theta: number;
  /** outward surface hit point, machine frame at A=0 (material frame) */
  p: { x: number; y: number; z: number };
  /** outward face normal AT the hit, unit length, healed against the
   *  ray (winding-independent) */
  n: { x: number; y: number; z: number };
  /** A* in degrees, normalized [0,360): the stock rotation that brings
   *  THIS cell's normal to machine −Y (horizontal, at the tool's flank)
   *  — the SWARF contact attitude. Meaningless for pure-X normals (the
   *  unreachable class); pair with rake to detect those. */
  align: number;
  /** n.x, signed — the axial-rake honesty metric: |rake| ≈ 1 is razor
   *  engagement, 0 is a healthy radial flank */
  rake: number;
}

/** The contact map: milestone-1 deliverable of the 4D finishing pass. */
export interface ContactMapResult {
  /** surface cells (air excluded), ordered row-major as encountered */
  cells: ContactCell[];
  /** dense grid, cell (i,j) at j·nx + i → index into `cells`, or AIR
   *  (0xffffffff) for a cell with no surface hit */
  cellIndex: Uint32Array;
  /** grid shape — matches buildDexelMap/rotaryCarve so the rough's
   *  standing grid and this map interoperate cell-for-cell */
  nx: number;
  nTheta: number;
  pitchX: number;
  gx0: number;
  /** cells.length, surfaced for the op panel / coverage report */
  surfaceCells: number;
}

/** the cellIndex value for a cell with no surface hit (air) */
export const CONTACT_AIR = 0xffffffff;

/**
 * The alignment angle for a surface normal: A* = atan2(n.y, n.z) + 90°,
 * normalized to [0,360) — see the module docstring for the derivation
 * and the indexToAlignDirection+90 cross-check. Exported because the
 * milestone-2 clearance check must re-derive attitudes for normals the
 * sweep writer nudges; one formula, one place.
 */
export function normalAlignDeg(n: { x: number; y: number; z: number }): number {
  const phi = (Math.atan2(n.y, n.z) * 180) / Math.PI;
  return (((phi + 90) % 360) + 360) % 360;
}

/**
 * Build the contact map: outward point + healed face normal + A* + rake
 * per (x,θ) surface cell. See the module docstring for every convention.
 */
export function buildContactMap(o: ContactMapOptions): ContactMapResult {
  if (!(o.x1 > o.x0)) {
    throw new Error('empty stock span: x1 must exceed x0');
  }
  if (!(o.radius > 0)) {
    throw new Error('bad stock radius: must be positive');
  }
  if (!(o.thetaStepOver > 0)) {
    throw new Error('bad thetaStepOver: must be positive');
  }

  // the rotaryCarve grid contract: X pitch half the θ step, θ rows spaced
  // thetaStepOver of arc at the stock radius (24-row floor = never a
  // degenerate ring on tiny stocks)
  const pitchX = o.thetaStepOver / 2;
  const gx0 = o.x0;
  const nx = Math.floor((o.x1 - o.x0) / pitchX) + 1;
  const nTheta = Math.max(24, Math.round((2 * Math.PI * o.radius) / o.thetaStepOver));
  const dTheta = (2 * Math.PI) / nTheta;

  const geo = new THREE.BufferGeometry();
  const pos = Float32Array.from(o.positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });
  // three-mesh-bvh ADDS an index to non-indexed geometry and SHUFFLES it
  // while building: `hit.faceIndex` is the triangle's index in THAT
  // indexed space, so the triangle's vertices must be resolved through
  // geo.index (reading pos[9·faceIndex] grabs an unrelated triangle —
  // found by the healing fixture's cell-count mismatch). hit.face.a/b/c
  // are the same resolved vertex indices; the index read avoids the
  // per-hit object churn.
  const idx = geo.index;
  if (!idx) throw new Error('three-mesh-bvh did not index the geometry'); // unreachable

  const cells: ContactCell[] = [];
  const cellIndex = new Uint32Array(nx * nTheta).fill(CONTACT_AIR);
  const ray = new THREE.Ray();

  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    // from OUTSIDE inward: the first hit IS the outer boundary (the
    // buildDexelMap trick, radialized)
    ray.direction.set(0, -sin, -cos);
    ray.origin.set(0, (o.radius + 10) * sin, o.axisZ + (o.radius + 10) * cos);
    for (let i = 0; i < nx; i++) {
      ray.origin.x = gx0 + i * pitchX;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!hit || hit.faceIndex == null) continue;

      // geometric normal from the triangle's RAW winding, vertices
      // resolved through the BVH's index (see the note above) — then
      // healed against the ray, which makes winding irrelevant
      const t = idx.getX(hit.faceIndex * 3) * 3;
      const a = idx.getX(hit.faceIndex * 3 + 1) * 3;
      const b = idx.getX(hit.faceIndex * 3 + 2) * 3;
      const e1x = pos[a] - pos[t];
      const e1y = pos[a + 1] - pos[t + 1];
      const e1z = pos[a + 2] - pos[t + 2];
      const e2x = pos[b] - pos[t];
      const e2y = pos[b + 1] - pos[t + 1];
      const e2z = pos[b + 2] - pos[t + 2];
      let nx2 = e1y * e2z - e1z * e2y;
      let ny2 = e1z * e2x - e1x * e2z;
      let nz2 = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx2, ny2, nz2);
      if (len < 1e-12) continue; // degenerate triangle: no honest normal
      nx2 /= len;
      ny2 /= len;
      nz2 /= len;
      // HEAL: the outward normal must oppose the incoming ray
      if (nx2 * ray.direction.x + ny2 * ray.direction.y + nz2 * ray.direction.z > 0) {
        nx2 = -nx2;
        ny2 = -ny2;
        nz2 = -nz2;
      }

      cellIndex[j * nx + i] = cells.length;
      cells.push({
        theta,
        p: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        n: { x: nx2, y: ny2, z: nz2 },
        align: normalAlignDeg({ x: nx2, y: ny2, z: nz2 }),
        rake: nx2,
      });
    }
  }

  geo.dispose();
  return { cells, cellIndex, nx, nTheta, pitchX, gx0, surfaceCells: cells.length };
}
