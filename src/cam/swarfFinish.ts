/**
 * TRUE 4D FINISHING — the CONTACT MAP (PLAN.md "The true 4D finishing
 * pass — normal-following contact envelopes", milestone 1). The spindle
 * never tilts, so the PART supplies every contact angle: per surface
 * point, rotation A sweeps its normal through every non-X-parallel
 * attitude once per revolution. This module samples that attitude —
 * per (x,θ) surface cell it records WHERE the surface is, WHICH way it
 * faces, and the index angle A* that brings that face against the
 * tool's flank. Milestones 2+ (column clearance, patch segmentation,
 * the G93 sweep writer) all read this map; it emits NO moves.
 *
 * FRAME CONVENTIONS (matched to buildDexelMap so the grids interoperate
 * with the rough's standing material): the mesh arrives in the stock's
 * MATERIAL frame at A=0, machine-space xyz triples, non-indexed. The
 * grid is θ-major, cell (i,j) at index j·nx + i; column i sits at
 * x = x0 + i·pitchX with pitchX = thetaStepOver/2 (the rotaryCarve grid
 * contract); row j sits at θ = j·2π/nTheta with
 * nTheta = max(24, round(2πR/thetaStepOver)) — rows spaced thetaStepOver
 * of ARC at the stock radius. Sampling is OUTWARD radial raycasts
 * (direction (0,−sinθ,−cosθ) from radius+10 inward): the first hit is
 * the outer boundary, exactly the dexel map's from-outside trick (a ray
 * from the axis would report a tube's inner wall as the surface). Air
 * cells (no hit) are absent from the map — their index slot is AIR.
 *
 * THE ALIGNMENT FORMULA (derived once, pinned by tests). A material
 * direction d at stock angle A rotates as (indexedPointRotation's
 * convention about the axis, applied to directions):
 *   d.y' = d.y·cosA − d.z·sinA
 *   d.z' = d.y·sinA + d.z·cosA
 * Write the normal's YZ projection as n.y = ρ sinφ, n.z = ρ cosφ with
 * φ = atan2(n.y, n.z). Then
 *   d.z' = ρ cos(A − φ),   d.y' = ρ sin(φ − A)
 * Flank (SWARF) contact wants the rotated normal HORIZONTAL pointing at
 * the tool on machine −Y: d.z' = 0 with d.y' < 0 gives A − φ = ±90° and
 * sin(φ − A) < 0 ⇒
 *   align = φ + 90°  =  atan2(n.y, n.z) + 90°, normalized to [0, 360)
 * (PLAN.md's "A* = YZ angle − 90°" is the +Y contact attitude; this map
 * pins the −Y attitude, which PLAN itself notes is A*+180° — the two
 * agree modulo the contact side). Cross-check that doubles as the
 * convention proof: indexToAlignDirection(n) = φ carries n to +Z, and
 * since A = +90° carries +Y onto +Z under this rotation, one MORE +90°
 * carries +Z onto −Y — so align = indexToAlignDirection(n) + 90°, NOT
 * −90° (the rotated-normal test in swarfFinish.test.ts verifies the
 * sign end-to-end through indexedPointRotation itself).
 *
 * NORMALS, HEALED: the geometric (winding) normal is computed straight
 * from the hit triangle's three positions and flipped if it opposes the
 * incoming ray — the outward face normal must OPPOSE the ray that
 * arrived from outside. This heals inverted-winding meshes by
 * construction (the waterline's lesson): a DoubleSide hit with unresolved
 * winding still yields the outward normal, because "outward" here is
 * DEFINED as against-the-ray, not as winding. The choice to use the
 * single raycastFirst hit's face normal (rather than angle-weighted
 * averaging over a ray bundle) is deliberate: raycastFirst already IS
 * the nearest-surface contract the dexel map uses, and per-cell face
 * normals keep the map pure and reproducible. Degenerate (zero-area)
 * triangles produce no cell rather than a garbage normal. CAVEAT pinned
 * by the healing fixture: three-mesh-bvh re-indexes non-indexed input,
 * so faceIndex is resolved through the post-build index buffer — a raw
 * `positions[9·faceIndex]` read silently lands on the WRONG triangle.
 *
 * RAKE (the honesty metric): n.x, the signed axial component of the
 * healed normal. |rake| near 1 = the normal is nearly parallel to X =
 * the flank engagement is razor-thin (PLAN's "near-X normals" class);
 * rake 0 = pure radial face, the healthy SWARF case. Pure-X normals
 * (y = z = 0) are the implicit unreachable class — atan2(0,0) collapses
 * to 0, so their align is meaningless; the milestone-2 clearance check
 * and the coverage report own that verdict, not this map.
 *
 * DATA LAYOUT: a compact per-cell LIST (`cells`) plus a dense lookup
 * grid (`cellIndex`, j·nx + i → cell index or AIR). Patch segmentation
 * (milestone 3) walks neighbors through cellIndex in O(1) and only ever
 * touches listed cells, so sparse parts (a blade in a big stock) don't
 * pay for the empty stock cells twice.
 *
 * Pure: geometry in, map out, three-mesh-bvh raycasts — vitest covers
 * it without worker harnesses (the relief.ts precedent).
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Move, Tool } from '../core/types';
import { MAX_ROTARY_RPM, SAFE_CLEARANCE } from './faceCylinder';
import { indexedPointRotation } from './indexing';

export interface ContactMapOptions {
  /** machine-space xyz triples, non-indexed, in the stock's MATERIAL
   *  frame at A=0 (the transformed-positions contract) */
  positions: ArrayLike<number>;
  /** stock axial span, machine X, mm — the grid covers exactly this */
  x0: number;
  x1: number;
  /** stock radius, mm — the raycast stand-off and the θ row spacing
   *  (arc = thetaStepOver at this radius) are measured from it */
  radius: number;
  /** stock axis height, machine Z, mm */
  axisZ: number;
  /** the θ grid step (arc length at the stock radius, mm) — the X pitch
   *  is half of it (the rotaryCarve grid contract), so the map matches
   *  the rough's standing grid cell-for-cell */
  thetaStepOver: number;
}

/** One surface cell of the contact map. */
export interface ContactCell {
  /** the cell's own material-frame angle, radians (= row j·2π/nTheta) —
   *  kept per cell so downstream patch code never re-derives it */
  theta: number;
  /** outward surface hit point, machine frame at A=0 (material frame) */
  p: { x: number; y: number; z: number };
  /** outward face normal AT the hit, unit length, healed against the
   *  ray (winding-independent) */
  n: { x: number; y: number; z: number };
  /** A* in degrees, normalized [0,360): the stock rotation that brings
   *  THIS cell's normal to machine −Y (horizontal, at the tool's flank)
   *  — the SWARF contact attitude. Meaningless for pure-X normals (the
   *  unreachable class); pair with rake to detect those. */
  align: number;
  /** n.x, signed — the axial-rake honesty metric: |rake| ≈ 1 is razor
   *  engagement, 0 is a healthy radial flank */
  rake: number;
}

/** The contact map: milestone-1 deliverable of the 4D finishing pass. */
export interface ContactMapResult {
  /** surface cells (air excluded), ordered row-major as encountered */
  cells: ContactCell[];
  /** dense grid, cell (i,j) at j·nx + i → index into `cells`, or AIR
   *  (0xffffffff) for a cell with no surface hit */
  cellIndex: Uint32Array;
  /** grid shape — matches buildDexelMap/rotaryCarve so the rough's
   *  standing grid and this map interoperate cell-for-cell */
  nx: number;
  nTheta: number;
  pitchX: number;
  gx0: number;
  /** cells.length, surfaced for the op panel / coverage report */
  surfaceCells: number;
}

/** the cellIndex value for a cell with no surface hit (air) */
export const CONTACT_AIR = 0xffffffff;

/**
 * The alignment angle for a surface normal: A* = atan2(n.y, n.z) + 90°,
 * normalized to [0,360) — see the module docstring for the derivation
 * and the indexToAlignDirection+90 cross-check. Exported because the
 * milestone-2 clearance check must re-derive attitudes for normals the
 * sweep writer nudges; one formula, one place.
 */
export function normalAlignDeg(n: { x: number; y: number; z: number }): number {
  const phi = (Math.atan2(n.y, n.z) * 180) / Math.PI;
  return (((phi + 90) % 360) + 360) % 360;
}

/**
 * Build the contact map: outward point + healed face normal + A* + rake
 * per (x,θ) surface cell. See the module docstring for every convention.
 */
export function buildContactMap(o: ContactMapOptions): ContactMapResult {
  if (!(o.x1 > o.x0)) {
    throw new Error('empty stock span: x1 must exceed x0');
  }
  if (!(o.radius > 0)) {
    throw new Error('bad stock radius: must be positive');
  }
  if (!(o.thetaStepOver > 0)) {
    throw new Error('bad thetaStepOver: must be positive');
  }

  // the rotaryCarve grid contract: X pitch half the θ step, θ rows spaced
  // thetaStepOver of arc at the stock radius (24-row floor = never a
  // degenerate ring on tiny stocks)
  const pitchX = o.thetaStepOver / 2;
  const gx0 = o.x0;
  const nx = Math.floor((o.x1 - o.x0) / pitchX) + 1;
  const nTheta = Math.max(24, Math.round((2 * Math.PI * o.radius) / o.thetaStepOver));
  const dTheta = (2 * Math.PI) / nTheta;

  const geo = new THREE.BufferGeometry();
  const pos = Float32Array.from(o.positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });
  // three-mesh-bvh ADDS an index to non-indexed geometry and SHUFFLES it
  // while building: `hit.faceIndex` is the triangle's index in THAT
  // indexed space, so the triangle's vertices must be resolved through
  // geo.index (reading pos[9·faceIndex] grabs an unrelated triangle —
  // found by the healing fixture's cell-count mismatch). hit.face.a/b/c
  // are the same resolved vertex indices; the index read avoids the
  // per-hit object churn.
  const idx = geo.index;
  if (!idx) throw new Error('three-mesh-bvh did not index the geometry'); // unreachable

  const cells: ContactCell[] = [];
  const cellIndex = new Uint32Array(nx * nTheta).fill(CONTACT_AIR);
  const ray = new THREE.Ray();

  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    // from OUTSIDE inward: the first hit IS the outer boundary (the
    // buildDexelMap trick, radialized)
    ray.direction.set(0, -sin, -cos);
    ray.origin.set(0, (o.radius + 10) * sin, o.axisZ + (o.radius + 10) * cos);
    for (let i = 0; i < nx; i++) {
      ray.origin.x = gx0 + i * pitchX;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (!hit || hit.faceIndex == null) continue;

      // geometric normal from the triangle's RAW winding, vertices
      // resolved through the BVH's index (see the note above) — then
      // healed against the ray, which makes winding irrelevant
      const t = idx.getX(hit.faceIndex * 3) * 3;
      const a = idx.getX(hit.faceIndex * 3 + 1) * 3;
      const b = idx.getX(hit.faceIndex * 3 + 2) * 3;
      const e1x = pos[a] - pos[t];
      const e1y = pos[a + 1] - pos[t + 1];
      const e1z = pos[a + 2] - pos[t + 2];
      const e2x = pos[b] - pos[t];
      const e2y = pos[b + 1] - pos[t + 1];
      const e2z = pos[b + 2] - pos[t + 2];
      let nx2 = e1y * e2z - e1z * e2y;
      let ny2 = e1z * e2x - e1x * e2z;
      let nz2 = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx2, ny2, nz2);
      if (len < 1e-12) continue; // degenerate triangle: no honest normal
      nx2 /= len;
      ny2 /= len;
      nz2 /= len;
      // HEAL: the outward normal must oppose the incoming ray
      if (nx2 * ray.direction.x + ny2 * ray.direction.y + nz2 * ray.direction.z > 0) {
        nx2 = -nx2;
        ny2 = -ny2;
        nz2 = -nz2;
      }

      cellIndex[j * nx + i] = cells.length;
      cells.push({
        theta,
        p: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        n: { x: nx2, y: ny2, z: nz2 },
        align: normalAlignDeg({ x: nx2, y: ny2, z: nz2 }),
        rake: nx2,
      });
    }
  }

  geo.dispose();
  return { cells, cellIndex, nx, nTheta, pitchX, gx0, surfaceCells: cells.length };
}

/* ------------------------------------------------------------------ *
 * MILESTONE 2 — the FLUTE COLUMN-CLEARANCE CHECK
 *
 * WHY: at flank contact the tool stands vertical, its flute's
 * cylindrical side just touching the cell's surface point — contact
 * itself is legal by construction. The question is whether the tool's
 * BODY (the flute column above and below the contact) clears the REST
 * of the model at that attitude. A cell whose flute column clips other
 * geometry at its A* is NOT swarf-touchable; this check marks it so
 * (the map's honesty class, PLAN milestone 2).
 *
 * THE TOOL-CENTER FORMULA (derived once, pinned by test 5). Work in
 * the machine frame with the stock indexed at A*: indexedPointRotation
 * carries a material point p to
 *   y' = p.y·cosA − (p.z−axisZ)·sinA
 *   z' = p.y·sinA + (p.z−axisZ)·cosA + axisZ
 * and a direction d likewise (axisZ drops out). By the alignment
 * derivation above, the cell's normal rotated by A* lands EXACTLY on
 * machine −Y with zero z: n' = (n.x, −√(n.y²+n.z²), 0). The tool is a
 * VERTICAL cylinder; its flank touches the contact point, so its axis
 * sits one toolR OUTWARD along that rotated normal (the outward side is
 * where the tool physically stands — the material is behind the tangent
 * plane, the tool in front of it):
 *   center = rotate(p, A*) + toolR · n'
 *   center = (p'.x, p'.y − toolR·√(n.y²+n.z²), p'.z)
 * (n'.z is exactly 0, so the center's z equals the contact's rotated
 * z — the contact rides the flank at its own height.) Pinned by test:
 * the contact sits exactly toolR from the axis (horizontal distance),
 * the axis on the +normal side, and the center z equals the rotated
 * contact z.
 *
 * THE SPAN (conservative first cut): a VERTICAL machine cylinder of the
 * flute Ø spanning contactZ ± fluteLength, centered on the tool axis.
 * Vertical is exact (the spindle never tilts); the ±fluteLength z-span
 * is deliberately DOUBLE-COUNTING — a real tool's flute runs from its
 * tip UP, so the true column is [contactZ, contactZ + fluteLength] for
 * a contact at the tip, but the contact can ride anywhere along the
 * flute (higher contacts = deeper reach below), and without tracking
 * where on the flute each cell touches, [contactZ − fluteLength,
 * contactZ + fluteLength] is the honest conservative envelope. Cost:
 * cells near a base are clipped slightly early (a contact less than
 * fluteLength above a floor with clearance only BELOW it reads CLIPPED
 * — flagged, human looks, milestone 3 owns the un-flagging if it ever
 * matters). Clipped to the tool's physical bounds: the flute never
 * reaches above its tip plane, and the shank above the flute is not
 * modeled here (shank-vs-model is the sim's collision honesty, not the
 * map's).
 *
 * THE COLLISION TEST: the whole query runs in the MATERIAL frame — the
 * BVH holds the A=0 mesh once, and the machine-frame tool column (center
 * AND both span endpoints) is rotated BACK by −A* into it (ONE transform
 * of a segment, not 300k triangles); the material pre-image of the
 * vertical machine column is a segment tilted by −A* about X. A triangle
 * collides iff its distance to that segment is < toolR. Excluded from
 * the verdict: the CONTACTED NEIGHBORHOOD — triangles within
 * CLEARANCE_EXCLUSION_RADIUS (TRUE point-to-triangle distance, not
 * vertex distance: side facets tessellate as long skinny triangles
 * whose vertices sit far from the contact while the triangle itself
 * passes through it) of the material contact point must not count — the
 * touched face itself hugs the flank by construction; its own fan is
 * legal contact, not collision. Radius = a QUARTER of the finer grid
 * pitch (x pitch vs θ-arc), floored at 50 µm above float noise: small
 * enough that a real second feature a couple of mm away still counts
 * (probed — a full-pitch exclusion swallowed a 2 mm blade gap), large
 * enough to cover the contact's own fan, which point-to-triangle
 * distance puts at ~0. Collision itself carries a 1 µm graze epsilon
 * (distance < toolR − 1e-3): exact-tangent geometry is legal contact,
 * not a clip. O(cells × BVH query): measured 23 ms for 912 cells on a
 * 1.2k-triangle propeller; 12.8 s for 38k cells on a 153k-triangle
 * sphere (a full fine-grid wrap — planner-class, not interactive).
 *
 * VERDICT: CLEAR / CLIPPED per cell, verdict[i] ↔ map.cells[i]. Pure.
 */

/** flute column verdict per cell */
export const FLUTE_CLEAR = 0;
export const FLUTE_CLIPPED = 1;

export interface FluteClearanceOptions {
  /** the SAME material-frame mesh the map was built from */
  positions: ArrayLike<number>;
  /** full tool — diameter (flute Ø) and fluteLength are used; a tool
   *  without fluteLength is rejected (no honest span without it) */
  tool: Tool;
  /** the map to verdict — attitudes and contacts are read per cell */
  map: ContactMapResult;
  /** stock axis height, machine Z, mm — the A* rotation's axis */
  axisZ: number;
  /** stock radius, mm — sizes the contact-neighborhood exclusion */
  radius: number;
}

/**
 * The tool-center machine position for flank contact at a cell's A*
 * (the milestone-2 formula, exported and pinned by its own test):
 * rotate the contact point to A* (indexedPointRotation), then step one
 * toolR OUTWARD along the rotated normal n' = (n.x, −√(n.y²+n.z²), 0):
 *   center = rotate(p, A*) + toolR·n'
 * Returns (cx, cy, cz); cz equals the rotated contact's z (n'.z ≡ 0).
 */
export function fluteToolCenter(
  p: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
  alignDeg: number,
  toolR: number,
  axisZ: number,
): { x: number; y: number; z: number } {
  const th = (alignDeg * Math.PI) / 180;
  const cosA = Math.cos(th);
  const sinA = Math.sin(th);
  const zRel = p.z - axisZ;
  const px = p.x;
  const py = p.y * cosA - zRel * sinA;
  const pz = p.y * sinA + zRel * cosA + axisZ;
  const nr = Math.hypot(n.y, n.z);
  return { x: px + toolR * n.x, y: py - toolR * nr, z: pz };
}

/**
 * Verdict every cell of the map for flute column clearance at its A*.
 * Returns one byte per map cell (FLUTE_CLEAR / FLUTE_CLIPPED).
 */
export function fluteClearanceCheck(o: FluteClearanceOptions): Uint8Array {
  const toolR = o.tool.diameter / 2;
  const flute = o.tool.fluteLength;
  if (!(toolR > 0)) throw new Error('bad tool: diameter must be positive');
  if (flute === undefined || !(flute > 0)) {
    throw new Error('bad tool: fluteLength must be positive');
  }
  if (!(o.radius > 0)) throw new Error('bad stock radius: must be positive');

  // the contacted-neighborhood exclusion: a QUARTER of the finer grid
  // pitch, floored above float noise (see the docstring — a full pitch
  // swallowed real second features 2 mm away, probed in the propeller
  // fixture; with point-to-triangle distance only the contact's own fan
  // sits at ~0, and a quarter pitch covers it with room to spare)
  const arcPitch = (2 * Math.PI * o.radius) / o.map.nTheta;
  const exclusionR = Math.max(0.05, 0.25 * Math.min(o.map.pitchX, arcPitch));

  // the mesh BVH, built ONCE (the tool cylinder moves, the model stays)
  const geo = new THREE.BufferGeometry();
  const pos = Float32Array.from(o.positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  // scratch (reused per cell — no per-cell allocation)
  const rot = new THREE.Vector3();
  const segStart = new THREE.Vector3();
  const segEnd = new THREE.Vector3();
  const seg = new THREE.Line3();
  const closest = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const boxScratch = new THREE.Box3();

  const verdict = new Uint8Array(o.map.cells.length).fill(FLUTE_CLEAR);

  for (let ci = 0; ci < o.map.cells.length; ci++) {
    const c = o.map.cells[ci];
    // 1. rotate the contact point to A* (indexedPointRotation, inlined)
    const th = (c.align * Math.PI) / 180;
    const cosA = Math.cos(th);
    const sinA = Math.sin(th);
    const zRel = c.p.z - o.axisZ;
    rot.set(c.p.x, c.p.y * cosA - zRel * sinA, c.p.y * sinA + zRel * cosA + o.axisZ);
    // the rotated normal's horizontal length (√(n.y²+n.z²)); n'.z ≡ 0
    const nr = Math.hypot(c.n.y, c.n.z);
    if (nr < 1e-9) {
      // pure-X normal: the unreachable class — no meaningful A*, no
      // meaningful column; mark CLIPPED (the honesty verdict)
      verdict[ci] = FLUTE_CLIPPED;
      continue;
    }
    // 2. tool center: one toolR OUTWARD along the rotated normal —
    //    center = rot + toolR·n', n' = (n.x, −nr, 0)
    const cx = rot.x + toolR * c.n.x;
    const cy = rot.y - toolR * nr;
    const cz = rot.z;
    // 3. the vertical flute segment on the axis, contactZ ± fluteLength.
    //    THE QUERY RUNS IN THE MATERIAL FRAME: the BVH holds A=0
    //    material triangles, so the machine-frame column (its center
    //    AND both endpoints) is rotated BACK by −A* — an isometry, so
    //    all distances are exact; the segment is generally TILTED in
    //    the material frame and the exclusion reference point is the
    //    material contact c.p.
    //    (Probed the hard way, twice: comparing machine segments
    //    against material triangles read 3.0000 for a column actually
    //    piercing the other blade 0.02 away, and a z-aligned material
    //    segment read the tool inside its own blade at a 90° attitude —
    //    the propeller's facing flank read CLEAR while buried.)
    // BOTH ENDPOINTS rotate — and the segment is CONSTRUCTED, not
    // hand-derived (committee 2026-10-31): the material pre-image of
    // the vertical machine column is BUILT by rotating its two machine
    // endpoints through the pinned indexedPointRotation(−A*) — no
    // direction sign exists to slip. The (0, −sinA, cosA) this block
    // carried from milestone 2 was exactly such a slip: invisible at
    // planar attitudes 0/180 (sin = 0 — every planar fixture in this
    // suite) and a MIRROR at every other attitude, under which a bare
    // convex cylinder read ALL-CLIPPED (728/728) and the "propeller
    // honesty" pins shipped measuring the bug. The construction is
    // pinned identical to the honest inline form (0, +sinA, cosA) to
    // <1e-9 on 349/349 cells: the honest line lies PARALLEL to the
    // touched facet's plane at exactly toolR, so a convex tessellation
    // clears by construction and only real neighbors clip.
    const rotBack = indexedPointRotation(-c.align, o.axisZ);
    segStart.copy(rotBack({ x: cx, y: cy, z: cz - flute }));
    segEnd.copy(rotBack({ x: cx, y: cy, z: cz + flute }));
    seg.start.copy(segStart);
    seg.end.copy(segEnd);
    // the tilted segment's AABB, padded by the swept cylinder radius
    const bb = boxScratch;
    bb.min.x = cx - toolR;
    bb.max.x = cx + toolR;
    bb.min.y = Math.min(segStart.y, segEnd.y) - toolR;
    bb.max.y = Math.max(segStart.y, segEnd.y) + toolR;
    bb.min.z = Math.min(segStart.z, segEnd.z) - toolR;
    bb.max.z = Math.max(segStart.z, segEnd.z) + toolR;

    // 4. BVH shapecast: the tool cylinder (radius toolR about the
    //    segment) vs every triangle whose box the column's box reaches.
    //    A triangle COLLIDES iff its true segment-distance < toolR AND
    //    it lies outside the contacted neighborhood (beyond the
    //    exclusion radius of the material contact — the touched face's
    //    own fan is legal contact, not collision).
    let hit = false;
    bvh.shapecast({
      intersectsBounds: (box) => {
        if (hit) return false; // early-out once clipped
        if (box.max.x < bb.min.x || box.min.x > bb.max.x) return false;
        if (box.max.y < bb.min.y || box.min.y > bb.max.y) return false;
        if (box.max.z < bb.min.z || box.min.z > bb.max.z) return false;
        return true;
      },
      intersectsTriangle: (t) => {
        // the contacted neighborhood exclusion first (cheap): a triangle
        // whose TRUE distance to the contact is within the exclusion is
        // part of the touched face's own fan. Point-to-triangle, not
        // vertex distance — facets tessellate as long skinny triangles
        // (a 20 mm quad split in two) whose vertices sit far away while
        // the triangle still passes through the contact (probed: the
        // vertex test clipped 227/325 cells of a bare convex cylinder).
        if (t.distanceToPoint(p3.set(c.p.x, c.p.y, c.p.z)) < exclusionR) {
          return false;
        }
        const d = t.closestPointToSegment(seg, closest);
        // 1 µm graze epsilon: exact-tangent triangles (distance ==
        // toolR) are legal contact, not collision — float32 must not
        // flip them
        if (d < toolR - 1e-3) {
          hit = true;
          return true;
        }
        return false;
      },
    });
    if (hit) {
      verdict[ci] = FLUTE_CLIPPED;
      continue;
    }
  }

  geo.dispose();
  return verdict;
}

/* ------------------------------------------------------------------ *
 * MILESTONE 3 — PATCH SEGMENTATION + MONOTONE-A PASS EMISSION
 *
 * THE PLANNER (PLAN.md): contact cells group into PATCHES — "connected
 * cell sets sweepable by one continuous monotone-A pass" — and each
 * patch emits ONE long simultaneous XYZA sweep (G93, F on every line,
 * rotary-ceiling clamped — "the spiral-family emission machinery is
 * the writer"; rotaryCarve's spiralWrap finishing pass is the precedent,
 * including the 2026-10-27 chord lesson: every grid cell emitted).
 *
 * CONNECTIVITY (probed, the milestone-3 survey): PURE 4-neighbor
 * connectivity over-merges — on a two-blade propeller the whole map
 * glues into ONE patch whose A* spans the full 360°, and a single pass
 * would drag the flank through the opposite blade. Segmentation is
 * therefore connectivity AND ATTITUDE: grid neighbors merge only when
 * their ALIGN angles agree WRAP-AWARELY (A* is mod 360; a full-wrap
 * core must not split at the 359°→0° seam — that split probed as a
 * pointless retract on a surface that machines as one continuous
 * rotation). The tolerance is a CHORD-HONESTY bound, not a magic angle:
 * two cells merged into one patch are swept CONSECUTIVELY, so it bounds
 * the flank's A* slide between adjacent emitted contacts.
 *
 * MONOTONE-A: a patch is emitted as a greedy NEIGHBOR-CHAINED WALK in
 * non-decreasing machine attitude — start at the patch's lowest-A*
 * cell, then repeatedly step to the unvisited grid-adjacent (4-neighbor,
 * θ wrapping) cell with the smallest FORWARD A* advance (mod 360 — the
 * walk accumulates past 360 on full wraps, the continuous-rotation
 * rule; the post's G92.4 A0 S0 shrink keeps the counter small). Monotone
 * BY CONSTRUCTION: the walk never steps to a lower attitude. Chord-safe
 * by the same construction: every step is grid-adjacent (the pitch
 * bounds its chord) AND forward-close (the segmentation tolerance
 * bounds its A* change) — a sort-by-A* walk without neighbor chaining
 * was rejected: it is monotone but chords spatially distant equal-A*
 * cells through unchecked space. A walk that STALLS (no unvisited
 * neighbor within tol FORWARD — the patch folds back in attitude) ends
 * the pass there; the folded cells become their own patch (their own
 * retract + re-approach). Honest, never silent.
 *
 * FRAGMENTATION QUALITY (probed, pinned by invariants not counts): the
 * greedy chain sweeps clean constant-attitude bands in ONE serpentine
 * pass (the +i/-i/+j step preference IS boustrophedon on a rectangle),
 * strip-like flanks likewise; but a HOLED band (cells of another
 * attitude interleaved — the 8-gon's boundary row) dead-ends the chain
 * and the band fragments into several honest passes. That is partly
 * FORCED — a chord over the hole's surface cells at this patch's
 * attitude is a flank gouge, so any single-pass order must weave, and
 * partly the greedy's limit (a weaving order exists on the probed
 * fixture; the greedy does not find it). The fragments cost retracts,
 * never correctness: every pass keeps the per-step contract. A weaving
 * band-sweep planner is a follow-up if the retracts ever matter.
 *
 * EMISSION (per patch): entry = pure-A rapid forward → pure-XY rapid
 * over → pure-Z plunge (the pass CONTRACT: entry at the safe plane, z =
 * axisZ + radius + clearance, above everything; the caller threads
 * endA → startA between passes so machine A only ever advances); then
 * one G93 XYZA move per remaining cell at its own attitude; exit =
 * pure-Z retract to the safe plane. NO rapid ever combines Z with
 * X/Y/A (the rotaryCarve pinned convention). RAPIDS ARE NOT CHARGED
 * here — the family convention (rotaryCarve): the generator charges
 * cutting moves only, the caller's overhead accounting owns rapid travel
 * and spindle ramps (charging the entry advance here would double-count
 * it at two different rates). The Y WORD APPEARS on every cut move:
 * flank contact rides
 * the tool at its own height and side, so the center's y follows the
 * contact around the stock (the cylinder ops emit no Y because their Y
 * parks on the centerline; this one moves in all four axes — the point
 * of the 4D finish).
 *
 * FEED (G93 inverse-time, the spiralWrap shape): per cut move,
 *   passMinutes = max(contactPath / feed, centerPath / feed,
 *                     ΔA° / 360 / MAX_ROTARY_RPM)
 *   F = 1 / passMinutes  — on EVERY G1 line (the firmware halts without)
 * contactPath = the surface point's own travel (the chip load);
 * centerPath = the tool-axis travel (the commanded geometry — flank
 * contact near the axis swings the center faster than the surface, so
 * both floors matter); the rotary ceiling floors the rest. F is clamped
 * ≥ the 2-decimal minimum by the post (F0 stall guard).
 *
 * WHAT THIS DOES NOT OWN (milestones 4–5): the coverage report (CLIPPED
 * and unreachable cells are counted here — unswarfableCells — but the
 * reporting class is milestone 4's); the ball window kernel; dwell-on-
 * curvature rate shaping (A's rate following geometry is a follow-up —
 * the plain ceiling-clamped rate ships first); shank-vs-model (the
 * sim's honesty, not the map's).
 *
 * Pure: map + verdict in, patch list / moves out. Union-find is O(cells);
 * the walk restarts scan the remaining set per stall (worst O(cells²) on
 * a pathologically folded patch — fine at grid scales, probed maxCells
 * 1965 on the 2-blade propeller).
 */

/** one patch: CLEAR cells one continuous monotone-A pass sweeps,
 *  in WALK ORDER (non-decreasing machine attitude) */
export interface ContactPatch {
  cells: number[];
  /**
   * Stage 1 (the traces spec, 2026-11-13): per-cell THREADED attitudes,
   * parallel to `cells` — present when a planner chose each stance (the
   * ball strip planner's A-parking); absent = the kernel's own attitude
   * (flank align, ball window center). The emitter follows the thread:
   * entry advances to attitudes[0], each sweep move to attitudes[k], the
   * tool center to ballToolCenterAt(stance).
   */
  attitudes?: number[];
}

export interface SegmentPatchesResult {
  /** patches in deterministic order: by first cell's index */
  patches: ContactPatch[];
  /** CLEAR- verdict cells no patch covers (stall-folded cells are in
   *  patches; this counts the rest) */
  unswarfableCells: number;
}

export interface SegmentPatchesOptions {
  map: ContactMapResult;
  /** the milestone-2 verdict array (FLUTE_CLEAR / FLUTE_CLIPPED per cell) */
  verdict: Uint8Array;
  /**
   * Wrap-aware attitude tolerance for the 4-neighbor merge, degrees:
   * adjacent CLEAR cells join one patch iff |ΔA*| mod 360 ≤ this.
   * Chord-honesty bound (see the docstring). Default 2× the θ-row
   * angular pitch — the attitude change one grid row can demand on a
   * radially-swept surface.
   */
  alignTolDeg?: number;
}

/**
 * Segment the contact map into monotone-A-sweepable patches (milestone 3):
 * union-find over CLEAR cells (4-neighbor, θ wraps; X does not — the grid
 * is a band), wrap-aware |ΔA*| ≤ tol, then the greedy monotone walk per
 * component (stall-folded components yield multiple patches, honestly).
 */
export function segmentContactPatches(o: SegmentPatchesOptions): SegmentPatchesResult {
  const { cells, cellIndex, nx, nTheta } = o.map;
  const n = cells.length;
  if (o.verdict.length !== n) {
    throw new Error(`verdict/map mismatch: ${o.verdict.length} verdicts for ${n} cells`);
  }
  const arcPitchDeg = 360 / nTheta;
  const tol = o.alignTolDeg ?? 2 * arcPitchDeg;
  if (!(tol > 0)) throw new Error('alignTolDeg must be positive');

  /** grid coords per cell, resolved once from the dense row-major index */
  const gridIdx = new Int32Array(n).fill(-1);
  for (let idx = 0; idx < cellIndex.length; idx++) {
    const s = cellIndex[idx];
    if (s !== CONTACT_AIR) gridIdx[s] = idx; // idx = j·nx + i
  }
  const gridOf = (ci: number): { i: number; j: number } => {
    const idx = gridIdx[ci];
    if (idx < 0) throw new Error(`cell ${ci} missing from the dense index`);
    const j = Math.floor(idx / nx);
    return { i: idx - j * nx, j };
  };

  /** cell index at grid (i, θ-row j) — θ wraps (the ring), X clamps (the
   *  band); −1 = air/absent */
  const cellAt = (i: number, j: number): number => {
    if (i < 0 || i >= nx) return -1;
    const jj = ((j % nTheta) + nTheta) % nTheta;
    const s = cellIndex[jj * nx + i];
    return s === CONTACT_AIR ? -1 : s;
  };

  // union-find over cell indices (path-halving find, no rank)
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  let unswarfable = 0;
  for (let ci = 0; ci < n; ci++) {
    if (o.verdict[ci] !== FLUTE_CLEAR) {
      unswarfable++;
      continue;
    }
    const g = gridOf(ci);
    for (const [di, dj] of NEIGH4) {
      const sn = cellAt(g.i + di, g.j + dj);
      if (sn < 0 || o.verdict[sn] !== FLUTE_CLEAR) continue;
      if (wrapDeltaDeg(cells[ci].align, cells[sn].align) > tol) continue;
      union(ci, sn);
    }
  }

  // members by root (ascending cell index), then the walk per component
  const members = new Map<number, number[]>();
  for (let ci = 0; ci < n; ci++) {
    if (o.verdict[ci] !== FLUTE_CLEAR) continue;
    const r = find(ci);
    const list = members.get(r);
    if (list) list.push(ci);
    else members.set(r, [ci]);
  }
  const patches: ContactPatch[] = [];
  for (const list of members.values()) {
    for (const pass of walkComponent(list, cells, cellAt, gridOf, tol)) {
      patches.push({ cells: pass });
    }
  }
  patches.sort((a, b) => a.cells[0] - b.cells[0]);
  return { patches, unswarfableCells: unswarfable };
}

/** the 4-neighborhood: (Δi, Δj) in fixed scan order (walk determinism) */
const NEIGH4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** wrap-aware attitude distance, degrees in [0, 180] */
function wrapDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** signed wrap-aware delta, (−180, 180] — to relative to from */
function signedDeltaDeg(from: number, to: number): number {
  let d = ((to - from) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/* --------------- STAGE 1 — THE BALL STRIP PLANNER (traces spec, 2026-11-13) --------------- */

export interface SegmentBallStripsOptions extends BallClearanceOptions {
  /** the ballClearanceCheck verdict for this map (center-attitude CLEAR/CLIPPED) */
  verdict: Uint8Array;
  /** machine A the first strip parks from — the op threads ctx.startA */
  startA?: number;
}

/** one strip: cells in walk order + the threaded stance per cell */
export interface BallStrip extends ContactPatch {
  attitudes: number[];
}

export interface SegmentBallStripsResult {
  patches: BallStrip[];
  /**
   * Cells no strip covers — the same honesty class as
   * segmentContactPatches: every CLIPPED verdict (clearance-blocked or
   * no window) plus any clear cell left behind. Every CLEAR cell with a
   * window is covered by construction (its own strip in the worst
   * case), so this equals the unreachable count.
   */
  unswarfableCells: number;
  /** steps that dodged back to the window center — the parked/edge
   *  stance CLIPPED at the threaded attitude (the per-edge re-verdict
   *  guard, the adversaries' G3: center-only verdicts miss 1.6–2.1% of
   *  wavy cells at window edges) */
  centerDodges: number;
  /** in-strip breaks (fold-pair guard, or a parked stance that fouls
   *  with the center unreachable within the step cap) — honest retracts */
  breaks: number;
}

/**
 * The BALL strip planner (Stage 1 of the traces spec, 2026-11-13): the
 * patch-planner fragmentation fix. The window is a ±~72° INTERVAL per
 * cell, not a point — so the planner TRACES θ-row strips along X
 * (Alice's stated shape), chaining rows end-to-end boustrophedon-style
 * (wrap-aware at the seam), and A PARKS: the stance holds while the
 * next cell's window still contains it, moves only to the nearest
 * window edge when it must, and every off-center stance RE-VERDICTS
 * against the real mesh (G3). Steps beyond the FOLD_PAIR cap break the
 * strip honestly — the emitter never wraps them. The stance chain
 * carries in the patch's `attitudes`; the flank path keeps
 * segmentContactPatches verbatim (exact envelope, geometry-forced).
 */
export function segmentBallStrips(o: SegmentBallStripsOptions): SegmentBallStripsResult {
  const { map, verdict } = o;
  const n = map.cells.length;
  if (verdict.length !== n) {
    throw new Error(`verdict/map mismatch: ${verdict.length} verdicts for ${n} cells`);
  }
  const floor = o.glancingFloor ?? BALL_DEFAULT_FLOOR;
  if (!(floor > 0) || !(floor < 1)) {
    throw new Error('bad glancing floor: 0 < floor < 1');
  }
  const { cellIndex, nx, nTheta, cells } = map;

  /** cell index at grid (i, θ-row j) — θ wraps, X clamps; −1 = air */
  const cellAt = (i: number, j: number): number => {
    if (i < 0 || i >= nx) return -1;
    const jj = ((j % nTheta) + nTheta) % nTheta;
    const s = cellIndex[jj * nx + i];
    return s === CONTACT_AIR ? -1 : s;
  };
  const clearAt = (i: number, j: number): boolean => {
    const s = cellAt(i, j);
    return s >= 0 && verdict[s] === FLUTE_CLEAR && visited[s] === 0;
  };

  // the engagement windows: center φ (normal-UP) and half-width
  // acos(floor/ρ). CLEAR cells always have ρ ≥ floor (the verdict
  // clips the axial class on sight).
  const phi = new Float64Array(n);
  const hw = new Float64Array(n);
  for (let ci = 0; ci < n; ci++) {
    const c = cells[ci];
    const rho = Math.hypot(c.n.y, c.n.z);
    phi[ci] = ballAttitudeDeg(c.n);
    hw[ci] =
      Math.acos(Math.min(1, floor / Math.max(rho, 1e-12))) * (180 / Math.PI);
  }

  // the re-verdict machinery — one more BVH build per op run (the
  // center-attitude pass already built one; acceptable now, the P0
  // genWorker hosting is the eventual home for both)
  const clipCtx = makeBallClipCtx(o);

  const visited = new Uint8Array(n);
  const patches: BallStrip[] = [];
  let centerDodges = 0;
  let breaks = 0;
  let runningA = o.startA ?? 0;

  /** the stance for `ci` continuing from `a`: PARKED if a sits inside
   *  the window, else its nearest edge. BOTH returns live in the
   *  RUNNING-A domain (Stage 1.2, the startA asymmetry): the old
   *  `phi + sign(d)·hw` returned the φ-domain edge, silently DROPPING
   *  the accumulated whole turns whenever `a` had drifted past a
   *  revolution — the fold guard signs its step mod-360 and is blind
   *  to the drop, so the walk re-seeded in the φ-domain mid-plan, the
   *  greedy emission then crossed domains, and every crossing charged
   *  a spurious ~360° entry rapid (49 of them, 3.1 phantom min on her
   *  knight at startA 360 — invisible at startA 0 where the domains
   *  coincide). The a-domain edge: `a` stepped toward φ by |d|−hw —
   *  same spoke (mod 360) as the old edge, never a turn-dropping jump. */
  const stanceFor = (ci: number, a: number): number => {
    const d = signedDeltaDeg(phi[ci], a);
    if (Math.abs(d) <= hw[ci] + 1e-9) return a;
    return a - Math.sign(d) * (Math.abs(d) - hw[ci]);
  };

  /** walk one strip from an unvisited clear cell: along the row, then
   *  boustrophedon-turn to the next θ-row at the same end-i, wrap-aware;
   *  honest break at gaps, fold-pair violations, or fouling stances */
  const walkStrip = (startI: number, startJ: number): void => {
    const stripCells: number[] = [];
    const stripAtt: number[] = [];
    let i = startI;
    let j = startJ;
    let dir = 1; // the first row runs +X; each turn flips
    for (;;) {
      const ci = cellAt(i, j);
      if (ci < 0 || visited[ci] !== 0) break; // defensive
      let att = stanceFor(ci, runningA);
      if (att !== phi[ci]) {
        // an OFF-CENTER stance: unverified by the map pass — re-verdict
        // against the real mesh (G3). Fouling parked stances dodge to
        // the window CENTER (the precomputed CLEAR verdict guarantees
        // it clears); mid-strip dodges beyond the step cap break.
        if (ballCellClips(clipCtx, ci, att)) {
          const dCenter = signedDeltaDeg(runningA, phi[ci]);
          if (stripCells.length > 0 && Math.abs(dCenter) > FOLD_PAIR_MAX_DEG + 1e-9) {
            breaks++;
            break;
          }
          // STAGE 1.2 (the startA asymmetry, 2026-11-13): the dodge lands
          // on the window CENTER'S ALIAS NEAREST THE RUNNING A, never
          // raw phi — a phi-domain stance DROPS the accumulated whole
          // turns, and the entry delta across that boundary then reads
          // ≈360°: a spurious full-revolution A rapid (charged at the
          // ceiling) that the Stage 1.2 corridor rightly refuses,
          // forcing the safe-plane fallback (measured: 49 strips, 3.1
          // phantom minutes on her knight at startA 360; invisible at
          // startA 0 where the domains coincide). Same spoke either way.
          att = runningA + dCenter;
          centerDodges++;
        }
      }
      if (stripCells.length > 0) {
        const step = signedDeltaDeg(runningA, att);
        if (Math.abs(step) > FOLD_PAIR_MAX_DEG + 1e-9) {
          breaks++; // the emitter must never wrap a step this large
          break;
        }
        // STAGE 1.1 (the horse's nose, 2026-11-13): the chord re-verdict —
        // adjacent clear cells with verified stances can still hide a
        // contact discontinuity between them (the ridge class); refuse
        // the step and split the strip rather than mow through it
        if (ballChordClips(clipCtx, stripCells[stripCells.length - 1], runningA, ci, att)) {
          breaks++;
          break;
        }
      }
      visited[ci] = 1;
      stripCells.push(ci);
      stripAtt.push(att);
      runningA = att;
      // advance along the row
      if (clearAt(i + dir, j)) {
        i += dir;
        continue;
      }
      // row run end → boustrophedon turn: same end-i, next θ-row (wraps
      // at the seam — a full-circumference strip closes there honestly)
      if (clearAt(i, j + 1)) {
        j += 1;
        dir = -dir;
        continue;
      }
      break; // the honest strip end: retract, re-approach
    }
    if (stripCells.length > 0) patches.push({ cells: stripCells, attitudes: stripAtt });
  };

  for (let j = 0; j < nTheta; j++) {
    for (let i = 0; i < nx; i++) {
      if (!clearAt(i, j)) continue;
      walkStrip(i, j);
    }
  }

  let unswarfable = 0;
  for (let ci = 0; ci < n; ci++) {
    if (verdict[ci] !== FLUTE_CLEAR || visited[ci] === 0) unswarfable++;
  }
  clipCtx.geo.dispose();
  return { patches, unswarfableCells: unswarfable, centerDodges, breaks };
}

/**
 * STAGE 1.2 (2026-11-13, the +35% recovery, part 2): order the ball
 * strips for EMISSION by stance proximity — greedy nearest-FORWARD
 * entry from the running machine A (the entry advance only charges
 * forward, so the cost of picking a strip is its mod-360 forward
 * distance). Scan order ping-pongs the axis ~100°+ between
 * strip-adjacent-but-stance-far entries (measured 17.3 min of pure
 * A-charge on her knight); greedy runs it down to the local clusters.
 * The CUTS are untouched — strips are independent cell sets; only
 * their emission order changes. Patches without threaded attitudes
 * (the flank path) pass through in scan order, untouched.
 */
export function orderBallStripsByStance(
  patches: ContactPatch[],
  startA: number,
): ContactPatch[] {
  if (patches.length < 2) return patches;
  if (!patches.every((p) => p.attitudes !== undefined && p.attitudes.length > 0)) {
    return patches; // not ours (flank): scan order stays
  }
  const remaining = [...patches];
  const out: ContactPatch[] = [];
  let a = startA;
  while (remaining.length > 0) {
    let best = 0;
    let bestCost = Infinity;
    for (let k = 0; k < remaining.length; k++) {
      const att = remaining[k].attitudes![0];
      const cost = ((att - a) % 360 + 360) % 360; // forward entry charge
      if (cost < bestCost) {
        bestCost = cost;
        best = k;
      }
    }
    const p = remaining.splice(best, 1)[0];
    out.push(p);
    const atts = p.attitudes!;
    a = atts[atts.length - 1]; // the machine A at strip exit
  }
  return out;
}

/**
 * Walk comparator noise floor, degrees (Stage 0.1, spec 2026-11-13): the
 * walk's neighbor test reads a sub-noise BACKWARD attitude dip (−ε from
 * facet quantization) as a ~360° "behind" forward delta and rejects a
 * neighbor that should be visited — folding every smoothly-drifting
 * trace at each noise dip (3,338 → 210 passes, max 5,125 cells on a
 * smooth fixture, committee-probed). An advance within this of a full
 * revolution reads as zero. Real wobble (≥0.2°) is Stage 1's parking,
 * not this ε.
 */
const ATTITUDE_EPS_DEG = 0.02;

/**
 * The greedy monotone walk over one connected component (see the
 * milestone-3 docstring): repeatedly open a pass at the lowest-A*
 * unvisited cell, sweep forward from it while unvisited grid-neighbors
 * sit within tol AHEAD, and let the stall (no forward neighbor) close
 * the pass — the leftovers re-walk as their own passes. Returns ONE
 * LIST PER PASS (a stall fold is a pass boundary: PLAN's patch is
 * "sweepable by ONE continuous monotone-A pass" — the fold's re-approach
 * is a patch boundary, never a flat cell sequence the emitter would
 * chord straight across at cut height). Passes are returned in pass
 * order; cells within a pass are grid-adjacent steps in non-decreasing
 * unwrapped attitude (ε-noise dips read as zero advance, Stage 0.1).
 */
function walkComponent(
  component: number[],
  cells: ContactCell[],
  cellAt: (i: number, j: number) => number,
  gridOf: (ci: number) => { i: number; j: number },
  tol: number,
): number[][] {
  const inPatch = new Set(component);
  const visited = new Set<number>();
  const passes: number[][] = [];
  while (visited.size < component.length) {
    // the pass start: lowest A* among the unvisited (ties: lowest index —
    // deterministic; `component` arrives in ascending index order)
    let start = -1;
    for (const ci of component) {
      if (visited.has(ci)) continue;
      if (start < 0 || cells[ci].align < cells[start].align - 1e-12) start = ci;
    }
    if (start < 0) break;
    const order: number[] = [start];
    visited.add(start);
    let cur = start;
    for (;;) {
      const g = gridOf(cur);
      let best = -1;
      let bestFwd = Infinity;
      for (const [di, dj] of NEIGH4) {
        const s = cellAt(g.i + di, g.j + dj);
        if (s < 0 || visited.has(s) || !inPatch.has(s)) continue;
        // FORWARD advance to the neighbor's attitude, mod 360, in [0,360)
        const fwd = ((cells[s].align - cells[cur].align) % 360 + 360) % 360;
        // STAGE 0.1 (spec 2026-11-13): a sub-noise backward dip computes a
        // ~360° forward delta and was REJECTED here — folding smooth traces
        // at every facet-noise dip. An advance within ATTITUDE_EPS_DEG of a
        // full revolution is a zero advance (the neighbor sits effectively
        // level); genuinely behind or beyond tol still never drags back.
        const adv = fwd > 360 - ATTITUDE_EPS_DEG ? 0 : fwd;
        if (adv > tol + 1e-9) continue; // behind or too far
        if (adv < bestFwd - 1e-12) {
          bestFwd = adv;
          best = s;
        }
      }
      if (best < 0) break; // stalled: the pass ends, leftovers re-walk
      visited.add(best);
      order.push(best);
      cur = best;
    }
    passes.push(order);
  }
  return passes;
}

/* ------------------------- the pass emitter ------------------------- */

export interface EmitSwarfPassOptions {
  map: ContactMapResult;
  /** one patch of segmentContactPatches (cells in walk order) */
  patch: ContactPatch;
  tool: Tool;
  /** stock axis height, machine Z, mm (the rotation datum) */
  axisZ: number;
  /** stock radius, mm — sets the safe travel plane above the crown */
  radius: number;
  /** contour feed, mm/min (the contact and center path floors) */
  feed: number;
  /** plunge feed, mm/min (the pure-Z entry descent); default = feed */
  plungeFeed?: number;
  /** clearance above the crown for the travel plane; default SAFE_CLEARANCE */
  safeClearance?: number;
  /**
   * Machine A this pass enters at, degrees (the caller threads the
   * previous pass's endA here; default 0 = the stock's A=0 material
   * frame). The ENTRY advance only moves A forward (monotone across
   * passes, the residue-pin contract); the SWEEP may step A signed
   * (Stage 0.3) — the walk's merge tolerance bounds each step.
   */
  startA?: number;
  /**
   * Contact attitude family — the kernel-by-tool pick (PLAN.md: "one
   * op kind, kernel picked by the op's tool"): 'flank' (flat/corn, the
   * milestone-3 default — normal HORIZONTAL against the flute side at
   * each cell's align) or 'ball' (milestone 5 — normal UP at
   * align − 90°, the ball window's center, centers via ballToolCenter).
   * The walk is family-agnostic by construction: every decision it
   * makes is an attitude DIFFERENCE, and the ball's constant −90°
   * shift preserves all of them — only the emitted A values, tool
   * centers, and plunge height differ.
   */
  attitude?: 'flank' | 'ball';
  /**
   * STAGE 1.2 (2026-11-13): the tool's machine pose at entry (tip z),
   * threaded from the PREVIOUS strip's exitPose. Absent = the tool sits
   * at the safe plane (the classic full-plunge entry). Present + a
   * clipCtx + a clear corridor → the LOCAL entry (short plunge from
   * this height); any corridor clip → the safe-plane fallback.
   */
  entryPose?: { x: number; y: number; zTip: number };
  /**
   * The shared two-band capsule context (makeBallClipCtx, one per op)
   * for the Stage 1.2 corridor checks. Absent = never local.
   */
  clipCtx?: BallClipCtx;
}

export interface EmitSwarfPassResult {
  moves: Move[];
  /**
   * Cutting + plunge + ENTRY-A minutes (Stage 0.2, spec 2026-11-13:
   * the patch-transition A rapid is real machine time at the rotary
   * ceiling, ΔA/360/RPM — the adversaries measured the shipped
   * convention excluding it as the DOMINANT per-pass cost, ~293°/
   * patch ≈ 7s at the 6.6 RPM clamp. XY/Z rapids stay uncharged, the
   * family convention). Stage 1.2: a LOCAL entry charges only the
   * entry-height plunge, not the safe-plane depth.
   */
  estimatedMinutes: number;
  /** machine A at pass exit — thread into the next pass's startA */
  endA: number;
  /**
   * STAGE 1.2: the tool pose at exit (machine frame, tip z) — thread
   * into the next strip's entryPose. Absent on empty patches.
   */
  exitPose?: { x: number; y: number; zTip: number };
}

/**
 * Folded-pair guard, degrees (Stage 0.3, spec 2026-11-13): the walk's
 * merge tolerance bounds every sweep attitude step to ≤ tol (~7°), so a
 * larger SIGNED step reaching the emitter is a planner bug, not a cut —
 * the plain mod-360 delta used to wrap such steps into near-full-
 * revolution moves whose lerped chord plowed up to the full ball radius
 * at the midpoint (adversary-probed 0.85–1.25mm). Fail loud, never emit.
 */
export const FOLD_PAIR_MAX_DEG = 30;

/**
 * Emit ONE patch as a continuous XYZA finishing pass (milestone 3; the
 * ball family, milestone 5; Stage 0.2/0.3 of the traces spec, 2026-11-13).
 * Entry contract: the tool sits at the SAFE PLANE (z = axisZ + radius +
 * safeClearance) — the pass retracts back to it on exit, so consecutive
 * passes thread directly. Per cut move G93 inverse-time with F on every
 * line (the post's rule), feeds per the milestone-3 docstring; the ENTRY
 * advances A (charged at the rotary ceiling, Stage 0.2) and the SWEEP
 * steps A SIGNED (Stage 0.3 — a small backward step is a small move, not
 * a wrapped near-revolution).
 */
export function emitSwarfPass(o: EmitSwarfPassOptions): EmitSwarfPassResult {
  const toolR = o.tool.diameter / 2;
  if (!(toolR > 0)) throw new Error('bad tool: diameter must be positive');
  if (!(o.radius > 0)) throw new Error('bad stock radius: must be positive');
  const feed = o.feed;
  const plungeFeed = o.plungeFeed ?? o.feed;
  if (!(feed > 0) || !(plungeFeed > 0)) throw new Error('feeds must be positive');
  const safeZ = o.axisZ + o.radius + (o.safeClearance ?? SAFE_CLEARANCE);

  const { cells } = o.map;
  const patch = o.patch.cells;
  const moves: Move[] = [];
  if (patch.length === 0) return { moves, estimatedMinutes: 0, endA: o.startA ?? 0 };

  let a = o.startA ?? 0;
  let minutes = 0;
  const ball = o.attitude === 'ball';

  /** the cell's contact attitude: a THREADED stance when the patch
   *  carries one (Stage 1 A-parking), else flank = align (normal
   *  horizontal) / ball = align − 90° (normal UP, the window center).
   *  The ball's constant −90° shift preserves every walk DIFFERENCE. */
  const attOverride = new Map<number, number>();
  if (o.patch.attitudes !== undefined) {
    if (o.patch.attitudes.length !== patch.length) {
      throw new Error(
        `attitudes/patch mismatch: ${o.patch.attitudes.length} attitudes for ${patch.length} cells`,
      );
    }
    for (let k = 0; k < patch.length; k++) attOverride.set(patch[k], o.patch.attitudes[k]);
  }
  const attitudeOf = (ci: number) => {
    const ov = attOverride.get(ci);
    if (ov !== undefined) return ov;
    return ball
      ? ((((cells[ci].align - 90) % 360) + 360) % 360)
      : cells[ci].align;
  };

  /** the tool center at cell ci's OWN (threaded) attitude — fluteTool-
   *  Center's formula (flank) or ballToolCenterAt's (ball; at the
   *  window center φ it is exactly ballToolCenter). */
  const centerOf = (ci: number) =>
    ball
      ? ballToolCenterAt(cells[ci].p, cells[ci].n, toolR, o.axisZ, attitudeOf(ci))
      : fluteToolCenter(cells[ci].p, cells[ci].n, cells[ci].align, toolR, o.axisZ);
  /**
   * The COMMANDED Z, Stage 0.4 (spec 2026-11-13): the machine's Z word
   * is the tool TIP, resolved from the mill-verified MakeraStudio corpus
   * (examples/MakeraStudioTurned_path2_MULT: the Ø2 ball descends to
   * Z8 = the Ø16 stock's crown exactly — a CENTER-referenced ball would
   * gouge a ball-radius on arrival; the flank family is already
   * tip-referenced, fluteToolCenter returns the contact-height z). The
   * ball's geometric CENTER stays what the clearance kernels reason
   * about; only the commanded word drops by toolR — the sim poses the
   * tip at commanded z, so center-at-commanded+r now matches intent.
   */
  const tipZOf = (c: { x: number; y: number; z: number }) => (ball ? c.z - toolR : c.z);
  /** the surface contact at cell ci, rotated to machine attitude `deg` */
  const contactAt = (ci: number, deg: number) => {
    const th = (deg * Math.PI) / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const zRel = cells[ci].p.z - o.axisZ;
    return {
      x: cells[ci].p.x,
      y: cells[ci].p.y * c - zRel * s,
      z: cells[ci].p.y * s + zRel * c + o.axisZ,
    };
  };

  // ---- entry: A forward (rapid, CHARGED at the ceiling, Stage 0.2) → XY
  // over → plunge. All at the safe plane until the plunge; no rapid mixes Z
  // with X/Y/A (the pinned convention). ----
  const first = patch[0];
  const att0 = attitudeOf(first);
  const c0 = centerOf(first);
  const tip0 = tipZOf(c0);
  let fwd0 = ((att0 - (((a % 360) + 360) % 360)) % 360 + 360) % 360;
  // STAGE 1.2 (the startA asymmetry, part 2): the forward-only entry wrap
  // has a discontinuity AT the boundary — a stance sitting float-noise
  // BEHIND the running A (−1e-10°) reads as +359.9999999999°, a phantom
  // FULL-REVOLUTION rapid (charged at the rotary ceiling) that the
  // corridor then rightly refuses, forcing the safe-plane fallback
  // (measured: 21 strips on her knight at startA 0, 49 at 360 — which
  // side trips it is pure float luck). A forward delta within 1e-6° of
  // the full turn is noise on the SAME spoke: snap to zero.
  if (360 - fwd0 < 1e-6) fwd0 = 0;
  // STAGE 1.2 (the entry-cost recovery): thread the previous strip's exit
  // pose → run the entry LOCAL (short plunge from the exit height) when
  // the whole corridor clears the mesh — else fall back to the SAFE-PLANE
  // entry. Ball family only (the corridor is the ball's two-band test);
  // no clipCtx/entryPose → the classic full-depth entry, unchanged.
  let entryH = safeZ;
  if (ball && o.entryPose !== undefined && o.clipCtx !== undefined && o.entryPose.zTip < safeZ - 1e-9) {
    if (entryCorridorClear(o.clipCtx, o.entryPose, a, fwd0, att0, c0, cells[first].p)) {
      entryH = o.entryPose.zTip;
    } else {
      // rise to the safe plane first (pure Z, rapid): the low entry is
      // blocked, the classic entry needs its classic height
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    }
  }
  if (fwd0 > 1e-9) {
    a += fwd0;
    moves.push({ words: { a }, feed: 0, rapid: true }); // rapid — but ROTARY time is real time
    minutes += (fwd0 / 360) / MAX_ROTARY_RPM; // Stage 0.2: charge the A re-approach
  }
  moves.push({ words: { x: c0.x, y: c0.y }, feed: 0, rapid: true });
  moves.push({ words: { z: tip0 }, feed: plungeFeed }); // pure-Z plunge (tip plane, Stage 0.4)
  minutes += Math.max(0, entryH - tip0) / plungeFeed;

  // ---- the sweep: one G93 XYZA move per remaining cell ----
  let prevCi = first;
  let prevC = c0;
  let prevP = contactAt(first, a);
  for (let k = 1; k < patch.length; k++) {
    const ci = patch[k];
    // STAGE 0.3 (spec 2026-11-13): SIGNED wrap-aware delta. The plain
    // mod-360 forward delta wrapped any BACKWARD attitude step into a
    // near-full-revolution forward move (a −4.2° step read as +355.8°) —
    // the lerped center then plowed up to the full ball radius at the
    // chord midpoint (adversary-probed 0.85–1.25mm). The walk bounds each
    // step to ≤ tol; the FOLD_PAIR guard fails loud on anything larger.
    let fwd = ((attitudeOf(ci) - attitudeOf(prevCi)) % 360 + 360) % 360;
    if (fwd > 180) fwd -= 360; // the signed shortest step, (−180, 180]
    if (Math.abs(fwd) > FOLD_PAIR_MAX_DEG + 1e-9) {
      throw new Error(
        `swarf pass attitude step ${fwd.toFixed(2)}° exceeds the folded-pair guard ${FOLD_PAIR_MAX_DEG}° — planner bug, refusing to emit`,
      );
    }
    a += fwd;
    const c = centerOf(ci);
    const p = contactAt(ci, a);
    const contactPath = Math.hypot(p.x - prevP.x, p.y - prevP.y, p.z - prevP.z);
    const centerPath = Math.hypot(c.x - prevC.x, c.y - prevC.y, c.z - prevC.z);
    const passMinutes = Math.max(
      contactPath / feed,
      centerPath / feed,
      (Math.abs(fwd) / 360) / MAX_ROTARY_RPM,
    );
    moves.push({ words: { x: c.x, y: c.y, z: tipZOf(c), a }, feed: 1 / passMinutes });
    minutes += passMinutes;
    prevCi = ci;
    prevC = c;
    prevP = p;
  }

  // ---- exit: LOCAL rise (Stage 1.2, corridor-checked) when a clip ctx
  // threads in and the way up is clear — the next strip's entry corridor
  // starts from there; else the classic safe-plane retract ----
  const last = patch[patch.length - 1];
  const cL = centerOf(last);
  const attL = attitudeOf(last);
  const tipL = tipZOf(cL);
  let exitH = safeZ;
  if (ball && o.clipCtx !== undefined) {
    const localH = tipL + (o.safeClearance ?? SAFE_CLEARANCE);
    if (localH < safeZ - 1e-9 && riseClear(o.clipCtx, cL, attL, tipL, localH, cells[last].p)) {
      exitH = localH;
    }
  }
  moves.push({ words: { z: exitH }, feed: 0, rapid: true });

  return {
    moves,
    estimatedMinutes: minutes,
    endA: a,
    exitPose: { x: cL.x, y: cL.y, zTip: exitH },
  };
}

/* ------------------------------------------------------------------ *
 * MILESTONE 5 — THE BALL WINDOW KERNEL (the general-coverage pass)
 *
 * PLAN.md: "BALL (hemisphere): a WINDOW around A\* down to a glancing
 * floor (user knob, default n_z ≈ 0.3) — the general-coverage pass
 * that cleans what the side cannot hug." One op kind, kernel picked by
 * the tool (the build order Alice confirmed) — the ball shares the map,
 * the patch segmentation, and the sweep writer; only the CONTACT
 * ENVELOPE changes:
 *
 * THE BALL ATTITUDE. The flank wants the cell's normal HORIZONTAL at
 * A\* = φ+90° (milestone 2); the ball's window is CENTERED on the
 * normal-UP attitude φ = atan2(n.y,n.z) = align − 90° (module docstring:
 * d.z' = ρcos(A−φ), maximal at A = φ) — the ball's lower pole presented
 * to the contact, tool axis directly above it. The WINDOW is the band
 * of attitudes keeping machine n'.z above the GLANCING FLOOR (default
 * 0.3): |A−φ| ≤ acos(floor/ρ), "down to a glancing floor". A cell with
 * ρ < floor (nearly-AXIAL normal) has no honest window at all — the
 * ball cannot present — and is CLIPPED, the reported unreachable class
 * (the flank's pure-X class, same honesty).
 *
 * CENTER-ONLY, WINDOW PARKED. The kernel verdicts each cell at its
 * window CENTER φ alone; a per-cell attitude search along the window
 * (clearance recovery) is the parked follow-up — her knight's field
 * test probed the sphere alone fitting 98% of the standing cells, so
 * the center carries nearly everything and the search can wait for a
 * real part that needs it.
 *
 * THE TOOL BODY. The flank's flute is a COLUMN; the ball's tool is a
 * CAPSULE — sphere r at the center C = rotate(p,φ) + r·n' (n' =
 * (n.x, 0, ρ), normal UP at φ), shaft cylinder r from C up through
 * fluteLength. CONSTRUCTED, never hand-derived (the committee lesson):
 * both endpoints are machine points rotated back through the pinned
 * indexedPointRotation(−φ) — the same isometry the flute check uses —
 * so the material-frame BVH measures true distances. Contacted-
 * neighborhood exclusion and graze epsilon identical to milestone 2.
 *
 * EMISSION reuses milestone 3 verbatim (see EmitSwarfPassOptions.
 * attitude): the walk's every decision is an attitude DIFFERENCE, and
 * the ball's constant −90° shift preserves all of them.
 * ------------------------------------------------------------------ */

/** the glancing floor default (PLAN.md: user knob, default n_z ≈ 0.3) */
export const BALL_DEFAULT_FLOOR = 0.3;

/**
 * The ball's contact attitude φ: the normal-UP angle atan2(n.y,n.z),
 * = align − 90° (the module docstring's d.z' = ρcos(A−φ) maximal at
 * A = φ — the ball's pole presented, tool axis above). One formula,
 * one place (the normalAlignDeg precedent): the clearance check and
 * the sweep writer both derive it through here.
 */
export function ballAttitudeDeg(n: { x: number; y: number; z: number }): number {
  return ((((normalAlignDeg(n) - 90) % 360) + 360) % 360);
}

/**
 * The ball tool-center machine position at a cell's own attitude φ
 * (the milestone-5 formula, exported and pinned by its own test):
 * rotate the contact point to φ (the same rotation fluteToolCenter
 * uses), then one toolR along the rotated normal — normal-UP at φ, so
 * n' = (n.x, 0, ρ) and the center sits DIRECTLY ABOVE the contact:
 *   center = rotate(p, φ) + toolR·(n.x, 0, ρ)
 * Self-contained (no attitude argument to misuse): φ derives from n,
 * unlike fluteToolCenter which takes the flank attitude as given.
 */
export function ballToolCenter(
  p: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
  toolR: number,
  axisZ: number,
): { x: number; y: number; z: number } {
  return ballToolCenterAt(p, n, toolR, axisZ, ballAttitudeDeg(n));
}

/**
 * The ball tool-center machine position at an EXPLICIT attitude, Stage 1
 * (the traces spec, 2026-11-13): center = rotate(p, attitude) +
 * toolR·n'(attitude), where n' is the machine-frame normal after the same
 * rotation — the ball touches the surface at rotate(p, attitude) from
 * that center. At attitude = φ (ballAttitudeDeg) this is exactly
 * ballToolCenter (n'y ≡ 0 there, n'z = ρ); the A-PARKING planner threads
 * attitudes off-center inside the window and the tool must follow.
 */
export function ballToolCenterAt(
  p: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
  toolR: number,
  axisZ: number,
  attitudeDeg: number,
): { x: number; y: number; z: number } {
  const th = (attitudeDeg * Math.PI) / 180;
  const cosA = Math.cos(th);
  const sinA = Math.sin(th);
  const zRel = p.z - axisZ;
  return {
    x: p.x + toolR * n.x,
    y: p.y * cosA - zRel * sinA + toolR * (n.y * cosA - n.z * sinA),
    z: p.y * sinA + zRel * cosA + axisZ + toolR * (n.y * sinA + n.z * cosA),
  };
}

export interface BallClearanceOptions {
  /** the SAME material-frame mesh the map was built from */
  positions: ArrayLike<number>;
  /** ball tool — diameter (ball Ø) and fluteLength (the shaft span
   *  above the ball, the capsule's extent) are used; a tool without
   *  fluteLength is rejected (no honest span without it) */
  tool: Tool;
  /** the map to verdict — attitudes and contacts are read per cell */
  map: ContactMapResult;
  /** stock axis height, machine Z, mm — the rotation's axis */
  axisZ: number;
  /** stock radius, mm — sizes the contact-neighborhood exclusion */
  radius: number;
  /**
   * The machine normal-z floor of the ball's window, (0,1) — the
   * "glancing floor" user knob (default BALL_DEFAULT_FLOOR = 0.3):
   * attitudes below it put the contact too near the ball's equator
   * (shaft junction), and normals with ρ < floor have no window at all.
   */
  glancingFloor?: number;
}

/**
 * Verdict every cell of the map for BALL clearance at its window center
 * φ. Returns one byte per map cell — the same FLUTE_CLEAR / FLUTE_
 * CLIPPED contract segmentContactPatches consumes. Cells with ρ <
 * floor (nearly-axial normals: no honest window) are CLIPPED on sight;
 * the rest run the same capsule-vs-mesh shapecast as the flute check.
 */
/** the two-band capsule test's shared state — one BVH per mesh, reused
 *  by ballClearanceCheck's map pass AND the Stage 1 strip planner's
 *  per-edge re-verdict (the adversaries' G3 guard: a stance parked
 *  off-center inside the window is only honest if it re-clears).
 *  STAGE 1.2: also the entry-corridor engine — makeBallClipCtx is
 *  exported so the op case can build ONE context for the whole
 *  emission and thread it into every emitSwarfPass. */
export interface BallClipCtx {
  bvh: MeshBVH;
  /** the BufferGeometry backing the BVH — dispose after the last verdict */
  geo: THREE.BufferGeometry;
  toolR: number;
  shaftR: number;
  flute: number;
  axisZ: number;
  map: ContactMapResult;
  exclusionR: number;
  segStart: THREE.Vector3;
  segMid: THREE.Vector3;
  segEnd: THREE.Vector3;
  seg: THREE.Line3;
  closest: THREE.Vector3;
  p3: THREE.Vector3;
  bb: THREE.Box3;
}

export function makeBallClipCtx(o: BallClearanceOptions): BallClipCtx {
  const toolR = o.tool.diameter / 2;
  const flute = o.tool.fluteLength;
  if (!(toolR > 0)) throw new Error('bad tool: diameter must be positive');
  if (flute === undefined || !(flute > 0)) {
    throw new Error('bad tool: fluteLength must be positive');
  }
  if (!(o.radius > 0)) throw new Error('bad stock radius: must be positive');
  // the REAL shank above the ball is wider than the ball (the carve
  // sim's own shank rule: shaftDiameter ?? diameter) — the capsule's
  // shaft band carries the wider radius or tight cells clear the model
  // while the real shank grinds (the 2026-10-31 gouge chase, H1)
  const shaftR = Math.max(toolR, (o.tool.shaftDiameter ?? o.tool.diameter) / 2);
  // the contacted-neighborhood exclusion (identical to the flute check)
  const arcPitch = (2 * Math.PI * o.radius) / o.map.nTheta;
  const exclusionR = Math.max(0.05, 0.25 * Math.min(o.map.pitchX, arcPitch));
  // the mesh BVH, built ONCE (the tool capsule moves, the model stays)
  const geo = new THREE.BufferGeometry();
  const pos = Float32Array.from(o.positions);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });
  return {
    bvh,
    geo,
    toolR,
    shaftR,
    flute,
    axisZ: o.axisZ,
    map: o.map,
    exclusionR,
    segStart: new THREE.Vector3(),
    segMid: new THREE.Vector3(),
    segEnd: new THREE.Vector3(),
    seg: new THREE.Line3(),
    closest: new THREE.Vector3(),
    p3: new THREE.Vector3(),
    bb: new THREE.Box3(),
  };
}

/**
 * The TWO-BAND capsule test for ONE cell at ONE attitude (Stage 1
 * extraction; the committee-hardened body, verbatim): the BALL band —
 * sphere toolR at the ball center C(attitude), swept C..C+toolR; the
 * SHAFT band — cylinder shaftR (the REAL shank, shaftDiameter ??
 * diameter — the carve sim's own rule) over C+toolR..C+flute. BOTH
 * machine endpoints rotate back through the pinned indexedPoint-
 * Rotation(−attitude) — constructed, the committee lesson. A single
 * WIDE radius was probed and REJECTED (clips every concave cell the
 * ball fits); the band split is the minimal honest form.
 */
function ballCellClips(ctx: BallClipCtx, ci: number, attitudeDeg: number): boolean {
  const c = ctx.map.cells[ci];
  const C = ballToolCenterAt(c.p, c.n, ctx.toolR, ctx.axisZ, attitudeDeg);
  return ballBandsClip(ctx, C, attitudeDeg, 1e-3, c.p);
}

/**
 * The shared two-band capsule-vs-mesh test at ONE machine tool pose: the
 * ball center C at machine attitude `attitudeDeg`, both bands swept up the
 * tool axis. `epsilon` is the graze allowance (band radius − closest mesh
 * distance must exceed it to count as a clip); `excludeP`, when present, is
 * a material-frame point whose contact neighborhood is legal touch, not
 * collision (the cell's own contact).
 */
function ballBandsClip(
  ctx: BallClipCtx,
  C: { x: number; y: number; z: number },
  attitudeDeg: number,
  epsilon: number,
  excludeP?: { x: number; y: number; z: number },
): boolean {
  const rotBack = indexedPointRotation(-attitudeDeg, ctx.axisZ);
  ctx.segStart.copy(rotBack({ x: C.x, y: C.y, z: C.z }));
  ctx.segMid.copy(rotBack({ x: C.x, y: C.y, z: C.z + ctx.toolR }));
  ctx.segEnd.copy(rotBack({ x: C.x, y: C.y, z: C.z + ctx.flute }));

  let hit = false;
  for (const [s, e, r] of [
    [ctx.segStart, ctx.segMid, ctx.toolR],
    [ctx.segMid, ctx.segEnd, ctx.shaftR],
  ] as const) {
    if (hit) break;
    ctx.seg.start.copy(s);
    ctx.seg.end.copy(e);
    ctx.bb.min.x = C.x - r;
    ctx.bb.max.x = C.x + r;
    ctx.bb.min.y = Math.min(s.y, e.y) - r;
    ctx.bb.max.y = Math.max(s.y, e.y) + r;
    ctx.bb.min.z = Math.min(s.z, e.z) - r;
    ctx.bb.max.z = Math.max(s.z, e.z) + r;
    ctx.bvh.shapecast({
      intersectsBounds: (box) => {
        if (hit) return false; // early-out once clipped
        if (box.max.x < ctx.bb.min.x || box.min.x > ctx.bb.max.x) return false;
        if (box.max.y < ctx.bb.min.y || box.min.y > ctx.bb.max.y) return false;
        if (box.max.z < ctx.bb.min.z || box.min.z > ctx.bb.max.z) return false;
        return true;
      },
      intersectsTriangle: (t) => {
        if (hit) return true;
        // the contacted neighborhood exclusion first (cheap): the
        // touched face's own fan is legal contact, not collision
        if (
          excludeP !== undefined &&
          t.distanceToPoint(ctx.p3.set(excludeP.x, excludeP.y, excludeP.z)) < ctx.exclusionR
        ) {
          return false;
        }
        const d = t.closestPointToSegment(ctx.seg, ctx.closest);
        // graze allowance: exact-tangent triangles are legal contact
        if (d < r - epsilon) {
          hit = true;
          return true;
        }
        return false;
      },
    });
  }
  return hit;
}

/* ------------------------------------------------------------------ *
 * STAGE 1.2 — THE ENTRY CORRIDOR (2026-11-13, the +35% recovery): the
 * chord re-verdict made every ridge split re-enter from the SAFE
 * PLANE — a full-depth plunge (measured mean 21mm at plunge feed =
 * 51% of the op's minutes) plus a ping-ponging A charge (23%). A
 * LOCAL re-entry (retract only to the strip's local exit height)
 * recovers it — but only if every leg of the lower entry is proven
 * against the mesh with the same two-band test that verdicts the
 * stances: an unchecked shortcut would be exactly the deliberate-
 * wrong-move class Stage 1.1 eliminated. Any clip anywhere in the
 * corridor → the caller falls back to the SAFE-PLANE entry.
 * ------------------------------------------------------------------ */

/**
 * The LOCAL-entry corridor: (a) the A-swing under the tool PARKED at
 * the previous strip's exit pose (the part rotates under a tip sitting
 * only clearance above where it just cut), (b) the XY hop at that exit
 * height to the new strip's first stance, (c) the final plunge down to
 * the first contact (its own fan excluded — legal contact, the same
 * allowance ballCellClips grants). Clears iff every sampled pose does.
 * SAMPLING DENSITY (the acceptance probe's lesson, 2026-11-13): ≤2° of
 * A swing and ≤0.5mm of path between samples — a 4-point check over a
 * 44mm hop left 11mm gaps and the probe measured 0.55mm bites slipping
 * through them. Anything the two-band test can see, the gate must see.
 */
const CORRIDOR_A_STEP_DEG = 2;
const CORRIDOR_PATH_STEP_MM = 0.5;

function entryCorridorClear(
  ctx: BallClipCtx,
  entry: { x: number; y: number; zTip: number },
  aFrom: number,
  fwd: number,
  att0: number,
  c0: { x: number; y: number; z: number },
  contact0: { x: number; y: number; z: number },
): boolean {
  // (a) the A-swing: attitudes aFrom → aFrom+fwd, tool parked at entry.xy
  const nA = Math.max(5, Math.ceil(Math.abs(fwd) / CORRIDOR_A_STEP_DEG));
  for (let k = 1; k <= nA; k++) {
    const att = aFrom + (fwd * k) / nA;
    if (ballBandsClip(ctx, { x: entry.x, y: entry.y, z: entry.zTip + ctx.toolR }, att, 1e-3)) {
      return false;
    }
  }
  // (b) the XY hop at the entry height, part already at the new stance
  const len = Math.hypot(c0.x - entry.x, c0.y - entry.y);
  const nXY = Math.max(5, Math.ceil(len / CORRIDOR_PATH_STEP_MM));
  for (let k = 0; k <= nXY; k++) {
    const t = k / nXY;
    const C = {
      x: entry.x + (c0.x - entry.x) * t,
      y: entry.y + (c0.y - entry.y) * t,
      z: entry.zTip + ctx.toolR,
    };
    if (ballBandsClip(ctx, C, att0, 1e-3)) return false;
  }
  // (c) the plunge: entry height → the first contact, own fan excluded
  const cTop = entry.zTip + ctx.toolR;
  const drop = Math.abs(c0.z - cTop);
  const nP = Math.max(4, Math.ceil(drop / CORRIDOR_PATH_STEP_MM));
  for (let k = 1; k <= nP; k++) {
    const C = {
      x: c0.x,
      y: c0.y,
      z: cTop + ((c0.z - cTop) * k) / nP,
    };
    if (ballBandsClip(ctx, C, att0, 1e-3, contact0)) return false;
  }
  return true;
}

/** The LOCAL-exit rise: straight up from the last contact to the local
 *  clearance height, the last cell's own fan excluded, sampled at the
 *  corridor density. Clear → the strip may exit low and hand the pose
 *  to the next strip's corridor. */
function riseClear(
  ctx: BallClipCtx,
  cLast: { x: number; y: number; z: number },
  attLast: number,
  tipLast: number,
  localH: number,
  contact: { x: number; y: number; z: number },
): boolean {
  const cBot = tipLast + ctx.toolR;
  const cTop = localH + ctx.toolR;
  const nP = Math.max(3, Math.ceil((cTop - cBot) / CORRIDOR_PATH_STEP_MM));
  for (let k = 1; k <= nP; k++) {
    const C = { x: cLast.x, y: cLast.y, z: cBot + ((cTop - cBot) * k) / nP };
    if (ballBandsClip(ctx, C, attLast, 1e-3, contact)) return false;
  }
  return true;
}

/**
 * STAGE 1.1 — the CHORD RE-VERDICT (2026-11-13, "chunks out of the horse's
 * nose"): the emitter draws ONE straight machine-space move between two
 * verified stances, and grid adjacency says nothing about the CONTACTS
 * themselves — on a thin ridge, adjacent rays land on opposite levels
 * (measured 15mm apart on her knight), both stances verify clear at the
 * SAME parked A, and the straight chord then mows straight through the
 * ridge (measured: full tool radius, deliberate-looking, unflagged — the
 * marks judge intent against standing stock, not the model). Sample the
 * interpolated center path (the emitter's own linear interpolation, both
 * bands) and refuse the step when any interior sample clips deeper than
 * CHORD_EPS: a depth NO locally-smooth step-bounded chord can produce
 * (the polyline sagitta class, measured ≤ ~0.15mm at stepOver 1.6), but
 * every measured real crossing exceeds (0.3–1.58mm). The strip breaks
 * HONESTLY — each side re-enters with its own verified plunge, the same
 * split the walk already makes at gaps and fold pairs. No exclusion: an
 * interior sample has no legal contact of its own; anything it touches
 * deeper than the sagitta allowance is unintended.
 */
const CHORD_SAMPLE_EPS = 0.3;
const CHORD_SAMPLES = [0.25, 0.5, 0.75] as const;

function ballChordClips(
  ctx: BallClipCtx,
  fromCi: number,
  fromAtt: number,
  toCi: number,
  toAtt: number,
): boolean {
  const a0 = ctx.map.cells[fromCi];
  const a1 = ctx.map.cells[toCi];
  const c0 = ballToolCenterAt(a0.p, a0.n, ctx.toolR, ctx.axisZ, fromAtt);
  const c1 = ballToolCenterAt(a1.p, a1.n, ctx.toolR, ctx.axisZ, toAtt);
  for (const t of CHORD_SAMPLES) {
    const C = {
      x: c0.x + (c1.x - c0.x) * t,
      y: c0.y + (c1.y - c0.y) * t,
      z: c0.z + (c1.z - c0.z) * t,
    };
    // the machine attitude interpolates with the move, exactly as the
    // controller replays the modal words
    const att = fromAtt + (toAtt - fromAtt) * t;
    if (ballBandsClip(ctx, C, att, CHORD_SAMPLE_EPS, undefined)) return true;
  }
  return false;
}

export function ballClearanceCheck(o: BallClearanceOptions): Uint8Array {
  const floor = o.glancingFloor ?? BALL_DEFAULT_FLOOR;
  if (!(floor > 0) || !(floor < 1)) {
    throw new Error('bad glancing floor: 0 < floor < 1');
  }
  const ctx = makeBallClipCtx(o);
  const verdict = new Uint8Array(o.map.cells.length).fill(FLUTE_CLEAR);

  for (let ci = 0; ci < o.map.cells.length; ci++) {
    const c = o.map.cells[ci];
    const nr = Math.hypot(c.n.y, c.n.z);
    // no honest window: the normal is too axial for the ball to present
    // (the flank's pure-X class, same honesty — the coverage report owns it)
    if (nr < floor) {
      verdict[ci] = FLUTE_CLIPPED;
      continue;
    }
    if (ballCellClips(ctx, ci, ballAttitudeDeg(c.n))) {
      verdict[ci] = FLUTE_CLIPPED;
    }
  }

  ctx.geo.dispose();
  return verdict;
}
