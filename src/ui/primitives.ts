/**
 * Primitive creation helpers (docs/edge-tracing.md §4): roughing volumes and
 * tabs. Defaults come from the stock; a feature selection sizes them smartly
 * — a selected circle spawns a cylinder of the same diameter and center, a
 * selected rectangular face spawns a box with one face matching its extent.
 */

import * as THREE from 'three';
import type { CircleFeature, ModelTransform, Primitive, Stock } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
import { stockSpan } from './placement';
import { transformFn } from './featureOverlays';

let counter = 0;
export function nextPrimitiveId(): string {
  return `prim-${++counter}`;
}

/** Roughing cylinder sharing a selected circle's diameter and center (axis ∥ X). */
export function cylinderFromCircle(
  circle: CircleFeature,
  modelTransform: ModelTransform,
  axialSpan: readonly [number, number],
): Primitive {
  const xf = transformFn(modelTransform);
  const c = xf(circle.center);
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter: circle.radius * 2,
    length: Math.max(1, axialSpan[1] - axialSpan[0]),
    transform: {
      position: { x: c.x, y: c.y, z: c.z },
      rotationDeg: { x: 0, y: 0, z: 0 },
    },
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
  return {
    kind: 'box',
    id: nextPrimitiveId(),
    size: { x: maxA - minA, y: maxB - minB, z: thickness },
    transform: {
      position: { x: center.x, y: center.y, z: center.z },
      rotationDeg: {
        x: (e.x * 180) / Math.PI,
        y: (e.y * 180) / Math.PI,
        z: (e.z * 180) / Math.PI,
      },
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
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter: Math.max(1, diameter),
    length: Math.max(1, x1 - x0),
    transform: {
      position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
      rotationDeg: { x: 0, y: 0, z: 0 },
    },
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
    transform: {
      position: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: top + 2.5 },
      rotationDeg: { x: 0, y: 0, z: 0 },
    },
  };
}