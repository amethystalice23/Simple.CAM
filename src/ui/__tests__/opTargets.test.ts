import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { Stock } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { drillTargetsFromSelection, pocketRegionsFromSelection } from '../opTargets';

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
  materialId: 'aluminum-6061',
}; // top face at machine Z0 (crown)

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
  it('turns a selected hole circle into its disc, floor from the depth param', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holeCircle = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z - 2) < 0.01,
    );
    expect(holeCircle).toBeDefined();
    const src = pocketRegionsFromSelection(geo, f, [holeCircle!.id], identityTransform(), boxStock);
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(Math.PI * 4, 1); // Ø4 hole
    expect(src!.topZ).toBeCloseTo(2, 5); // rim
    expect(src!.floorZ).toBeNull(); // caller supplies depth below rim
  });

  it('treats a selected face as the floor: cut from the stock crown down to it', () => {
    // a 10×4 boss sunk 4mm below the stock crown (crown at z0, face at z-4)
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    geo.translate(0, 0, -5); // spans z −6…−4, top face at z = −4
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(geo, f, [topPlane!.id], identityTransform(), boxStock);
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(40, 5); // 10 × 4 face
    expect(src!.topZ).toBeCloseTo(0, 5); // stock crown
    expect(src!.floorZ).toBeCloseTo(-4, 5); // the selected face
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
      pocketRegionsFromSelection(
        geo,
        f,
        [holeCircle.id, topPlane!.id],
        identityTransform(),
        boxStock,
      ),
    ).toThrowError(/either faces or holes/);
  });

  it('ignores features that are not drill-axis aligned', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const sidePlane = f.planes.find((p) => Math.abs(p.normal.z) < 0.5);
    expect(sidePlane).toBeDefined();
    expect(pocketRegionsFromSelection(geo, f, [sidePlane!.id], identityTransform(), boxStock)).toBeNull();
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
});