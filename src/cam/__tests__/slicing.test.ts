import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { Vec2 } from '../../core/types';
import { buildZIndex, sliceAtZ, transformedPositions } from '../slicing';

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
describe('sliceAtZ with a ZIndex (candidate bucketing)', () => {
  /**
   * One mesh with every degenerate case: a square pyramid whose apex
   * touches z=2 and whose base vertices touch z=0, a triangle exactly
   * coplanar with z=1, and an open quad straddling z=0 (dropped chain).
   */
  function trickyMesh(): Float32Array {
    const tri: number[] = [];
    const apex = [0, 0, 2];
    const base: number[][] = [
      [-2, -2, 0],
      [2, -2, 0],
      [2, 2, 0],
      [-2, 2, 0],
    ];
    for (let i = 0; i < 4; i++) {
      const a = base[i];
      const b = base[(i + 1) % 4];
      tri.push(...apex, ...a, ...b);
    }
    tri.push(-3, -3, 1, 3, -3, 1, 3, 3, 1); // coplanar with z = 1
    tri.push(0, 0, -0.5, 4, 0, -0.5, 4, 3, 0.5); // open chain half 1
    tri.push(0, 0, -0.5, 4, 3, 0.5, 0, 3, 0.5); // open chain half 2
    return new Float32Array(tri);
  }

  /** Append one square tube segment (8 triangles, half-width w) spanning
   *  [z0, z0+h] to a flat xyz triple array. */
  function tubeRing(out: number[], z0: number, h: number, w: number): void {
    const cs: number[][] = [
      [-w, -w],
      [w, -w],
      [w, w],
      [-w, w],
    ];
    for (let i = 0; i < 4; i++) {
      const a = cs[i];
      const b = cs[(i + 1) % 4];
      out.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z0 + h);
      out.push(a[0], a[1], z0, b[0], b[1], z0 + h, a[0], a[1], z0 + h);
    }
  }

  it('returns deep-equal results to the full scan on the degenerate planes', () => {
    const positions = trickyMesh();
    const index = buildZIndex(positions);
    // z=−1 below everything, 0 on the base plane (touching vertices + the
    // dropped open chain), 0.5 on the quad's top vertices, 1 the coplanar
    // triangle's plane, 1.5 a plain crossing, 2 the apex touch, 3 above all
    for (const z of [-1, 0, 0.5, 1, 1.5, 2, 3]) {
      expect(sliceAtZ(positions, z, index)).toEqual(sliceAtZ(positions, z));
    }
    // …and the planes really do exercise the cases
    const at0 = sliceAtZ(positions, 0, index);
    expect(at0.contours).toHaveLength(1); // the pyramid base square
    expect(at0.droppedChains).toBe(1); // the open quad
    const at1 = sliceAtZ(positions, 1, index);
    expect(at1.contours).toHaveLength(1); // pyramid mid-section, coplanar tri skipped
    expect(at1.droppedChains).toBe(0);
    expect(sliceAtZ(positions, 2, index).contours).toHaveLength(0); // apex touch
    expect(sliceAtZ(positions, 3, index).contours).toHaveLength(0); // above
  });

  it('reuses one index across many planes, holes included', () => {
    const positions = transformedPositions(plateWithHole(), identityTransform());
    const index = buildZIndex(positions); // built once…
    for (const z of [-1, -0.25, 0, 0.5, 1, 1.5, 2, 2.5]) {
      // …sliced many: every plane agrees with the full scan bit-for-bit
      expect(sliceAtZ(positions, z, index)).toEqual(sliceAtZ(positions, z));
    }
    const mid = sliceAtZ(positions, 1, index);
    expect(mid.contours).toHaveLength(2); // outer + hole survive the index
    // an empty mesh is honest through the index too
    const empty = new Float32Array(0);
    expect(sliceAtZ(empty, 5, buildZIndex(empty))).toEqual({
      contours: [],
      droppedChains: 0,
    });
  });

  it('tests only the plane bucket on a tall sparse mesh', () => {
    // 400 disconnected tube rings spread over 400mm — 3200 faces, of which
    // a mid-plane bucket holds only the handful of nearby rings
    const tri: number[] = [];
    for (let i = 0; i < 400; i++) tubeRing(tri, i, 0.2, 1);
    const positions = new Float32Array(tri);
    const faceCount = Math.floor(positions.length / 9);
    expect(faceCount).toBe(3200);
    const index = buildZIndex(positions);
    const z = 200.1; // inside ring 200's tube
    const b = Math.floor((z - index.minZ) / index.bucketH);
    expect(index.buckets[b].length).toBeGreaterThan(0);
    expect(index.buckets[b].length).toBeLessThan(faceCount / 4);
    // and the indexed cut still matches the full scan, crossing or not
    expect(sliceAtZ(positions, z, index)).toEqual(sliceAtZ(positions, z));
    const zEmpty = 200.6; // between rings: candidates exist, none cross
    expect(sliceAtZ(positions, zEmpty, index)).toEqual(sliceAtZ(positions, zEmpty));
    expect(sliceAtZ(positions, zEmpty, index).contours).toHaveLength(0);
  });
});
