import { describe, expect, it } from 'vitest';
import { indexedPointRotation, indexToFaceTop } from '../indexing';

const AXIS_Z = 10;

describe('indexedPointRotation', () => {
  it('is the identity at 0°', () => {
    const rot = indexedPointRotation(0, AXIS_Z);
    const p = { x: 3, y: 4, z: 5 };
    const r = rot(p);
    expect(r.x).toBeCloseTo(3, 9);
    expect(r.y).toBeCloseTo(4, 9);
    expect(r.z).toBeCloseTo(5, 9);
  });

  it('rotates +Y onto +Z at 90° (about the stock axis)', () => {
    const rot = indexedPointRotation(90, AXIS_Z);
    // a point on the +Y radial, one radius above the axis datum
    const r = rot({ x: 0, y: 15, z: AXIS_Z });
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(0, 9);
    expect(r.z).toBeCloseTo(AXIS_Z + 15, 9);
  });

  it('fixes the stock axis pointwise and preserves the axis line', () => {
    const rot = indexedPointRotation(137, AXIS_Z);
    const onAxis = rot({ x: 42, y: 0, z: AXIS_Z });
    expect(onAxis.x).toBeCloseTo(42, 9);
    expect(onAxis.y).toBeCloseTo(0, 9);
    expect(onAxis.z).toBeCloseTo(AXIS_Z, 9);
    // radial distance from the axis is preserved
    const p = { x: 1, y: 3, z: AXIS_Z - 4 };
    const r = rot(p);
    const before = Math.hypot(3, -4);
    const after = Math.hypot(r.y, r.z - AXIS_Z);
    expect(after).toBeCloseTo(before, 9);
  });

  it('full turns are the identity', () => {
    const rot = indexedPointRotation(360, AXIS_Z);
    const r = rot({ x: 2, y: 3, z: AXIS_Z + 4 });
    expect(r.y).toBeCloseTo(3, 9);
    expect(r.z).toBeCloseTo(AXIS_Z + 4, 9);
  });
});

describe('indexToFaceTop', () => {
  it('brings each radial direction to face the cutter', () => {
    // feature on +Y: index 90
    expect(indexToFaceTop({ x: 0, y: 5, z: AXIS_Z }, AXIS_Z)).toBeCloseTo(90, 6);
    // feature on −Y: index 270
    expect(indexToFaceTop({ x: 0, y: -5, z: AXIS_Z }, AXIS_Z)).toBeCloseTo(270, 6);
    // already on top: 0
    expect(indexToFaceTop({ x: 0, y: 0, z: AXIS_Z + 5 }, AXIS_Z)).toBeCloseTo(0, 6);
  });

  it('round-trips with indexedPointRotation: the feature lands on +Z', () => {
    const p = { x: 7, y: -3, z: AXIS_Z - 2 };
    const a = indexToFaceTop(p, AXIS_Z);
    const r = indexedPointRotation(a, AXIS_Z)(p);
    expect(r.y).toBeCloseTo(0, 6);
    expect(r.z).toBeGreaterThan(AXIS_Z);
  });
});