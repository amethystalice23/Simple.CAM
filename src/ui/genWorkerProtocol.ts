/**
 * Generation-worker protocol (PLAN.md "Architecture rules"): the recalc
 * pass routes the HEAVY op kinds (whole-model slicing / dense raycasts —
 * seconds on fine meshes) to a Web Worker so the UI never freezes; every
 * other op is light (features are precomputed) and stays inline. This is
 * the ONLY module shared by the worker shell, the React hook, and the
 * tests — pinned contract, both sides import from here.
 *
 * The worker's context is deliberately SMALL: the heavy generators read
 * positions + {stock, transform, tools, datumAngle} and never the
 * feature-overlay geometry, so the seed is just the model's non-indexed
 * position array (built once per model, cloned across on seed).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type { JobOp, ModelTransform, Primitive, Stock, Tool } from '../core/types';
import type { GeneratedOp } from './jobGeneration';

/** The op kinds routed to the worker — anything whose generation walks
 * the whole mesh (slicing ladders, raycast grids). Keep in sync with the
 * HEAVY cases in jobGeneration.ts: they must never read sources' geometry
 * or ctx.features beyond the ⇩ floor-pick existence check. */
export const HEAVY_GEN_KINDS: ReadonlySet<JobOp['kind']> = new Set([
  'slicePocket',
  'waterline',
  'rasterContour',
  'rotaryCarve',
]);

export function isHeavyGenOp(op: JobOp): boolean {
  return HEAVY_GEN_KINDS.has(op.kind);
}

/** The model as the worker needs it: non-indexed triangles, one flat
 * position array. `transformedPositions` (slicing.ts) expands the index
 * itself, so seeding the EXPANDED positions and building an index-free
 * geometry worker-side reproduces the main thread byte-for-byte. */
export function seedPositions(geometry: THREE.BufferGeometry): Float32Array {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(attr.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

export interface GenSeed {
  positions: Float32Array;
}

/** Everything one heavy op's generation needs beyond the seeded model.
 * `ops` is the whole list because the sources include the job's own
 * `o:` edge circles (a ⇩ floor pick may hang on one). All plain data —
 * structured-cloneable, small next to the slicing work it buys. */
export interface GenPayload {
  id: number;
  op: JobOp;
  ops: JobOp[];
  stock: Stock;
  transform: ModelTransform;
  tools: Tool[];
  primitives: Primitive[];
  features: DetectedFeatures | null;
  datumAngle: number;
  startA: number;
  prevRpm?: number;
  /** P1: the standing-material grid threaded from the prior rotaryCarve
   *  op (plain data — structured clone carries it). Only rotaryCarve
   *  consumes it; genWorkerContext maps it into the worker's GenContext. */
  standing?: import('../cam/rotaryCarve').StandingGrid;
}

export type GenClientMsg = { type: 'seed'; seed: GenSeed } | ({ type: 'generate' } & GenPayload);

export type GenWorkerMsg = { type: 'result'; id: number; result: GeneratedOp };