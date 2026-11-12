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
import type { CircleFeature, JobOp, PlaneFeature, Stock, Tool, Vec3 } from '../core/types';
import { rotaryCalibrationOf, round2 } from '../core/types';
import { indexedPointRotation } from '../cam/indexing';
import { internalMinorDiameter } from '../cam/threadMill';
import { planeExtents, transformFn } from './featureOverlays';
import type { FeatureSource, ResolvedFeature } from './featureSources';
import { datumAngleBefore, metricPitch, newJobOp, prefillDepths, prefillThreadMill } from './jobGeneration';
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
  /** the datum angle (kind 'index' only): the A that brings the feature
   *  level/vertical — carried so the created op cuts in the right frame */
  angle?: number;
  /** true for an INTERNAL thread suggestion (kind 'threadMill' only):
   *  the tool must clear the thread's minor Ø */
  internal?: boolean;
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
  // the SIGN gate, not the magnitude (opTargets pocketRegions gates the
  // same way): a face pointing DOWN at this datum offers nothing — the
  // round-1 magnitude bug read a far-side/bottom face as "level (up)".
  const zero = xf({ x: 0, y: 0, z: 0 });
  const n = xf(plane.normal).sub(zero).normalize();
  const level = n.z >= Z_TOL;
  // What rotation about the stock axis CAN fix: the YZ projection of the
  // normal rotates level at the right A; the X component does not move.
  // The residual is the tilt that survives EVERY datum angle — a face
  // tilted along the stock axis can never face the cutter squarely,
  // however you index (frameGateDiagnosis's 'parallel' is the extreme).
  const residual = (Math.atan2(Math.abs(n.x), Math.hypot(n.y, n.z)) * 180) / Math.PI;
  // the datum that rotates the face level (indexToAlignDirection's rule)
  const indexA = ((((Math.atan2(n.y, n.z) * 180) / Math.PI) % 360) + 360) % 360;
  const tilt = (Math.acos(Math.min(Math.abs(n.z), 1)) * 180) / Math.PI;
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
  } else if (residual <= 10) {
    // the tilt lives in the YZ plane — one Index datum removes it. The
    // datum op is SUGGESTED AT THE HEAD (Alice, 2026-11-12): the pocket
    // and chamfer after it cut in the rotated frame, and their prefills
    // are computed through the same rotation (createSuggestedOp).
    if (rotary) {
      candidates.push({
        kind: 'index',
        angle: indexA,
        why: `rotate the face level (A ${f1(indexA)}°) — it is added before the ops that need it`,
      });
      candidates.push({
        kind: 'pocket',
        why: 'clear this level down to its own height, following the outline you selected',
      });
      candidates.push({
        kind: 'chamfer',
        why: 'run a V-bit around this face’s boundary to break its edges',
      });
      notes.push(
        'this face is not level at the current datum — the pocket and chamfer need the stock ' +
          'rotated first: keep the suggested Index op checked and ahead of them (they cut in ' +
          'the rotated frame)',
      );
    } else {
      notes.push(
        'this face is not level in the cutting frame — a pocket or chamfer needs it flat; ' +
          're-orient the model, or machine a different face',
      );
    }
  } else {
    notes.push(
      rotary
        ? `this face is tilted ${f1(residual)}° along the stock axis (X) — rotating the stock ` +
            'cannot remove that tilt, so it can never face the cutter squarely; re-orient the ' +
            'model to machine it'
        : `this face is tilted ${f1(residual)}° — it can never face the cutter squarely; ` +
            're-orient the model, or machine a different face',
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
  const zero = xf({ x: 0, y: 0, z: 0 });
  const n = xf(c.axis).sub(zero).normalize();
  const partial = !!c.arcs;
  const title = `Ø${f1(dia)} ${c.inner ? 'hole rim' : 'boss rim'}${partial ? ' (partial)' : ''}`;
  const facts: SuggestFact[] = [
    { label: 'diameter', value: `Ø${f1(dia)} mm` },
    { label: 'position', value: `X ${f1(center.x)} · Y ${f1(center.y)} · Z ${f1(center.z)}` },
  ];
  const candidates: SuggestCandidate[] = [];
  const notes: string[] = [];

  /** the bore/boss candidates a VERTICAL rim offers — shared by the level
   *  pick and the rotated pick (which prepends its Index) */
  const pushBoreCands = (suffix: string) => {
    if (partial) {
      notes.push(
        'a partial rim (broken by flats or flutes) bounds neither a bore nor a 360° path — ' +
          'drilling, threading and chamfering it are refused; use its Ø where a diameter is read',
      );
      return;
    }
    const pitch = metricPitch(dia);
    if (c.inner) {
      candidates.push({ kind: 'drill', why: `drill this bore straight down from the rim${suffix}` });
      candidates.push({
        kind: 'threadMill',
        internal: true,
        why: `cut an internal thread${pitch ? ` — M${f1(dia)} × ${f1(pitch)}` : ''}`,
      });
      candidates.push({ kind: 'chamfer', why: 'break this hole’s rim with a V-bit' });
    } else {
      candidates.push({
        kind: 'threadMill',
        internal: false,
        why: `cut an external thread on this boss${pitch ? ` — M${f1(dia)} × ${f1(pitch)}` : ''}`,
      });
      candidates.push({ kind: 'chamfer', why: 'run a V-bit around this boss to break its rim' });
    }
  };

  const vertical = Math.abs(n.z) >= DRILL_Z_TOL;
  const aroundStockAxis = rotary && Math.abs(n.x) >= X_TOL;
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
    pushBoreCands('');
  } else {
    // not vertical — but what SURVIVES rotation? The axis's X component
    // is untouched by the A sweep; ≤10° and ONE datum aligns the bore or
    // boss with Z (a rim on the far side flips up at A+180).
    const residual = (Math.atan2(Math.abs(n.x), Math.hypot(n.y, n.z)) * 180) / Math.PI;
    const indexA = ((((Math.atan2(n.y, n.z) * 180) / Math.PI) % 360) + 360) % 360;
    const tilt = (Math.acos(Math.min(Math.abs(n.z), 1)) * 180) / Math.PI;
    facts.push({ label: 'axis', value: `tilted ${f1(tilt)}° off vertical` });
    if (rotary && residual <= 10) {
      // the rotatable rim: the datum op is SUGGESTED AT THE HEAD so the
      // bore ops after it cut in the rotated frame (Alice, 2026-11-12)
      candidates.push({
        kind: 'index',
        angle: indexA,
        why: `rotate the rim vertical (A ${f1(indexA)}°) — it is added before the ops that need it`,
      });
      pushBoreCands(' — in the rotated frame');
      notes.push(
        'this rim is not vertical at the current datum — the drill and thread ops need the ' +
          'stock rotated first: keep the suggested Index op checked and ahead of them (they ' +
          'cut in the rotated frame)',
      );
    } else {
      notes.push(
        'this rim is tilted along the stock axis (X) — rotating the stock cannot align it ' +
          'with the drill, so it can never be bored or threaded on this machine; re-orient ' +
          'the model to machine it',
      );
    }
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
// ------------------------------------------------- op creation (round 2)

/** the feature's reference point in the DATUM frame the new op cuts in
 *  (planes: the facing point; circles: the rim center), rotated by the
 *  index ops preceding it. Null for kinds without a point (chains,
 *  artwork, edges — they carry no depth prefill). */
function suggestDatumPoint(
  r: ResolvedFeature,
  datum: number,
  stock: Stock,
): THREE.Vector3 | null {
  if (r.kind !== 'plane' && r.kind !== 'circle') return null;
  const xf = transformFn(r.source.transform);
  const p =
    r.kind === 'circle'
      ? xf((r.feature as CircleFeature).center)
      : xf((r.feature as PlaneFeature).point);
  if (stock.axisMode === '4-axis' && datum !== 0) {
    return indexedPointRotation(datum, rotaryCalibrationOf(stock).axisZ)(p);
  }
  return p;
}

/**
 * Build the op one checked suggestion becomes (docs/PLAN.md item 14,
 * round 2): newJobOp defaults + the picked feature selected + the same
 * prefills a first feature click applies (prefillDepths /
 * prefillThreadMill) — computed in the DATUM frame the op will run in,
 * i.e. with the suggested Index op already ahead of it (`ops` carries
 * everything created before this one, index included). Nothing here
 * gates: the candidate was offered because its op accepts this feature.
 */
export function createSuggestedOp(
  cand: SuggestCandidate,
  r: ResolvedFeature,
  sources: FeatureSource[],
  stock: Stock,
  tool: Tool,
  materialId: string,
  /** the ops list BEFORE this op — index ops already appended precede it */
  ops: JobOp[],
): JobOp {
  const op = newJobOp(cand.kind, tool, materialId, stock);
  if (cand.kind === 'index') {
    return { ...op, angle: cand.angle ?? 90 } as JobOp;
  }
  const featureId = r.feature.id;
  const withFeature = { ...op, featureIds: [featureId] } as JobOp;
  const crown = stockTopZ(stock);
  const datum = datumAngleBefore([...ops, withFeature], withFeature.id);
  if (cand.kind === 'threadMill') {
    return prefillThreadMill(
      withFeature as Extract<JobOp, { kind: 'threadMill' }>,
      sources,
      featureId,
      crown,
      datum,
      stock,
    );
  }
  if (cand.kind === 'faceCylinder' && r.kind === 'circle') {
    return {
      ...withFeature,
      targetDiameter: round2((r.feature as CircleFeature).radius * 2),
    } as JobOp;
  }
  const p = suggestDatumPoint(r, datum, stock);
  if (p) return prefillDepths(withFeature, p.z, crown);
  return withFeature;
}

// ------------------------------------------------- tool suggestion (round 2)

/** What kind of cutter each suggested op wants, in preference order —
 *  a bore wants an actual drill bit first; chamfer/engrave want the tip
 *  of a V-bit. (Alice, 2026-11-12: "they are only suggestions so dont
 *  have to be perfect" — the rules below are honest fits, not optimums.) */
const TOOL_TYPES: Partial<Record<JobOp['kind'], Tool['type'][]>> = {
  drill: ['drill', 'flat'],
  threadMill: ['threadmill', 'flat'],
  pocket: ['flat'],
  chamfer: ['vbit'],
  engrave: ['vbit', 'laser'],
  faceCylinder: ['flat'],
  cylChamfer: ['flat', 'ball'],
  contour4d: ['ball', 'flat'],
  rasterContour: ['ball', 'flat'],
};

/** true when the kind prefers the LARGEST fitting cutter (holes and
 *  pockets clear faster with rigidity); false = smallest (edge/tip work
 *  — chamfers, engraving, the fine finishing passes). */
const WANTS_LARGEST = new Set<JobOp['kind']>([
  'drill',
  'threadMill',
  'pocket',
  'faceCylinder',
]);

/** the cutting-Ø ceiling a candidate's tool must respect for THIS
 *  feature: a drill must fit the bore; an internal thread mill must fit
 *  the minor Ø with tilt clearance; a pocket must manoeuvre inside its
 *  region (half the smallest extent). Infinity = no Ø constraint. */
function toolBound(cand: SuggestCandidate, r: ResolvedFeature): number {
  const circleDia = r.kind === 'circle' ? (r.feature as CircleFeature).radius * 2 : null;
  if (cand.kind === 'drill') return circleDia ?? Infinity;
  if (cand.kind === 'threadMill') {
    if (circleDia === null || !cand.internal) return circleDia ?? Infinity;
    const pitch = metricPitch(circleDia) ?? 1;
    return internalMinorDiameter(circleDia, pitch) * 0.9;
  }
  if (cand.kind === 'pocket') {
    if (circleDia !== null) return circleDia / 2;
    if (r.kind === 'plane') {
      const ext = planeExtents(r.source.geometry, r.source.features, r.source.transform)[r.index];
      return ext ? Math.min(ext.w, ext.h) / 2 : Infinity;
    }
    return Infinity;
  }
  return Infinity;
}

/** the best tool of one pool (in-use, then library) for a candidate, or
 *  null when the pool holds nothing of the wanted type that fits. */
function pickFromPool(
  cand: SuggestCandidate,
  r: ResolvedFeature,
  pool: Tool[],
): Tool | null {
  const types = TOOL_TYPES[cand.kind];
  if (!types) return null; // index (no cutter), kinds never suggested
  const bound = toolBound(cand, r);
  const largest = WANTS_LARGEST.has(cand.kind);
  for (const type of types) {
    // type preference order: a drill bit beats a flat for a bore even
    // when the flat is bigger
    const fits = pool.filter((t) => t.type === type && t.diameter <= bound + 1e-9);
    if (fits.length === 0) continue;
    fits.sort((a, b) => (largest ? b.diameter - a.diameter : a.diameter - b.diameter));
    return fits[0];
  }
  return null;
}

export interface ToolSuggestion {
  tool: Tool;
  /** true when the tool is already assigned to an op in the job (the
   *  "in use" preference — its T number stays what it is) */
  inUse: boolean;
}

/**
 * The tool a suggested op would run with (Alice, 2026-11-12): prefer the
 * MOST APPROPRIATE of the tools already in use by the job's ops; when
 * none of those fits, the same fit rule over the whole library. Null =
 * no better idea (index ops carry no cutter; an exotic kind with no
 * fitting tool falls back to the current default).
 */
export function suggestToolFor(
  cand: SuggestCandidate,
  r: ResolvedFeature,
  /** tools already assigned to ops, in T-number order */
  inUse: Tool[],
  library: Tool[],
): ToolSuggestion | null {
  if (cand.kind === 'index') return null;
  const inUsePick = pickFromPool(cand, r, inUse);
  if (inUsePick) return { tool: inUsePick, inUse: true };
  const libPick = pickFromPool(cand, r, library);
  if (libPick) return { tool: libPick, inUse: false };
  return null;
}
