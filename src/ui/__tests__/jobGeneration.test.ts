import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { generateJobOp, newJobOp, type GenContext } from '../jobGeneration';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
const smallTool: Tool = { id: 't3', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const drillTool: Tool = { id: 't2', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
  materialId: 'aluminum-6061',
};

function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

const geometry = plateWithHole();
const features = detectFeatures(geometry);
const holeCircleId = features.circles.find(
  (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z - 2) < 0.01,
)!.id;

const ctx: GenContext = {
  stock: boxStock,
  geometry,
  features,
  transform: identityTransform(),
  tools: [tool, drillTool, smallTool],
};

/** literal fixtures with narrowed branch types */
const pocketOp: Extract<JobOp, { kind: 'pocket' }> = {
  id: 'op1',
  toolId: 't3',
  featureIds: [holeCircleId],
  kind: 'pocket',
  depth: 2,
  stepDown: 1,
  stepOver: 3,
};
const drillOp: Extract<JobOp, { kind: 'drill' }> = {
  id: 'op2',
  toolId: 't2',
  featureIds: [holeCircleId],
  kind: 'drill',
  depth: 5,
  peckDepth: 2,
};
const profileOp: Extract<JobOp, { kind: 'profile' }> = {
  id: 'op3',
  toolId: 't3',
  featureIds: [holeCircleId],
  kind: 'profile',
  depth: 1,
  stepDown: 1,
  allowance: 0,
  side: 'online',
};

describe('newJobOp', () => {
  it('creates ops with unique ids and default params', () => {
    const a = newJobOp('pocket', 't1');
    const b = newJobOp('pocket', 't1');
    expect(a.id).not.toBe(b.id);
    expect(a.kind).toBe('pocket');
    if (a.kind === 'pocket') {
      expect(a.depth).toBeGreaterThan(0);
      expect(a.stepOver).toBeGreaterThan(0);
    }
    const p = newJobOp('profile', 't1');
    if (p.kind === 'profile') expect(p.side).toBe('outside');
    const d = newJobOp('drill', 't2');
    if (d.kind === 'drill') expect(d.peckDepth).toBeGreaterThan(0);
  });
});

describe('generateJobOp', () => {
  it('pockets a selected hole', () => {
    const res = generateJobOp(pocketOp, ctx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    expect(res.summary).toContain('passes');
  });

  it('captures selection errors instead of throwing', () => {
    const res = generateJobOp({ ...pocketOp, featureIds: [] }, ctx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('select features');
  });

  it('drills selected interior circles', () => {
    const res = generateJobOp(drillOp, ctx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    expect(res.summary).toContain('hole');
  });

  it('profiles a selected contour online', () => {
    const res = generateJobOp(profileOp, ctx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
  });

  it('rejects facing on box stock', () => {
    const res = generateJobOp(newJobOp('faceCylinder', 't1'), ctx);
    expect(res.error).toContain('cylinder stock');
  });

  it('flags a missing tool', () => {
    const res = generateJobOp({ ...pocketOp, toolId: 'gone' }, ctx);
    expect(res.error).toContain('tool missing');
  });

  it('flags generation failures, e.g. an oversized pocket tool', () => {
    const fatCtx = { ...ctx, tools: [{ ...smallTool, diameter: 50 }] };
    const res = generateJobOp({ ...pocketOp, stepOver: 1 }, fatCtx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('does not fit');
  });
});