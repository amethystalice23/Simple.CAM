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

import type { ClientMsg, WorkerMsg } from './protocol';
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
const SIM_BUILD = 'b6-quadrants';

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
  self.postMessage(msg, { transfer });/** mesh a chunk and post it (shared by full-mesh dumps and dirty flushes);
 *  the chunk's classification ghosts (yellow/red) ride along */
function postChunk(r: RunState, id: number) {
  const geom = greedyMeshChunk(r.grid, id);
  const ghost = ghostMeshChunk(r.grid, id);
  r.grid.clearChunkDirty(id);
  const hasGhost = ghost.indices.length > 0;
  post(
    {
      token: r.token,
      type: 'chunk',
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
    },
    hasGhost
      ? [
          geom.positions.buffer,
          geom.normals.buffer,
          geom.indices.buffer,
          ghost.positions.buffer,
          ghost.normals.buffer,
          ghost.colors.buffer,
          ghost.indices.buffer,
        ]
      : [geom.positions.buffer, geom.normals.buffer, geom.indices.buffer],
  );
}

/** re-mesh every dirty chunk (carve updates) */
function flushChunks(r: RunState) {
  for (const id of r.grid.dirtyChunkIds()) postChunk(r, id);
}

/** one cooperative slice: ≤ ~8ms of carving, then flush + progress */
function slice(r: RunState) {
  const t0 = performance.now();
  while (r.cursor < r.poses.length) {
    const p = r.poses[r.cursor];
    if (p.moveIndex > r.target) break;
    carvePoses(r.grid, r.specs, [p], r.stats, r.moveStepDown);
    r.cursor++;
    if (performance.now() - t0 > 8) break;
  }
  flushChunks(r);
  const total = r.poses.length ? r.poses[r.poses.length - 1].moveIndex + 1 : 0;
  const atEnd = r.cursor >= r.poses.length;
  post({
    type: 'progress',
    token: r.token,
    move: atEnd ? total : (r.poses[r.cursor]?.moveIndex ?? 0),
    totalMoves: total,
    removedVoxels: r.stats.removed,
  });
  if (atEnd) {
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
    // — the grid was always right; the POSTED chunk set wasn't).
    for (const id of allChunkIds(grid)) postChunk(run, id);
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
    // the full stock re-posts (every chunk)
    for (const id of allChunkIds(grid)) postChunk(run, id);
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
