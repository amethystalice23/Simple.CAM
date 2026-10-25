/**
 * Raster contour of a whole model (PLAN.md §"3D relief carving", Phase B):
 * the paired SURFACE pass to the waterline contour (Phase A). A dense
 * heightmap of the model is taken by downward raycasts, DILATED with the
 * tool's kernel (flat → disc, ball → hemisphere) so every sweep clears to
 * the tool-compensated surface, and cut in serpentine rows at a fixed step
 * over — cutting only where material sits above the compensated surface
 * (no air cutting). Rows run at `angleDeg` (default 0 = along machine X;
 * 90 cuts along Y, 45 gives diagonal finishing passes). Rough-vs-finish is
 * the allowance choice, not the op:
 * allowance lifts the whole compensated surface by that much stock.
 *
 * Assumes bulk clearing already happened (a waterline contour with
 * allowance leaves exactly `allowance` above this op's surface): plunges
 * deeper than DEEP_WARN_MM get a warning to rough first, never a silent
 * full-depth bury.
 *
 * Pure 3-axis: G94 feeds only, no A words ever. Pure functions all the way
 * down (grid in → Move[] out, three-mesh-bvh raycasts) so vitest covers
 * this without worker harnesses; the Web Worker that later hosts it is a
 * thin shell (PLAN.md architecture rules).
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Move, Tool } from '../core/types';
import { APPROACH_CLEARANCE } from './paths';

export interface RasterContourOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  already datum-rotated by the caller when an Index op precedes) */
  positions: ArrayLike<number>;
  /** heightmap grid pitch, mm — the sampling resolution; the pass spacing
   *  is `stepOver`. PLAN.md: pitch ≈ stepOver/2 from the caller. */
  pitch: number;
  /** serpentine row spacing, mm */
  stepOver: number;
  /** surface stock left everywhere for a later finishing pass, mm
   *  (0 = cut to the model surface) */
  allowance: number;
  /** stock crown, machine Z — cells whose compensated surface (plus
   *  allowance) sits at/above it are air: nothing to remove there */
  topZ: number;
  /** stock bottom, machine Z — the raster never cuts below it (the fixture
   *  lives there); surfaces deeper finish flat at the bottom, warned */
  bottomZ: number;
  tool: Tool;
  /** G94 mm/min */
  feed: number;
  plungeFeed: number;
  /** rapid-travel height above the crown, mm */
  safeClearance: number;
  /** row direction, degrees CCW from machine X (default 0 = rows run along
   *  X, today's behavior): rows advance along (cos α, sin α), row-to-row
   *  along (−sin α, cos α). 90 cuts along Y — the direction the rotational
   *  variant of this op will want orthogonal to X. A grid-frame rotation
   *  only: the mesh is never copied or rotated, the raycast grid is. */
  angleDeg?: number;
}

export interface RasterContourResult {
  moves: Move[];
  /** serpentine rows that cut at least one segment */
  rows: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** deepest single plunge below the crown, mm (0 when nothing cut) */
  maxPlunge: number;
  /** human-readable, surfaced verbatim in the op panel */
  warnings: string[];
}

/**
 * Plunge depth that trips the "bulk rough first" warning, mm — deeper than
 * a surface pass should ever bury the tool when a waterline contour ran
 * ahead of this op.
 */
const DEEP_WARN_MM = 2;

/**
 * Z word emission threshold, mm — surface steps smaller than this ride the
 * previous move (the post's 3-decimal rounding would swallow them anyway);
 * must stay under the 0.01mm simplify tolerance the rest of the app uses.
 */
const Z_EMIT_TOL = 0.005;

/**
 * Y word emission threshold, mm — inside an angled row the machine y
 * drifts by sin α per mm of travel; drift under this rides the last
 * emitted y word (the post's 3-decimal rounding would swallow it anyway),
 * the same folding rule Z_EMIT_TOL gives z. At α = 0 the drift is exactly
 * 0, so y stays modal on the row-start rapid, as today.
 */
const Y_EMIT_TOL = 0.005;

/** Sample the model's height by downward raycasts, one per grid cell
 *  (three-mesh-bvh `raycastFirst`; per-cell is the v1 path per PLAN.md —
 *  DoubleSide so inverted-winding meshes still hit, the same mesh-noise
 *  honesty the waterline's CCW normalization provides). Misses read as
 *  +Infinity (air above). Grid coordinates (u, v) map to machine XY with
 *  the angle's cos/sin here and at move emission — nowhere else; at α = 0
 *  the trig values are exactly 1 and 0, so x = u, y = v bit-exactly. */
function rawHeightmap(
  positions: ArrayLike<number>,
  u0: number,
  v0: number,
  nx: number,
  ny: number,
  pitch: number,
  cosA: number,
  sinA: number,
): Float64Array {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(Float32Array.from(positions), 3),
  );
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  let originZ = -Infinity;
  for (let i = 2; i < positions.length; i += 3) {
    if (positions[i] > originZ) originZ = positions[i];
  }
  originZ += 10; // above every triangle: near=0 excludes nothing

  const heights = new Float64Array(nx * ny).fill(Infinity);
  const ray = new THREE.Ray();
  ray.direction.set(0, 0, -1);
  ray.origin.z = originZ;
  for (let j = 0; j < ny; j++) {
    const v = v0 + j * pitch;
    for (let i = 0; i < nx; i++) {
      const u = u0 + i * pitch;
      ray.origin.x = u * cosA - v * sinA;
      ray.origin.y = u * sinA + v * cosA;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (hit) heights[j * nx + i] = hit.point.z;
    }
  }
  geo.dispose();
  return heights;
}

/**
 * Dilate the raw heightmap with the tool's kernel: the compensated surface
 * at a cell is the highest TOOL TIP that touches the model with the tool
 * CENTER on that cell — max over kernel offsets of
 *   raw(x+dx,y+dy) + kernelZ(dx,dy):
 *  - flat (and bull/vbit/corn, approximated conservatively): disc kernel,
 *    kernelZ = 0 — the flat bottom cannot pass under any surface point the
 *    disc covers (a vbit's cutting cone sits inside its Ø disc)
 *  - ball: hemisphere kernel, kernelZ = √(r²−d²) − r — the tip hangs below
 *    a sample it touches off-center by exactly the ball's sagitta
 * Cells no kernel touches stay −Infinity (air everywhere around: the tool
 * cuts nothing there). Allowance is NOT applied here — the caller lifts
 * the whole map once (both-axis stock, like the waterline op).
 */
function dilate(
  raw: Float64Array,
  nx: number,
  ny: number,
  pitch: number,
  tool: Tool,
): Float64Array {
  const r = tool.diameter / 2;
  const k = Math.ceil(r / pitch);
  const ball = tool.type === 'ball';
  const out = new Float64Array(nx * ny).fill(-Infinity);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const s = raw[j * nx + i];
      if (s === Infinity) continue;
      for (let dj = -k; dj <= k; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= ny) continue;
        for (let di = -k; di <= k; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= nx) continue;
          const d = Math.hypot(di * pitch, dj * pitch);
          if (d > r) continue;
          const tip = ball ? s + Math.sqrt(r * r - d * d) - r : s;
          const cell = jj * nx + ii;
          if (tip > out[cell]) out[cell] = tip;
        }
      }
    }
  }
  return out;
}

export function rasterContour(o: RasterContourOptions): RasterContourResult {
  if (o.pitch <= 0) throw new Error('pitch must be positive');
  if (o.stepOver <= 0) throw new Error('stepOver must be positive');
  if (o.allowance < 0) throw new Error('allowance must not be negative');
  if (o.bottomZ >= o.topZ) throw new Error('the stock bottom is at/above the crown');
  if (o.positions.length < 9) {
    return { moves: [], rows: 0, estimatedMinutes: 0, maxPlunge: 0, warnings: [] };
  }

  // Grid: the model's XY extent grown by the tool radius (dilation spreads
  // the surface exactly that far) plus one pitch so the boundary kernel
  // footprint is sampled whole.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < o.positions.length; i += 3) {
    const x = o.positions[i];
    const y = o.positions[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const r = o.tool.diameter / 2;
  const pad = r + o.pitch;

  // Grid frame: u runs along the rows' cut direction, v advances row to
  // row. Rotation is about the ORIGIN (not the bbox center) so at α = 0
  // every mapping is x = u, y = v in exact IEEE754 arithmetic — angle 0
  // (and 360, and any multiple) reproduces the unrotated output
  // byte-identically. The extent is the machine bbox corners transformed
  // INTO the grid frame, grown by the same pad: at α = 0 that reduces to
  // the machine extent itself. The angle normalizes mod 360 BEFORE the
  // trig — sin(2π) is −2.4e−16, not 0, so 360 must land on 0 to keep the
  // identity arithmetic exact (negative angles come out legal: −90 ≡ 270).
  const aDeg = ((o.angleDeg ?? 0) % 360 + 360) % 360;
  const rad = (aDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  /** machine (x, y) → grid (u, v): the inverse of the emission mapping */
  const toU = (x: number, y: number) => x * cosA + y * sinA;
  const toV = (x: number, y: number) => -x * sinA + y * cosA;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [x, y] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as const) {
    const u = toU(x, y);
    const v = toV(x, y);
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  uMin -= pad;
  vMin -= pad;
  uMax += pad;
  vMax += pad;
  const nx = Math.floor((uMax - uMin) / o.pitch) + 1;
  const ny = Math.floor((vMax - vMin) / o.pitch) + 1;

  const raw = rawHeightmap(o.positions, uMin, vMin, nx, ny, o.pitch, cosA, sinA);
  const comp = dilate(raw, nx, ny, o.pitch, o.tool);

  // Serpentine rows: every stride-th grid row, alternating direction so
  // consecutive rows start on the side the last one finished.
  const stride = Math.max(1, Math.round(o.stepOver / o.pitch));
  const safeZ = o.topZ + o.safeClearance;
  const moves: Move[] = [];
  const warnings: string[] = [];
  let rows = 0;
  let minutes = 0;
  let maxPlunge = 0;
  let deepCells = 0;
  let clampedCells = 0;
  let rowFlip = false;

  /** Cut Z at a grid cell, or null when the cell is air / allowance-only:
   *  the compensated surface + allowance, clamped at the stock bottom.
   *  Air (no kernel contact anywhere: −Infinity) is air — never clamped
   *  to the bottom, which would mill the whole raster area flat. */
  const cutZ = (i: number, j: number): number | null => {
    const compZ = comp[j * nx + i];
    if (compZ === -Infinity) return null; // air: the tool reaches nothing
    const z = compZ + o.allowance;
    if (!(z < o.topZ - 1e-9)) return null; // air, or the allowance fills it
    if (z < o.bottomZ) {
      clampedCells++;
      return o.bottomZ;
    }
    return z;
  };

  for (let j = 0; j < ny; j += stride) {
    const v = vMin + j * o.pitch;
    const fwd = !rowFlip;
    rowFlip = !rowFlip;

    // segments: runs of consecutive cut cells, in travel order
    const segs: { i0: number; i1: number }[] = [];
    for (let n = 0; n < nx; n++) {
      const i = fwd ? n : nx - 1 - n;
      const isCut = cutZ(i, j) !== null;
      const last = segs.length - 1;
      if (isCut) {
        if (last >= 0 && segs[last].i1 === (fwd ? i - 1 : i + 1)) {
          segs[last].i1 = i; // extend the run
        } else {
          segs.push({ i0: i, i1: i });
        }
      }
    }
    if (segs.length === 0) continue;
    rows++;

    for (const { i0, i1 } of segs) {
      // the segment's polyline: start, z changes, and the far end — cells
      // whose z rides the last emitted move within Z_EMIT_TOL fold in.
      // Points live in grid u; the machine x AND y both derive from (u, v)
      // at emission, only here.
      const u0 = uMin + i0 * o.pitch;
      const u1 = uMin + i1 * o.pitch;
      const z0 = cutZ(i0, j)!;
      const pts: { u: number; z: number }[] = [{ u: u0, z: z0 }];
      const step = fwd ? 1 : -1;
      let lastZ = z0;
      for (let i = i0 + step; i !== i1 + step; i += step) {
        const z = cutZ(i, j);
        if (z === null) continue; // guarded by the run's construction
        if (Math.abs(z - lastZ) > Z_EMIT_TOL) {
          pts.push({ u: uMin + i * o.pitch, z });
          lastZ = z;
        }
      }
      if (pts[pts.length - 1].u !== u1) {
        pts.push({ u: u1, z: cutZ(i1, j)! });
      }

      // entry-safety convention (the pocket's): travel at height, descend
      // at the destination, feed the last approach stretch
      const x0 = u0 * cosA - v * sinA;
      const y0 = u0 * sinA + v * cosA;
      moves.push({
        words: { x: x0, y: y0 },
        feed: 0,
        rapid: true,
        comment: `raster row y${y0.toFixed(2)}`,
      });
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      const plunge = o.topZ - pts[0].z;
      if (plunge > maxPlunge) maxPlunge = plunge;
      if (plunge > DEEP_WARN_MM) deepCells++;
      moves.push({ words: { z: pts[0].z + APPROACH_CLEARANCE }, feed: 0, rapid: true });
      moves.push({
        words: { z: pts[0].z },
        feed: o.plungeFeed,
        comment: `plunge ${plunge.toFixed(2)}mm below surface`,
      });
      minutes += Math.min(APPROACH_CLEARANCE, Math.max(0, o.topZ - pts[0].z)) / o.plungeFeed;

      let px = x0;
      let py = y0;
      let pz = pts[0].z;
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k];
        const x = p.u * cosA - v * sinA;
        const y = p.u * sinA + v * cosA;
        const words: { x: number; y?: number; z?: number } = { x };
        // y drifts along an angled row; fold it under the same rounding
        // mercy as z (at α = 0 the drift is exactly 0 → modal, as today).
        // x stays on every feed move, as today.
        if (Math.abs(y - py) > Y_EMIT_TOL) words.y = y;
        if (Math.abs(p.z - pz) > 1e-9) words.z = p.z;
        moves.push({ words, feed: o.feed });
        minutes += Math.hypot(x - px, y - py, p.z - pz) / o.feed;
        px = x;
        py = y;
        pz = p.z;
      }
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    }
  }

  if (deepCells > 0) {
    warnings.push(
      `deepest plunge ${maxPlunge.toFixed(1)}mm below the crown — run a waterline ` +
        'contour first: this op assumes bulk stock is already cleared',
    );
  }
  if (clampedCells > 0) {
    warnings.push(
      `the model surface extends below the stock bottom — ${clampedCells} cell(s) finish flat there`,
    );
  }

  return { moves, rows, estimatedMinutes: minutes, maxPlunge, warnings };
}
