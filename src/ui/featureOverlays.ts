/**
 * Viewport overlays for detected features: colored outlines (edges red,
 * circles green, hole loops cyan) and the measure-mode snap logic —
 * zoom-dependent screen-space tolerance with a ~0.5 mm floor
 * (docs/edge-tracing.md §3, decision 1).
 */

import * as THREE from 'three';
import type { CircleFeature, ModelTransform, Vec3 } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
import { densifyWrappedPath } from './artworkFillRegions';

/** In-plane extent of a plane group's member-triangle footprint. */
export interface PlaneExtent {
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
  /** footprint size along u (machine-X aligned where possible) */
  w: number;
  /** footprint size along v */
  h: number;
  /** in-plane center of the footprint, machine space */
  center: THREE.Vector3;
  /** plane offset along n (the face's plane equation) */
  planeOffset: number;
}

/**
 * Footprint of a plane group in its own plane: the member triangles'
 * extent along machine-axis-aligned in-plane axes (machine X projected
 * into the plane, machine Y for X-normal planes).
 */
export function planeExtent(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  transform: ModelTransform,
  planeIndex: number,
): PlaneExtent | null {
  const p = features.planes[planeIndex];
  if (!p) return null;
  const xf = transformFn(transform);
  const zero = xf({ x: 0, y: 0, z: 0 });
  const n = xf(p.normal).sub(zero).normalize();
  const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = ref
    .clone()
    .sub(n.clone().multiplyScalar(n.dot(ref)))
    .normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const triCount = Math.floor(attr.count / 3);
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  for (let t = 0; t < triCount; t++) {
    if (features.faceToPlane[t] !== planeIndex) continue;
    for (let k = 0; k < 3; k++) {
      const w = xf({ x: attr.getX(t * 3 + k), y: attr.getY(t * 3 + k), z: attr.getZ(t * 3 + k) });
      const a = w.dot(u);
      const b = w.dot(v);
      minA = Math.min(minA, a);
      maxA = Math.max(maxA, a);
      minB = Math.min(minB, b);
      maxB = Math.max(maxB, b);
    }
  }
  if (minA > maxA) return null;
  const ca = (minA + maxA) / 2;
  const cb = (minB + maxB) / 2;
  const planeOffset = n.dot(xf(p.point));
  const center = u
    .clone()
    .multiplyScalar(ca)
    .add(v.clone().multiplyScalar(cb))
    .add(n.clone().multiplyScalar(planeOffset));
  return { u, v, n, w: maxA - minA, h: maxB - minB, center, planeOffset };
}

/**
 * Every plane's extent in ONE mesh pass: bucket triangles by their plane
 * while walking the mesh once. planeExtent rescans the whole mesh per
 * call — fine for one highlighted face, catastrophic when featureLabels
 * measures EVERY plane of a fine mesh (tens of thousands of planes ×
 * hundreds of thousands of triangles went quadratic there). Identical
 * math and results to planeExtent, batched.
 */
export function planeExtents(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  transform: ModelTransform,
): (PlaneExtent | null)[] {
  // nothing to measure — and some sources carry empty geometries (artwork,
  // the job's edge circles) with no position attribute at all, so this
  // guard must come before any attribute read
  if (features.planes.length === 0) return [];
  const xf = transformFn(transform);
  const zero = xf({ x: 0, y: 0, z: 0 });
  const acc = features.planes.map((p) => {
    const n = xf(p.normal).sub(zero).normalize();
    const ref = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = ref
      .clone()
      .sub(n.clone().multiplyScalar(n.dot(ref)))
      .normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    return { n, u, v, minA: Infinity, maxA: -Infinity, minB: Infinity, maxB: -Infinity, has: false };
  });
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const triCount = Math.floor(attr.count / 3);
  for (let t = 0; t < triCount; t++) {
    const pi = features.faceToPlane[t];
    const b = pi >= 0 ? acc[pi] : null;
    if (!b) continue; // degenerate drop (−1) or dangling index
    b.has = true;
    for (let k = 0; k < 3; k++) {
      const w = xf({
        x: attr.getX(t * 3 + k),
        y: attr.getY(t * 3 + k),
        z: attr.getZ(t * 3 + k),
      });
      const a = w.dot(b.u);
      const c = w.dot(b.v);
      if (a < b.minA) b.minA = a;
      if (a > b.maxA) b.maxA = a;
      if (c < b.minB) b.minB = c;
      if (c > b.maxB) b.maxB = c;
    }
  }
  return acc.map((b, i) => {
    const p = features.planes[i];
    if (!p || !b.has) return null;
    const ca = (b.minA + b.maxA) / 2;
    const cb = (b.minB + b.maxB) / 2;
    const planeOffset = b.n.dot(xf(p.point));
    const center = b.u
      .clone()
      .multiplyScalar(ca)
      .add(b.v.clone().multiplyScalar(cb))
      .add(b.n.clone().multiplyScalar(planeOffset));
    return {
      u: b.u,
      v: b.v,
      n: b.n,
      w: b.maxA - b.minA,
      h: b.maxB - b.minB,
      center,
      planeOffset,
    };
  });
}

// ---------------------------------------------------------------- measuring

/** One manually selected item in measure mode (right-click). */
export interface MeasurePick {
  kind: 'edge' | 'circle' | 'plane' | 'path';
  index: number;
  /** machine-space center used for distance computation */
  center: THREE.Vector3;
  /** machine-space normal (planes only) */
  normal?: THREE.Vector3;
  /** highlight color */
  color: number;
  /** short description for the label */
  text: string;
}

/** A hovered edge/circle/path promoted to a measurement pick. */
export function pickFromNearest(data: FeatureOverlayData, nearest: NearestFeature): MeasurePick {
  if (nearest.kind === 'edge') {
    return {
      kind: 'edge',
      index: nearest.index,
      center: data.edgeMid[nearest.index].clone(),
      color: nearest.color,
      text: data.edgeText[nearest.index],
    };
  }
  if (nearest.kind === 'path') {
    return {
      kind: 'path',
      index: nearest.index,
      center: data.pathMid[nearest.index].clone(),
      color: nearest.color,
      text: data.pathText[nearest.index],
    };
  }
  return {
    kind: 'circle',
    index: nearest.index,
    center: data.circleCenter[nearest.index].clone(),
    color: nearest.color,
    text: data.circleText[nearest.index],
  };
}

/** The plane group owning a clicked face, labeled with its two dimensions. */
export function planePick(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  transform: ModelTransform,
  planeIndex: number,
): MeasurePick {
  const p = features.planes[planeIndex];
  const xf = transformFn(transform);
  const zero = xf({ x: 0, y: 0, z: 0 });
  const ext = planeExtent(geometry, features, transform, planeIndex);
  return {
    kind: 'plane',
    index: planeIndex,
    center: xf(p.point),
    normal: xf(p.normal).sub(zero).normalize(),
    color: PLANE_SELECT,
    text: ext ? `${ext.w.toFixed(1)} × ${ext.h.toFixed(1)} mm` : 'plane',
  };
}

/**
 * Center-to-center distance between two picks (OrcaSlicer-style). Two planes
 * also report the angle between their normals.
 */
export function measureText(a: MeasurePick, b: MeasurePick): string {
  const d = a.center.distanceTo(b.center);
  if (a.kind === 'plane' && b.kind === 'plane' && a.normal && b.normal) {
    const ang =
      (Math.acos(Math.min(1, Math.abs(a.normal.dot(b.normal)))) * 180) / Math.PI;
    return `Δ ${d.toFixed(2)} mm · ∠ ${ang.toFixed(1)}°`;
  }
  return `Δ ${d.toFixed(2)} mm`;
}

/** Translucent highlight mesh over a plane's member triangles. */
export function planeHighlightMesh(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  transform: ModelTransform,
  planeIndex: number,
  color: number = PLANE_SELECT,
): THREE.Mesh | null {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const xf = transformFn(transform);
  const pos: number[] = [];
  const triCount = Math.floor(attr.count / 3);
  for (let t = 0; t < triCount; t++) {
    if (features.faceToPlane[t] !== planeIndex) continue;
    for (let k = 0; k < 3; k++) {
      const v = xf({ x: attr.getX(t * 3 + k), y: attr.getY(t * 3 + k), z: attr.getZ(t * 3 + k) });
      pos.push(v.x, v.y, v.z);
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
}

/** Dashed center-to-center connector for a two-pick measurement. */
export function connectorLine(a: MeasurePick, b: MeasurePick): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints([a.center.clone(), b.center.clone()]);
  const line = new THREE.Line(
    g,
    new THREE.LineDashedMaterial({
      color: 0xf2f6f9,
      dashSize: 2,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  line.computeLineDistances();
  line.renderOrder = 4;
  return line;
}

export const EDGE_COLOR = 0xff5555;
export const CIRCLE_COLOR = 0x44cc66;
export const HOLE_COLOR = 0x55ccee;
export const PATH_COLOR = 0xddaa33; // artwork line work — amber
/** brighter tints for the hovered feature */
export const EDGE_HOVER = 0xff9999;
export const CIRCLE_HOVER = 0x88ffbb;
export const HOLE_HOVER = 0x99eeff;
export const PATH_HOVER = 0xffdd88;
/** face/plane selection highlight */
export const PLANE_SELECT = 0xf0c050;
/** operation-selection highlight (distinct from measure picks) */
export const SELECT_COLOR = 0x7fdfff;
/** the GLOBAL selection (no op being edited) — GREEN, so an op's picks and
 *  the global one never read alike (Alice, 2026-10-31: a landed-in-global
 *  selection painted the same blue as the op's and hid the difference) */
export const GLOBAL_SELECT_COLOR = 0x7fff9f;
/** slice-pocket cut plane + contour overlay (edge-tracing §5) */
export const SLICE_COLOR = 0xcc66dd;

const RING_SEGMENTS = 72;
/**
 * Hover-snap sampling density: arc-scaled — at least one sample per
 * SNAP_ARC_MM of circumference (floor 24 = the old fixed density, cap
 * 720). The fixed 24 (one per 15°) put a Ø18.5 ring's samples 2.4mm
 * apart: a click dead-center between two fell ~9.7px from the nearest
 * sample — outside the tight circle window (×0.55 ≈ 5.5px) — so the
 * circle LOST to the facet under it (the retical-ring session:
 * "circles should be the highest priority snap-to target, then if you
 * are several pixels away fall back to facets/faces"). Arc-scaled
 * samples keep every on-ring click within SNAP_ARC_MM/2 ≈ 1px of a
 * sample; the facet fallback beyond several pixels is untouched.
 */
const RING_SAMPLES_FLOOR = 24;
const SNAP_ARC_MM = 0.25;
const RING_SAMPLES_CAP = 720;

/** Snap-sample count for a circle: arc-scaled to SNAP_ARC_MM. */
function ringSampleCount(c: CircleFeature): number {
  const arc = 2 * Math.PI * c.radius;
  return Math.min(RING_SAMPLES_CAP, Math.max(RING_SAMPLES_FLOOR, Math.ceil(arc / SNAP_ARC_MM)));
}

/** Measure-mode snap: screen-space floor (px) and mm floor at feature depth. */
const SNAP_PX_FLOOR = 10;
const SNAP_MM = 0.5;
/**
 * Key features (circles, holes) snap within this multiple of the edge
 * tolerance and win outright over edges inside that radius. Tuned DOWN to
 * a third of the old 1.65 at Alice's request — circles were stealing face
 * clicks (edge tolerance ×0.55 ≈ 5.5 px screen floor; edges are the
 * fallback beyond that).
 */
const CIRCLE_PRIORITY = 0.55;

export interface FeatureOverlayData {
  edgeLines: THREE.LineSegments;
  circleLines: THREE.LineSegments;
  holeLines: THREE.LineSegments; // inner loops (drill candidates) in cyan
  pathLines: THREE.LineSegments; // artwork line work in amber
  /** machine-space hover samples, parallel to the feature arrays */
  edgeSamples: THREE.Vector3[][];
  circleSamples: THREE.Vector3[][];
  pathSamples: THREE.Vector3[][];
  edgeMid: THREE.Vector3[];
  circleCenter: THREE.Vector3[];
  pathMid: THREE.Vector3[];
  edgeText: string[];
  circleText: string[];
  pathText: string[];
  circleInner: boolean[];
}

/** Model-space point → machine-space point under a transform. */
export function transformFn(t: ModelTransform): (v: Vec3) => THREE.Vector3 {
  const rot = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (t.rotationDeg.x * Math.PI) / 180,
      (t.rotationDeg.y * Math.PI) / 180,
      (t.rotationDeg.z * Math.PI) / 180,
      'XYZ',
    ),
  );
  const off = new THREE.Vector3(t.position.x, t.position.y, t.position.z);
  return (v) =>
    new THREE.Vector3(v.x * t.scale.x, v.y * t.scale.y, v.z * t.scale.z)
      .applyQuaternion(rot)
      .add(off);
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

/** Line objects for all features, in machine space. `wrapped` — artwork
 * sources only — densifies the path polylines against that cylinder
 * before the transform: the wrapped bend is baked into the local points,
 * so a long document segment renders as one straight chord across a
 * curving arc (round 5, Alice: worst raw edge 5.5mm surface / 24.7° arc,
 * dipping 0.23mm below her Ø20 — the fill shade's round-4 defect, on the
 * lines). Lengths and midpoints stay computed on the UN-subdivided points
 * (the drawn polyline is presentation; the reported geometry is the
 * feature). Flat frames pass null — coplanar lines are already exact. */
export function buildFeatureOverlayData(
  features: DetectedFeatures,
  transform: ModelTransform,
  wrapped?: { diameter: number } | null,
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
    const target = c.inner ? holePos : circlePos;
    if (c.arcs) {
      // idle rings show only the surviving fragments — the real geometry;
      // the hover highlight (circleSamples below) still draws the full
      // reconstructed circle, which is the point of the feature
      for (const chain of c.arcs) {
        for (let i = 0; i < chain.length - 1; i++) {
          const a = xf(chain[i]);
          const b = xf(chain[i + 1]);
          target.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    } else {
      const pts = ringPoints(c, xf, RING_SEGMENTS);
      for (let i = 0; i < RING_SEGMENTS; i++) {
        target.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
      }
    }
    circleSamples.push(ringPoints(c, xf, ringSampleCount(c)));
    circleCenter.push(xf(c.center));
    circleText.push(
      `Ø ${(c.radius * 2).toFixed(2)} mm${c.inner ? ' · hole' : ''}${c.arcs ? ' · partial' : ''}`,
    );
    circleInner.push(c.inner);
  }

  // artwork line work: dense samples along each polyline (the same shape
  // as edge samples, so the snap and occlusion machinery is shared)
  const pathPos: number[] = [];
  const pathSamples: THREE.Vector3[][] = [];
  const pathMid: THREE.Vector3[] = [];
  const pathText: string[] = [];
  for (const p of features.paths) {
    const pts = p.points.map((q) => xf(q));
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      len += pts[i].distanceTo(pts[i + 1]);
    }
    // the DRAWN polyline densifies (wrapped only — flat lines are exact);
    // the samples follow it so hover highlights and snapping read the
    // same curve the eye sees, while len/mid above stay on the raw points
    const draw =
      wrapped && wrapped.diameter > 0
        ? densifyWrappedPath(p.points, wrapped.diameter).map((q) => xf(q))
        : pts;
    for (let i = 0; i < draw.length - 1; i++) {
      pathPos.push(draw[i].x, draw[i].y, draw[i].z, draw[i + 1].x, draw[i + 1].y, draw[i + 1].z);
    }
    pathSamples.push(draw);
    pathMid.push(pts[Math.floor(pts.length / 2)].clone());
    pathText.push(`artwork · L ${len.toFixed(2)} mm`);
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
    pathLines: mk(pathPos, PATH_COLOR),
    edgeSamples,
    circleSamples,
    pathSamples,
    edgeMid,
    circleCenter,
    pathMid,
    edgeText,
    circleText,
    pathText,
    circleInner,
  };
}

export interface NearestFeature {
  kind: 'edge' | 'circle' | 'path';
  index: number;
  text: string;
  color: number;
  /** px anchor for the floating label (near the feature's representative point) */
  anchor: { x: number; y: number };
  /** the 3D sample the snap landed on — the visibility gate's probe */
  point: THREE.Vector3;
  /** screen-space distance of the snap, px — lets a caller pick the
   * winner across several sources' overlay data */
  d: number;
}

/** Occlusion slack, mm: a sample may sit a hair behind the visible
 * surface (welding tolerance, a rim grazing the silhouette) and still
 * count as visible. */
const OCCLUSION_EPS_MM = 0.25;

/**
 * Visibility gate for feature snapping: the face under the cursor must
 * not hide the feature. `firstHitDistance` is the cursor ray's first
 * mesh hit (null when the ray hits nothing — background, or a grazing
 * silhouette); the sample is hidden when the visible surface is
 * meaningfully in front of its depth along the same ray. Without this,
 * features on the far side of the model project onto the front view
 * and steal the pick from the face actually being hovered.
 */
export function sampleVisibleAt(
  firstHitDistance: number | null,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  sample: THREE.Vector3,
): boolean {
  if (firstHitDistance === null) return true;
  const depth = sample.clone().sub(rayOrigin).dot(rayDirection);
  return depth <= firstHitDistance + OCCLUSION_EPS_MM;
}

/** Screen-space scale at a world depth: pixels per mm of world size.
 * Depth-dependent under perspective, constant under orthographic (zoom
 * scales the frustum, distance does nothing). The ONE shared source for
 * the feature snap tolerances and the slice-plane drag handle — the two
 * must never disagree about how big a pixel is. */
export function pxPerMmAt(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  h: number,
  depth: number,
): number {
  if (camera instanceof THREE.PerspectiveCamera) {
    const halfTanFov = Math.tan(((camera.fov / 2) * Math.PI) / 180);
    return h / (2 * halfTanFov * Math.max(depth, 0.01));
  }
  const frustumH = (camera.top - camera.bottom) / camera.zoom;
  return h / Math.max(frustumH, 1e-9);
}

/**
 * Nearest feature to the mouse in screen space. Circles and holes take
 * precedence but snap tightly (CIRCLE_PRIORITY × the tolerance — they win
 * outright only inside that small radius, so faces stay easy to click).
 * Edges are the fallback, snapping within ~0.5 mm (10 px floor).
 *
 * `toWorld` (2026-11-03, the indexed-drill bug): the overlay samples are
 * A=0-frame points that RENDER through the rotating datum group, so under
 * a non-zero index datum the screen-space math must map them through the
 * SAME rotation before projecting — otherwise the snap tests where the
 * feature was before rotation, the hover misses the drawn ring, and (the
 * reported bite) a click on the rotated hole snaps a DIFFERENT feature
 * whose unrotated position happens to sit under the cursor. Null = the
 * datum is A0, the transform is identity (the previous behavior, exact).
 */
export function findNearestFeature(
  data: FeatureOverlayData,
  mouseX: number,
  mouseY: number,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  w: number,
  h: number,
  toWorld?: ((p: THREE.Vector3) => THREE.Vector3) | null,
): NearestFeature | null {
  return findNearestFeatures(data, mouseX, mouseY, camera, w, h, toWorld)[0] ?? null;
}

/**
 * Every in-tolerance snap candidate ranked by screen distance — the
 * visibility gate's fallthrough list (see findNearestFeature's toWorld
 * note). Kind precedence matches the single-best call: circles within
 * their tight window exclude paths and edges outright; paths beat edges.
 */
export function findNearestFeatures(
  data: FeatureOverlayData,
  mouseX: number,
  mouseY: number,
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  w: number,
  h: number,
  toWorld?: ((p: THREE.Vector3) => THREE.Vector3) | null,
): (NearestFeature & { d: number })[] {
  const world = toWorld ?? ((p: THREE.Vector3) => p);
  interface Candidate {
    index: number;
    samples: THREE.Vector3[];
    text: string;
    color: number;
    rep: THREE.Vector3;
  }

  // ALL qualifying (feature, SAMPLE) candidates, ranked by screen
  // distance (2026-11-03, the A270-hole report): the caller's visibility
  // gate walks the list and takes the first VISIBLE entry. Per SAMPLE,
  // not per feature — a circle's nearest sample is often on its HIDDEN
  // side (a drill mouth rim climbs both slopes of the V groove, half
  // behind the wall): a per-feature candidate made of that one sample
  // had the gate reject the circle outright and fall through to a
  // neighboring feature's ring, so hovering the hole picked Ø-rims from
  // the far side and nothing ever selected. Per-sample entries let the
  // gate reach the same circle's visible arc a few entries later.
  const scan = (
    kind: 'edge' | 'circle' | 'path',
    items: Candidate[],
    tolScale: number,
  ): (NearestFeature & { d: number })[] => {
    const hits: (NearestFeature & { d: number })[] = [];
    for (const it of items) {
      const rep = world(it.rep);
      const proj = rep.clone().project(camera);
      if (proj.z > 1) continue; // behind the camera
      const px = ((proj.x + 1) / 2) * w;
      const py = ((1 - proj.y) / 2) * h;
      const depth = rep.distanceTo(camera.position);
      const tol = Math.max(
        SNAP_PX_FLOOR * tolScale,
        SNAP_MM * tolScale * pxPerMmAt(camera, h, depth),
      );
      for (const s of it.samples) {
        // CLONE before projecting: three.js project() mutates in place,
        // and at the identity datum `world(s)` returns the STORED sample —
        // projecting it raw corrupts the overlay data for every later
        // snap (the A0 regression: one hover killed all selection)
        const sp = world(s).clone().project(camera);
        if (sp.z > 1) continue;
        const sd = Math.hypot(((sp.x + 1) / 2) * w - mouseX, ((1 - sp.y) / 2) * h - mouseY);
        if (sd > tol) continue;
        hits.push({
          kind,
          index: it.index,
          text: it.text,
          color: it.color,
          anchor: { x: px + 12, y: py - 14 },
          // the returned point is WORLD — the visibility gate raycasts
          // the rotated mesh and compares depths in one frame. Cloned
          // for the same reason as the samples above.
          point: world(s).clone(),
          d: sd,
        });
      }
    }
    return hits.sort((a, b) => a.d - b.d);
  };

  const circles: Candidate[] = data.circleSamples.map((samples, i) => ({
    index: i,
    samples,
    text: data.circleText[i],
    color: data.circleInner[i] ? HOLE_HOVER : CIRCLE_HOVER,
    rep: data.circleCenter[i],
  }));
  const circleHits = scan('circle', circles, CIRCLE_PRIORITY);
  // key dimensions take precedence outright (within their tight window)
  if (circleHits.length > 0) return circleHits;

  // artwork paths snap like edges (they ride surfaces) but stay
  // hoverable during op editing — a different kind, not gated with
  // mesh edges
  const paths: Candidate[] = data.pathSamples.map((samples, i) => ({
    index: i,
    samples,
    text: data.pathText[i],
    color: PATH_HOVER,
    rep: data.pathMid[i],
  }));
  const pathHits = scan('path', paths, 1);
  if (pathHits.length > 0) return pathHits;

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
  kind: 'edge' | 'circle' | 'path',
  index: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  if (kind === 'edge') {
    const s = data.edgeSamples[index];
    positions.push(s[0].x, s[0].y, s[0].z, s[s.length - 1].x, s[s.length - 1].y, s[s.length - 1].z);
  } else if (kind === 'path') {
    // the whole polyline — artwork hover shows the full stroke
    const s = data.pathSamples[index];
    for (let i = 0; i < s.length - 1; i++) {
      positions.push(s[i].x, s[i].y, s[i].z, s[i + 1].x, s[i + 1].y, s[i + 1].z);
    }
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