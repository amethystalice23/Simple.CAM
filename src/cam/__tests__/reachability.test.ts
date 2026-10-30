/**
 * Reachability map tests (P2 of the 4D carve): the vertical-visibility
 * model — a cell is reachable at orientation A iff its rotated surface
 * point is the first from-above hit (an indexed op cuts exactly that
 * way). Fixtures with hand-derivable verdicts: a cylinder (top half of
 * the rows reachable at any orientation, bottom half buried), the
 * undercut mushroom (the shaft under the disc occluded from above at
 * EVERY orientation AND shadow-blocked), and the orientation-flip (a
 * buried cell reads reachable after a 180° turn).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Tool } from '../../core/types';
import { buildReachabilityMap, ReachVerdict } from '../reachability';

const tool: Tool = { id: 't', name: '2mm flat', type: 'flat', diameter: 2, fluteLength: 17, spindleRpm: 18000 };

/** on-axis solid cylinder, axis ∥ X, centered at the origin */
function cylinder(radius: number, length: number): Float32Array {
  const g = new THREE.CylinderGeometry(radius, radius, length, 48).toNonIndexed();
  g.rotateZ(Math.PI / 2);
  const attr = g.getAttribute('position') as THREE.BufferAttribute;
  return new Float32Array(attr.array as Float32Array);
}

/** the radial-undercut mushroom: a wide disc over a thin shaft */
function mushroom(discR: number, discLen: number, shaftR: number, shaftLen: number): Float32Array {
  const disc = new THREE.CylinderGeometry(discR, discR, discLen, 32).toNonIndexed();
  disc.rotateZ(Math.PI / 2);
  const shaft = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 32).toNonIndexed();
  shaft.rotateZ(Math.PI / 2);
  const a = disc.getAttribute('position') as THREE.BufferAttribute;
  const b = shaft.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(a.count * 3 + b.count * 3);
  out.set(a.array as Float32Array, 0);
  out.set(b.array as Float32Array, a.count * 3);
  return out;
}

const opts = (positions: Float32Array, over: Partial<Parameters<typeof buildReachabilityMap>[0]> = {}) => ({
  positions,
  x0: -10,
  x1: 10,
  radius: 12,
  axisZ: 0,
  thetaStepOver: 2,
  tool: { diameter: tool.diameter, fluteLength: tool.fluteLength ?? 17 },
  orientations: [0],
  ...over,
});

describe('buildReachabilityMap', () => {
  it('a cylinder at A=0: the top half of material rows is reachable, the bottom half buried — the vertical model', () => {
    // at A=0 the tool descends along −Z: a surface cell at θ near 90°
    // (machine-up, +Z) is the first from-above hit; a cell at θ near 270°
    // (machine-down) is occluded by the whole cylinder above it
    const res = buildReachabilityMap(opts(cylinder(5, 20), { orientations: [0] }));
    expect(res.materialCells).toBeGreaterThan(0);
    expect(res.blockedEverywhere).toBe(0); // a plain cylinder has no undercuts
    expect(res.coverable).toBeGreaterThan(0);
    expect(res.buriedEverywhere).toBeGreaterThan(0); // the down-facing half
    // the reach is roughly half the material cells (the up-facing half —
    // tessellation and grid parity make it near-, not exactly-, half)
    const ratio = res.coverable / res.materialCells;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('a cylinder at four orientations 90° apart covers everything — her 4-knight mechanism', () => {
    const res = buildReachabilityMap(opts(cylinder(5, 20), { orientations: [0, 90, 180, 270] }));
    // four orientations each see the up-facing band; together they cover
    // every material cell of the plain cylinder
    expect(res.coverable).toBe(res.materialCells);
    expect(res.buriedEverywhere).toBe(0);
  });

  it('per-orientation reach counts on the symmetric cylinder agree within grid parity', () => {
    const res = buildReachabilityMap(opts(cylinder(5, 20), { orientations: [0, 90, 180, 270] }));
    const counts = res.reachablePerOrientation;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // θ rows do not divide evenly by 4 orientations (nTheta ≈ 38): a
    // boundary row can flip; the spread stays within a few rows' cells
    expect(max - min).toBeLessThanOrEqual(2 * res.nx);
  });

  it('the mushroom: the shaft under the disc is occluded from above at every orientation', () => {
    // the disc is Ø20 over a Ø8 shaft: the shaft's surface cells under
    // the disc are occluded from above at EVERY angle (the disc always
    // overhangs them) — and their radial rays pass material-air-material,
    // so the shadow map marks them BLOCKED
    const res = buildReachabilityMap(opts(mushroom(10, 2, 4, 20), { orientations: [0, 90, 180, 270] }));
    expect(res.blockedEverywhere).toBeGreaterThan(0);
    // blocked cells read BLOCKED at every orientation (honest and final)
    const n = res.nx * res.nTheta;
    let sawBlocked = false;
    for (let k = 0; k < n; k++) {
      if (res.verdicts[k] === ReachVerdict.BLOCKED) {
        sawBlocked = true;
        for (let oi = 1; oi < res.orientations.length; oi++) {
          expect(res.verdicts[oi * n + k]).toBe(ReachVerdict.BLOCKED);
        }
      }
    }
    expect(sawBlocked).toBe(true);
  });

  it('buried cells flip to reachable as the orientation rotates', () => {
    // on the plain cylinder at A=0, a bottom (machine-down) cell is
    // BURIED; at A=180 the same material cell rotates to machine-up and
    // reads REACHABLE — the verdict table flips with the orientation
    const a0 = buildReachabilityMap(opts(cylinder(5, 20), { orientations: [0] }));
    const a180 = buildReachabilityMap(opts(cylinder(5, 20), { orientations: [180] }));
    const n = a0.nx * a0.nTheta;
    let flipped = 0;
    for (let k = 0; k < n; k++) {
      if (
        a0.verdicts[k] === ReachVerdict.BURIED &&
        a180.verdicts[k] === ReachVerdict.REACHABLE
      ) flipped++;
    }
    expect(flipped).toBeGreaterThan(0);
  });

  it('rejects invalid parameters', () => {
    expect(() => buildReachabilityMap(opts(cylinder(5, 20), { orientations: [] }))).toThrowError(/orientation/);
    expect(() => buildReachabilityMap(opts(cylinder(5, 20), { x1: -10 }))).toThrowError(/span/);
    expect(() => buildReachabilityMap(opts(cylinder(5, 20), { thetaStepOver: 0 }))).toThrowError(/thetaStepOver/);
  });
});