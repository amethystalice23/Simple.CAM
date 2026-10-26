/**
 * Greedy voxel mesher, per 32³ chunk (src/sim — pure core). Classic
 * algorithm: for each of the 6 axis directions, sweep slice masks of
 * solid-vs-void faces across the chunk's cell range and merge coplanar
 * runs into maximal rectangles — one quad per rectangle. Neighbor reads
 * go through the GLOBAL grid (no aprons).
 *
 * Face ownership: each face is emitted by the chunk that owns its SOLID
 * cell, exactly once — sweep plane p runs over [chunkLo(d), chunkHi(d)]
 * inclusive with a = cell p−1, b = cell p, mask = solid(a) − solid(b);
 * m > 0 (a solid) emits only when p > lo, m < 0 (b solid) only when
 * p < hi. So a face on a chunk border whose solid neighbor lives in the
 * adjacent chunk is culled there (no double emission) and the border face
 * of an owned boundary cell is still emitted (no holes at grid edges —
 * cells outside the grid read as void).
 *
 * Fully-carved chunks produce empty geometry (valid). Positions are
 * cell-CORNER coords in machine/world space (origin + cellIndex·pitch);
 * vertices are per-quad corners (duplicates fine, no dedup), indices two
 * CCW-outward triangles per quad, normals per quad face direction.
 */

import type { VoxelGrid } from './grid';

/** one dirty chunk's remeshed geometry (matches protocol.ChunkMesh's shape;
 *  defined here because the pinned protocol does not export the type) */
export interface ChunkGeom {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** ghost (classification) overlay geometry for one chunk: one cube per
 *  marked voxel with a per-vertex RGBA color (yellow gouge / red collision) */
export interface GhostGeom {
  positions: Float32Array;
  normals: Float32Array;
  colors: Uint8Array;
  indices: Uint32Array;
}

/** ghost colors (rgba 0–255): yellow = wrongly removed (TRANSLUCENT —
 * Alice's 2026-10-26 ask: those voxels are gone, the cube is a ghost of
 * material that was removed, just not intentionally), red = shank contact
 * (still solid — stays strong so it reads as a hit on the surface) */
const GHOST_YELLOW: [number, number, number, number] = [255, 200, 0, 115];
const GHOST_RED: [number, number, number, number] = [255, 32, 32, 230];

/**
 * Mesh the chunk's GHOST array (Alice's 3-class marking): every marked
 * voxel emits boundary faces with a per-vertex RGBA color attribute — a
 * classification overlay drawn over the solid mesh (yellow = material
 * wrongly removed, now void; red = shank contact that stays solid, drawn
 * only on its void-exposed faces so it hugs the surface). Two passes:
 * count faces, then fill exact-size arrays. Adjacent same-color ghosts are
 * not merged (v1: ghost cells are rare relative to solid faces).
 */
export function ghostMeshChunk(grid: VoxelGrid, chunkId: number): GhostGeom {
  const [x0, y0, z0, x1, y1, z1] = grid.chunkBounds(chunkId);
  const { nx, ny, pitch } = grid;

  // which ghosts draw, and which of their 6 faces are visible
  const ghostOf = (i: number, j: number, k: number): number => {
    if (i < 0 || j < 0 || k < 0 || i >= grid.nx || j >= grid.ny || k >= grid.nz) return 0;
    return grid.ghost[i + nx * (j + ny * k)];
  };
  const draws = (i: number, j: number, k: number): boolean => {
    const g = ghostOf(i, j, k);
    if (g === 0) return false;
    if (g === 2) return true; // red: surface-exposed faces of solid contact
    return !grid.filled(i, j, k); // yellow: removed (void) — free-standing cube
  };
  const faceVisible = (i: number, j: number, k: number, di: number, dj: number, dk: number): boolean => {
    if (ghostOf(i, j, k) !== 2) return true; // yellow cubes: every face
    return !grid.filled(i + di, j + dj, k + dk); // red: only void-exposed
  };

  // pass 1 — count visible faces
  let faces = 0;
  for (let k = z0; k < z1; k++)
    for (let j = y0; j < y1; j++)
      for (let i = x0; i < x1; i++) {
        if (!draws(i, j, k)) continue;
        for (const [di, dj, dk] of FACE_DIRS) if (faceVisible(i, j, k, di, dj, dk)) faces++;
      }

  const positions = new Float32Array(faces * 12);
  const normals = new Float32Array(faces * 12);
  const colors = new Uint8Array(faces * 16); // RGBA per vertex
  const indices = new Uint32Array(faces * 6);

  // pass 2 — fill (per-face CCW corner walk: c00→c10→c11→c01)
  let quad = 0;
  const put = (pv: number, cv: number, v: number[], n: number[], col: readonly number[]) => {
    positions[pv] = v[0];
    positions[pv + 1] = v[1];
    positions[pv + 2] = v[2];
    normals[pv] = n[0];
    normals[pv + 1] = n[1];
    normals[pv + 2] = n[2];
    colors[cv] = col[0];
    colors[cv + 1] = col[1];
    colors[cv + 2] = col[2];
    colors[cv + 3] = col[3]; // per-vertex alpha: yellow ghosts translucent
  };
  for (let k = z0; k < z1; k++)
    for (let j = y0; j < y1; j++)
      for (let i = x0; i < x1; i++) {
        const g = ghostOf(i, j, k);
        if (g === 0) continue;
        if (g === 1 && grid.filled(i, j, k)) continue;
        const col = g === 2 ? GHOST_RED : GHOST_YELLOW;
        const wx = grid.originX + i * pitch;
        const wy = grid.originY + j * pitch;
        const wz = grid.originZ + k * pitch;
        const p = pitch;
        for (let f = 0; f < 6; f++) {
          const [di, dj, dk, n] = FACE_DIRS[f];
          if (!faceVisible(i, j, k, di, dj, dk)) continue;
          // corners of the face on the +d side of the cell
          const corners = GHOST_FACE_CORNERS[f];
          const pv = quad * 12;
          const cv = quad * 16;
          for (let c = 0; c < 4; c++) {
            const o = corners[c];
            put(pv + c * 3, cv + c * 4, [wx + o[0] * p, wy + o[1] * p, wz + o[2] * p], n, col);
          }
          const bv = quad * 4;
          const iv = quad * 6;
          indices[iv] = bv;
          indices[iv + 1] = bv + 1;
          indices[iv + 2] = bv + 2;
          indices[iv + 3] = bv;
          indices[iv + 4] = bv + 2;
          indices[iv + 5] = bv + 3;
          quad++;
        }
      }
  return { positions, normals, colors, indices };
}

/** the 6 axis directions with outward normals: [di, dj, dk, normal] */
const FACE_DIRS: [number, number, number, [number, number, number]][] = [
  [1, 0, 0, [1, 0, 0]],
  [-1, 0, 0, [-1, 0, 0]],
  [0, 1, 0, [0, 1, 0]],
  [0, -1, 0, [0, -1, 0]],
  [0, 0, 1, [0, 0, 1]],
  [0, 0, -1, [0, 0, -1]],
];

/** per-face corner offsets from the cell min corner, CCW seen from outside,
 *  matching FACE_DIRS order */
const GHOST_FACE_CORNERS: [number, number, number][][] = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], // +X
  [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]], // −X
  [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], // +Y
  [[1, 0, 0], [0, 0, 0], [0, 0, 1], [1, 0, 1]], // −Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
  [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]], // −Z
];

interface Quad {
  /** 4 corner positions, world space, CCW seen from the normal side */
  corners: [number, number, number][];
  normal: [number, number, number];
}

export function greedyMeshChunk(grid: VoxelGrid, chunkId: number): ChunkGeom {
  const [x0, y0, z0, x1, y1, z1] = grid.chunkBounds(chunkId);
  const quads: Quad[] = [];

  // d = sweep axis, (u, v) = (d+1)%3, (d+2)%3 so (d, u, v) is a
  // right-handed cycle — corner walk c00→c10→c11→c01 winds CCW from +d
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const lo = [x0, y0, z0][d];
    const hi = [x1, y1, z1][d];
    const uStart = [x0, y0, z0][u];
    const vStart = [x0, y0, z0][v];
    const uEnd = [x1, y1, z1][u];
    const vEnd = [x1, y1, z1][v];
    const du = uEnd - uStart;
    const dv = vEnd - vStart;
    if (du <= 0 || dv <= 0) continue;
    const mask = new Int8Array(du * dv);

    // planes p = lo..hi inclusive: face plane between cell p−1 and cell p
    for (let p = lo; p <= hi; p++) {
      let n = 0;
      for (let yv = vStart; yv < vEnd; yv++) {
        for (let xu = uStart; xu < uEnd; xu++, n++) {
          const a = solidAt(grid, d, u, v, p - 1, xu, yv);
          const b = solidAt(grid, d, u, v, p, xu, yv);
          mask[n] = (a ? 1 : 0) - (b ? 1 : 0);
        }
      }

      // greedy merge into maximal rectangles
      for (let jv = 0; jv < dv; jv++) {
        for (let iu = 0; iu < du; ) {
          const m = mask[jv * du + iu];
          if (m === 0) {
            iu++;
            continue;
          }
          if ((m > 0 && p === lo) || (m < 0 && p === hi)) {
            // solid cell outside this chunk — its other chunk emits the face
            iu++;
            continue;
          }
          // width: run of the same value along u
          let w = 1;
          while (iu + w < du && mask[jv * du + iu + w] === m) w++;
          // height: identical full-width rows along v
          let h = 1;
          outer: while (jv + h < dv) {
            for (let k = 0; k < w; k++) {
              if (mask[(jv + h) * du + iu + k] !== m) break outer;
            }
            h++;
          }
          emitQuad(quads, grid, d, u, v, m, p, uStart + iu, vStart + jv, w, h);
          for (let hv = 0; hv < h; hv++) {
            for (let k = 0; k < w; k++) mask[(jv + hv) * du + iu + k] = 0;
          }
          iu += w;
        }
      }
    }
  }

  return geomFromQuads(quads);
}

/** grid.filled for the cell with coord `pd` along axis d, (xu, yv) along u, v */
function solidAt(
  grid: VoxelGrid,
  d: number,
  u: number,
  v: number,
  pd: number,
  xu: number,
  yv: number,
): boolean {
  const c = [0, 0, 0];
  c[d] = pd;
  c[u] = xu;
  c[v] = yv;
  return grid.filled(c[0], c[1], c[2]);
}

function emitQuad(
  quads: Quad[],
  grid: VoxelGrid,
  d: number,
  u: number,
  v: number,
  m: number,
  p: number,
  xu: number,
  xv: number,
  w: number,
  h: number,
): void {
  const pch = grid.pitch;
  const o = [grid.originX, grid.originY, grid.originZ];
  // the face plane sits at cell coord p along d, spanning [xu, xu+w) × [xv, xv+h)
  const base = [o[0], o[1], o[2]];
  base[d] += p * pch;
  base[u] += xu * pch;
  base[v] += xv * pch;

  const at = (uu: number, vv: number): [number, number, number] => {
    const c = [base[0], base[1], base[2]];
    c[u] += uu * pch;
    c[v] += vv * pch;
    return [c[0], c[1], c[2]];
  };
  const c00 = at(0, 0);
  const c10 = at(w, 0);
  const c11 = at(w, h);
  const c01 = at(0, h);

  const nrm: [number, number, number] = [0, 0, 0];
  nrm[d] = m > 0 ? 1 : -1;

  // (d, u, v) right-handed: +d face winds CCW as c00→c10→c11→c01; reverse for −d
  if (m > 0) quads.push({ corners: [c00, c10, c11, c01], normal: nrm });
  else quads.push({ corners: [c00, c01, c11, c10], normal: nrm });
}

function geomFromQuads(quads: Quad[]): ChunkGeom {
  const positions = new Float32Array(quads.length * 12);
  const normals = new Float32Array(quads.length * 12);
  const indices = new Uint32Array(quads.length * 6);
  let pv = 0;
  let iv = 0;
  for (let q = 0; q < quads.length; q++) {
    const { corners, normal } = quads[q];
    for (let c = 0; c < 4; c++) {
      positions[pv] = corners[c][0];
      positions[pv + 1] = corners[c][1];
      positions[pv + 2] = corners[c][2];
      normals[pv] = normal[0];
      normals[pv + 1] = normal[1];
      normals[pv + 2] = normal[2];
      pv += 3;
    }
    const b = q * 4;
    indices[iv] = b;
    indices[iv + 1] = b + 1;
    indices[iv + 2] = b + 2;
    indices[iv + 3] = b;
    indices[iv + 4] = b + 2;
    indices[iv + 5] = b + 3;
    iv += 6;
  }
  return { positions, normals, indices };
}
