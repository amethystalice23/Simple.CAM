/**
 * Viewport overlays for detected features: colored outlines (edges red,
 * circles green, hole loops cyan) and the measure-mode snap logic —
 * zoom-dependent screen-space tolerance with a ~0.5 mm floor
 * (docs/edge-tracing.md §3, decision 1).
 */

import * as THREE from 'three';
import type { CircleFeature, ModelTransform, Vec3 } from '../core/types';
import type { DetectedFeatures } from '../cam/features';

export const EDGE_COLOR = 0xff5555;
export const CIRCLE_COLOR = 0x44cc66;
export const HOLE_COLOR = 0x55ccee;
/** brighter tints for the hovered feature */
export const EDGE_HOVER = 0xff9999;
export const CIRCLE_HOVER = 0x88ffbb;
export const HOLE_HOVER = 0x99eeff;

const RING_SEGMENTS = 72;
const RING_SAMPLES = 24; // hover-snap sampling density

/** Measure-mode snap: screen-space floor (px) and mm floor at feature depth. */
const SNAP_PX_FLOOR = 10;
const SNAP_MM = 0.5;
/**
 * Key features (circles, holes) snap with this much extra generosity, and
 * candidates compete on distance-normalized-by-tolerance — so a circle wins
 * anywhere inside its boosted radius unless the pointer is genuinely closer
 * (relative to tolerance) to an edge.
 */
const CIRCLE_PRIORITY = 2.5;

export interface FeatureOverlayData {
  edgeLines: THREE.LineSegments;
  circleLines: THREE.LineSegments;
  holeLines: THREE.LineSegments; // inner loops (drill candidates) in cyan
  /** machine-space hover samples, parallel to the feature arrays */
  edgeSamples: THREE.Vector3[][];
  circleSamples: THREE.Vector3[][];
  edgeMid: THREE.Vector3[];
  circleCenter: THREE.Vector3[];
  edgeText: string[];
  circleText: string[];
  circleInner: boolean[];
}

function transformFn(t: ModelTransform): (v: Vec3) => THREE.Vector3 {
  const rot = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (t.rotationDeg.x * Math.PI) / 180,
      (t.rotationDeg.y * Math.PI) / 180,
      (t.rotationDeg.z * Math.PI) / 180,
      'XYZ',
    ),
  );
  const off = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
  return (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(rot).add(off);
}

/** In-plane basis ⊥ axis. */
function ringBasis(axis: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const up = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(up, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  return { u, v };
}

function ringPoints(c: CircleFeature, xf: (v: Vec3) => THREE.Vector3, n: number): THREE.Vector3[] {
  const center = xf(c.center);
  const axis = xf(c.axis).sub(xf({ x: 0, y: 0, z: 0 })).normalize(); // rotation only
  const { u, v } = ringBasis(axis);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(
        center.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * c.radius,
        center.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * c.radius,
        center.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * c.radius,
      ),
    );
  }
  return pts;
}

/** Line objects for all features, in machine space. */
export function buildFeatureOverlayData(
  features: DetectedFeatures,
  transform: ModelTransform,
): FeatureOverlayData {
  const xf = transformFn(transform);

  const edgePos: number[] = [];
  const edgeSamples: THREE.Vector3[][] = [];
  const edgeMid: THREE.Vector3[] = [];
  const edgeText: string[] = [];
  for (const e of features.edges) {
    const a = xf(e.a);
    const b = xf(e.b);
    edgePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const len = a.distanceTo(b);
    const n = Math.min(48, Math.max(3, Math.ceil(len / 2)));
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      samples.push(new THREE.Vector3().lerpVectors(a, b, i / n));
    }
    edgeSamples.push(samples);
    edgeMid.push(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
    edgeText.push(`L ${len.toFixed(2)} mm`);
  }

  const circlePos: number[] = [];
  const holePos: number[] = [];
  const circleSamples: THREE.Vector3[][] = [];
  const circleCenter: THREE.Vector3[] = [];
  const circleText: string[] = [];
  const circleInner: boolean[] = [];
  for (const c of features.circles) {
    const pts = ringPoints(c, xf, RING_SEGMENTS);
    const target = c.inner ? holePos : circlePos;
    for (let i = 0; i < RING_SEGMENTS; i++) {
      target.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    }
    circleSamples.push(ringPoints(c, xf, RING_SAMPLES));
    circleCenter.push(xf(c.center));
    circleText.push(`Ø ${(c.radius * 2).toFixed(2)} mm${c.inner ? ' · hole' : ''}`);
    circleInner.push(c.inner);
  }

  const mk = (positions: number[], color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthTest: false, // feature outlines read as x-ray overlays
      }),
    );
  };

  return {
    edgeLines: mk(edgePos, EDGE_COLOR),
    circleLines: mk(circlePos, CIRCLE_COLOR),
    holeLines: mk(holePos, HOLE_COLOR),
    edgeSamples,
    circleSamples,
    edgeMid,
    circleCenter,
    edgeText,
    circleText,
    circleInner,
  };
}

export interface NearestFeature {
  kind: 'edge' | 'circle';
  index: number;
  text: string;
  color: number;
  /** px anchor for the floating label (near the feature's representative point) */
  anchor: { x: number; y: number };
}

/**
 * Nearest feature to the mouse in screen space. Circles and holes are key
 * dimensions and take precedence: they snap within 2.5× the tolerance
 * (25 px / 1.25 mm floors) and win outright if anything is inside that
 * radius. Edges are the fallback, snapping within ~0.5 mm (10 px floor).
 */
export function findNearestFeature(
  data: FeatureOverlayData,
  mouseX: number,
  mouseY: number,
  camera: THREE.PerspectiveCamera,
  w: number,
  h: number,
): NearestFeature | null {
  const halfTanFov = Math.tan(((camera.fov / 2) * Math.PI) / 180);

  interface Candidate {
    index: number;
    samples: THREE.Vector3[];
    text: string;
    color: number;
    rep: THREE.Vector3;
  }

  const scan = (
    kind: 'edge' | 'circle',
    items: Candidate[],
    tolScale: number,
  ): (NearestFeature & { d: number }) | null => {
    let best: (NearestFeature & { d: number }) | null = null;
    for (const it of items) {
      const proj = it.rep.clone().project(camera);
      if (proj.z > 1) continue; // behind the camera
      const px = ((proj.x + 1) / 2) * w;
      const py = ((1 - proj.y) / 2) * h;
      const depth = it.rep.distanceTo(camera.position);
      const pxPerMm = h / (2 * halfTanFov * Math.max(depth, 0.01));
      const tol = Math.max(SNAP_PX_FLOOR * tolScale, SNAP_MM * tolScale * pxPerMm);
      let d = Infinity;
      for (const s of it.samples) {
        const sp = s.clone().project(camera);
        if (sp.z > 1) continue;
        d = Math.min(d, Math.hypot(((sp.x + 1) / 2) * w - mouseX, ((1 - sp.y) / 2) * h - mouseY));
      }
      if (d <= tol && (best === null || d < best.d)) {
        best = {
          kind,
          index: it.index,
          text: it.text,
          color: it.color,
          anchor: { x: px + 12, y: py - 14 },
          d,
        };
      }
    }
    return best;
  };

  const circles: Candidate[] = data.circleSamples.map((samples, i) => ({
    index: i,
    samples,
    text: data.circleText[i],
    color: data.circleInner[i] ? HOLE_HOVER : CIRCLE_HOVER,
    rep: data.circleCenter[i],
  }));
  const circleHit = scan('circle', circles, CIRCLE_PRIORITY);
  if (circleHit) return circleHit; // key dimensions take precedence

  const edges: Candidate[] = data.edgeSamples.map((samples, i) => ({
    index: i,
    samples,
    text: data.edgeText[i],
    color: EDGE_HOVER,
    rep: data.edgeMid[i],
  }));
  return scan('edge', edges, 1);
}

/** A crisp single-feature outline for the hovered feature. */
export function hoverLineGeometry(
  data: FeatureOverlayData,
  kind: 'edge' | 'circle',
  index: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  if (kind === 'edge') {
    const s = data.edgeSamples[index];
    positions.push(s[0].x, s[0].y, s[0].z, s[s.length - 1].x, s[s.length - 1].y, s[s.length - 1].z);
  } else {
    const s = data.circleSamples[index];
    const n = s.length - 1;
    for (let i = 0; i < n; i++) {
      positions.push(s[i].x, s[i].y, s[i].z, s[i + 1].x, s[i + 1].y, s[i + 1].z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}