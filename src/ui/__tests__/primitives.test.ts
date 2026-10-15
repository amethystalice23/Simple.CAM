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