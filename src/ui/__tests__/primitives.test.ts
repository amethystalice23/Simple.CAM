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
  nextPrimitiveId,
  resizePrimitive,
  revertPrimitive,
  scaleForSize,
  scaledDims,
  seedPrimitiveIds,
} from '../primitives';

const cylinderStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
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
    expect(prim.original).toEqual({ diameter: 50, length: 100 });
  });

  it('box defaults to a tab on the stock top', () => {
    const prim = defaultBox(cylinderStock);
    if (prim.kind !== 'box') return;
    expect(prim.size).toEqual({ x: 10, y: 10, z: 5 });
    expect(prim.transform.position.z).toBeCloseTo(25 + 2.5); // stock top + half height
  });
});

describe('size editing', () => {
  it('edits one axis alone when uniform is off', () => {
    const dims = scaledDims({ x: 10, y: 4, z: 2 }, 'x', 12, false);
    expect(dims).toEqual({ x: 12, y: 4, z: 2 });
  });

  it('scales all axes by the edit ratio when uniform is on', () => {
    const dims = scaledDims({ x: 10, y: 4, z: 2 }, 'x', 20, true);
    expect(dims.x).toBeCloseTo(20);
    expect(dims.y).toBeCloseTo(8);
    expect(dims.z).toBeCloseTo(4);
  });

  it('derives model scale from an edited display size', () => {
    const native = { x: 10, y: 4, z: 2 };
    const displayed = { ...native };
    const scale = scaleForSize(native, displayed, 'x', 5, false);
    expect(scale.x).toBeCloseTo(0.5);
    expect(scale.y).toBeCloseTo(1);
    // uniform: halving X halves everything
    const uni = scaleForSize(native, displayed, 'x', 5, true);
    expect(uni).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('resizes and reverts primitives, keeping originals', () => {
    const box = defaultBox(cylinderStock);
    if (box.kind !== 'box') return;
    const grown = resizePrimitive(box, 'x', 20, true);
    if (grown.kind !== 'box') return;
    expect(grown.size.x).toBeCloseTo(20);
    expect(grown.size.y).toBeCloseTo(20); // uniform
    const reverted = revertPrimitive(grown, 'x');
    if (reverted.kind !== 'box') return;
    expect(reverted.size.x).toBeCloseTo(10);
    expect(reverted.size.y).toBeCloseTo(20); // only the edited axis reverts
    const cyl = defaultCylinder(cylinderStock);
    if (cyl.kind !== 'cylinder') return;
    const bigger = resizePrimitive(cyl, 'x', 100, false);
    if (bigger.kind !== 'cylinder') return;
    expect(bigger.diameter).toBeCloseTo(100);
    expect(bigger.length).toBeCloseTo(100); // untouched
    const restored = revertPrimitive(bigger, 'x');
    if (restored.kind !== 'cylinder') return;
    expect(restored.diameter).toBeCloseTo(50);
  });

  it('uniform revert restores every dimension', () => {
    const box = defaultBox(cylinderStock);
    if (box.kind !== 'box') return;
    const changed = resizePrimitive(resizePrimitive(box, 'x', 20, true), 'y', 8, false);
    const reverted = revertPrimitive(changed, 'x', true);
    if (reverted.kind !== 'box') return;
    expect(reverted.size).toEqual({ x: 10, y: 10, z: 5 });
  });
});
describe('seedPrimitiveIds', () => {
  it('seeds the id counter past loaded ids so a later add cannot collide', () => {
    const base = {
      kind: 'cylinder' as const,
      diameter: 20,
      length: 50,
      original: { diameter: 20, length: 50 },
      transform: identityTransform(),
    };
    seedPrimitiveIds([{ ...base, id: 'prim-41' }, { ...base, id: 'prim-7' }]);
    expect(nextPrimitiveId()).toBe('prim-42');
  });

  it('ignores non-numeric ids', () => {
    seedPrimitiveIds([
      { kind: 'box' as const, id: 'weird', size: { x: 1, y: 1, z: 1 }, original: { x: 1, y: 1, z: 1 }, transform: identityTransform() },
    ]);
    expect(/^prim-\d+$/.test(nextPrimitiveId())).toBe(true);
  });
});
