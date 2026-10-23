import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { Primitive } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  artworkLocalPoints,
  artworkSnapGeometry,
  opEdgeSource,
  parseNamespacedId,
  primitiveGeometry,
  primitivePose,
  resolveFeature,
  sourcesFor,
  splitSelection,
  unmatchedIds,
} from '../featureSources';
import { buildFeatureOverlayData, transformFn } from '../featureOverlays';

const cyl = (id: string, at = { x: 0, y: 0, z: 0 }): Primitive => ({
  kind: 'cylinder',
  id,
  diameter: 20,
  length: 50,
  original: { diameter: 20, length: 50 },
  transform: { ...identityTransform(), position: at },
});

const box = (id: string): Primitive => ({
  kind: 'box',
  id,
  size: { x: 20, y: 10, z: 5 },
  original: { x: 20, y: 10, z: 5 },
  transform: identityTransform(),
});

describe('primitiveGeometry', () => {
  it('aligns the cylinder axis with local X (the machine axis)', () => {
    const g = primitiveGeometry(cyl('prim-1'));
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    // Ø20 × 50: X is the long axis, Y/Z are the 20mm silhouette
    expect(bb.max.x - bb.min.x).toBeCloseTo(50, 5);
    expect(bb.max.y - bb.min.y).toBeCloseTo(20, 5);
    expect(bb.max.z - bb.min.z).toBeCloseTo(20, 5);
  });
});

describe('primitivePose: the render ↔ feature seam', () => {
  // Regression: the Viewport mesh used to bake an extra rotateZ(π/2) on top
  // of the one inside primitiveGeometry, putting the rendered primitive 90°
  // out of sync with the overlays (highlights on the "unrotated" cylinder).
  // The pose must be exactly transformFn — no axis remap may live in the
  // render path.

  const rotated = (rotationDeg: { x: number; y: number; z: number }): Primitive => ({
    ...cyl('prim-1'),
    transform: {
      position: { x: 10, y: 0, z: 15 },
      rotationDeg,
      scale: { x: 1, y: 1, z: 1 },
    },
  });

  const vertices = (p: Primitive): THREE.Vector3[] => {
    const attr = primitiveGeometry(p).getAttribute('position') as THREE.BufferAttribute;
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < attr.count; i++) {
      out.push(new THREE.Vector3().fromBufferAttribute(attr, i));
    }
    return out;
  };

  it.each([
    ['identity', { x: 0, y: 0, z: 0 }],
    ['the user-reported X −90', { x: -90, y: 0, z: 0 }],
    ['standing it upright Y 90', { x: 0, y: 90, z: 0 }],
    ['a compound pose', { x: 30, y: -45, z: 60 }],
  ])('renders every vertex exactly where the feature pipeline lands it (%s)', (_name, rot) => {
    const p = rotated(rot);
    const xf = transformFn(p.transform);
    const pose = primitivePose(p);
    const m = new THREE.Matrix4().compose(pose.position, pose.quaternion, pose.scale);
    for (const v of vertices(p)) {
      const rendered = v.clone().applyMatrix4(m);
      const fromFeatures = xf({ x: v.x, y: v.y, z: v.z });
      // same machine-space point to sub-micron precision
      expect(rendered.distanceTo(fromFeatures)).toBeLessThan(1e-9);
    }
  });

  it('lands a Y-90 cylinder upright in machine space (rim axes ∥ Z)', () => {
    const p: Primitive = {
      ...cyl('prim-1'),
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationDeg: { x: 0, y: 90, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    };
    const [src] = sourcesFor(null, null, identityTransform(), [p]);
    expect(src.features.circles).toHaveLength(2);
    const xf = transformFn(src.transform);
    const zero = xf({ x: 0, y: 0, z: 0 });
    for (const c of src.features.circles) {
      const axis = xf(c.axis).sub(zero).normalize();
      expect(Math.abs(axis.z)).toBeGreaterThan(0.99); // upright rim
      const center = xf(c.center);
      expect(Math.abs(center.x)).toBeLessThan(1e-9); // rims centered on the axis
      expect(Math.abs(center.y)).toBeLessThan(1e-9);
    }
  });
});

describe('sourcesFor: primitive sources', () => {
  it('yields one source per primitive with namespaced ids', () => {
    const sources = sourcesFor(null, null, identityTransform(), [cyl('prim-1')]);
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('prim-1');
    const ids = [
      ...sources[0].features.planes.map((f) => f.id),
      ...sources[0].features.circles.map((f) => f.id),
      ...sources[0].features.edges.map((f) => f.id),
    ];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('p:prim-1:')).toBe(true);
  });

  it('detects a cylinder as 2 outer rim circles + 2 end-cap planes (side is sliver noise)', () => {
    const [src] = sourcesFor(null, null, identityTransform(), [cyl('prim-1')]);
    const circles = src.features.circles;
    expect(circles).toHaveLength(2);
    for (const c of circles) {
      expect(c.radius).toBeCloseTo(10, 1);
      expect(Math.abs(c.axis.x)).toBeGreaterThan(0.99); // axis ∥ local X
      expect(c.inner).toBe(false); // outer boundary: material inside the disc
    }
    const caps = src.features.planes.filter((p) => Math.abs(p.normal.x) > 0.99);
    expect(caps).toHaveLength(2); // the two end faces
    expect(src.features.planes.length).toBeGreaterThanOrEqual(2);
    expect(src.features.edges.length).toBeGreaterThanOrEqual(40); // side slivers
  });

  it('detects a box as 6 planes, 12 edges, no circles', () => {
    const [src] = sourcesFor(null, null, identityTransform(), [box('prim-2')]);
    expect(src.features.planes).toHaveLength(6);
    expect(src.features.edges).toHaveLength(12);
    expect(src.features.circles).toHaveLength(0);
  });

  it('gives identical primitives distinct id namespaces', () => {
    const sources = sourcesFor(null, null, identityTransform(), [
      cyl('prim-1'),
      cyl('prim-2', { x: 10, y: 0, z: 0 }),
    ]);
    const ids = (s: number) => [
      ...sources[s].features.planes.map((f) => f.id),
      ...sources[s].features.circles.map((f) => f.id),
      ...sources[s].features.edges.map((f) => f.id),
    ];
    const a = new Set(ids(0));
    for (const id of ids(1)) expect(a.has(id)).toBe(false);
  });

  it('keeps ids stable across moves (detection is cached by shape, not position)', () => {
    const before = sourcesFor(null, null, identityTransform(), [cyl('prim-1')]);
    const after = sourcesFor(null, null, identityTransform(), [
      cyl('prim-1', { x: 42, y: -3, z: 7 }),
    ]);
    expect(after[0].features.circles.map((c) => c.id)).toEqual(
      before[0].features.circles.map((c) => c.id),
    );
    expect(after[0].features.planes.map((p) => p.id)).toEqual(
      before[0].features.planes.map((p) => p.id),
    );
  });

  it('changes ids on resize (selections dangle visibly)', () => {
    const resized: Primitive = {
      kind: 'cylinder',
      id: 'prim-1',
      diameter: 25,
      length: 50,
      original: { diameter: 20, length: 50 },
      transform: identityTransform(),
    };
    const [src] = sourcesFor(null, null, identityTransform(), [resized]);
    const [base] = sourcesFor(null, null, identityTransform(), [cyl('prim-1')]);
    const baseIds = new Set(base.features.circles.map((c) => c.id));
    for (const id of src.features.circles.map((c) => c.id)) {
      expect(baseIds.has(id)).toBe(false);
    }
  });
});

describe('id resolution', () => {
  const modelGeo = new THREE.BoxGeometry(10, 10, 2).toNonIndexed();
  const modelFeatures = detectFeatures(modelGeo);
  const sources = sourcesFor(modelGeo, modelFeatures, identityTransform(), [cyl('prim-9')]);

  it('parses namespaced ids', () => {
    expect(parseNamespacedId('p:prim-9:circle-ff')).toEqual({ primId: 'prim-9', featureId: 'circle-ff' });
    expect(parseNamespacedId('circle-ff')).toBeNull();
  });

  it('resolves namespaced ids to their primitive and bare ids to the model', () => {
    const primCircle = sources[1].features.circles[0];
    const r = resolveFeature(sources, primCircle.id);
    expect(r?.source.id).toBe('prim-9');
    expect(r?.kind).toBe('circle');
    const modelPlane = modelFeatures.planes[0];
    const m = resolveFeature(sources, modelPlane.id);
    expect(m?.source.id).toBe('model');
    expect(m?.kind).toBe('plane');
  });

  it('resolves bare ids to nothing when no model is loaded', () => {
    const primOnly = sourcesFor(null, null, identityTransform(), [cyl('prim-9')]);
    expect(resolveFeature(primOnly, modelFeatures.planes[0].id)).toBeNull();
  });

  it('partitions mixed selections by source and flags unmatched ids', () => {
    const ids = [
      sources[1].features.circles[0].id,
      modelFeatures.planes[0].id,
      'p:prim-gone:circle-xx',
    ];
    const parts = splitSelection(sources, ids);
    expect(parts.map((p) => p.source.id).sort()).toEqual(['model', 'prim-9']);
    expect(parts.find((p) => p.source.id === 'prim-9')?.ids).toEqual([sources[1].features.circles[0].id]);
    expect(unmatchedIds(sources, ids)).toEqual(['p:prim-gone:circle-xx']);
    expect(unmatchedIds(sources, [modelFeatures.planes[0].id])).toEqual([]);
  });
});
describe('artwork sources', () => {
  const art: Primitive = {
    kind: 'artwork',
    id: 'prim-art',
    paths: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]],
    width: 100,
    height: 50,
    presentation: 'flat',
    wrapDiameter: 16,
    wrapAngle: 90,
    transform: identityTransform(),
  };

  it('flat: local points center the document and flip v (SVG v-down)', () => {
    const pts = artworkLocalPoints(art)[0];
    expect(pts[0]).toEqual({ x: -50, y: 25, z: 0 }); // doc top-left
    expect(pts[1]).toEqual({ x: 50, y: 25, z: 0 });
    expect(pts[2]).toEqual({ x: 50, y: -25, z: 0 }); // doc bottom-right
  });

  it('wrapped: bends onto its own cylinder, uniform scale, centered span', () => {
    const pts = artworkLocalPoints({ ...art, presentation: 'wrapped' })[0];
    const r = 8;
    for (const p of pts) expect(Math.hypot(p.y, p.z)).toBeCloseTo(r, 5);
    // wrap 90° centered on local angle 0: u=0 → θ=−45°, u=100 → +45°
    expect(pts[0].y).toBeCloseTo(-r * Math.SQRT1_2, 4);
    expect(pts[1].y).toBeCloseTo(r * Math.SQRT1_2, 4);
    // uniform mm/unit in BOTH directions — the logo never shears:
    // s = (wrapAngle/360)·π·Ø / width; v extent 50 units → 50·s
    const s = ((90 / 360) * Math.PI * 16) / 100;
    expect(pts[1].x - pts[0].x).toBeCloseTo(0, 9); // same v
    expect(pts[2].x - pts[1].x).toBeCloseTo(-50 * s, 9); // v grew DOWN in doc → −x
  });

  it('sourcesFor: path features namespaced, frame declared, empty mesh', () => {
    const sources = sourcesFor(null, null, identityTransform(), [
      { ...art, presentation: 'wrapped' },
    ]);
    expect(sources).toHaveLength(1);
    const src = sources[0];
    expect(src.artworkFrame).toEqual({ kind: 'wrapped', diameter: 16 });
    expect(src.features.paths).toHaveLength(1);
    expect(src.features.paths[0].id).toBe('p:prim-art:path:0');
    expect(src.features.paths[0].points.length).toBe(3);
    // line work, not a solid: nothing for the raycast pipelines to hit
    expect(src.geometry.getAttribute('position')).toBeUndefined();
  });

  it('artworkSnapGeometry: the REAL line-work bounds, not the empty raycast mesh', () => {
    // primitiveGeometry(artwork) is empty — its ±Infinity box snapped the
    // align/drop buttons to NaN and the artwork vanished. The snap mesh
    // carries the artwork's true local extents instead.
    const g = artworkSnapGeometry(art);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-50); // document centered
    expect(bb.max.x).toBeCloseTo(50);
    expect(bb.min.y).toBeCloseTo(-25); // v flipped, centered
    expect(bb.max.y).toBeCloseTo(25);
    expect(bb.min.z).toBe(0); // flat art lives in its plane
    expect(bb.max.z).toBe(0);
  });

  it('artworkSnapGeometry: wrapped bounds finite, on the wrap Ø, uniform in x', () => {
    const g = artworkSnapGeometry({ ...art, presentation: 'wrapped' });
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    for (const v of [bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z, bb.max.z]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(Math.max(Math.abs(bb.min.y), Math.abs(bb.max.y))).toBeLessThanOrEqual(8 + 1e-6);
    const s = ((90 / 360) * Math.PI * 16) / 100;
    expect(bb.max.x - bb.min.x).toBeCloseTo(50 * s, 6); // 50 units tall in doc
  });

  it('artworkSnapGeometry: path-less artwork snaps about its origin', () => {
    const g = artworkSnapGeometry({ ...art, paths: [] });
    g.computeBoundingBox();
    expect(g.boundingBox!.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(g.boundingBox!.max).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('opEdgeSource', () => {
  const cylStock4 = {
    kind: 'cylinder' as const,
    length: 80,
    xOrigin: 'mid' as const,
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
    axisMode: '4-axis' as const,
    materialId: 'aluminum-6061',
  };
  const faceOp = {
    id: 'jobop-1',
    toolId: 't1',
    featureIds: [],
    kind: 'faceCylinder' as const,
    targetDiameter: 40,
    xStart: -30,
    xEnd: 30,
    stepDown: 1,
    stepOver: null,
    finishAllowance: 0.2,
    rotation: 'cw' as const,
    pattern: 'spiral' as const,
  };

  it('is absent in 3-axis mode (the circles are rotary-op anchors)', () => {
    expect(opEdgeSource([faceOp], { ...cylStock4, axisMode: '3-axis' })).toBeNull();
  });

  it('publishes the stock end rims at the raw Ø and face-op edges at the target Ø', () => {
    const src = opEdgeSource([faceOp], cylStock4)!;
    expect(src).not.toBeNull();
    const byId = new Map(src.features.circles.map((c) => [c.id, c]));
    // stock spans machine X −40…40; rims at the raw Ø50, on the axis
    const rim = byId.get('o:stock:end')!;
    expect(rim.center).toEqual({ x: 40, y: 0, z: 0 });
    expect(rim.radius).toBe(25);
    expect(rim.axis).toEqual({ x: 1, y: 0, z: 0 });
    // the face op's step edges at ITS OWN Ø (the one-circle rule), live
    // with its fields
    const start = byId.get('o:face:jobop-1:start')!;
    expect(start.center).toEqual({ x: -30, y: 0, z: 0 });
    expect(start.radius).toBe(20);
    expect(byId.get('o:face:jobop-1:end')!.center.x).toBe(30);
    // circles follow op edits — the declared geometry recomputes
    const moved = opEdgeSource([{ ...faceOp, xStart: -25 }], cylStock4)!;
    expect(moved.features.circles.find((c) => c.id === 'o:face:jobop-1:start')!.center.x).toBe(-25);
  });

  it('o: ids resolve through the shared pipeline and dangle when the op dies', () => {
    const src = opEdgeSource([faceOp], cylStock4)!;
    const r = resolveFeature([src], 'o:face:jobop-1:start');
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('circle');
    expect(r!.feature.id).toBe('o:face:jobop-1:start');
    // the face op deleted → its circles vanish → the selection dangles
    const after = opEdgeSource([], cylStock4)!;
    expect(resolveFeature([after], 'o:face:jobop-1:start')).toBeNull();
    // the stock rims survive
    expect(resolveFeature([after], 'o:stock:start')).not.toBeNull();
  });

  it('renders and snaps like any source (identity transform, machine-space circles)', () => {
    const src = opEdgeSource([faceOp], cylStock4)!;
    const data = buildFeatureOverlayData(src.features, src.transform);
    expect(data.circleSamples).toHaveLength(4); // 2 stock rims + 2 face edges
    // the ring sits on the stock axis: every sample is radius 25 from it
    for (const s of data.circleSamples[0]) {
      expect(Math.hypot(s.y, s.z)).toBeCloseTo(25, 5);
      expect(s.x).toBeCloseTo(-40, 5);
    }
  });
});
