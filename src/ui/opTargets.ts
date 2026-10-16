/**
 * Operation inputs derived from the feature selection: pocket regions and
 * drill targets in machine coordinates (docs/edge-tracing.md: operations
 * consume selected features by stable id).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type { DrillOp, ModelTransform, Stock, Vec2 } from '../core/types';
import { stockTopZ } from './placement';
import { transformFn } from './featureOverlays';

/** Tolerance for "parallel to the machine drill axis". */
const Z_TOL = 0.999;
/** Sampling density for circle regions. */
const CIRCLE_SEGMENTS = 64;

export interface PocketSource {
  /** machine-space XY contours (outer CCW, holes CW) */
  regions: Vec2[][];
  /**
   * Machine Z the cut starts from. For a selected FACE this is the stock
   * crown — the op works its way down from the stock surface to the face.
   * For a selected hole it is the rim.
   */
  topZ: number;
  /**
   * Known floor from the selection: a selected face's own height. Null for
   * hole selections, where the floor comes from the op's depth parameter.
   */
  floorZ: number | null;
}

function machineAxisZ(v: THREE.Vector3, xf: (p: { x: number; y: number; z: number }) => THREE.Vector3): number {
  const rotated = xf(v).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
  return rotated.z;
}

/**
 * Pocket regions from the selection. Selected flat faces are the FLOOR:
 * the cut starts at the stock crown and works down to the face (with
 * several faces at different heights, it clears down to the shallowest —
 * add another op for deeper faces). Selected circles are holes: the cut
 * starts at the rim and goes the op's depth below it. Mixing faces and
 * holes in one op is rejected.
 */
export function pocketRegionsFromSelection(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  stock: Stock,
): PocketSource | null {
  const xf = transformFn(transform);
  const circleRegions: Vec2[][] = [];
  let rimZ = -Infinity;

  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    const center = xf(c.center);
    const contour: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      contour.push({ x: center.x + Math.cos(a) * c.radius, y: center.y + Math.sin(a) * c.radius });
    }
    circleRegions.push(contour);
    rimZ = Math.max(rimZ, center.z);
  }

  const planeRegions: Vec2[][] = [];
  let faceZ = -Infinity;

  for (let pi = 0; pi < features.planes.length; pi++) {
    const p = features.planes[pi];
    if (!selection.includes(p.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z), xf)) < Z_TOL) continue;
    // member-triangle XY footprint rectangle
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const triCount = Math.floor(attr.count / 3);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let t = 0; t < triCount; t++) {
      if (features.faceToPlane[t] !== pi) continue;
      for (let k = 0; k < 3; k++) {
        const v = xf({ x: attr.getX(t * 3 + k), y: attr.getY(t * 3 + k), z: attr.getZ(t * 3 + k) });
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    if (minX > maxX) continue;
    planeRegions.push([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]);
    faceZ = Math.max(faceZ, xf(p.point).z);
  }

  if (circleRegions.length > 0 && planeRegions.length > 0) {
    throw new Error('select either faces or holes for this operation, not both');
  }
  if (planeRegions.length > 0) {
    return { regions: planeRegions, topZ: stockTopZ(stock), floorZ: faceZ };
  }
  if (circleRegions.length > 0) {
    return { regions: circleRegions, topZ: rimZ, floorZ: null };
  }
  return null;
}

/**
 * Drill targets from the selection: interior-loop (hole) circles aligned
 * with the machine Z axis, drilled to `depth` below the rim.
 */
export function drillTargetsFromSelection(
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  depth: number,
): DrillOp['targets'] | null {
  const xf = transformFn(transform);
  const targets: DrillOp['targets'] = [];
  for (const c of features.circles) {
    if (!c.inner || !selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    const center = xf(c.center);
    targets.push({ x: center.x, y: center.y, topZ: center.z, depth });
  }
  return targets.length > 0 ? targets : null;
}