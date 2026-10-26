/**
 * The worker-side reconstruction of GenContext, split from the worker
 * shell so vitest can pin the load-bearing property directly: a heavy
 * op generated through this context must produce EXACTLY what the
 * main-thread context produces (the UI must never show different
 * toolpaths depending on which side ran the math).
 *
 * The heavy generators never read a source's geometry (they consume the
 * model through ctx.geometry positions), so every source carries an empty
 * scratch mesh — the same stand-in artwork sources have always used.
 */

import * as THREE from 'three';
import { opEdgeSource, sourcesFor } from './featureSources';
import type { GenPayload } from './genWorkerProtocol';
import type { GenContext } from './jobGeneration';

export function buildWorkerGenContext(
  geometry: THREE.BufferGeometry | null,
  payload: GenPayload,
): GenContext {
  const scratch = new THREE.BufferGeometry();
  const sources = sourcesFor(scratch, payload.features, payload.transform, payload.primitives);
  const oe = opEdgeSource(payload.ops, payload.stock);
  return {
    startA: payload.startA,
    stock: payload.stock,
    geometry,
    features: payload.features,
    transform: payload.transform,
    tools: payload.tools,
    primitives: payload.primitives,
    sources: oe ? [...sources, oe] : sources,
    datumAngle: payload.datumAngle,
    prevRpm: payload.prevRpm,
  };
}