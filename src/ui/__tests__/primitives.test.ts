import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { CircleFeature, Stock } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  boxFromPlane,
  cylinderFromCircle,
  defaultBox,
  defaultCylinder,
} from '../primitives';

const cylinderStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  materialId: 'aluminum-6061',
};

describe('cylinderFromCircle', () => {
  const circle: CircleFeature = {
    kind: 'circle',
    id: 'c1',
    center: { x: 0, y: 0, z: 0 },
    axis: { x: 1, y: 0, z: 0 },
    radius: 10,
    inner: false,
  };

  it('shares the circle diameter and center, length from the axial span', () => {
    const prim = cylinderFromCircle(circle, identityTransform(), [0, 100]);
    expect(prim.kind).toBe('cylinder');
    if (prim.kind !== 'cylinder') return;
    expect(prim.diameter).toBeCloseTo(20);
    expect(prim.length).toBeCloseTo(100);
    expect(prim.transform.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('follows the model transform into machine space', () => {
    const t = { ...identityTransform(), position: { x: 5, y: 2, z: 1 } };
    const prim = cylinderFromCircle(circle, t, [10, 60]);
    if (prim.kind !== 'cylinder') return;
    expect(prim.transform.position).toEqual({ x: 5, y: 2, z: 1 });
    expect(prim.length).toBeCloseTo(50);
  });
});

describe('boxFromPlane', () => {
  it('matches a selected cube face and sits on it', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    expect(topIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), topIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    expect(box.size.x).toBeCloseTo(2);
    expect(box.size.y).toBeCloseTo(2);
    expect(box.size.z).toBeCloseTo(5); // default thickness
    expect(box.transform.position.z).toBeCloseTo(1 + 2.5); // face + half thickness
    expect(box.transform.rotationDeg.x).toBeCloseTo(0);
    expect(box.transform.rotationDeg.y).toBeCloseTo(0);
    expect(box.transform.rotationDeg.z).toBeCloseTo(0);
  });

  it('returns null for a plane index with no member triangles', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const f = detectFeatures(geo);
    expect(boxFromPlane(geo, f, identityTransform(), 999)).toBeNull();
  });

  it('sizes box local axes with machine axes — no X/Y swap (10×4 top face)', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    expect(topIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), topIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    expect(box.size.x).toBeCloseTo(10); // machine X extent
    expect(box.size.y).toBeCloseTo(4); // machine Y extent
    expect(box.size.z).toBeCloseTo(5);
    expect(box.transform.position.z).toBeCloseTo(3.5); // top face + half thickness
  });

  it('aligns the box basis with machine axes on X-normal faces', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const sideIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.x - 1) < 1e-6 && Math.abs(p.point.x - 5) < 1e-6,
    );
    expect(sideIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), sideIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    // local X spans machine Y (4), local Y spans machine Z (2)
    expect(box.size.x).toBeCloseTo(4);
    expect(box.size.y).toBeCloseTo(2);
    expect(box.transform.position.x).toBeCloseTo(5 + 2.5); // face + half thickness
    // the rotation must map local X→+Y, Y→+Z, Z→+X exactly
    const r = box.transform.rotationDeg;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180, 'XYZ'),
    );
    const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const lz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(lx.x).toBeCloseTo(0, 5);
    expect(lx.y).toBeCloseTo(1, 5);
    expect(lz.x).toBeCloseTo(1, 5);
  });
});

describe('defaults', () => {
  it('cylinder defaults to stock size, centered', () => {
    const prim = defaultCylinder(cylinderStock);
    if (prim.kind !== 'cylinder') return;
    expect(prim.diameter).toBeCloseTo(50);
    expect(prim.length).toBeCloseTo(100);
    expect(prim.transform.position).toEqual({ x: 50, y: 0, z: 0 });
  });

  it('box defaults to a tab on the stock top', () => {
    const prim = defaultBox(cylinderStock);
    if (prim.kind !== 'box') return;
    expect(prim.size).toEqual({ x: 10, y: 10, z: 5 });
    expect(prim.transform.position.z).toBeCloseTo(25 + 2.5); // stock top + half height
  });
});