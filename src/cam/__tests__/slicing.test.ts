import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { Vec2 } from '../../core/types';
import { sliceAtZ, transformedPositions } from '../slicing';

function box(size = 2): THREE.BufferGeometry {
  return new THREE.BoxGeometry(size, size, size).toNonIndexed();
}

/** Plate with a round hole: outer Ø10, hole Ø4, 2mm thick, centered on Z. */
function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

function signedArea(c: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

describe('transformedPositions', () => {
  it('applies translation', () => {
    const pos = transformedPositions(box(), {
      ...identityTransform(),
      position: { x: 10, y: 20, z: 30 },
    });
    expect(pos[0]).toBeDefined();
    const xs: number[] = [];
    for (let i = 0; i < pos.length; i += 3) xs.push(pos[i]);
    expect(Math.min(...xs)).toBeCloseTo(9); // ±1 + 10
    expect(Math.max(...xs)).toBeCloseTo(11);
  });
});

describe('sliceAtZ', () => {
  it('slices a box into one CCW square contour', () => {
    const res = sliceAtZ(transformedPositions(box(), identityTransform()), 0.5);
    expect(res.droppedChains).toBe(0);
    expect(res.contours).toHaveLength(1);
    const c = res.contours[0];
    // vertex count varies with the diagonal splits; the geometry doesn't
    expect(signedArea(c)).toBeCloseTo(4); // 2×2 box, CCW outer
    for (const p of c) {
      // every point lies on the square boundary
      expect(Math.abs(p.x) <= 1.0001 && Math.abs(p.y) <= 1.0001).toBe(true);
      expect(Math.abs(Math.abs(p.x) - 1) < 1e-6 || Math.abs(Math.abs(p.y) - 1) < 1e-6).toBe(true);
    }
  });

  it('handles a slice plane exactly on the top face', () => {
    const res = sliceAtZ(transformedPositions(box(), identityTransform()), 1);
    expect(res.contours).toHaveLength(1);
    expect(signedArea(res.contours[0])).toBeGreaterThan(0);
  });

  it('classifies holes with reversed (CW) winding', () => {
    const res = sliceAtZ(transformedPositions(plateWithHole(), identityTransform()), 1);
    expect(res.droppedChains).toBe(0);
    expect(res.contours).toHaveLength(2);
    const areas = res.contours.map(signedArea).sort((a, b) => b - a);
    expect(areas[0]).toBeGreaterThan(0); // outer CCW
    expect(areas[1]).toBeLessThan(0); // hole CW
    // ~π·25 and ~π·4; exact values depend on the arc tessellation, so ranges
    expect(Math.abs(areas[0])).toBeGreaterThan(75);
    expect(Math.abs(areas[0])).toBeLessThan(79);
    expect(Math.abs(areas[1])).toBeGreaterThan(12);
    expect(Math.abs(areas[1])).toBeLessThan(13);
  });

  it('drops open chains from non-wrapping surfaces instead of closing them', () => {
    // two triangles forming a quad that straddles z=0 but does not wrap:
    // their two crossing segments join into one chain with open ends
    const quad = new Float32Array([
      0, 0, -0.5, 4, 0, -0.5, 4, 3, 0.5,
      0, 0, -0.5, 4, 3, 0.5, 0, 3, 0.5,
    ]);
    const res = sliceAtZ(quad, 0);
    expect(res.contours).toHaveLength(0);
    expect(res.droppedChains).toBe(1);
  });

  it('slices in machine coordinates after a rotation', () => {
    // stand the box on its side: rotate 90° about X swaps machine Y and Z
    const t = { ...identityTransform(), rotationDeg: { x: 90, y: 0, z: 0 } };
    const res = sliceAtZ(transformedPositions(box(), t), 0.5);
    expect(res.contours).toHaveLength(1);
    const c = res.contours[0];
    expect(signedArea(c)).toBeCloseTo(4);
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2);
  });
});