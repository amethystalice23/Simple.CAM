import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform, rotaryCalibrationOf } from '../../core/types';
import { ROTARY_FEED_DEG_MIN } from '../../cam/faceCylinder';
import type { AxisWords, JobOp, Move, Stock, Tool } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { opEdgeSource, sourcesFor } from '../featureSources';
import { normalizeJobOps } from '../jobFile';
import type { Primitive } from '../../core/types';
import {
  datumAngleBefore,
  defaultFaceStepOver,
  metricPitch,
  defaultStepDown,
  defaultStepOver,
  generateJobOp,
  newJobOp,
  overheadMinutes,
  prefillDepths,
  presetRates,
  toolPresetFor,
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
  // mid/mid in XY: the shared plate fixture sits at the origin — the stock
  // must CONTAIN it or the (correct) footprint clamp bites every fixture
  origin: { x: 'mid', y: 'mid', z: 'max' },
  axisMode: '3-axis',
  materialId: 'aluminum-6061',
}; // spans machine X −30…30, Y −20…20; crown at machine Z0

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
  datumAngle: 0, startA: 0,
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
  flatten: false,
  cutBeyondStock: false, // these fixtures pin other semantics — no dilation
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
  bottomAllowance: 0,
  sideAllowance: 0,
  stepDown: 0.5,
  side: 'online',
  floorFeatureId: null,
  clearToStock: false,
  tabs: null,
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

  it('pocket cut-over ON steps one step-over past the selected outline, OFF stops at it', () => {
    // the plate's top face (r = 5 disc outline, flatten): pocket it down to
    // the face with the 2mm tool (R = 1), stepOver 1. OFF: the boundary
    // pass rides the outline − toolR, tool edge exactly on the outline.
    // ON: the region grows by one step-over first, so the swept cut extends
    // exactly one step-over past the outline — the center path max radius
    // grows by exactly stepOver (both share the polygon approximation).
    const faceId = features.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 0.01,
    )!.id;
    const mk = (cbs: boolean): Extract<JobOp, { kind: 'pocket' }> => ({
      ...pocketOp,
      featureIds: [faceId],
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 4,
      stepOver: 1,
      flatten: true,
      cutBeyondStock: cbs,
    });
    const radius = (res: { moves: Move[] }) =>
      Math.max(
        ...res.moves
          .filter((m) => !m.rapid && m.words.x !== undefined)
          .map((m) => Math.hypot(m.words.x!, m.words.y ?? 0)),
      );
    const on = generateJobOp(mk(true), ctx);
    const off = generateJobOp(mk(false), ctx);
    expect(on.error).toBeNull();
    expect(off.error).toBeNull();
    expect(on.summary).toContain('step-over past the edge');
    // the outline sits at r ≈ 5 (polygon-inscribed): OFF's center path
    // rides ≈ 4 (tool edge on the outline); ON's extends one step-over
    const offR = radius(off);
    const onR = radius(on);
    expect(offR).toBeGreaterThan(3.5);
    expect(offR).toBeLessThan(4.5);
    expect(onR - offR).toBeCloseTo(1, 1); // exactly one step-over further
    // the swept cut (center + toolR) reaches past the r = 5 outline
    expect(onR + 1).toBeGreaterThan(5.9);
  });

  it('pocket cut-over ON is a deliberate step-over: paths stop one step-over past the stock', () => {
    // 2mm tool (R = 1), stepOver 1: the box stock's right edge is x = 30.
    // A face pocket whose region straddles the edge (the plate's r=5 disc
    // translated to span x 23…33): cut-over ON grows the region by one
    // step-over AND dilates the stock clamp to x ≤ 31, so the boundary
    // loop rides the center AT 31 — one step-over perimeter past the
    // stock. OFF clamps the center at the stock border itself (the tool
    // edge overhangs by R — that is how a clean edge is milled).
    const straddle: Extract<JobOp, { kind: 'pocket' }> = {
      ...pocketOp,
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 2,
      stepOver: 1,
      cutBeyondStock: true,
    };
    const geo = plateWithHole();
    geo.translate(28, 0, -6);
    const f = detectFeatures(geo);
    const straddleCtx: GenContext = {
      ...ctx,
      geometry: geo,
      features: f,
      sources: sourcesFor(geo, f, identityTransform(), []),
    };
    // pocket the PLATE face (flatten — the outer boundary alone), which
    // extends past the stock edge
    const faceId = f.planes.find((p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 0.01)!.id;
    const on = generateJobOp({ ...straddle, featureIds: [faceId], flatten: true }, straddleCtx);
    expect(on.error).toBeNull();
    expect(on.summary).toContain('step-over past the edge');
    const cutsOn = on.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(cutsOn.length).toBeGreaterThan(0);
    const maxXOn = Math.max(...cutsOn.map((m) => m.words.x!));
    // the boundary loop rides the DILATED border: exactly stock + stepOver
    expect(maxXOn).toBeCloseTo(31, 1);

    // OFF: hard clamp — the tool center rides the stock border itself
    const off = generateJobOp(
      { ...straddle, featureIds: [faceId], flatten: true, cutBeyondStock: false },
      straddleCtx,
    );
    expect(off.error).toBeNull();
    const cutsOff = off.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(cutsOff.length).toBeGreaterThan(0);
    const maxXOff = Math.max(...cutsOff.map((m) => m.words.x!));
    expect(maxXOff).toBeCloseTo(30, 1);
    expect(maxXOn).toBeGreaterThan(maxXOff);
  });

  it('profile cut-over ON keeps the loop intact past the stock edge (permission, not extension)', () => {
    // the plate's outer rim (r = 5 at the origin) against boxStock whose
    // Y spans 0…40: an online wall pass at y = −5 sits 5mm outside the
    // stock — cut-over ON must still close the FULL loop (no span
    // comments, a bare level comment), OFF clips it to open spans
    const online: Extract<JobOp, { kind: 'profile' }> = {
      id: 'prof-cut',
      toolId: 't3',
      featureIds: [],
      kind: 'profile',
      selectionIs: 'floor',
      startDepth: 0,
      endDepth: 2,
      bottomAllowance: 0,
      sideAllowance: 0,
      stepDown: 2,
      finishingOnly: false,
      side: 'online',
      floorFeatureId: null,
      clearToStock: false,
      tabs: null,
      cutBeyondStock: true,
    };
    const geo = plateWithHole();
    geo.translate(0, 0, -6); // cap top at z −4, crown at 0
    const f = detectFeatures(geo);
    const rim = f.circles.find((c) => !c.inner && c.axis.z > 0.99)!.id; // outer rim
    // a narrow stock (Y ±2): the r=5 rim loop pokes out both sides
    const edgeCtx: GenContext = {
      ...ctx,
      stock: { ...boxStock, sizeY: 4 },
      geometry: geo,
      features: f,
      sources: sourcesFor(geo, f, identityTransform(), []),
    };
    const on = generateJobOp({ ...online, featureIds: [rim] }, edgeCtx);
    expect(on.error).toBeNull();
    // the full closed loop: the continuous descent of an unclipped loop
    // (entry.ts era, 2026-10-29) — one descent comment, never a span one
    expect(on.moves.some((m) => m.comment === 'continuous descent to z-2.00')).toBe(true);
    expect(on.moves.some((m) => m.comment?.includes('span '))).toBe(false);
    // and it really does leave the stock: y reaches −5
    const ys = on.moves.filter((m) => m.words.y !== undefined).map((m) => m.words.y!);
    expect(Math.min(...ys)).toBeLessThanOrEqual(-5 + 1e-6);

    const off = generateJobOp(
      { ...online, featureIds: [rim], cutBeyondStock: false },
      edgeCtx,
    );
    expect(off.error).toBeNull();
    // clipped: open spans replace the closed loop
    expect(off.moves.some((m) => m.comment?.includes('span '))).toBe(true);
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
      datumAngle: 90, startA: 0,
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
    // rim rotated to z=8; even pecks (hole depth 5, peck 2 → n=3): the
    // first peck plunge is rim − 5/3
    expect(Math.max(...plunges)).toBeCloseTo(8 - 5 / 3, 5);
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
    tabs: null,
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

  it('waterlines the INDEXED part in 4-axis mode: rotated frame, self-limited ladder', () => {
    // Alice's indexed workflow (2026-10-25): the datum rotation maps the
    // part into the cutting frame, and the ladder needs no Z-stop knob —
    // it is bounded by the model's own floor in that orientation and by
    // the moat-only stop. A 4×4×20 bar indexed 90° lies along Y (thin in
    // Z, z −2…2, vertical sides): the levels above the bar clear its
    // column, then the ladder stops at the bar's top — a constant
    // cross-section is one full-depth profile pass, not N waterline
    // levels — and nothing is cut near the model floor or the stock
    // bottom (the holder below the part stays).
    const bar = new THREE.BoxGeometry(4, 4, 20).toNonIndexed();
    const barFeatures = detectFeatures(bar);
    const barCtx: GenContext = {
      ...ctx,
      stock: cylStock,
      geometry: bar,
      features: barFeatures,
      sources: sourcesFor(bar, barFeatures, identityTransform(), []),
      datumAngle: 90, startA: 0,
    };
    const op: Extract<JobOp, { kind: 'waterline' }> = {
      id: 'wl',
      toolId: 't1',
      featureIds: [],
      kind: 'waterline',
      allowance: 0.2,
      stepDown: 2,
      stepOver: 1,
      margin: null,
      cutBeyondStock: false,
    };
    const res = generateJobOp(op, barCtx);
    expect(res.error).toBeNull();
    expect(res.summary).toContain('ladder stopped');
    const cuts = res.moves.filter((m) => !m.rapid && m.feed > 0);
    expect(cuts.length).toBeGreaterThan(0);
    // the rotated frame: the moat/column passes run along the bar's 20mm
    // Y length, past its ±10 ends
    const maxY = Math.max(...cuts.map((m) => Math.abs(m.words.y ?? 0)));
    expect(maxY).toBeGreaterThan(10.5);
    // the ladder ended at the bar's top: the deepest cut sits above the
    // bar's body — under the two-consecutive moat-only stop the ladder
    // descends one level past the widest section, so the deepest cut is
    // its plane (z 1.2 = bar top 2 − stepDown 0.5 + allowance 0.2 − one
    // more level 0.5... the pin: strictly between the bar top and its
    // floor (−2), never near the stock bottom (−25)
    const minZ = Math.min(...cuts.map((m) => m.words.z ?? Infinity));
    expect(minZ).toBeGreaterThan(-2);
    expect(minZ).toBeLessThan(4);
  });

  it('fails visibly: no model, and an empty section plane', () => {
    const noModel = generateJobOp(sliceOp, { ...steppedCtx, geometry: null, features: null, sources: [] });
    expect(noModel.error).toContain('needs a loaded model');
    // the plane below the model's body slices empty
    const empty = generateJobOp({ ...sliceOp, sliceDepth: 10 }, steppedCtx);
    expect(empty.error).toContain('section plane');
  });

  it('raster-contours the model: serpentine rows on the compensated surface, indexed frame', () => {
    // Phase B wiring (PLAN.md): the surface pass targets the whole model
    // in the cutting frame — no selection, crown ceiling, model surface
    // z. A 10×10×4 box sunk 2mm below the crown (plate-with-hole stock:
    // crown z 0): the raster sweeps its flat top at z −2 (allowance 0 →
    // to size) and never an A word.
    const brick = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
    const brickFeatures = detectFeatures(brick);
    const brickCtx: GenContext = {
      ...ctx,
      geometry: brick,
      features: brickFeatures,
      transform: { ...identityTransform(), position: { x: 0, y: 0, z: -4 } },
      sources: sourcesFor(brick, brickFeatures, identityTransform(), []),
    };
    const op = newJobOp('rasterContour', smallTool, 'aluminum-6061', boxStock) as Extract<
      JobOp,
      { kind: 'rasterContour' }
    >;
    const res = generateJobOp(op, brickCtx);
    expect(res.error).toBeNull();
    expect(res.summary).toContain('raster row');
    const cuts = res.moves.filter((m) => !m.rapid && m.feed > 0 && m.words.x !== undefined);
    expect(cuts.length).toBeGreaterThan(0);
    expect(res.moves.every((m) => m.words.a === undefined)).toBe(true);
    // every cut rides the box top: z −2, the box's own surface
    let z: number | null = null;
    for (const m of res.moves) {
      if (m.words.z !== undefined) z = m.words.z;
      if (!m.rapid && m.feed > 0 && m.words.x !== undefined) {
        expect(z!).toBeCloseTo(-2, 5);
      }
    }
    // no plunge runs deep: the box top is 2 below the crown — a rough-less
    // surface pass that would bury the tool warns instead
    expect(res.summary).not.toContain('waterline contour first');
  });

  it('rasterContour: row angle 90 runs rows along Y, angle 0 stays X-only', () => {
    // Alice's 2026-10-25 call: rows at an arbitrary angle, default 0 = X.
    // At 90° the roles swap — within a row Y varies and X stays constant
    // (the mirror of the default's X-varying rows). Same brick as the
    // flat-top test above: 10×10×4 sunk 2 below the crown.
    const brick = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
    const brickFeatures = detectFeatures(brick);
    const brickCtx: GenContext = {
      ...ctx,
      geometry: brick,
      features: brickFeatures,
      transform: { ...identityTransform(), position: { x: 0, y: 0, z: -4 } },
      sources: sourcesFor(brick, brickFeatures, identityTransform(), []),
    };
    const mk = (angle: number) =>
      ({
        ...newJobOp('rasterContour', smallTool, 'aluminum-6061', boxStock),
        angle,
      }) as Extract<JobOp, { kind: 'rasterContour' }>;

    const r0 = generateJobOp(mk(0), brickCtx);
    expect(r0.error).toBeNull();
    // default rows: within a segment x varies, y never does
    for (const m of r0.moves) {
      if (!m.rapid && m.feed > 0 && m.words.x !== undefined) {
        expect(m.words.y).toBeUndefined();
      }
    }
    expect(r0.summary).not.toContain('rows at');

    const r90 = generateJobOp(mk(90), brickCtx);
    expect(r90.error).toBeNull();
    expect(r90.summary).toContain('rows at 90°');
    // 90° rows: within a row x holds constant in VALUE (the kernel emits
    // x on every feed move) and the sweep advances along Y — on this flat
    // top each row is ONE long feed move, so a y word on a feed cut is the
    // Y-sweep evidence (angle 0 emits zero y words on feed moves). Rows
    // are distributed along X, each row's own x.
    let sawYRow = false;
    let sawSecondRowX = false;
    let z: number | null = null;
    let rowX: number | null = null;
    let firstRowX: number | null = null;
    const finishRow = () => {
      if (rowX !== null) {
        if (firstRowX === null) firstRowX = rowX;
        else if (Math.abs(rowX - firstRowX) > 1e-6) sawSecondRowX = true;
      }
      rowX = null;
    };
    for (const m of r90.moves) {
      if (m.words.z !== undefined) z = m.words.z;
      const feedCut = !m.rapid && m.feed > 0;
      if (!feedCut || (m.words.x === undefined && m.words.y === undefined)) {
        finishRow();
        continue;
      }
      if (rowX === null && m.words.x !== undefined) rowX = m.words.x;
      if (m.words.x !== undefined && rowX !== null) {
        expect(Math.abs(m.words.x - rowX)).toBeLessThan(1e-6);
      }
      if (m.words.y !== undefined) {
        sawYRow = true;
        expect(z!).toBeCloseTo(-2, 5);
      }
    }
    finishRow();
    expect(sawYRow).toBe(true);
    expect(sawSecondRowX).toBe(true);
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
      datumAngle: 90, startA: 0,
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
      bottomAllowance: 0,
      sideAllowance: 0,
      stepDown: 1,
      side: 'outside',
      floorFeatureId: null,
      clearToStock: true,
      tabs: null,
    };
    const res = generateJobOp(op, steppedCtx);
    expect(res.error).toBeNull();
    const xy = res.moves.filter((x) => !x.rapid && (x.words.x !== undefined || x.words.y !== undefined));
    // both: the wall ring AND the waste out to the stock edge
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) > 15)).toBe(true);
    expect(xy.some((m) => Math.abs(m.words.x ?? 0) < 5.5)).toBe(true);
    expect(res.summary).toContain('waste cleared to the stock edge');
  });

  it('spiral carve: stock defaults, generation, and the 4-axis gate', () => {
    const op = newJobOp('spiralCarve', tool, cylStock.materialId, cylStock);
    if (op.kind !== 'spiralCarve') throw new Error('kind');
    expect(op.surfaceDiameter).toBeCloseTo(50, 5); // the stock surface
    expect(op.count).toBeGreaterThanOrEqual(1);
    const res = generateJobOp(op, { ...ctx, stock: cylStock, datumAngle: 0 });
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
    // the first move carries the op's spindle stamp like every cutting op
    expect(res.moves[0].spindleRpm).toBe(18000);
    // 3-axis rejects it
    const flat = generateJobOp(op, { ...ctx, stock: boxStock, datumAngle: 0 });
    expect(flat.error).toContain('4-axis');
  });

  it('metricPitch maps standard nominal sizes to their coarse pitch', () => {
    expect(metricPitch(6)).toBe(1.0);
    expect(metricPitch(4)).toBe(0.7);
    expect(metricPitch(10)).toBe(1.5);
    expect(metricPitch(20)).toBe(2.5);
    expect(metricPitch(24)).toBe(3.0);
    expect(metricPitch(6.3)).toBeNull(); // not a standard size
  });

  it('new thread ops prefill the standard pitch for their nominal size', () => {
    const op = newJobOp('thread', chamferTool, cylStock.materialId, cylStock);
    if (op.kind !== 'thread') throw new Error('kind');
    // stock R 25 → nominal 49 — not standard: the generic 2mm fallback
    expect(op.nominalDiameter).toBeCloseTo(49, 5);
    expect(op.pitch).toBe(2);
    expect(op.tolerance).toBe(0); // nominal geometry by default
  });

  it('the ⇩ floor pick applies to slice pockets too', () => {
    const faceId = steppedFeatures.planes.find((p) => Math.abs(p.normal.z) > 0.99)!.id;
    const linked = generateJobOp({ ...sliceOp, floorFeatureId: faceId }, steppedCtx);
    expect(linked.error).toBeNull();
    const dangling = generateJobOp({ ...sliceOp, floorFeatureId: 'p:gone:plane-x' }, steppedCtx);
    expect(dangling.error).toContain('no longer exist');
  });
});

describe('spiral carve spin: the UI op model reaches the generator phase', () => {
  // datum 30 with the machine at A350 exercises the shortest-rotation
  // positioning, like the cam-level spin tests
  const spinCtx: GenContext = { ...ctx, stock: cylStock, datumAngle: 30, startA: 350 };
  const spiralOp: Extract<JobOp, { kind: 'spiralCarve' }> = {
    kind: 'spiralCarve', id: 'op-spin', toolId: 't1',
    surfaceDiameter: 50, xStart: -20, xEnd: 20, spiralAngle: 45,
    count: 1, depth: 1, width: 1, stepDown: 0.5, rotation: 'cw',
    featureIds: [],
  };
  const aWords = (res: ReturnType<typeof generateJobOp>) =>
    res.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);

  it('spin 90 shifts every strand A word by +90, landing strand 1 at datum + spin', () => {
    const base = generateJobOp(spiralOp, spinCtx);
    const spun = generateJobOp({ ...spiralOp, spin: 90 }, spinCtx);
    expect(base.error).toBeNull();
    expect(spun.error).toBeNull();
    const baseA = aWords(base);
    const spunA = aWords(spun);
    // DATUM DISCIPLINE (Alice's 2026-10-28 rule): each op appends one
    // RETURN move onto the borrowed datum (startA 350) — so the A-word lists
    // differ only by that shared return; the cutting/positioning words all
    // shift by +90, and the LAST word of both is the same return to 350.
    expect(spunA).toHaveLength(baseA.length);
    for (let i = 0; i < baseA.length - 1; i++) {
      expect(spunA[i] - baseA[i]).toBeCloseTo(90, 6);
    }
    expect(spunA[spunA.length - 1]).toBeCloseTo(350, 6); // the shared return
    expect(baseA[baseA.length - 1]).toBeCloseTo(350, 6);
    // and finalA is the borrowed datum back — the rule itself
    expect(spun.finalA).toBeCloseTo(350, 6);
    expect(base.finalA).toBeCloseTo(350, 6);
    // the first positioning rapid lands on datum 30 + spin 90 (mod 360) —
    // still within a half-turn of the machine A it came from (350).
    // (find it BEFORE the return move — the return is also a rapid A word)
    const rotate = spun.moves.find(
      (m) => m.rapid && m.words.a !== undefined && !/datum discipline/.test(m.comment ?? ''),
    )!;
    const phase = ((rotate.words.a! % 360) + 360) % 360;
    expect(phase).toBeCloseTo(120, 6);
    expect(Math.abs(rotate.words.a! - 350)).toBeLessThanOrEqual(180);
  });

  it('spin absent and spin 0 generate identical output (the default is a no-op)', () => {
    const absent = generateJobOp(spiralOp, spinCtx);
    const zero = generateJobOp({ ...spiralOp, spin: 0 }, spinCtx);
    expect(zero.moves).toEqual(absent.moves);
    expect(zero.summary).toBe(absent.summary);
  });
});

describe('per-material spindle RPM (Makera tool presets)', () => {
  const engraver: Tool = {
    id: 't-eng', name: '60deg Engraver', type: 'vbit', diameter: 3.175,
    vAngle: 60, tipDiameter: 0.1, spindleRpm: 18000, // the metal row's RPM
    presets: [
      { material: 'Aluminum', spindleRpm: 18000, feed: 600, plungeFeed: 240, stepDown: 0.4, rampFeed: 360 },
      { material: 'Plastic', spindleRpm: 9000, feed: 1000, plungeFeed: 500, stepDown: 0.8, rampFeed: 600 },
    ],
  };

  it('the stock material picks the tool preset row — RPM included', () => {
    expect(presetRates('pocket', engraver, 'delrin').spindleRpm).toBe(9000);
    expect(presetRates('pocket', engraver, 'aluminum-6061').spindleRpm).toBe(18000);
    // feed and plunge already came from the row; RPM now does too
    expect(presetRates('pocket', engraver, 'delrin')).toEqual({
      feed: 1000, plungeFeed: 500, spindleRpm: 9000,
    });
  });

  it('a tool with no material-matched preset keeps its singular RPM', () => {
    expect(presetRates('pocket', smallTool, 'delrin').spindleRpm).toBe(smallTool.spindleRpm);
  });

  it('generation stamps the material-matched RPM onto the first move', () => {
    // spiral carve with the delrin stock: S9000 rides the first move, not S18000
    const spiralCtx = {
      ...ctx,
      tools: [...ctx.tools, engraver],
      stock: { ...ctx.stock, materialId: 'delrin', axisMode: '4-axis' } as Stock,
    };
    const res = generateJobOp(
      {
        kind: 'spiralCarve', id: 'op-sc', toolId: engraver.id,
        surfaceDiameter: 40, xStart: 0, xEnd: 10, spiralAngle: 45,
        count: 1, depth: 1, width: 1, stepDown: 0.5, rotation: 'cw',
        featureIds: [],
      },
      spiralCtx,
    );
    expect(res.error).toBeNull();
    expect(res.moves[0].spindleRpm).toBe(9000);
  });

  it('the ⚡ spindle override still wins over the preset row', () => {
    const res = generateJobOp(
      {
        kind: 'spiralCarve', id: 'op-sc2', toolId: engraver.id,
        surfaceDiameter: 40, xStart: 0, xEnd: 10, spiralAngle: 45,
        count: 1, depth: 1, width: 1, stepDown: 0.5, rotation: 'cw',
        featureIds: [], rates: { spindleRpm: 12000 },
      },
      {
        ...ctx,
        tools: [...ctx.tools, engraver],
        stock: { ...ctx.stock, materialId: 'delrin', axisMode: '4-axis' } as Stock,
      },
    );
    expect(res.moves[0].spindleRpm).toBe(12000);
  });
});

describe('toolPresetFor material aliases', () => {
  // Makera's tool library has six rows: Aluminum, Brass, Copper, Hardwood,
  // Softwood, Plastic — no dedicated Delrin/acetal or acrylic rows
  const makeraTool: Tool = {
    id: 't-mk', name: 'Makera Metal endmill', type: 'flat', diameter: 6,
    spindleRpm: 18000, // the metal row's RPM — what the singular value carries
    presets: [
      { material: 'Aluminum', spindleRpm: 18000, feed: 420, plungeFeed: 180, stepDown: 0.8, rampFeed: 250 },
      { material: 'Plastic', spindleRpm: 10000, feed: 900, plungeFeed: 300, stepDown: 2, rampFeed: 550 },
    ],
  };

  it("delrin stock reads Makera's Plastic row — RPM and plunge included", () => {
    const p = toolPresetFor(makeraTool, 'delrin')!;
    expect(p.material).toBe('Plastic');
    expect(p.spindleRpm).toBe(10000); // not the tool's singular metal S18000
    expect(p.plungeFeed).toBe(300); // the figure MakeraStudio shows for it
    // acrylic is Makera's other plastic
    expect(toolPresetFor(makeraTool, 'acrylic-cast')!.spindleRpm).toBe(10000);
    expect(toolPresetFor(makeraTool, 'aluminum-6061')!.material).toBe('Aluminum');
  });

  it('feeds through generation: a delrin job gets the Plastic row rates', () => {
    expect(presetRates('pocket', makeraTool, 'delrin')).toEqual({
      feed: 900,
      plungeFeed: 300,
      spindleRpm: 10000,
    });
  });

  it('no matching row → null (callers fall back to the built-in table)', () => {
    expect(toolPresetFor({ ...makeraTool, presets: undefined }, 'delrin')).toBeNull();
  });
});

describe('engrave generation', () => {
  const art: Primitive = {
    kind: 'artwork',
    id: 'prim-art',
    paths: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]],
    width: 100,
    height: 50,
    presentation: 'flat',
    wrapDiameter: 16,
    wrapAngle: 90,
    transform: identityTransform(),
  };
  const ctxFor = (primitive: Primitive, stock: Stock): GenContext => ({
    stock,
    geometry: null,
    features: null,
    transform: identityTransform(),
    tools: [tool],
    primitives: [primitive],
    sources: sourcesFor(null, null, identityTransform(), [primitive]),
    datumAngle: 0,
    startA: 0,
  });
  const op = (featureIds: string[]): JobOp => ({
    kind: 'engrave',
    id: 'engrave-1',
    toolId: 't1',
    featureIds,
    depth: 1,
    stepDown: 1,
  });

  it('flat artwork: follows the transformed paths at the cut feed (G94)', () => {
    const flat = { ...art, transform: { ...identityTransform(), position: { x: 0, y: 0, z: 10 } } };
    const res = generateJobOp(op(['p:prim-art:path:0']), ctxFor(flat, cylStock));
    expect(res.error).toBeNull();
    const cut = res.moves.filter((m) => !m.rapid);
    expect(cut[0].words.z).toBeCloseTo(9, 6); // surface 10 − 1 deep
    const trace = cut[1];
    // doc line v=0 → local y +25 (centered, v-up); u=100 → local x +50
    expect(trace.words.x).toBeCloseTo(50, 6);
    expect(trace.words.y).toBeCloseTo(25, 6);
    expect(trace.feed).toBeGreaterThan(0); // preset-derived cut feed
    expect(trace.words.a).toBeUndefined();
    expect(res.moves[0].spindleRpm).toBeDefined();
    expect(res.summary).toContain('1 path');
  });

  it('wrapped artwork: circumferential path cuts at the rotary limit', () => {
    const wrapped = { ...art, presentation: 'wrapped' as const };
    const res = generateJobOp(op(['p:prim-art:path:0']), ctxFor(wrapped, {
      ...cylStock,
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
    }));
    expect(res.error).toBeNull();
    const cut = res.moves.filter((m) => !m.rapid);
    // the doc's 100-unit path over wrapAngle 90° at Ø16: one A sweep.
    // A is ABSOLUTE accumulated: positioned at the datum + u0 = −45°,
    // the quarter-turn sweep ends at +45°.
    const position = res.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    expect(position.words.a).toBeCloseTo(-45, 3);
    const sweep = cut[1];
    expect(sweep.words.a).toBeCloseTo(45, 3);
    expect(sweep.words.x).toBeUndefined();
    expect(sweep.feed).toBeCloseTo(ROTARY_FEED_DEG_MIN, 3); // G94 deg/min at the limit
    expect(res.summary).toContain('1 path');
  });

  it('wrapped artwork ignores an index datum — the cut stays where the artwork is', () => {
    // an Index op at 90° precedes the engrave: the machine approaches
    // from A=90, but the artwork is ABSOLUTELY positioned (its angle is
    // set in the Model tab) — the cut targets the artwork's own angles,
    // not datum + artwork. Before the fix the cut came out rotated BY the
    // index angle, offset from the displayed artwork.
    const wrapped = { ...art, presentation: 'wrapped' as const };
    const ctx = {
      ...ctxFor(wrapped, {
        ...cylStock,
        calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
      }),
      datumAngle: 90,
      startA: 90,
    };
    const res = generateJobOp(op(['p:prim-art:path:0']), ctx);
    expect(res.error).toBeNull();
    const cut = res.moves.filter((m) => !m.rapid);
    const position = res.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    // the artwork's absolute angles (−45° → +45°), phase-positioned by
    // shortest rotation from the machine's post-index A=90 — never the
    // datum-shifted 45° → 135°
    expect(position.words.a).toBeCloseTo(-45, 3);
    expect(cut[1].words.a).toBeCloseTo(45, 3);
  });

  it('a 360° wrap spun 180° straddles the A seam and cuts straight through it', () => {
    // full-turn wrap: doc x ∈ [0,100] → th ∈ ±180 (the seam rides the doc
    // edges). Spinning 180° about X moves the seam to the doc MIDDLE, so a
    // mid-document stroke straddles machine ±180° — the old code errored
    // here; the unwrap now continues through the seam and the cut rotates
    // on across it (the post re-zeros A after the op).
    const spun = {
      ...art,
      presentation: 'wrapped' as const,
      wrapAngle: 360,
      // dense samples either side of the doc middle (x=50): th_local
      // ∓36 → machine th ∓36−180
      paths: [[{ x: 60, y: 10 }, { x: 50, y: 10 }, { x: 40, y: 10 }]],
      transform: {
        ...identityTransform(),
        rotationDeg: { x: 180, y: 0, z: 0 },
      },
    };
    const res = generateJobOp(op(['p:prim-art:path:0']), ctxFor(spun, {
      ...cylStock,
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
    }));
    expect(res.error).toBeNull();
    const cut = res.moves.filter((m) => !m.rapid);
    const position = res.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    // first sample: doc x=60 → th_local +36 → machine −144°
    expect(position.words.a).toBeCloseTo(-144, 3);
    // the sweep runs on THROUGH the seam: −144 → −180 → −216 (never the
    // raw atan2 jump to +144)
    expect(cut[1].words.a).toBeCloseTo(-180, 3);
    expect(cut[2].words.a).toBeCloseTo(-216, 3);
  });

  it('refuses mixed frames and non-artwork selections', () => {
    const flatRes = generateJobOp(
      op(['p:prim-art:path:0']),
      ctxFor(art, cylStock),
    );
    expect(flatRes.error).toBeNull();
    // a model/primitive feature id resolves in no artwork source
    const modelPick = generateJobOp(
      op(['p:nope:circle:xx']),
      ctxFor(art, cylStock),
    );
    expect(modelPick.error).toMatch(/artwork|no longer exist|select artwork/);
  });
});

describe('engrave generation: laser tool', () => {
  const laserTool: Tool = {
    id: 'tL',
    name: 'Laser Module',
    type: 'laser',
    diameter: 0.1,
    spindleRpm: 20, // the power% slot (documented reuse)
    focus: 1.5,
  };
  const art: Primitive = {
    kind: 'artwork',
    id: 'prim-art',
    paths: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]],
    width: 100,
    height: 50,
    presentation: 'flat',
    wrapDiameter: 16,
    wrapAngle: 90,
    transform: { ...identityTransform(), position: { x: 0, y: 0, z: 10 } },
  };
  const ctx: GenContext = {
    stock: cylStock,
    geometry: null,
    features: null,
    transform: identityTransform(),
    tools: [laserTool],
    primitives: [art],
    sources: sourcesFor(null, null, identityTransform(), [art]),
    datumAngle: 0,
    startA: 0,
  };
  const op: JobOp = {
    kind: 'engrave',
    id: 'engrave-1',
    toolId: 'tL',
    featureIds: ['p:prim-art:path:0'],
    depth: 0.5,
    stepDown: 0.25,
  };

  it('resolves power from the tool slot, stamps focus height, never a spindle line', () => {
    const res = generateJobOp(op, ctx);
    expect(res.error).toBeNull();
    const z = res.moves.find((m) => m.words.z !== undefined)!;
    expect(z.words.z).toBeCloseTo(11.5, 6); // artwork surface 10 + focus 1.5
    expect(res.moves.some((m) => m.spindleRpm !== undefined)).toBe(false);
    expect(res.moves.some((m) => m.power === 0.2)).toBe(true); // 20% → S0.2
    // feed from the material's laser column (aluminum: Makera's own 100)
    const cut = res.moves.find((m) => !m.rapid && m.words.x !== undefined && m.power === 0.2)!;
    expect(cut.feed).toBe(100);
  });

  it('refuses the laser on cutting ops', () => {
    const pocket = newJobOp('pocket', laserTool, cylStock.materialId, cylStock);
    const res = generateJobOp(pocket, ctx);
    expect(res.error).toMatch(/laser only fits the engrave/);
  });
});

describe('cylinder chamfer (edge circles → ring passes)', () => {
  const vbit: Tool = {
    id: 'v9',
    name: '60° engraving bit',
    type: 'vbit',
    diameter: 3.175,
    vAngle: 60,
    tipDiameter: 0.2,
    spindleRpm: 12000,
  };
  const face: JobOp = {
    id: 'jobop-1',
    toolId: 't1',
    featureIds: [],
    kind: 'faceCylinder',
    targetDiameter: 40, // r=20 anchor
    xStart: -30,
    xEnd: 30,
    stepDown: 1,
    stepOver: null,
    finishAllowance: 0.2,
    rotation: 'cw',
    pattern: 'spiral',
  };
  // the job's own edge circles ride the sources like any feature provider
  const chamCtx: GenContext = {
    stock: cylStock, // Ø50, spans machine X −40…40, axisZ 0
    geometry: null,
    features: null,
    transform: identityTransform(),
    tools: [tool, vbit],
    primitives: [],
    sources: [opEdgeSource([face], cylStock)!],
    datumAngle: 0,
    startA: 0,
  };
  const rimOp: JobOp = {
    id: 'op9',
    toolId: 'v9',
    featureIds: ['o:stock:end'],
    kind: 'cylChamfer',
    depth: 0.5,
    stepDown: 0.3,
    rotation: 'cw',
  };

  it('chamfers the stock end rim: tip below the circle, one revolution per level', () => {
    const res = generateJobOp(rimOp, chamCtx);
    expect(res.error).toBeNull();
    // Ø50 rim (r=25), depth 0.5, step 0.3 → two levels: 24.7 then 24.5
    const sweeps = res.moves.filter((m) => m.words.a !== undefined && !m.rapid);
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0].words.a).toBeCloseTo(360, 6);
    expect(sweeps[1].words.a).toBeCloseTo(720, 6);
    // X parked at the stock end (40) through the cut
    expect(res.moves.find((m) => m.words.x !== undefined)!.words.x).toBeCloseTo(40, 6);
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges[1].words.z!).toBeCloseTo(24.5, 6); // finished flank
    // the op's spindle rides the first move like every cutting op
    expect(res.moves[0].spindleRpm).toBe(12000);
    expect(res.summary).toMatch(/1 edge/);
    // DATUM DISCIPLINE: the ring sweeps end at 720 accumulated — the SAME
    // spoke as the borrowed datum (0 mod 360), so no return spin is emitted
    // (whole turns are equivalent orientation; the post's inter-op G92.4
    // A0 S0 shrink drops the pile without motion) — and finalA is the
    // borrowed datum back, the next op's startA, never the pile
    expect(res.moves[res.moves.length - 1].comment ?? '').not.toMatch(/datum discipline/);
    expect(res.finalA).toBeCloseTo(0, 6);
  });

  it('depth 0 on a face-op step edge ladders from the stock surface to the anchor', () => {
    const stepOp: JobOp = {
      ...rimOp,
      featureIds: ['o:face:jobop-1:start'],
      depth: 0, // anchor ON the Ø40 circle, cut up-and-out along the wall
    };
    const res = generateJobOp(stepOp, chamCtx);
    expect(res.error).toBeNull();
    // surface r=25 → anchor r=20 is 5mm at 0.3 steps: 17 levels, ending
    // exactly on the anchor
    const sweeps = res.moves.filter((m) => m.words.a !== undefined && !m.rapid);
    expect(sweeps).toHaveLength(17);
    const plunges = res.moves.filter((m) => m.words.z !== undefined && !m.rapid);
    expect(plunges[plunges.length - 1].words.z!).toBeCloseTo(20, 6);
    expect(res.moves.find((m) => m.words.x !== undefined)!.words.x).toBeCloseTo(-30, 6);
  });

  it('refuses flat tools and non-coaxial selections with explaining errors', () => {
    expect(generateJobOp({ ...rimOp, toolId: 't1' }, chamCtx).error).toMatch(/needs a V-bit/);
    // the model's Z-facing hole rim is no stock-axis circle
    const modelCtx: GenContext = {
      ...chamCtx,
      sources: [
        ...sourcesFor(geometry, features, identityTransform(), []),
        opEdgeSource([], cylStock)!,
      ],
    };
    expect(generateJobOp({ ...rimOp, featureIds: [holeCircleId] }, modelCtx).error).toMatch(
      /no circle around the stock axis/,
    );
    // a dangling op-edge id (face op deleted) fails visibly — the STOCK
    // rim survives, but the face-op edge is gone with its op
    const dangle = generateJobOp({ ...rimOp, featureIds: ['o:face:jobop-1:start'] }, modelCtx);
    expect(dangle.error).toMatch(/no longer exist|reselect/);
    // and the stock rim still generates fine against the same sources
    expect(generateJobOp(rimOp, modelCtx).error).toBeNull();
  });

  it('needs 4-axis mode', () => {
    const res = generateJobOp(rimOp, { ...chamCtx, stock: boxStock });
    expect(res.error).toMatch(/4-axis/);
  });
});

describe('honest time estimate (wrapper overhead)', () => {
  // 4-axis cylinder stock, the shipped coupon jobs' shape
  const carveCtx: GenContext = { ...ctx, stock: cylStock, datumAngle: 0, startA: 0 };
  const carve: Extract<JobOp, { kind: 'spiralCarve' }> = {
    kind: 'spiralCarve',
    id: 'op-ov',
    toolId: 't1',
    surfaceDiameter: 50, // the stock surface
    xStart: -30,
    xEnd: 30,
    spiralAngle: 30,
    count: 2,
    depth: 1,
    width: 3,
    stepDown: 0.5,
    rotation: 'cw',
    featureIds: [],
  };
  /** the generator's cutting-only figure, as the op summary quotes it
   * (rounded to 0.1 min — the assertions below allow for that rounding) */
  const quotedCutting = (res: ReturnType<typeof generateJobOp>): number => {
    const m = /~([\d.]+) min/.exec(res.summary ?? '');
    expect(m, `summary lacks a minutes quote: ${res.summary}`).toBeTruthy();
    return Number(m![1]);
  };

  it('spiral carve: minutes = cutting×1.1 + overheadMinutes (rapid travel + ramp)', () => {
    const res = generateJobOp(carve, carveCtx);
    expect(res.error).toBeNull();
    expect(res.spindleRpm).toBe(18000); // the stamped S-word speed, threaded to the next op
    // absent prevRpm = a cold spindle: the overhead carries a full spin-up
    const spinUpMin = 18000 / 1800 / 60;
    const ovh = overheadMinutes(res.moves, 0, undefined, 18000);
    expect(ovh).toBeGreaterThan(spinUpMin); // rapid travel on top of the ramp
    expect(Math.abs(res.minutes - (quotedCutting(res) * 1.1 + ovh))).toBeLessThanOrEqual(0.06);
    // honest: the estimate exceeds the cutting-only figure the summary quotes
    expect(res.minutes).toBeGreaterThan(quotedCutting(res));
  });

  it('prevRpm threading: same speed charges no ramp; 0 or absent charges the full spin-up', () => {
    const warm = generateJobOp(carve, { ...carveCtx, prevRpm: 18000 });
    const cold = generateJobOp(carve, { ...carveCtx, prevRpm: 0 });
    const absent = generateJobOp(carve, carveCtx);
    expect(warm.error).toBeNull();
    expect(cold.error).toBeNull();
    const spinUpMin = 18000 / 1800 / 60;
    expect(cold.minutes - warm.minutes).toBeCloseTo(spinUpMin, 9);
    expect(absent.minutes).toBeCloseTo(cold.minutes, 9); // absent = cold spindle
    // the ramp is the only difference — the move list is untouched
    expect(warm.moves).toEqual(cold.moves);
  });

  it('overheadMinutes times linear rapids at the axis rates (Z at 600, not 1200)', () => {
    const g0 = (words: AxisWords): Move => ({ words, feed: 0, rapid: true });
    const moves: Move[] = [
      g0({ a: 90 }), // 90° from startA at 3600°/min
      g0({ x: 0, y: 0, z: 10 }), // FIRST x/y/z move: previous unknown → charges 0
      g0({ x: 100 }), // 100mm at 1200
      g0({ z: 0 }), // 10mm at the Z rate 600
      g0({ x: 100, y: 50 }), // y-only: 50mm at 1200
    ];
    const exact = 90 / 3600 + 100 / 1200 + 10 / 600 + 50 / 1200;
    expect(overheadMinutes(moves, 0, undefined, undefined)).toBeCloseTo(exact, 9);
    // the Z leg really runs at 600 — an all-1200 guess would halve it
    const atXYRate = 90 / 3600 + 100 / 1200 + 10 / 1200 + 50 / 1200;
    expect(exact - atXYRate).toBeCloseTo(10 / 1200, 9);
    // cutting moves update the tracked position: a rapid after a cut is
    // measured from where the cut ended
    const withCut: Move[] = [
      ...moves,
      { words: { x: 40, y: 0 }, feed: 600 }, // G94 cut over to (40, 0)
      g0({ x: 0 }), // 40mm back at 1200
    ];
    expect(overheadMinutes(withCut, 0, undefined, undefined)).toBeCloseTo(exact + 40 / 1200, 9);
  });

  it('a G94 pocket op carries the overhead: cutting×1.1 + rapids + ramp', () => {
    const warm = generateJobOp(pocketOp, { ...ctx, prevRpm: 18000 });
    const cold = generateJobOp(pocketOp, { ...ctx, prevRpm: 0 });
    expect(warm.error).toBeNull();
    expect(warm.spindleRpm).toBe(18000);
    expect(cold.minutes - warm.minutes).toBeCloseTo(18000 / 1800 / 60, 9);
    // the pocket's move list is full of rapids — the overhead part is real
    expect(warm.moves.some((m) => m.rapid)).toBe(true);
    const ovh = overheadMinutes(warm.moves, 0, 18000, 18000);
    expect(ovh).toBeGreaterThan(0);
    expect(Math.abs(warm.minutes - (quotedCutting(warm) * 1.1 + ovh))).toBeLessThanOrEqual(0.06);
    expect(warm.minutes).toBeGreaterThan(quotedCutting(warm));
  });

  it('laser engrave: rapid overhead present, never a spindle ramp', () => {
    const laserTool: Tool = {
      id: 'tL',
      name: 'Laser Module',
      type: 'laser',
      diameter: 0.1,
      spindleRpm: 20, // the power% slot (documented reuse)
      focus: 1.5,
    };
    const art: Primitive = {
      kind: 'artwork',
      id: 'prim-art',
      // two strokes, far apart: the rapid between them is charged
      paths: [
        [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        [{ x: 0, y: 40 }, { x: 100, y: 40 }],
      ],
      width: 100,
      height: 50,
      presentation: 'flat',
      wrapDiameter: 16,
      wrapAngle: 90,
      transform: { ...identityTransform(), position: { x: 0, y: 0, z: 10 } },
    };
    const laserCtx: GenContext = {
      stock: cylStock,
      geometry: null,
      features: null,
      transform: identityTransform(),
      tools: [laserTool],
      primitives: [art],
      sources: sourcesFor(null, null, identityTransform(), [art]),
      datumAngle: 0,
      startA: 0,
    };
    const op: JobOp = {
      kind: 'engrave',
      id: 'eng-l',
      toolId: 'tL',
      featureIds: ['p:prim-art:path:0', 'p:prim-art:path:1'],
      depth: 0.5,
      stepDown: 0.25,
    };
    const cold = generateJobOp(op, laserCtx);
    // a "running spindle" before it must not charge a ramp either way
    const warm = generateJobOp(op, { ...laserCtx, prevRpm: 18000 });
    expect(cold.error).toBeNull();
    expect(cold.spindleRpm).toBeUndefined(); // beam power, not a spindle speed
    expect(warm.minutes).toBeCloseTo(cold.minutes, 9);
    const ovh = overheadMinutes(cold.moves, 0, undefined, undefined);
    expect(ovh).toBeGreaterThan(0); // the rapid travel is charged
    expect(Math.abs(cold.minutes - (quotedCutting(cold) * 1.1 + ovh))).toBeLessThanOrEqual(0.06);
    expect(cold.minutes).toBeGreaterThan(quotedCutting(cold));
  });
});

describe("'Finishing pass only' (Alice, 2026-10-26 — one explicit rough/finish switch, every ladder op)", () => {
  /** distinct commanded cut-Z values on a feed move (the level count).
   *  Ramped entries (entry.ts) descend as coordinated XY+Z feed legs —
   *  a run of them collapses to its LANDING z, the cut level it feeds. */
  const cutPlanes = (res: ReturnType<typeof generateJobOp>): Set<string> => {
    const planes = new Set<string>();
    let rampLanding: string | null = null;
    const flush = () => {
      if (rampLanding !== null) {
        planes.add(rampLanding);
        rampLanding = null;
      }
    };
    for (const m of res.moves) {
      if (m.rapid) {
        flush();
        continue;
      }
      if (m.words.z === undefined) continue;
      if (m.words.x !== undefined) {
        rampLanding = m.words.z.toFixed(3);
        continue;
      }
      flush();
      planes.add(m.words.z.toFixed(3));
    }
    flush();
    return planes;
  };

  it('pocket: one level at the floor, straight down', () => {
    const rough = generateJobOp({ ...pocketOp, startDepth: 0, endDepth: 6, stepDown: 0.5 }, ctx);
    const fin = generateJobOp(
      { ...pocketOp, startDepth: 0, endDepth: 6, stepDown: 0.5, finishingOnly: true },
      ctx,
    );
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    expect(rough.summary).toContain('/ 12 level(s)');
    expect(fin.summary).toContain('/ 1 level(s)');
    expect(fin.summary).toContain('finishing pass only');
    expect(cutPlanes(fin).size).toBe(1); // straight down to the −6 floor
    expect([...cutPlanes(fin)][0]).toBeCloseTo(-6, 2);
  });

  it('profile: one full-depth wall level', () => {
    const rough = generateJobOp({ ...profileOp, startDepth: 4, endDepth: 5 }, ctx);
    const fin = generateJobOp(
      { ...profileOp, startDepth: 4, endDepth: 5, finishingOnly: true },
      ctx,
    );
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    expect(rough.summary).toContain('/ 2 level(s)');
    expect(fin.summary).toContain('/ 1 level(s)');
    expect(fin.summary).toContain('finishing pass only');
  });

  it('slice pocket: the whole band in one level (ring + appended waste frame)', () => {
    // the plate-with-hole section (r5 disc) at 2 below the crown on the
    // 60×40 box: outside ring + the clearToStock waste frame, both
    // collapsing to the single floor level
    const op: Extract<JobOp, { kind: 'slicePocket' }> = {
      id: 'sf',
      toolId: 't3',
      featureIds: [],
      kind: 'slicePocket',
      regionMode: 'outside',
      sliceDepth: 5, // plane z −5: inside the plate body (caps −6…−4)
      startDepth: 0,
      endDepth: 4,
      allowance: 0,
      stepDown: 1,
      stepOver: 2,
      floorFeatureId: null,
      clearToStock: true,
      tabs: null,
    };
    const rough = generateJobOp(op, ctx);
    const fin = generateJobOp({ ...op, finishingOnly: true }, ctx);
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    expect(rough.summary).toContain('waste cleared to the stock edge');
    expect(fin.summary).toContain('finishing pass only');
    expect(cutPlanes(rough).size).toBe(4);
    expect(cutPlanes(fin).size).toBe(1); // ring AND frame on one plane
  });

  it('face cylinder: the roughing ladder skipped — one pass to the target Ø', () => {
    const mk = (finishingOnly: boolean) =>
      ({
        ...newJobOp('faceCylinder', tool, cylStock.materialId, cylStock),
        targetDiameter: 49, // surface Ø50 → 0.5mm radial total
        stepDown: 0.3,
        finishAllowance: 0.2,
        finishingOnly,
      }) as JobOp;
    const rough = generateJobOp(mk(false), { ...ctx, stock: cylStock });
    const fin = generateJobOp(mk(true), { ...ctx, stock: cylStock });
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    // count the distinct plunge planes: surface z25 − depth
    const planes = (r: ReturnType<typeof generateJobOp>) =>
      new Set(
        r.moves
          .filter((m) => !m.rapid && m.words.z !== undefined)
          .map((m) => m.words.z!.toFixed(3)),
      );
    // rough: 0.3 at the finish-allowance plane (z24.7) + the 0.5 finish (z24.5)
    expect(planes(rough).size).toBe(2);
    expect(planes(rough).has('24.500')).toBe(true);
    // finishing: straight to 0.5 (z24.5), nothing else
    expect(planes(fin).size).toBe(1);
    expect([...planes(fin)][0]).toBe('24.500');
    expect(fin.summary).toContain('finishing pass only');
  });

  it('spiral carve: one full-depth sweep per strand (no retrace ladder)', () => {
    const mk = (finishingOnly: boolean): Extract<JobOp, { kind: 'spiralCarve' }> => ({
      kind: 'spiralCarve',
      id: 'op-fin-sc',
      toolId: 't1',
      featureIds: [],
      surfaceDiameter: 50,
      xStart: -20,
      xEnd: 20,
      spiralAngle: 45,
      count: 1,
      depth: 1,
      width: 3,
      stepDown: 0.5, // rough retraces: [0.5, 1]
      finishingOnly,
      rotation: 'cw',
    });
    const scCtx: GenContext = { ...ctx, stock: cylStock, datumAngle: 0, startA: 0 };
    const rough = generateJobOp(mk(false), scCtx);
    const fin = generateJobOp(mk(true), scCtx);
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    expect(rough.summary).toContain('2 sweep(s)');
    expect(fin.summary).toContain('1 sweep(s)');
    expect(fin.summary).toContain('finishing pass only');
  });

  it('thread: the groove at full depth once, plus the spring pass', () => {
    const mk = (finishingOnly: boolean): Extract<JobOp, { kind: 'thread' }> => ({
      kind: 'thread',
      id: 'op-fin-th',
      toolId: 't5', // the 90° chamfer bit
      featureIds: [],
      nominalDiameter: 20,
      xStart: -10,
      xEnd: 10,
      pitch: 2, // groove depth = (2/4)/tan45 = 0.5
      starts: 1,
      tolerance: 0,
      stepDown: 0.2, // rough: [0.2, 0.4, 0.5]
      finishingOnly,
      rotation: 'cw',
      surfaceDiameter: 20, // pre-turned Ø20 rod: no air descent
    });
    const thCtx: GenContext = {
      ...ctx,
      stock: cylStock,
      tools: [...ctx.tools, chamferTool],
      datumAngle: 0,
      startA: 0,
    };
    const rough = generateJobOp(mk(false), thCtx);
    const fin = generateJobOp(mk(true), thCtx);
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    const sweeps = (r: ReturnType<typeof generateJobOp>) =>
      Number(/(\d+) sweep\(s\)/.exec(r.summary!)![1]);
    expect(sweeps(rough)).toBe(4); // 3 levels + spring
    expect(sweeps(fin)).toBe(2); // full depth + spring
    expect(fin.summary).toContain('finishing pass only');
  });

  it('engrave: one full-depth pass along the paths', () => {
    const art: Primitive = {
      kind: 'artwork',
      id: 'prim-fin-art',
      paths: [[{ x: 0, y: 0 }, { x: 100, y: 0 }]],
      width: 100,
      height: 50,
      presentation: 'flat',
      wrapDiameter: 16,
      wrapAngle: 90,
      transform: { ...identityTransform(), position: { x: 0, y: 0, z: 10 } },
    };
    const artCtx: GenContext = {
      stock: cylStock,
      geometry: null,
      features: null,
      transform: identityTransform(),
      tools: [tool],
      primitives: [art],
      sources: sourcesFor(null, null, identityTransform(), [art]),
      datumAngle: 0,
      startA: 0,
    };
    const mk = (finishingOnly: boolean): Extract<JobOp, { kind: 'engrave' }> => ({
      kind: 'engrave',
      id: 'op-fin-eng',
      toolId: 't1',
      featureIds: ['p:prim-fin-art:path:0'],
      depth: 1,
      stepDown: 0.25, // rough: [0.25, 0.5, 0.75, 1]
      finishingOnly,
    });
    const rough = generateJobOp(mk(false), artCtx);
    const fin = generateJobOp(mk(true), artCtx);
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    expect(cutPlanes(rough).size).toBe(4);
    expect(cutPlanes(fin).size).toBe(1);
    expect(fin.summary).toContain('finishing pass only');
  });

  it('cylinder chamfer: one revolution at the final flank depth', () => {
    // a face-op step edge (Ø40 circle): depth 0 anchors ON it and the
    // ladder descends the 5mm wall (surface r25 → tip r20) in 1mm levels
    const faceOp: JobOp = {
      id: 'jobop-1',
      toolId: 't1',
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: 40,
      xStart: -30,
      xEnd: 30,
      stepDown: 1,
      finishingOnly: false,
      stepOver: null,
      finishAllowance: 0.2,
      rotation: 'cw',
      pattern: 'spiral',
    };
    const edgeCtx: GenContext = {
      ...ctx,
      stock: cylStock,
      geometry: null,
      features: null,
      primitives: [],
      sources: [opEdgeSource([faceOp], cylStock)!],
      tools: [...ctx.tools, chamferTool],
      datumAngle: 0,
      startA: 0,
    };
    const mk = (finishingOnly: boolean): Extract<JobOp, { kind: 'cylChamfer' }> => ({
      id: 'op-fin-cc',
      toolId: 't5',
      featureIds: ['o:face:jobop-1:start'],
      kind: 'cylChamfer',
      depth: 0, // anchor on the Ø40 circle — ladder the 5mm wall above it
      stepDown: 1,
      finishingOnly,
      rotation: 'cw',
    });
    const rough = generateJobOp(mk(false), edgeCtx);
    const fin = generateJobOp(mk(true), edgeCtx);
    expect(rough.error).toBeNull();
    expect(fin.error).toBeNull();
    const sweeps = (r: ReturnType<typeof generateJobOp>) =>
      r.moves.filter((m) => m.words.a !== undefined && !m.rapid).length;
    expect(sweeps(rough)).toBe(5); // r24, 23, 22, 21, 20
    expect(sweeps(fin)).toBe(1); // straight to r20
    expect(fin.summary).toContain('finishing pass only');
  });

  it('raster contour: old step-down-0 saves migrate to the checked toggle', () => {
    // the replaced convention: stepDown 0 (or absent) WAS finishing-only
    const base = {
      id: 'r1',
      toolId: 't3',
      featureIds: [],
      kind: 'rasterContour' as const,
      allowance: 0,
      stepOver: 1,
      angle: 0,
    };
    expect(normalizeJobOps([{ ...base, stepDown: 0 } as JobOp])[0]).toMatchObject({
      finishingOnly: true,
    });
    expect(normalizeJobOps([{ ...base } as JobOp])[0]).toMatchObject({ finishingOnly: true });
    expect(normalizeJobOps([{ ...base, stepDown: 0.6 } as JobOp])[0]).toMatchObject({
      finishingOnly: false,
    });
    // an explicit flag always wins over the derivation
    expect(
      normalizeJobOps([{ ...base, stepDown: 0.6, finishingOnly: true } as JobOp])[0],
    ).toMatchObject({ finishingOnly: true });
    // other kinds: absent stays absent — old jobs round-trip byte-identical
    const pocket = normalizeJobOps([{ ...pocketOp, id: 'pk' } as JobOp])[0];
    expect((pocket as { finishingOnly?: boolean }).finishingOnly).toBeUndefined();
  });

  it('waterline finishing: step-down ≤ allowance is legal (rung density, never a skip)', () => {
    // Alice's report (2026-10-26): "it gets very confused if the step-down
    // is the same or smaller than the allowance and says 'nothing to rough' —
    // which is wrong. Step-down is how fine the rungs on the ladder are;
    // allowance is simply raising the model by that amount and applying an
    // offset." In finishing mode the allowance-skip is GONE: every level
    // scrubs, and allowance only raises/offsets.
    const bar = new THREE.BoxGeometry(8, 8, 20).toNonIndexed();
    const barFeatures = detectFeatures(bar);
    const barCtx: GenContext = {
      ...ctx,
      geometry: bar,
      features: barFeatures,
      sources: sourcesFor(bar, barFeatures, identityTransform(), []),
    };
    const mk = (finishingOnly: boolean): Extract<JobOp, { kind: 'waterline' }> => ({
      id: 'wl-fin',
      toolId: 't3',
      featureIds: [],
      kind: 'waterline',
      allowance: 0.5,
      stepDown: 0.5, // == allowance: rough self-skips, finishing does not
      stepOver: 1,
      margin: 3,
      cutBeyondStock: false,
      finishingOnly,
    });
    const rough = generateJobOp(mk(false), barCtx);
    expect(rough.error).toMatch(/nothing to rough|allowance/); // honest for roughing
    const fin = generateJobOp(mk(true), barCtx);
    expect(fin.error).toBeNull(); // the confusion is gone
    expect(fin.moves.length).toBeGreaterThan(0);
    expect(fin.summary).toContain('finishing pass only');
  });

  it('raster contour: new ops default to the single surface pass', () => {
    const op = newJobOp('rasterContour', smallTool, boxStock.materialId, boxStock);
    if (op.kind !== 'rasterContour') throw new Error('kind');
    expect(op.finishingOnly).toBe(true);
    expect(op.stepDown).toBeGreaterThan(0); // the roughing preset for when unchecked
    // finishing-only generation ignores the step-down: a single surface pass
    const res = generateJobOp(
      { ...op, stepDown: 0.01 },
      (() => {
        const brick = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
        return {
          ...ctx,
          geometry: brick,
          features: detectFeatures(brick),
          sources: sourcesFor(brick, detectFeatures(brick), identityTransform(), []),
          transform: { ...identityTransform(), position: { x: 0, y: 0, z: -4 } },
        };
      })(),
    );
    expect(res.error).toBeNull();
    expect(res.summary).toContain('finishing pass only');
    expect(res.summary).not.toContain('step down');
  });
});

describe('thread mill generation (3-axis, the 2026-10-28 op)', () => {
  // a slim M4×0.7 mill that comfortably fits the Ø4 fixture bore
  const threadmillTool: Tool = {
    id: 'tm1',
    name: 'M4 thread mill',
    type: 'threadmill',
    diameter: 1.6,
    pitch: 0.7,
    shaftDiameter: 3.175,
    fluteLength: 10,
    spindleRpm: 10000,
  };
  const threadMillOp: Extract<JobOp, { kind: 'threadMill' }> = {
    id: 'opT',
    toolId: 'tm1',
    featureIds: [holeCircleId],
    kind: 'threadMill',
    internal: true,
    nominalDiameter: 4,
    pitch: 0.7,
    starts: 1,
    tolerance: 0,
    rotation: 'cw',
    stepOver: 0,
    startDepth: 4, // the rim, 4mm below the crown
    endDepth: 6, // the 2mm bore, rim to floor
  };
  const threadCtx: GenContext = { ...ctx, tools: [...ctx.tools, threadmillTool] };

  it('threads the selected bore: bottom-up helix at Rc, no error', () => {
    const res = generateJobOp(threadMillOp, threadCtx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(50);
    expect(res.summary).toContain('internal');
    expect(res.summary).toContain('cw');
    // the radial entry lands on the helix radius: nominal/2 − toolR = 1.2
    const entry = res.moves.find(
      (m) => !m.rapid && m.words.x !== undefined && m.words.y !== undefined && m.words.z !== undefined,
    );
    expect(entry).toBeDefined();
    expect(Math.hypot(entry!.words.x!, entry!.words.y!)).toBeCloseTo(1.2, 5);
  });

  it('refuses a non-threadmill tool with a clear message', () => {
    const bad = generateJobOp({ ...threadMillOp, toolId: 't1' }, threadCtx);
    expect(bad.error).toMatch(/needs a thread mill/);
    expect(bad.moves).toHaveLength(0);
  });

  it('refuses a pitch the tool cannot mill', () => {
    const bad = generateJobOp({ ...threadMillOp, pitch: 1 }, threadCtx);
    expect(bad.error).toMatch(/pitch/);
  });

  it('refuses a zero-length thread', () => {
    const bad = generateJobOp({ ...threadMillOp, endDepth: threadMillOp.startDepth }, threadCtx);
    expect(bad.error).toMatch(/length must be positive/);
  });
});
