/**
 * Contact map tests (PLAN.md "The true 4D finishing pass", milestone 1):
 * analytic fixtures only. A coarse 8-facet cylinder whose facet normals
 * sit EXACTLY at the facet mid-angles (tessellated-cylinder symmetry),
 * a ruled 2-lobed blade whose quad facets have hand-derivable normals
 * (radial: cross(x̂, Δradial) has zero x-component — rake exactly 0),
 * a tilted-generator twist whose facet rake is −2sinβ(R±s)·sinΔθ/|n|
 * (≈ −sinβ), an offset sphere (normals through the center), an
 * inverted-winding heal check, and air. The alignment sign is verified
 * END-TO-END through indexedPointRotation's own convention: rotating
 * each cell's NORMAL by its `align` must land it on machine −Y
 * (horizontal at the tool's flank) — the alignment applies to the
 * normal, not the hit point (the point rides wherever the geometry
 * puts it).
 *
 * Fixture notes that cost real probing to establish:
 * - nTheta = round(2πR/step) = round(25.13) = 25 for R=12, step 3 — the
 *   24-row floor is a floor, not the value.
 * - three-mesh-bvh re-indexes non-indexed geometry, so faceIndex-based
 *   normals MUST resolve through the post-build index (the module does);
 *   the healing fixture's cell-count equality is what caught the raw
 *   `positions[9·faceIndex]` misread during development.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { indexedPointRotation, indexToAlignDirection } from '../indexing';
import { buildContactMap, CONTACT_AIR, normalAlignDeg } from '../swarfFinish';

const DEG = Math.PI / 180;

/** geometry → plain array (the positions contract: non-indexed) */
function attr(g: THREE.BufferGeometry): Float32Array {
  const a = g.toNonIndexed().getAttribute('position') as THREE.BufferAttribute;
  return new Float32Array(a.array as Float32Array);
}

/** the cylinders' axis sits at machine z = 10 to exercise the offset */
const AXIS_Z = 10;

/** coarse cylinder, axis ∥ X at z = AXIS_Z, caps at x = ±length/2.
 *  NO spin: facet boundaries sit at exact multiples of 45°, and the
 *  nTheta = 25 grid puts rows at j·14.4° — row 0 lands ON a boundary
 *  (excluded from exact asserts), every other row is ≥1.8° inside a
 *  facet (facet half-width 22.5°, so `floor`-faceting is unambiguous). */
function cylinder(radius: number, length: number, segments: number): Float32Array {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments);
  g.rotateZ(Math.PI / 2); // geometry axis Y → machine X
  g.translate(0, 0, AXIS_Z);
  return attr(g);
}

/** THE CONVENTION TEST, applied per cell: rotating the cell's normal by
 *  its own align (indexedPointRotation's convention on the YZ pair)
 *  must land it horizontal on machine −Y: y' = −|n_radial|, z' = 0. */
function expectAlignsToMinusY(
  n: { x: number; y: number; z: number },
  alignDeg: number,
): void {
  const th = alignDeg * DEG;
  const y = n.y * Math.cos(th) - n.z * Math.sin(th);
  const z = n.y * Math.sin(th) + n.z * Math.cos(th);
  expect(y).toBeCloseTo(-Math.hypot(n.y, n.z), 9);
  expect(z).toBeCloseTo(0, 9);
}

const radialPart = (n: { x: number; y: number; z: number }) => Math.hypot(n.y, n.z);

describe('buildContactMap — cylinder', () => {
  const R = 5;
  const positions = cylinder(R, 20, 8);
  const map = buildContactMap({
    positions,
    x0: -9,
    x1: 9,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const dThetaDeg = 360 / map.nTheta; // 14.4°
  const sideOf = (c: (typeof map.cells)[number]) => radialPart(c.n) > 1e-6;

  it('matches the grid contract exactly (pitch half the θ step)', () => {
    expect(map.pitchX).toBe(1.5);
    expect(map.gx0).toBe(-9);
    expect(map.nx).toBe(13); // floor(18/1.5) + 1
    expect(map.nTheta).toBe(25); // round(2π·12/3) = round(25.13) — the floor is 24
    expect(map.surfaceCells).toBe(map.cells.length);
    expect(map.cellIndex.length).toBe(map.nx * map.nTheta);
    // every listed cell is reachable through the dense index, row-major
    map.cells.forEach((_, idx) => {
      expect(map.cellIndex.indexOf(idx)).toBeGreaterThanOrEqual(0);
    });
  });

  it('hits ride the facet planes at the row angles (radius exact)', () => {
    // an 8-gon's facet plane sits at the apothem a = R·cos(22.5°); a ray
    // d degrees from the facet mid hits at a/cos(d) — exact planimetry
    const apothem = R * Math.cos(22.5 * DEG);
    for (const c of map.cells) {
      const j = Math.round(c.theta / DEG / dThetaDeg) % map.nTheta;
      const rowDeg = j * dThetaDeg;
      expect(c.theta).toBeCloseTo(j * dThetaDeg * DEG, 12);
      const r = Math.hypot(c.p.y, c.p.z - AXIS_Z);
      expect(r).toBeGreaterThanOrEqual(apothem - 1e-4); // float32 mesh
      expect(r).toBeLessThanOrEqual(R + 1e-4);
      if (j === 0) continue; // row 0 rides a facet boundary: geometry ties
      const k = Math.floor(rowDeg / 45);
      const off = rowDeg - (k * 45 + 22.5);
      expect(r).toBeCloseTo(apothem / Math.cos(off * DEG), 4);
    }
  });

  it('align is the hand-derived facet-mid-angle + 90, exact', () => {
    for (const c of map.cells) {
      if (!sideOf(c)) continue;
      const j = Math.round(c.theta / DEG / dThetaDeg) % map.nTheta;
      const rowDeg = j * dThetaDeg;
      if (j === 0) continue; // boundary row: either facet is a fair hit
      const k = Math.floor(rowDeg / 45);
      const mid = k * 45 + 22.5;
      expect(c.align).toBeCloseTo((mid + 90) % 360, 4);
    }
  });

  it('rotating each normal by its align lands it on machine −Y (the sign proof)', () => {
    for (const c of map.cells) {
      if (!sideOf(c)) continue;
      expectAlignsToMinusY(c.n, c.align);
    }
  });

  it('end-to-end through indexedPointRotation: align points the normal at the flank', () => {
    for (const c of map.cells) {
      if (!sideOf(c)) continue;
      // indexedPointRotation maps POINTS (it offsets the axis), so hand
      // it a point that encodes the direction: (0, n.y, AXIS_Z + n.z)
      const rot = indexedPointRotation(c.align, AXIS_Z)({ x: 0, y: c.n.y, z: AXIS_Z + c.n.z });
      expect(rot.y).toBeCloseTo(-1, 6); // unit radial normal → straight at the tool
      expect(rot.z).toBeCloseTo(AXIS_Z, 6); // horizontal (axis height)
    }
  });

  it('rake is 0 everywhere on the side (radial normals, no X tilt)', () => {
    for (const c of map.cells) {
      if (!sideOf(c)) continue;
      expect(c.rake).toBeCloseTo(0, 9);
      expect(c.n.x).toBeCloseTo(0, 9);
    }
  });

  it('cross-check: align = indexToAlignDirection(n) + 90 (pinned relation)', () => {
    for (const c of map.cells) {
      expect(c.align).toBeCloseTo(
        (((indexToAlignDirection(c.n) + 90) % 360) + 360) % 360,
        6,
      );
    }
  });

  it('normalAlignDeg agrees with the per-cell align', () => {
    for (const c of map.cells) {
      expect(c.align).toBe(normalAlignDeg(c.n));
    }
  });
});

describe('buildContactMap — twisted blade (ruled, 2-lobed)', () => {
  // R(θ) = R0 + amp·sin2θ as a quad strip: vertices at (k+½)·dTh so the
  // grid rows (j·dTh) sit exactly on facet MIDS — deepest point of each
  // facet, unambiguous hits. Facet normal ∝ cross(x̂, Δradial):
  // exactly (0, −Δz, Δy) — rake EXACTLY 0 (float-exact before normalize).
  const R0 = 6;
  const AMP = 1;
  const N = 90;
  const dTh = (2 * Math.PI) / N;
  const radius = R0; // stock radius = lobe mean: nTheta = N rows align with facets
  const thetaStepOver = (2 * Math.PI * radius) / N;

  const ring = (theta: number): [number, number] => [
    (R0 + AMP * Math.sin(2 * theta)) * Math.sin(theta),
    (R0 + AMP * Math.sin(2 * theta)) * Math.cos(theta),
  ];

  const pos: number[] = [];
  for (let j = 0; j < N; j++) {
    const [y0, z0] = ring((j + 0.5) * dTh);
    const [y1, z1] = ring((j + 1.5) * dTh);
    // quad A(x0,y0,z0) B(x1,y0,z0) D(x0,y1,z1) C(x1,y1,z1): outward
    pos.push(-4, y0, z0, 4, y0, z0, -4, y1, z1);
    pos.push(4, y0, z0, 4, y1, z1, -4, y1, z1);
  }

  const map = buildContactMap({
    positions: new Float32Array(pos),
    x0: -3.9,
    x1: 3.9, // strictly inside the sheet span: every column hits, no edge ties
    radius,
    axisZ: 0,
    thetaStepOver,
  });

  it('rows = sheet facets: a complete map, no air', () => {
    expect(map.nTheta).toBe(N);
    expect(map.surfaceCells).toBe(map.nx * map.nTheta);
    expect(map.nx).toBe(38); // floor(7.8/0.20944) + 1
  });

  it('normals are the exact facet normals (radial, rake exactly 0)', () => {
    for (const c of map.cells) {
      const j = Math.round(c.theta / dTh) % N;
      const [y0, z0] = ring((j - 0.5) * dTh);
      const [y1, z1] = ring((j + 0.5) * dTh);
      const ny = -(z1 - z0);
      const nz = y1 - y0;
      const len = Math.hypot(ny, nz);
      expect(c.n.x).toBeCloseTo(0, 12); // cross(x̂, ·) has zero x — exact
      expect(c.rake).toBeCloseTo(0, 12);
      expect(c.n.y).toBeCloseTo(ny / len, 5); // float32 mesh: ~7e-7 noise
      expect(c.n.z).toBeCloseTo(nz / len, 5);
      expectAlignsToMinusY(c.n, c.align);
    }
  });

  it('align varies with θ per the analytic formula (not constant)', () => {
    // the 2-lobe modulation makes φ ≠ θ row by row: align − (row + 90)
    // swings nonzero and reverses sign across the lobe
    let minDev = Infinity;
    let maxDev = -Infinity;
    for (const c of map.cells) {
      const rowDeg = (c.theta / DEG) % 360;
      let dev = c.align - ((((rowDeg + 90) % 360) + 360) % 360);
      if (dev > 180) dev -= 360;
      if (dev < -180) dev += 360;
      minDev = Math.min(minDev, dev);
      maxDev = Math.max(maxDev, dev);
    }
    expect(maxDev - minDev).toBeGreaterThan(1); // degrees: real geometric variation
  });
});

describe('buildContactMap — true twist (tilted generators, rake ≠ 0)', () => {
  // generators tilted by β within the (x, radial) plane: continuum
  // normal ∝ (−sinβ, cosβ·sinθ, cosβ·cosθ) — facet rake converges to
  // −sinβ (hand-derived: the facet cross gives n_x = −2sinβ(R±s)sinΔθ
  // against |n| = 4(R±s)sin(Δθ/2)·sqrt(sin²βcos²(Δθ/2)+cos²β)).
  // Vertices sit at (j+½)·dTh so the grid rows land on facet MIDS —
  // rows on facet boundaries tie between mirrored facets whose rakes
  // are ∓sinβ (probed: exactly the θ=90° row went positive there).
  const BETA = 8 * DEG;
  const R = 6;
  const N = 120;
  const dTh = (2 * Math.PI) / N;
  const C = 0.5; // generator band centered at x = C

  const pt = (u: number, theta: number): [number, number, number] => [
    C + u * Math.cos(BETA),
    (R + u * Math.sin(BETA)) * Math.sin(theta),
    (R + u * Math.sin(BETA)) * Math.cos(theta),
  ];

  const pos: number[] = [];
  for (let j = 0; j < N; j++) {
    const A = pt(-1, (j + 0.5) * dTh);
    const B = pt(1, (j + 0.5) * dTh);
    const D = pt(-1, (j + 1.5) * dTh);
    const Cc = pt(1, (j + 1.5) * dTh);
    pos.push(...A, ...B, ...D);
    pos.push(...B, ...Cc, ...D);
  }

  const map = buildContactMap({
    positions: new Float32Array(pos),
    x0: -5.5,
    x1: 5.5,
    radius: 12,
    axisZ: 0,
    thetaStepOver: (2 * Math.PI * 12) / N, // nTheta = N
  });

  it('only columns near the band hit; the rest is air', () => {
    expect(map.surfaceCells).toBeGreaterThan(0);
    expect(map.surfaceCells).toBeLessThan(map.nx * map.nTheta);
    for (const c of map.cells) {
      // radial rays carry no x: hits land exactly inside the band's
      // x-extent [C − cosβ, C + cosβ]
      expect(c.p.x).toBeGreaterThanOrEqual(C - Math.cos(BETA) - 1e-4);
      expect(c.p.x).toBeLessThanOrEqual(C + Math.cos(BETA) + 1e-4);
    }
  });

  it('rake matches sin(tilt) analytically (facet error bounded)', () => {
    for (const c of map.cells) {
      // mid-row hits: facet rake = −2sinβ(R±s)sinΔθ / |n| — within
      // 4e-4 of −sinβ at Δθ = 3° (probed: float32 mesh adds ~4e-5)
      expect(c.rake).toBeLessThan(-Math.sin(BETA) + 5e-4);
      expect(c.rake).toBeGreaterThan(-Math.sin(BETA) - 5e-4);
      expect(Math.hypot(c.n.x, c.n.y, c.n.z)).toBeCloseTo(1, 9);
      expectAlignsToMinusY(c.n, c.align);
    }
  });

  it('align points the tilted normal at the flank, axial part stripped', () => {
    // rotation about X cannot remove the rake; it aligns the YZ angle
    for (const c of map.cells) {
      const rot = indexedPointRotation(c.align, 0)({ x: 0, y: c.n.y, z: c.n.z });
      expect(rot.y).toBeCloseTo(-radialPart(c.n), 9);
      expect(rot.z).toBeCloseTo(0, 9);
    }
  });
});

describe('buildContactMap — sphere offset from the axis', () => {
  // sphere Ø8 centered at (x = −8, y = 0, z = axisZ + 1): normals pass
  // through the center; the +1 offset keeps every outward ray on the
  // near side hitting the sphere body (worst case: glancing at the rim)
  const RS = 4;
  const CX = -8;
  const CY = 0;
  const CZ = AXIS_Z + 1;
  const g = new THREE.SphereGeometry(RS, 32, 16);
  g.translate(CX, CY, CZ);
  const map = buildContactMap({
    positions: attr(g),
    x0: -12,
    x1: 12,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });

  it('hits exist and only within the sphere x-extent', () => {
    expect(map.surfaceCells).toBeGreaterThan(0);
    for (const c of map.cells) {
      expect(c.p.x).toBeGreaterThan(CX - RS - 1e-6);
      expect(c.p.x).toBeLessThan(CX + RS + 1e-6);
    }
  });

  it('normals pass through the sphere center (within facet error)', () => {
    for (const c of map.cells) {
      const vx = c.p.x - CX;
      const vy = c.p.y - CY;
      const vz = c.p.z - CZ;
      const d = Math.hypot(vx, vy, vz);
      // the facet normal is exact at the facet centroid; the hit point
      // can sit at a facet corner, and the sphere's radial turns across
      // a facet by up to ~half the facet span at the corner — probed
      // worst deviation 11.7° on the 32×16 mesh; 15° is the bound
      const cos = (c.n.x * vx + c.n.y * vy + c.n.z * vz) / d;
      expect(cos).toBeGreaterThan(Math.cos(15 * DEG));
    }
  });

  it('align matches the center-offset analytic within facet error', () => {
    for (const c of map.cells) {
      const analytic = normalAlignDeg({ x: 0, y: c.p.y - CY, z: c.p.z - CZ });
      let dev = c.align - analytic;
      if (dev > 180) dev -= 360;
      if (dev < -180) dev += 360;
      // same facet-corner bound as the radial check above
      expect(Math.abs(dev)).toBeLessThan(15);
      expectAlignsToMinusY(c.n, c.align);
    }
  });

  it('cross-check pinned here too: align = indexToAlignDirection(n) + 90', () => {
    for (const c of map.cells) {
      expect(c.align).toBeCloseTo(
        (((indexToAlignDirection(c.n) + 90) % 360) + 360) % 360,
        6,
      );
    }
  });
});

describe('buildContactMap — normal healing', () => {
  const healthy = cylinder(5, 20, 8);
  const inverted = (() => {
    // flip every triangle's winding (swap vertices 1 and 2)
    const out = new Float32Array(healthy.length);
    for (let t = 0; t < healthy.length; t += 9) {
      out.set(healthy.subarray(t, t + 3), t);
      out.set(healthy.subarray(t + 6, t + 9), t + 3);
      out.set(healthy.subarray(t + 3, t + 6), t + 6);
    }
    return out;
  })();

  const opts = { x0: -9, x1: 9, radius: 12, axisZ: AXIS_Z, thetaStepOver: 3 } as const;

  it('the inverted-winding map equals the healthy map (ray opposition heals)', () => {
    const a = buildContactMap({ positions: healthy, ...opts });
    const b = buildContactMap({ positions: inverted, ...opts });
    // same hit set (DoubleSide is winding-blind), same normals (the heal
    // resolves each hit triangle against the ray), same everything
    expect(b.surfaceCells).toBe(a.surfaceCells);
    expect(b.cells.length).toBe(a.cells.length);
    for (let i = 0; i < a.cells.length; i++) {
      expect(b.cells[i].p.x).toBeCloseTo(a.cells[i].p.x, 9);
      expect(b.cells[i].p.y).toBeCloseTo(a.cells[i].p.y, 9);
      expect(b.cells[i].p.z).toBeCloseTo(a.cells[i].p.z, 9);
      expect(b.cells[i].n.x).toBeCloseTo(a.cells[i].n.x, 9);
      expect(b.cells[i].n.y).toBeCloseTo(a.cells[i].n.y, 9);
      expect(b.cells[i].n.z).toBeCloseTo(a.cells[i].n.z, 9);
      expect(b.cells[i].align).toBeCloseTo(a.cells[i].align, 9);
      expect(b.cells[i].rake).toBeCloseTo(a.cells[i].rake, 9);
    }
    expect(Array.from(b.cellIndex)).toEqual(Array.from(a.cellIndex));
    // and the healed map is OUTWARD: spot the +Z row — its normal must
    // point +Z (an unresolved winding would give ± at random)
    for (const c of a.cells) {
      if (radialPart(c.n) < 1e-6) continue;
      const φ = Math.atan2(c.n.y, c.n.z); // radial direction's angle
      const θ = c.theta;
      expect(Math.cos(φ - θ)).toBeGreaterThan(0.9); // normal ≈ the row's radial
    }
  });
});

describe('buildContactMap — air cells', () => {
  // a short thin cylinder in a long stock: columns beyond ±3 are air
  const map = buildContactMap({
    positions: cylinder(3, 6, 32),
    x0: -12,
    x1: 12,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });

  it('air slots are CONTACT_AIR and the count reconciles', () => {
    let air = 0;
    for (let k = 0; k < map.cellIndex.length; k++) {
      if (map.cellIndex[k] === CONTACT_AIR) air++;
    }
    expect(air).toBe(map.nx * map.nTheta - map.surfaceCells);
    expect(air).toBeGreaterThan(0);
  });

  it('listed cells all sit within the model span', () => {
    for (const c of map.cells) {
      expect(Math.abs(c.p.x)).toBeLessThanOrEqual(3 + 1e-6);
    }
  });
});

describe('buildContactMap — parameter validation', () => {
  const good = cylinder(3, 6, 32);
  const base = { positions: good, x0: -12, x1: 12, radius: 12, axisZ: 0, thetaStepOver: 3 };

  it('empty span throws', () => {
    expect(() => buildContactMap({ ...base, x0: 5, x1: 5 })).toThrow(/span/);
    expect(() => buildContactMap({ ...base, x0: 6, x1: 5 })).toThrow(/span/);
  });

  it('bad radius throws', () => {
    expect(() => buildContactMap({ ...base, radius: 0 })).toThrow(/radius/);
    expect(() => buildContactMap({ ...base, radius: -3 })).toThrow(/radius/);
  });

  it('bad thetaStepOver throws', () => {
    expect(() => buildContactMap({ ...base, thetaStepOver: 0 })).toThrow(/thetaStepOver/);
    expect(() => buildContactMap({ ...base, thetaStepOver: -1 })).toThrow(/thetaStepOver/);
  });
});

/* ------------------------------------------------------------------ *
 * MILESTONE 2 — the flute column-clearance check
 * ------------------------------------------------------------------ */

import {
  emitSwarfPass,
  fluteClearanceCheck,
  fluteToolCenter,
  FLUTE_CLEAR,
  FLUTE_CLIPPED,
  segmentContactPatches,
} from '../swarfFinish';

const TOOL = (d: number, flute: number) => ({
  id: 't',
  name: 't',
  type: 'flat' as const,
  diameter: d,
  spindleRpm: 1000,
  fluteLength: flute,
});

describe('fluteClearanceCheck — the tool-center sign (test 5)', () => {
  // THE SIGN FIXTURE is a VERTICAL WALL (a box's side face), not a
  // cylinder: a vertical ruling keeps the flute column PARALLEL to the
  // touched face at a constant toolR — the one convex case that is
  // genuinely clear at every height. A convex cylinder is pathological
  // by geometry (a vertical tangent line to a circle re-approaches the
  // circle within any long span — probed: the sqrt(R²−dz²) sagitta), so
  // "convex ⇒ clear" is false and the wall is the honest pin.
  // box: x −6..6, y −8..−2, z AXIS_Z−6..AXIS_Z+6 (the +Y face is the wall)
  const R = 12;
  const positions = attr(new THREE.BoxGeometry(12, 6, 12).translate(0, -5, AXIS_Z));
  const map = buildContactMap({
    positions,
    x0: -5.5,
    x1: 5.5,
    radius: R,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  // wall cells: normal +y (material theta = 90°), rake 0, hit at y = −2
  const wallIdx = map.cells
    .map((c, i) => (c.n.y > 0.99 ? i : -1))
    .filter((i) => i >= 0);

  it('has wall cells (fixture sanity)', () => {
    expect(wallIdx.length).toBeGreaterThan(10);
    for (const i of wallIdx) {
      const c = map.cells[i];
      expect(c.rake).toBeCloseTo(0, 9);
      expect(c.align).toBeCloseTo(180, 5); // atan2(1,0)+90
    }
  });

  it('contact exactly toolR from the axis, axis on the +normal side', () => {
    const toolR = 2;
    for (const c of map.cells) {
      if (Math.hypot(c.n.y, c.n.z) < 1e-9) continue; // pure-X: align meaningless
      const cen = fluteToolCenter(c.p, c.n, c.align, toolR, AXIS_Z);
      const rot = indexedPointRotation(c.align, AXIS_Z)(c.p);
      // the rotated normal is exactly machine −Y horizontally
      const th = c.align * DEG;
      const ny = c.n.y * Math.cos(th) - c.n.z * Math.sin(th);
      const nz = c.n.y * Math.sin(th) + c.n.z * Math.cos(th);
      expect(ny).toBeCloseTo(-Math.hypot(c.n.y, c.n.z), 9);
      expect(nz).toBeCloseTo(0, 9);
      // horizontal distance from the axis to the contact = exactly toolR
      expect(Math.hypot(cen.x - rot.x, cen.y - rot.y)).toBeCloseTo(toolR, 9);
      // the axis sits on the OUTWARD (+rotated-normal) side
      expect(cen.x - rot.x).toBeCloseTo(toolR * c.n.x, 9);
      expect(cen.y - rot.y).toBeCloseTo(-toolR, 9);
      // center z equals the rotated contact z (n'.z ≡ 0)
      expect(cen.z).toBeCloseTo(rot.z, 9);
    }
  });

  it('a vertical wall is CLEAR for every wall cell (the sign, end-to-end)', () => {
    // tool Ø3 (R 1.5) against the wall: a 0.5 gap everywhere along the
    // column — any CLIP here means the center landed on the wrong side
    // (the inward sign buried the axis in the wall: probed)
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(3, 8),
      map,
      axisZ: AXIS_Z,
      radius: R,
    });
    expect(wallIdx.length).toBeGreaterThan(0);
    for (const i of wallIdx) {
      expect(v[i]).toBe(FLUTE_CLEAR);
    }
  });
});

describe('fluteClearanceCheck — the propeller (two parallel blades, test 2)', () => {
  // TWO blades on one hub, both ruled along X: each blade is a flat
  // radial plate (thickness T, span x −3..3, radii R0..R1), the pair at
  // 120° mid-plane separation.
  //
  // THE 2026-10-31 COMMITTEE CORRECTION (5-0, probes in the session
  // record): this fixture's original pins said plate B was entirely
  // CLIPPED ("its columns sweep into A") — measured under the
  // milestone-2 sign slip (0, −sinA*, cosA*), whose MIRRORED segment
  // pierces blade B's OWN BODY (min distance 0.000 on all 12 B cells)
  // and passes 1.172 from plate A. The honest column is tangent to B's
  // own faces at exactly toolR (3.000, legal contact) and ≥3.634 mm
  // from plate A at every B attitude (aligns 30/210/300 — NOT the
  // "A* ≈ 0–50°" the old comment claimed). The old "brute-force
  // verified 24/24" was CIRCULAR: it dense-sampled the same
  // back-rotated segment the code built, not an independent
  // machine-frame oracle (an oracle would have flagged the bare convex
  // cylinder reading 325/325 CLIPPED as physically impossible). Both
  // blades are swarfable; the fixture keeps its second job — the
  // plates still never MERGE into one patch (attitude tolerance
  // separates them, segmentation's own test).
  const T = 2; // plate thickness (perpendicular to the mid-plane)
  const R0 = 5; // inner radius (root)
  const R1 = 10; // outer tip

  // One blade = a flat radial slab: a planar plate of thickness T whose
  // mid-plane contains the X axis at material angle α (the plane spanned
  // by x̂ and n̂α, n̂α = (0, sinα, cosα)); its two FACES are the planes
  // offset ±T/2 along n̂α, with outward normals ∓... ±n̂α. Strips in
  // radius, x from −3 to 3, faces + root/tip caps, consistent winding
  // (verified by the map's healed normals in the sanity test).
  function plate(alphaDeg: number): number[] {
    const a = alphaDeg * DEG;
    const pos: number[] = [];
    const pt = (r: number, s: number, x: number): [number, number, number] => [
      x,
      r * Math.sin(a) + s * Math.cos(a),
      r * Math.cos(a) - s * Math.sin(a),
    ];
    const h = T / 2;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const rA = R0 + ((R1 - R0) * k) / N;
      const rB = R0 + ((R1 - R0) * (k + 1)) / N;
      const A0 = pt(rA, -h, -3), A1 = pt(rA, -h, 3), B0 = pt(rB, -h, -3), B1 = pt(rB, -h, 3);
      const C0 = pt(rA, h, -3), C1 = pt(rA, h, 3), D0 = pt(rB, h, -3), D1 = pt(rB, h, 3);
      pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1); // face s=−h, outward −n̂α
      pos.push(...C0, ...C1, ...D0, ...C1, ...D1, ...D0); // face s=+h, outward +n̂α
      pos.push(...A0, ...C0, ...A1, ...A1, ...C0, ...C1); // root cap r=R0
      pos.push(...B0, ...B1, ...D0, ...B1, ...D1, ...D0); // tip cap r=R1
    }
    return pos;
  }

  const GAP_DEG = 120; // between mid-planes: 60° of clear air per side
  const positions = new Float32Array([...plate(0), ...plate(GAP_DEG)]);
  const map = buildContactMap({
    positions,
    x0: -2.9,
    x1: 2.9,
    radius: 12,
    axisZ: 0,
    thetaStepOver: 3,
  });

  // VERDICT (independently re-measured 2026-10-31, committee): both
  // plates entirely swarfable — every contact's honest column is
  // tangent to its own body at exactly toolR (legal contact, the graze
  // epsilon's job) and ≥3.634 mm from the twin plate. The 120°
  // ROTATION SYMMETRY makes anything else impossible: an isometry maps
  // blade A onto blade B, so a correct check MUST give them identical
  // verdicts (the old sign's A-clear/B-clipped split was the mirror
  // artifact itself).
  const plateCells = (mid: number) =>
    map.cells
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        const md = ((((Math.atan2(c.p.y, c.p.z) * 180) / Math.PI) % 360) + 360) % 360;
        const rel = Math.abs(((md - mid + 540) % 360) - 180);
        return rel < 60;
      });

  it('blade A: every cell CLEAR (its columns swing clear of B)', () => {
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const a = plateCells(0);
    expect(a.length).toBeGreaterThan(0);
    for (const { i } of a) expect(v[i]).toBe(FLUTE_CLEAR);
  });

  it('blade B: every cell CLEAR — the twin does not clip it (the sign-slip correction)', () => {
    // the committee re-derivation: B's honest columns are tangent to
    // B's own body (3.000 = toolR, legal contact) and ≥3.634 from A.
    // Under the old mirrored segment they read CLIPPED 12/12 by
    // piercing B's OWN body — the artifact the old pin enshrined.
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const a = plateCells(0);
    const b = plateCells(GAP_DEG);
    expect(b.length).toBeGreaterThan(0);
    // THE SYMMETRY PIN (member 5): a 120°-rotation-symmetric fixture
    // must give both blades IDENTICAL verdicts — any future sign or
    // mirror slips asymmetrically and fails here instantly, no
    // geometry knowledge required.
    expect(a.length).toBe(b.length);
    for (let k = 0; k < b.length; k++) {
      expect(v[b[k].i]).toBe(FLUTE_CLEAR);
      expect(v[b[k].i]).toBe(v[a[k].i]); // equivariance
    }
  });

  it('the B verdict is tool-size independent (CLEAR at Ø2 as at Ø6)', () => {
    // the tangent contact scales with the tool: Ø2's column stands 1 mm
    // out and clears 3.634−2 mm of A besides — CLEAR at any diameter,
    // the same independence the old pin claimed for its phantom clip.
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(2, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const b = plateCells(GAP_DEG);
    for (const { i } of b) expect(v[i]).toBe(FLUTE_CLEAR);
  });
});

describe('fluteClearanceCheck — the curved cylinder (the segment-direction regression)', () => {
  // THE 2026-10-31 REGRESSION (caught by the milestone-4 generation
  // wiring, adjudicated by committee 5-0): the flute segment's material
  // direction carried a sign slip — (0, −sinA*, cosA*) instead of
  // (0, +sinA*, cosA*) — that vanished at attitudes 0/180 (sin = 0:
  // every planar fixture in this suite) and MIRRORED the segment at
  // every other attitude. The mirrored line dives THROUGH the mesh:
  // this bare convex cylinder — the one geometry a vertical flute
  // column clears BY CONSTRUCTION — read ALL-CLIPPED (728/728 on the
  // wiring fixture). The honest pre-image is the vertical machine line
  // back-rotated: PARALLEL to the touched facet's plane at exactly
  // toolR. Fixed by CONSTRUCTION (indexedPointRotation of the column's
  // two machine endpoints — no hand sign to slip).
  //
  // THE ROW-0 RESIDUAL (committee member 4's finding, corroborated 2+3):
  // the θ=0 ray runs exactly along a facet-boundary edge; the BVH
  // tie-break can hand buildContactMap the FAR side's hit from inside,
  // and the heal step then flips that interior hit's normal INWARD — a
  // corrupt p/n pair (measured: contact at the bottom, normal 174° off
  // radial, outward sanity −4.98) whose stance genuinely fouls the far
  // wall. That is a SEPARATE buildContactMap edge-grazing defect,
  // sign-independent (identical counts under both signs), FILED for its
  // own fix (a ray nudge off exact facet boundaries) — these pins
  // document the artifact class so it cannot hide again, and the
  // honest-region guarantee (rows ≥ 1: zero clips) stays guarded.
  const positions = cylinder(5, 20, 32);
  const map = buildContactMap({
    positions,
    x0: -9,
    x1: 9,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const clippedCellsOf = (v: Uint8Array) => {
    const out: number[] = [];
    for (let i = 0; i < v.length; i++) if (v[i] === FLUTE_CLIPPED) out.push(i);
    return out;
  };

  it('contact sanity: every non-boundary-row normal points outward (the map, pre-verdict)', () => {
    // MEMBER 4'S PIN: (p − axis)·n ≥ 0 for a body convex about the
    // axis. The row-0 boundary-tie cells VIOLATE it (the filed
    // artifact); every other row must hold — the honest region's map
    // data is sound.
    for (const c of map.cells) {
      const radialDot = c.p.y * c.n.y + (c.p.z - AXIS_Z) * c.n.z;
      const row = gridPosOf(map, map.cells.indexOf(c)).j;
      if (row === 0) continue; // the boundary-tie row: artifact filed above
      expect(radialDot).toBeGreaterThan(-1e-6);
    }
  });

  it('the convex 32-gon side: ZERO clips outside the row-0 boundary-tie artifact', () => {
    expect(map.surfaceCells).toBe(13 * 25); // full grid, no air
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 20),
      map,
      axisZ: AXIS_Z,
      radius: 12,
    });
    const clipped = clippedCellsOf(v);
    // THE HONEST COUNTS (committee-measured): 6 clips, every one row
    // j=0 (the filed artifact); pre-fix (mirrored segment): 325/325.
    expect(clipped.length).toBe(6);
    for (const ci of clipped) expect(gridPosOf(map, ci).j).toBe(0);
    // and the honest region is exactly clean
    for (let ci = 0; ci < v.length; ci++) {
      if (gridPosOf(map, ci).j === 0) continue;
      expect(v[ci]).toBe(FLUTE_CLEAR);
    }
  });

  it('coarser tessellation too (an 8-gon): the tangent survives fat facets', () => {
    // 45° facets: the fattest normal ambiguity the grid samples. Same
    // shape: row-0 artifact only (measured 3), honest region clean.
    const pos8 = cylinder(5, 20, 8);
    const map8 = buildContactMap({
      positions: pos8,
      x0: -9,
      x1: 9,
      radius: 12,
      axisZ: AXIS_Z,
      thetaStepOver: 3,
    });
    const v = fluteClearanceCheck({
      positions: pos8,
      tool: TOOL(6, 20),
      map: map8,
      axisZ: AXIS_Z,
      radius: 12,
    });
    const clipped = clippedCellsOf(v);
    expect(clipped.length).toBe(3);
    for (const ci of clipped) expect(gridPosOf(map8, ci).j).toBe(0);
    for (let ci = 0; ci < v.length; ci++) {
      if (gridPosOf(map8, ci).j === 0) continue;
      expect(v[ci]).toBe(FLUTE_CLEAR);
    }
  });
});

describe('fluteClearanceCheck — test 3, blade thinner than the tool', () => {
  // ONE blade only (no second blade): t∈[−1,1], r∈[5,10]. What is
  // physically true for both faces of a blade THINNER than the tool?
  // The tool's column stands toolR OUTSIDE the touched face; the
  // blade's OPPOSITE face lies T behind the touched one — the distance
  // from the column to the opposite face is toolR + T, which EXCEEDS
  // toolR for any T > 0: the opposite face of the SAME blade can never
  // clip its own face contact. (The milestone-1 worry "thin blade ⇒
  // both faces unswarfable" is FALSE for the face pair; only root/tip
  // edges and NEIGHBORING geometry clip.) Pin exactly that.
  const R0 = 5;
  const R1 = 10;
  function slab(alphaDeg: number, t0: number, t1: number, r0: number, r1: number): number[] {
    const a = alphaDeg * DEG;
    const pos: number[] = [];
    const pt = (r: number, s: number, x: number): [number, number, number] => [
      x,
      r * Math.sin(a) + s * Math.cos(a),
      r * Math.cos(a) - s * Math.sin(a),
    ];
    const N = 24;
    for (let k = 0; k < N; k++) {
      const rA = r0 + ((r1 - r0) * k) / N;
      const rB = r0 + ((r1 - r0) * (k + 1)) / N;
      const A0 = pt(rA, t0, -3), A1 = pt(rA, t0, 3), B0 = pt(rB, t0, -3), B1 = pt(rB, t0, 3);
      const C0 = pt(rA, t1, -3), C1 = pt(rA, t1, 3), D0 = pt(rB, t1, -3), D1 = pt(rB, t1, 3);
      pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1);
      pos.push(...C0, ...C1, ...D0, ...C1, ...D1, ...D0);
      pos.push(...A0, ...C0, ...A1, ...A1, ...C0, ...C1);
      pos.push(...B0, ...B1, ...D0, ...B1, ...D1, ...D0);
      pos.push(...A0, ...A1, ...C0, ...C0, ...A1, ...C1);
      pos.push(...B0, ...D0, ...B1, ...B1, ...D0, ...D1);
    }
    return pos;
  }
  // stock R 15 grid 36 rows so θ rows at ±10° land ON the faces
  const STEP = (2 * Math.PI * 15) / 36;
  const positions = new Float32Array(slab(0, -1, 1, R0, R1));
  const map = buildContactMap({
    positions,
    x0: -2.9,
    x1: 2.9,
    radius: 15,
    axisZ: 0,
    thetaStepOver: STEP,
  });

  it('both faces CLEAR with a tool much fatter than the blade', () => {
    // Ø12 (R6) against a 2 mm blade: 3× fatter — the opposite face is
    // 8 mm from the column (toolR + T): still never clips. Face cells
    // sampled at r_local = 5.67 (rows ±10°, pinned in fixture math).
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(12, 20),
      map,
      axisZ: 0,
      radius: 15,
    });
    for (let i = 0; i < map.cells.length; i++) {
      const t = map.cells[i].p.y; // α=0: local t = machine y
      if (Math.abs(Math.abs(t) - 1) < 1e-3) {
        expect(v[i]).toBe(FLUTE_CLEAR);
      }
    }
  });
});

describe('fluteClearanceCheck — test 4, blade overhanging a base plate', () => {
  // The blade's −t̂ face at its A* (align 0 — the −t̂ normal is machine
  // −Y, so NO rotation): the tool column stands at y = −(1 + toolR)·?
  // center y = contact y − toolR = −1 − 3 = −4, i.e. ON the plane of a
  // base whose +t̂ face lies at t = −4−d: the column rides the base's
  // face plane at distance d. CLIP iff d < toolR (the flute's z-span
  // covers the base's z-band for the flute values used — pinned via d).
  // +t̂ face contacts: their column at the base is ≥ 3 + d away AND its
  // z-span never reaches (analytic: column z ∈ [−13.7, 2.3] vs base
  // z ≥ 5) → CLEAR.
  const N = 24;
  function slab(alphaDeg: number, t0: number, t1: number, r0: number, r1: number): number[] {
    const a = alphaDeg * DEG;
    const pos: number[] = [];
    const pt = (r: number, s: number, x: number): [number, number, number] => [
      x,
      r * Math.sin(a) + s * Math.cos(a),
      r * Math.cos(a) - s * Math.sin(a),
    ];
    for (let k = 0; k < N; k++) {
      const rA = r0 + ((r1 - r0) * k) / N;
      const rB = r0 + ((r1 - r0) * (k + 1)) / N;
      const A0 = pt(rA, t0, -3), A1 = pt(rA, t0, 3), B0 = pt(rB, t0, -3), B1 = pt(rB, t0, 3);
      const C0 = pt(rA, t1, -3), C1 = pt(rA, t1, 3), D0 = pt(rB, t1, -3), D1 = pt(rB, t1, 3);
      pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1);
      pos.push(...C0, ...C1, ...D0, ...C1, ...D1, ...D0);
      pos.push(...A0, ...C0, ...A1, ...A1, ...C0, ...C1);
      pos.push(...B0, ...B1, ...D0, ...B1, ...D1, ...D0);
      pos.push(...A0, ...A1, ...C0, ...C0, ...A1, ...C1);
      pos.push(...B0, ...D0, ...B1, ...B1, ...D0, ...D1);
    }
    return pos;
  }
  const STEP = (2 * Math.PI * 15) / 36; // 36 rows, one every 10°: rows ±10 hit the faces
  const faceCellsOf = (m: ReturnType<typeof buildContactMap>, alignDeg: number) =>
    m.cells
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => Math.abs(Math.abs(c.p.y) - 1) < 1e-3 && c.align === alignDeg);

  it('base flush under the column (d=0): −t̂ face CLIPPED, +t̂ face CLEAR', () => {
    const positions = new Float32Array([
      ...slab(0, -1, 1, 5, 15),
      ...slab(0, -6, -4, 5, 16),
    ]);
    const map = buildContactMap({
      positions,
      x0: -2.9,
      x1: 2.9,
      radius: 15,
      axisZ: 0,
      thetaStepOver: STEP,
    });
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 8),
      map,
      axisZ: 0,
      radius: 15,
    });
    const mt = faceCellsOf(map, 0); // −t̂ face: align 0
    const pt = faceCellsOf(map, 180); // +t̂ face: align 180
    expect(mt.length).toBeGreaterThan(0);
    expect(pt.length).toBeGreaterThan(0);
    for (const { i } of mt) expect(v[i]).toBe(FLUTE_CLIPPED);
    for (const { i } of pt) expect(v[i]).toBe(FLUTE_CLEAR);
  });

  it('THE BOUNDARY: base offset d vs toolR — d<toolR clips, d>toolR clears', () => {
    for (const [d, want] of [
      [2.9, FLUTE_CLIPPED],
      [3.1, FLUTE_CLEAR],
    ] as const) {
      const positions = new Float32Array([
        ...slab(0, -1, 1, 5, 15),
        ...slab(0, -6 - d, -4 - d, 5, 16),
      ]);
      const map = buildContactMap({
        positions,
        x0: -2.9,
        x1: 2.9,
        radius: 15,
        axisZ: 0,
        thetaStepOver: STEP,
      });
      const v = fluteClearanceCheck({
        positions,
        tool: TOOL(6, 8),
        map,
        axisZ: 0,
        radius: 15,
      });
      const mt = faceCellsOf(map, 0);
      expect(mt.length).toBeGreaterThan(0);
      for (const { i } of mt) expect(v[i]).toBe(want);
    }
  });
});

/* ------------------------------------------------------------------ *
 * MILESTONE 3 — patch segmentation + monotone-A pass emission
 *
 * Segmentation pins: PURE connectivity would over-merge (the
 * propeller's plates glue into one 360°-attitude pass that drags the
 * flank through the twin), so the merge is connectivity AND wrap-aware
 * attitude agreement — pinned here by facet splits (the 8-gon), seam
 * union (the smooth cylinder's 359°→0° align jump), the tolerance
 * boundary, and the stall fold. Emission pins: the entry-safety
 * convention (no rapid mixes Z with X/Y/A), the tool-center formula at
 * each cell's own attitude, the G93 three-floor feed recomputed
 * independently, and endA threading (forward-only, past 360).
 * ------------------------------------------------------------------ */

import { isSimultaneous } from '../../core/types';
import { MAX_ROTARY_RPM } from '../faceCylinder';

/** grid position of a cell, from the dense index (θ wraps in callers) */
function gridPosOf(map: ReturnType<typeof buildContactMap>, ci: number) {
  const idx = map.cellIndex.indexOf(ci);
  expect(idx).toBeGreaterThanOrEqual(0);
  const j = Math.floor(idx / map.nx);
  return { i: idx - j * map.nx, j };
}

/** machine-frame contact point of cell ci at machine attitude deg */
function contactAt(
  map: ReturnType<typeof buildContactMap>,
  ci: number,
  deg: number,
  axisZ: number,
) {
  const th = deg * DEG;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const p = map.cells[ci].p;
  const zRel = p.z - axisZ;
  return { x: p.x, y: p.y * c - zRel * s, z: p.y * s + zRel * c + axisZ };
}

/** wrap-aware align distance, degrees in [0, 180] (the merge metric) */
function wrapDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

describe('segmentContactPatches — the 8-facet cylinder (attitude splits)', () => {
  // Same fixture as the milestone-1 map: facet normals sit exactly at
  // facet mids, so each facet's cells share one align and neighboring
  // facets differ by exactly 45° — the attitude-split probe.
  //
  // ROW 0 IS MIXED (probed): it rides the facet 7/0 boundary edge, and
  // the BVH tie-break splits its 13 columns between the two facets'
  // aligns (67.5 / 112.5). That hole pattern dead-ends the greedy walk
  // — a holed band fragments into several honest passes (a chord over
  // the other attitude's surface cells would gouge; any single-pass
  // order must weave around, which the greedy does not find). So these
  // tests pin the INVARIANTS (partition, one-attitude-per-patch at the
  // default tol, per-step adjacency/Δ) and the structurally-forced
  // counts, never the accidental fragment counts.
  const positions = cylinder(5, 20, 8);
  const map = buildContactMap({
    positions,
    x0: -9,
    x1: 9,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const allClear = () => new Uint8Array(map.cells.length).fill(FLUTE_CLEAR);
  /** the walk's per-step contract, on every patch of a segmentation */
  const expectWalkHolds = (patches: ReturnType<typeof segmentContactPatches>['patches']) => {
    const seen = new Set<number>();
    for (const p of patches) {
      expect(p.cells.length).toBeGreaterThan(0);
      for (let k = 1; k < p.cells.length; k++) {
        const a = map.cells[p.cells[k]].align;
        const b = map.cells[p.cells[k - 1]].align;
        // forward-or-equal attitude, within tol (the walk's own gate)
        const fwd = (((a - b) % 360) + 360) % 360;
        expect(fwd).toBeLessThanOrEqual(2 * (360 / map.nTheta) + 1e-6);
        // grid-adjacent step (θ wraps; the default tol carries it)
        const g1 = gridPosOf(map, p.cells[k - 1]);
        const g2 = gridPosOf(map, p.cells[k]);
        const dj = Math.min(Math.abs(g2.j - g1.j), map.nTheta - Math.abs(g2.j - g1.j));
        expect(Math.abs(g2.i - g1.i) + dj).toBe(1);
      }
      for (const c of p.cells) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
    expect(seen.size).toBe(map.cells.length);
  };

  it('default tolerance: one facet attitude per patch — pure connectivity would merge', () => {
    const { patches, unswarfableCells } = segmentContactPatches({
      map,
      verdict: allClear(),
    });
    expect(unswarfableCells).toBe(0);
    expectWalkHolds(patches);
    // no patch steps across a facet boundary: default tol 28.8 < 45
    for (const p of patches) {
      const a0 = map.cells[p.cells[0]].align;
      for (const c of p.cells) {
        expect(Math.abs(map.cells[c].align - a0)).toBeLessThan(1e-3);
      }
    }
    // THE CONTRAST (the attitude term's whole point): pure connectivity
    // (any attitude) glues the ring — some patch then steps across
    // facet attitudes, the single pass that would drag the flank
    // around the full 360°
    const merged = segmentContactPatches({ map, verdict: allClear(), alignTolDeg: 359.9 });
    let cross = false;
    for (const p of merged.patches) {
      for (let k = 1; k < p.cells.length; k++) {
        if (wrapDelta(map.cells[p.cells[k]].align, map.cells[p.cells[k - 1]].align) > 1) {
          cross = true;
        }
      }
    }
    expect(cross).toBe(true);
  });

  it('tolerance boundary: facet-adjacent ΔA*=45 splits at tol 40, merges at tol 50', () => {
    // NOT exactly 45: float32 facet normals put the true deltas at
    // 45±ε (probed) — robust bounds sit either side of the real facet
    // spacing. Below: no patch ever changes attitude (facet constants;
    // any nonzero Δ IS a crossing). Above: some patch does.
    let crossBelow = false;
    for (const p of segmentContactPatches({ map, verdict: allClear(), alignTolDeg: 40 }).patches) {
      for (let k = 1; k < p.cells.length; k++) {
        if (wrapDelta(map.cells[p.cells[k]].align, map.cells[p.cells[k - 1]].align) > 1) {
          crossBelow = true;
        }
      }
    }
    expect(crossBelow).toBe(false);
    let crossAbove = false;
    for (const p of segmentContactPatches({ map, verdict: allClear(), alignTolDeg: 50 }).patches) {
      for (let k = 1; k < p.cells.length; k++) {
        if (wrapDelta(map.cells[p.cells[k]].align, map.cells[p.cells[k - 1]].align) > 1) {
          crossAbove = true;
        }
      }
    }
    expect(crossAbove).toBe(true);
  });

  it('strict tolerance still chains same-attitude neighbors (Δ0 x-steps)', () => {
    // tol 5 < 45: facets never merge, but same-attitude rows still
    // chain — at least one full row (13 cells) sits in one patch
    const { patches } = segmentContactPatches({
      map,
      verdict: allClear(),
      alignTolDeg: 5,
    });
    expectWalkHolds(patches);
    expect(patches.some((p) => p.cells.length >= 13)).toBe(true);
  });

  it('CLIPPED cells are excluded from patches and counted', () => {
    // clear only θ rows 4..6 — one facet's rows (align 157.5), so ONE
    // patch; the verdict is honest synthetic: segmentation is a pure
    // function of map+verdict
    const verdict = new Uint8Array(map.cells.length).fill(FLUTE_CLIPPED);
    for (const j of [4, 5, 6]) {
      for (let i = 0; i < map.nx; i++) {
        const s = map.cellIndex[j * map.nx + i];
        if (s !== CONTACT_AIR) verdict[s] = FLUTE_CLEAR;
      }
    }
    const { patches, unswarfableCells } = segmentContactPatches({ map, verdict });
    expect(patches.length).toBe(1);
    expect(patches[0].cells.length).toBe(13 * 3);
    expect(unswarfableCells).toBe(map.cells.length - 13 * 3);
    for (const c of patches[0].cells) {
      const j = gridPosOf(map, c).j;
      expect(j >= 4 && j <= 6).toBe(true);
    }
  });
});

describe('segmentContactPatches — the smooth cylinder (seam + walk + fold)', () => {
  // 256 facets: normals ≈ radial at the row angle, so align runs
  // θ+90 smoothly and CROSSES the 359°→0° seam at row 18→19 — the
  // wrap-awareness fixture. Cells: 13×25, all hit.
  const positions = cylinder(5, 20, 256);
  const map = buildContactMap({
    positions,
    x0: -9,
    x1: 9,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const allClear = () => new Uint8Array(map.cells.length).fill(FLUTE_CLEAR);
  const bandVerdict = (rows: number[]) => {
    const v = new Uint8Array(map.cells.length).fill(FLUTE_CLIPPED);
    for (const j of rows) {
      for (let i = 0; i < map.nx; i++) {
        const s = map.cellIndex[j * map.nx + i];
        if (s !== CONTACT_AIR) v[s] = FLUTE_CLEAR;
      }
    }
    return v;
  };

  it('ONE patch across the seam (a strict Δ would split it in two)', () => {
    const { patches, unswarfableCells } = segmentContactPatches({
      map,
      verdict: allClear(),
    });
    expect(patches.length).toBe(1);
    expect(unswarfableCells).toBe(0);
    expect(patches[0].cells.length).toBe(map.cells.length);
    // seam sanity: some adjacent pair spans 359.x → 0.x
    let seam = false;
    for (let j = 0; j < map.nTheta; j++) {
      const a = map.cells[map.cellIndex[j * map.nx]].align;
      const b = map.cells[map.cellIndex[((j + 1) % map.nTheta) * map.nx]].align;
      if (Math.abs(a - b) > 180) seam = true;
    }
    expect(seam).toBe(true);
  });

  it('the walk: every cell once, grid-adjacent steps, monotone, ≤ tol per step', () => {
    const { patches } = segmentContactPatches({ map, verdict: allClear() });
    const cells = patches[0].cells;
    expect(new Set(cells).size).toBe(cells.length);
    const tol = 2 * (360 / map.nTheta); // the default
    for (let k = 1; k < cells.length; k++) {
      const a = map.cells[cells[k]].align;
      const b = map.cells[cells[k - 1]].align;
      const fwd = (((a - b) % 360) + 360) % 360;
      expect(fwd).toBeLessThanOrEqual(tol + 1e-6);
      const g1 = gridPosOf(map, cells[k - 1]);
      const g2 = gridPosOf(map, cells[k]);
      const dj = Math.min(Math.abs(g2.j - g1.j), map.nTheta - Math.abs(g2.j - g1.j));
      expect(Math.abs(g2.i - g1.i) + dj).toBe(1);
    }
    // the walk starts at the patch's lowest RAW attitude (it winds past
    // 360 from there — raw forward distances grow past 180 on wraps)
    const startAlign = map.cells[cells[0]].align;
    for (const c of cells) {
      expect(map.cells[c].align).toBeGreaterThanOrEqual(startAlign - 1e-9);
    }
  });

  it('two disjoint clear bands = two patches, ordered by first cell', () => {
    const { patches, unswarfableCells } = segmentContactPatches({
      map,
      verdict: bandVerdict([0, 1, 2, 3, 4, 12, 13, 14, 15, 16]),
    });
    expect(patches.length).toBe(2);
    expect(patches[0].cells.length).toBe(13 * 5);
    expect(patches[1].cells.length).toBe(13 * 5);
    expect(unswarfableCells).toBe(map.cells.length - 13 * 10);
    for (const c of patches[0].cells) expect(gridPosOf(map, c).j).toBeLessThan(5);
    for (const c of patches[1].cells) {
      const j = gridPosOf(map, c).j;
      expect(j >= 12 && j <= 16).toBe(true);
    }
  });

  it('THE STALL FOLD: a clear band crossing the seam splits into two passes', () => {
    // rows 18..24 clear: aligns run 349.x (row 18) then wrap 3.x..75.x
    // (rows 19..24). The walk starts at the LOWEST attitude (row 19),
    // sweeps forward through the seam to row 24, stalls (row 18 sits
    // 345° "behind"), and re-approaches row 18 as its own pass. One
    // connected component, TWO patches — the honest fold.
    const { patches } = segmentContactPatches({ map, verdict: bandVerdict([18, 19, 20, 21, 22, 23, 24]) });
    expect(patches.length).toBe(2);
    // sorted by first cell index: row 18's pass starts at cell 18·13,
    // rows 19-24's at 19·13 — the fold sorts FIRST
    expect(patches[0].cells.length).toBe(13);
    expect(patches[1].cells.length).toBe(13 * 6);
    for (const c of patches[0].cells) expect(gridPosOf(map, c).j).toBe(18);
    for (const c of patches[1].cells) expect(gridPosOf(map, c).j).toBeGreaterThanOrEqual(19);
  });
});

describe('segmentContactPatches — the two-plate propeller (plate separation)', () => {
  // Milestone-2's plate fixture: two flat radial slabs at 120° mid-plane
  // separation. The 4-column × 25-row grid samples SIX θ rows (probed —
  // hand-derivation of first-hit rows is not honest): row 0 hits plate
  // A's tip cap (align 90), row 8 plate B's tip cap (210), row 9 plate
  // B's +t face (300), rows 12+13 BOTH hit plate A's root cap (270 — the
  // below-axis rays at 172.8°/187.2° cross the z=5 root plane inside the
  // thickness), row 21 plate B's root cap (30). The plates differ by up
  // to 120° in attitude and must NEVER merge.
  const T = 2;
  const R0 = 5;
  const R1 = 10;
  function plate(alphaDeg: number): number[] {
    const a = alphaDeg * DEG;
    const pos: number[] = [];
    const pt = (r: number, s: number, x: number): [number, number, number] => [
      x,
      r * Math.sin(a) + s * Math.cos(a),
      r * Math.cos(a) - s * Math.sin(a),
    ];
    const h = T / 2;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const rA = R0 + ((R1 - R0) * k) / N;
      const rB = R0 + ((R1 - R0) * (k + 1)) / N;
      const A0 = pt(rA, -h, -3), A1 = pt(rA, -h, 3), B0 = pt(rB, -h, -3), B1 = pt(rB, -h, 3);
      const C0 = pt(rA, h, -3), C1 = pt(rA, h, 3), D0 = pt(rB, h, -3), D1 = pt(rB, h, 3);
      pos.push(...A0, ...B0, ...A1, ...A1, ...B0, ...B1);
      pos.push(...C0, ...C1, ...D0, ...C1, ...D1, ...D0);
      pos.push(...A0, ...C0, ...A1, ...A1, ...C0, ...C1);
      pos.push(...B0, ...B1, ...D0, ...B1, ...D1, ...D0);
    }
    return pos;
  }
  const positions = new Float32Array([...plate(0), ...plate(120)]);
  const map = buildContactMap({
    positions,
    x0: -2.9,
    x1: 2.9,
    radius: 12,
    axisZ: 0,
    thetaStepOver: 3,
  });
  const midAngle = (ci: number) => {
    const p = map.cells[ci].p;
    return ((Math.atan2(p.y, p.z) * 180) / Math.PI % 360 + 360) % 360;
  };
  /** the plate a hit belongs to: 0 (α=0) or 1 (α=120) — by mid-angle wedge */
  const plateOf = (ci: number): number => {
    const d0 = Math.abs(midAngle(ci)) % 360;
    const r0 = Math.min(d0, 360 - d0);
    return r0 < 60 ? 0 : 1;
  };

  it('fixture sanity: 6 hit rows, the aligns probed above', () => {
    expect(map.surfaceCells).toBe(24); // 6 rows × 4 columns
    const rows = new Set(map.cells.map((_, i) => gridPosOf(map, i).j));
    expect([...rows]).toEqual([0, 8, 9, 12, 13, 21]);
  });

  it('plates never merge: 5 patches, each confined to ONE plate', () => {
    // rows 12+13 merge (same align 270, grid-adjacent); every other hit
    // row is attitude-isolated (nearest pair 8↔9 differs by 90°)
    const { patches, unswarfableCells } = segmentContactPatches({
      map,
      verdict: new Uint8Array(map.cells.length).fill(FLUTE_CLEAR),
    });
    expect(unswarfableCells).toBe(0);
    expect(patches.map((p) => p.cells.length)).toEqual([4, 4, 4, 8, 4]);
    // patch attitudes in first-cell order (float32 plate normals — closeTo)
    const aligns = patches.map((p) => map.cells[p.cells[0]].align);
    expect(aligns.length).toBe(5);
    for (const [k, want] of [90, 210, 300, 270, 30].entries()) {
      expect(Math.min(Math.abs(aligns[k] - want), 360 - Math.abs(aligns[k] - want))).toBeLessThan(
        1e-4,
      );
    }
    // disjoint union = every cell
    const seen = new Set<number>();
    for (const p of patches) {
      const plate = plateOf(p.cells[0]);
      for (const c of p.cells) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
        expect(plateOf(c)).toBe(plate); // never spans plates
      }
    }
    expect(seen.size).toBe(map.cells.length);
  });

  it('the honest verdict: BOTH plates swarfable, nothing counted unswarfable', () => {
    // corrected with the sign (committee 2026-10-31): the old pin said
    // plate B was 12 unswarfable cells — the mirrored-segment artifact.
    // Honest: both blades clear, all 24 cells patch, zero reported —
    // and the plates STILL never merge (the attitude tolerance
    // separates them, not the clearance): 5 patches, one per hit row
    // plus the 12+13 root-cap pair.
    const verdict = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const { patches, unswarfableCells } = segmentContactPatches({ map, verdict });
    expect(patches.map((p) => p.cells.length)).toEqual([4, 4, 4, 8, 4]);
    expect(unswarfableCells).toBe(0);
    // every plate's own attitudes present, no cross-plate patch
    // (float32 plate normals — per-element closeTo, the sibling test's way)
    const aligns = patches.map((p) => map.cells[p.cells[0]].align);
    for (const [k, want] of [90, 210, 300, 270, 30].entries()) {
      expect(Math.min(Math.abs(aligns[k] - want), 360 - Math.abs(aligns[k] - want))).toBeLessThan(
        1e-4,
      );
    }
    for (const p of patches) {
      const plate = plateOf(p.cells[0]);
      for (const c of p.cells) expect(plateOf(c)).toBe(plate);
    }
  });
});

describe('emitSwarfPass — the wall strip (entry, centers, feeds, threading)', () => {
  // Milestone-2's wall fixture: the box's +Y face is a vertical plane at
  // a constant align (180) — one strip patch, analytic centers.
  const positions = attr(new THREE.BoxGeometry(12, 6, 12).translate(0, -5, AXIS_Z));
  const map = buildContactMap({
    positions,
    x0: -5.5,
    x1: 5.5,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const wallIdx = map.cells
    .map((c, i) => (c.n.y > 0.99 ? i : -1))
    .filter((i) => i >= 0);
  const verdict = new Uint8Array(map.cells.length).fill(FLUTE_CLIPPED);
  for (const i of wallIdx) verdict[i] = FLUTE_CLEAR;
  const { patches } = segmentContactPatches({ map, verdict });
  const FEED = 600;
  const PLUNGE = 300;
  const emit = (startA?: number) =>
    emitSwarfPass({
      map,
      patch: patches[0],
      tool: TOOL(4, 20),
      axisZ: AXIS_Z,
      radius: 12,
      feed: FEED,
      plungeFeed: PLUNGE,
      startA,
    });

  it('fixture sanity: one wall patch, uniform align 180', () => {
    expect(wallIdx.length).toBeGreaterThan(4);
    expect(patches.length).toBe(1);
    expect(patches[0].cells.length).toBe(wallIdx.length);
    for (const c of patches[0].cells) {
      expect(map.cells[c].align).toBeCloseTo(180, 6);
    }
  });

  it('entry safety: A rapid → XY rapid → pure-Z plunge; no rapid mixes Z with X/Y/A', () => {
    const r = emit();
    const [aRapid, xy, plunge] = r.moves;
    const retract = r.moves[r.moves.length - 1];
    // A forward rapid (pure a, at the safe plane)
    expect(aRapid.rapid).toBe(true);
    expect(aRapid.words.a).toBeCloseTo(180, 9);
    expect(aRapid.words.x).toBeUndefined();
    expect(aRapid.words.y).toBeUndefined();
    expect(aRapid.words.z).toBeUndefined();
    // XY over (pure x/y rapid, z absent)
    expect(xy.rapid).toBe(true);
    expect(xy.words.x).toBeDefined();
    expect(xy.words.y).toBeDefined();
    expect(xy.words.z).toBeUndefined();
    expect(xy.words.a).toBeUndefined();
    // pure-Z plunge (a FEED move, G94 — no a word)
    expect(plunge.rapid).toBeFalsy();
    expect(plunge.words.z).toBeDefined();
    expect(plunge.words.a).toBeUndefined();
    expect(plunge.words.x).toBeUndefined();
    expect(plunge.words.y).toBeUndefined();
    // retract: pure-Z rapid
    expect(retract.rapid).toBe(true);
    expect(retract.words.z).toBeDefined();
    expect(retract.words.x).toBeUndefined();
    // the pinned rule, on EVERY move
    for (const m of r.moves) {
      if (m.rapid && m.words.z !== undefined) {
        expect(m.words.x).toBeUndefined();
        expect(m.words.y).toBeUndefined();
        expect(m.words.a).toBeUndefined();
      }
    }
  });

  it('cut moves: XYZA words, G93-simultaneous, one per remaining cell', () => {
    const r = emit();
    const cuts = r.moves.filter((m) => !m.rapid && m.words.a !== undefined);
    expect(cuts.length).toBe(patches[0].cells.length - 1);
    for (const m of cuts) {
      expect(m.words.x).toBeDefined();
      expect(m.words.y).toBeDefined();
      expect(m.words.z).toBeDefined();
      expect(m.words.a).toBeDefined();
      expect(isSimultaneous(m)).toBe(true);
      expect(m.feed).toBeGreaterThan(0);
    }
  });

  it('the tool center per move = fluteToolCenter at the cell\'s own attitude', () => {
    const r = emit();
    const cells = patches[0].cells;
    // plunge targets the FIRST cell's center z; XY rapid its x/y
    const c0 = fluteToolCenter(
      map.cells[cells[0]].p,
      map.cells[cells[0]].n,
      map.cells[cells[0]].align,
      2,
      AXIS_Z,
    );
    expect(r.moves[1].words.x).toBeCloseTo(c0.x, 9);
    expect(r.moves[1].words.y).toBeCloseTo(c0.y, 9);
    expect(r.moves[2].words.z).toBeCloseTo(c0.z, 9);
    // each cut move = its cell's center at its attitude
    for (let k = 1; k < cells.length; k++) {
      const cell = map.cells[cells[k]];
      const c = fluteToolCenter(cell.p, cell.n, cell.align, 2, AXIS_Z);
      const m = r.moves[2 + k];
      expect(m.words.x).toBeCloseTo(c.x, 9);
      expect(m.words.y).toBeCloseTo(c.y, 9);
      expect(m.words.z).toBeCloseTo(c.z, 9);
      // the a word lands the part at the cell's attitude (mod 360)
      const amod = (((m.words.a! % 360) + 360) % 360);
      expect(Math.min(Math.abs(amod - cell.align), 360 - Math.abs(amod - cell.align))).toBeLessThan(1e-6);
    }
  });

  it('G93 feed = 1/max(contactPath, centerPath)/FEED with the rotary floor', () => {
    const r = emit();
    const cells = patches[0].cells;
    let aNow: number = 180; // after the entry advance
    for (let k = 1; k < cells.length; k++) {
      const prev = cells[k - 1];
      const cur = cells[k];
      const fwd = (((map.cells[cur].align - map.cells[prev].align) % 360) + 360) % 360;
      aNow += fwd;
      const cp = contactAt(map, cur, aNow, AXIS_Z);
      const pp = contactAt(map, prev, aNow - fwd, AXIS_Z);
      const contactPath = Math.hypot(cp.x - pp.x, cp.y - pp.y, cp.z - pp.z);
      const cc = fluteToolCenter(map.cells[cur].p, map.cells[cur].n, map.cells[cur].align, 2, AXIS_Z);
      const pc = fluteToolCenter(map.cells[prev].p, map.cells[prev].n, map.cells[prev].align, 2, AXIS_Z);
      const centerPath = Math.hypot(cc.x - pc.x, cc.y - pc.y, cc.z - pc.z);
      const passMinutes = Math.max(contactPath / FEED, centerPath / FEED, (fwd / 360) / MAX_ROTARY_RPM);
      const m = r.moves[2 + k];
      expect(m.feed).toBeCloseTo(1 / passMinutes, 9);
    }
  });

  it('estimated minutes = plunge + Σ passMinutes (rapids uncharged); endA threads', () => {
    // the family convention: the generator charges cutting + plunge only —
    // rapid travel (the entry A advance included) belongs to the caller's
    // overhead accounting, so nothing here charges it (no double-count at
    // two rates)
    const r = emit();
    expect(r.endA).toBeCloseTo(180, 9);
    const c0 = fluteToolCenter(
      map.cells[patches[0].cells[0]].p,
      map.cells[patches[0].cells[0]].n,
      map.cells[patches[0].cells[0]].align,
      2,
      AXIS_Z,
    );
    const safeZ = AXIS_Z + 12 + 5;
    const plungeMinutes = (safeZ - c0.z) / PLUNGE;
    // Σ passMinutes from the moves' own feeds (1/feed each)
    const cuts = r.moves.filter((m) => !m.rapid && m.words.a !== undefined);
    let sum = 0;
    for (const m of cuts) sum += 1 / m.feed;
    expect(r.estimatedMinutes).toBeCloseTo(plungeMinutes + sum, 9);

    // threading: startA 200 → forward 340 (never backward) → 540, past 360
    const r2 = emit(200);
    expect(r2.moves[0].words.a).toBeCloseTo(540, 9);
    expect(r2.endA).toBeCloseTo(540, 9);
  });
});

describe('emitSwarfPass — the full wrap (monotone past 360)', () => {
  const positions = cylinder(5, 20, 256);
  const map = buildContactMap({
    positions,
    x0: -9,
    x1: 9,
    radius: 12,
    axisZ: AXIS_Z,
    thetaStepOver: 3,
  });
  const { patches } = segmentContactPatches({
    map,
    verdict: new Uint8Array(map.cells.length).fill(FLUTE_CLEAR),
  });

  it('one patch, one continuous pass — a move per cell, wound past 360', () => {
    const r = emitSwarfPass({
      map,
      patch: patches[0],
      tool: TOOL(4, 20),
      axisZ: AXIS_Z,
      radius: 12,
      feed: 600,
      startA: 300, // thread from a previous pass: winds past 360 here
    });
    expect(patches.length).toBe(1);
    // entry(3) + 324 cuts + retract(1)
    expect(r.moves.length).toBe(3 + (patches[0].cells.length - 1) + 1);
    const cuts = r.moves.filter((m) => !m.rapid && m.words.a !== undefined);
    expect(cuts.length).toBe(patches[0].cells.length - 1);
    // machine A monotone nondecreasing across EVERY move
    let prev = -Infinity;
    for (const m of r.moves) {
      if (m.words.a === undefined) continue;
      expect(m.words.a).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = m.words.a;
    }
    // wound well past 360 (300 + 63.6 entry + ~345.6 sweep)
    expect(r.endA).toBeGreaterThan(660);
    // endA ≡ the last walk cell's attitude (mod 360), exactly
    const lastCell = map.cells[patches[0].cells[patches[0].cells.length - 1]];
    const amod = (((r.endA % 360) + 360) % 360);
    expect(Math.min(Math.abs(amod - lastCell.align), 360 - Math.abs(amod - lastCell.align))).toBeLessThan(1e-6);
    // every cut move is a G93 simultaneous XYZA
    for (const m of cuts) expect(isSimultaneous(m)).toBe(true);
    // honest time: the CUT moves' own rotary floors bound Σ passMinutes
    // from below (recomputed from the moves' A words, entry advance
    // excluded — it is a rapid, uncharged here)
    let aPrev: number | undefined;
    let rotarySum = 0;
    for (const m of cuts) {
      const a = m.words.a!;
      if (aPrev !== undefined) {
        rotarySum += ((a - aPrev) % 360 + 360) % 360 / 360 / MAX_ROTARY_RPM;
      }
      aPrev = a;
    }
    expect(rotarySum).toBeGreaterThan(0.12); // ~345° at 6.6 RPM ≈ 0.15 min of real rotation, not noise
    expect(r.estimatedMinutes).toBeGreaterThan(rotarySum - 1e-9);
  });
});

describe('emitSwarfPass — validation', () => {
  const positions = cylinder(3, 6, 32);
  const map = buildContactMap({
    positions,
    x0: -12,
    x1: 12,
    radius: 12,
    axisZ: 0,
    thetaStepOver: 3,
  });
  const verdict = new Uint8Array(map.cells.length).fill(FLUTE_CLEAR);
  const { patches } = segmentContactPatches({ map, verdict });

  it('empty patch emits nothing and threads startA', () => {
    const r = emitSwarfPass({
      map,
      patch: { cells: [] },
      tool: TOOL(4, 20),
      axisZ: 0,
      radius: 12,
      feed: 600,
      startA: 123,
    });
    expect(r.moves).toEqual([]);
    expect(r.endA).toBe(123);
    expect(r.estimatedMinutes).toBe(0);
  });

  it('bad feeds / tool / radius throw', () => {
    const base = {
      map,
      patch: patches[0],
      tool: TOOL(4, 20),
      axisZ: 0,
      radius: 12,
      feed: 600,
    };
    expect(() => emitSwarfPass({ ...base, feed: 0 })).toThrow(/feeds/);
    expect(() => emitSwarfPass({ ...base, plungeFeed: -1 })).toThrow(/feeds/);
    expect(() => emitSwarfPass({ ...base, tool: TOOL(0, 20) })).toThrow(/diameter/);
    expect(() => emitSwarfPass({ ...base, radius: 0 })).toThrow(/radius/);
  });

  it('verdict/map mismatch and bad tolerance throw (segmentation)', () => {
    const good = new Uint8Array(map.cells.length).fill(FLUTE_CLEAR);
    expect(() =>
      segmentContactPatches({ map, verdict: new Uint8Array(map.cells.length + 1) }),
    ).toThrow(/mismatch/);
    expect(() => segmentContactPatches({ map, verdict: good, alignTolDeg: 0 })).toThrow(
      /positive/,
    );
    expect(() => segmentContactPatches({ map, verdict: good, alignTolDeg: -5 })).toThrow(
      /positive/,
    );
  });
});
