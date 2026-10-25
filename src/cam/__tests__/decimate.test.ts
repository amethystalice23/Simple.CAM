import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { decimateForDetection } from '../decimate';
import { detectFeatures } from '../features';

/** Flat positions of a geometry as a plain array (position attribute only). */
function positionsOf(geometry: THREE.BufferGeometry): number[] {
  const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const out: number[] = [];
  for (let i = 0; i < attr.count; i++) {
    out.push(attr.getX(i), attr.getY(i), attr.getZ(i));
  }
  return out;
}

describe('decimateForDetection', () => {
  it('returns a fresh non-indexed copy when the input is at/below the cap', () => {
    // PlaneGeometry is INDEXED on purpose: the copy path must unwrap it
    const input = new THREE.PlaneGeometry(10, 10, 4, 4); // 32 triangles
    const res = decimateForDetection(input, 100);
    expect(res.triangles).toBe(32);
    expect(res.pitch).toBe(0); // no clustering happened
    expect(res.geometry).not.toBe(input);
    expect(res.geometry.index).toBeNull();
    expect(positionsOf(res.geometry)).toEqual(positionsOf(input.toNonIndexed()));
  });

  it('collapses a fine flat quad grid into few planar triangles, bbox intact', () => {
    // 30×30 subdivisions = 1800 coplanar triangles at z = 0
    const input = new THREE.PlaneGeometry(10, 10, 30, 30).toNonIndexed();
    const res = decimateForDetection(input, 100);
    expect(res.triangles).toBeGreaterThan(0);
    expect(res.triangles).toBeLessThanOrEqual(100);
    expect(res.pitch).toBeGreaterThan(0);

    // clustering welds flat regions into flat patches: every output
    // vertex is still exactly on the input plane
    const pos = positionsOf(res.geometry);
    for (let i = 2; i < pos.length; i += 3) expect(Math.abs(pos[i])).toBeLessThan(1e-9);

    // bbox preserved within a pitch: weld representatives are averages of
    // input positions, so they can never leave the input bbox (≤ +0), and
    // the extreme cells pull in by at most one pitch (≥ −pitch)
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < pos.length; i += 3) {
      xs.push(pos[i]);
      ys.push(pos[i + 1]);
    }
    expect(Math.max(...xs)).toBeLessThanOrEqual(5 + 1e-9);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(5 - res.pitch);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-5 - 1e-9);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-5 + res.pitch);
    expect(Math.max(...ys)).toBeLessThanOrEqual(5 + 1e-9);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(5 - res.pitch);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-5 - 1e-9);
    expect(Math.min(...ys)).toBeLessThanOrEqual(-5 + res.pitch);

    // the whole point: detection on the decimated mesh sees ONE plane
    // (flat regions weld into genuinely planar patches)
    const f = detectFeatures(res.geometry);
    expect(f.planes).toHaveLength(1);
    for (const p of f.faceToPlane) expect(p).toBe(0);
  });

  it('decimates a dome under the triangle cap with radial deviation under ~2 pitches', () => {
    const input = new THREE.SphereGeometry(5, 96, 48).toNonIndexed(); // ~9k triangles
    const res = decimateForDetection(input, 400);
    expect(res.triangles).toBeGreaterThan(0);
    expect(res.triangles).toBeLessThanOrEqual(400);
    expect(res.pitch).toBeGreaterThan(0);

    // every weld representative is the mean of input positions on the
    // radius-5 sphere: convexity keeps it inside (r ≤ 5), and it sits in
    // the same pitch-cell as its sources, so it can't sag more than the
    // cell diagonal (√3·pitch < 2·pitch)
    const pos = positionsOf(res.geometry);
    expect(pos.length).toBeGreaterThan(0);
    for (let i = 0; i < pos.length; i += 3) {
      const r = Math.hypot(pos[i], pos[i + 1], pos[i + 2]);
      expect(r).toBeLessThanOrEqual(5 + 1e-9);
      expect(5 - r).toBeLessThanOrEqual(2 * res.pitch);
    }
  });
});