/**
 * Carve-simulator worker protocol (PLAN: cutting simulator). The ONLY file
 * shared by the worker shell, the pure core, and the React UI — pinned
 * contract; both sides import from here, nothing defines message shapes
 * inline. The worker is TIME-AGNOSTIC: it speaks move indices, never
 * timestamps (v2 playback = a client-side clock over the same messages).
 *
 * Every message after `setup` carries the current generation `token`;
 * the worker ignores stale-token messages, so a re-run while carving just
 * bumps the token instead of cancelling in-flight work.
 */

import type { Move, Stock, Tool } from '../core/types';

export interface SimSetup {
  stock: Stock;
  /** tool table — `moveTool[i]` indexes into this */
  tools: Tool[];
  /** the merged job move stream (previewMoves), op-stamped as exported */
  moves: Move[];
  /** per move: index into `tools` (which tool cuts it); 0xFFFF = none
   *  (laser moves carry no carving tool) */
  moveTool: Uint16Array;
  /** voxel pitch override, mm — undefined = derive from the stock size */
  pitch?: number;
  /** machine Z at job start (stockTopZ(stock) — the pose stream seeds its
   *  modal Z here as the tool-change park: crown + clearance; a fabricated
   *  0 start would phantom-gouge the first rapid through the stock) */
  startZ?: number;
  /** per move: the owning op's step-down in mm (drill → peckDepth);
   *  0 / absent = default (one voxel pitch — a finish pass may skin one
   *  cell). Drives the sim's 3-class removal classification. */
  moveStepDown?: Float32Array;
}

export type ClientMsg =
  | { type: 'setup'; setup: SimSetup; token: number }
  | { type: 'carve'; throughMove: number; token: number }
  | { type: 'reset'; token: number }
  | { type: 'dispose' };

/** one dirty chunk's remeshed geometry (transferables once posted). The
 *  ghost arrays (when non-empty) mesh the classification overlay: yellow
 *  gouge / red shank-contact voxels, per-vertex rgb colors 0–255. */
export interface ChunkMesh {
  /** chunk id = cx + cy * chunkX + cz * chunkX * chunkY */
  id: number;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  ghostPositions?: Float32Array;
  ghostNormals?: Float32Array;
  ghostColors?: Uint8Array;
  ghostIndices?: Uint32Array;
}

export interface SimResult {
  removedVoxels: number;
  /** rapid poses that removed material — bad clearance somewhere */
  gougeCount: number;
  firstGougeMove: number | null;
  /** moves skipped because their tool is the laser (v1: no burn model) */
  laserSkipped: number;
  carveSeconds: number;
  /** voxels removed beyond the op's step-down of the standing surface (or
   *  by a rapid) — the yellow class (Alice's 3-class spec) */
  gougeVoxels: number;
  /** distinct moves whose shank contacted standing material — red class */
  collisionMoves: number;
  /** first move with a shank contact */
  firstCollisionMove: number | null;
}

export type WorkerMsg =
  | { type: 'ready'; token: number; build: string; nx: number; ny: number; nz: number; pitch: number; originX: number; originY: number; originZ: number; chunkX: number; chunkY: number; chunkZ: number; totalMoves: number }
  | { type: 'chunk'; token: number; chunk: ChunkMesh }
  | { type: 'progress'; token: number; move: number; totalMoves: number; removedVoxels: number }
  | { type: 'done'; token: number; result: SimResult };
