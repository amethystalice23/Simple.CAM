/**
 * React binding for the generation worker (src/ui/genWorker.ts): owns the
 * worker lifecycle, the model seed, and the request bookkeeping. The
 * seed rides the model's geometry IDENTITY — a new model (load/drop)
 * tears the worker down and re-clones positions once; the same model
 * across recalc passes reuses the worker untouched.
 *
 * Cancellation model: every recalc pass opens with `beginPass()`, which
 * bumps the token and — when a previous pass still has work in flight —
 * TERMINATES the worker (rejecting its pending requests as CANCELLED) so
 * a fresh recalc never queues behind a long raster. The pass then checks
 * `currentToken()` between ops and bails if it was superseded.
 */

import { useCallback, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { GenPayload, GenWorkerMsg } from './genWorkerProtocol';
import { seedPositions } from './genWorkerProtocol';
import type { GeneratedOp } from './jobGeneration';

export const GEN_CANCELLED = 'superseded';

export interface GenWorkerApi {
  /** open a recalc pass: bumps the token; kills an in-flight worker if
   * one is busy. Returns the pass's token. */
  beginPass(): number;
  currentToken(): number;
  generate(geometry: THREE.BufferGeometry, payload: Omit<GenPayload, 'id'>): Promise<GeneratedOp>;
}

export function useGenWorker(): GenWorkerApi {
  const workerRef = useRef<Worker | null>(null);
  const seededRef = useRef<THREE.BufferGeometry | null>(null);
  const pendingRef = useRef(
    new Map<number, { resolve: (r: GeneratedOp) => void; reject: (e: unknown) => void }>(),
  );
  const idRef = useRef(0);
  const tokenRef = useRef(0);
  const busyRef = useRef(false);

  const rejectAll = useCallback((reason: string) => {
    for (const p of pendingRef.current.values()) p.reject(new Error(reason));
    pendingRef.current.clear();
    busyRef.current = false;
  }, []);

  const teardown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    seededRef.current = null;
    rejectAll(GEN_CANCELLED);
  }, [rejectAll]);

  // tear down on unmount
  useEffect(() => teardown, [teardown]);

  const attach = useCallback(
    (worker: Worker) => {
      worker.onmessage = (e: MessageEvent<GenWorkerMsg>) => {
        const msg = e.data;
        if (msg.type !== 'result') return;
        const p = pendingRef.current.get(msg.id);
        if (!p) return;
        pendingRef.current.delete(msg.id);
        if (pendingRef.current.size === 0) busyRef.current = false;
        p.resolve(msg.result);
      };
      worker.onerror = (e) => {
        // a broken worker (load failure, runtime exception) must fail the
        // pending requests, not hang them
        rejectAll(`generation worker failed: ${e.message || 'unknown error'}`);
      };
    },
    [rejectAll],
  );

  const beginPass = useCallback(() => {
    tokenRef.current++;
    if (busyRef.current) teardown();
    return tokenRef.current;
  }, [teardown]);

  const generate = useCallback(
    (geometry: THREE.BufferGeometry, payload: Omit<GenPayload, 'id'>) => {
      if (workerRef.current && seededRef.current !== geometry) {
        // a different model: the old worker's results belong to it —
        // rebuild the worker and the seed
        teardown();
      }
      if (!workerRef.current) {
        const worker = new Worker(new URL('./genWorker.ts', import.meta.url), {
          type: 'module',
        });
        attach(worker);
        workerRef.current = worker;
        seededRef.current = geometry;
        worker.postMessage({ type: 'seed', seed: { positions: seedPositions(geometry) } });
      }
      const id = ++idRef.current;
      busyRef.current = true;
      workerRef.current.postMessage({ type: 'generate', id, ...payload });
      return new Promise<GeneratedOp>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
      });
    },
    [attach, teardown],
  );

  return {
    beginPass,
    currentToken: () => tokenRef.current,
    generate,
  };
}