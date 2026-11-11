/**
 * The suggest-ops knowledge engine (docs/PLAN.md "Suggest ops", round 1):
 * ONE picked feature → what the detector measured about it, and which
 * operations could act on it, with the reason each is offered. Pure
 * geometry in the A=0 machine frame — no op creation, no UI state; the
 * proposal sheet (round 2) turns candidates into ops. The gates mirror
 * src/ui/opTargets.ts (an offered candidate must be one its op would
 * actually accept), so what the sheet promises is what the ops do.
 */

import * as THREE from 'three';
import type { CircleFeature, JobOp, Stock, Vec3 } from '../core/types';
import { rotaryCalibrationOf } from '../core/types';
import { planeExtents, transformFn } from './featureOverlays';
import type { ResolvedFeature } from './featureSources';
import { metricPitch } from './jobGeneration';
import { stockTopZ } from './placement';

/** "usable as a pocket/profile floor" — within ~10° of level
 * (opTargets Z_TOL; keep the two in step or the sheet over-promises). */
const Z_TOL = 0.985;
/** "usable as a drill/thread axis" — near-exactly vertical
 * (opTargets DRILL_Z_TOL). */
const DRILL_Z_TOL = 0.999;
/** "coaxial with the rotation axis" (opTargets X_TOL). */
const X_TOL = 0.985;
/** a circle around X must sit ON the stock axis for an A sweep to
 * trace it (opTargets ON_AXIS_TOL_MM). */
const ON_AXIS_TOL_MM = 0.2;

export interface SuggestFact {
  label: string;
  value: string;
}

export interface SuggestCandidate {
  kind: JobOp['kind'];
  /** feature-specific reason this op is offered for THIS feature */
  why: string;
}

export interface FeatureKnowledge {
  kind: ResolvedFeature['kind'];
  title: string;
  facts: SuggestFact[];
  /** ops this feature could drive, most-relevant first */
  candidates: SuggestCandidate[];
  /** cautions / refusals worth saying out loud */
  notes: string[];
}

const f1 = (n: number) => n.toFixed(1);

/** machine-frame Z component of a model-space direction */
function dirZ(v: Vec3, xf: (p: Vec3) => THREE.Vector3): number {
  const zero = xf({ x: 0, y: 0, z: 0 });
  return xf(v).sub(zero).normalize().z;
}

/** machine-frame X component of a model-space direction — 1 = parallel
 * to the rotation axis */
function dirX(v: Vec3, xf: (p: Vec3) => THREE.Vector3): number {
  const zero = xf({ x: 0, y: 0, z: 0 });
  return xf(v).sub(zero).normalize().x;
}

/** degrees a direction is off the machine Z axis (0 = straight up/down) */
function tiltDeg(v: Vec3, xf: (p: Vec3) => THREE.Vector3): number {
  return (Math.acos(Math.min(Math.abs(dirZ(v, xf)), 1)) * 180) / Math.PI;
}

/**
 * What the detector knows about one picked feature, and the ops it
 * suggests for it. Every resolved kind answers something, even if only
 * "no op drives this" (an edge).
 */
export function describePickedFeature(r: ResolvedFeature, stock: Stock): FeatureKnowledge {
  const xf = transformFn(r.source.transform);
  const rotary = stock.axisMode === '4-axis';
  const axisZ = rotary ? rotaryCalibrationOf(stock).axisZ : null;
  const crown = stockTopZ(stock);

  if (r.kind === 'plane') return describePlane(r, xf, rotary, axisZ, crown);
  if (r.kind === 'circle') {
    return describeCircle(r.feature as CircleFeature, xf, rotary, axisZ, crown);
  }
  if (r.kind === 'radialChain') return describeChain(r, xf, axisZ);
  if (r.kind === 'path') return describePath(r);
  return describeEdge(r, xf, rotary);
}

function describePlane(
  r: ResolvedFeature,
  xf: (p: Vec3) => THREE.Vector3,
  rotary: boolean,
  axisZ: number | null,
  crown: number,
): FeatureKnowledge {
  const plane = r.feature as { point: Vec3; normal: Vec3 };
  const loops = r.source.features.planeLoops.filter((l) => l.plane === r.index);
  const center = xf(plane.point);
  const level = Math.abs(dirZ(plane.normal, xf)) >= Z_TOL;
  const tilt = tiltDeg(plane.normal, xf);
  const ext = planeExtents(r.source.geometry, r.source.features, r.source.transform)[r.index];
  const facts: SuggestFact[] = [
    { label: 'size', value: ext ? `${f1(ext.w)} × ${f1(ext.h)} mm` : 'unmeasured' },
    { label: 'faces', value: level ? 'level (up)' : `tilted ${f1(tilt)}° off level` },
    {
      label: 'height',
      value: `Z ${f1(center.z)} — ${f1(Math.max(crown - center.z, 0))} mm below the stock top`,
    },
  ];
  if (loops.length > 1) {
    facts.push({
      label: 'boundary',
      value: `outline + ${loops.length - 1} interior loop${loops.length === 2 ? '' : 's'}`,
    });
  }
  if (rotary && axisZ !== null) {
    facts.push({
      label: 'radial',
      value: `${f1(Math.hypot(center.y, center.z - axisZ))} mm from the stock axis`,
    });
  }
  const candidates: SuggestCandidate[] = [];
  const notes: string[] = [];
  if (level) {
    candidates.push({
      kind: 'pocket',
      why: 'clear this level down to its own height, following the outline you selected',
    });
    candidates.push({
      kind: 'chamfer',
      why: 'run a V-bit around this face’s boundary to break its edges',
    });
  } else {
    notes.push(
      'this face is not level in the cutting frame — a pocket or chamfer needs it flat; ' +
        (rotary
          ? 'an Index op can rotate it up first'
          : 're-orient the model, or machine a different face'),
    );
  }
  return { kind: 'plane', title: 'Flat face', facts, candidates, notes };
}

function describeCircle(
  c: CircleFeature,
  xf: (p: Vec3) => THREE.Vector3,
  rotary: boolean,
  axisZ: number | null,
  crown: number,
): FeatureKnowledge {
  const center = xf(c.center);
  const dia = c.radius * 2;
  const az = dirZ(c.axis, xf);
  const ax = dirX(c.axis, xf);
  const partial = !!c.arcs;
  const title = `Ø${f1(dia)} ${c.inner ? 'hole rim' : 'boss rim'}${partial ? ' (partial)' : ''}`;
  const facts: SuggestFact[] = [
    { label: 'diameter', value: `Ø${f1(dia)} mm` },
    { label: 'position', value: `X ${f1(center.x)} · Y ${f1(center.y)} · Z ${f1(center.z)}` },
  ];
  const candidates: SuggestCandidate[] = [];
  const notes: string[] = [];

  const vertical = Math.abs(az) >= DRILL_Z_TOL;
  const aroundStockAxis = rotary && Math.abs(ax) >= X_TOL;
  if (aroundStockAxis && axisZ !== null) {
    facts.push({ label: 'axis', value: 'around the stock axis (X)' });
    if (Math.hypot(center.y, center.z - axisZ) <= ON_AXIS_TOL_MM) {
      candidates.push({
        kind: 'cylChamfer',
        why: 'chamfer this edge ring full-circle with a single A-axis sweep',
      });
      candidates.push({
        kind: 'faceCylinder',
        why: 'turn the stock down to this Ø over the rim’s X range',
      });
    } else {
      notes.push(
        'this circle runs around X but sits off the stock axis — an A sweep would trace ' +
          'an ellipse, not the circle',
      );
    }
  } else if (vertical) {
    facts.push({
      label: 'rim height',
      value: `${f1(Math.max(crown - center.z, 0))} mm below the stock top`,
    });
    facts.push({ label: 'axis', value: 'vertical (Z)' });
    if (partial) {
      notes.push(
        'a partial rim (broken by flats or flutes) bounds neither a bore nor a 360° path — ' +
          'drilling, threading and chamfering it are refused; use its Ø where a diameter is read',
      );
    } else if (c.inner) {
      candidates.push({ kind: 'drill', why: 'drill this bore straight down from the rim' });
      const pitch = metricPitch(dia);
      candidates.push({
        kind: 'threadMill',
        why: `cut an internal thread${pitch ? ` — M${f1(dia)} × ${f1(pitch)}` : ''}`,
      });
      candidates.push({ kind: 'chamfer', why: 'break this hole’s rim with a V-bit' });
    } else {
      const pitch = metricPitch(dia);
      candidates.push({
        kind: 'threadMill',
        why: `cut an external thread on this boss${pitch ? ` — M${f1(dia)} × ${f1(pitch)}` : ''}`,
      });
      candidates.push({
        kind: 'chamfer',
        why: 'run a V-bit around this boss to break its rim',
      });
    }
  } else {
    facts.push({ label: 'axis', value: `tilted ${f1(tiltDeg(c.axis, xf))}° off vertical` });
    notes.push(
      'this rim is not vertical in the cutting frame — drills and thread helixes cut straight ' +
        'down; ' +
        (rotary
          ? 'an Index op can rotate it up if the feature itself is reachable'
          : 're-orient the model to machine it'),
    );
  }
  return { kind: 'circle', title, facts, candidates, notes };
}

function describeChain(
  r: ResolvedFeature,
  xf: (p: Vec3) => THREE.Vector3,
  axisZ: number | null,
): FeatureKnowledge {
  const ch = r.feature as { points: Vec3[]; meanRadius: number };
  const pts = ch.points.map((p) => xf(p));
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const facts: SuggestFact[] = [
    { label: 'mean Ø', value: `Ø${f1(ch.meanRadius * 2)} mm about the stock axis` },
    { label: 'X span', value: `${f1(Math.min(...xs))} → ${f1(Math.max(...xs))} mm` },
  ];
  if (axisZ !== null) {
    facts.push({
      label: 'height',
      value: `Z ${f1(Math.min(...zs))} → ${f1(Math.max(...zs))} (axis at ${f1(axisZ)})`,
    });
  }
  return {
    kind: 'radialChain',
    title: `Curved seam Ø${f1(ch.meanRadius * 2)}`,
    facts,
    candidates: [
      {
        kind: 'contour4d',
        why: 'trace this seam around the stock in one continuous 4-axis pass',
      },
      {
        kind: 'rasterContour',
        why: 'raster the seam’s band flat — a 3-axis-friendly reading of the same curve',
      },
    ],
    notes: [],
  };
}

function describePath(r: ResolvedFeature): FeatureKnowledge {
  const path = r.feature as { points: Vec3[]; closed?: boolean; filled?: boolean };
  let len = 0;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    len += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  const facts: SuggestFact[] = [
    { label: 'length', value: `${f1(len)} mm` },
    { label: 'topology', value: path.closed ? 'closed' : 'open' },
  ];
  if (path.filled) {
    facts.push({ label: 'import fill', value: 'filled region (area-fill candidate)' });
  }
  return {
    kind: 'path',
    title: 'Artwork path',
    facts,
    candidates: [{ kind: 'engrave', why: 'trace this artwork with the tool tip' }],
    notes: [],
  };
}

function describeEdge(
  r: ResolvedFeature,
  xf: (p: Vec3) => THREE.Vector3,
  rotary: boolean,
): FeatureKnowledge {
  const e = r.feature as { a: Vec3; b: Vec3 };
  const a = xf(e.a);
  const b = xf(e.b);
  const len = a.distanceTo(b);
  const candidates: SuggestCandidate[] = [];
  if (rotary) {
    candidates.push({
      kind: 'index',
      why: 'aim this edge’s direction at the cutter — its angle becomes the Index op’s A',
    });
  }
  return {
    kind: 'edge',
    title: `Edge ${f1(len)}`,
    facts: [
      { label: 'length', value: `${f1(len)} mm` },
      {
        label: 'endpoints',
        value: `(${f1(a.x)}, ${f1(a.y)}, ${f1(a.z)}) → (${f1(b.x)}, ${f1(b.y)}, ${f1(b.z)})`,
      },
    ],
    candidates,
    notes: [
      'a detected edge is a measurement datum, not a cut path — no op drives it directly; ' +
        'select the faces around it instead',
    ],
  };
}