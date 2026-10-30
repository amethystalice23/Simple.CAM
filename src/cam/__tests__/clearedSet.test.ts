/**
 * Cleared-set map tests (P2b): the roughing-reach model — a cell's
 * adjacent waste is cleared at orientation A iff the tool-opening on
 * the from-above heightmap reaches its height. Analytic fixtures: a
 * cylinder (top and side waste cleared at every orientation, the
 * lower half only at rotated orientations), the undercut mushroom
 * (the shaft under the disc never cleared — the disc shadows it from
 * above at every angle), and a sub-tool gap (the opening: waste in a
 * gap narrower than the tool stays uncut).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildClearedMap } from '../clearedSet';

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

/** two parallel fins with a gap between them (the opening fixture):
 * fins stand along X, separated by `gap` in Y, tall enough to shadow
 * the gap floor from above at any rotation that keeps them upright */
function finPair(gap: number, finThk: number, height: number, length: number): Float32Array {
  const mk = (y0: number) => {
    const g = new THREE.BoxGeometry(length, finThk, height).toNonIndexed();
    g.translate(0, y0 + finThk / 2, height / 2);
    const attr = g.getAttribute('position') as THREE.BufferAttribute;
    return new Float32Array(attr.array as Float32Array);
  };
  const a = mk(gap / 2);
  const b = mk(-gap / 2 - finThk);
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const opts = (positions: Float32Array, over: Partial<Parameters<typeof buildClearedMap>[0]> = {}) => ({
  positions,
  x0: -10,
  x1: 10,
  radius: 12,
  axisZ: 0,
  thetaStepOver: 1,
  tool: { diameter: 2 },
  orientations: [0],
  ...over,
});

describe('buildClearedMap', () => {
  it('a cylinder: upper-half cells cleared at A=0, lower-half cells cleared only at rotated orientations', () => {
    // the from-above heightmap of a cylinder at A=0 shadows everything
    // below its equator: waste beside the machine-down half cannot be
    // swept by a vertical tool, but rotates into reach at A=180
    const a0 = buildClearedMap(opts(cylinder(5, 20), { orientations: [0] }));
    expect(a0.materialCells).toBeGreaterThan(0);
    expect(a0.coverable).toBeGreaterThan(0);
    expect(a0.buriedEverywhere).toBeGreaterThan(0); // the down-facing half
    // ~60%, not a half: cells near the equator also clear — the tool's
    // disc beside the silhouette edge sweeps their adjacent waste (the
    // boundary analysis: cleared until the offset point's disc can no
    // longer find an all-air center within one tool radius)
    const ratio = a0.coverable / a0.materialCells;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThanOrEqual(0.65);
    const a4 = buildClearedMap(opts(cylinder(5, 20), { orientations: [0, 90, 180, 270] }));
    expect(a4.coverable).toBe(a4.materialCells);
    expect(a4.buriedEverywhere).toBe(0);
  });

  it('the mushroom: the shaft under the disc is never cleared — the disc shadows it from above at every angle', () => {
    const res = buildClearedMap(opts(mushroom(10, 2, 4, 20), { orientations: [0, 90, 180, 270] }));
    expect(res.materialCells).toBeGreaterThan(0);
    expect(res.buriedEverywhere).toBeGreaterThan(0);
    // the buried cells sit under the disc: their X band is the disc's
    // span (the shaft elsewhere IS cleared)
    expect(res.coverable).toBeGreaterThan(0);
  });

  it('the opening: waste in a gap narrower than the tool stays uncut; a wide gap clears', () => {
    // two fins 1mm apart with a Ø2 tool: no tool center fits the gap,
    // so the inner faces' adjacent waste is never cleared; a 3mm gap
    // fits the tool and clears (the 0.5 offset samples inside the gap)
    const narrow = buildClearedMap(opts(finPair(1, 1, 8, 20), { orientations: [0] }));
    const wide = buildClearedMap(opts(finPair(3, 1, 8, 20), { orientations: [0] }));
    // the narrow gap leaves more material uncleaned than the wide one
    expect(narrow.buriedEverywhere).toBeGreaterThan(wide.buriedEverywhere);
  });

  it('rejects invalid parameters', () => {
    expect(() => buildClearedMap(opts(cylinder(5, 20), { orientations: [] }))).toThrowError(/orientation/);
    expect(() => buildClearedMap(opts(cylinder(5, 20), { x1: -10 }))).toThrowError(/span/);
    expect(() => buildClearedMap(opts(cylinder(5, 20), { thetaStepOver: 0 }))).toThrowError(/thetaStepOver/);
  });
});