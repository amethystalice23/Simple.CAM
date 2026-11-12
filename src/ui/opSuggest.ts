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
import type { CircleFeature, JobOp, PlaneFeature, Stock, ThreadFeature, Tool, Vec3 } from '../core/types';
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

/** Order the machining-sequence invariants (Alice, 2026-11-12): a Rotary
 *  face op ALWAYS precedes what finishes it — a chamfer rides the
 *  FINISHED Ø, not the raw stock ("when rotary face is in the suggested
 *  ops list, it really should pretty much always go first"). Stable sort,
 *  so every other suggestion keeps its built order. */
function orderCandidates(k: FeatureKnowledge): FeatureKnowledge {
  if (k.candidates.some((c) => c.kind === 'faceCylinder')) {
    k.candidates.sort((a, b) =>
      a.kind === 'faceCylinder' ? -1 : b.kind === 'faceCylinder' ? 1 : 0,
    );
  }
  return k;
}

export interface SuggestFact {
  label: string;
  value: string;
}

/** A note the sheet shows under the suggestions: `text` is always shown,
 *  one plain sentence a novice can act on. `detail` (optional) is the
 *  geometry behind it — kept out of the default view because it reads
 *  like engineering commentary, not guidance; the sheet shows it
 *  behind a small "why?" toggle (Alice, 2026-11-12: the reasoning is
 *  useful, the wall of text was not). */
export interface SuggestNote {
  text: string;
  detail?: string;
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
  /** the MEASURED included cone angle under a rim (chamfer candidates):
   *  the tool pick matches a V-bit's vAngle to it — a 90° chamfer bit
   *  for a modelled 45° chamfer, not the 60° engraver (Alice,
   *  2026-11-12: "your tool choice for the chamfers is clearly not
   *  based on a measurement of the chamfer angle"). Absent = the rim
   *  has no measurable cone; the default pick stands. */
  vAngle?: number;
}

export interface FeatureKnowledge {
  kind: ResolvedFeature['kind'];
  title: string;
  facts: SuggestFact[];
  /** ops this feature could drive, most-relevant first */
  candidates: SuggestCandidate[];
  /** cautions / refusals worth saying out loud */
  notes: SuggestNote[];
}

const f1 = (n: number) => n.toFixed(1);
const dot3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
/** true when the circle's center lies on the thread's axis line —
 *  the rim belongs to the threaded feature */
function coaxialThread(t: ThreadFeature, c: CircleFeature): boolean {
  const ap = t.axisPoint;
  const dir = t.axisDir;
  const w = { x: c.center.x - ap.x, y: c.center.y - ap.y, z: c.center.z - ap.z };
  const along = dot3(w, dir);
  const off = {
    x: w.x - dir.x * along,
    y: w.y - dir.y * along,
    z: w.z - dir.z * along,
  };
  return Math.hypot(off.x, off.y, off.z) <= 0.3;
}

/** true when two circles share one axis line (parallel axes, each center
 *  on the other's axis within COMPANION_TOL) — same-Ø companions are one
 *  bore's two mouths; different-Ø companions mark a stepped feature
 *  (indent floor under a chamfer/counterbore mouth). Local space — both
 *  circles come from one source, so one transform puts them in common
 *  frame. */
const COMPANION_TOL_MM = 0.2;
function coaxialCompanion(a: CircleFeature, b: CircleFeature): boolean {
  const d = { x: b.center.x - a.center.x, y: b.center.y - a.center.y, z: b.center.z - a.center.z };
  const al = Math.hypot(a.axis.x, a.axis.y, a.axis.z) || 1;
  const ax = { x: a.axis.x / al, y: a.axis.y / al, z: a.axis.z / al };
  const bl = Math.hypot(b.axis.x, b.axis.y, b.axis.z) || 1;
  const bx = { x: b.axis.x / bl, y: b.axis.y / bl, z: b.axis.z / bl };
  // axes parallel (either sign — a bore's two mouths face opposite ways)
  if (Math.hypot(ax.x - bx.x, ax.y - bx.y, ax.z - bx.z) > 1e-3 &&
      Math.hypot(ax.x + bx.x, ax.y + bx.y, ax.z + bx.z) > 1e-3) return false;
  // each center on the other's axis
  const along = d.x * ax.x + d.y * ax.y + d.z * ax.z;
  const off = {
    x: d.x - ax.x * along,
    y: d.y - ax.y * along,
    z: d.z - ax.z * along,
  };
  return Math.hypot(off.x, off.y, off.z) <= COMPANION_TOL_MM;
}

/** Read the CONE angle of the wall band between two coaxial rims, from
 *  the band triangles' own normals. A chamfer is often a single
 *  tessellation band — vertices sit only AT the two rims (measured on
 *  the plate: zero intermediate vertices), so positions cannot
 *  testify, normals can: a cone's normal tilts off the axis by
 *  (90° − wall angle) — |n·axis| = cos(tilt) = sin(included/2); a flat
 *  shoulder's normal is axial, a plain wall's radial, and both are
 *  rejected. Returns the median included angle over the band's tilted
 *  triangles (≥3), or null when the band is not a cone. Local space —
 *  geometry is the circles' own source mesh. */
function coneAngleFromMesh(
  geometry: THREE.BufferGeometry,
  outer: CircleFeature,
  inner: CircleFeature,
): number | null {
  const pos = geometry.getAttribute('position');
  if (!pos) return null;
  const zA = outer.center.z;
  const zB = inner.center.z;
  const zLo = Math.min(zA, zB) - 0.02;
  const zHi = Math.max(zA, zB) + 0.02;
  const rLo = Math.min(outer.radius, inner.radius) - 0.1;
  const rHi = Math.max(outer.radius, inner.radius) + 0.1;
  const al = Math.hypot(outer.axis.x, outer.axis.y, outer.axis.z) || 1;
  const ax = { x: outer.axis.x / al, y: outer.axis.y / al, z: outer.axis.z / al };
  const cx = outer.center.x;
  const cy = outer.center.y;
  const idx = geometry.index;
  const nTri = idx ? idx.count / 3 : pos.count / 3;
  const angles: number[] = [];
  for (let t = 0; t < nTri; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const vs = [i0, i1, i2].map((i) => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) }));
    // the whole triangle inside the rim-pair band
    let inBand = true;
    for (const v of vs) {
      if (v.z < zLo || v.z > zHi) {
        inBand = false;
        break;
      }
      if (Math.hypot(v.x - cx, v.y - cy) < rLo || Math.hypot(v.x - cx, v.y - cy) > rHi) {
        inBand = false;
        break;
      }
    }
    if (!inBand) continue;
    // face normal
    const e1 = { x: vs[1].x - vs[0].x, y: vs[1].y - vs[0].y, z: vs[1].z - vs[0].z };
    const e2 = { x: vs[2].x - vs[0].x, y: vs[2].y - vs[0].y, z: vs[2].z - vs[0].z };
    const n = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const nl = Math.hypot(n.x, n.y, n.z);
    if (nl < 1e-12) continue;
    const na = Math.abs((n.x * ax.x + n.y * ax.y + n.z * ax.z) / nl);
    if (na < 0.05 || na > 0.95) continue; // shoulder (axial) or wall (radial) — not a cone
    angles.push((2 * Math.asin(Math.min(1, na)) * 180) / Math.PI);
  }
  if (angles.length < 3) return null;
  angles.sort((a, b) => a - b);
  return angles[angles.length >> 1];
}

/**
 * The role `a` plays in a coaxial different-Ø pair when the pair bounds
 * an INDENT (a stepped opening with material at its bottom): 'floor'
 * when `a` is the smaller rim whose disc is that material, 'mouth' when
 * `a` is the larger rim at the opening — null when the opening
 * CONTINUES past the smaller rim (a chamfered or counterbored BORE:
 * drill/thread candidates, not a pocket). One raycast decides: from
 * 2 mm outside the LARGER rim, along the shared axis toward the
 * smaller — material sitting at the smaller rim's plane means the
 * opening closes there (an indent floor); a hit much deeper, or no
 * hit at all, means the hole continues (Alice, 2026-11-12: her Ø3.5
 * indent floor under a Ø5 chamfer mouth must read pocket, a Ø10 bore
 * rim under a Ø11.5 chamfer mouth must keep drill + thread).
 * Local space — `geometry` is the circles' own source mesh.
 */
function indentRole(
  geometry: THREE.BufferGeometry,
  a: CircleFeature,
  b: CircleFeature,
): 'floor' | 'mouth' | null {
  const outer = a.radius > b.radius ? a : b;
  const inner = a.radius > b.radius ? b : a;
  const oc = new THREE.Vector3(outer.center.x, outer.center.y, outer.center.z);
  const ic = new THREE.Vector3(inner.center.x, inner.center.y, inner.center.z);
  const dir = ic.clone().sub(oc);
  const gap = dir.length();
  if (gap < 1e-6) return null; // concentric — no direction to cast
  dir.normalize();
  const origin = oc.clone().addScaledVector(dir, -2); // 2 mm outside the mouth
  const raycaster = new THREE.Raycaster(origin, dir);
  // DoubleSide: STLs and test meshes carry either winding, and a
  // classification ray must hit regardless of which way the wall faces
  const hits = raycaster.intersectObject(
    new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    false,
  );
  if (hits.length === 0) return null; // the ray left the part — a through opening
  if (Math.abs(hits[0].distance - (gap + 2)) > 0.3) return null; // it flew past the inner rim's plane
  return a === inner ? 'floor' : 'mouth';
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
    return orderCandidates(
      describeCircle(
        r.feature as CircleFeature,
        r.source.features.circles,
        r.source.features.threads,
        r.source.geometry,
        xf,
        rotary,
        axisZ,
        crown,
      ),
    );
  }
  if (r.kind === 'radialChain') return describeChain(r, xf, axisZ);
  if (r.kind === 'thread')
    return orderCandidates(describeThread(r.feature as ThreadFeature, rotary, axisZ));
  if (r.kind === 'path') return describePath(r);
  return orderCandidates(describeEdge(r, xf, rotary));
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
  const notes: SuggestNote[] = [];
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
      notes.push({
        text: 'an Index op is suggested to turn this face level first — keep it checked.',
        detail:
          'the pocket and chamfer cut in the rotated frame: with the Index op ahead of them ' +
          '(it is added first), the face comes level and they cut it squarely.',
      });
    } else {
      notes.push({
        text: 'this face is not level in the cutting frame. Re-orient the model, or machine a different face.',
      });
    }
  } else {
    notes.push({
      text: rotary
        ? `this face is tilted ${f1(residual)}° along the stock axis (X). Re-orient the model to machine it.`
        : `this face is tilted ${f1(residual)}°. Re-orient the model, or machine a different face.`,
      detail: rotary
        ? 'the tilt runs along the rotation axis, so no Index angle squares the face to the cutter.'
        : undefined,
    });
  }
  return { kind: 'plane', title: 'Flat face', facts, candidates, notes };
}

function describeCircle(
  c: CircleFeature,
  allCircles: CircleFeature[],
  allThreads: ThreadFeature[],
  geometry: THREE.BufferGeometry,
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
  // coaxial companion of DIFFERENT Ø marks a stepped opening. Its role
  // comes from the mesh (indentRole): material at the smaller rim's
  // plane = indent floor (pocket candidate); the opening continuing
  // below it = a chamfered/counterbored BORE (drill + thread stay).
  const companion = allCircles.find(
    (o) =>
      o.id !== c.id &&
      !o.arcs &&
      Math.abs(o.radius * 2 - dia) > 0.05 &&
      coaxialCompanion(c, o),
  );
  const role = companion && c.inner ? indentRole(geometry, c, companion) : null;
  const stepped: 'floor' | 'mouth' | null =
    role === 'floor' || role === 'mouth' ? role : null;
  const comp = companion as CircleFeature | null;
  /** the NEAREST coaxial companion of different Ø — the rim that
   *  bounds the cone at this rim (a chamfered mouth/boss tip), used to
   *  MEASURE the cone's included angle. `companion` above stays
   *  first-found: the stepped-role machinery is built around it. */
  const coneComp =
    allCircles
      .filter(
        (o) =>
          o.id !== c.id && !o.arcs && Math.abs(o.radius * 2 - dia) > 0.05 && coaxialCompanion(c, o),
      )
      .sort(
        (a, b) =>
          xf(c.center).distanceTo(xf(a.center)) - xf(c.center).distanceTo(xf(b.center)),
      )[0] ?? null;
  /** the cone's included angle at this rim, MEASURED from the wall
   *  band's own triangle normals (coneAngleFromMesh) with the nearest
   *  coaxial companion bounding the band. null = no cone at this rim
   *  (a flat shoulder or plain wall keeps the default tool pick). */
  const coneAtRim = (): number | null => {
    if (!coneComp) return null;
    const gap = Math.hypot(
      coneComp.center.x - c.center.x,
      coneComp.center.y - c.center.y,
      coneComp.center.z - c.center.z,
    );
    if (gap <= 1e-6 || gap > 5) return null;
    const outerC = c.radius > coneComp.radius ? c : coneComp;
    const innerC = c.radius > coneComp.radius ? coneComp : c;
    const a = coneAngleFromMesh(geometry, outerC, innerC);
    return a !== null && a >= 25 && a <= 155 ? a : null;
  };
  const title = `Ø${f1(dia)} ${
    c.inner ? (stepped === 'floor' ? 'indent floor rim' : stepped === 'mouth' ? 'indent mouth rim' : 'hole rim') : 'boss rim'
  }${partial ? ' (partial)' : ''}`;
  const facts: SuggestFact[] = [
    { label: 'diameter', value: `Ø${f1(dia)} mm` },
    { label: 'position', value: `X ${f1(center.x)} · Y ${f1(center.y)} · Z ${f1(center.z)}` },
  ];
  if (stepped && comp) {
    facts.push({
      label: 'coaxial with',
      value: `Ø${f1(comp.radius * 2)} — a stepped opening (this rim is its ${
        stepped === 'floor' ? 'floor' : 'opening edge'
      })`,
    });
  }
  const candidates: SuggestCandidate[] = [];
  const notes: SuggestNote[] = [];

  /** the bore/boss candidates a VERTICAL rim offers — shared by the level
   *  pick and the rotated pick (which prepends its Index). An inner rim
   *  the mesh says closes at its own plane (stepped === 'floor', the
   *  indentRole raycast) is an indent floor, not a bore mouth: pocket +
   *  chamfer, never drill/thread (Alice, 2026-11-12 — her Ø3.5 rim under
   *  a Ø5 chamfer mouth). A chamfered/counterbored BORE (the raycast
   *  flies past the rim) keeps the drill + thread offers. A BOSS rim
   *  offers a profile, not an automatic thread. */
  const pushBoreCands = (suffix: string) => {
    if (partial) {
      // a rim broken by a helical ridge is the signature of a threaded
      // hole — point the user at the detected thread feature
      const threadHere = allThreads.find(
        (t) =>
          Math.abs(dot3(t.axisDir, c.axis)) /
            (Math.hypot(t.axisDir.x, t.axisDir.y, t.axisDir.z) *
              Math.hypot(c.axis.x, c.axis.y, c.axis.z)) >
            0.999 && coaxialThread(t, c),
      );
      if (threadHere) {
        notes.push({
          text: 'this rim is broken by the thread cut into this hole — select the amber thread helix for the thread operations.',
        });
        return;
      }
      notes.push({
        text: 'this rim is broken by other features, so its diameter is the reliable measurement here.',
        detail:
          'the circle survives only as arcs (cut by flats or flutes): the size is accurate, ' +
          'but a partial rim bounds no hole to drill and no full 360° path to thread or chamfer.',
      });
      return;
    }
    if (stepped === 'floor' && comp) {
      // the cone ABOVE this floor rim (the recess wall to the mouth):
      // its included angle picks the chamfer tool
      const dhF = xf(c.center).distanceTo(xf(comp.center));
      const coneF = dhF > 1e-6 ? (2 * Math.atan((comp.radius * 2 - dia) / 2 / dhF) * 180) / Math.PI : null;
      candidates.push({
        kind: 'pocket',
        why: `clear this indent floor (Ø${f1(dia)} under the Ø${f1(comp.radius * 2)} mouth above it)${suffix}`,
      });
      candidates.push({
        kind: 'chamfer',
        vAngle: coneF ?? undefined,
        why: 'break this indent’s rim with a V-bit',
      });
      notes.push({
        text: 'this rim is the bottom of a stepped recess.',
        detail:
          `the Ø${f1(comp.radius * 2)} opening above narrows to this rim and closes here — the ` +
          'solid bottom makes it a recess to pocket, not a hole to drill.',
      });
      return;
    }
    if (stepped === 'mouth' && comp) {
      // the opening edge of an indent that CLOSES below: the wall under
      // this rim is the chamfer/counterbore cone, not a constant-Ø bore
      // wall — a thread has nothing to ride, and a drill at the mouth's
      // Ø would plough the cone. Pocket the opening, chamfer its edge
      // (Alice, 2026-11-12: the drill + internal-thread offer here was
      // "an even wilder suggestion").
      candidates.push({
        kind: 'pocket',
        why: `clear this stepped opening (Ø${f1(dia)} mouth, Ø${f1(comp.radius * 2)} floor below)${suffix}`,
      });
      // cone geometry: the included angle 2·atan(Δr / Δh) between the
      // two rims — measured, it picks the chamfer tool (90° chamfer bit
      // for a modelled 45° wall, not the 60° engraver)
      const dr = dia - comp.radius * 2;
      const dh = xf(c.center).distanceTo(xf(comp.center));
      const coneDeg = dh > 1e-6 ? (2 * Math.atan(Math.abs(dr) / 2 / dh) * 180) / Math.PI : null;
      candidates.push({
        kind: 'chamfer',
        vAngle: coneDeg ?? undefined,
        why: 'cut the angled wall under this rim with a V-bit',
      });
      notes.push({
        text: 'this rim opens a stepped recess.',
        detail: coneDeg
          ? `the wall narrows from Ø${f1(dia)} here to Ø${f1(comp.radius * 2)} at the bottom ` +
            `(${f1(coneDeg)}° included): the narrowing diameter suits a pocket, and the ` +
            `angled wall suits a chamfer op — the ${Math.round(coneDeg)}° chamfer bit cuts this ${Math.round(coneDeg / 2)}° wall.`
          : `the opening narrows from Ø${f1(dia)} here to Ø${f1(comp.radius * 2)} at the bottom — ` +
            'the narrowing diameter suits a pocket, the angled wall a chamfer op.',
      });
      return;
    }
    if (c.inner) {
      // thread ops are evidence-gated (Alice, 2026-11-12: offering a
      // thread on an unthreaded hole is "not appropriate when there
      // isn't a thread there"): a plain bore rim offers drill + chamfer
      // only; a modelled thread is picked as its own feature
      candidates.push({ kind: 'drill', why: `drill this bore straight down from the rim${suffix}` });
      // a nearby coaxial smaller rim bounds the chamfer cone under this
      // mouth (the Ø8 bevelled bore: Ø7 at 0.49 below) — its measured
      // included angle picks the chamfer tool (Alice, 2026-11-12)
      candidates.push({
        kind: 'chamfer',
        vAngle: coneAtRim() ?? undefined,
        why: 'break this hole’s rim with a V-bit',
      });
    } else {
      // an outer rim is a boss/round-stock edge: profile it (Alice,
      // 2026-11-12: don't auto-offer threading — that was an unusual
      // suggestion for what is really a contour to turn down)
      candidates.push({
        kind: 'profile',
        why: `cut around this boss (Ø${f1(dia)}) to size it${suffix}`,
      });
      // the cone at a boss rim (a chamfered tip: a Ø2.24 rim over the
      // Ø3.24 shoulder 0.5 below) — measured from the NEAREST coaxial
      // companion, never a distant one, so its angle picks the tool
      const bossCone = coneAtRim();
      candidates.push({
        kind: 'chamfer',
        vAngle: bossCone ?? undefined,
        why: bossCone
          ? `break this boss’s rim — the wall runs at ${Math.round(bossCone / 2)}°, a ${Math.round(bossCone)}° chamfer bit fits it`
          : 'run a V-bit around this boss to break its rim',
      });
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
      notes.push({
        text: 'this circle sits off the stock axis — the rotary ring operations do not fit it.',
        detail:
          'spinning the stock would trace an ellipse rather than this circle, so an A-axis sweep cannot follow it.',
      });
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
      notes.push({
        text: 'an Index op is suggested to turn this rim vertical first — keep it checked.',
        detail:
          'the drill and thread ops cut in the rotated frame: with the Index op ahead of them ' +
          '(it is added first), the rim comes vertical and they cut it squarely.',
      });
    } else {
      notes.push({
        text: 'this rim is tilted along the stock axis (X). Re-orient the model to machine it.',
        detail:
          'the tilt survives every Index angle, so the rim cannot be bored or threaded as the model sits.',
      });
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

/**
 * A detected thread (features.ts Pass 5): the mesh already carries the
 * finished form, so the knowledge sheet reports what was measured and
 * offers the op that reproduces the thread — a thread mill cut to the
 * measured Ø/pitch/hand. The pitch/Ø/hand ARE the sheet's promise:
 * they are what the threadMill op would be prefilled with.
 */
function describeThread(
  t: ThreadFeature,
  rotary: boolean,
  axisZ: number | null,
): FeatureKnowledge {
  const turns = Math.max(1, Math.round((t.xEnd - t.xStart) / t.pitch));
  const facts: SuggestFact[] = [
    { label: 'nominal Ø', value: `Ø${f1(t.nominalDiameter)} mm` },
    { label: 'root Ø', value: `Ø${f1(t.rootDiameter)} mm` },
    { label: 'pitch', value: `${f1(t.pitch)} mm` },
    { label: 'hand', value: t.rotation === 'ccw' ? 'left-hand (ccw)' : 'right-hand (cw)' },
    { label: 'length', value: `${f1(t.xEnd - t.xStart)} mm (${turns} turns)` },
    { label: 'form depth', value: `${f1((t.nominalDiameter - t.rootDiameter) / 2)} mm` },
  ];
  // the thread rides the STOCK axis when its own axis is the machine X
  // line through the stock's axis (radial offset of the thread axis ≈ 0)
  const onStockAxis =
    rotary &&
    Math.abs(t.axisDir.x) >= 0.99 &&
    Math.hypot(t.axisPoint.y, t.axisPoint.z - (axisZ ?? t.axisPoint.z)) <= 0.3;
  if (onStockAxis) {
    facts.push({ label: 'axis', value: 'on the stock axis (A/X)' });
  }
  return {
    kind: 'thread',
    title: `M${f1(t.nominalDiameter)}×${f1(t.pitch)} ${t.rotation === 'ccw' ? 'ccw' : 'cw'} thread`,
    facts,
    candidates: onStockAxis
      ? [
          {
            // the thread panel's own recipe inserts a facing pass first
            // ("Add facing toolpath"): the crest rides the FINISHED Ø.
            // The sheet offers the same prefilled face op ahead of the
            // thread (Alice, 2026-11-12).
            kind: 'faceCylinder',
            why: `face the crest Ø${f1(t.nominalDiameter)} over the thread's span first — the thread rides the finished surface`,
          },
          {
            // the ROTARY thread op (kind 'thread'): a 4-axis helical
            // groove cut with the A axis turning under G93 — the right
            // op for a thread centered on the rotation axis. The 3-axis
            // thread mill is for threads the A axis cannot spin about
            // (Alice, 2026-11-12: "you should be offering a rotary
            // thread op not a thread mill").
            kind: 'thread',
            why: `cut this thread with the A axis — Ø${f1(t.nominalDiameter)} × ${f1(t.pitch)} ${t.rotation === 'ccw' ? 'ccw' : 'cw'} over its ${f1(t.xEnd - t.xStart)} mm span`,
          },
        ]
      : t.internal
        ? [
            // an internal thread needs its minor-Ø bore pre-cut: the
            // tap-size hole the mill rides (Alice, 2026-11-12: "it also
            // needs a drill/pocket op in advance to make the minor
            // thread diameter")
            {
              kind: 'drill',
              why: `drill the tap-size bore first — Ø${f1(t.rootDiameter)} minor for the ${f1(t.nominalDiameter)}×${f1(t.pitch)} thread`,
            },
            {
              kind: 'threadMill',
              internal: true,
              why: `cut the internal thread with a single-profile mill — Ø${f1(t.nominalDiameter)} × ${f1(t.pitch)} ${t.rotation === 'ccw' ? 'ccw' : 'cw'}`,
            },
          ]
        : [
            // the profile PREP: the mill cuts the FORM, but the crest
            // needs a finished cylinder at the major Ø to ride — the
            // same turn-down the thread panel's prep insert builds
            // (Alice, 2026-11-12: the external sheet "doesn't give the
            // profiling op to set the outside diameter"). Only for a
            // VERTICAL thread axis: the contour resolves to machine-XY
            // (pocketRegionsFromSelection's threads pass); a thread on
            // the rotation axis takes faceCylinder, one along it has
            // no 2.5D reading
            ...(Math.abs(t.axisDir.z) >= 0.98
              ? [
                  {
                    kind: 'profile',
                    why: `turn this boss down to the crest Ø${f1(t.nominalDiameter)} over the thread's span first — the thread rides the finished cylinder`,
                  } as SuggestCandidate,
                ]
              : []),
            {
              kind: 'threadMill',
              internal: false,
              why: `cut this thread with a single-profile mill — Ø${f1(t.nominalDiameter)} × ${f1(t.pitch)} ${t.rotation === 'ccw' ? 'ccw' : 'cw'}`,
            },
          ],
    notes: [
      {
        text: 'the model already carries the finished thread form — these parameters are measured from it.',
        detail:
          'the crest and root diameters, pitch and hand are read from the mesh: the root-band vertices collapse onto a helix at the measured pitch, which only a real thread does.',
      },
    ],
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
      {
        text: 'an edge is for measuring, not cutting — no operation follows it directly. Select the faces around it instead.',
        detail:
          'a detected edge is a measurement datum (lengths, angles, aiming an Index); the ops ' +
          'cut the faces and circles that meet along it.',
      },
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
  // a picked THREAD prefills the thread ops with the measured
  // parameters directly — the prefill helpers resolve rims, not threads
  if ((cand.kind === 'threadMill' || cand.kind === 'thread') && r.kind === 'thread') {
    const t = r.feature as ThreadFeature;
    if (cand.kind === 'thread') {
      // the ROTARY thread op (A-axis helical groove): Ø/pitch/hand and
      // the thread's own axial span, all measured from the mesh
      return {
        ...(withFeature as Extract<JobOp, { kind: 'thread' }>),
        nominalDiameter: t.nominalDiameter,
        pitch: t.pitch,
        rotation: t.rotation,
        xStart: t.xStart,
        xEnd: t.xEnd,
      } as JobOp;
    }
    return {
      ...(withFeature as Extract<JobOp, { kind: 'threadMill' }>),
      nominalDiameter: t.nominalDiameter,
      pitch: t.pitch,
      rotation: t.rotation,
      internal: t.internal,
    } as JobOp;
  }
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
  if (cand.kind === 'faceCylinder' && r.kind === 'thread') {
    // the same face op the thread panel's "Add facing toolpath" button
    // inserts (App insertFacingOp): crest Ø, the thread's x span and
    // rotation, its own tool/feeds
    const t = r.feature as ThreadFeature;
    return {
      ...withFeature,
      targetDiameter: round2(t.nominalDiameter),
      xStart: t.xStart,
      xEnd: t.xEnd,
      rotation: t.rotation,
    } as JobOp;
  }
  if (cand.kind === 'faceCylinder' && r.kind === 'circle') {
    return {
      ...withFeature,
      targetDiameter: round2((r.feature as CircleFeature).radius * 2),
    } as JobOp;
  }
  if (cand.kind === 'profile' && r.kind === 'thread') {
    // the external-thread prep: a wall pass at the measured crest Ø over
    // the thread's own axial span — the contour comes from the thread
    // feature itself (pocketRegionsFromSelection's resolveThreads pass,
    // reached through featureIds). Depths are below-crown and may go
    // NEGATIVE when the boss stands proud of the declared stock top
    // (cutRange reads them as plain machine Z; the thread-panel prep
    // insert starts at 0 only because a rotary boss never does)
    const t = r.feature as ThreadFeature;
    const xf = transformFn(r.source.transform);
    const zEnd = xf({
      x: t.axisPoint.x + t.axisDir.x * t.xEnd,
      y: t.axisPoint.y + t.axisDir.y * t.xEnd,
      z: t.axisPoint.z + t.axisDir.z * t.xEnd,
    }).z;
    const zStart = xf({
      x: t.axisPoint.x + t.axisDir.x * t.xStart,
      y: t.axisPoint.y + t.axisDir.y * t.xStart,
      z: t.axisPoint.z + t.axisDir.z * t.xStart,
    }).z;
    return {
      ...withFeature,
      selectionIs: 'floor',
      side: 'outside',
      startDepth: round2(crown - Math.max(zEnd, zStart)),
      endDepth: round2(crown - Math.min(zEnd, zStart)),
      sideAllowance: 0,
      bottomAllowance: 0,
      clearToStock: false,
      tabs: null,
    } as JobOp;
  }
  const p = suggestDatumPoint(r, datum, stock);
  if (p) return prefillDepths(withFeature, p.z, crown);
  return withFeature;
}

// ------------------------------------------------- tool suggestion (round 2)

/** What kind of cutter each suggested op wants, in preference order —
 *  a bore wants an actual drill bit first; the chamfer family wants the
 *  tip of a V-bit (Alice, 2026-11-12: the chamfer bit is the default
 *  choice for chamfer ops). The lists MIRROR THE GENERATORS' OWN TYPE
 *  GATES — cylChamfer throws on anything but a V-bit or ball-nose
 *  (cylChamfer.ts), threadMill on anything but a thread mill
 *  (threadMill.ts), chamfer on anything but a V-bit (chamfer.ts) — so
 *  a suggested tool is always one its op accepts. */
const TOOL_TYPES: Partial<Record<JobOp['kind'], Tool['type'][]>> = {
  drill: ['drill', 'flat'],
  threadMill: ['threadmill'],
  // the ROTARY thread is a V-groove swept around the A axis: a 60°
  // engraving bit (Alice, 2026-11-12: "for a rotary thread we of course
  // want the 60° engraving bit")
  thread: ['vbit'],
  pocket: ['flat'],
  profile: ['flat'],
  chamfer: ['vbit'],
  engrave: ['vbit', 'laser'],
  faceCylinder: ['flat'],
  cylChamfer: ['vbit', 'ball'],
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
  'profile',
  'faceCylinder',
]);

/** the cutting-Ø ceiling a candidate's tool must respect for THIS
 *  feature: a drill must fit the bore; an internal thread mill must fit
 *  the minor Ø with tilt clearance; a pocket must manoeuvre inside its
 *  region (half the smallest extent). Infinity = no Ø constraint. */
function toolBound(cand: SuggestCandidate, r: ResolvedFeature): number {
  const circleDia = r.kind === 'circle' ? (r.feature as CircleFeature).radius * 2 : null;
  if (cand.kind === 'drill') {
    // a drill for an internal thread targets the tap-size (minor) Ø
    if (r.kind === 'thread') return (r.feature as ThreadFeature).rootDiameter;
    return circleDia ?? Infinity;
  }
  if (cand.kind === 'threadMill') {
    // a detected THREAD feature: the mill's pitch must match the
    // thread's measured pitch (picked by TOOL_TYPES order), and for an
    // external thread the mill Ø must clear the root
    if (r.kind === 'thread') {
      const t = r.feature as ThreadFeature;
      return t.rootDiameter;
    }
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
    let fits = pool.filter((t) => t.type === type && t.diameter <= bound + 1e-9);
    if (fits.length === 0) continue;
    // a V-bit is picked by its INCLUDED angle when the feature pins one:
    // a measured cone under a chamfer rim (90° chamfer bit for a 45°
    // wall, never the 60° engraver), and the 60° metric thread form for
    // the rotary thread (Alice, 2026-11-12). No match in the pool falls
    // back to the old smallest-diameter pick rather than no tool.
    if (type === 'vbit') {
      const want =
        cand.kind === 'thread' ? 60 : cand.vAngle !== undefined ? cand.vAngle : null;
      if (want !== null) {
        const byAngle = fits.filter((t) => t.vAngle !== undefined && Math.abs(t.vAngle - want) <= 15);
        if (byAngle.length > 0) fits = byAngle;
      }
    }
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
