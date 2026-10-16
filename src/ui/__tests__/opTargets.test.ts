import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import { indexedPointRotation } from '../../cam/indexing';
import { drillTargetsFromSelection, pocketRegionsFromSelection } from '../opTargets';

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
  it('returns a circle disc with the selection plane height (semantics-free)', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holeCircle = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.z) > 0.99 && Math.abs(c.center.z - 2) < 0.01,
    );
    expect(holeCircle).toBeDefined();
    const src = pocketRegionsFromSelection(geo, f, [holeCircle!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(Math.PI * 4, 1); // Ø4 hole
    expect(src!.selectionZ).toBeCloseTo(2, 5); // the circle's plane
  });

  it('returns a face footprint with the face height', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    geo.translate(0, 0, -5); // top face at z = −4
    const f = detectFeatures(geo);
    const topPlane = f.planes.find(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z + 4) < 1e-6,
    );
    expect(topPlane).toBeDefined();
    const src = pocketRegionsFromSelection(geo, f, [topPlane!.id], identityTransform());
    expect(src).not.toBeNull();
    expect(src!.regions).toHaveLength(1);
    expect(loopArea(src!.regions[0])).toBeCloseTo(40, 5);
    expect(src!.selectionZ).toBeCloseTo(-4, 5);
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
      pocketRegionsFromSelection(geo, f, [holeCircle.id, topPlane!.id], identityTransform()),
    ).toThrowError(/either faces or holes/);
  });

  it('ignores features that are not drill-axis aligned', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const sidePlane = f.planes.find((p) => Math.abs(p.normal.z) < 0.5);
    expect(sidePlane).toBeDefined();
    expect(pocketRegionsFromSelection(geo, f, [sidePlane!.id], identityTransform())).toBeNull();
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

  it('drills a radial hole when indexed to face the cutter', () => {
    // a plate whose hole faces machine +Y: drillable only after indexing.
    // rotateX turns the plate thickness into radial distance, so the two
    // hole circles sit at radii 6 and 8 — take the far one (y = 8)
    const geo = plateWithHole();
    geo.rotateX(-Math.PI / 2); // hole axis +Z → +Y
    geo.translate(0, 6, 0); // lift off the axis datum plane (axisZ = 0)
    const f = detectFeatures(geo);
    const radialHole = f.circles.find(
      (c) => c.inner && Math.abs(c.axis.y) > 0.99 && c.center.y > 7.9,
    );
    expect(radialHole).toBeDefined();
    // flat: the hole axis is not Z — no target
    expect(drillTargetsFromSelection(f, [radialHole!.id], identityTransform(), 5)).toBeNull();
    // indexed at 90°: the hole rotates to face up at its radial distance
    const rot = indexedPointRotation(90, 0);
    const targets = drillTargetsFromSelection(f, [radialHole!.id], identityTransform(), 5, rot);
    expect(targets).not.toBeNull();
    expect(targets).toHaveLength(1);
    expect(targets![0].x).toBeCloseTo(0, 5);
    expect(targets![0].y).toBeCloseTo(0, 5);
    expect(targets![0].topZ).toBeCloseTo(8, 5); // rim now faces up
  });
});