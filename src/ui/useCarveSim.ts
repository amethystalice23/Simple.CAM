/**
 * Carve-simulator client hook (PLAN: cutting simulator): worker
 * lifecycle, chunk-geometry accumulation, run state. v1 is
 * result-first — one `carve` through the whole job, progress + final
 * stats to the dialog; the worker protocol is time-agnostic so v2
 * playback is a client clock reusing the same messages.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Move, Stock, Tool } from '../core/types';
import type { ChunkMesh, SimResult, TipPose, WorkerMsg } from '../sim/protocol';

export interface SimProgress {
  move: number;
  totalMoves: number;
  removedVoxels: number;
}

export interface CarveSimState {
  running: boolean;
  /** worker build stamp (from `ready` — proves which code is running) */
  build: string | null;
  /** dims/pitch of the active grid (null before `ready`) */
  grid: { nx: number; ny: number; nz: number; pitch: number } | null;
  progress: SimProgress | null;
  result: SimResult | null;
  /** chunk id → chunk geometry (the Viewport builds meshes from these) */
  chunks: Map<number, ChunkMesh>;
  /** live tool-tip pose from the latest `progress` (material frame, the
   *  chunks' frame) — the Viewport's marker dot; cleared with the run */
  tip: TipPose | null;
}

export interface CarveSim {
  state: CarveSimState;
  /** post a playback control message to the LIVE worker under the CURRENT
   *  token (the transport's channel, 2026-10-27): `carve` re-sends just
   *  re-target (idempotent, self-driving), `reset` rebuilds the grid and
   *  re-posts the full stock. NEVER supersedes the token — the token
   *  supersede path (a new `run`) is what KILLS a worker. */
  send: (msg: { type: 'carve'; throughMove: number } | { type: 'reset' }) => void;
  /** kick off a run: builds the worker, sends setup + carve-to-end.
   *  moveStepDown (optional): per-move op step-down for the 3-class
   *  classification; omitted = one-pitch default everywhere. */
  run: (
    moves: Move[],
    toolOf: (moveIndex: number) => number,
    stock: Stock,
    tools: Tool[],
    pitch?: number,
    startZ?: number,
    moveStepDown?: Float32Array,
  ) => void;
  /** stop the worker and drop the overlay (the Clear button) */
  dispose: () => void;
}

export function useCarveSim(): CarveSim {
  const [state, setState] = useState<CarveSimState>({
    running: false,
    build: null,
    grid: null,
    progress: null,
    result: null,
    chunks: new Map(),
    tip: null,
  });
  const workerRef = useRef<Worker | null>(null);
  const tokenRef = useRef(0);
  /** the transport's re-target channel: always the CURRENT worker + token
   *  (a ref, so callers can hold the function across renders) */
  const send = useCallback(
    (msg: { type: 'carve'; throughMove: number } | { type: 'reset' }) => {
      workerRef.current?.postMessage({ ...msg, token: tokenRef.current });
    },
    [],
  );

  const dispose = useCallback(() => {
    workerRef.current?.postMessage({ type: 'dispose' });
    workerRef.current?.terminate();
    workerRef.current = null;
    // clear the overlay chunks too — dispose is also "clear the sim"
    setState((s) => ({ ...s, running: false, build: null, progress: null, result: null, chunks: new Map(), tip: null }));
  }, []);

  // tear down on unmount
  useEffect(() => dispose, [dispose]);

  const run = useCallback(
    (
      moves: Move[],
      toolOf: (moveIndex: number) => number,
      stock: Stock,
      tools: Tool[],
      pitch?: number,
      startZ?: number,
      moveStepDown?: Float32Array,
    ) => {
      workerRef.current?.terminate();
      const worker = new Worker(new URL('../sim/carveWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      const token = ++tokenRef.current;
      const moveTool = new Uint16Array(moves.length);
      for (let i = 0; i < moves.length; i++) moveTool[i] = toolOf(i);
      worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.token !== token) return;
        if (msg.type === 'ready') {
          setState((s) => ({
            ...s,
            running: true,
            build: msg.build,
            grid: { nx: msg.nx, ny: msg.ny, nz: msg.nz, pitch: msg.pitch },
            progress: { move: 0, totalMoves: msg.totalMoves, removedVoxels: 0 },
            result: null,
            chunks: new Map(),
            tip: null,
          }));
          // v1 result-first: carve the whole job in one command
          worker.postMessage({ type: 'carve', throughMove: Number.MAX_SAFE_INTEGER, token });
        } else if (msg.type === 'chunk') {
          setState((s) => {
            const chunks = new Map(s.chunks);
            chunks.set(msg.chunk.id, msg.chunk);
            return { ...s, chunks };
          });
        } else if (msg.type === 'chunks') {
          // the worker batches remeshed chunks per slice — ONE state update
          // (one map copy + one effect run) per batch, not per chunk
          setState((s) => {
            const chunks = new Map(s.chunks);
            for (const c of msg.chunks) chunks.set(c.id, c);
            return { ...s, chunks };
          });
        } else if (msg.type === 'progress') {
          setState((s) => ({
            ...s,
            progress: { move: msg.move, totalMoves: msg.totalMoves, removedVoxels: msg.removedVoxels },
            tip: msg.tip ?? null,
          }));
        } else if (msg.type === 'done') {
          // the marker reads only while a run is in flight — done hides it
          setState((s) => ({ ...s, running: false, result: msg.result, tip: null }));
          // v1 terminated the worker here; playback (2026-10-27) needs it
          // ALIVE after the run — return-to-start / scrub-behind post
          // `reset` + `carve` to re-carve (voxels cannot un-carve). The
          // worker now sits parked between runs; dispose (Clear / new
          // job / model drop — the existing lifecycle coupling) tears it
          // down, and a new run replaces it.
        }
      };
      worker.postMessage({ type: 'setup', setup: { stock, tools, moves, moveTool, pitch, startZ, moveStepDown }, token });
    },
    [],
  );

  return { state, send, run, dispose };
}
