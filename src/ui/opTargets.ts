/**
 * Operation inputs derived from the feature selection: pocket regions and
 * drill targets in machine coordinates (docs/edge-tracing.md: operations
 * consume selected features by stable id).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type { DrillOp, ModelTransform, Vec2 } from '../core/types';
import { transformFn } from './featureOverlays';

/**
 * Tolerance for "a usable pocket/profile floor" — a face or hole rim
 * within ~10° of horizontal in the cutting frame (a slightly tilted floor
 * still cuts fine). Drilling stays stricter (see drillTargetsFromSelection).
 */
const Z_TOL = 0.985;
/** Tolerance for "parallel to the machine drill axis". */
const DRILL_Z_TOL = 0.999;
/** Sampling density for circle regions. */
const CIRCLE_SEGMENTS = 64;

export interface PocketSource {
  /** machine-space XY contours (outer CCW, holes CW) */
  regions: Vec2[][];
  /**
   * The selected features' plane height. What it MEANS (cut down to it
   * from the crown, or down from it by the op's depth) is the op's
   * `selectionIs` decision — geometry alone cannot tell a hole rim from
   * a hole bottom, so this stays pure geometry.
   */
  selectionZ: number;
}

function machineAxisZ(v: THREE.Vector3, xf: (p: { x: number; y: number; z: number }) => THREE.Vector3): number {
  const rotated = xf(v).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
  return rotated.z;
}

/**
 * Pocket regions from the selection: circles aligned to the machine Z
 * axis become their disc; Z-normal planes become their footprint
 * rectangle. `selectionZ` is the highest selected plane (with several
 * faces at different heights, the shallowest wins — add another op for
 * deeper ones). Mixing faces and holes in one op is rejected.
 * `indexRotation` maps points into the indexed cutting frame (see
 * src/cam/indexing.ts) so radial features face the cutter.
 */
export function pocketRegionsFromSelection(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  indexRotation?: (p: { x: number; y: number; z: number }) => THREE.Vector3,
): PocketSource | null {
  const xf0 = transformFn(transform);
  const xf = indexRotation
    ? (p: { x: number; y: number; z: number }) => indexRotation(xf0(p))
    : xf0;
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
    return { regions: planeRegions, selectionZ: faceZ };
  }
  if (circleRegions.length > 0) {
    return { regions: circleRegions, selectionZ: rimZ };
  }
  // features are selected but none survived the frame gate: say so —
  // "select features…" here reads as if the click never registered
  if (selection.length > 0) {
    throw new Error(
      'the selected features cannot be pocketed in the cutting frame — ' +
        'they are not within ~10° of horizontal (a thread circle or side face ' +
        'may have snapped instead of the intended floor; zoom in and re-click, ' +
        'or check the datum angle)',
    );
  }
  return null;
}

/**
 * Drill targets from the selection: interior-loop (hole) circles aligned
 * with the machine Z axis, drilled to `depth` below the rim.
 * `indexRotation` maps points into the indexed cutting frame.
 */
export function drillTargetsFromSelection(
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  depth: number,
  indexRotation?: (p: { x: number; y: number; z: number }) => THREE.Vector3,
): DrillOp['targets'] | null {
  const xf0 = transformFn(transform);
  const xf = indexRotation
    ? (p: { x: number; y: number; z: number }) => indexRotation(xf0(p))
    : xf0;
  const targets: DrillOp['targets'] = [];
  for (const c of features.circles) {
    if (!c.inner || !selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < DRILL_Z_TOL) continue;
    const center = xf(c.center);
    targets.push({ x: center.x, y: center.y, topZ: center.z, depth });
  }
  return targets.length > 0 ? targets : null;
}