/**
 * Model placement: snapping a loaded model against the stock, in machine
 * coordinates. Pure geometry helpers — the viewport just renders the
 * transform, and later generators will consume the same ModelTransform to
 * slice the mesh at machine coordinates.
 */

import * as THREE from 'three';
import { originSpan } from '../core/types';
import type { ModelTransform, Stock, Vec3 } from '../core/types';

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
 * AABB of the geometry once the transform's rotation is applied, before
 * translation — i.e. relative to the model's (rotated) origin. Rotating the
 * 8 bbox corners and re-enclosing gives the exact rotated AABB.
 */
export function rotatedBBox(geometry: THREE.BufferGeometry, rotationDeg: Vec3): THREE.Box3 {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const m = rotationMatrix(rotationDeg);
  const out = new THREE.Box3();
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(
      i & 1 ? bb.max.x : bb.min.x,
      i & 2 ? bb.max.y : bb.min.y,
      i & 4 ? bb.max.z : bb.min.z,
    );
    out.expandByPoint(corner.applyMatrix4(m));
  }
  return out;
}

/** Machine Z of the surface a model rests on (cylinder crown, box top face). */
export function stockTopZ(stock: Stock): number {
  if (stock.kind === 'cylinder') return stock.calibration.crownZ;
  return originSpan(stock.origin.z, stock.sizeZ)[1];
}

/** Machine X of the stock's axial center. */
export function stockCenterX(stock: Stock): number {
  const [x0, x1] =
    stock.kind === 'cylinder'
      ? originSpan(stock.xOrigin, stock.length)
      : originSpan(stock.origin.x, stock.sizeX);
  return (x0 + x1) / 2;
}

/** Machine Y that centers the model over the stock (cylinder: the rotation axis). */
export function stockCenterY(stock: Stock): number {
  if (stock.kind === 'cylinder') return 0;
  const [y0, y1] = originSpan(stock.origin.y, stock.sizeY);
  return (y0 + y1) / 2;
}

/** Center the model on the stock's axial (X) center, keeping Y/Z and rotation. */
export function centerOnX(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform.rotationDeg);
  const center = bb.getCenter(new THREE.Vector3());
  return {
    ...transform,
    position: { ...transform.position, x: stockCenterX(stock) - center.x },
  };
}

/** Center the model over the stock in Y (cylinder: over the rotation axis). */
export function centerOnY(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform.rotationDeg);
  const center = bb.getCenter(new THREE.Vector3());
  return {
    ...transform,
    position: { ...transform.position, y: stockCenterY(stock) - center.y },
  };
}

/** Rest the model on the stock surface (its lowest rotated point on top Z). */
export function dropToSurface(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform.rotationDeg);
  return {
    ...transform,
    position: { ...transform.position, z: stockTopZ(stock) - bb.min.z },
  };
}

/** All three snaps at once. */
export function alignToStock(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  return dropToSurface(geometry, centerOnY(geometry, centerOnX(geometry, transform, stock), stock), stock);
}