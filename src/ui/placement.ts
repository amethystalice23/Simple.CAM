/**
 * Model placement: snapping a loaded model against the stock, in machine
 * coordinates. Pure geometry helpers — the viewport just renders the
 * transform, and later generators will consume the same ModelTransform to
 * slice the mesh at machine coordinates.
 */

import * as THREE from 'three';
import { originSpan } from '../core/types';
import type { ModelTransform, OriginEdge, Stock, Vec2, Vec3 } from '../core/types';

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
  if (bb.isEmpty()) {
    // an empty mesh (artwork's raycast-transparent primitiveGeometry)
    // carries a ±Infinity box — a zero box at the origin instead, so
    // snapping can never write NaN/Inf into a transform position
    return new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
  }
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

/**
 * Machine Z of the surface a model rests on: a box's top face, a 4-axis
 * cylinder's highest tangent (axis ∥ X, so the surface is axisZ + r), or
 * a 3-axis cylinder's top face — it stands vertical, so the crown is the
 * far end of its along-axis span.
 */
export function stockTopZ(stock: Stock): number {
  if (stock.kind === 'cylinder') {
    if (stock.axisMode === '3-axis') return originSpan(stock.xOrigin, stock.length)[1];
    return stock.calibration.axisZ + stock.calibration.effectiveRadius;
  }
  return originSpan(stock.origin.z, stock.sizeZ)[1];
}

/**
 * Machine-coordinate span of the stock along an axis. A 4-axis cylinder
 * lies along X (its Y span is the silhouette [−r, r] around the rotation
 * axis; its Z span is centered on the axis datum, axisZ ± r). A 3-axis
 * cylinder stands vertical: axis ∥ Z, centered on X0/Y0, its length is
 * the height and xOrigin places machine Z0 along it.
 */
export function stockSpan(stock: Stock, axis: 'x' | 'y' | 'z'): readonly [number, number] {
  if (stock.kind === 'cylinder') {
    const r = stock.calibration.effectiveRadius;
    if (stock.axisMode === '3-axis') {
      switch (axis) {
        case 'x':
        case 'y':
          return [-r, r];
        case 'z':
          return originSpan(stock.xOrigin, stock.length);
      }
    }
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
 * The stock's XY footprint as one closed CCW contour — the region the
 * waste-stock toggle clears around the model's cross-section. A standing
 * cylinder is a 64-gon circle at X0/Y0; a 4-axis cylinder's silhouette is
 * its length × diameter rectangle. `rotated` = the stock sits at a nonzero
 * index angle: a cylinder's silhouette is unchanged (rotation about its own
 * axis), a box's Y-extent becomes its conservative half-diagonal envelope
 * (rotation about X carries the Z extent into Y) — clearing slightly
 * outside the true silhouette, never inside it.
 */
export function stockFootprint(stock: Stock, rotated = false): Vec2[][] {
  if (stock.kind === 'box') {
    const [x0, x1] = stockSpan(stock, 'x');
    let y0: number;
    let y1: number;
    if (rotated) {
      const halfDiag = Math.hypot(stock.sizeY, stock.sizeZ) / 2;
      y0 = -halfDiag;
      y1 = halfDiag;
    } else {
      [y0, y1] = stockSpan(stock, 'y');
    }
    return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
  }
  const r = stock.calibration.effectiveRadius;
  if (stock.axisMode === '3-axis') {
    const pts: Vec2[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return [pts];
  }
  const [x0, x1] = stockSpan(stock, 'x');
  return [[{ x: x0, y: -r }, { x: x1, y: -r }, { x: x1, y: r }, { x: x0, y: r }]];
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