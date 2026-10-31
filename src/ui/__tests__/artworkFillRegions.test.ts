import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  artworkFillTris,
  densifyWrappedPath,
  fillLoopDepths,
  fillRegions2D,
  FILL_SHADE_LIFT,
  FILL_SHADE_LIFT_WRAPPED,
  FILL_SUBDIVIDE_MAX_EDGE,
  pointInLoop,
  polygonizeRegion2D,
  triangulateRegions,
} from '../artworkFillRegions';
import type { Vec3 } from '../../core/types';

/** a rectangle loop — winding order is irrelevant to even-odd parity */
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** a rectangle in 3D local space (flat artwork plane, z = 0) */
const rect3 = (x0: number, y0: number, x1: number, y1: number): Vec3[] =>
  rect(x0, y0, x1, y1).map((p) => ({ x: p.x, y: p.y, z: 0 }));

/** a point ON the artwork's own cylinder (axis ∥ local X), angle th rad
 * from local angle 0, at axial position x */
const onCyl = (th: number, x: number, r: number): Vec3 => ({
  x,
  y: r * Math.sin(th),
  z: r * Math.cos(th),
});

/** ALICE'S REAL ANKH (her saved 2d_engrave.cam.json): loop 0 the body,
 * loop 1 the counter — the round-2 overlapping-shade fixture */
const ankh = JSON.parse(
  readFileSync(new URL('./fixtures/ankh.json', import.meta.url), 'utf8'),
) as { loops: { x: number; y: number }[][]; meta: { closed: boolean; filled: boolean }[] };
const ankhPaths = ankh.loops.map((points, i) => ({
  points: points.map((p) => ({ x: p.x, y: p.y, z: 0 })), // flat plane
  ...ankh.meta[i],
}));

type P = { x: number; y: number };
const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** intersection AREA of two triangles (convex-convex clip) — touching
 * edges score 0, real overlaps score their shared area */
function clipArea(A: P[], B: P[]): number {
  let out = A;
  for (let i = 0; i < B.length && out.length > 0; i++) {
    const a = B[i];
    const b = B[(i + 1) % B.length];
    const inn: P[] = [];
    for (let k = 0; k < out.length; k++) {
      const p = out[k];
      const q = out[(k + 1) % out.length];
      const sp = cross(a, b, p);
      const sq = cross(a, b, q);
      if (sp >= 0) inn.push(p);
      if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
        const t = sp / (sp - sq);
        inn.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
    }
    out = inn;
  }
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    const q = out[(i + 1) % out.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** total overlap area of a 2D triangle set (the round-2 artifact meter) */
function overlapArea(tris: P[][]): number {
  let s = 0;
  for (let i = 0; i < tris.length; i++)
    for (let k = i + 1; k < tris.length; k++) s += clipArea(tris[i], tris[k]);
  return s;
}

/** the shade of `sel` on the ankh, as 2D triangles (flat frame) */
const ankhShade = (sel: number[]): P[][] => {
  const t = artworkFillTris(ankhPaths, new Set(sel), 'flat', 0);
  return t.shade.map(([a, b, c]) =>
    [t.verts[a], t.verts[b], t.verts[c]].map((v) => ({ x: v.x, y: v.y })),
  );
};

describe('fillLoopDepths — even-odd nesting', () => {
  it('a counter is depth 1 inside its body; an island depth 2', () => {
    expect(fillLoopDepths([rect(0, 0, 10, 10), rect(3, 3, 7, 7)])).toEqual([0, 1]);
    expect(fillLoopDepths([rect(0, 0, 12, 12), rect(2, 2, 10, 10), rect(5, 5, 7, 7)])).toEqual([
      0, 1, 2,
    ]);
    expect(fillLoopDepths([rect(0, 0, 2, 2), rect(5, 0, 7, 2)])).toEqual([0, 0]);
  });

  it('degenerate loops (fewer than 3 points) are ignored, not crashed on', () => {
    expect(fillLoopDepths([[{ x: 0, y: 0 }, { x: 1, y: 1 }]])).toEqual([]);
  });
});

describe('pointInLoop — half-open crossings', () => {
  it('strictly inside/outside, and a boundary vertex does not double-count', () => {
    const loop = rect(0, 0, 10, 10);
    expect(pointInLoop(5, 5, loop)).toBe(true);
    expect(pointInLoop(15, 5, loop)).toBe(false);
    // the half-open rule ([lo,hi) on y): the top edge's y never counts,
    // the left edge's corner y does — the convention engraveFillSpans
    // uses, so shade regions and rasters agree on the boundary
    expect(pointInLoop(5, 0, loop)).toBe(true);
    expect(pointInLoop(5, 10, loop)).toBe(false);
  });
});

describe('fillRegions2D + triangulateRegions — the rect-with-hole fixture', () => {
  // PINNED to the printed output (three's earcut wrapper): an 8-triangle
  // ring — two per corner — with indices into [outer4, inner4]
  const regions = fillRegions2D([rect(0, 0, 10, 10), rect(3, 3, 7, 7)]);
  const { verts, indices, owners } = triangulateRegions(regions);

  it('prints 8 triangles over 8 verts, all owned by the outer loop', () => {
    expect(verts).toHaveLength(8);
    expect(indices).toHaveLength(24); // 8 triangles
    expect(indices.every((i) => i >= 0 && i < 8)).toBe(true);
    expect(owners).toEqual(new Array(8).fill(0));
  });

  it('never covers the hole: every triangle centroid sits outside the inner rect', () => {
    for (let t = 0; t < indices.length; t += 3) {
      const cx =
        (verts[indices[t]].x + verts[indices[t + 1]].x + verts[indices[t + 2]].x) / 3;
      const cy =
        (verts[indices[t]].y + verts[indices[t + 1]].y + verts[indices[t + 2]].y) / 3;
      const insideHole =
        cx > 3 && cx < 7 && cy > 3 && cy < 7; // centroids: no boundary grazing
      expect(insideHole).toBe(false);
    }
  });
});

describe('polygonizeRegion2D — clean rings through clipper', () => {
  it('a body + counter becomes ONE ring region, counter differenced out', () => {
    const regions = polygonizeRegion2D([rect(0, 0, 10, 10), rect(3, 3, 7, 7)]);
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(1);
    // the rings are clipper's own — clean coordinates, not the inputs
    const ring = regions[0].contour;
    expect(ring.length).toBeGreaterThanOrEqual(4);
    for (const p of ring) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('a lone loop passes through as a clean ring, no holes', () => {
    const regions = polygonizeRegion2D([rect(0, 0, 10, 10)]);
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toEqual([]);
  });

  it('the ankh both-selected: shade overlap area is EXACTLY ZERO (the round-2 artifact)', () => {
    // round 1 earcut the raw body with the raw counter as a hole list and
    // fanned 50.2 mm² of overlapping triangles on this exact selection;
    // the polygonized rings triangulate disjoint
    for (const sel of [[0], [1], [0, 1]]) {
      expect(overlapArea(ankhShade(sel))).toBeLessThan(1e-6);
    }
  });

  it('the ankh counter alone shades a real region (30 triangles, not garbage)', () => {
    const tris = ankhShade([1]);
    expect(tris.length).toBeGreaterThan(10);
    // area sanity: the counter spans ~x 5.5..9.5, y 2..10.6 (fixture bbox).
    // Subdivision midpoints are exact (one deduped vertex per shared edge)
    // so children tile exactly — the 1e-9 is float noise in the clip-based
    // area meter itself, not real overlap (round 4: was toBe(0))
    expect(overlapArea(tris)).toBeLessThan(1e-9);
  });
});

describe('artworkFillTris — the local-space back-maps', () => {
  it('flat: verts lift off the plane, pick owners index the CALLER\'s paths', () => {
    const open = { points: rect3(0, 0, 4, 0) }; // a stroke: never a region
    const outer = { points: rect3(0, 0, 10, 10), closed: true, filled: true };
    const hole = { points: rect3(3, 3, 7, 7), closed: true, filled: true };
    const tris = artworkFillTris([open, outer, hole], new Set([1]), 'flat', 0);
    expect(tris.verts.length).toBeGreaterThan(0);
    for (const v of tris.verts) expect(v.z).toBeCloseTo(FILL_SHADE_LIFT, 9);
    // the open path filtered out — pick owners reference [1]=outer, [2]=hole
    for (const t of tris.pick) expect([1, 2]).toContain(t.owner);
  });

  it('wrapped lift EQUALS the flat lift — subdivision killed the dip, not a bigger number (round 4)', () => {
    // round 3 needed 0.2 wrapped: the COARSE shade's interior triangles
    // dipped up to 0.45mm below the lifted surface on Alice's ankh (9 of
    // 99 triangles dove under the stock) — no lift under 0.45 could win.
    // With FILL_SUBDIVIDE_MAX_EDGE = 1.0 the worst dip is r(1-cos(1/2r))
    // ≈ 0.0125mm, so the flat 0.05 clears with 4x margin (measured in-app:
    // worst dip 0.0122, 0 triangles under the stock, 100% coverage
    // face-on at polygonOffsetUnits -1). The pin: same lift as flat, and
    // the fineness rule that earns it stays in place.
    expect(FILL_SHADE_LIFT_WRAPPED).toBe(FILL_SHADE_LIFT);
    expect(FILL_SUBDIVIDE_MAX_EDGE).toBeLessThan(1.5);
  });

  it('closed but unpainted paths drop out (the generation rule verbatim)', () => {
    const tris = artworkFillTris(
      [{ points: rect3(0, 0, 10, 10), closed: true, filled: false }],
      new Set([0]),
      'flat',
      0,
    );
    expect(tris.verts).toEqual([]);
    expect(tris.pick).toEqual([]);
    expect(tris.shade).toEqual([]);
  });

  it('pick covers UNSELECTED regions too — a region is clickable before anything is', () => {
    // nothing selected: no shade, but both loops still own pick surfaces
    const tris = artworkFillTris(ankhPaths, new Set(), 'flat', 0);
    expect(tris.shade).toEqual([]);
    expect(tris.pick.length).toBeGreaterThan(0);
    const owners = new Set(tris.pick.map((t) => t.owner));
    expect(owners).toEqual(new Set([0, 1]));
    // the counter's fans are the DEEP ones — a click there must resolve
    // to the counter, not the body outline around it
    expect(Math.max(...tris.pick.filter((t) => t.owner === 1).map((t) => t.depth))).toBe(1);
    expect(Math.max(...tris.pick.filter((t) => t.owner === 0).map((t) => t.depth))).toBe(0);
  });

  it('shade covers the selection only: outer+counter → ring, never the counter interior', () => {
    const tris = artworkFillTris(ankhPaths, new Set([0, 1]), 'flat', 0);
    expect(tris.shade.length).toBeGreaterThan(0);
    // the oracle is the POLYGONIZED hole (what the shade is actually
    // carved against), not the raw loop — subdivision midpoints hug the
    // carved boundary, which differs from the raw counter by float
    // jitter, and a sliver centroid there is a tessellation fact, not a
    // carve defect (round 4)
    const carved = polygonizeRegion2D(
      ankhPaths.filter((_, i) => [0, 1].includes(i)).map((p) => p.points),
    );
    const hole = carved.find((r) => r.holes.length > 0)?.holes[0] ?? ankh.loops[1];
    // winding number, NOT pointInLoop: round 4 found pointInLoop's
    // crossing interpolation mirrored (numerator anchored at yi, base at
    // xj — t reads 1−t), so its parity flips on rays that pass between
    // the mirrored and true crossing x (72 of 4287 subdivided centroids
    // misclassified, ALL with winding 0). Filed for Alice's adjudication;
    // this test keeps the rigorous oracle so it pins the geometry, not
    // the oracle's bug.
    const inside = (px: number, py: number): boolean => {
      let w = 0;
      for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
        const x1 = hole[j].x, y1 = hole[j].y, x2 = hole[i].x, y2 = hole[i].y;
        if (y1 <= py) {
          if (y2 > py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0) w++;
        } else if (y2 <= py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0) w--;
      }
      return w !== 0;
    };
    for (const [a, b, c] of tris.shade) {
      // triangle CENTROIDS, not verts — ring verts may graze the counter
      // boundary, but no centroid of a properly-carved ring sits in the hole
      const cx = (tris.verts[a].x + tris.verts[b].x + tris.verts[c].x) / 3;
      const cy = (tris.verts[a].y + tris.verts[b].y + tris.verts[c].y) / 3;
      expect(inside(cx, cy)).toBe(false);
    }
  });

  it('outer alone shades the FULL body — the raster clears the counter too when it is not selected', () => {
    // the generator's even-odd runs over the SELECTED loops only: an
    // unselected counter contributes no crossings, so the raster (and
    // the shade with it) reads the body whole
    const tris = artworkFillTris(ankhPaths, new Set([0]), 'flat', 0);
    expect(tris.shade.length).toBeGreaterThan(0);
    const mid = tris.shade.some(([a, b, c]) => {
      const cx = (tris.verts[a].x + tris.verts[b].x + tris.verts[c].x) / 3;
      const cy = (tris.verts[a].y + tris.verts[b].y + tris.verts[c].y) / 3;
      return pointInLoop(cx, cy, ankh.loops[1]);
    });
    expect(mid).toBe(true);
  });

  it('wrapped: verts sit ON the artwork cylinder, lifted radially', () => {
    const r = 10;
    const a = 0.2; // ±0.2 rad ≈ ±11.5° window around local angle 0
    const patch = {
      points: [
        onCyl(-a, 0, r),
        onCyl(a, 0, r),
        onCyl(a, 5, r),
        onCyl(-a, 5, r),
      ],
      closed: true,
      filled: true,
    };
    const tris = artworkFillTris([patch], new Set([0]), 'wrapped', 2 * r);
    // round 4: the quad (4mm arc × 5mm axial) is midpoint-subdivided in
    // the (u,v) domain until every 2D edge fits FILL_SUBDIVIDE_MAX_EDGE
    // (128 tris per mesh measured: 2 roots × 4³ — the 4×5 root halves
    // three levels); the pin is the INVARIANT, not the count
    const edge2d = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => {
      // surface-mm: arc around the axis + axial separation
      const arc =
        (r + FILL_SHADE_LIFT_WRAPPED) *
        Math.abs(Math.atan2(p.y, p.z) - Math.atan2(q.y, q.z));
      return Math.hypot(arc, p.x - q.x);
    };
    const check = (set: [number, number, number][]) => {
      for (const [i, j, k] of set) {
        const vs = [tris.verts[i], tris.verts[j], tris.verts[k]];
        const longest = Math.max(
          edge2d(vs[0], vs[1]),
          edge2d(vs[1], vs[2]),
          edge2d(vs[2], vs[0]),
        );
        expect(longest).toBeLessThanOrEqual(FILL_SUBDIVIDE_MAX_EDGE + 1e-9);
      }
    };
    check(tris.pick.map((t) => t.v));
    check(tris.shade);
    expect(tris.pick.length).toBeGreaterThan(2);
    expect(tris.shade.length).toBeGreaterThan(2);
    const all = [...tris.pick.flatMap((t) => t.v), ...tris.shade.flat()].map((i) => tris.verts[i]);
    for (const v of all) {
      expect(Math.hypot(v.y, v.z)).toBeCloseTo(r + FILL_SHADE_LIFT_WRAPPED, 9);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(5);
    }
    // the wrap is centered on local angle 0 (+Z): every corner sits
    // within ±0.2 rad of it, so z dominates y throughout
    for (const v of all) expect(v.z).toBeGreaterThan(Math.abs(v.y));
  });

  it('wrapped: a loop straddling the seam unwraps CONTINUOUS (no fold)', () => {
    const r = 10;
    // a loop crossing local ±180°: th from +179° to +181° (≡ −179°)
    const q = (thDeg: number, x: number) =>
      onCyl((thDeg * Math.PI) / 180, x, r);
    const patch = {
      points: [q(179, 0), q(181, 0), q(181, 4), q(179, 4)],
      closed: true,
      filled: true,
    };
    const tris = artworkFillTris([patch], new Set([0]), 'wrapped', 2 * r);
    // unwrapped, the loop spans a thin 2° band; folded at the seam it
    // would span 358° and the triangulation would cover the cylinder —
    // round 4: subdivision multiplies triangle counts, so the pin is the
    // ANGULAR SPREAD of the shade (every vert within a few degrees of
    // 180°), not a count
    expect(tris.shade.length).toBeGreaterThan(0);
    const spread = (set: number[]) => {
      // deviation from the seam (180°): atan2 wraps ±180° there, so the
      // raw spread across the seam reads ~358° — take signed deviation
      const dev = (i: number) => {
        const v = tris.verts[i];
        const ang = (Math.atan2(v.y, v.z) * 180) / Math.PI;
        return ((ang - 180 + 180) % 360 + 360) % 360 - 180;
      };
      const ds = set.map(dev);
      return Math.max(...ds) - Math.min(...ds);
    };
    expect(spread(tris.shade.flat())).toBeLessThan(6); // the 2° band + midpoint jitter
    for (const i of tris.shade.flat()) {
      expect(Math.hypot(tris.verts[i].y, tris.verts[i].z)).toBeCloseTo(r + FILL_SHADE_LIFT_WRAPPED, 9);
    }
  });
});

describe('densifyWrappedPath — the outline lines get the shade\'s fineness rule (round 5)', () => {
  // a long chord on the artwork cylinder: one document segment spanning
  // 20° at R10 — a 3.49mm surface edge, the class that measured 0.23mm
  // of dip on Alice's real ankh (probes/measure-outline-dip.mjs, before)
  const r = 10;
  const chord = (aDeg: number, bDeg: number, x0: number, x1: number): Vec3[] => [
    onCyl((aDeg * Math.PI) / 180, x0, r),
    onCyl((bDeg * Math.PI) / 180, x1, r),
  ];

  it('splits a long on-cylinder chord so no 2D edge exceeds the max and every point rides the cylinder', () => {
    const out = densifyWrappedPath(chord(-10, 10, 0, 6), 2 * r);
    expect(out[0]).toEqual(chord(-10, 10, 0, 6)[0]); // endpoints pass through EXACTLY
    expect(out[out.length - 1]).toEqual(chord(-10, 10, 0, 6)[1]);
    const edge2d = (p: Vec3, q: Vec3) =>
      Math.hypot(r * Math.abs(Math.atan2(p.y, p.z) - Math.atan2(q.y, q.z)), p.x - q.x);
    let worst = 0;
    for (let i = 0; i < out.length - 1; i++) worst = Math.max(worst, edge2d(out[i], out[i + 1]));
    expect(worst).toBeLessThanOrEqual(FILL_SUBDIVIDE_MAX_EDGE + 1e-9);
    for (const p of out) expect(Math.hypot(p.y, p.z)).toBeCloseTo(r, 9);
    // no lift on the lines: 8 sub-edges for the 6.9mm hypot, at most
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.length).toBeGreaterThanOrEqual(7);
  });

  it('the sub-edges\' chord dip stays under r(1-cos(maxEdge/2r)) — 0.0125mm at R10, was 0.23 raw', () => {
    const out = densifyWrappedPath(chord(-12, 12, 0, 4), 2 * r);
    const bound = r * (1 - Math.cos(FILL_SUBDIVIDE_MAX_EDGE / (2 * r)));
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      for (let k = 1; k < 32; k++) {
        const t = k / 32;
        const rad = Math.hypot(
          a.y + (b.y - a.y) * t,
          a.z + (b.z - a.z) * t,
        );
        expect(r - rad).toBeLessThanOrEqual(bound + 1e-9);
      }
    }
  });

  it('a seam-straddling chord unwraps the short way (no 358° fold)', () => {
    // 179° → 181°: folded, interpolation would sweep through 0°/−z; the
    // short way hugs 180° (z ≈ −r, y slightly positive throughout)
    const out = densifyWrappedPath(chord(179, 181, 0, 2), 2 * r);
    expect(out.length).toBeGreaterThan(2); // it actually densified
    for (const p of out) {
      // within ~1° of the seam (z ≈ −r); the long way around would sweep
      // z up through +r. y flips sign at exactly 180°, so it pins nothing.
      expect(p.z).toBeLessThan(-r * Math.cos((2 * Math.PI) / 180));
    }
  });

  it('no declared diameter → the polyline returns unchanged (the flat fallback)', () => {
    const pts = chord(-10, 10, 0, 6);
    expect(densifyWrappedPath(pts, 0)).toBe(pts);
  });
});
