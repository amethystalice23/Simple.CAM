import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  buildFeatureOverlayData,
  findNearestFeature,
  measureText,
  pickFromNearest,
  planeHighlightMesh,
  planePick,
} from '../featureOverlays';

function tubeAlongX(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(3, 3, 10, 24).toNonIndexed();
  geo.rotateZ(Math.PI / 2);
  return geo;
}

describe('findNearestFeature (measure-mode snap)', () => {
  it('snaps to an end circle, not to its tessellation chords', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());

    const w = 800;
    const h = 600;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(30, -30, 30);
    camera.lookAt(5, 0, 0); // the +x end cap

    const capIdx = data.circleCenter.findIndex((c) => Math.abs(c.x - 5) < 0.05);
    expect(capIdx).toBeGreaterThanOrEqual(0);

    // hover exactly on a sample of the end cap ring
    const sample = data.circleSamples[capIdx][6];
    const ndc = sample.clone().project(camera);
    const mx = ((ndc.x + 1) / 2) * w;
    const my = ((1 - ndc.y) / 2) * h;

    const nearest = findNearestFeature(data, mx, my, camera, w, h);
    expect(nearest?.kind).toBe('circle');
    expect(nearest?.index).toBe(capIdx);
    expect(nearest?.text).toContain('Ø 6.00');
  });

  it('returns nothing when the mouse is far from every feature', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(30, -30, 30);
    camera.lookAt(0, 0, 0);
    expect(findNearestFeature(data, 700, 100, camera, 800, 600)).toBeNull();
  });

  it('grabs circles with a generous snap radius (no pixel precision needed)', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const w = 800;
    const h = 600;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(30, -30, 30);
    camera.lookAt(5, 0, 0);

    const capIdx = data.circleCenter.findIndex((c) => Math.abs(c.x - 5) < 0.05);
    const sample = data.circleSamples[capIdx][6];
    const ndc = sample.clone().project(camera);
    const mx = ((ndc.x + 1) / 2) * w + 14; // well off the ring, still inside
    const my = ((1 - ndc.y) / 2) * h + 10; // the boosted circle tolerance

    const nearest = findNearestFeature(data, mx, my, camera, w, h);
    expect(nearest?.kind).toBe('circle');
  });

  it('still snaps precisely onto an edge when aimed at one', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const w = 800;
    const h = 600;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(30, -30, 30);
    camera.lookAt(0, 0, 0);

    // an axial wall seam near mid-length, far from the end circles
    const seamIdx = data.edgeMid.findIndex(
      (m) => Math.abs(m.x) < 0.5 && Math.hypot(m.y, m.z) > 2.5,
    );
    expect(seamIdx).toBeGreaterThanOrEqual(0);
    const sample = data.edgeSamples[seamIdx][Math.floor(data.edgeSamples[seamIdx].length / 2)];
    const ndc = sample.clone().project(camera);
    const nearest = findNearestFeature(
      data,
      ((ndc.x + 1) / 2) * w,
      ((1 - ndc.y) / 2) * h,
      camera,
      w,
      h,
    );
    expect(nearest?.kind).toBe('edge');
  });
});

describe('manual measuring', () => {
  it('picks features with their centers and text', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const capIdx = data.circleCenter.findIndex((c) => Math.abs(c.x - 5) < 0.05);
    const nearest = { kind: 'circle' as const, index: capIdx, text: '', color: 0, anchor: { x: 0, y: 0 } };
    const pick = pickFromNearest(data, nearest);
    expect(pick.kind).toBe('circle');
    expect(pick.center.x).toBeCloseTo(5);
    expect(pick.text).toContain('Ø 6.00');
  });

  it('reports center-to-center distance, and angle between planes', () => {
    const a = {
      kind: 'circle' as const,
      index: 0,
      center: new THREE.Vector3(0, 0, 0),
      color: 0,
      text: 'Ø 6.00 mm',
    };
    const b = {
      ...a,
      center: new THREE.Vector3(3, 4, 0), // 3-4-5 triangle
    };
    expect(measureText(a, b)).toBe('Δ 5.00 mm');

    const px = { kind: 'plane' as const, index: 0, center: new THREE.Vector3(0, 0, 0), color: 0, text: 'plane', normal: new THREE.Vector3(0, 0, 1) };
    const py = { ...px, normal: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(0, 2, 0) };
    expect(measureText(px, py)).toBe('Δ 2.00 mm · ∠ 90.0°');
  });

  it('builds a plane pick in machine space and highlights its triangles', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const t = { ...identityTransform(), position: { x: 10, y: 0, z: 0 } };
    const pick = planePick(f, t, 0);
    expect(pick.kind).toBe('plane');
    expect(pick.center.x).toBeCloseTo(10 + f.planes[0].point.x, 5);

    const mesh = planeHighlightMesh(geo, f, t, 0);
    expect(mesh).not.toBeNull();
    // one cube face = 2 triangles = 6 vertices
    expect((mesh!.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(6);
  });
});