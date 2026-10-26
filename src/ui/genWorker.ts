/**
 * Generation-worker shell (PLAN.md "Architecture rules: the Web Worker
 * is a thin shell"): owns the seeded model and nothing else — every op
 * runs through the SAME pure generateJobOp the main thread uses, so
 * vitest covers the math and this file only moves messages. The heavy
 * op kinds (whole-mesh slicing / raycast grids) arrive here one at a
 * time; the client routes light ops inline and never posts them.
 */

import * as THREE from 'three';
import { buildWorkerGenContext } from './genWorkerContext';
import type { GenClientMsg, GenWorkerMsg } from './genWorkerProtocol';
import { generateJobOp } from './jobGeneration';

/** the seeded model, index-free (seedPositions expanded it) — the same
 * triangles `transformedPositions` would have walked main-thread */
let geometry: THREE.BufferGeometry | null = null;

const post = (msg: GenWorkerMsg) =>
  // DOM lib types postMessage(message, targetOrigin) — the worker's
  // (message, transfer[]) form matches the runtime; options overload is
  // the closest declared signature
  self.postMessage(msg, { transfer: [] });

self.onmessage = (e: MessageEvent<GenClientMsg>) => {
  const msg = e.data;
  if (msg.type === 'seed') {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(msg.seed.positions, 3));
    return;
  }
  if (!geometry) {
    // a generate before any seed — impossible from our own client, but the
    // failure must be per-op visible, never a silent hang
    post({
      type: 'result',
      id: msg.id,
      result: {
        moves: [],
        minutes: 0,
        error: 'generation worker: no model seeded',
        summary: null,
        finalA: msg.startA,
      },
    });
    return;
  }
  const result = generateJobOp(msg.op, buildWorkerGenContext(geometry, msg));
  post({ type: 'result', id: msg.id, result });
};