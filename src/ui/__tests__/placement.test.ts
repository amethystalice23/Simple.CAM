import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { ModelTransform, Stock } from '../../core/types';
import {
  alignToStock,
  centerOnX,
  centerOnY,
  centerOnZ,
  dropToSurface,
  rotatedBBox,
} from '../placement';

/** 2×4×6 box centered on the model origin. */
function box(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(2, 4, 6).toNonIndexed();
}

const cylinder: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, crownZ: 10, effectiveRadius: 25 },
  materialId: 'aluminum-6061',
};

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 80,
  sizeY: 60,
  sizeZ: 20,
  origin: { x: 'min', y: 'min', z: 'max' },
  materialId: 'hardwood',
};

function rotate(t: ModelTransform, axis: 'x' | 'y' | 'z', deg: number): ModelTransform {
  return { ...t, rotationDeg: { ...t.rotationDeg, [axis]: deg } };
}

describe('rotatedBBox', () => {
  it('returns the geometry bbox when unrotated', () => {
    const bb = rotatedBBox(box(), identityTransform().rotationDeg);
    expect(bb.min.x).toBeCloseTo(-1);
    expect(bb.min.y).toBeCloseTo(-2);
    expect(bb.min.z).toBeCloseTo(-3);
    expect(bb.max.z).toBeCloseTo(3);
  });

  it('swaps Y/Z extents for a 90° rotation about X', () => {
    const bb = rotatedBBox(box(), rotate(identityTransform(), 'x', 90).rotationDeg);
    expect(bb.min.x).toBeCloseTo(-1);
    expect(bb.min.y).toBeCloseTo(-3); // was ±3 in Z
    expect(bb.max.y).toBeCloseTo(3);
    expect(bb.min.z).toBeCloseTo(-2); // was ±2 in Y
    expect(bb.max.z).toBeCloseTo(2);
  });
});

describe('centerOnX / centerOnY', () => {
  it('centers the model on the cylinder axis', () => {
    const t = centerOnX(box(), identityTransform(), cylinder);
    expect(t.position.x).toBeCloseTo(50); // axis mid, origin 'min'
    const ty = centerOnY(box(), t, cylinder);
    expect(ty.position.y).toBeCloseTo(0); // over the rotation axis
  });

  it('centers on the box footprint', () => {
    const t = centerOnX(box(), identityTransform(), boxStock);
    expect(t.position.x).toBeCloseTo(40); // 0…80
    const ty = centerOnY(box(), t, boxStock);
    expect(ty.position.y).toBeCloseTo(30); // 0…60
  });
});

describe('dropToSurface', () => {
  it('rests the model on the cylinder crown', () => {
    const t = dropToSurface(box(), identityTransform(), cylinder);
    expect(t.position.z).toBeCloseTo(10 + 3); // crownZ + half height
  });

  it('accounts for rotation', () => {
    const t = dropToSurface(box(), rotate(identityTransform(), 'x', 90), cylinder);
    expect(t.position.z).toBeCloseTo(10 + 2); // rotated: ±2 is now the Z extent
  });

  it('rests on the box top face (origin z=max → top at Z0)', () => {
    const t = dropToSurface(box(), identityTransform(), boxStock);
    expect(t.position.z).toBeCloseTo(3); // top face at Z=0
  });
});

describe('centerOnZ', () => {
  it('puts the model center on the cylinder rotation axis', () => {
    const t = centerOnZ(box(), identityTransform(), cylinder);
    expect(t.position.z).toBeCloseTo(-15); // crownZ 10 − radius 25
  });

  it('puts the model center at the box Z mid', () => {
    const t = centerOnZ(box(), identityTransform(), boxStock);
    expect(t.position.z).toBeCloseTo(-10); // stock spans −20…0
  });
});

describe('alignToStock', () => {
  it('centers the model on the stock center (all axes)', () => {
    const t = alignToStock(box(), identityTransform(), cylinder);
    expect(t.position.x).toBeCloseTo(50);
    expect(t.position.y).toBeCloseTo(0);
    expect(t.position.z).toBeCloseTo(-15); // on the rotation axis, 4th-axis ready
  });

  it('accounts for rotation when centering', () => {
    const t = alignToStock(box(), rotate(identityTransform(), 'x', 90), cylinder);
    expect(t.position.z).toBeCloseTo(-15); // rotated bbox center is still the model center
  });

  it('centers the model in a box blank', () => {
    const t = alignToStock(box(), identityTransform(), boxStock);
    expect(t.position.x).toBeCloseTo(40);
    expect(t.position.y).toBeCloseTo(30);
    expect(t.position.z).toBeCloseTo(-10);
  });
});