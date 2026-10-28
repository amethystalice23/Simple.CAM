/**
 * Operation inputs derived from the feature selection: pocket regions and
 * drill targets in machine coordinates (docs/edge-tracing.md: operations
 * consume selected features by stable id).
 */

import * as THREE from 'three';
import type { DetectedFeatures } from '../cam/features';
import type {
  ChamferLoop,
  CircleFeature,
  CylChamferEdge,
  DrillOp,
  ModelTransform,
  RotaryCalibration,
  Vec2,
} from '../core/types';
import { transformFn } from './featureOverlays';

/**
 * Tolerance for "a usable pocket/profile floor" — a face or hole rim
 * within ~10° of horizontal in the cutting frame (a slightly tilted floor
 * still cuts fine). Drilling stays stricter (see drillTargetsFromSelection).
 */
const Z_TOL = 0.985;
/** Tolerance for "parallel to the machine drill axis". */
const DRILL_Z_TOL = 0.999;
/** Tolerance for "coaxial with the machine X / rotation axis" — a circle
 * within ~10° of X bounds a surface the A sweep can cut. */
const X_TOL = 0.985;
/** A circle coaxial with X must sit ON the stock axis — farther off and
 * the A sweep would trace an ellipse, not the selected circle. */
const ON_AXIS_TOL_MM = 0.2;
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

/** X component of a direction in machine space — 1 = parallel to the
 * rotation axis (4th axis ∥ X, verified). */
function machineAxisX(v: THREE.Vector3, xf: (p: { x: number; y: number; z: number }) => THREE.Vector3): number {
  const rotated = xf(v).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
  return rotated.x;
}

/**
 * WHY a selection produced nothing in the cutting frame (Alice,
 * 2026-10-28): a feature whose direction is PARALLEL to the rotation
 * axis has NO sensible interpretation on this machine — indexing only
 * spins it in place, it can never face the cutter. A feature that faces
 * AWAY at this datum, or a side wall with no Z component, is reachable
 * by rotating the stock — the honest message is "add an Index op", not
 * a refusal. Near-horizontal floors that missed the ~10° tolerance
 * keep the generic re-click advice. Most severe finding wins.
 */
function frameGateDiagnosis(
  features: DetectedFeatures,
  selection: string[],
  xf: (p: { x: number; y: number; z: number }) => THREE.Vector3,
): 'parallel' | 'away' | 'sideways' | null {
  let away = false;
  let sideways = false;
  const dirs: THREE.Vector3[] = [];
  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    dirs.push(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z));
  }
  for (const p of features.planes) {
    if (!selection.includes(p.id)) continue;
    dirs.push(new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z));
  }
  for (const d of dirs) {
    const z = machineAxisZ(d, xf);
    if (Math.abs(z) >= Z_TOL) {
      // a plane facing away at this datum: its rim re-reads up, but the
      // outline itself has no up reading here — rotate the stock
      if (z <= -Z_TOL) away = true;
      continue;
    }
    if (Math.abs(machineAxisX(d, xf)) >= X_TOL) return 'parallel';
    if (Math.abs(z) < 0.5) sideways = true; // a wall, not a tilted floor
  }
  if (away) return 'away';
  return sideways ? 'sideways' : null;
}

/**
 * The UP-FACING reading of a selected circle (Alice, 2026-10-28): an
 * indexed op has exactly one sensible interpretation of a rim — the one
 * facing the tool in the frame in effect. Among circles sharing the
 * machine-XY center and radius, that is the one at the highest machine Z
 * (a bore's upper mouth, a plateau's top edge). The loop-winding AXIS is
 * deliberately NOT the test: its Newell sign flips between bore rims and
 * outline rims, and reading it as "facing" anchored a 180°-indexed
 * chamfer on the underside rim — the cut went through the part. The
 * selected circle returns unchanged when it already is the up face.
 */
function upFacingCircle(
  features: DetectedFeatures,
  c: CircleFeature,
  xf: (p: { x: number; y: number; z: number }) => THREE.Vector3,
): CircleFeature {
  const center = xf(c.center);
  let best = c;
  let bestZ = center.z;
  for (const o of features.circles) {
    if (o.id === c.id || o.arcs) continue;
    const oc = xf(o.center);
    if (Math.abs(oc.x - center.x) > CHAMFER_CENTER_TOL) continue;
    if (Math.abs(oc.y - center.y) > CHAMFER_CENTER_TOL) continue;
    if (Math.abs(o.radius - c.radius) > CHAMFER_RADIUS_TOL) continue;
    if (oc.z > bestZ) {
      best = o;
      bestZ = oc.z;
    }
  }
  return best;
}

/**
 * Pocket regions from the selection: circles aligned to the machine Z
 * axis become their disc; Z-normal planes become their BORDER LOOPS —
 * the tool follows the selected outline (a cross cuts a cross, not its
 * bounding box); `flatten` keeps only each face's OUTER boundary
 * (interior voids are crossed, interior islands milled off). `selectionZ` is the highest selected plane (with
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
  /** FLATTEN: interior loops are voids to cross, not islands to keep —
   * each selected face contributes only its outer boundary. */
  flatten = false,
): PocketSource | null {
  const xf0 = transformFn(transform);
  const xf = indexRotation
    ? (p: { x: number; y: number; z: number }) => indexRotation(xf0(p))
    : xf0;
  const circleRegions: Vec2[][] = [];
  let rimZ = -Infinity;
  /** a selected partial circle doesn't bound a disc — say so instead of
   * falling through to the misleading frame-gate error */
  let sawPartial = false;
  const seenRims = new Set<string>();

  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    if (c.arcs) {
      sawPartial = true;
      continue;
    }
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    // the up-facing reading: a rim selected on the underside of the part
    // at this datum still bounds the same disc — read it at its upper
    // mouth (both ends of one bore are one region)
    const up = upFacingCircle(features, c, xf);
    if (seenRims.has(up.id)) continue;
    seenRims.add(up.id);
    const center = xf(up.center);
    const contour: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      contour.push({ x: center.x + Math.cos(a) * up.radius, y: center.y + Math.sin(a) * up.radius });
    }
    circleRegions.push(contour);
    rimZ = Math.max(rimZ, center.z);
  }

  const planeRegions: Vec2[][] = [];
  let faceZ = -Infinity;

  for (let pi = 0; pi < features.planes.length; pi++) {
    const p = features.planes[pi];
    if (!selection.includes(p.id)) continue;
    // up-facing only: a plane whose rotated normal points AWAY from the
    // tool has no up reading at this datum — its outline would cut inside
    // the part (the 180° chamfer lesson: gate on the SIGN, not the magnitude)
    if (machineAxisZ(new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z), xf) < Z_TOL) continue;
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
    if (flatten) {
      // the outer boundary alone (the largest loop), CCW — the tool
      // crosses every interior feature: indents and holes are air,
      // anything proud gets milled to the floor
      let outer = faceLoops[0];
      let outerArea = -Infinity;
      for (const c of faceLoops) {
        const area = Math.abs(loopSignedArea(c));
        if (area > outerArea) {
          outerArea = area;
          outer = c;
        }
      }
      planeRegions.push(loopSignedArea(outer) >= 0 ? outer : [...outer].reverse());
    } else {
      planeRegions.push(...orientLoops(faceLoops));
    }
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
  if (sawPartial) {
    throw new Error(
      'a partial circle (a broken rim) cannot bound a pocket — select flat ' +
        'faces for the outline, or use its Ø in a facing operation',
    );
  }
  // features are selected but none survived the frame gate: say so —
  // "select features…" here reads as if the click never registered
  if (selection.length > 0) {
    const diag = frameGateDiagnosis(features, selection, xf);
    if (diag === 'parallel') {
      throw new Error(
        'a selected feature is parallel to the rotation axis — it can never ' +
          'face the cutter on this machine, however you index: there is no ' +
          'sensible interpretation',
      );
    }
    if (diag === 'away') {
      throw new Error(
        'the selected face points away from the cutter at this datum — ' +
          'add an Index op to rotate it up if you want to machine this one',
      );
    }
    if (diag === 'sideways') {
      throw new Error(
        'the selected face points sideways in the cutting frame — it is ' +
          'reachable by rotating the stock: add an Index op if you want to ' +
          'machine this one',
      );
    }
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
  const seen = new Set<string>();
  for (const c of features.circles) {
    // a broken hole rim doesn't bound a drillable center
    if (!c.inner || c.arcs || !selection.includes(c.id)) continue;
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < DRILL_Z_TOL) continue;
    // the up-facing reading: enter the bore at its upper mouth in the
    // cutting frame, never at a rim the tool would have to reach through
    // the part to touch (both ends of one bore are one hole)
    const up = upFacingCircle(features, c, xf);
    if (seen.has(up.id)) continue;
    seen.add(up.id);
    const center = xf(up.center);
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
    if (c.arcs) {
      // a broken rim has no 360° path — refuse loudly rather than
      // chamfering a circle that isn't there
      throw new Error(
        'a partial circle (a broken rim) cannot be chamfered — select a full ' +
          'circle, or a flat face to follow its outline',
      );
    }
    if (Math.abs(machineAxisZ(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < Z_TOL) continue;
    // the up-facing reading: a rim selected on the side that faces away at
    // this datum is read at the mouth that faces the tool (Alice
    // 2026-10-28: an indexed op has exactly one sensible interpretation —
    // both ends of one bore are one loop)
    const up = upFacingCircle(features, c, xf);
    if (directCircles.has(up.id)) continue;
    const center = xf(up.center);
    loops.push({
      kind: 'circle',
      center: { x: center.x, y: center.y },
      radius: up.radius,
      z: center.z,
      materialOutside: up.inner,
    });
    directCircles.add(up.id);
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
    // the plane may face away at this datum — its circle-matched loops
    // still re-anchor on the up-facing rim below; a bare poly outline has
    // no up reading and must not cut through the part
    const planeDown = machineAxisZ(new THREE.Vector3(p.normal.x, p.normal.y, p.normal.z), xf) < -Z_TOL;
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
        // identical to selecting the circle itself — resolved to its
        // up-facing reading, so a plane picked on the far side of a
        // through-hole still chamfers the mouth facing the tool (her
        // 180°-indexed barrel adapter: the top floor selection cut inside
        // the part before this re-anchor)
        const up = upFacingCircle(features, matched, xf);
        if (directCircles.has(up.id)) continue;
        const center = xf(up.center);
        loops.push({
          kind: 'circle',
          center: { x: center.x, y: center.y },
          radius: up.radius,
          z: center.z,
          materialOutside: up.inner,
        });
        continue;
      }
      if (planeDown) continue; // no up reading for a back-facing outline
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
  // as pocketing so the message explains itself. One geometry CAN never
  // face up under indexing, and deserves its own message: a circle whose
  // axis is PARALLEL to the rotation axis (a rod end, a step edge) just
  // spins in place at every datum angle — that's the cylinder chamfer
  // op's job, not a datum problem.
  if (selection.length > 0) {
    for (const c of features.circles) {
      if (!selection.includes(c.id)) continue;
      const axis = new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z);
      if (Math.abs(machineAxisX(axis, xf)) >= X_TOL) {
        throw new Error(
          'a circle around the stock axis can never be chamfered in the cutting frame — ' +
            'its axis is the rotation axis, so indexing spins it in place. Use the ' +
            'Cylinder chamfer op for rod ends and step edges',
        );
      }
    }
    const diag = frameGateDiagnosis(features, selection, xf);
    if (diag === 'parallel') {
      throw new Error(
        'a selected feature is parallel to the rotation axis — it can never ' +
          'face the cutter on this machine, however you index: there is no ' +
          'sensible interpretation',
      );
    }
    if (diag === 'away') {
      throw new Error(
        'the selected face points away from the cutter at this datum — ' +
          'add an Index op to rotate it up if you want to machine this one',
      );
    }
    if (diag === 'sideways') {
      throw new Error(
        'the selected edge points sideways in the cutting frame — it is ' +
          'reachable by rotating the stock: add an Index op if you want to ' +
          'machine this one',
      );
    }
    throw new Error(
      'the selected features cannot be chamfered in the cutting frame — ' +
        'they are not within ~10° of horizontal (a side face or thread circle ' +
        'may have snapped instead of the intended edge; zoom in and re-click, ' +
        'or check the datum angle)',
    );
  }
  return null;
}

export interface CylChamferTargets {
  /** accepted edge circles, machine space */
  edges: CylChamferEdge[];
}

/**
 * Cylinder-chamfer edges from the selection (edge-tracing §6): full
 * circles whose axis is the machine X / rotation axis and whose center
 * sits ON the stock axis — the A sweep cuts exactly those. The index
 * frame is deliberately NOT applied: rotating about the stock axis maps
 * such a circle to itself (center on the axis, X component unchanged),
 * so the anchor is datum-invariant and a full 360° pass looks the same
 * from any start angle. Face-op circles, stock end rims, and on-axis
 * model circles all resolve here identically.
 */
export function cylChamferTargetsFromSelection(
  features: DetectedFeatures,
  selection: string[],
  transform: ModelTransform,
  calibration: RotaryCalibration,
): CylChamferTargets | null {
  const xf = transformFn(transform);
  const edges: CylChamferEdge[] = [];
  let sawOffAxis = false;
  for (const c of features.circles) {
    if (!selection.includes(c.id)) continue;
    if (c.arcs) {
      throw new Error(
        'a partial circle (a broken rim) cannot be chamfered — select a full ' +
          'circle around the stock axis',
      );
    }
    if (Math.abs(machineAxisX(new THREE.Vector3(c.axis.x, c.axis.y, c.axis.z), xf)) < X_TOL) {
      continue; // not coaxial with the rotation axis
    }
    const center = xf(c.center);
    if (Math.hypot(center.y, center.z - calibration.axisZ) > ON_AXIS_TOL_MM) {
      sawOffAxis = true; // around X, but not around the STOCK axis
      continue;
    }
    edges.push({ x: center.x, diameter: c.radius * 2 });
  }
  if (edges.length > 0) return { edges };
  if (sawOffAxis) {
    throw new Error(
      'the selected circle runs around X but sits off the stock axis — an A ' +
        'sweep would trace an ellipse, not the circle (the primitive must sit ' +
        'on the rotation axis)',
    );
  }
  if (selection.length > 0) {
    throw new Error(
      'the selected features hold no circle around the stock axis — cylinder ' +
        'chamfer cuts a full 360° ring, so it needs an edge circle coaxial with ' +
        'the rotation axis (face-op step edges and stock end rims show as green ' +
        'circles; zoom in and re-click)',
    );
  }
  return null;
}