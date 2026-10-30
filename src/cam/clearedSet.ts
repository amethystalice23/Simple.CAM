/**
 * THE CLEARED-SET MAP — the roughing-reach model for the 4D orientation
 * cover (P2b, 2026-10-29). The first-cut reachability map judged each
 * cell by pure from-above visibility and proved, against a real
 * four-orientation waterline job, that roughing reach is NOT a
 * per-cell ray question: 84% of "buried-at-every-angle" cells had
 * their adjacent waste cleared by real passes, because a waterline at
 * orientation A clears per-level REGIONS — everything outside the
 * upper-shadow keep-out that the tool's Ø can sweep — not just
 * up-facing surfaces.
 *
 * THE MODEL (the waterline's own semantics, evaluated per candidate
 * orientation): a cell's adjacent waste is CLEARED at A iff a tool
 * sweeping the clearing regions at A can hold a plane at the cell's
 * height while covering the waste just outside its surface. Two
 * exact ingredients, no per-level slicing:
 *
 *  1. THE HEIGHTMAP H_A(x, y): the topmost model material along the
 *     machine-vertical line at (x, y) with the stock at angle A — the
 *     from-above raycast, rays inverse-rotated into the material
 *     frame (one BVH for all orientations). This IS the upper-shadow
 *     keep-out: waste at height z at (x, y) is shadowed iff H_A > z,
 *     and the waterline never cuts under it.
 *  2. THE OPENING: the tool of radius R can sweep a point q at plane
 *     z iff some tool center within R of q has its whole disc clear
 *     to z — erode the heightmap by R (the min over each center's
 *     disc = the deepest plane that center can hold), then dilate
 *     (the min over centers near q). A gap narrower than the tool
 *     stays uncut, exactly as the waterline's unreachable-stock
 *     warning reports on real jobs.
 *
 * A material cell (its surface point known from the radial dexel map)
 * is CLEARED at A iff D_A(q) ≤ z_cell, where q is the point just
 * outside its surface rotated into orientation A and z_cell its
 * machine height there. The verdict that replaces the radial
 * shadow/air classes for roughing: the radial air-gap criterion was
 * the wrong instrument for vertical clearing (90% of "blocked" cells
 * cleared in the calibration) — the shadow map stays where it
 * belongs, in the radial-approach rotary carve kernel.
 *
 * KNOWN SECOND-ORDER EFFECTS, honestly out of this model's scope: the
 * waterline's moat-only ladder stop ends each op at its widest
 * section (cells below the stop stay standing even when exposed — a
 * planner consuming this map pairs verdicts with each orientation's
 * stop depth), and discrete ladder levels quantize the swept planes
 * by one step-down. Both are emission properties, not reach
 * properties; the oracle table separates them.
 *
 * Pure module: the radial dexel pass for the cell universe, one
 * heightmap + two grid filters per orientation, no worker/UI deps.
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildDexelMap } from './rotaryCarve';

/** the adjacent-waste sample distance: how far outside the surface the
 * "cleared" claim is made (the calibration probe measured the voxel at
 * 0.5mm out — the default matches it for like-for-like validation) */
const DEFAULT_OFFSET = 0.5;
/** grid-lookup tolerance, mm — the heightmap grid pitch quantizes D and
 * z_cell by up to one cell */
const LOOKUP_EPS = 1e-3;

export interface ClearedSetOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  in the STOCK's material frame) */
  positions: ArrayLike<number>;
  /** stock axial span + radius + axis height (the carve grid's frame) */
  x0: number;
  x1: number;
  radius: number;
  axisZ: number;
  /** the (x,θ) cell grid's angular resolution — rows spaced this much
   *  of ARC at the stock radius (the carve kernel's convention; X pitch
   *  is half), and the heightmap grid uses the same pitch on both axes */
  thetaStepOver: number;
  /** candidate orientations, degrees absolute — the ladder to evaluate */
  orientations: number[];
  /** the sweeping tool's diameter — bounds the opening */
  tool: { diameter: number };
  /** the adjacent-waste sample distance, mm (default 0.5) */
  offset?: number;
}

export interface ClearedSetResult {
  /** cleared[orientationIndex * nCells + cellIndex] = 1 when orientation
   *  oi clears cell k's adjacent waste */
  cleared: Uint8Array;
  nx: number;
  nTheta: number;
  orientations: number[];
  /** cells with model material on their radial ray (the universe) */
  materialCells: number;
  /** material cells cleared at ≥1 ladder orientation */
  coverable: number;
  /** material cells no ladder orientation clears */
  buriedEverywhere: number;
  clearedPerOrientation: number[];
}

export function buildClearedMap(o: ClearedSetOptions): ClearedSetResult {
  if (o.x1 <= o.x0) throw new Error('the stock span is empty');
  if (o.radius <= 0) throw new Error('the stock radius must be positive');
  if (o.thetaStepOver <= 0) throw new Error('thetaStepOver must be positive');
  if (o.orientations.length === 0) throw new Error('at least one orientation is needed');

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(o.positions), 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  // the cell grid + the material universe (the radial dexel pass)
  const pitch = o.thetaStepOver / 2;
  const nx = Math.floor((o.x1 - o.x0) / pitch) + 1;
  const nTheta = Math.max(24, Math.round((2 * Math.PI * o.radius) / o.thetaStepOver));
  const nCells = nx * nTheta;
  const dTheta = (2 * Math.PI) / nTheta;
  const raw = buildDexelMap(o.positions, o.x0, pitch, nx, nTheta, o.radius, o.axisZ);

  // the heightmap grid: machine XY over the stock footprint rect, both
  // axes at the same pitch (the erosion/dilation discs live on it)
  const ny = Math.floor((2 * o.radius) / pitch) + 1;
  const toolR = o.tool.diameter / 2;
  const disc = Math.max(0, Math.ceil(toolR / pitch)); // opening disc, cells
  const offset = o.offset ?? DEFAULT_OFFSET;

  const ray = new THREE.Ray();
  const cleared = new Uint8Array(o.orientations.length * nCells);
  const clearedPerOrientation: number[] = [];

  // scratch buffers reused per orientation (the grid is fixed)
  const H = new Float64Array(nx * ny);
  const E = new Float64Array(nx * ny);

  for (let oi = 0; oi < o.orientations.length; oi++) {
    const A = (o.orientations[oi] * Math.PI) / 180;
    const cosA = Math.cos(A);
    const sinA = Math.sin(A);

    // 1. THE HEIGHTMAP: machine-vertical rays, inverse-rotated into the
    //    material frame — from above at orientation A
    for (let iy = 0; iy < ny; iy++) {
      const yM = -o.radius + iy * pitch;
      for (let i = 0; i < nx; i++) {
        const x = o.x0 + i * pitch;
        // origin: machine (x, yM, axisZ + R + 10) → material
        const zRel = o.radius + 10;
        const oy = yM * cosA + zRel * sinA;
        const oz = -yM * sinA + zRel * cosA;
        ray.origin.set(x, oy, o.axisZ + oz);
        // direction: machine −Z → material (0, −sinA, −cosA)
        ray.direction.set(0, -sinA, -cosA);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
        if (hit) {
          // the hit's machine height = rotate back by A
          const hRel = hit.point.z - o.axisZ;
          H[iy * nx + i] = hit.point.y * sinA + hRel * cosA + o.axisZ;
        } else {
          H[iy * nx + i] = -Infinity; // air: clearable to the floor
        }
      }
    }

    // 2. ERODE: the DEEPEST plane each tool CENTER can hold — the MAX
    //    heightmap over the center's disc: the tallest model material in
    //    the disc bounds the descent (below it the tool would cut the
    //    model); an all-air disc holds any plane (−Infinity). (The first
    //    draft took the min — air in the disc then excused any descent,
    //    which cleared everything and failed the fixtures.)
    for (let iy = 0; iy < ny; iy++) {
      for (let i = 0; i < nx; i++) {
        let m = -Infinity;
        for (let dy = -disc; dy <= disc; dy++) {
          const jy = iy + dy;
          if (jy < 0 || jy >= ny) continue;
          for (let dx = -disc; dx <= disc; dx++) {
            const jx = i + dx;
            if (jx < 0 || jx >= nx) continue;
            if (dx * dx + dy * dy > disc * disc) continue;
            const h = H[jy * nx + jx];
            if (h > m) m = h;
          }
        }
        E[iy * nx + i] = m;
      }
    }

    // per material cell: cleared iff the OPENING at the cell's offset
    // point reaches its machine height. The opening at q = the min of E
    // over the disc around q (the dilate half) — computed inline per
    // cell (cells outnumber grid points only slightly; the inline loop
    // keeps the scratch buffers tight)
    let count = 0;
    for (let j = 0; j < nTheta; j++) {
      const theta = j * dTheta;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const r = raw[k];
        if (r === Infinity) continue; // air cell: not in the universe
        // the cell's surface point, offset outward, rotated into A
        const ro = r + offset;
        const y = ro * sinT;
        const zRel = ro * cosT;
        const yM = y * cosA - zRel * sinA;
        const zCell = y * sinA + zRel * cosA + o.axisZ;
        // q's grid cell
        const iyq = Math.round((yM + o.radius) / pitch);
        if (iyq < 0 || iyq >= ny) continue; // outside the footprint
        // the opening: min of E over the disc around q's cell
        let d = Infinity;
        for (let dy = -disc; dy <= disc; dy++) {
          const jy = iyq + dy;
          if (jy < 0 || jy >= ny) continue;
          for (let dx = -disc; dx <= disc; dx++) {
            const jx = i + dx;
            if (jx < 0 || jx >= nx) continue;
            if (dx * dx + dy * dy > disc * disc) continue;
            const e = E[jy * nx + jx];
            if (e < d) d = e;
          }
        }
        if (d <= zCell + pitch + LOOKUP_EPS) {
          cleared[oi * nCells + k] = 1;
          count++;
        }
      }
    }
    clearedPerOrientation.push(count);
  }

  // per-cell aggregation
  let materialCells = 0;
  let coverable = 0;
  for (let k = 0; k < nCells; k++) {
    if (raw[k] === Infinity) continue;
    materialCells++;
    for (let oi = 0; oi < o.orientations.length; oi++) {
      if (cleared[oi * nCells + k] === 1) {
        coverable++;
        break;
      }
    }
  }

  geo.dispose();
  return {
    cleared,
    nx,
    nTheta,
    orientations: [...o.orientations],
    materialCells,
    coverable,
    buriedEverywhere: materialCells - coverable,
    clearedPerOrientation,
  };
}