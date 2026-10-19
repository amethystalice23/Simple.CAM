import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform, rotaryCalibrationOf } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  datumAngleBefore,
  defaultFaceStepOver,
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
      axisMode: '4-axis',
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
    const capCtx: GenContext = { ...chamferCtx, geometry: geo, features: f };
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
