/**
 * THE REACHABILITY MAP — P2 of the true 4D carve (PLAN.md sketch
 * 2026-10-28): for every (cell, orientation) pair, can the tool reach
 * this cell's material at that index angle? The set-cover insight:
 * picking orientations is a COVER problem over surface cells, not a
 * path problem — greedy cover over this map replaces hand-tuned index
 * stacks ("strategically plans a minimal set of cuts ... to touch
 * every facet of the model its physically possible to reach").
 *
 * THE MODEL (settled 2026-10-29, after two false starts — the
 * point-window measured angular distance and never converged, and the
 * corridor half-derivation got lost in its own algebra): an INDEXED
 * orientation cuts exactly the way stacked waterline tests cut — the
 * stock frozen at angle A, a vertical 3-axis tool clearing from
 * above. A cell is REACHABLE at A iff its own surface point, rotated
 * into orientation A, is the FIRST hit of a vertical from-above ray
 * at its (x, y) position — nothing occludes it from machine-above.
 * One orientation therefore reaches the up-facing half of the part
 * (minus occluded pockets), which is why four orientations at 90°
 * apart covered the test knight and beat every contour method: the
 * per-orientation reach is a HALF-CYLINDER of cells, not a tool-Ø
 * sliver.
 *
 * VERDICTS per (cell, orientation):
 *  - REACHABLE: the rotated cell surface is the first from-above hit.
 *  - BURIED: material exists at the cell but something occludes it
 *    from above at A — reachable from another orientation.
 *  - BLOCKED: the cell's radial ray shows material behind an air gap
 *    (the shadow map) — unreachable from EVERY orientation; reported
 *    honestly, never silently dropped.
 *  - AIR: no material on the cell's radial ray (waste).
 *
 * Pure module: grid in → typed verdicts out, no worker/UI/post deps.
 * The tool geometry is deliberately NOT in the visibility math —
 * occlusion is tool-independent; flute/shank clearance above the
 * surface is the per-pose collision layer (Phase D), which composes
 * on top of this map. The map is PER-ORIENTATION by construction (the
 * 2026-10-29 committee finding: shadow and occlusion verdicts are
 * evaluated per candidate, never unioned across them).
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { shadowMap } from './rotaryCarve';

/** one candidate orientation's verdict per cell (typed for compactness) */
export const enum ReachVerdict {
  AIR = 0,
  REACHABLE = 1,
  BURIED = 2,
  BLOCKED = 3,
}

/** the from-above first-hit must match the cell's own surface within
 * this, mm — fp noise through the rotation trig, far under real
 * occlusion (which is mm-scale) */
const OCCLUSION_EPS = 1e-4;

export interface ReachabilityOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  in the STOCK's material frame — the same input the carve kernel takes) */
  positions: ArrayLike<number>;
  /** stock axial span + radius + axis height (the carve grid's frame) */
  x0: number;
  x1: number;
  radius: number;
  axisZ: number;
  /** the angular resolution of the (x,θ) cell grid — rows spaced
   *  `thetaStepOver` of ARC at the stock radius, the carve kernel's
   *  convention; X pitch is thetaStepOver/2 */
  thetaStepOver: number;
  /** candidate orientations, degrees absolute — the ladder to evaluate.
   *  The greedy cover (P3) picks from these; denser ladders cost
   *  linearly. Duplicates are fine (idempotent). */
  orientations: number[];
  /** the tool that will do the reaching — RESERVED: visibility is pure
   *  occlusion and uses none of it today; the flute/shank clearance
   *  layer (Phase D) reads it when that lands. Kept in the interface
   *  so callers stay stable across that addition. */
  tool: { diameter: number; fluteLength: number };
}

export interface ReachabilityResult {
  /** verdicts[orientationIndex * nCells + cellIndex] — one byte per
   *  (orientation, cell) pair, cells θ-major like the carve grid */
  verdicts: Uint8Array;
  nx: number;
  nTheta: number;
  /** the orientation ladder as evaluated (echoes the input order) */
  orientations: number[];
  /** cells whose radial ray shows an undercut (material behind an air
   *  gap) — unreachable from EVERY orientation, honest and final */
  blockedEverywhere: number;
  /** cells with reachable material (not air, not blocked) — the cover
   *  universe */
  materialCells: number;
  /** material cells REACHABLE from at least one ladder orientation */
  coverable: number;
  /** material cells no ladder orientation reaches (the ladder's miss;
   *  a denser ladder may shrink it — unlike blockedEverywhere, which no
   *  ladder can fix) */
  buriedEverywhere: number;
  /** per orientation: the REACHABLE count (the greedy cover's weights) */
  reachablePerOrientation: number[];
}

export function buildReachabilityMap(o: ReachabilityOptions): ReachabilityResult {
  if (o.x1 <= o.x0) throw new Error('the stock span is empty');
  if (o.radius <= 0) throw new Error('the stock radius must be positive');
  if (o.thetaStepOver <= 0) throw new Error('thetaStepOver must be positive');
  if (o.orientations.length === 0) throw new Error('at least one orientation is needed');

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(o.positions), 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  // the cell grid: the carve kernel's conventions (X pitch = stepOver/2,
  // θ rows at stepOver of arc at the stock radius)
  const pitchX = o.thetaStepOver / 2;
  const nx = Math.floor((o.x1 - o.x0) / pitchX) + 1;
  const nTheta = Math.max(24, Math.round((2 * Math.PI * o.radius) / o.thetaStepOver));
  const nCells = nx * nTheta;
  const dTheta = (2 * Math.PI) / nTheta;

  // the radial surface field, once (material frame): raw = the first-hit
  // radius per (x, θ) — the surface whose reach we are judging
  const ray = new THREE.Ray();
  const raw = new Float64Array(nCells).fill(Infinity);
  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    ray.direction.set(0, -sin, -cos);
    ray.origin.set(0, (o.radius + 10) * sin, o.axisZ + (o.radius + 10) * cos);
    for (let i = 0; i < nx; i++) {
      ray.origin.x = o.x0 + i * pitchX;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (hit) raw[j * nx + i] = Math.hypot(hit.point.y, hit.point.z - o.axisZ);
    }
  }

  // the BLOCKED field, once: orientation-invariant in the material
  // frame (rotation about the stock axis permutes θ rows; the shadow
  // verdicts travel with them)
  const blocked = shadowMap(
    o.positions,
    o.x0,
    pitchX,
    nx,
    nTheta,
    o.radius,
    o.axisZ,
    raw,
  );

  const verdicts = new Uint8Array(o.orientations.length * nCells);
  const reachablePerOrientation: number[] = [];

  for (let oi = 0; oi < o.orientations.length; oi++) {
    const A = (o.orientations[oi] * Math.PI) / 180;
    const cosA = Math.cos(A);
    const sinA = Math.sin(A);
    let reach = 0;
    for (let j = 0; j < nTheta; j++) {
      const theta = j * dTheta;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let v: ReachVerdict;
        if (blocked[k]) {
          v = ReachVerdict.BLOCKED;
        } else if (raw[k] === Infinity) {
          v = ReachVerdict.AIR;
        } else {
          // the cell's surface point in the material frame, rotated into
          // orientation A (the indexedPointRotation convention about the
          // stock axis at y=0, z=axisZ)
          const r = raw[k];
          const y = r * sinT;
          const zrel = r * cosT;
          const yr = y * cosA - zrel * sinA;
          const zr = y * sinA + zrel * cosA + o.axisZ;
          // a vertical from-above ray at the cell's (x, y'): the cell is
          // REACHABLE iff the first hit is its own surface (nothing
          // stands above it in this orientation)
          ray.origin.set(o.x0 + i * pitchX, yr, o.axisZ + o.radius + 10);
          ray.direction.set(0, 0, -1);
          const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
          v = hit && hit.point.z <= zr + OCCLUSION_EPS
            ? ReachVerdict.REACHABLE
            : ReachVerdict.BURIED;
        }
        verdicts[oi * nCells + k] = v;
        if (v === ReachVerdict.REACHABLE) reach++;
      }
    }
    reachablePerOrientation.push(reach);
  }

  // per-cell aggregation across orientations (one pass, exact)
  let blockedEverywhere = 0;
  let materialCells = 0;
  let coverable = 0;
  for (let k = 0; k < nCells; k++) {
    if (blocked[k]) {
      blockedEverywhere++;
      continue;
    }
    if (raw[k] === Infinity) continue; // air: not in the universe
    materialCells++;
    for (let oi = 0; oi < o.orientations.length; oi++) {
      if (verdicts[oi * nCells + k] === ReachVerdict.REACHABLE) {
        coverable++;
        break;
      }
    }
  }

  geo.dispose();
  return {
    verdicts,
    nx,
    nTheta,
    orientations: [...o.orientations],
    blockedEverywhere,
    materialCells,
    coverable,
    buriedEverywhere: materialCells - coverable,
    reachablePerOrientation,
  };
}