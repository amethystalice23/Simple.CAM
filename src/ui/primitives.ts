/**
 * Primitive creation helpers (docs/edge-tracing.md §4): roughing volumes and
 * tabs. Defaults come from the stock; a feature selection sizes them smartly
 * — a selected circle spawns a cylinder of the same diameter and center, a
 * selected rectangular face spawns a box with one face matching its extent.
 */

import * as THREE from 'three';
import type { CircleFeature, ModelTransform, Primitive, Stock, Vec3 } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
import { stockSpan } from './placement';
import { transformFn } from './featureOverlays';

let counter = 0;
export function nextPrimitiveId(): string {
  return `prim-${++counter}`;
}

const unitTransform = (position: { x: number; y: number; z: number }): ModelTransform => ({
  position,
  rotationDeg: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

/** New displayed dims after editing one field; uniform mode scales all. */
export function scaledDims(
  current: Vec3,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Vec3 {
  if (!uniform) return { ...current, [axis]: value };
  const ratio = value / (current[axis] || 1);
  return { x: current.x * ratio, y: current.y * ratio, z: current.z * ratio };
}

/** Model scale implied by an edited display size (native size × scale). */
export function scaleForSize(
  nativeSize: Vec3,
  displayed: Vec3,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Vec3 {
  const dims = scaledDims(displayed, axis, value, uniform);
  return {
    x: nativeSize.x > 1e-9 ? dims.x / nativeSize.x : 1,
    y: nativeSize.y > 1e-9 ? dims.y / nativeSize.y : 1,
    z: nativeSize.z > 1e-9 ? dims.z / nativeSize.z : 1,
  };
}

/** Resize a primitive field; uniform mode scales all its dimensions. */
export function resizePrimitive(
  p: Primitive,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Primitive {
  if (p.kind === 'cylinder') {
    const dims = scaledDims({ x: p.diameter, y: p.length, z: 0 }, axis, value, uniform);
    return { ...p, diameter: dims.x, length: dims.y };
  }
  return { ...p, size: scaledDims(p.size, axis, value, uniform) };
}

/** Revert one primitive dimension to its creation value. */
export function revertPrimitive(p: Primitive, axis: 'x' | 'y' | 'z'): Primitive {
  if (p.kind === 'cylinder') {
    return axis === 'x' ? { ...p, diameter: p.original.diameter } : { ...p, length: p.original.length };
  }
  return { ...p, size: { ...p.size, [axis]: p.original[axis] } };
}

/** Roughing cylinder sharing a selected circle's diameter and center (axis ∥ X). */
export function cylinderFromCircle(
  circle: CircleFeature,
  modelTransform: ModelTransform,
  axialSpan: readonly [number, number],
): Primitive {
  const xf = transformFn(modelTransform);
  const c = xf(circle.center);
  const diameter = circle.radius * 2;
  const length = Math.max(1, axialSpan[1] - axialSpan[0]);
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter,
    length,
    original: { diameter, length },
    transform: unitTransform({ x: c.x, y: c.y, z: c.z }),
  };
}

/**
 * Box with one face matching the selected plane's in-plane extent, sitting
 * on that face (thickness along the face normal). Returns null if the plane
 * has no member triangles.
 */
export function boxFromPlane(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  modelTransform: ModelTransform,
  planeIndex: number,
  thickness = 5,
): Primitive | null {
  const p = features.planes[planeIndex];
  if (!p) return null;
  const xf = transformFn(modelTransform);
  const zero = xf({ x: 0, y: 0, z: 0 });
  const n = xf(p.normal).sub(zero).normalize();
  // local axes aligned with the machine axes where possible, so size.x/y
  // read as machine extents (not swapped): project machine X into the plane,
  // falling back to machine Y for planes normal to X
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
  const h = n.dot(xf(p.point)) + thickness / 2; // box sits ON the face
  const center = u
    .clone()
    .multiplyScalar(ca)
    .add(v.clone().multiplyScalar(cb))
    .add(n.clone().multiplyScalar(h));
  // full basis rotation (local X→u, Y→v, Z→n): the shortest-arc quaternion
  // alone twists around n and misaligns the face for X-normal planes
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const size = { x: maxA - minA, y: maxB - minB, z: thickness };
  return {
    kind: 'box',
    id: nextPrimitiveId(),
    size,
    original: { ...size },
    transform: {
      position: { x: center.x, y: center.y, z: center.z },
      rotationDeg: {
        x: (e.x * 180) / Math.PI,
        y: (e.y * 180) / Math.PI,
        z: (e.z * 180) / Math.PI,
      },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

/** Default roughing cylinder: stock-sized, centered on the stock. */
export function defaultCylinder(stock: Stock): Primitive {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const [z0, z1] = stockSpan(stock, 'z');
  const diameter =
    stock.kind === 'cylinder'
      ? stock.calibration.effectiveRadius * 2
      : Math.min(y1 - y0, z1 - z0);
  const d = Math.max(1, diameter);
  const len = Math.max(1, x1 - x0);
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter: d,
    length: len,
    original: { diameter: d, length: len },
    transform: unitTransform({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }),
  };
}

/** Default tab: 10×10×5 box sitting on the stock top, centered. */
export function defaultBox(stock: Stock): Primitive {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const top = stockSpan(stock, 'z')[1];
  return {
    kind: 'box',
    id: nextPrimitiveId(),
    size: { x: 10, y: 10, z: 5 },
    original: { x: 10, y: 10, z: 5 },
    transform: unitTransform({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: top + 2.5 }),
  };
}