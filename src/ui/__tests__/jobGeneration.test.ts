import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  datumAngleBefore,
  defaultStepDown,
  defaultStepOver,
  generateJobOp,
  newJobOp,
  prefillDepths,
  seedJobOpIds,
  type GenContext,
} from '../jobGeneration';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
const smallTool: Tool = { id: 't3', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const tinyTool: Tool = {
  id: 't4',
  name: '2.175mm corn',
  type: 'corn',
  diameter: 2.175,
  spindleRpm: 18000,
};
const drillTool: Tool = { id: 't2', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
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

const geometry = plateWithHole();
geometry.translate(0, 0, -6); // caps at z −6…−4, crown at z0
const features = detectFeatures(geometry);
const holeCircleId = features.circles.find(
  (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z + 4) < 0.01,
)!.id; // hole rim at z = −4

const ctx: GenContext = {
  stock: boxStock,
  geometry,
  features,
  transform: identityTransform(),
  tools: [tool, drillTool, smallTool, tinyTool],
  primitives: [],
  datumAngle: 0,
};

/** literal fixtures with narrowed branch types */
const pocketOp: Extract<JobOp, { kind: 'pocket' }> = {
  id: 'op1',
  toolId: 't3',
  featureIds: [holeCircleId],
  kind: 'pocket',
  selectionIs: 'rim',
  startDepth: 4, // the rim, 4mm below the crown
  endDepth: 6,
  allowance: 0,
  stepDown: 0.5,
  stepOver: 1,
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
  selectionIs: 'rim',
  startDepth: 4,
  endDepth: 5,
  allowance: 0,
  stepDown: 0.5,
  side: 'online',
};

describe('newJobOp / defaults', () => {
  it('derives step parameters from the tool diameter, never fixed guesses', () => {
    expect(defaultStepOver(tinyTool)).toBeCloseTo(1.1, 5); // 0.5 × 2.175
    expect(defaultStepOver(smallTool)).toBeCloseTo(1, 5);
    const op = newJobOp('pocket', tinyTool, boxStock.materialId);
    if (op.kind !== 'pocket') throw new Error('kind');
    expect(op.stepOver).toBeCloseTo(1.1, 5);
    // aluminum preset DOC 0.8, capped at half the cutter: 1.09
    expect(op.stepDown).toBeGreaterThan(0);
    expect(op.stepDown).toBeLessThanOrEqual(tinyTool.diameter * 0.5 + 1e-9);
  });

  it('prefers the tool library preset step-down when it matches the material', () => {
    const presetTool: Tool = {
      ...smallTool,
      presets: [{ material: 'Aluminum', spindleRpm: 12000, feed: 500, plungeFeed: 200, stepDown: 0.3, rampFeed: 333 }],
    };
    expect(defaultStepDown(presetTool, 'aluminum-6061')).toBeCloseTo(0.3, 5);
    // no matching preset falls back to the material table, capped by D/2
    expect(defaultStepDown(presetTool, 'hardwood')).toBeCloseTo(1, 5);
  });

  it('creates ops with unique ids', () => {
    const a = newJobOp('pocket', tool, boxStock.materialId);
    const b = newJobOp('pocket', tool, boxStock.materialId);
    expect(a.id).not.toBe(b.id);
    const p = newJobOp('profile', tool, boxStock.materialId);
    if (p.kind === 'profile') expect(p.side).toBe('outside');
    const d = newJobOp('drill', drillTool, boxStock.materialId);
    if (d.kind === 'drill') expect(d.peckDepth).toBeGreaterThan(0);
  });

  it('seeds ids above loaded jobs so new ops never collide', () => {
    seedJobOpIds([
      { ...(pocketOp as unknown as JobOp), id: 'jobop-500' },
    ]);
    const next = newJobOp('pocket', tool, boxStock.materialId);
    expect(Number(next.id.replace(/^jobop-/, ''))).toBeGreaterThan(500);
  });
});

describe('prefillDepths', () => {
  it('floor selection sets end depth to the crown-to-feature distance', () => {
    const op = newJobOp('pocket', smallTool, 'aluminum-6061');
    const filled = prefillDepths({ ...op, kind: 'pocket' } as Extract<JobOp, { kind: 'pocket' }>, -3.5, 0);
    if (filled.kind !== 'pocket') return;
    expect(filled.startDepth).toBe(0);
    expect(filled.endDepth).toBeCloseTo(3.5, 5);
  });

  it('rim selection sets start depth at the feature and end 2mm deeper', () => {
    const op = newJobOp('pocket', smallTool, 'aluminum-6061');
    const filled = prefillDepths(
      { ...op, kind: 'pocket', selectionIs: 'rim' } as Extract<JobOp, { kind: 'pocket' }>,
      -3.5,
      0,
    );
    if (filled.kind !== 'pocket') return;
    expect(filled.startDepth).toBeCloseTo(3.5, 5);
    expect(filled.endDepth).toBeCloseTo(5.5, 5);
  });
});

describe('generateJobOp', () => {
  it('pockets a rim-selected hole down FROM the rim depth', () => {
    const res = generateJobOp(pocketOp, ctx); // rim at 4mm depth, floor at 6mm
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    const deepest = Math.min(
      ...res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!),
    );
    expect(deepest).toBeCloseTo(-6, 5); // crown 0 − endDepth 6
  });

  it('single-level finishing pass when start depth equals end depth', () => {
    const res = generateJobOp(
      { ...pocketOp, startDepth: 6, endDepth: 6, stepDown: 0.5 },
      ctx,
    );
    expect(res.error).toBeNull();
    const plunges = res.moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!);
    expect(new Set(plunges.map((z) => z.toFixed(3))).size).toBe(1); // one level only
    expect(plunges[0]).toBeCloseTo(-6, 5);
  });

  it('roughing allowance leaves floor and wall stock', () => {
    const res = generateJobOp(
      { ...pocketOp, startDepth: 0, endDepth: 6, allowance: 0.3 },
      ctx,
    );
    expect(res.error).toBeNull();
    expect(res.summary).toContain('allowance');
    // floor: roughing stops 0.3mm above the true floor
    const deepest = Math.min(
      ...res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!),
    );
    expect(deepest).toBeCloseTo(-5.7, 5);
    // wall: the first clearing loop is inset by toolR + allowance
    const firstPassXs = res.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => Math.hypot(m.words.x!, m.words.y!));
    const finish = generateJobOp({ ...pocketOp, startDepth: 0, endDepth: 6 }, ctx);
    const finishXs = finish.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => Math.hypot(m.words.x!, m.words.y!));
    expect(Math.max(...firstPassXs)).toBeCloseTo(2 - 1 - 0.3, 1); // hole r2 − toolR1 − allowance
    expect(Math.max(...finishXs)).toBeCloseTo(1, 1); // r2 − toolR1
  });

  it('rejects an allowance that swallows the cut range', () => {
    const res = generateJobOp({ ...pocketOp, startDepth: 0, endDepth: 2, allowance: 2.5 }, ctx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('allowance');
  });

  it('rejects an end depth above the start depth', () => {
    const res = generateJobOp({ ...pocketOp, startDepth: 5, endDepth: 3 }, ctx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('end depth');
  });

  it('pockets a selected face from the crown DOWN TO the face', () => {
    // a boss sunk 4mm below the stock crown
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    geo.translate(0, 0, -5);
    const f = detectFeatures(geo);
    const faceId = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 1e-6,
    )!.id;
    const op: Extract<JobOp, { kind: 'pocket' }> = {
      ...pocketOp,
      id: 'face-pocket',
      featureIds: [faceId],
      stepDown: 1,
    };
    // prefill semantics: selecting that face as its floor sets endDepth 4
    const faceCtx = { ...ctx, geometry: geo, features: f };
    const res = generateJobOp({ ...op, startDepth: 0, endDepth: 4 }, faceCtx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    expect(res.summary).toContain('z0.0 → z-4.0');
    const deepest = Math.min(
      ...res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!),
    );
    expect(deepest).toBeCloseTo(-4, 5);
  });

  it('captures selection errors instead of throwing', () => {
    const res = generateJobOp({ ...pocketOp, featureIds: [] }, ctx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('select features');
  });

  it('drills a radial hole in the frame established by a preceding Index op', () => {
    // radial hole plate on cylinder stock: holes face +Y, 6mm off the axis
    const geo = plateWithHole();
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 6, 0);
    const f = detectFeatures(geo);
    const radialHoleId = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.y) > 0.99 && c.center.y > 7.9,
    )!.id; // the far hole, radius 8 (the near one sits at radius 6)
    const op: Extract<JobOp, { kind: 'drill' }> = {
      ...drillOp,
      featureIds: [radialHoleId],
    };
    const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
      kind: 'cylinder',
      length: 100,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
      materialId: 'aluminum-6061',
    };
    // the Index op before it emitted the A positioning move; this op runs
    // in the rotated frame — pure XYZ moves, target brought to face up
    const res = generateJobOp(op, { ...ctx, datumAngle: 90, stock: cylStock, geometry: geo, features: f });
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(1);
    expect(res.moves.every((m) => m.words.a === undefined)).toBe(true); // no A words
    // the hole rim rotated on top: first plunge targets the raised rim
    const plunges = res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);
    // rim rotated to z=8; first peck plunge is rim − peck 2
    expect(Math.max(...plunges)).toBeCloseTo(6, 5);
  });

  it('rejects an index datum on box stock', () => {
    const res = generateJobOp(pocketOp, { ...ctx, datumAngle: 90 });
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('indexing needs cylinder stock');
  });

  it('emits the Index op as a single absolute-A positioning move', () => {
    const op: Extract<JobOp, { kind: 'index' }> = {
      id: 'idx',
      toolId: 't1',
      featureIds: [],
      kind: 'index',
      angle: 90,
    };
    const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
      kind: 'cylinder',
      length: 100,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
      materialId: 'aluminum-6061',
    };
    const res = generateJobOp(op, { ...ctx, stock: cylStock });
    expect(res.error).toBeNull();
    expect(res.moves).toHaveLength(1);
    expect(res.moves[0].words.a).toBeCloseTo(90, 9);
    expect(res.moves[0].rapid).toBe(true);
    // box stock rejects the index op itself
    const bad = generateJobOp(op, ctx);
    expect(bad.error).toContain('indexing needs cylinder stock');
  });

  it('datumAngleBefore tracks the latest Index op in sequence order', () => {
    const idx = (id: string, angle: number): Extract<JobOp, { kind: 'index' }> => ({
      id,
      toolId: 't1',
      featureIds: [],
      kind: 'index',
      angle,
    });
    const flat: Extract<JobOp, { kind: 'drill' }> = {
      ...drillOp,
      id: 'flat',
      featureIds: [],
    };
    const after: Extract<JobOp, { kind: 'drill' }> = {
      ...drillOp,
      id: 'after',
      featureIds: [],
    };
    const ops = [flat, idx('i1', 90), after, idx('i2', 270), drillOp];
    expect(datumAngleBefore(ops, 'flat')).toBe(0);
    expect(datumAngleBefore(ops, 'i1')).toBe(0);
    expect(datumAngleBefore(ops, 'after')).toBe(90);
    expect(datumAngleBefore(ops, 'i2')).toBe(90);
    expect(datumAngleBefore(ops, drillOp.id)).toBe(270); // absolute, not added
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
    const res = generateJobOp(newJobOp('faceCylinder', tool, boxStock.materialId), ctx);
    expect(res.error).toContain('cylinder stock');
  });

  it('flags a missing tool', () => {
    const res = generateJobOp({ ...pocketOp, toolId: 'gone' }, ctx);
    expect(res.error).toContain('tool missing');
  });

  it('NEVER throws — bad context comes back as a per-op error', () => {
    const badCtx = { ...ctx, stock: { ...boxStock, materialId: 'unobtanium' } };
    const res = generateJobOp(pocketOp, badCtx);
    expect(res.moves).toEqual([]);
    expect(res.error).toBeTruthy();
    // and a garbage op object still cannot kill a whole-job recalc
    const res2 = generateJobOp({ ...drillOp, kind: 'pocket' } as unknown as JobOp, ctx);
    expect(res2.error).toBeTruthy();
  });

  it('flags generation failures, e.g. an oversized pocket tool', () => {
    const fatCtx = { ...ctx, tools: [{ ...smallTool, diameter: 50 }] };
    const res = generateJobOp({ ...pocketOp, stepOver: 1 }, fatCtx);
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('does not fit');
  });
});