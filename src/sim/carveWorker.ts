/**
 * Carve-simulator worker shell (PLAN: cutting simulator) — the app's
 * FIRST Web Worker (the pilot for PLAN.md's pure-core/thin-shell
 * charter: all math lives in pure modules under src/sim, this file only
 * orchestrates). Owns the VoxelGrid; carves pose slices cooperatively
 * (~8ms per slice, yielding between slices so control messages are
 * never starved); re-meshes dirty 32³ chunks and posts transferable
 * geometry + progress.
 *
 * Time-agnostic: it speaks move indices (src/sim/protocol.ts), never
 * timestamps — v2 playback = a client clock over the same messages.
 * `carve` ARMS a target move and self-drives to it; the client sends it
 * once per run (re-sends just re-target, idempotent for the same target).
 */

import type { ChunkMesh, ClientMsg, WorkerMsg } from './protocol';
import { VoxelGrid } from './grid';
import { buildToolSpec, type ToolSpec } from './toolShape';
import { movesToPoses, type Pose } from './poses';
import { carvePoses, emptyStats, type CarveStats } from './carve';
import { greedyMeshChunk, ghostMeshChunk } from './mesher';
import { derivePitch } from './pitch';
import type { Stock, Tool } from '../core/types';

/** build stamp — the `ready` message carries it so the client can PROVE
 *  which worker version is running (the 2026-10-25 gaps debugging: a
 *  stale dev-server worker copy was a live suspect) */
const SIM_BUILD = 'b8-flush-budget';

/** cooperative-slice budget, ms — carving AND mesh flushing each stay
 *  within one of these per slice so neither starves the message queue
 *  (the 2026-10-26 coupon crawl: unbounded per-slice remeshing of a
 *  576-chunk grid) */
const SLICE_MS = 8;
/** chunks per batched `chunks` message (each ~4ms to mesh on a 32³ grid —
 *  the budget loop checks between batches) */
const CHUNK_BATCH = 32;

interface RunState {
  token: number;
  grid: VoxelGrid;
  specs: (ToolSpec | null)[];
  /** flat pose stream — carved up to `cursor` */
  poses: Pose[];
  cursor: number;
  /** armed target: carve poses with moveIndex ≤ target, then done */
  target: number;
  stats: CarveStats;
  /** per-move step-down (the owning op's stepDown / peckDepth) for the
   *  3-class classification; undefined = all defaults (one voxel pitch) */
  moveStepDown: Float32Array | undefined;
  startSeconds: number;
  /** the pending self-drive timer (null between runs) */
  timer: ReturnType<typeof setTimeout> | null;
  /** for `reset`: rebuild the grid from these */
  setup: { stock: Stock; pitch: number; moveStepDown: Float32Array | undefined };
}

let run: RunState | null = null;

const post = (msg: WorkerMsg, transfer: Transferable[] = []) =>
  // DOM lib types postMessage(message, targetOrigin) — the worker's
  // (message, transfer[]) form matches the runtime; options overload is
  // the closest declared signature
  self.postMessage(msg, { transfer });
/** mesh ONE dirty chunk (clearing its flag) into a message payload + its
 * transferables; the classification ghosts (yellow/red) ride along */
function meshChunk(r: RunState, id: number): { chunk: ChunkMesh; transfer: Transferable[] } {
  const geom = greedyMeshChunk(r.grid, id);
  const ghost = ghostMeshChunk(r.grid, id);
  r.grid.clearChunkDirty(id);
  const hasGhost = ghost.indices.length > 0;
  const transfer: Transferable[] = [geom.positions.buffer, geom.normals.buffer, geom.indices.buffer];
  if (hasGhost) {
    transfer.push(
      ghost.positions.buffer,
      ghost.normals.buffer,
      ghost.colors.buffer,
      ghost.indices.buffer,
    );
  }
  return {
    chunk: {
      id,
      positions: geom.positions,
      normals: geom.normals,
      indices: geom.indices,
      ...(hasGhost
        ? {
            ghostPositions: ghost.positions,
            ghostNormals: ghost.normals,
            ghostColors: ghost.colors,
            ghostIndices: ghost.indices,
          }
        : {}),
    },
    transfer,
  };
}

/** post a batch of pre-meshed chunks in ONE message — one post per dirty
 * chunk per slice drowned the main thread in per-message map copies and
 * effect runs (the 2026-10-26 coupon crawl) */
function postChunks(r: RunState, batch: { chunk: ChunkMesh; transfer: Transferable[] }[]) {
  if (batch.length === 0) return;
  const chunks: ChunkMesh[] = batch.map((b) => b.chunk);
  const transfer: Transferable[] = batch.flatMap((b) => b.transfer);
  post({ token: r.token, type: 'chunks', chunks }, transfer);
}

/** re-mesh dirty chunks within a meshing budget, checked PER CHUNK — the
 * v1 budget checked between whole 32-chunk batches, so each 8ms carve
 * slice still paid a ~130ms meshing burst and the coupon's 12s carve
 * became minutes. Whatever doesn't fit stays dirty for a later slice;
 * the visual stream lags a little, the message queue never starves.
 * Returns the chunks still pending. */
function flushChunks(r: RunState, budgetMs: number): number {
  const ids = r.grid.dirtyChunkIds();
  const t0 = performance.now();
  let batch: { chunk: ChunkMesh; transfer: Transferable[] }[] = [];
  let i = 0;
  for (; i < ids.length; i++) {
    batch.push(meshChunk(r, ids[i]));
    if (batch.length >= CHUNK_BATCH) {
      postChunks(r, batch);
      batch = [];
    }
    if (performance.now() - t0 > budgetMs) break;
  }
  postChunks(r, batch);
  return ids.length - i;
}

/** one cooperative slice: ≤ SLICE_MS of carving, then a budgeted flush */
function slice(r: RunState) {
  const t0 = performance.now();
  while (r.cursor < r.poses.length) {
    const p = r.poses[r.cursor];
    if (p.moveIndex > r.target) break;
    carvePoses(r.grid, r.specs, [p], r.stats, r.moveStepDown);
    r.cursor++;
    if (performance.now() - t0 > SLICE_MS) break;
  }
  const pending = flushChunks(r, SLICE_MS);
  const total = r.poses.length ? r.poses[r.poses.length - 1].moveIndex + 1 : 0;
  const atEnd = r.cursor >= r.poses.length;
  post({
    type: 'progress',
    token: r.token,
    move: atEnd ? total : (r.poses[r.cursor]?.moveIndex ?? 0),
    totalMoves: total,
    removedVoxels: r.stats.removed,
  });
  if (atEnd && pending === 0) {
    post({
      type: 'done',
      token: r.token,
      result: {
        removedVoxels: r.stats.removed,
        gougeCount: r.stats.gouges,
        firstGougeMove: r.stats.firstGougeMove,
        laserSkipped: r.stats.laserSkipped,
        carveSeconds: performance.now() / 1000 - r.startSeconds,
        gougeVoxels: r.stats.gougedVoxels,
        collisionMoves: r.stats.collisions,
        firstCollisionMove: r.stats.firstCollisionMove,
      },
    });
    r.timer = null;
    return;
  }
  // yield the message queue, then keep going (a new setup/carve meanwhile
  // re-targets or replaces the run; the timer is cleared there)
  r.timer = setTimeout(() => slice(r), 0);
}

function stopTimer(r: RunState | null) {
  if (r?.timer) clearTimeout(r.timer);
}

self.onmessage = (e: MessageEvent<ClientMsg>) => {
  const msg = e.data;
  if (msg.type === 'dispose') {
    stopTimer(run);
    self.close();
    return;
  }
  if (run && msg.token !== run.token) return; // stale generation
  if (msg.type === 'setup') {
    stopTimer(run);
    const { stock, tools, moves, moveTool, pitch, startZ, moveStepDown } = msg.setup;
    const grid = new VoxelGrid(stock, pitch ?? derivePitch(stock));
    const specs = tools.map((t: Tool) => {
      try {
        return buildToolSpec(t);
      } catch {
        return null; // laser etc — its poses carve nothing
      }
    });
    const poses = movesToPoses(
      moves,
      stock,
      (mi: number) => moveTool[mi] ?? 0xffff,
      grid.pitch,
      startZ,
    );
    const pitchUsed = grid.pitch;
    run = {
      token: msg.token,
      grid,
      specs,
      poses,
      cursor: 0,
      target: -1,
      stats: emptyStats(),
      moveStepDown,
      startSeconds: performance.now() / 1000,
      timer: null,
      setup: { stock, pitch: pitchUsed, moveStepDown },
    };
    post({
      type: 'ready',
      build: SIM_BUILD,
      token: run.token,
      nx: grid.nx,
      ny: grid.ny,
      nz: grid.nz,
      pitch: grid.pitch,
      originX: grid.originX,
      originY: grid.originY,
      originZ: grid.originZ,
      chunkX: grid.chunkX,
      chunkY: grid.chunkY,
      chunkZ: grid.chunkZ,
      totalMoves: moves.length,
    });
    // post the FULL un-carved stock mesh up front: the display shows the
    // whole remaining stock, and carve updates replace chunks as they're
    // touched. Without this, only tool-touched chunks render and untouched
    // material is missing from the display entirely (the "gaps" regression
    // — the grid was always right; the POSTED chunk set wasn't). Batched —
    // a 576-chunk grid as ~9 messages, not 576.
    {
      let batch: { chunk: ChunkMesh; transfer: Transferable[] }[] = [];
      for (const id of allChunkIds(grid)) {
        batch.push(meshChunk(run, id));
        if (batch.length >= 64) {
          postChunks(run, batch);
          batch = [];
        }
      }
      postChunks(run, batch);
    }
    return;
  }
  if (!run) return;
  if (msg.type === 'carve') {
    run.target = msg.throughMove;
    if (!run.timer) run.timer = setTimeout(() => slice(run!), 0);
    return;
  }
  if (msg.type === 'reset') {
    stopTimer(run);
    // rebuild from the saved setup — the grid has no refill (a fresh
    // VoxelGrid IS the refill; stock shapes are cheap to re-fill, and a
    // fresh grid also zeroes the ghost classification)
    const grid = new VoxelGrid(run.setup.stock, run.setup.pitch);
    run.grid = grid;
    run.cursor = 0;
    run.target = -1;
    run.stats = emptyStats();
    run.startSeconds = performance.now() / 1000;
    // the full stock re-posts (every chunk, batched)
    {
      let batch: { chunk: ChunkMesh; transfer: Transferable[] }[] = [];
      for (const id of allChunkIds(grid)) {
        batch.push(meshChunk(run, id));
        if (batch.length >= 64) {
          postChunks(run, batch);
          batch = [];
        }
      }
      postChunks(run, batch);
    }
  }
};

/** every chunk id of a grid, in id order (chunk id = cx + cy·chunkX + cz·chunkX·chunkY) */
function allChunkIds(grid: VoxelGrid): number[] {
  const ids: number[] = [];
  for (let cz = 0; cz < grid.chunkZ; cz++)
    for (let cy = 0; cy < grid.chunkY; cy++)
      for (let cx = 0; cx < grid.chunkX; cx++)
        ids.push(cx + cy * grid.chunkX + cz * grid.chunkX * grid.chunkY);
  return ids;
}

/** derived default pitch lives in ./pitch (shared with the UI display) */
