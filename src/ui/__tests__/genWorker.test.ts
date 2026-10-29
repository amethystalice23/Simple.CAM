/**
 * Generation-worker contract (src/ui/genWorkerProtocol.ts): the heavy op
 * kinds (waterline / raster / slice-pocket) must produce EXACTLY the same
 * result through the worker's reconstructed context as through the
 * main-thread context the UI builds — the toolpath can never depend on
 * which side ran the math. Also pins the seed: a worker geometry built
 * from seedPositions(original) reproduces what transformedPositions
 * walks on the original (indexed or not).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { opEdgeSource, sourcesFor } from '../featureSources';
import { newJobOp, generateJobOp, type GenContext, type GeneratedOp } from '../jobGeneration';
import { buildWorkerGenContext } from '../genWorkerContext';
import { HEAVY_GEN_KINDS, isHeavyGenOp, seedPositions } from '../genWorkerProtocol';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
const smallTool: Tool = { id: 't3', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
  axisMode: '3-axis',
  materialId: 'aluminum-6061',
}; // crown at machine Z0

function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

/** the exact main-thread context App builds for the same inputs */
function appContext(
  geometry: THREE.BufferGeometry,
  features: ReturnType<typeof detectFeatures>,
  transform: ReturnType<typeof identityTransform>,
  stock: Stock,
  tools: Tool[],
  ops: JobOp[],
): GenContext {
  const sources = sourcesFor(geometry, features, transform, []);
  const oe = opEdgeSource(ops, stock);
  return {
    startA: 0,
    stock,
    geometry,
    features,
    transform,
    tools,
    primitives: [],
    sources: oe ? [...sources, oe] : sources,
    datumAngle: 0,
  };
}

/** assert two GeneratedOps are identical in every field the UI shows */
function expectIdentical(a: GeneratedOp, b: GeneratedOp) {
  expect(a.error).toBe(b.error);
  expect(a.summary).toBe(b.summary);
  expect(a.minutes).toBe(b.minutes);
  expect(a.finalA).toBe(b.finalA);
  expect(a.spindleRpm).toBe(b.spindleRpm);
  expect(JSON.stringify(a.moves)).toBe(JSON.stringify(b.moves));
}

/** run one heavy op through BOTH contexts: the original geometry on the
 * "main thread", and the seeded worker geometry through the worker
 * reconstruction. Indexed and non-indexed models both covered. */
function throughBothSides(
  geometry: THREE.BufferGeometry,
  op: JobOp,
  stock: Stock,
  tools: Tool[],
) {
  const features = detectFeatures(geometry);
  const transform = identityTransform();
  const ops = [op];
  const app = generateJobOp(op, appContext(geometry, features, transform, stock, tools, ops));
  const workerGeometry = new THREE.BufferGeometry();
  workerGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(seedPositions(geometry), 3),
  );
  const worker = generateJobOp(
    op,
    buildWorkerGenContext(workerGeometry, {
      id: 0,
      op,
      ops,
      stock,
      transform,
      tools,
      primitives: [],
      features,
      datumAngle: 0,
      startA: 0,
    }),
  );
  expectIdentical(app, worker);
  return { app, worker };
}

describe('generation worker protocol', () => {
  it('routes exactly the heavy kinds', () => {
    expect([...HEAVY_GEN_KINDS].sort()).toEqual([
      'contour4d',
      'rasterContour',
      'rotaryCarve',
      'slicePocket',
      'waterline',
    ]);
    const everyKind = newJobOp('pocket', tool, 'aluminum-6061', boxStock);
    expect(isHeavyGenOp(everyKind)).toBe(false);
    expect(isHeavyGenOp(newJobOp('waterline', tool, 'aluminum-6061', boxStock))).toBe(true);
  });

  it('seedPositions: expands an indexed geometry exactly like toNonIndexed', () => {
    const box = new THREE.BoxGeometry(4, 4, 4); // INDEXED
    expect(box.index).not.toBeNull();
    const expanded = new THREE.BoxGeometry(4, 4, 4).toNonIndexed();
    const attr = expanded.getAttribute('position') as THREE.BufferAttribute;
    const seeded = seedPositions(box);
    expect(seeded.length).toBe(attr.count * 3);
    expect(seeded).toEqual(new Float32Array(attr.array as Float32Array));
  });

  it('seedPositions: a non-indexed geometry passes through unchanged', () => {
    const plate = plateWithHole(); // toNonIndexed() already applied
    expect(plate.index).toBeNull();
    const attr = plate.getAttribute('position') as THREE.BufferAttribute;
    expect(seedPositions(plate)).toEqual(new Float32Array(attr.array as Float32Array));
  });

  it('waterline: worker context reproduces the main-thread result (indexed model)', () => {
    // an INDEXED box exercises the seed's index-expansion path end to end
    const box = new THREE.BoxGeometry(8, 8, 4);
    box.translate(0, 0, -4); // top at z −4, crown at z0
    const op = {
      ...newJobOp('waterline', tool, 'aluminum-6061', boxStock),
      stepDown: 1,
      stepOver: 1,
    } as JobOp;
    const { app, worker } = throughBothSides(box, op, boxStock, [tool]);
    expect(app.error).toBeNull();
    expect(worker.error).toBeNull();
    expect(app.moves.length).toBeGreaterThan(0);
  });

  it('rasterContour: worker context reproduces the main-thread result', () => {
    const brick = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
    brick.translate(0, 0, -6); // box top at z −2... sunk: caps z −6…−2
    const op = newJobOp('rasterContour', smallTool, 'aluminum-6061', boxStock);
    const { app } = throughBothSides(brick, op, boxStock, [smallTool]);
    expect(app.error).toBeNull();
    expect(app.summary).toContain('raster row');
  });

  it('contour4d: worker context reproduces the main-thread plan (stage A)', () => {
    const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
      kind: 'cylinder',
      length: 30,
      xOrigin: 'mid',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
      axisMode: '4-axis',
      materialId: 'aluminum-6061',
    };
    const g = new THREE.CylinderGeometry(4, 4, 20, 32).toNonIndexed();
    g.rotateZ(Math.PI / 2); // on the rotation axis
    const op = newJobOp('contour4d', smallTool, 'aluminum-6061', cylStock);
    const { app, worker } = throughBothSides(g, op, cylStock, [smallTool]);
    expect(app.error).toBeNull();
    expect(worker.error).toBeNull();
    // stage A: the plan only, identical through both sides
    expect(app.moves).toHaveLength(0);
    expect(worker.moves).toHaveLength(0);
    expect(worker.summary).toBe(app.summary);
    expect(app.summary).toContain('plan:');
    expect(app.summary).toContain('stage 1: plan only');
  });

  it('rotaryCarve: worker context reproduces the main-thread result', () => {
    const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
      kind: 'cylinder',
      length: 30,
      xOrigin: 'mid',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
      axisMode: '4-axis',
      materialId: 'aluminum-6061',
    };
    const g = new THREE.CylinderGeometry(4, 4, 20, 32).toNonIndexed();
    g.rotateZ(Math.PI / 2); // on the rotation axis
    const op = {
      id: 'rc',
      toolId: 't3',
      featureIds: [],
      kind: 'rotaryCarve',
      stepDown: 1,
      stepOver: 1,
      allowance: 0,
      strategy: 'horizontal' as const,
    };
    const { app, worker } = throughBothSides(g, op as JobOp, cylStock, [smallTool]);
    expect(app.error).toBeNull();
    expect(worker.error).toBeNull();
    expect(app.moves.length).toBeGreaterThan(0);
  });

  it('slicePocket: worker context resolves a ⇩ floor pick identically (the sources reconstruction)', () => {
    const plate = plateWithHole();
    plate.translate(0, 0, -6); // caps at z −6…−4, crown at z0
    const features = detectFeatures(plate);
    const floorId = features.planes[0]?.id ?? null;
    expect(floorId).not.toBeNull(); // the pick needs a real plane to hang on
    // hand-built like the jobGeneration fixtures (positive depths below
    // the crown); the floor pick drives the end depth
    const op = {
      id: 'sp',
      toolId: 't3',
      featureIds: [],
      kind: 'slicePocket',
      regionMode: 'outside',
      sliceDepth: 5, // z −5: inside the plate body → the disc-with-hole section
      startDepth: 0, // the crown
      endDepth: 2,
      allowance: 0,
      stepDown: 1,
      stepOver: 2,
      floorFeatureId: floorId,
      clearToStock: false,
      tabs: null,
    } as Extract<JobOp, { kind: 'slicePocket' }>;
    const { app, worker } = throughBothSides(plate, op, boxStock, [smallTool]);
    // the worker must NOT report the floor feature missing (the empty-mesh
    // sources stand-in would break the existence check if it were wrong)
    expect(worker.error).toBeNull();
    expect(app.error).toBeNull();
    expect(app.moves.length).toBeGreaterThan(0);
  });
});