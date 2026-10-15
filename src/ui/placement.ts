/**
 * Model placement: snapping a loaded model against the stock, in machine
 * coordinates. Pure geometry helpers — the viewport just renders the
 * transform, and later generators will consume the same ModelTransform to
 * slice the mesh at machine coordinates.
 */

import * as THREE from 'three';
import { originSpan } from '../core/types';
import type { ModelTransform, OriginEdge, Stock, Vec3 } from '../core/types';

const D2R = Math.PI / 180;

function rotationMatrix(rotationDeg: Vec3): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      rotationDeg.x * D2R,
      rotationDeg.y * D2R,
      rotationDeg.z * D2R,
      'XYZ',
    ),
  );
}

/**
 * AABB of the geometry once the transform's scale and rotation are applied,
 * before translation — i.e. relative to the model's (scaled, rotated)
 * origin. Scaling the 8 bbox corners, rotating, and re-enclosing gives the
 * exact rotated AABB.
 */
export function rotatedBBox(geometry: THREE.BufferGeometry, transform: ModelTransform): THREE.Box3 {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const m = rotationMatrix(transform.rotationDeg);
  const s = transform.scale;
  const out = new THREE.Box3();
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(
      (i & 1 ? bb.max.x : bb.min.x) * s.x,
      (i & 2 ? bb.max.y : bb.min.y) * s.y,
      (i & 4 ? bb.max.z : bb.min.z) * s.z,
    );
    out.expandByPoint(corner.applyMatrix4(m));
  }
  return out;
}

/** Machine Z of the surface a model rests on (cylinder top, box top face). */
export function stockTopZ(stock: Stock): number {
  if (stock.kind === 'cylinder') return stock.calibration.axisZ + stock.calibration.effectiveRadius;
  return originSpan(stock.origin.z, stock.sizeZ)[1];
}

/**
 * Machine-coordinate span of the stock along an axis. A cylinder's Y span is
 * its silhouette [−r, r] around the rotation axis; its Z span is centered on
 * the axis datum (axisZ ± r).
 */
export function stockSpan(stock: Stock, axis: 'x' | 'y' | 'z'): readonly [number, number] {
  if (stock.kind === 'cylinder') {
    const r = stock.calibration.effectiveRadius;
    switch (axis) {
      case 'x':
        return originSpan(stock.xOrigin, stock.length);
      case 'y':
        return [-r, r];
      case 'z':
        return [stock.calibration.axisZ - r, stock.calibration.axisZ + r];
    }
  }
  switch (axis) {
    case 'x':
      return originSpan(stock.origin.x, stock.sizeX);
    case 'y':
      return originSpan(stock.origin.y, stock.sizeY);
    case 'z':
      return originSpan(stock.origin.z, stock.sizeZ);
  }
}

/**
 * Align the model's min/mid/max extent on one axis to the stock's min/mid/max
 * — e.g. edge 'max' on X puts the model's far edge flush with the stock's.
 * Rotation-aware: extents come from the rotated bounding box.
 */
export function alignAxisToStock(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
  axis: 'x' | 'y' | 'z',
  edge: OriginEdge,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform);
  const [s0, s1] = stockSpan(stock, axis);
  const target = edge === 'min' ? s0 : edge === 'max' ? s1 : (s0 + s1) / 2;
  const extent =
    edge === 'min' ? bb.min[axis] : edge === 'max' ? bb.max[axis] : (bb.min[axis] + bb.max[axis]) / 2;
  return { ...transform, position: { ...transform.position, [axis]: target - extent } };
}

/** Center the model on the stock's axial (X) center, keeping Y/Z and rotation. */
export const centerOnX = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'x', 'mid');

/** Center the model over the stock in Y (cylinder: over the rotation axis). */
export const centerOnY = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'y', 'mid');

/** Center the model on the stock's Z center (cylinder: on the rotation axis). */
export const centerOnZ = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'z', 'mid');

/** Rest the model on the stock surface (its lowest rotated point on top Z). */
export function dropToSurface(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform);
  return {
    ...transform,
    position: { ...transform.position, z: stockTopZ(stock) - bb.min.z },
  };
}

/**
 * Place the model's center on the stock's center, all axes. For 4th-axis
 * (cylinder) work this puts the model centered on the rotation axis, ready
 * for wrapped cuts; for box stock it centers the model in the blank.
 */
export function alignToStock(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  return centerOnZ(geometry, centerOnY(geometry, centerOnX(geometry, transform, stock), stock), stock);
}