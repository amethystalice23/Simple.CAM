import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import { detectFeatures, holesFromCircles } from '../features';
import { boundingRadiusAboutX, axialExtentX } from '../features';
import { transformedPositions } from '../slicing';

function box(size = 2): THREE.BufferGeometry {
  return new THREE.BoxGeometry(size, size, size).toNonIndexed();
}

function plateWithHole(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

const rad = (d: number) => (d * Math.PI) / 180;

/** A plate with a HOLE whose rim survives as three 40° arcs (80° chord
 * gaps — off the 60° bridge threshold, unlike a hexagon cap's real
 * chords) — a broken bore. The outer outline stays a full circle. */
function plateWithBrokenHoleRim(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  for (let k = 0; k < 3; k++) {
    // wound CW overall (a hole, opposite the CCW outer shape): visit the
    // arcs in DECREASING angle order, each arc traversed a0+40 → a0,
    // bridging 80° gaps to the next arc's start
    const a0 = 240 - k * 120; // arcs at [240,280], [120,160], [0,40]
    hole.absarc(0, 0, 2, rad(a0 + 40), rad(a0), true);
    const next = a0 - 80;
    hole.lineTo(Math.cos(rad(next)) * 2, Math.sin(rad(next)) * 2);
  }
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
}

describe('detectFeatures', () => {
  it('finds 6 planes, 12 edges, and no circles on a cube', () => {
    const f = detectFeatures(box());
    expect(f.planes).toHaveLength(6);
    expect(f.edges).toHaveLength(12);
    expect(f.circles).toHaveLength(0);
    for (const e of f.edges) {
      const l = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z);
      expect(l).toBeCloseTo(2);
    }
  });

  it('maps raw triangles to plane groups (faceToPlane)', () => {
    const geo = box();
    const f = detectFeatures(geo);
    const triCount = geo.getAttribute('position').count / 3;
    expect(f.faceToPlane).toHaveLength(triCount);
    expect(new Set(f.faceToPlane).size).toBe(6); // one plane per cube face
    for (const p of f.faceToPlane) expect(p).toBeGreaterThanOrEqual(0);
  });

  it('gives every feature a stable, unique id', () => {
    const f1 = detectFeatures(box());
    const f2 = detectFeatures(box(2)); // same geometry, fresh instance
    expect(f1.edges.map((e) => e.id).sort()).toEqual(f2.edges.map((e) => e.id).sort());
    expect(new Set(f1.edges.map((e) => e.id)).size).toBe(f1.edges.length);
  });

  it('detects cylinder caps as circles of the right radius', () => {
    const geo = new THREE.CylinderGeometry(1, 1, 2, 32).toNonIndexed();
    const f = detectFeatures(geo);
    const capCircles = f.circles.filter((c) => Math.abs(c.axis.y) > 0.99); // geometry axis is Y
    expect(capCircles.length).toBeGreaterThanOrEqual(2);
    for (const c of capCircles) expect(c.radius).toBeCloseTo(1, 5);
    expect(f.edges.length).toBeGreaterThan(0);
  });

  it('detects outer and hole circles on an extruded plate', () => {
    const f = detectFeatures(plateWithHole());
    const radii = f.circles.map((c) => c.radius).sort((a, b) => a - b);
    expect(radii.some((r) => Math.abs(r - 2) < 0.05)).toBe(true);
    expect(radii.some((r) => Math.abs(r - 5) < 0.05)).toBe(true);
    // the hole loops are flagged inner (opposite their plane's face normal)
    const inner = f.circles.filter((c) => c.inner);
    expect(inner.length).toBeGreaterThanOrEqual(2);
    for (const c of inner) expect(Math.abs(c.radius - 2)).toBeLessThan(0.05);
  });

  it('exposes every plane border loop (planeLoops) for outline-following ops', () => {
    const f = detectFeatures(plateWithHole());
    // loop radius measured from its centroid
    const loopRadius = (points: { x: number; y: number; z: number }[]) => {
      const c = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), {
        x: 0,
        y: 0,
        z: 0,
      });
      const n = points.length;
      return Math.max(
        ...points.map((p) => Math.hypot(p.x - c.x / n, p.y - c.y / n, p.z - c.z / n)),
      );
    };
    expect(f.planeLoops.length).toBeGreaterThanOrEqual(4); // outer + hole, top + bottom caps
    // the top cap plane carries both its outline loops: Ø5 ring and Ø2 bore
    const top = f.planeLoops.filter((l) => Math.abs(l.points[0].z - 2) < 1e-6);
    expect(top.length).toBe(2);
    expect(top.some((l) => Math.abs(loopRadius(l.points) - 5) < 0.05)).toBe(true);
    expect(top.some((l) => Math.abs(loopRadius(l.points) - 2) < 0.05)).toBe(true);
    // loop → owning plane index is always valid
    for (const l of f.planeLoops) {
      expect(l.plane).toBeGreaterThanOrEqual(0);
      expect(l.plane).toBeLessThan(f.planes.length);
    }
  });

  it('gives a cube one 4-point outline loop per face plane', () => {
    const f = detectFeatures(box());
    expect(f.planeLoops).toHaveLength(6);
    for (const l of f.planeLoops) expect(l.points).toHaveLength(4);
  });

  it('places circle centers on off-origin planes (no doubled coordinates)', () => {
    // cylinder at (10, ·, 5): cap planes do not pass through the model origin
    const geo = new THREE.CylinderGeometry(3, 3, 10, 24).toNonIndexed();
    geo.translate(10, 0, 5);
    const f = detectFeatures(geo);
    const caps = f.circles.filter((c) => Math.abs(c.axis.y) > 0.99);
    expect(caps.length).toBeGreaterThanOrEqual(2);
    for (const c of caps) {
      expect(Math.abs(c.center.x - 10)).toBeLessThan(0.05);
      expect(Math.abs(Math.abs(c.center.y) - 5)).toBeLessThan(0.05);
      expect(Math.abs(c.center.z - 5)).toBeLessThan(0.05);
      expect(c.radius).toBeCloseTo(3, 1);
    }
  });

  it('suppresses tessellation chords lying on detected circles', () => {
    const geo = new THREE.CylinderGeometry(3, 3, 10, 24).toNonIndexed();
    geo.rotateZ(Math.PI / 2); // axis along X: cap chords run at constant x
    const f = detectFeatures(geo);
    expect(f.circles.length).toBeGreaterThanOrEqual(2);
    for (const e of f.edges) {
      // every remaining edge must run axially; constant-x edges are cap
      // chords that duplicate the end circles
      expect(Math.abs(e.a.x - e.b.x)).toBeGreaterThan(1e-6);
    }
    expect(f.edges.length).toBeGreaterThanOrEqual(24); // wall seams survive
  });

  it('detects chamfer-root circles: the true outer and bore diameters', () => {
    // closed lathe profile (ends where it starts): Ø20 tube, bore Ø12,
    // 45° chamfers on the top outer edge and the bore edge
    const profile = [
      [6, 0],
      [10, 0],
      [10, 3],
      [9, 4],
      [9, 5],
      [5, 5],
      [6, 4],
      [6, 0],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(profile, 32).toNonIndexed();
    const f = detectFeatures(geo);

    // outer chamfer root at y=3: the true Ø20, invisible to plane-loop
    // detection (it sits between the chamfer band and the wall band)
    const outerRoot = f.circles.find(
      (c) => Math.abs(c.radius - 10) < 0.02 && Math.abs(c.center.y - 3) < 0.05,
    );
    expect(outerRoot).toBeDefined();
    expect(outerRoot?.inner).toBe(false);

    // bore chamfer root at y=4: the true Ø12 bore, flagged as a hole
    const boreRoot = f.circles.find(
      (c) => Math.abs(c.radius - 6) < 0.02 && Math.abs(c.center.y - 4) < 0.05,
    );
    expect(boreRoot).toBeDefined();
    expect(boreRoot?.inner).toBe(true);
  });

});

describe('holesFromCircles', () => {
  it('flags Z-axis inner loops as drill targets in machine space', () => {
    const geo = plateWithHole();
    const f = detectFeatures(geo);
    const holes = holesFromCircles(f.circles, identityTransform());
    // one hole per cap (top + bottom), each Ø4
    expect(holes).toHaveLength(2);
    for (const h of holes) {
      expect(h.diameter).toBeCloseTo(4, 1);
      expect(Math.abs(h.center.x)).toBeLessThan(0.05);
      expect(Math.abs(h.center.y)).toBeLessThan(0.05);
    }
    const zs = holes.map((h) => h.center.z).sort((a, b) => a - b);
    expect(zs[0]).toBeCloseTo(0, 1);
    expect(zs[1]).toBeCloseTo(2, 1);
  });

  it('drops circles whose axis is not the machine drill axis', () => {
    // lay the plate on its side: the hole axis becomes machine Y
    const t = { ...identityTransform(), rotationDeg: { x: 90, y: 0, z: 0 } };
    const f = detectFeatures(plateWithHole());
    expect(holesFromCircles(f.circles, t)).toHaveLength(0);
  });

  it('refuses partial circles — a broken hole rim bounds no bore', () => {
    const f = detectFeatures(plateWithBrokenHoleRim());
    const partial = f.circles.filter((c) => c.arcs);
    expect(partial.length).toBeGreaterThanOrEqual(2); // per cap
    for (const c of partial) {
      expect(c.inner).toBe(true);
      expect(c.arcs).toHaveLength(3); // one chain per surviving arc
    }
    expect(holesFromCircles(f.circles, identityTransform())).toHaveLength(0);
  });
});

describe('detectFeatures: partial circles (broken rims)', () => {
  /** A flat plate whose outline is a circle of radius R broken into
   * `fragments` arcs of `spanDeg`, chords closing the gaps — the
   * flutes/flats-cut-into-a-cylinder shape family, extruded. */
  function plateWithBrokenRim(R: number, fragments: number, spanDeg: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    for (let k = 0; k < fragments; k++) {
      const a0 = (k * 360) / fragments;
      shape.absarc(0, 0, R, rad(a0), rad(a0 + spanDeg), false);
      const aNext = ((k + 1) * 360) / fragments;
      shape.lineTo(Math.cos(rad(aNext)) * R, Math.sin(rad(aNext)) * R);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
  }

  it('recognizes a D-shape rim as a circle carried by its semicircle', () => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 5, 0, Math.PI, false); // semicircle, CCW
    shape.lineTo(5, 0); // the chord
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
    const f = detectFeatures(geo);
    const r5 = f.circles.filter((c) => Math.abs(c.radius - 5) < 0.05);
    expect(r5.length).toBeGreaterThanOrEqual(1); // one per cap
    for (const c of r5) {
      expect(c.arcs).toBeDefined();
      expect(c.arcs).toHaveLength(1); // one surviving arc
      expect(c.inner).toBe(false);
    }
  });

  it('assembles a fluted rim from evenly spaced slivers (envelope rule)', () => {
    // four 15° survivors of a Ø10 rim: the arcs SUM to 60° but SPAN 285°
    const f = detectFeatures(plateWithBrokenRim(5, 4, 15));
    const r5 = f.circles.filter((c) => Math.abs(c.radius - 5) < 0.1);
    expect(r5.length).toBeGreaterThanOrEqual(1);
    for (const c of r5) {
      expect(c.arcs).toBeDefined();
      expect(c.arcs).toHaveLength(4); // one chain per surviving sliver
      for (const chain of c.arcs!) expect(chain.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects slivers clustered in one wedge — envelope under 120°', () => {
    // two 15° survivors inside a 45° wedge of a Ø10 rim
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 5, 0, rad(15), false);
    shape.lineTo(Math.cos(rad(30)) * 5, Math.sin(rad(30)) * 5);
    shape.absarc(0, 0, 5, rad(30), rad(45), false);
    shape.lineTo(5, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
    const f = detectFeatures(geo);
    expect(f.circles.some((c) => Math.abs(c.radius - 5) < 0.1 && c.arcs)).toBe(false);
  });

  it('merges rim arcs split across SEPARATE border loops of one plane', () => {
    // Alice's cross-core cylinder: a base cap whose circular rim survives
    // as arcs separated by solid wall, one loop per section — the arcs
    // are still one circle. Modelled as 4 wedge holes with rounded outer
    // edges: 80° arcs at Ø9.8 with 10° gaps, one arc per hole loop.
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 5, 0, Math.PI * 2, false);
    for (let k = 0; k < 4; k++) {
      const a0 = k * 90;
      const hole = new THREE.Path();
      hole.absarc(0, 0, 4.9, rad(a0 + 80), rad(a0), true); // 80° arc, CW
      const apex = rad(a0 + 40);
      hole.lineTo(Math.cos(apex) * 0.5, Math.sin(apex) * 0.5);
      const start = rad(a0 + 80);
      hole.lineTo(Math.cos(start) * 4.9, Math.sin(start) * 4.9);
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).toNonIndexed();
    const f = detectFeatures(geo);
    const rim = f.circles.filter((c) => Math.abs(c.radius - 4.9) < 0.1 && c.arcs);
    expect(rim.length).toBeGreaterThanOrEqual(1); // the merged base rim
    for (const c of rim) {
      expect(c.arcs).toHaveLength(4); // one chain per wedge loop
      for (const chain of c.arcs!) expect(chain.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('treats an all-vertex fit as a FULL circle — no arcs field', () => {
    // an octagonal prism's caps: 8 border vertices, below fitCircle's
    // n ≥ 9 gate, but every vertex sits on the circle
    const geo = new THREE.CylinderGeometry(1, 1, 2, 8).toNonIndexed();
    const f = detectFeatures(geo);
    const caps = f.circles.filter((c) => Math.abs(c.axis.y) > 0.99);
    expect(caps.length).toBeGreaterThanOrEqual(2);
    for (const c of caps) {
      expect(c.radius).toBeCloseTo(1, 5);
      expect(c.arcs).toBeUndefined(); // complete — every op may use it
    }
  });
});

describe('bounding measurements', () => {
  it('measures radius about X and the axial extent', () => {
    const geo = new THREE.CylinderGeometry(3, 3, 10, 24);
    geo.rotateZ(Math.PI / 2); // geometry axis Y → X (machine axis)
    const pos = transformedPositions(geo.toNonIndexed(), identityTransform());
    expect(boundingRadiusAboutX(pos)).toBeCloseTo(3, 1);
    const [x0, x1] = axialExtentX(pos);
    expect(x1 - x0).toBeCloseTo(10, 1);
    expect((x0 + x1) / 2).toBeCloseTo(0, 1);
  });
});