/**
 * Operation inputs derived from the feature selection: pocket regions and
 * drill targets in machine coordinates (docs/edge-tracing.md: operations
 * consume selected features by stable id).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type { ChamferLoop, DrillOp, ModelTransform, Vec2 } from '../core/types';
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
 * axis become their disc; Z-normal planes become their BORDER LOOPS —
 * the tool follows the selected outline (a cross cuts a cross, not its
 * bounding box). `selectionZ` is the highest selected plane (with
 * several faces at different heights, the shallowest wins — add another
 * op for deeper ones). Mixing faces and holes in one op is rejected.
 * `indexRotation` maps points into the indexed cutting frame (see
 * src/cam/indexing.ts) so radial features face the cutter.
 */
export function pocketRegionsFromSelection(
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
    // the face's own border loops, projected to machine XY and oriented
    // outer-CCW / holes-CW by nesting depth (sliceAtZ's classification
    // rule) — the path follows the outline, not a box containing it
    const faceLoops = features.planeLoops
      .filter((l) => l.plane === pi)
      .map((l) =>
        l.points.map((pt) => {
          const v = xf(pt);
          return { x: v.x, y: v.y };
        }),
      );
    if (faceLoops.length === 0) continue;
    planeRegions.push(...orientLoops(faceLoops));
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

export interface ChamferSource {
  /** closed loops the V-bit flank is placed through, machine space */
  loops: ChamferLoop[];
}

/** Circle-match tolerances for face-outline loops (mm): a tessellated rim
 * loop that fits a feature circle this closely becomes the analytic circle
 * — identical to selecting that circle directly. */
const CHAMFER_CENTER_TOL = 0.05;
const CHAMFER_RADIUS_TOL = 0.02;

function loopSignedArea(points: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function pointInLoop(pt: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const pi = loop[i];
    const pj = loop[j];
    if (
      pi.y > pt.y !== pj.y > pt.y &&
      pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Orient face loops into the slicing convention — outer CCW, holes CW —
 * by nesting depth (the largest placed loop containing a candidate makes
 * it a hole), the same rule sliceAtZ uses for its contours. */
function orientLoops(loops: Vec2[][]): Vec2[][] {
  const byArea = loops
    .map((c) => ({ c, area: loopSignedArea(c) }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const out: Vec2[][] = [];
  for (const { c, area } of byArea) {
    let depth = 0;
    for (const placed of out) if (pointInLoop(c[0], placed)) depth++;
    const wantCCW = depth % 2 === 0;
    out.push((area > 0) === wantCCW ? c : [...c].reverse());
  }
  return out;
}

/**
 * Chamfer loops from the selection: circles (inner AND outer — unlike
 * drilling, a boss outline chamfers fine) and flat faces, whose outlines
 * become the paths. A face loop that fits a feature circle resolves to
 * that analytic circle — selecting the hole rim or the face around it
 * gives the same toolpath. `materialOutside` orients the 'auto' side per
 * loop (hole rim → material outside; a face's outer boundary → material
 * outside; a face's interior loops → material inside). Faces and circles
 * may mix. `indexRotation` maps points into the indexed cutting frame.
 */
export function chamferTargetsFromSelection(
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  indexRotation?: (p: { x: number; y: number; z: number }) => THREE.Vector3,
): ChamferSource | null {
  const xf0 = transformFn(transform);
  const xf = indexRotation
    ? (p: { x: number; y: number; z: number }) => indexRotation(xf0(p))
    : xf0;
  const loops: ChamferLoop[] = [];
  const directCircles = new Set<string>();

  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    const center = xf(c.center);
    loops.push({
      kind: 'circle',
      center: { x: center.x, y: center.y },
      radius: c.radius,
      z: center.z,
      materialOutside: c.inner,
    });
    directCircles.add(c.id);
  }

  const planeLoops = features.planeLoops;
  for (let pi = 0; pi < features.planes.length; pi++) {
    const p = features.planes[pi];
    if (!selection.includes(p.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z), xf)) < Z_TOL) continue;
    const faceLoops = planeLoops
      .filter((l) => l.plane === pi)
      .map((l) => l.points.map((pt) => {
        const v = xf(pt);
        return { x: v.x, y: v.y };
      }));
    if (faceLoops.length === 0) continue;
    const planeZ = xf(p.point).z;
    // material-side classification for loops that don't circle-match: the
    // containing (largest) loop bounds material outside it, interior loops
    // bound material inside the face
    const areas = faceLoops.map((pts) => Math.abs(loopSignedArea(pts)));
    const maxArea = Math.max(...areas);
    for (let li = 0; li < faceLoops.length; li++) {
      const pts = faceLoops[li];
      // fit: centroid + mean radius, and a roundness check — an analytic
      // circle matches only if every point sits on the fitted rim
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
      const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
      const radii = pts.map((q) => Math.hypot(q.x - cx, q.y - cy));
      const fitR = radii.reduce((s, r) => s + r, 0) / radii.length;
      const round = radii.every((r) => Math.abs(r - fitR) <= CHAMFER_RADIUS_TOL);
      const matched = round
        ? features.circles.find((c) => {
            const center = xf(c.center);
            return (
              // coplanar too — a through-hole's top and bottom rims share
              // XY center and radius, only Z tells them apart
              Math.abs(center.z - planeZ) <= CHAMFER_CENTER_TOL &&
              Math.hypot(center.x - cx, center.y - cy) <= CHAMFER_CENTER_TOL &&
              Math.abs(c.radius - fitR) <= CHAMFER_RADIUS_TOL
            );
          })
        : undefined;
      if (matched) {
        // identical to selecting the circle itself — and skip when it was
        if (directCircles.has(matched.id)) continue;
        const center = xf(matched.center);
        loops.push({
          kind: 'circle',
          center: { x: center.x, y: center.y },
          radius: matched.radius,
          z: center.z,
          materialOutside: matched.inner,
        });
        continue;
      }
      loops.push({
        kind: 'poly',
        points: pts,
        z: xf(p.point).z,
        materialOutside: faceLoops.length === 1 ? false : areas[li] < maxArea,
      });
    }
  }

  if (loops.length > 0) return { loops };

  // selected but nothing survived the frame gate — same diagnosis style
  // as pocketing so the message explains itself
  if (selection.length > 0) {
    throw new Error(
      'the selected features cannot be chamfered in the cutting frame — ' +
        'they are not within ~10° of horizontal (a side face or thread circle ' +
        'may have snapped instead of the intended edge; zoom in and re-click, ' +
        'or check the datum angle)',
    );
  }
  return null;
}