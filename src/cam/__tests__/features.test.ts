import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import { detectFeatures, holesFromCircles } from '../features';
import { boundingRadiusAboutX, axialExtentX } from '../features';
import { transformedPositions } from '../slicing';

function box(size = 2): THREE.BufferGeometry {
  return new THREE.BoxGeometry(size, size, size).toNonIndexed();
}

function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

describe('detectFeatures', () => {
  it('finds 6 planes, 12 edges, and no circles on a cube', () => {
    const f = detectFeatures(box());
    expect(f.planes).toHaveLength(6);
    expect(f.edges).toHaveLength(12);
    expect(f.circles).toHaveLength(0);
    for (const e of f.edges) {
      const l = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z);
      expect(l).toBeCloseTo(2);
    }
  });

  it('gives every feature a stable, unique id', () => {
    const f1 = detectFeatures(box());
    const f2 = detectFeatures(box(2)); // same geometry, fresh instance
    expect(f1.edges.map((e) => e.id).sort()).toEqual(f2.edges.map((e) => e.id).sort());
    expect(new Set(f1.edges.map((e) => e.id)).size).toBe(f1.edges.length);
  });

  it('detects cylinder caps as circles of the right radius', () => {
    const geo = new THREE.CylinderGeometry(1, 1, 2, 32).toNonIndexed();
    const f = detectFeatures(geo);
    const capCircles = f.circles.filter((c) => Math.abs(c.axis.y) > 0.99); // geometry axis is Y
    expect(capCircles.length).toBeGreaterThanOrEqual(2);
    for (const c of capCircles) expect(c.radius).toBeCloseTo(1, 5);
    expect(f.edges.length).toBeGreaterThan(0);
  });

  it('detects outer and hole circles on an extruded plate', () => {
    const f = detectFeatures(plateWithHole());
    const radii = f.circles.map((c) => c.radius).sort((a, b) => a - b);
    expect(radii.some((r) => Math.abs(r - 2) < 0.05)).toBe(true);
    expect(radii.some((r) => Math.abs(r - 5) < 0.05)).toBe(true);
    // the hole loops are flagged inner (opposite their plane's face normal)
    const inner = f.circles.filter((c) => c.inner);
    expect(inner.length).toBeGreaterThanOrEqual(2);
    for (const c of inner) expect(Math.abs(c.radius - 2)).toBeLessThan(0.05);
  });
});

describe('holesFromCircles', () => {
  it('flags Z-axis inner loops as drill targets in machine space', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holes = holesFromCircles(f.circles, identityTransform());
    // one hole per cap (top + bottom), each Ø4
    expect(holes).toHaveLength(2);
    for (const h of holes) {
      expect(h.diameter).toBeCloseTo(4, 1);
      expect(Math.abs(h.center.x)).toBeLessThan(0.05);
      expect(Math.abs(h.center.y)).toBeLessThan(0.05);
    }
    const zs = holes.map((h) => h.center.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(0, 1);
    expect(zs[1]).toBeCloseTo(2, 1);
  });

  it('drops circles whose axis is not the machine drill axis', () => {
    // lay the plate on its side: the hole axis becomes machine Y
    const t = { ...identityTransform(), rotationDeg: { x: 90, y: 0, z: 0 } };
    const f = detectFeatures(plateWithHole());
    expect(holesFromCircles(f.circles, t)).toHaveLength(0);
  });
});

describe('bounding measurements', () => {
  it('measures radius about X and the axial extent', () => {
    const geo = new THREE.CylinderGeometry(3, 3, 10, 24);
    geo.rotateZ(Math.PI / 2); // geometry axis Y → X (machine axis)
    const pos = transformedPositions(geo.toNonIndexed(), identityTransform());
    expect(boundingRadiusAboutX(pos)).toBeCloseTo(3, 1);
    const [x0, x1] = axialExtentX(pos);
    expect(x1 - x0).toBeCloseTo(10, 1);
    expect((x0 + x1) / 2).toBeCloseTo(0, 1);
  });
});