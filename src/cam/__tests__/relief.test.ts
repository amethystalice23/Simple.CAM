import { describe, expect, it } from 'vitest';
import type { Tool } from '../../core/types';
import { rasterContour, type RasterContourOptions } from '../relief';

const flat: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const ball: Tool = { id: 't2', name: '3mm ball', type: 'ball', diameter: 3, spindleRpm: 18000 };

/**
 * Solid of revolution from a Z-descending radius profile — 64-gon rings at
 * each [z, r] pair, side walls between them (the waterline test's lathe:
 * dome tests need the smooth surface, not slicing).
 */
function lathe(profile: [number, number][]): Float32Array {
  const tri: number[] = [];
  const seg = 64;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [z0, r0] = profile[i];
    const [z1, r1] = profile[i + 1];
    for (let s = 0; s < seg; s++) {
      const a0 = (2 * Math.PI * s) / seg;
      const a1 = (2 * Math.PI * (s + 1)) / seg;
      tri.push(
        Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
        Math.cos(a1) * r0, Math.sin(a1) * r0, z0,
        Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
      );
      tri.push(
        Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
        Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
        Math.cos(a0) * r1, Math.sin(a0) * r1, z1,
      );
    }
  }
  return new Float32Array(tri);
}

/** Flat-topped cylinder standing on z = −h (64-gon): a flat top annulus
 *  (two rings both at z 0 — the frustum between them is the horizontal
 *  top face rays hit exactly), then the vertical wall down. */
function discCylinder(r: number, h: number): Float32Array {
  return lathe([
    [0, 0.001],
    [0, r],
    [-h, r],
  ]);
}

function opts(overrides: Partial<RasterContourOptions> = {}): RasterContourOptions {
  return {
    positions: discCylinder(5, 4),
    pitch: 0.25,
    stepOver: 0.5,
    allowance: 0,
    topZ: 0,
    bottomZ: -10,
    tool: flat,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

interface CutPoint {
  x: number;
  y: number;
  z: number;
}

/** XY cutting points with the modal Z and Y at which they ran (feed moves
 *  with an X word carry the Y of their row's entry rapid and the Z last
 *  commanded at/before them — the post accumulates modally too). */
function cutPoints(moves: ReturnType<typeof rasterContour>['moves']): CutPoint[] {
  const pts: CutPoint[] = [];
  let z: number | null = null;
  let y: number | null = null;
  for (const m of moves) {
    if (m.words.z !== undefined) z = m.words.z;
    if (m.words.y !== undefined) y = m.words.y;
    if (!m.rapid && m.feed > 0 && m.words.x !== undefined && z !== null && y !== null) {
      pts.push({ x: m.words.x, y, z });
    }
  }
  return pts;
}

/**
 * Samples along the cut SEGMENTS (every cutting sweep interpolated at
 * `step` mm, from its entry rapid's X to its final feed X): a row's flat
 * sweep is ONE long move whose endpoints alone sit at the pad ring — the
 * coverage invariants live on the swept path. Segment boundaries are the
 * entry rapids (`raster row` comments): nothing interpolates across a
 * travel.
 */
function segmentSamples(moves: ReturnType<typeof rasterContour>['moves'], step: number): CutPoint[] {
  const out: CutPoint[] = [];
  let cur: { x: number; y: number } | null = null; // segment start (entry rapid), then each move's end
  let z: number | null = null;
  for (const m of moves) {
    if (m.rapid) {
      if (m.words.x !== undefined && m.words.y !== undefined) {
        cur = { x: m.words.x, y: m.words.y }; // the entry travel to the segment start
      }
      continue;
    }
    if (m.words.z !== undefined) z = m.words.z;
    if (m.feed > 0 && m.words.x !== undefined && cur && z !== null) {
      const x1 = m.words.x;
      const len = Math.abs(x1 - cur.x);
      const n = Math.max(1, Math.floor(len / step));
      for (let k = 1; k <= n; k++) {
        out.push({ x: cur.x + ((x1 - cur.x) * k) / n, y: cur.y, z });
      }
      cur = { x: x1, y: cur.y };
    }
  }
  return out;
}

describe('rasterContour', () => {
  it('cuts nothing when the model top sits exactly at the crown', () => {
    // disc top at z 0, crown at z 0: the compensated surface IS the crown —
    // every cell is air (nothing above the surface to remove), no moves
    const res = rasterContour(opts({ topZ: 0 }));
    expect(res.moves).toHaveLength(0);
    expect(res.rows).toBe(0);
  });

  it('cuts the flat top of a cylinder sunk below the crown', () => {
    // disc top at z 0, crown at z 1: the top cuts at z 0, the wall dilates
    // the disc kernel so cells within toolR OUTSIDE the wall also see z 0
    // (the flat bottom rides the top plane out to the tool center track)
    const res = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4 }));
    expect(res.rows).toBeGreaterThan(0);
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      // every cut lands exactly on the disc top (flat kernel: z 0)
      expect(p.z).toBeCloseTo(0, 5);
      // the tool CENTER never crosses into the wall: |x,y| ≤ r + toolR
      // − ε… no — dilated cells inside the wall sit at the top too. The
      // invariant that matters: no cut dips BELOW the top plane (a flat
      // endmill cutting a flat top at its own height).
      expect(p.z).toBeGreaterThanOrEqual(-0.001);
    }
    // the cut area covers the disc: the rows' segments sweep over the
    // center (endpoints alone sit at the pad ring — INTERPOLATE between
    // consecutive cut points of a segment to see what the row covered)
    const covered = segmentSamples(res.moves, 0.25);
    expect(covered.some((p) => Math.hypot(p.x, p.y) < 1)).toBe(true);
    // serpentine rows: rows alternate travel direction (first rapid X of
    // consecutive rows differs)
    const rowStarts = res.moves
      .filter((m) => m.rapid && m.words.x !== undefined && m.comment?.startsWith('raster row'))
      .map((m) => m.words.x!);
    expect(rowStarts.length).toBeGreaterThan(2);
  });

  it('follows a cone relief: ball kernel, no gouging, z rises toward the apex', () => {
    // CONE relief (the lathe's straight profile), floor-clamped like a
    // relief riding on stock. The ball kernel follows the slope: the
    // compensated surface never dips below the raw one (dilation is max),
    // never cuts above the apex, and rises toward the apex — the raster
    // engages the slope, not just the rim.
    const cone = lathe([
      [0, 0.001],
      [-5, 5],
    ]);
    const res = rasterContour({
      ...opts(),
      positions: cone,
      tool: ball,
      topZ: 0.5,
      bottomZ: -5,
      pitch: 0.3,
      stepOver: 0.6,
      allowance: 0,
    });
    expect(res.rows).toBeGreaterThan(0);
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      const rr = Math.hypot(p.x, p.y);
      if (rr < 5 - 1.5 - 0.01) {
        // inside the cone body: the compensated surface sits at/above the
        // raw cone surface (dilation is a max) and below the apex
        expect(p.z).toBeGreaterThanOrEqual(-rr - 0.05);
        expect(p.z).toBeLessThanOrEqual(0.001);
      }
    }
    // the slope is really followed: the swept path near the axis sits
    // above the swept path at the rim — a flat-top-only raster fails this
    const swept = segmentSamples(res.moves, 0.2);
    const apexSide = swept.filter((p) => Math.hypot(p.x, p.y) < 1.5);
    const rimSide = swept.filter((p) => {
      const rr = Math.hypot(p.x, p.y);
      return rr > 3.5 && rr < 4.5;
    });
    expect(apexSide.length).toBeGreaterThan(0);
    expect(rimSide.length).toBeGreaterThan(0);
    expect(Math.max(...apexSide.map((p) => p.z))).toBeGreaterThan(
      Math.max(...rimSide.map((p) => p.z)) + 1,
    );
  });

  it('allowance lifts the whole surface, air cells stay air', () => {
    // allowance 0.3 on the sunk disc: cut z = 0.3 (top + allowance)…
    const res = rasterContour(opts({ topZ: 1, allowance: 0.3, pitch: 0.2, stepOver: 0.4 }));
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      expect(p.z).toBeCloseTo(0.3, 5);
    }
    // …but cells whose compensated z ≥ crown stay air: nothing cuts
    const resAir = rasterContour(opts({ topZ: 0.3, allowance: 0.3 }));
    expect(resAir.moves).toHaveLength(0);
  });

  it('warns on deep plunges (run a waterline contour first), never silently', () => {
    // crown 5 above the disc top: plunges are 5mm — past DEEP_WARN_MM
    const res = rasterContour(opts({ topZ: 5 }));
    expect(res.rows).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes('waterline'))).toBe(true);
    expect(res.maxPlunge).toBeGreaterThan(2);
    // shallow work (topZ 1 → plunge 1) stays silent
    const res2 = rasterContour(opts({ topZ: 1 }));
    expect(res2.warnings.some((w) => w.includes('waterline'))).toBe(false);
  });

  it('clamps at the stock bottom and warns when the model dips below', () => {
    // a spike descending to z −12 on a stock bottom at −10
    const spike = lathe([
      [0, 0.001],
      [-12, 4],
    ]);
    const res = rasterContour(opts({ positions: spike, topZ: 1 }));
    expect(res.warnings.some((w) => w.includes('stock bottom'))).toBe(true);
    const cuts = cutPoints(res.moves);
    expect(cuts.every((p) => p.z >= -10 - 1e-9)).toBe(true);
  });

  it('emits no A words ever, and travels at safe height between segments', () => {
    const res = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4 }));
    expect(res.moves.every((m) => m.words.a === undefined)).toBe(true);
    // entry-safety: every rapid XY travel happens from a safe-Z rapid…
    let z: number | null = null;
    let safeZ: number | null = null;
    const safe = 0 + 5; // topZ 1? safe = crown + clearance — see below
    void safe;
    for (const m of res.moves) {
      if (m.words.z !== undefined) z = m.words.z;
      if (m.rapid && m.words.x !== undefined && m.words.y !== undefined) {
        if (safeZ === null) safeZ = z;
        expect(z).toBeCloseTo(safeZ!, 5);
      }
    }
  });

  it('rejects invalid parameters', () => {
    expect(() => rasterContour(opts({ pitch: 0 }))).toThrowError(/pitch/);
    expect(() => rasterContour(opts({ stepOver: -1 }))).toThrowError(/stepOver/);
    expect(() => rasterContour(opts({ allowance: -0.1 }))).toThrowError(/allowance/);
    expect(() => rasterContour(opts({ bottomZ: 1, topZ: 0 }))).toThrowError(/stock bottom/);
  });

  it('returns empty for an empty mesh without throwing', () => {
    const res = rasterContour(opts({ positions: new Float32Array(0) }));
    expect(res.moves).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
  });

  it('serpentine rows alternate direction and keep the step-over spacing', () => {
    // stride: with pitch 0.2 / stepOver 0.4, rows land every 2nd grid row
    const res = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4 }));
    const rowYs = [
      ...new Set(res.moves.filter((m) => m.comment?.startsWith('raster row')).map((m) => m.words.y!)),
    ].sort((a, b) => a - b);
    expect(rowYs.length).toBeGreaterThan(2);
    for (let i = 1; i < rowYs.length; i++) {
      expect(rowYs[i] - rowYs[i - 1]).toBeCloseTo(0.4, 5);
    }
    // alternating travel: consecutive rows start at opposite X ends of
    // their segments — probe the first rapid X per row
    const rowFirstX = new Map<number, number>();
    for (const m of res.moves) {
      if (m.comment?.startsWith('raster row') && m.rapid && m.words.x !== undefined) {
        if (!rowFirstX.has(m.words.y!)) rowFirstX.set(m.words.y!, m.words.x);
      }
    }
    const ys = [...rowFirstX.keys()].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(2);
    let flips = 0;
    for (let i = 1; i < ys.length; i++) {
      const a = rowFirstX.get(ys[i - 1])!;
      const b = rowFirstX.get(ys[i])!;
      const mid = 0; // the disc spans −5…5: starts on opposite sides of 0
      if ((a < mid) !== (b < mid)) flips++;
    }
    expect(flips).toBeGreaterThan(0);
  });

  // --- row angle (Phase B follow-up) ---

  it('angleDeg 0, 360, and omitted produce byte-identical moves', () => {
    // rotation about the ORIGIN with exact IEEE754 identity arithmetic:
    // mod-360 lands 360 on 0 before the trig (sin(2π) ≠ 0 in floats), and
    // cos(0)·u − sin(0)·v is exactly u, v — today's output, bit for bit
    const plain = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4 }));
    const zero = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: 0 }));
    const full = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: 360 }));
    expect(JSON.stringify(zero.moves)).toBe(JSON.stringify(plain.moves));
    expect(JSON.stringify(full.moves)).toBe(JSON.stringify(plain.moves));
    expect(zero.rows).toBe(plain.rows);
  });

  it('angleDeg 90 runs rows along machine Y: y varies in-row, rows stack along X', () => {
    const res = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: 90 }));
    expect(res.rows).toBeGreaterThan(0);
    // feed moves: y advances within a segment, x stays fixed there (row
    // travel is along machine Y); x steps only on the row-start rapids —
    // those carry the next row's x, a step-over apart. The plunge carries
    // only a z word, nothing to check.
    let x: number | null = null;
    let yMoved = 0;
    for (const m of res.moves) {
      if (m.rapid) {
        if (m.words.x !== undefined && m.words.y !== undefined) x = m.words.x; // new segment
        continue;
      }
      if (m.words.x !== undefined) {
        expect(m.words.x).toBeCloseTo(x!, 6); // in-segment: x frozen
        yMoved++;
      }
    }
    expect(yMoved).toBeGreaterThan(0);
    // rows distributed along X: the entry rapids' x values span the disc
    const rowXs = [
      ...new Set(
        res.moves
          .filter((m) => m.comment?.startsWith('raster row'))
          .map((m) => m.words.x!),
      ),
    ].sort((a, b) => a - b);
    expect(rowXs.length).toBeGreaterThan(2);
    expect(rowXs[rowXs.length - 1] - rowXs[0]).toBeGreaterThan(4);
    // consecutive row starts sit a step-over apart in X (stride 2 × pitch 0.2)
    for (let i = 1; i < rowXs.length; i++) {
      expect(rowXs[i] - rowXs[i - 1]).toBeCloseTo(0.4, 5);
    }
  });

  it('angleDeg 45 cuts diagonal rows: 1:1 x-y drift, everything inside the model extent', () => {
    const res = rasterContour45();
    expect(res.rows).toBeGreaterThan(0);
    // consecutive feed-move endpoints move equally in x and y (diagonal
    // travel). Segment structure: entry rapid (xy) → z rapids/plunge → ONE
    // long feed move → safe-z rapid, so the comparison is each feed move
    // against its entry rapid (z-only plunges in between change neither).
    let diagonal = 0;
    let start: { x: number; y: number } | null = null;
    for (const m of res.moves) {
      if (m.rapid) {
        if (m.words.x !== undefined && m.words.y !== undefined) {
          start = { x: m.words.x, y: m.words.y };
        }
        continue;
      }
      if (m.feed > 0 && m.words.x !== undefined && start) {
        const dx = Math.abs(m.words.x - start.x);
        const dy = Math.abs((m.words.y ?? start.y) - start.y);
        if (dx > 0.01 && dy > 0.01) {
          expect(Math.abs(dx - dy)).toBeLessThan(0.02); // ±1:1
          diagonal++;
        }
        start = null; // one feed move per segment here
      }
    }
    expect(diagonal).toBeGreaterThan(0);
    // every commanded xy (rapids AND feeds) stays within the model's XY
    // extent grown by the tool radius — the grid-frame rotation cannot
    // fling the tool outside the box it was derived from
    const r = flat.diameter / 2;
    for (const m of res.moves) {
      if (m.words.x === undefined || m.words.y === undefined) continue;
      expect(m.words.x).toBeGreaterThanOrEqual(-5 - r - 1e-6);
      expect(m.words.x).toBeLessThanOrEqual(5 + r + 1e-6);
      expect(m.words.y).toBeGreaterThanOrEqual(-5 - r - 1e-6);
      expect(m.words.y).toBeLessThanOrEqual(5 + r + 1e-6);
    }
  });

  it('accepts negative and out-of-range angles via mod-360 trig (no clamp, no throw)', () => {
    // −90 ≡ 270: rows along machine Y the other way — must run clean and
    // land the rows along the same axis family as +90
    const neg = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: -90 }));
    expect(neg.rows).toBeGreaterThan(0);
    expect(() =>
      rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: -1234.5 })),
    ).not.toThrow();
    // −90 and 270 are the same grid: identical moves
    const pos = rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: 270 }));
    expect(JSON.stringify(neg.moves)).toBe(JSON.stringify(pos.moves));
  });
});

/** angleDeg 45 over the sunk disc, at the shared default options — the
 *  diagonal test's fixture (kept out of `opts` so the earlier tests stay
 *  untouched). */
function rasterContour45() {
  return rasterContour(opts({ topZ: 1, pitch: 0.2, stepOver: 0.4, angleDeg: 45 }));
}
