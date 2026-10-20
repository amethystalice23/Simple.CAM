import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { sourcesFor } from '../featureSources';
import {
  datumAngleBefore,
  generateJobOp,
  type GeneratedOp,
  type GenContext,
} from '../jobGeneration';
import { movesToSegments } from '../toolpathPreview';

const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};
const tool: Tool = { id: 't3', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

/** one non-indexed geometry from several (concatenated positions) */
function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays = geos.map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array);
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const merged = new Float32Array(total);
  let at = 0;
  for (const a of arrays) {
    merged.set(a, at);
    at += a.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  return g;
}

describe('indexed job flow: top pocket, index 180, bottom pocket', () => {
  const geo = mergeGeos([
    new THREE.BoxGeometry(10, 4, 2).translate(50, 0, 24), // top boss, face at z=25 (crown)
    new THREE.BoxGeometry(10, 4, 2).translate(50, 0, -24), // bottom boss, face at z=−25
  ]);
  const features = detectFeatures(geo);
  const ctx: GenContext = {
    stock: cylStock,
    geometry: geo,
    features,
    transform: identityTransform(),
    tools: [tool],
    primitives: [],
    sources: sourcesFor(geo, features, identityTransform(), []),
    datumAngle: 0,
  };

  const topFaceId = features.planes.find(
    (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 25) < 1e-6,
  )!.id;
  const bottomFaceId = features.planes.find(
    (p) => Math.abs(p.normal.z + 1) < 1e-6 && Math.abs(p.point.z + 25) < 1e-6,
  )!.id;

  const ops: JobOp[] = [
    {
      id: 'top-pocket',
      toolId: 't3',
      featureIds: [topFaceId],
      kind: 'pocket',
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 2,
      allowance: 0,
      stepDown: 1,
      stepOver: 1,
      floorFeatureId: null,
    },
    { id: 'idx', toolId: 't3', featureIds: [], kind: 'index', angle: 180 },
    {
      id: 'bottom-pocket',
      toolId: 't3',
      featureIds: [bottomFaceId],
      kind: 'pocket',
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 2,
      allowance: 0,
      stepDown: 1,
      stepOver: 1,
      floorFeatureId: null,
    },
  ];

  it('generates and previews both pockets (datum tracked through the index)', () => {
    // walk exactly like App.recalcAll
    const results: Record<string, GeneratedOp> = {};
    let datum = 0;
    for (const o of ops) {
      results[o.id] = generateJobOp(o, { ...ctx, datumAngle: datum });
      if (o.kind === 'index') datum = o.angle;
    }

    expect(results['top-pocket'].error).toBeNull();
    expect(results['bottom-pocket'].error).toBeNull();
    expect(results['bottom-pocket'].moves.length).toBeGreaterThan(0);

    // datum sequencing sanity
    expect(datumAngleBefore(ops, 'bottom-pocket')).toBe(180);

    // the bottom pocket cuts in the rotated frame: floor at crown − 2
    const plunges = results['bottom-pocket'].moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!);
    expect(Math.min(...plunges)).toBeCloseTo(23, 5); // 25 − endDepth 2

    // combined job → preview segments in the DISPLAY frame: the bottom
    // pocket's paths un-rotate by the datum and draw over the bottom boss
    // (z −25…−23), not over its mirrored machine position up top
    const allMoves = ops.flatMap((o) => results[o.id].moves);
    const segs = movesToSegments(allMoves, cylStock);
    expect(segs.feed.length).toBeGreaterThan(0);
    const bottomZs: number[] = [];
    for (let i = 2; i < segs.feed.length; i += 3) {
      if (segs.feed[i] < -20) bottomZs.push(segs.feed[i]);
    }
    expect(bottomZs.length).toBeGreaterThan(0);
    expect(Math.max(...bottomZs)).toBeLessThanOrEqual(-23); // over the boss face
    expect(Math.min(...bottomZs)).toBeGreaterThanOrEqual(-25); // above its floor
  });
});