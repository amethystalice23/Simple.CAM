import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { ModelTransform, Stock } from '../../core/types';
import {
  alignAxisToStock,
  alignToStock,
  centerOnX,
  centerOnY,
  centerOnZ,
  dropToSurface,
  rotatedBBox,
  stockSpan,
  stockTopZ,
} from '../placement';

/** 2×4×6 box centered on the model origin. */
function box(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(2, 4, 6).toNonIndexed();
}

const cylinder: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 10, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 80,
  sizeY: 60,
  sizeZ: 20,
  origin: { x: 'min', y: 'min', z: 'max' },
  axisMode: '3-axis',
  materialId: 'hardwood',
};

function rotate(t: ModelTransform, axis: 'x' | 'y' | 'z', deg: number): ModelTransform {
  return { ...t, rotationDeg: { ...t.rotationDeg, [axis]: deg } };
}

describe('rotatedBBox', () => {
  it('returns the geometry bbox when unrotated', () => {
    const bb = rotatedBBox(box(), identityTransform());
    expect(bb.min.x).toBeCloseTo(-1);
    expect(bb.min.y).toBeCloseTo(-2);
    expect(bb.min.z).toBeCloseTo(-3);
    expect(bb.max.z).toBeCloseTo(3);
  });

  it('swaps Y/Z extents for a 90° rotation about X', () => {
    const bb = rotatedBBox(box(), rotate(identityTransform(), 'x', 90));
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
  it('rests the model on the cylinder surface (axisZ + radius)', () => {
    const t = dropToSurface(box(), identityTransform(), cylinder);
    expect(t.position.z).toBeCloseTo(35 + 3); // axisZ 10 + r 25 + half height
  });

  it('accounts for rotation', () => {
    const t = dropToSurface(box(), rotate(identityTransform(), 'x', 90), cylinder);
    expect(t.position.z).toBeCloseTo(35 + 2); // rotated: ±2 is now the Z extent
  });

  it('rests on the box top face (origin z=max → top at Z0)', () => {
    const t = dropToSurface(box(), identityTransform(), boxStock);
    expect(t.position.z).toBeCloseTo(3); // top face at Z=0
  });
});

describe('centerOnZ', () => {
  it('puts the model center on the cylinder rotation axis', () => {
    const t = centerOnZ(box(), identityTransform(), cylinder);
    expect(t.position.z).toBeCloseTo(10); // axisZ
  });

  it('puts the model center at the box Z mid', () => {
    const t = centerOnZ(box(), identityTransform(), boxStock);
    expect(t.position.z).toBeCloseTo(-10); // stock spans −20…0
  });
});

describe('stockSpan', () => {
  it('spans the cylinder axisZ ± r in Z, silhouette in Y', () => {
    expect(stockSpan(cylinder, 'z')).toEqual([-15, 35]); // axisZ 10 ± r 25
    expect(stockSpan(cylinder, 'y')).toEqual([-25, 25]);
    expect(stockSpan(cylinder, 'x')).toEqual([0, 100]);
  });

  it('spans the box per its origin edges', () => {
    expect(stockSpan(boxStock, 'x')).toEqual([0, 80]);
    expect(stockSpan(boxStock, 'z')).toEqual([-20, 0]); // origin z='max'
  });
});

describe('alignAxisToStock', () => {
  it('flushes the model far edge with the stock far edge (X max)', () => {
    const t = alignAxisToStock(box(), identityTransform(), cylinder, 'x', 'max');
    expect(t.position.x).toBeCloseTo(99); // model max = pos+1 → stock max 100
  });

  it('flushes the model near edge with the stock near edge (X min)', () => {
    const t = alignAxisToStock(box(), identityTransform(), cylinder, 'x', 'min');
    expect(t.position.x).toBeCloseTo(1); // model min = pos−1 → stock min 0
  });

  it('puts the model top flush with the cylinder surface (Z max)', () => {
    const t = alignAxisToStock(box(), identityTransform(), cylinder, 'z', 'max');
    expect(t.position.z).toBeCloseTo(32); // surface 35 − half height 3
  });

  it('puts the model bottom at the cylinder bottom (Z min)', () => {
    const t = alignAxisToStock(box(), identityTransform(), cylinder, 'z', 'min');
    expect(t.position.z).toBeCloseTo(-12); // bottom −15 + half height 3
  });

  it('is rotation-aware', () => {
    const t = alignAxisToStock(box(), rotate(identityTransform(), 'y', 90), cylinder, 'x', 'max');
    // 90° about Y swaps the 2×4×6 box's X and Z extents: X half-extent is now 3
    expect(t.position.x).toBeCloseTo(97);
  });
});

describe('alignToStock', () => {
  it('centers the model on the stock center (all axes)', () => {
    const t = alignToStock(box(), identityTransform(), cylinder);
    expect(t.position.x).toBeCloseTo(50);
    expect(t.position.y).toBeCloseTo(0);
    expect(t.position.z).toBeCloseTo(10); // on the rotation axis, 4th-axis ready
  });

  it('accounts for rotation when centering', () => {
    const t = alignToStock(box(), rotate(identityTransform(), 'x', 90), cylinder);
    expect(t.position.z).toBeCloseTo(10); // rotated bbox center is still the model center
  });

  it('centers the model in a box blank', () => {
    const t = alignToStock(box(), identityTransform(), boxStock);
    expect(t.position.x).toBeCloseTo(40);
    expect(t.position.y).toBeCloseTo(30);
    expect(t.position.z).toBeCloseTo(-10);
  });
});
describe('3-axis cylinder stands vertical', () => {
  const vertical: Extract<Stock, { kind: 'cylinder' }> = {
    kind: 'cylinder',
    length: 80,
    xOrigin: 'min',
    calibration: { aOriginDeg: 0, axisZ: 99, effectiveRadius: 10 }, // axisZ unused in 3-axis
    axisMode: '3-axis',
    materialId: 'aluminum-6061',
  };

  it('spans X and Y as the silhouette, Z as the height per xOrigin', () => {
    expect(stockSpan(vertical, 'x')).toEqual([-10, 10]);
    expect(stockSpan(vertical, 'y')).toEqual([-10, 10]);
    expect(stockSpan(vertical, 'z')).toEqual([0, 80]);
    expect(stockSpan({ ...vertical, xOrigin: 'max' }, 'z')).toEqual([-80, 0]);
    expect(stockSpan({ ...vertical, xOrigin: 'mid' }, 'z')).toEqual([-40, 40]);
  });

  it('crowns at the top face, ignoring the rotary axisZ', () => {
    expect(stockTopZ(vertical)).toBeCloseTo(80);
    expect(stockTopZ({ ...vertical, xOrigin: 'max' })).toBeCloseTo(0);
  });

  it('keeps the 4-axis interpretation untouched', () => {
    expect(stockSpan(cylinder, 'x')).toEqual([0, 100]);
    expect(stockSpan(cylinder, 'y')).toEqual([-25, 25]);
    expect(stockSpan(cylinder, 'z')).toEqual([-15, 35]); // axisZ 10 ± r 25
    expect(stockTopZ(cylinder)).toBeCloseTo(35); // axisZ + r
  });
});
