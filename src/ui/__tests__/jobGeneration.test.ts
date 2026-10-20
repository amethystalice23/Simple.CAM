import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform, rotaryCalibrationOf } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { sourcesFor } from '../featureSources';
import type { Primitive } from '../../core/types';
import {
  datumAngleBefore,
  defaultFaceStepOver,
  defaultStepDown,
  defaultStepOver,
  generateJobOp,
  newJobOp,
  prefillDepths,
  presetRates,
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
  axisMode: '3-axis',
  materialId: 'aluminum-6061',
}; // crown at machine Z0

const cylStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 80,
  xOrigin: 'mid',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
}; // spans machine X −40…40

/** the same blank box, but riding the rotary axis */
const boxStock4: Extract<Stock, { kind: 'box' }> = {
  ...boxStock,
  origin: { x: 'min', y: 'mid', z: 'min' },
  axisMode: '4-axis',
}; // spans machine X 0…60, Y −20…20, Z 0…10

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
  sources: sourcesFor(geometry, features, identityTransform(), []),
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
  floorFeatureId: null,
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
  floorFeatureId: null,
  clearToStock: false,
};

describe('newJobOp / defaults', () => {
  it('derives step parameters from the tool diameter, never fixed guesses', () => {
    expect(defaultStepOver(tinyTool)).toBeCloseTo(1.1, 5); // 0.5 × 2.175
    expect(defaultStepOver(smallTool)).toBeCloseTo(1, 5);
    const op = newJobOp('pocket', tinyTool, boxStock.materialId, boxStock);
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
    const a = newJobOp('pocket', tool, boxStock.materialId, boxStock);
    const b = newJobOp('pocket', tool, boxStock.materialId, boxStock);
    expect(a.id).not.toBe(b.id);
    const p = newJobOp('profile', tool, boxStock.materialId, boxStock);
    if (p.kind === 'profile') expect(p.side).toBe('outside');
    const d = newJobOp('drill', drillTool, boxStock.materialId, boxStock);
    if (d.kind === 'drill') expect(d.peckDepth).toBeGreaterThan(0);
    const c = newJobOp('chamfer', chamferTool, boxStock.materialId, boxStock);
    if (c.kind === 'chamfer') {
      expect(c.mode).toBe('add');
      expect(c.side).toBe('auto');
      expect(c.direction).toBe('down');
      expect(c.depth).toBe(0.5);
    }
  });

  it('seeds ids above loaded jobs so new ops never collide', () => {
    seedJobOpIds([
      { ...(pocketOp as unknown as JobOp), id: 'jobop-500' },
    ]);
    const next = newJobOp('pocket', tool, boxStock.materialId, boxStock);
    expect(Number(next.id.replace(/^jobop-/, ''))).toBeGreaterThan(500);
  });

  it('face defaults follow the stock: X spans it, target Ø is a 0.5mm skim', () => {
    const op = newJobOp('faceCylinder', tool, cylStock.materialId, cylStock);
    if (op.kind !== 'faceCylinder') throw new Error('kind');
    expect(op.xStart).toBeCloseTo(-40, 9); // originSpan('mid', 80)
    expect(op.xEnd).toBeCloseTo(40, 9);
    // effective Ø 50 minus a 0.5mm radial skim
    expect(op.targetDiameter).toBeCloseTo(49, 9);
    expect(op.pattern).toBe('spiral');
    // step-over stays derived (0.5·tool Ø at generation) until the user sets it
    expect(op.stepOver).toBeNull();
    // the skim must actually face: strictly below the probed surface
    expect(op.targetDiameter).toBeLessThan(cylStock.calibration.effectiveRadius * 2);
  });

  it('face defaults keep last-resort constants in 3-axis mode', () => {
    const op = newJobOp('faceCylinder', tool, boxStock.materialId, boxStock);
    if (op.kind !== 'faceCylinder') throw new Error('kind');
    expect(op.xStart).toBe(0);
    expect(op.xEnd).toBe(100);
    expect(op.targetDiameter).toBe(40);
    // even a cylinder in 3-axis mode: facing needs the rotary axis
    const flat3 = newJobOp('faceCylinder', tool, cylStock.materialId, {
      ...cylStock,
      axisMode: '3-axis',
    });
    if (flat3.kind !== 'faceCylinder') throw new Error('kind');
    expect(flat3.xStart).toBe(0);
    expect(flat3.targetDiameter).toBe(40);
  });

  it('face defaults follow a 4-axis box: X spans it, Ø is the Y-Z diagonal skim', () => {
    const op = newJobOp('faceCylinder', tool, boxStock4.materialId, boxStock4);
    if (op.kind !== 'faceCylinder') throw new Error('kind');
    expect(op.xStart).toBeCloseTo(0, 9); // originSpan('min', 60)
    expect(op.xEnd).toBeCloseTo(60, 9);
    // hypot(40, 10) ≈ 41.231 diagonal Ø, minus a 0.5mm radial skim
    expect(op.targetDiameter).toBeCloseTo(Math.hypot(40, 10) - 1, 9);
  });

  it('facing step-over derives from the tool: 0.5·Ø (radius), rounded to 0.1mm', () => {
    expect(defaultFaceStepOver(tool)).toBeCloseTo(3.0, 9); // 0.5 × 6mm
    expect(defaultFaceStepOver(tinyTool)).toBeCloseTo(1.1, 9); // 0.5 × 2.175 = 1.0875
    expect(defaultFaceStepOver({ ...tool, diameter: 0.05 })).toBeCloseTo(0.1, 9); // floored
  });

  it('facing generation derives the step-over when null and honors explicit values', () => {
    const faceRingsOp = (stepOver: number | null): Extract<JobOp, { kind: 'faceCylinder' }> => ({
      id: 'face',
      toolId: 't1',
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: 40,
      xStart: -40,
      xEnd: 40, // the cylStock span
      stepDown: 1,
      stepOver,
      finishAllowance: 0.2,
      rotation: 'cw',
      pattern: 'vertical',
      primitiveId: null,
    });
    // ring cuts are the A-only feed moves — their count is what stepOver drives
    const rings = (res: ReturnType<typeof generateJobOp>) =>
      res.moves.filter(
        (m) => m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined && !m.rapid,
      ).length;
    const derived = generateJobOp(faceRingsOp(null), { ...ctx, stock: cylStock });
    expect(derived.error).toBeNull();
    const coarse = generateJobOp(faceRingsOp(10), { ...ctx, stock: cylStock });
    expect(coarse.error).toBeNull();
    // derived 4.8mm packs more rings into the 80mm span than an explicit 10mm
    expect(rings(derived)).toBeGreaterThan(rings(coarse));
  });
});

describe('rotaryCalibrationOf (derived rotary geometry)', () => {
  it('passes the cylinder stored calibration through untouched', () => {
    expect(rotaryCalibrationOf(cylStock)).toBe(cylStock.calibration);
  });

  it('derives a 4-axis box: axis at the Z-span center, radius half the Y-Z diagonal', () => {
    const cal = rotaryCalibrationOf(boxStock4); // Z 0…10, Y −20…20
    expect(cal.axisZ).toBeCloseTo(5, 9);
    expect(cal.effectiveRadius).toBeCloseTo(Math.hypot(40, 10) / 2, 9);
    expect(cal.aOriginDeg).toBe(0);
    // the origin choice moves the derived axis: z origin 'max' spans −10…0
    const flipped = rotaryCalibrationOf({
      ...boxStock4,
      origin: { x: 'min', y: 'mid', z: 'max' },
    });
    expect(flipped.axisZ).toBeCloseTo(-5, 9);
    expect(flipped.effectiveRadius).toBeCloseTo(Math.hypot(40, 10) / 2, 9);
  });
});

describe('prefillDepths', () => {
  it('floor selection sets end depth to the crown-to-feature distance', () => {
    const op = newJobOp('pocket', smallTool, 'aluminum-6061', boxStock);
    const filled = prefillDepths({ ...op, kind: 'pocket' } as Extract<JobOp, { kind: 'pocket' }>, -3.5, 0);
    if (filled.kind !== 'pocket') return;
    expect(filled.startDepth).toBe(0);
    expect(filled.endDepth).toBeCloseTo(3.5, 5);
  });

  it('rim selection sets start depth at the feature and end 2mm deeper', () => {
    const op = newJobOp('pocket', smallTool, 'aluminum-6061', boxStock);
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
    const faceCtx = {
      ...ctx,
      geometry: geo,
      features: f,
      sources: sourcesFor(geo, f, identityTransform(), []),
    };
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
      axisMode: '4-axis',
      materialId: 'aluminum-6061',
    };
    // the Index op before it emitted the A positioning move; this op runs
    // in the rotated frame — pure XYZ moves, target brought to face up
    const res = generateJobOp(op, {
      ...ctx,
      datumAngle: 90,
      stock: cylStock,
      geometry: geo,
      features: f,
      sources: sourcesFor(geo, f, identityTransform(), []),
    });
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(1);
    expect(res.moves.every((m) => m.words.a === undefined)).toBe(true); // no A words
    // the hole rim rotated on top: first plunge targets the raised rim
    const plunges = res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);
    // rim rotated to z=8; first peck plunge is rim − peck 2
    expect(Math.max(...plunges)).toBeCloseTo(6, 5);
  });

  it('rejects an index datum without 4-axis mode', () => {
    const res = generateJobOp(pocketOp, { ...ctx, datumAngle: 90 });
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('indexing needs 4-axis mode');
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
      axisMode: '4-axis',
      materialId: 'aluminum-6061',
    };
    const res = generateJobOp(op, { ...ctx, stock: cylStock });
    expect(res.error).toBeNull();
    expect(res.moves).toHaveLength(1);
    expect(res.moves[0].words.a).toBeCloseTo(90, 9);
    expect(res.moves[0].rapid).toBe(true);
    // 3-axis mode (even with cylinder stock) rejects the index op itself
    const bad = generateJobOp(op, ctx);
    expect(bad.error).toContain('indexing needs 4-axis mode');
    // and a 4-axis box indexes fine — rotation is a mode, not a shape
    const boxed = generateJobOp(op, { ...ctx, stock: boxStock4 });
    expect(boxed.error).toBeNull();
    expect(boxed.moves[0].words.a).toBeCloseTo(90, 9);
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

  it('rejects facing in 3-axis mode and generates it on a 4-axis box', () => {
    const res = generateJobOp(newJobOp('faceCylinder', tool, boxStock.materialId, boxStock), ctx);
    expect(res.error).toContain('4-axis mode');
    // cylinder stock is not exempt either — facing needs the rotary axis
    const faceDefaults = newJobOp('faceCylinder', tool, cylStock.materialId, cylStock);
    if (faceDefaults.kind !== 'faceCylinder') throw new Error('kind');
    const cyl3 = generateJobOp(faceDefaults, { ...ctx, stock: { ...cylStock, axisMode: '3-axis' } });
    expect(cyl3.error).toContain('4-axis mode');
    // a 4-axis box faces: the surface sits at axisZ + half the Y-Z diagonal
    const face = newJobOp('faceCylinder', tool, boxStock4.materialId, boxStock4);
    const boxed = generateJobOp(face, { ...ctx, stock: boxStock4 });
    expect(boxed.error).toBeNull();
    expect(boxed.moves.length).toBeGreaterThan(0);
    // derived axisZ = 5 (Z-span center), r0 = hypot(40,10)/2 ≈ 20.616
    const surfaceZ = 5 + Math.hypot(40, 10) / 2;
    const approach = boxed.moves.find((m) => m.rapid && m.words.z !== undefined);
    expect(approach?.words.z).toBeCloseTo(surfaceZ + 5, 5); // safe clearance above
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
/** Makera's 90° chamfering bit, Ø3.175, sharp tip. */
const chamferTool: Tool = {
  id: 't5',
  name: '90° chamfer bit',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 90,
  spindleRpm: 12000,
};

const chamferCtx: GenContext = { ...ctx, tools: [...ctx.tools, chamferTool] };

const chamferOp: Extract<JobOp, { kind: 'chamfer' }> = {
  id: 'op5',
  toolId: 't5',
  featureIds: [holeCircleId],
  kind: 'chamfer',
  mode: 'add',
  side: 'auto',
  direction: 'down',
  depth: 0.5,
};

describe('chamfer op generation', () => {
  it('generates a single-pass chamfer for a selected rim circle', () => {
    const res = generateJobOp(chamferOp, chamferCtx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    expect(res.summary).toMatch(/1 loop\(s\), 0\.5mm chamfer/);
    // auto on a hole rim (material outside) cuts from inside the hole:
    // tool path radius = r − rt = 2 (sharp tip), tip 0.5 below the rim
    const pass = res.moves.find((m) => m.feed > 0 && m.words.x !== undefined && m.words.y !== undefined);
    expect(pass).toBeDefined();
    expect(Math.hypot(pass!.words.x!, pass!.words.y!)).toBeCloseTo(2, 5);
    const plunge = res.moves.find((m) => m.words.z !== undefined && !m.rapid && m.words.x === undefined);
    expect(plunge).toBeDefined();
    expect(plunge!.words.z).toBeCloseTo(-4.5, 5); // rim z −4 minus 0.5 depth
  });

  it('rejects a non-V-bit tool with a pointer to the library', () => {
    const res = generateJobOp({ ...chamferOp, toolId: 't1' }, chamferCtx);
    expect(res.moves).toEqual([]);
    expect(res.error).toBe('chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
  });

  it("mode 'existing' slides the tip down the modelled chamfer face: down-and-in by depth", () => {
    // same sharp rim circle, 90° bit, sharp tip: 'add' keeps the path at
    // r=2 with the tip 0.5 below; 'existing' + direction 'down' (the top
    // edge was selected) rides the modelled face — the path shifts in by
    // w = 0.5·tan45 = 0.5 → r=1.5, tip still 0.5 below (down-and-in by
    // depth, landing on the bottom edge when depth matches the model)
    const add = generateJobOp(chamferOp, chamferCtx);
    const existing = generateJobOp({ ...chamferOp, mode: 'existing' }, chamferCtx);
    expect(add.error).toBeNull();
    expect(existing.error).toBeNull();
    const radius = (res: ReturnType<typeof generateJobOp>): number | undefined => {
      const pass = res.moves.find(
        (m) => m.feed > 0 && m.words.x !== undefined && m.words.y !== undefined,
      );
      return pass ? Math.hypot(pass.words.x!, pass.words.y!) : undefined;
    };
    expect(radius(add)).toBeCloseTo(2, 5);
    expect(radius(existing)).toBeCloseTo(1.5, 5);
    const plunge = existing.moves.find(
      (m) => m.words.z !== undefined && !m.rapid && m.words.x === undefined,
    );
    expect(plunge).toBeDefined();
    expect(plunge!.words.z).toBeCloseTo(-4.5, 5); // rim z −4 − 0.5 depth
  });

  it('rejects a V-bit without a usable tip angle', () => {
    const noAngle = { ...chamferTool, id: 't6', vAngle: undefined } as Tool;
    const res = generateJobOp({ ...chamferOp, toolId: 't6' }, { ...chamferCtx, tools: [...chamferCtx.tools, noAngle] });
    expect(res.moves).toEqual([]);
    expect(res.error).toContain('no usable tip angle');
  });

  it('gives the IDENTICAL toolpath for the rim circle and the face it bounds', () => {
    // a cylinder's top cap is a disc face whose whole outline is the rim
    // circle — the user's circle ≡ face-outline requirement. (THREE's
    // cylinder stands along Y — stand it up along machine Z first.)
    const geo = new THREE.CylinderGeometry(2, 2, 2, 32).rotateX(Math.PI / 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topCircle = f.circles.find(
      (c) => !c.inner && Math.abs(c.center.z - 1) < 1e-6 && Math.abs(c.radius - 2) < 1e-3,
    )!;
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    )!;
    const capCtx: GenContext = {
      ...chamferCtx,
      geometry: geo,
      features: f,
      sources: sourcesFor(geo, f, identityTransform(), []),
    };
    const byCircle = generateJobOp(
      { ...chamferOp, featureIds: [topCircle.id] },
      capCtx,
    );
    const byFace = generateJobOp(
      { ...chamferOp, featureIds: [topPlane.id] },
      capCtx,
    );
    expect(byCircle.error).toBeNull();
    expect(byFace.error).toBeNull();
    expect(byFace.moves).toEqual(byCircle.moves);
    expect(byFace.summary).toBe(byCircle.summary);
  });

  it('gives the user options control over side and direction', () => {
    // a flat-tip bit (rt 0.25) makes the side visible in the tool path:
    // inside → r − rt, outside → r + rt
    const flatTip = { ...chamferTool, id: 't7', tipDiameter: 0.5 };
    const tipCtx: GenContext = { ...chamferCtx, tools: [...chamferCtx.tools, flatTip] };
    const pathRadius = (res: ReturnType<typeof generateJobOp>): number => {
      const pass = res.moves.find(
        (m) => m.feed > 0 && m.words.x !== undefined && m.words.y !== undefined,
      );
      expect(pass).toBeDefined();
      return Math.hypot(pass!.words.x!, pass!.words.y!);
    };
    const inside = generateJobOp({ ...chamferOp, toolId: 't7', side: 'inside' }, tipCtx);
    expect(inside.error).toBeNull();
    expect(pathRadius(inside)).toBeCloseTo(1.75, 5); // 2 − 0.25
    const outside = generateJobOp({ ...chamferOp, toolId: 't7', side: 'outside' }, tipCtx);
    expect(outside.error).toBeNull();
    expect(pathRadius(outside)).toBeCloseTo(2.25, 5); // 2 + 0.25
    // 'up': the tip sits ABOVE the anchor plane instead of below it
    const up = generateJobOp({ ...chamferOp, direction: 'up' }, chamferCtx);
    expect(up.error).toBeNull();
    const plunge = up.moves.find((m) => m.words.z !== undefined && !m.rapid && m.words.x === undefined);
    expect(plunge).toBeDefined();
    expect(plunge!.words.z).toBeCloseTo(-3.5, 5); // rim z −4 plus 0.5
  });
});

describe('generateJobOp: primitive feature sources', () => {
  /** cylinder Ø10 × 4 standing vertical on the box-stock crown (z 0…4):
   * local X (the primitive's axis) rotated to machine Z, center at z=2 */
  const verticalCyl: Primitive = {
    kind: 'cylinder',
    id: 'prim-1',
    diameter: 10,
    length: 4,
    original: { diameter: 10, length: 4 },
    transform: {
      position: { x: 0, y: 0, z: 2 },
      rotationDeg: { x: 0, y: -90, z: 0 }, // local X → machine +Z
      scale: { x: 1, y: 1, z: 1 },
    },
  };
  /** local rim at x=+2 maps to machine z=4 — the top rim circle */
  const primSources = sourcesFor(null, null, identityTransform(), [verticalCyl]);
  const rimId = primSources[0].features.circles.find(
    (c) => Math.abs(c.center.x - 2) < 1e-6,
  )!.id;
  const boxPrim: Primitive = {
    kind: 'box',
    id: 'prim-2',
    size: { x: 8, y: 8, z: 3 },
    original: { x: 8, y: 8, z: 3 },
    transform: {
      position: { x: 0, y: 0, z: 1.5 },
      rotationDeg: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
  const primOnlyCtx: GenContext = {
    ...ctx,
    geometry: null,
    features: null,
    sources: primSources,
  };

  it('pockets a primitive rim circle with NO model loaded (disc region)', () => {
    const res = generateJobOp(
      { ...pocketOp, featureIds: [rimId], startDepth: 0, endDepth: 2, stepDown: 2, stepOver: 2 },
      primOnlyCtx,
    );
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    // the Ø10 disc with the Ø2 tool (t3): the outermost tool-center pass
    // runs at radius 5 − 1 from the rim center
    const pts = res.moves.filter((m) => m.words.x !== undefined && m.words.y !== undefined);
    expect(pts.some((m) => Math.abs(Math.hypot(m.words.x!, m.words.y!) - 4) < 0.05)).toBe(true);
  });

  it('concatenates model and primitive selections into one pocket', () => {
    const both = sourcesFor(geometry, features, identityTransform(), [verticalCyl]);
    const res = generateJobOp(
      {
        ...pocketOp,
        featureIds: [holeCircleId, rimId],
        startDepth: 0,
        endDepth: 2,
        stepDown: 2,
        stepOver: 2,
      },
      { ...ctx, sources: both },
    );
    expect(res.error).toBeNull();
    const pts = res.moves.filter((m) => m.words.x !== undefined && m.words.y !== undefined);
    // the model's Ø4 hole disc and the primitive's Ø10 disc are both cut
    // (tool-center passes inset by the Ø2 tool's 1mm radius: 1 and 4)
    expect(pts.some((m) => Math.abs(Math.hypot(m.words.x!, m.words.y!) - 1) < 0.05)).toBe(true);
    expect(pts.some((m) => Math.abs(Math.hypot(m.words.x!, m.words.y!) - 4) < 0.05)).toBe(true);
  });

  it('rejects faces + holes mixed ACROSS sources', () => {
    const faceId = features.planes.find((p) => Math.abs(p.normal.z - 1) < 1e-6)!.id;
    const both = sourcesFor(geometry, features, identityTransform(), [verticalCyl]);
    const res = generateJobOp({ ...pocketOp, featureIds: [faceId, rimId] }, { ...ctx, sources: both });
    expect(res.error).toContain('select either faces or holes');
  });

  it('fails visibly on dangling ids (resized/deleted primitive)', () => {
    const res = generateJobOp(
      { ...pocketOp, featureIds: ['p:prim-9:circle-deadbeef'] },
      primOnlyCtx,
    );
    expect(res.error).toContain('no longer exist');
  });

  it('chamfers a primitive rim circle as one loop', () => {
    const res = generateJobOp(
      { ...chamferOp, featureIds: [rimId] },
      { ...chamferCtx, geometry: null, features: null, sources: primSources },
    );
    expect(res.error).toBeNull();
    expect(res.summary).toContain('1 loop');
  });

  it('drill on a box primitive: no holes → the select-holes failure', () => {
    const boxSources = sourcesFor(null, null, identityTransform(), [boxPrim]);
    const res = generateJobOp(
      { ...drillOp, featureIds: boxSources[0].features.planes.map((p) => p.id) },
      { ...ctx, geometry: null, features: null, sources: boxSources },
    );
    expect(res.error).toContain('select holes');
  });
});

describe('per-op cutting-rate overrides (rates)', () => {
  it('presetRates: exactly what generation uses when nothing is overridden', () => {
    // 2mm flat on aluminum: material-table feed, plunge = feed × plungeFraction
    expect(presetRates('pocket', smallTool, boxStock.materialId)).toEqual({
      feed: 420,
      plungeFeed: 139, // round(420 × 0.33)
      spindleRpm: 18000, // the Tools-tab value
    });
    // drill plunges at the full preset drill feed — no plunge fraction
    expect(presetRates('drill', drillTool, boxStock.materialId)).toEqual({
      feed: 200,
      plungeFeed: 200,
      spindleRpm: 18000,
    });
  });

  it('overrides replace the preset feeds in the generated moves', () => {
    const base = generateJobOp(pocketOp, ctx);
    const overridden = generateJobOp(
      { ...pocketOp, rates: { feed: 300, plungeFeed: 90 } },
      ctx,
    );
    expect(overridden.error).toBeNull();
    const feeds = (g: ReturnType<typeof generateJobOp>) =>
      new Set(g.moves.filter((m) => !m.rapid).map((m) => m.feed));
    expect(feeds(overridden)).toContain(300); // XY cuts
    expect(feeds(overridden)).toContain(90); // plunges
    expect(feeds(base)).not.toContain(300);
    expect(feeds(base)).not.toContain(90);
  });

  it('drill plunge override wins over the preset drill feed', () => {
    const overridden = generateJobOp({ ...drillOp, rates: { plungeFeed: 80 } }, ctx);
    expect(overridden.error).toBeNull();
    const feeds = new Set(overridden.moves.filter((m) => !m.rapid).map((m) => m.feed));
    expect(feeds).toContain(80);
    expect(feeds).not.toContain(200); // the aluminum drill-table preset
  });

  it('a spindle-only override changes just the first move (feeds stay on the tool defaults)', () => {
    const base = generateJobOp(pocketOp, ctx);
    const g = generateJobOp({ ...pocketOp, rates: { spindleRpm: 12000 } }, ctx);
    expect(g.moves[0].spindleRpm).toBe(12000);
    expect(g.moves.slice(1)).toEqual(base.moves.slice(1));
    const feeds = (x: ReturnType<typeof generateJobOp>) =>
      x.moves.filter((m) => !m.rapid).map((m) => m.feed);
    expect(feeds(g)).toEqual(feeds(base));
  });

  it("stamps the effective spindle rpm on each cutting op's first move", () => {
    // default: the tool's library RPM, first move only
    const base = generateJobOp(pocketOp, ctx);
    expect(base.moves[0].spindleRpm).toBe(18000);
    expect(base.moves.slice(1).every((m) => m.spindleRpm === undefined)).toBe(true);
    // ⚡ override wins over the tool default
    const overridden = generateJobOp(
      { ...pocketOp, rates: { spindleRpm: 12000 } },
      ctx,
    );
    expect(overridden.moves[0].spindleRpm).toBe(12000);
    // an index op cuts nothing — no stamp on its A positioning rapid
    const indexOp: Extract<JobOp, { kind: 'index' }> = {
      id: 'op9',
      toolId: 't1',
      featureIds: [],
      kind: 'index',
      angle: 90,
    };
    const indexed = generateJobOp(indexOp, { ...ctx, stock: boxStock4 });
    expect(indexed.moves[0].spindleRpm).toBeUndefined();
  });
});

describe('⇩ floor pick (floorFeatureId)', () => {
  it('new ops start detached', () => {
    const op = newJobOp('pocket', tool, boxStock.materialId, boxStock);
    if (op.kind !== 'pocket') throw new Error('kind');
    expect(op.floorFeatureId).toBeNull();
  });

  it('generation is unchanged while the link resolves', () => {
    const linked = generateJobOp({ ...pocketOp, floorFeatureId: holeCircleId }, ctx);
    expect(linked.error).toBeNull();
    expect(linked.moves.length).toBeGreaterThan(0);
  });

  it('a dangling floor feature fails visibly with the reselect message', () => {
    const res = generateJobOp({ ...pocketOp, floorFeatureId: 'p:prim-gone:circle-x' }, ctx);
    expect(res.error).toContain('no longer exist');
    expect(res.moves).toEqual([]);
  });
});

describe('slice pocket (section plane + band)', () => {
  // a stepped model: 20×20 base (z −6…−4) under a 8×8 boss (z −4…0) —
  // slicing it at different Z levels yields different cross-sections
  const stepped = (() => {
    const base = new THREE.BoxGeometry(20, 20, 2).translate(0, 0, -5).toNonIndexed();
    const boss = new THREE.BoxGeometry(8, 8, 4).translate(0, 0, -2).toNonIndexed();
    const g = new THREE.BufferGeometry();
    const a = base.getAttribute('position');
    const b = boss.getAttribute('position');
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...Array.from(a.array), ...Array.from(b.array)], 3),
    );
    return g;
  })();
  const steppedFeatures = detectFeatures(stepped);
  const steppedCtx: GenContext = {
    ...ctx,
    geometry: stepped,
    features: steppedFeatures,
    sources: sourcesFor(stepped, steppedFeatures, identityTransform(), []),
  };
  const sliceOp: Extract<JobOp, { kind: 'slicePocket' }> = {
    id: 'opS',
    toolId: 't3',
    featureIds: [],
    kind: 'slicePocket',
    regionMode: 'outside',
    sliceDepth: 2, // z −2: inside the boss → the 8×8 section
    startDepth: 0, // the crown
    endDepth: 2,
    allowance: 0,
    stepDown: 1,
    stepOver: 2,
    floorFeatureId: null,
    clearToStock: false,
  };

  it('new ops default: section 2 below the crown, band from the crown down', () => {
    const op = newJobOp('slicePocket', smallTool, boxStock.materialId, boxStock);
    if (op.kind !== 'slicePocket') throw new Error('kind');
    expect(op.regionMode).toBe('outside');
    expect(op.sliceDepth).toBe(2);
    expect(op.startDepth).toBe(0);
    expect(op.floorFeatureId).toBeNull();
    expect(op.stepDown).toBeGreaterThan(0);
  });

  it('outside PROFILES around the section: the tool never enters it', () => {
    const res = generateJobOp(sliceOp, steppedCtx);
    expect(res.error).toBeNull();
    const feed = res.moves.filter((m) => !m.rapid && (m.words.x !== undefined || m.words.y !== undefined));
    expect(feed.length).toBeGreaterThan(0);
    // tool center rides ≥ the tool radius outside the 8×8 section (half 4)
    for (const m of feed) {
      expect(Math.max(Math.abs(m.words.x ?? 0), Math.abs(m.words.y ?? 0))).toBeGreaterThan(3.9);
    }
    // the cut band start→end is stepped by the step-down
    expect(res.moves.some((m) => !m.rapid && m.words.z !== undefined && m.words.z < -0.5)).toBe(true);
  });

/** distance from a point to a centered square section of half-width h */
  const distToSquare = (x: number, y: number, h: number) =>
    Math.hypot(Math.max(Math.abs(x) - h, 0), Math.max(Math.abs(y) - h, 0));

  it('outside + allowance keeps the tool center a full radius + allowance off the part', () => {
    const res = generateJobOp({ ...sliceOp, allowance: 1 }, steppedCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    expect(xy.length).toBeGreaterThan(0);
    for (const m of xy) {
      // Euclidean distance to the 8×8 section ≥ tool radius + allowance
      // (the round-join corner arcs sit at that radius from the corner
      // point, so a max-coordinate bound would be geometrically wrong)
      expect(distToSquare(m.words.x ?? 0, m.words.y ?? 0, 4)).toBeGreaterThan(1.9);
    }
  });

  it('the section comes from the SLICE depth, not the cut band (the clean-body case)', () => {
    // slice plane at −5.5 → the 20×20 base section; the band 0…2 never
    // reaches it, but the profile must still ride the WIDE section —
    // exactly the "avoid the rounded top, cut from a clean body" flow
    const res = generateJobOp({ ...sliceOp, sliceDepth: 5.5 }, steppedCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    expect(xy.length).toBeGreaterThan(0);
    for (const m of xy) {
      // rides the 20×20 base section: at least the tool radius off it
      expect(distToSquare(m.words.x ?? 0, m.words.y ?? 0, 10)).toBeGreaterThan(0.9);
    }
    // and the straight sides sit out at half 10 + tool radius — the 8×8
    // boss band was never used for the section
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) > 10.9 || Math.abs(m.words.y ?? 0) > 10.9)).toBe(true);
  });

  it('inside pockets the section interior over the band', () => {
    const res = generateJobOp({ ...sliceOp, regionMode: 'inside' }, steppedCtx);
    expect(res.error).toBeNull();
    const feed = res.moves.filter((m) => !m.rapid);
    expect(feed.length).toBeGreaterThan(0);
    // tool center stays inside the 8×8 section (inset by the tool radius)
    for (const m of feed) {
      expect(Math.abs(m.words.x ?? 0)).toBeLessThan(4 + 0.1);
      expect(Math.abs(m.words.y ?? 0)).toBeLessThan(4 + 0.1);
    }
  });

  it('fails visibly: no model, and an empty section plane', () => {
    const noModel = generateJobOp(sliceOp, { ...steppedCtx, geometry: null, features: null, sources: [] });
    expect(noModel.error).toContain('needs a loaded model');
    // the plane below the model's body slices empty
    const empty = generateJobOp({ ...sliceOp, sliceDepth: 10 }, steppedCtx);
    expect(empty.error).toContain('section plane');
  });

  it('slices the ROTATED part under an index datum (indexed 4-axis flow)', () => {
    // a 4×4×20 bar standing on the rotary axis (axisZ 0, crown at z 25):
    // indexed 90° it lies along Y, thin in Z (z −2…2). The section at
    // machine z 0 is 4 (X) × 20 (Y) — an A0 slice there would be 4×4.
    const bar = new THREE.BoxGeometry(4, 4, 20).toNonIndexed();
    const barFeatures = detectFeatures(bar);
    const barCtx: GenContext = {
      ...ctx,
      stock: cylStock,
      geometry: bar,
      features: barFeatures,
      sources: sourcesFor(bar, barFeatures, identityTransform(), []),
      datumAngle: 90,
    };
    const indexed: Extract<JobOp, { kind: 'slicePocket' }> = {
      ...sliceOp,
      sliceDepth: 25, // crown 25 − 25 = machine z 0
      startDepth: 22,
      endDepth: 25, // band z 3 → 0 (slips to z 0 by step-down 1)
      clearToStock: false,
    };
    const res = generateJobOp(indexed, barCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter(
      (x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined),
    );
    expect(xy.length).toBeGreaterThan(0);
    // the ring rides the ROTATED section: out past its 10mm Y half-length
    // (an A0 4×4 section could never put a move past 3.9)
    expect(xy.some((m) => Math.abs(m.words.y ?? 0) > 10.9)).toBe(true);
    // and the machine-z band matches the op (a move down at z ≤ 0.1)
    expect(res.moves.some((m) => !m.rapid && (m.words.z ?? 0) < 0.1)).toBe(true);
    // a plane at machine z 2.9 is OUTSIDE the rotated bar (z −2…2) —
    // the empty-section gate proves the rotation applied to the slice
    const outside = generateJobOp({ ...indexed, sliceDepth: 22.1, endDepth: 22 }, barCtx);
    expect(outside.error).toContain('section plane');
  });

  it('the waste-stock toggle clears the excess out to the stock edge', () => {
    // boxStock spans X −30…30, Y −20…20 — the 8×8 section leaves a wide
    // frame that the tool (Ø2) fits: full clearance, all the way out
    const res = generateJobOp({ ...sliceOp, clearToStock: true }, steppedCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    expect(xy.length).toBeGreaterThan(0);
    // stays off the section (≥ tool radius) AND reaches far toward the
    // stock wall (a profile ring never would)
    for (const m of xy) {
      expect(distToSquare(m.words.x ?? 0, m.words.y ?? 0, 4)).toBeGreaterThan(0.9);
    }
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) > 15 || Math.abs(m.words.y ?? 0) > 15)).toBe(true);
    // the ring still runs — appended waste clearing never replaces it
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) < 5.5)).toBe(true);
    expect(res.summary).toContain('waste cleared to the stock edge');
  });

  it('the toggle falls back to the outline ring on a frame thinner than the tool', () => {
    // a stock only 1mm bigger than the 8×8 section per side, centered
    // on it: the frame is 1mm, thinner than the Ø2 tool — ring + a
    // note, not an error
    const tightStock = {
      ...boxStock,
      sizeX: 10,
      sizeY: 10,
      origin: { x: 'mid' as const, y: 'mid' as const, z: 'max' as const },
    } as typeof boxStock;
    const tightCtx = { ...steppedCtx, stock: tightStock };
    const res = generateJobOp({ ...sliceOp, clearToStock: true }, tightCtx);
    expect(res.error).toBeNull();
    expect(res.summary).toContain('waste left standing');
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    for (const m of xy) {
      // the ring: at the tool radius off the section, never near 6 (the
      // stock wall) — a clearance pocket would have reached it
      expect(distToSquare(m.words.x ?? 0, m.words.y ?? 0, 4)).toBeGreaterThan(0.9);
      expect(Math.abs(m.words.x ?? 0)).toBeLessThan(5.1);
      expect(Math.abs(m.words.y ?? 0)).toBeLessThan(5.1);
    }
  });

  it('profile outside + the toggle clears to the stock edge too', () => {
    // the boss's top face (z 0) on the stepped model: profile outside
    const bossTop = steppedFeatures.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && p.point.z > -0.01,
    )!;
    expect(bossTop).toBeDefined();
    const op: Extract<JobOp, { kind: 'profile' }> = {
      id: 'opP',
      toolId: 't3',
      featureIds: [bossTop.id],
      kind: 'profile',
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 1,
      allowance: 0,
      stepDown: 1,
      side: 'outside',
      floorFeatureId: null,
      clearToStock: true,
    };
    const res = generateJobOp(op, steppedCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    // both: the wall ring AND the waste out to the stock edge
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) > 15)).toBe(true);
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) < 5.5)).toBe(true);
    expect(res.summary).toContain('waste cleared to the stock edge');
  });

  it('the ⇩ floor pick applies to slice pockets too', () => {
    const faceId = steppedFeatures.planes.find((p) => Math.abs(p.normal.z) > 0.99)!.id;
    const linked = generateJobOp({ ...sliceOp, floorFeatureId: faceId }, steppedCtx);
    expect(linked.error).toBeNull();
    const dangling = generateJobOp({ ...sliceOp, floorFeatureId: 'p:gone:plane-x' }, steppedCtx);
    expect(dangling.error).toContain('no longer exist');
  });
});
