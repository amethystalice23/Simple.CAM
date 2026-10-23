import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { CircleFeature, RotaryCalibration } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import type { DetectedFeatures } from '../../cam/features';
import { indexedPointRotation } from '../../cam/indexing';
import {
  chamferTargetsFromSelection,
  cylChamferTargetsFromSelection,
  drillTargetsFromSelection,
  pocketRegionsFromSelection,
} from '../opTargets';

function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

function loopArea(points: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe('pocketRegionsFromSelection', () => {
  it('returns a circle disc with the selection plane height (semantics-free)', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holeCircle = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z - 2) < 0.01,
    );
    expect(holeCircle).toBeDefined();
    const src = pocketRegionsFromSelection(f, [holeCircle!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(Math.PI * 4, 1); // Ø4 hole
    expect(src!.selectionZ).toBeCloseTo(2, 5); // the circle's plane
  });

  it('returns a face footprint with the face height', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    geo.translate(0, 0, -5); // top face at z = −4
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(40, 5);
    expect(src!.selectionZ).toBeCloseTo(-4, 5);
  });

  it('rejects mixing faces and holes in one operation', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holeCircle = f.circles.find((c) => c.inner && Math.abs(c.axis.z) > 0.99)!;
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    expect(() =>
      pocketRegionsFromSelection(f, [holeCircle.id, topPlane!.id], identityTransform()),
    ).toThrowError(/either faces or holes/);
  });

  it('rejects a selection with no usable floor in the frame, with a diagnosis', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const sidePlane = f.planes.find((p) => Math.abs(p.normal.z) < 0.5);
    expect(sidePlane).toBeDefined();
    expect(() =>
      pocketRegionsFromSelection(f, [sidePlane!.id], identityTransform()),
    ).toThrowError(/cannot be pocketed in the cutting frame/);
  });

  it("follows a concave face's OUTLINE, not its bounding box (the cross bug)", () => {
    // an L-shaped top face (two 10×2 bars, union area 36, bounding box
    // 100) — the profile must turn the concave corners, not ride a
    // rounded square around the bounding box
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(10, 0);
    shape.lineTo(10, 2);
    shape.lineTo(2, 2);
    shape.lineTo(2, 10);
    shape.lineTo(0, 10);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
    geo.translate(0, 0, -6); // top face at z −4
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    const region = src!.regions[0];
    // the L outline (6 corners, possibly with seam duplicates) — never the
    // 4-corner bounding rectangle
    expect(region.length).toBeGreaterThanOrEqual(6);
    expect(new Set(region.map((pt) => `${pt.x},${pt.y}`)).size).toBeGreaterThanOrEqual(6);
    expect(loopArea(region)).toBeCloseTo(36, 5); // not 100 (the AABB)
  });

  it("flatten keeps only the outer boundary — interior voids are crossed", () => {
    // the plate-with-hole top face: outer rim + hole rim. Flatten drops
    // the hole: the region is the disc alone (Alice's indent case — the
    // tool must overfly the void to reach the rest of the face)
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(
      f, [topPlane!.id], identityTransform(), undefined, true,
    );
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1); // the hole loop is gone
    const area = loopArea(src!.regions[0]);
    expect(area).toBeGreaterThan(0); // CCW outer
    // the full disc (tessellated rim sits just inside the true circle)
    expect(area).toBeGreaterThan(0.95 * Math.PI * 25);
    expect(area).toBeLessThan(Math.PI * 25);
  });

  it("orients a face's loops: outer CCW, holes CW", () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(2); // the rim + the hole
    const areas = src!.regions.map(loopArea).sort((a, b) => a - b);
    expect(areas[0]).toBeLessThan(0); // the hole, CW
    expect(areas[1]).toBeGreaterThan(0); // the outer rim, CCW
    // tessellated rims sit inside the true circles (chord error): within
    // a few percent, right sign on each
    expect(Math.abs(areas[0])).toBeGreaterThan(0.95 * Math.PI * 4);
    expect(Math.abs(areas[0])).toBeLessThan(Math.PI * 4);
    expect(areas[1]).toBeGreaterThan(0.95 * Math.PI * 25);
    expect(areas[1]).toBeLessThan(Math.PI * 25);
  });

  it('accepts floors within ~10° of horizontal in the cutting frame', () => {
    // a 5°-tilted top face: cos(5°) ≈ 0.996 — inside the loosened gate
    const tilted = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
    tilted.rotateX((5 * Math.PI) / 180);
    const ft = detectFeatures(tilted);
    const tiltedTop = ft.planes.find((p) => p.normal.z > 0.98 && p.normal.z < 0.999)!;
    expect(tiltedTop.normal.z).toBeGreaterThan(0.985);
    const src = pocketRegionsFromSelection(ft, [tiltedTop.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
  });
});

describe('drillTargetsFromSelection', () => {
  it('collects only inner, Z-axis circles', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const ids = f.circles.map((c) => c.id); // select everything
    const targets = drillTargetsFromSelection(f, ids, identityTransform(), 5);
    // two hole loops (top + bottom caps), the outer circles are excluded
    expect(targets).not.toBeNull();
    expect(targets).toHaveLength(2);
    for (const t of targets!) {
      expect(t.x).toBeCloseTo(0, 5);
      expect(t.y).toBeCloseTo(0, 5);
      expect(t.depth).toBe(5);
    }
    const zs = targets!.map((t) => t.topZ).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(0, 5);
    expect(zs[1]).toBeCloseTo(2, 5);
  });

  it('returns null when nothing drillable is selected', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const outer = f.circles.find((c) => !c.inner);
    expect(drillTargetsFromSelection(f, [outer!.id], identityTransform(), 5)).toBeNull();
  });

  it('drills a radial hole when indexed to face the cutter', () => {
    // a plate whose hole faces machine +Y: drillable only after indexing.
    // rotateX turns the plate thickness into radial distance, so the two
    // hole circles sit at radii 6 and 8 — take the far one (y = 8)
    const geo = plateWithHole();
    geo.rotateX(-Math.PI / 2); // hole axis +Z → +Y
    geo.translate(0, 6, 0); // lift off the axis datum plane (axisZ = 0)
    const f = detectFeatures(geo);
    const radialHole = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.y) > 0.99 && c.center.y > 7.9,
    );
    expect(radialHole).toBeDefined();
    // flat: the hole axis is not Z — no target
    expect(drillTargetsFromSelection(f, [radialHole!.id], identityTransform(), 5)).toBeNull();
    // indexed at 90°: the hole rotates to face up at its radial distance
    const rot = indexedPointRotation(90, 0);
    const targets = drillTargetsFromSelection(f, [radialHole!.id], identityTransform(), 5, rot);
    expect(targets).not.toBeNull();
    expect(targets).toHaveLength(1);
    expect(targets![0].x).toBeCloseTo(0, 5);
    expect(targets![0].y).toBeCloseTo(0, 5);
    expect(targets![0].topZ).toBeCloseTo(8, 5); // rim now faces up
  });
});
/** A plate with a SQUARE hole: the top face's outline loops are polygons
 * that cannot circle-match, exercising the poly path and classification. */
function squareHolePlate(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-5, -5);
  shape.lineTo(5, -5);
  shape.lineTo(5, 5);
  shape.lineTo(-5, 5);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-2, -2);
  hole.lineTo(2, -2);
  hole.lineTo(2, 2);
  hole.lineTo(-2, 2);
  hole.closePath();
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

describe('chamferTargetsFromSelection', () => {
  it('accepts inner AND outer circles, with the material side per loop', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const src = chamferTargetsFromSelection(f, f.circles.map((c) => c.id), identityTransform());
    expect(src).not.toBeNull();
    expect(src!.loops).toHaveLength(4); // hole + outer rim, top + bottom
    for (const l of src!.loops) {
      expect(l.kind).toBe('circle');
      if (l.kind === 'circle') {
        expect(l.center.x).toBeCloseTo(0, 5);
        expect(l.center.y).toBeCloseTo(0, 5);
        // hole rims have material outside (the funnel cut), outer rims inside
        expect(l.materialOutside).toBe(l.radius < 3);
      }
    }
  });

  it('traces a face outline into analytic circles when they match', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = chamferTargetsFromSelection(f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    // the top face's outline = outer boundary + hole rim, both circles
    expect(src!.loops).toHaveLength(2);
    const radii = src!.loops
      .filter((l): l is Extract<typeof l, { kind: 'circle' }> => l.kind === 'circle')
      .map((l) => l.radius)
      .sort((a, b) => a - b);
    expect(radii).toHaveLength(2);
    expect(radii[0]).toBeCloseTo(2, 5);
    expect(radii[1]).toBeCloseTo(5, 5);
  });

  it('selecting the rim circle equals selecting the face it bounds', () => {
    // a cylinder's top cap: its entire outline is the rim circle. (THREE's
    // cylinder stands along Y — stand it up along machine Z first.)
    const geo = new THREE.CylinderGeometry(2, 2, 2, 32).rotateX(Math.PI / 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topCircle = f.circles.find(
      (c) => !c.inner && Math.abs(c.center.z - 1) < 1e-6 && Math.abs(c.radius - 2) < 1e-3,
    );
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    expect(topCircle).toBeDefined();
    expect(topPlane).toBeDefined();
    const byCircle = chamferTargetsFromSelection(f, [topCircle!.id], identityTransform());
    const byFace = chamferTargetsFromSelection(f, [topPlane!.id], identityTransform());
    expect(byFace).not.toBeNull();
    // identical loops — the face loop resolves to the same analytic circle
    expect(byFace!.loops).toEqual(byCircle!.loops);
  });

  it('dedupes when a circle and its face are both selected', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holeCircle = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z - 2) < 0.01,
    )!;
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    )!;
    const src = chamferTargetsFromSelection(f, [holeCircle.id, topPlane.id], identityTransform());
    expect(src).not.toBeNull();
    const holeLoops = src!.loops.filter(
      (l) => l.kind === 'circle' && (l as { radius: number }).radius < 3,
    );
    expect(holeLoops).toHaveLength(1); // not once for each selection
    expect(src!.loops).toHaveLength(2); // + the face's outer boundary
  });

  it('classifies unmatched polygon loops by containment', () => {
    const geo = squareHolePlate();
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 2) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = chamferTargetsFromSelection(f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.loops).toHaveLength(2);
    const polys = src!.loops.filter((l): l is Extract<typeof l, { kind: 'poly' }> => l.kind === 'poly');
    expect(polys).toHaveLength(2);
    // the containing (outer) loop bounds material outside; the square hole
    // bounds material inside the face
    const outer = polys.find((l) => l.materialOutside === false)!;
    const inner = polys.find((l) => l.materialOutside === true)!;
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(Math.abs(loopArea(outer.points))).toBeCloseTo(100, 5);
    expect(Math.abs(loopArea(inner.points))).toBeCloseTo(16, 5);
    for (const l of polys) expect(l.z).toBeCloseTo(2, 5);
  });

  it('rejects a selection with no usable edge in the frame, with a diagnosis', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const sidePlane = f.planes.find((p) => Math.abs(p.normal.z) < 0.5);
    expect(sidePlane).toBeDefined();
    expect(() =>
      chamferTargetsFromSelection(f, [sidePlane!.id], identityTransform()),
    ).toThrowError(/cannot be chamfered in the cutting frame/);
  });

  it('chamfers a radial edge when indexed to face the cutter', () => {
    const geo = plateWithHole();
    geo.rotateX(-Math.PI / 2); // hole axis +Z → +Y
    geo.translate(0, 6, 0);
    const f = detectFeatures(geo);
    const radialHole = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.y) > 0.99 && c.center.y > 7.9,
    )!;
    // flat: the rim is radial, not Z — a diagnosis, not silence
    expect(() =>
      chamferTargetsFromSelection(f, [radialHole.id], identityTransform()),
    ).toThrowError(/cannot be chamfered in the cutting frame/);
    const rot = indexedPointRotation(90, 0);
    const src = chamferTargetsFromSelection(f, [radialHole.id], identityTransform(), rot);
    expect(src).not.toBeNull();
    expect(src!.loops).toHaveLength(1);
    const l = src!.loops[0];
    expect(l.kind).toBe('circle');
    if (l.kind === 'circle') {
      expect(l.center.x).toBeCloseTo(0, 5);
      expect(l.center.y).toBeCloseTo(0, 5);
      expect(l.z).toBeCloseTo(8, 5); // the rim now faces up
      expect(l.radius).toBeCloseTo(2, 5);
      expect(l.materialOutside).toBe(true);
    }
  });

  it('returns null for an empty selection', () => {
    const f = detectFeatures(plateWithHole());
    expect(chamferTargetsFromSelection(f, [], identityTransform())).toBeNull();
  });

});

describe('partial circles: the path-following ops refuse broken rims', () => {
  const partial: CircleFeature = {
    kind: 'circle',
    id: 'circle:partial',
    center: { x: 0, y: 0, z: 0 },
    axis: { x: 0, y: 0, z: 1 },
    radius: 5,
    inner: true,
    arcs: [[{ x: 5, y: 0, z: 0 }, { x: 4.98, y: 0.44, z: 0 }, { x: 4.92, y: 0.87, z: 0 }]],
  };
  const feats: DetectedFeatures = {
    planes: [],
    circles: [partial],
    edges: [],
    paths: [],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  };

  it('pocket: refuses with a clear message instead of a phantom disc', () => {
    expect(() => pocketRegionsFromSelection(feats, [partial.id], identityTransform())).toThrowError(
      /partial circle/,
    );
  });

  it('drill: a broken hole rim yields no targets', () => {
    expect(drillTargetsFromSelection(feats, [partial.id], identityTransform(), 1)).toBeNull();
  });

  it('chamfer: refuses a partial circle loudly', () => {
    expect(() =>
      chamferTargetsFromSelection(feats, [partial.id], identityTransform()),
    ).toThrowError(/partial circle/);
  });
});

describe('cylChamferTargetsFromSelection', () => {
  const cal: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };
  const xCircle = (
    id: string,
    x: number,
    dia: number,
    opts: { off?: { y: number; z: number }; inner?: boolean } = {},
  ): CircleFeature => ({
    kind: 'circle',
    id,
    center: { x, y: opts.off?.y ?? 0, z: opts.off?.z ?? 0 },
    axis: { x: 1, y: 0, z: 0 },
    radius: dia / 2,
    inner: opts.inner ?? false,
  });
  const zCircle = (id: string): CircleFeature => ({
    kind: 'circle',
    id,
    center: { x: 0, y: 0, z: 5 },
    axis: { x: 0, y: 0, z: 1 },
    radius: 3,
    inner: true,
  });
  const feats = (...circles: CircleFeature[]): DetectedFeatures => ({
    planes: [],
    circles,
    edges: [],
    paths: [],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  });

  it('accepts full circles coaxial with the rotation axis, on the stock axis', () => {
    const src = cylChamferTargetsFromSelection(
      feats(xCircle('a', 12.5, 40), zCircle('z')),
      ['a'],
      identityTransform(),
      cal,
    );
    expect(src).not.toBeNull();
    expect(src!.edges).toEqual([{ x: 12.5, diameter: 40 }]);
  });

  it('accepts inner and outer circles alike — a ring around the axis is a ring', () => {
    const src = cylChamferTargetsFromSelection(
      feats(xCircle('a', 0, 40, { inner: true })),
      ['a'],
      identityTransform(),
      cal,
    );
    expect(src!.edges).toHaveLength(1);
  });

  it('rejects circles off the stock axis with the ellipse message', () => {
    expect(() =>
      cylChamferTargetsFromSelection(
        feats(xCircle('a', 0, 40, { off: { y: 2, z: 0 } })),
        ['a'],
        identityTransform(),
        cal,
      ),
    ).toThrowError(/off the stock axis|ellipse/);
  });

  it('rejects a Z-facing circle selection with a message that says what to pick', () => {
    expect(() =>
      cylChamferTargetsFromSelection(feats(zCircle('z')), ['z'], identityTransform(), cal),
    ).toThrowError(/no circle around the stock axis/);
  });

  it('refuses a partial circle loudly (a broken rim is no 360° path)', () => {
    const partial = xCircle('p', 0, 40);
    partial.arcs = [[{ x: 0, y: 0, z: 0 }]];
    expect(() =>
      cylChamferTargetsFromSelection(feats(partial), ['p'], identityTransform(), cal),
    ).toThrowError(/partial circle/);
  });

  it('null on an empty selection', () => {
    expect(
      cylChamferTargetsFromSelection(feats(xCircle('a', 0, 40)), [], identityTransform(), cal),
    ).toBeNull();
  });

  it('the flat chamfer gate points a stock-axis circle at the cylinder chamfer op', () => {
    // a circle around the rotation axis can never face up under indexing —
    // the error must say so instead of suggesting a datum fix
    expect(() =>
      chamferTargetsFromSelection(feats(xCircle('a', 0, 40)), ['a'], identityTransform()),
    ).toThrowError(/Cylinder chamfer/);
  });
});
