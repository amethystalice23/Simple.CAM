/**
 * Operation inputs derived from the feature selection: pocket regions and
 * drill targets in machine coordinates (docs/edge-tracing.md: operations
 * consume selected features by stable id).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type { DrillOp, ModelTransform, Vec2 } from '../core/types';
import { transformFn } from './featureOverlays';

/** Tolerance for "parallel to the machine drill axis". */
const Z_TOL = 0.999;
/** Sampling density for circle regions. */
const CIRCLE_SEGMENTS = 64;

export interface PocketSource {
  /** machine-space XY contours (outer CCW, holes CW) */
  regions: Vec2[][];
  /** machine Z of the highest selected surface (pocket top) */
  topZ: number;
}

function machineAxisZ(v: THREE.Vector3, xf: (p: { x: number; y: number; z: number }) => THREE.Vector3): number {
  const rotated = xf(v).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
  return rotated.z;
}

/**
 * Pocket regions from the selection: circles aligned to the machine Z axis
 * become their disc; Z-normal planes become their XY footprint rectangle.
 * Returns null when nothing selected is pocketable.
 */
export function pocketRegionsFromSelection(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
): PocketSource | null {
  const xf = transformFn(transform);
  const regions: Vec2[][] = [];
  let topZ = -Infinity;

  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    const center = xf(c.center);
    const contour: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      contour.push({ x: center.x + Math.cos(a) * c.radius, y: center.y + Math.sin(a) * c.radius });
    }
    regions.push(contour);
    topZ = Math.max(topZ, center.z);
  }

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
    regions.push([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]);
    topZ = Math.max(topZ, xf(p.point).z);
  }

  if (regions.length === 0) return null;
  return { regions, topZ };
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