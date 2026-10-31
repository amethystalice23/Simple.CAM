import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bitmapFromImageData, decodeBitmapFile, rotateGray90 } from '../bitmapImport';
import type { GrayBitmap } from '../bitmapImport';
import { heightmapBoxGeometry, heightmapCylinderGeometry } from '../heightmap';
import { halftoneArtwork } from '../halftone';

// ------------------------------------------------------------ helpers

/** solid-luma bitmap */
const solid = (w: number, h: number, luma: number): GrayBitmap => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h).fill(luma),
});

/** bitmap from per-pixel rows (row 0 = image top) */
const fromRows = (rows: number[][]): GrayBitmap => ({
  width: rows[0].length,
  height: rows.length,
  data: new Uint8Array(rows.flat()),
});

const positions = (geo: THREE.BufferGeometry): number[][] => {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  const out: number[][] = [];
  for (let i = 0; i < attr.count; i++) out.push([attr.getX(i), attr.getY(i), attr.getZ(i)]);
  return out;
};

const bbox = (pts: number[][]): { min: number[]; max: number[] } => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  return { min, max };
};

/**
 * Watertight-manifold check on the triangle soup: quantize vertex
 * positions to edge keys, assert every undirected edge is shared by
 * EXACTLY two triangles, no zero-area triangle, and the divergence sum
 * gives positive volume (consistent outward orientation).
 */
const expectWatertight = (geo: THREE.BufferGeometry) => {
  const pts = positions(geo);
  expect(pts.length % 3).toBe(0);
  const key = (p: number[]) => `${p[0].toFixed(6)}|${p[1].toFixed(6)}|${p[2].toFixed(6)}`;
  const edges = new Map<string, number>();
  let volume6 = 0;
  for (let t = 0; t < pts.length; t += 3) {
    const [a, b, c] = [pts[t], pts[t + 1], pts[t + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = ab[1] * ac[2] - ab[2] * ac[1];
    const cy = ab[2] * ac[0] - ab[0] * ac[2];
    const cz = ab[0] * ac[1] - ab[1] * ac[0];
    expect(Math.hypot(cx, cy, cz)).toBeGreaterThan(1e-9); // no zero-area triangle
    volume6 += a[0] * cx + a[1] * cy + a[2] * cz;
    for (const [u, v] of [
      [key(a), key(b)],
      [key(b), key(c)],
      [key(c), key(a)],
    ]) {
      const k = u < v ? `${u}~${v}` : `${v}~${u}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const count of edges.values()) expect(count).toBe(2);
  expect(volume6 / 6).toBeGreaterThan(0);
};

// ---------------------------------------------------- bitmapFromImageData

describe('bitmapFromImageData', () => {
  it('converts known RGB pixels to Rec.601 luma, rounded', () => {
    // white, black, the three pure channels (weights × 255: 76.245 /
    // 149.685 / 29.07 → 76 / 150 / 29), mid grey
    const img = {
      width: 6,
      height: 1,
      data: [
        255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 128,
        128, 255,
      ],
    };
    const gray = bitmapFromImageData(img);
    expect(gray.width).toBe(6);
    expect(gray.height).toBe(1);
    expect(Array.from(gray.data)).toEqual([255, 0, 76, 150, 29, 128]);
  });

  it('mid grey maps to itself and rounding is applied', () => {
    const gray = bitmapFromImageData({ width: 2, height: 1, data: [128, 128, 128, 255, 127, 127, 127, 255] });
    expect(Array.from(gray.data)).toEqual([128, 127]);
  });
});

describe('decodeBitmapFile', () => {
  it('exists as the thin browser wrapper (node env cannot run it)', () => {
    expect(typeof decodeBitmapFile).toBe('function');
  });
});

// ---------------------------------------------------------- rotateGray90

describe('rotateGray90', () => {
  it('rotates 90° clockwise: dims swap, top row becomes the right column', () => {
    // A B   →   E C A
    // C D   →   F D B
    // E F
    const gray = fromRows([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    const rot = rotateGray90(gray);
    expect(rot.width).toBe(3);
    expect(rot.height).toBe(2);
    expect(Array.from(rot.data)).toEqual([5, 3, 1, 6, 4, 2]);
  });

  it('four rotations round-trip to the source', () => {
    const gray = fromRows([
      [10, 20, 30],
      [40, 50, 60],
    ]);
    let cur = gray;
    for (let k = 0; k < 4; k++) cur = rotateGray90(cur);
    expect(cur.width).toBe(gray.width);
    expect(cur.height).toBe(gray.height);
    expect(Array.from(cur.data)).toEqual(Array.from(gray.data));
  });
});

// ---------------------------------------------------- heightmapBoxGeometry

describe('heightmapBoxGeometry', () => {
  const boxParams = { spanX: 2, spanY: 2, thickness: 3, depth: 1 };

  it('all-white image → flat crown at z = thickness, exact bounding box', () => {
    const geo = heightmapBoxGeometry(solid(4, 4, 255), boxParams);
    const pts = positions(geo);
    const bb = bbox(pts);
    expect(bb.min).toEqual([-1, -1, 0]);
    expect(bb.max).toEqual([1, 1, 3]);
    for (const p of pts) expect(p[2] === 0 || p[2] === 3).toBe(true);
  });

  it('triangle count: 2 per top cell + 2 per wall edge + bottom fan', () => {
    // NX = NY = 4 → 9 top cells (18 tris) + 12 wall edges (24) + 12-triangle
    // bottom center fan (one per perimeter lattice node) = 54
    const geo = heightmapBoxGeometry(solid(4, 4, 255), boxParams);
    expect(positions(geo).length / 3).toBe(54);
  });

  it('two-column image → exact box-averaged z at the front-row nodes', () => {
    // columns 0,1 black; 2,3 white — lattice xs = [−1, −1/3, 1/3, 1]
    const geo = heightmapBoxGeometry(fromRows([
      [0, 0, 255, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
    ]), boxParams);
    const zAt = (want: number): number => {
      for (const [x, y, z] of positions(geo)) {
        if (Math.abs(y + 1) < 1e-9 && z > 0.5 && Math.abs(x - want) < 1e-5) return z;
      }
      return NaN;
    };
    expect(zAt(-1)).toBeCloseTo(2, 6); // dark → deep
    expect(zAt(-1 / 3)).toBeCloseTo(2, 6);
    expect(zAt(1 / 3)).toBeCloseTo(3, 6); // white → crown
    expect(zAt(1)).toBeCloseTo(3, 6);
  });

  it('invert flips the carving direction', () => {
    const geo = heightmapBoxGeometry(
      fromRows([
        [0, 0, 255, 255],
        [0, 0, 255, 255],
        [0, 0, 255, 255],
        [0, 0, 255, 255],
      ]),
      { ...boxParams, invert: true },
    );
    const zAt = (want: number): number => {
      for (const [x, y, z] of positions(geo)) {
        if (Math.abs(y + 1) < 1e-9 && z > 0.5 && Math.abs(x - want) < 1e-5) return z;
      }
      return NaN;
    };
    expect(zAt(-1)).toBeCloseTo(3, 6); // inverted: dark stays at the crown
    expect(zAt(-1 / 3)).toBeCloseTo(3, 6);
    expect(zAt(1 / 3)).toBeCloseTo(2, 6);
    expect(zAt(1)).toBeCloseTo(2, 6);
  });

  it('is a watertight manifold with outward orientation', () => {
    expectWatertight(heightmapBoxGeometry(solid(4, 4, 255), boxParams));
    expectWatertight(
      heightmapBoxGeometry(
        fromRows([
          [0, 255, 0, 255],
          [255, 0, 255, 0],
          [0, 255, 0, 255],
          [255, 0, 255, 0],
        ]),
        boxParams,
      ),
    );
  });

  it('caps the lattice at the source pixel resolution and 256', () => {
    // 32px source, huge face → NX caps at 32 nodes, not span/spacing
    const geo = heightmapBoxGeometry(solid(32, 32, 255), { spanX: 1000, spanY: 1000, thickness: 5, depth: 1, sampleSpacing: 0.1 });
    const bb = bbox(positions(geo));
    expect(bb.min[0]).toBeCloseTo(-500, 6);
    expect(bb.max[0]).toBeCloseTo(500, 6);
    const topXs = new Set(positions(geo).filter((p) => p[2] === 5).map((p) => p[0].toFixed(6)));
    expect(topXs.size).toBe(32);
  });
});

// ------------------------------------------------- heightmapCylinderGeometry

describe('heightmapCylinderGeometry', () => {
  const cylParams = { radius: 5, length: 4, depth: 1, sampleSpacing: 0.5 };
  // 8px source → Nθ = max(8, min(ceil(2π·5/0.5)=63, 8, 256)) = 8, NA = 8

  it('all-white image → every surface vertex at exactly the stock radius', () => {
    const geo = heightmapCylinderGeometry(solid(8, 8, 255), cylParams);
    const pts = positions(geo);
    for (const [x, y, z] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(2 + 1e-9);
      const rr = Math.hypot(y, z);
      if (rr > 1e-9) expect(rr).toBeCloseTo(5, 6);
      else expect([y, z]).toEqual([0, 0]); // the two flat cap centers
    }
    expectWatertight(geo);
  });

  it('two-tone image → black half at radius − depth, white half at radius', () => {
    const rows = Array.from({ length: 8 }, () => [0, 0, 0, 0, 255, 255, 255, 255]);
    const geo = heightmapCylinderGeometry(fromRows(rows), cylParams);
    const pts = positions(geo);
    // θ col i at −π + i·π/4: col 1 = −135° (black → r 4), col 5 = +45° (white → r 5)
    let sawBlack = false;
    let sawWhite = false;
    for (const [x, y, z] of pts) {
      const rr = Math.hypot(y, z);
      if (rr < 1e-9) continue;
      const th = Math.atan2(y, z);
      if (Math.abs(th + 3 * Math.PI / 4) < 1e-6 && Math.abs(x + 2) < 1e-6) {
        expect(rr).toBeCloseTo(4, 6);
        sawBlack = true;
      }
      if (Math.abs(th - Math.PI / 4) < 1e-6 && Math.abs(x - 2) < 1e-6) {
        expect(rr).toBeCloseTo(5, 6);
        sawWhite = true;
      }
      expect(rr).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(rr).toBeLessThanOrEqual(5 + 1e-6);
    }
    expect(sawBlack).toBe(true);
    expect(sawWhite).toBe(true);
    expectWatertight(geo);
  });

  it('seam closure: first and last θ columns share exact positions', () => {
    const rows = Array.from({ length: 8 }, () => [0, 0, 0, 0, 255, 255, 255, 255]);
    const pts = positions(heightmapCylinderGeometry(fromRows(rows), cylParams));
    // the wrapped seam nodes sample the SAME θ=±π cell → same darkness
    // (4.5) and, with y forced to exact 0, bitwise-equal positions
    const seam = pts.filter(([, y, z]) => y === 0 && z < -1);
    const byX = new Map<number, number>();
    for (const [x, , z] of seam) {
      expect(z).toBeCloseTo(-4.5, 9);
      byX.set(x, (byX.get(x) ?? 0) + 1);
    }
    expect(byX.size).toBe(8);
    for (const n of byX.values()) expect(n).toBeGreaterThanOrEqual(2);
  });

  it('end caps close the solid (flat disk centers at both ends)', () => {
    const pts = positions(heightmapCylinderGeometry(solid(8, 8, 255), cylParams));
    expect(pts.some(([x, y, z]) => Math.abs(x + 2) < 1e-9 && y === 0 && z === 0)).toBe(true);
    expect(pts.some(([x, y, z]) => Math.abs(x - 2) < 1e-9 && y === 0 && z === 0)).toBe(true);
  });

  it('clamps an over-deep carve to 0.95·radius', () => {
    const geo = heightmapCylinderGeometry(
      solid(8, 8, 0),
      { radius: 5, length: 4, depth: 999, sampleSpacing: 0.5 },
    );
    for (const [, y, z] of positions(geo)) {
      const rr = Math.hypot(y, z);
      if (rr > 1e-9) expect(rr).toBeCloseTo(5 * 0.05, 6); // radius − 0.95·radius
    }
  });

  it('is a watertight manifold with outward orientation', () => {
    expectWatertight(heightmapCylinderGeometry(solid(8, 8, 255), cylParams));
  });
});

// ------------------------------------------------------- halftoneArtwork

/** dot centers + radii from the emitted 24-gons (bbox center / half-extent) */
const dots = (art: ReturnType<typeof halftoneArtwork>) =>
  art.paths.map((ring) => {
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return { cx, cy, r: (Math.max(...xs) - Math.min(...xs)) / 2 };
  });

describe('halftoneArtwork', () => {
  const face = { faceWidth: 10, faceHeight: 10, spacing: 1, angleDeg: 0 };

  it('all-white image → no dots (coverage floor)', () => {
    const art = halftoneArtwork(solid(8, 8, 255), face);
    expect(art.paths).toHaveLength(0);
    expect(art.width).toBe(10);
    expect(art.height).toBe(10);
  });

  it('all-black image → lattice of corner-meeting dots (r = spacing/√2)', () => {
    const art = halftoneArtwork(solid(8, 8, 0), face);
    expect(art.paths.length).toBeGreaterThan(0);
    const ds = dots(art);
    for (const d of ds) {
      expect(d.r).toBeCloseTo(1 / Math.SQRT2, 6); // the lattice-corner bound
    }
    for (let k = 0; k < art.paths.length; k++) {
      // 24 segments PLUS the closing point — endpoints coincident (the
      // explicit-Z convention), or the fill pass sees an open polyline
      expect(art.paths[k].length).toBe(25);
      expect(art.paths[k][24]).toEqual(art.paths[k][0]);
      expect(art.meta[k]).toEqual({ closed: true, filled: true });
    }
    // centers on the rotated (here axis-aligned) lattice, one cell apart
    const uniq = (v: number[]) => [...new Set(v.map((x) => x.toFixed(9)))].map(Number).sort((a, b) => a - b);
    const xs = uniq(ds.map((d) => d.cx));
    const ys = uniq(ds.map((d) => d.cy));
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeCloseTo(1, 9);
    for (let k = 1; k < ys.length; k++) expect(ys[k] - ys[k - 1]).toBeCloseTo(1, 9);
    // centers never leave the face + one cell of margin
    for (const d of ds) {
      expect(d.cx).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(d.cx).toBeLessThanOrEqual(11 + 1e-9);
      expect(d.cy).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(d.cy).toBeLessThanOrEqual(11 + 1e-9);
    }
  });

  it('50% grey (luma 128) → area-true radius spacing·√(coverage/π)', () => {
    const art = halftoneArtwork(solid(8, 8, 128), face);
    const coverage = 1 - 128 / 255;
    const want = 1 * Math.sqrt(coverage / Math.PI);
    for (const d of dots(art)) expect(d.r).toBeCloseTo(want, 6);
    expect(art.paths.length).toBeGreaterThan(0);
  });

  it('minCoverage is honored', () => {
    expect(halftoneArtwork(solid(8, 8, 250), face).paths).toHaveLength(0); // c ≈ 0.0196
    expect(halftoneArtwork(solid(8, 8, 240), face).paths.length).toBeGreaterThan(0); // c ≈ 0.0588
    expect(
      halftoneArtwork(solid(8, 8, 240), { ...face, minCoverage: 0.1 }).paths,
    ).toHaveLength(0);
  });

  it('45° screen on a non-square face changes the dot count', () => {
    const wide = { faceWidth: 12, faceHeight: 8, spacing: 1, angleDeg: 0 };
    const n0 = halftoneArtwork(solid(8, 8, 0), wide).paths.length;
    const n45 = halftoneArtwork(solid(8, 8, 0), { ...wide, angleDeg: 45 }).paths.length;
    expect(n0).toBeGreaterThan(0);
    expect(n45).toBeGreaterThan(0);
    expect(n45).not.toBe(n0);
    // rotated centers still respect the face + 1-cell margin
    for (const d of dots(halftoneArtwork(solid(8, 8, 0), { ...wide, angleDeg: 45 }))) {
      expect(d.cx).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(d.cx).toBeLessThanOrEqual(13 + 1e-9);
      expect(d.cy).toBeGreaterThanOrEqual(-1 - 1e-9);
      expect(d.cy).toBeLessThanOrEqual(9 + 1e-9);
    }
  });

  it('stretches a 2×1 image across a square face', () => {
    const art = halftoneArtwork(solid(2, 1, 0), face);
    const ds = dots(art);
    expect(ds.length).toBeGreaterThan(0);
    expect(Math.min(...ds.map((d) => d.cx))).toBeLessThanOrEqual(0);
    expect(Math.max(...ds.map((d) => d.cx))).toBeGreaterThanOrEqual(10);
  });

  it('throws when the screen is finer than the 20000-dot guard', () => {
    expect(() =>
      halftoneArtwork(solid(8, 8, 0), { faceWidth: 100000, faceHeight: 100000, spacing: 1, angleDeg: 0 }),
    ).toThrow('dot spacing too fine for this image — increase it');
  });
});
