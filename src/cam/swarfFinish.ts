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
import type { Tool } from '../core/types';

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
    const backCy = cy * cosA + (cz - o.axisZ) * sinA;
    const backCz = -cy * sinA + (cz - o.axisZ) * cosA + o.axisZ;
    // BOTH ENDPOINTS rotate: the material pre-image of the vertical
    // machine column passes through the back-rotated center along the
    // back-rotated +Z axis: machine +Z rotated by −A* gives material
    // direction (0, −sinA, cosA)
    const dirY = -sinA;
    const dirZ = cosA;
    segStart.set(cx, backCy - flute * dirY, backCz - flute * dirZ);
    segEnd.set(cx, backCy + flute * dirY, backCz + flute * dirZ);
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
