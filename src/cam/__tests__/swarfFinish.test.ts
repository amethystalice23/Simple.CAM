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
  fluteClearanceCheck,
  fluteToolCenter,
  FLUTE_CLEAR,
  FLUTE_CLIPPED,
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
  // 120° mid-plane separation. At a FACING flank's A* the opposite
  // blade's body sits 1.5 mm from the contact — inside the flute span
  // (±20) and inside toolR (Ø6) ⇒ CLIPPED; the AWAY faces' columns
  // stand off into open air ⇒ CLEAR. (Probe-verified split before
  // pinning: exactly the facing cells clip.)
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

  // VERDICT SPLIT (brute-force verified 24/24 against dense-sampled
  // segment-vs-triangle distances with the same exclusion rule): plate
  // A (α=0) is entirely swarfable — every A contact's A* swings the
  // tool column clear of B (A's tip face grazes its own body at exactly
  // toolR: legal contact, the graze epsilon's job). Plate B (α=120) is
  // entirely UNSWARFABLE — at B's contacts' attitudes (A* ≈ 0–50°) the
  // vertical column sweeps INTO plate A's rotated slab (the column LINE
  // passes through it, independent of toolR). That is the propeller
  // honesty: one blade finishes, its twin does not.
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

  it('blade B: every cell CLIPPED (its columns sweep into A)', () => {
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(6, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const b = plateCells(GAP_DEG);
    expect(b.length).toBeGreaterThan(0);
    for (const { i } of b) expect(v[i]).toBe(FLUTE_CLIPPED);
  });

  it('the B verdict is tool-size independent (a column LINE through A)', () => {
    // Ø2: if the clip were a radius effect it would lift; a column
    // passing through the other blade clips at any diameter.
    const v = fluteClearanceCheck({
      positions,
      tool: TOOL(2, 20),
      map,
      axisZ: 0,
      radius: 12,
    });
    const b = plateCells(GAP_DEG);
    for (const { i } of b) expect(v[i]).toBe(FLUTE_CLIPPED);
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
