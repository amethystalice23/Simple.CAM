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
  pxPerMmAt,
  sampleVisibleAt,
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
    // the snap carries the 3D sample it landed on — the visibility
    // gate's probe
    expect(nearest?.point.distanceTo(sample)).toBeLessThan(0.01);
  });

  it('returns nothing when the mouse is far from every feature', () => {
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(30, -30, 30);
    camera.lookAt(0, 0, 0);
    expect(findNearestFeature(data, 700, 100, camera, 800, 600)).toBeNull();
  });

  it('grabs circles within its tight snap radius — and lets faces win beyond it', () => {
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
    // close in (~4.5px): inside the tight circle tolerance (0.55× ≈ 5.5px)
    const near = findNearestFeature(
      data,
      ((ndc.x + 1) / 2) * w + 4,
      ((1 - ndc.y) / 2) * h + 2,
      camera,
      w,
      h,
    );
    expect(near?.kind).toBe('circle');
    // RADIAL offset off the ring line (~12px away from the circle itself):
    // beyond the window — circles must not steal the click from the face
    // work around them. (2026-11-03: the old test used a +10/+7 tangent
    // offset that was genuinely ~2px from the ring once snap samples went
    // arc-dense — a click ON the circle must snap, so the far case now
    // moves off the ring, not along it.)
    const center2d = data.circleCenter[capIdx].clone().project(camera);
    const cx = ((center2d.x + 1) / 2) * w;
    const cy = ((1 - center2d.y) / 2) * h;
    const sx = ((ndc.x + 1) / 2) * w;
    const sy = ((1 - ndc.y) / 2) * h;
    const dir = { x: sx - cx, y: sy - cy };
    const dl = Math.hypot(dir.x, dir.y) || 1;
    const push = 12; // px radially outward from the ring
    const far = findNearestFeature(
      data,
      sx + (dir.x / dl) * push,
      sy + (dir.y / dl) * push,
      camera,
      w,
      h,
    );
    expect(far?.kind).not.toBe('circle');
  });

  it('a large ring snaps along its whole circumference (arc-scaled samples)', () => {
    // the retical-ring report (2026-11-03): "selection on the rotary chamfer
    // op keeps highlighting facets instead of circles" — the fixed 24
    // samples left 2.4mm dead zones on a Ø18.5 ring, and a click dead
    // center between samples fell outside the snap window. Arc-scaled
    // samples close the dead zones: the WORST point on the ring must snap.
    const f = detectFeatures(tubeAlongX());
    const data = buildFeatureOverlayData(f, identityTransform());
    const w = 800;
    const h = 600;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(30, -30, 30);
    camera.lookAt(5, 0, 0);
    const capIdx = data.circleCenter.findIndex((c) => Math.abs(c.x - 5) < 0.05);
    const samples = data.circleSamples[capIdx];
    // click the screen-midpoint between each CONSECUTIVE sample pair:
    // every one must still snap to the circle
    for (let i = 0; i + 1 < samples.length; i++) {
      const a = samples[i].clone().project(camera);
      const b = samples[i + 1].clone().project(camera);
      const mx = (((a.x + b.x) / 2 + 1) / 2) * w;
      const my = ((1 - (a.y + b.y) / 2) / 2) * h;
      const nearest = findNearestFeature(data, mx, my, camera, w, h);
      expect(nearest?.kind).toBe('circle');
      expect(nearest?.index).toBe(capIdx);
    }
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
    const nearest = {
      kind: 'circle' as const,
      index: capIdx,
      text: '',
      color: 0,
      anchor: { x: 0, y: 0 },
      point: new THREE.Vector3(),
      d: 0,
    };
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

  it('builds a plane pick in machine space, labeled with its dimensions', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    const t = { ...identityTransform(), position: { x: 10, y: 0, z: 0 } };
    const pick = planePick(geo, f, t, topIdx);
    expect(pick.kind).toBe('plane');
    expect(pick.text).toBe('10.0 × 4.0 mm');
    expect(pick.center.x).toBeCloseTo(10, 5);

    const mesh = planeHighlightMesh(geo, f, t, topIdx);
    expect(mesh).not.toBeNull();
    // one face = 2 triangles = 6 vertices
    expect((mesh!.geometry.getAttribute('position') as THREE.BufferAttribute).count).toBe(6);
  });
});

describe('sampleVisibleAt (far-side occlusion gate)', () => {
  // a camera ray looking down +Y from 30mm away: a surface at y=10 is
  // hit at ray distance 40
  const origin = new THREE.Vector3(0, -30, 0);
  const dir = new THREE.Vector3(0, 1, 0);
  const surface = 40;

  it('accepts a sample at or in front of the visible surface', () => {
    expect(sampleVisibleAt(surface, origin, dir, new THREE.Vector3(0, 5, 0))).toBe(true); // in front
    expect(sampleVisibleAt(surface, origin, dir, new THREE.Vector3(0, 10, 0))).toBe(true); // on it
    expect(sampleVisibleAt(surface, origin, dir, new THREE.Vector3(0, 10.2, 0))).toBe(true); // slack
  });

  it('rejects a sample hidden behind the visible surface', () => {
    // a far-side rim 2mm behind the face the cursor is actually over
    expect(sampleVisibleAt(surface, origin, dir, new THREE.Vector3(0, 12, 0))).toBe(false);
  });

  it('accepts everything when the cursor ray hits no mesh (background/silhouette)', () => {
    expect(sampleVisibleAt(null, origin, dir, new THREE.Vector3(0, 12, 0))).toBe(true);
  });
});
describe('pxPerMmAt (shared screen-space scale)', () => {
  // the shared helper behind BOTH the feature snap tolerances and the
  // slice-plane drag: perspective scales with depth, orthographic is
  // constant (zoom scales the frustum, distance does nothing)
  const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  const ortho = new THREE.OrthographicCamera(-50, 50, 25, -25, -5000, 5000);

  it('perspective: halves as the depth doubles', () => {
    expect(pxPerMmAt(persp, 1000, 100)).toBeCloseTo(pxPerMmAt(persp, 1000, 200) * 2, 6);
    const halfTan = Math.tan((25 * Math.PI) / 180);
    expect(pxPerMmAt(persp, 1000, 100)).toBeCloseTo(1000 / (2 * halfTan * 100), 6);
  });

  it('orthographic: constant with depth, scaled only by zoom', () => {
    // frustum height 50mm over a 1000px canvas → 20 px/mm at any depth
    expect(pxPerMmAt(ortho, 1000, 50)).toBeCloseTo(20, 6);
    expect(pxPerMmAt(ortho, 1000, 500)).toBeCloseTo(20, 6);
    ortho.zoom = 2;
    expect(pxPerMmAt(ortho, 1000, 500)).toBeCloseTo(40, 6);
    ortho.zoom = 1;
  });
});

describe('buildFeatureOverlayData — wrapped outline densify (round 5)', () => {
  // one artwork path as wrapped local points: a straight-sided "V" whose
  // two long edges ride a R10 cylinder (the shape class that measured
  // 0.23mm chord dip before densify — probes/measure-outline-dip.mjs)
  const r = 10;
  const onCyl = (thDeg: number, x: number) => {
    const th = (thDeg * Math.PI) / 180;
    return { x, y: r * Math.sin(th), z: r * Math.cos(th) };
  };
  const wrappedPath = {
    kind: 'path' as const,
    id: 'p:a:path:0',
    points: [onCyl(-12, 0), onCyl(0, 3), onCyl(12, 6)],
  };
  const feats = {
    planes: [],
    circles: [],
    edges: [],
    paths: [wrappedPath],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  };
  const segCount = (d: ReturnType<typeof buildFeatureOverlayData>) =>
    d.pathLines.geometry.getAttribute('position').count / 2;

  it('absent wrap and flat-frame null are byte-identical — flat lines were already exact', () => {
    const a = buildFeatureOverlayData(feats, identityTransform());
    const b = buildFeatureOverlayData(feats, identityTransform(), null);
    expect(Array.from(a.pathLines.geometry.getAttribute('position').array)).toEqual(
      Array.from(b.pathLines.geometry.getAttribute('position').array),
    );
    expect(segCount(a)).toBe(2); // the raw segments, untouched
  });

  it('wrapped: the drawn polyline densifies to sub-1mm surface edges on the cylinder', () => {
    const d = buildFeatureOverlayData(feats, identityTransform(), { diameter: 2 * r });
    expect(segCount(d)).toBeGreaterThan(2);
    const attr = d.pathLines.geometry.getAttribute('position');
    let worst = 0;
    for (let s = 0; s < attr.count; s += 2) {
      const p = { x: attr.getX(s), y: attr.getY(s), z: attr.getZ(s) };
      const q = { x: attr.getX(s + 1), y: attr.getY(s + 1), z: attr.getZ(s + 1) };
      const arc = r * Math.abs(Math.atan2(p.y, p.z) - Math.atan2(q.y, q.z));
      worst = Math.max(worst, Math.hypot(arc, p.x - q.x));
      for (const v of [p, q]) expect(Math.hypot(v.y, v.z)).toBeCloseTo(r, 6);
    }
    expect(worst).toBeLessThanOrEqual(1.0 + 1e-9); // FILL_SUBDIVIDE_MAX_EDGE
  });

  it('the reported length stays on the UN-subdivided points (presentation vs measurement)', () => {
    const raw = buildFeatureOverlayData(feats, identityTransform());
    const dense = buildFeatureOverlayData(feats, identityTransform(), { diameter: 2 * r });
    expect(dense.pathText[0]).toBe(raw.pathText[0]);
    // the pick label midpoint rides the raw points too
    expect(dense.pathMid[0].distanceTo(raw.pathMid[0])).toBeLessThan(1e-9);
  });
});
