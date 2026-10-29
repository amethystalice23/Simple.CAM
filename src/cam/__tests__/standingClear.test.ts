/**
 * Standing-clear tests (Stage C of the 4D contour): the delta-aware
 * emission bookkeeping. Analytic fixtures pin the θ-row convention
 * against buildDexelMap / the cleared-set ray transform, the level gate,
 * the conservative trim (including the live-interval filter's
 * counterexample), the all-or-nothing stamp, and adoptStanding's
 * reindex/resample contracts.
 */

import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/types';
import { totalArea } from '../clipper';
import { insideContours } from '../clipUtils';
import { reindexStanding } from '../rotaryCarve';
import {
  adoptStanding,
  mintStandingStock,
  standingHooksFor,
  type StandingGeometry,
} from '../standingClear';
import { waterlineRough } from '../waterline';

const geo = (over: Partial<StandingGeometry> = {}): StandingGeometry => ({
  x0: -10,
  x1: 10,
  radius: 10,
  axisZ: 0,
  thetaStepOver: 1, // nTheta = 63 (rows every 5.714°), pitchX 0.5, nx 41
  datumAngle: 0,
  ...over,
});

function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

const bigRegion = (): Vec2[][] => [square(-12, 24)];

/** CCW-positive / CW-negative shoelace sum: holes subtract, so this is
 *  the NET area a region covers (totalArea counts holes positively). */
function netArea(contours: Vec2[][]): number {
  let s = 0;
  for (const c of contours) {
    let a = 0;
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      a += p.x * q.y - q.x * p.y;
    }
    s += a / 2;
  }
  return s;
}

describe('standingClear conventions', () => {
  it('pins the θ-row convention: a full-disc stamp at plane z5 bounds every upper cell at r = 5/cos(φ)', () => {
    const g = mintStandingStock(geo());
    const { stampBand } = standingHooksFor(g, 0);
    stampBand(10, 5, bigRegion());

    const dTheta = (2 * Math.PI) / g.nTheta;
    let stamped = 0;
    for (let j = 0; j < g.nTheta; j++) {
      const c = Math.cos(j * dTheta); // A = 0 → φ = θ_j
      for (let i = 0; i < g.nx; i++) {
        const r = g.r[j * g.nx + i];
        if (c > 1e-4) {
          // the cut plane bounds the ray at r = 5/cos(φ), clamped at the
          // stock radius; cells whose plane-radius exceeds the stock are
          // untouched fresh stock
          expect(r).toBeCloseTo(Math.min(10, 5 / c), 9);
          stamped++;
        } else {
          expect(r).toBe(10); // equator/lower half: never touched at A=0
        }
      }
    }
    expect(stamped).toBeGreaterThan(0);

    // the same stamp at A=90, cross-checked through clearedSet's own
    // machine-height formula (clearedSet.ts: zCell = y·sinA + zrel·cosA +
    // axisZ for the material point (y, zrel) = (r·sinθ, r·cosθ)): the
    // stamped surface must sit exactly ON the plane in the machine frame
    const g90 = mintStandingStock(geo());
    const { stampBand: stamp90 } = standingHooksFor(g90, 90);
    stamp90(10, 5, bigRegion());
    for (let j = 0; j < g90.nTheta; j++) {
      const theta = j * dTheta;
      const c = Math.cos(theta - Math.PI / 2);
      const r = g90.r[j * g90.nx + 20];
      const expected = c > 1e-4 ? Math.min(10, 5 / c) : 10;
      expect(r).toBeCloseTo(expected, 9);
      // machine height of the stamped material point at A=90
      const y = r * Math.sin(theta);
      const zrel = r * Math.cos(theta);
      const zCell = y * 1 + zrel * 0; // sinA=1, cosA=0, axisZ=0
      if (c > 1e-4 && c >= 0.5) expect(zCell).toBeCloseTo(5, 9);
    }
  });
});

describe('standingClear trim', () => {
  it('level gate: a grid fully stamped above a plane returns [] for the same band, region untouched', () => {
    const g = mintStandingStock(geo());
    const { stampBand, trimBand } = standingHooksFor(g, 0);
    stampBand(10, 5, bigRegion());
    const region = bigRegion();
    const before = JSON.stringify(region);
    expect(trimBand(10, 5, region)).toEqual([]);
    expect(JSON.stringify(region)).toBe(before); // identity, not mutated
  });

  it('mixed trim at A=90: keeps work-cell area, drops deep-interior no-work rectangles', () => {
    const g = mintStandingStock(geo());
    const { stampBand, trimBand } = standingHooksFor(g, 90);
    // clear the cutting-frame y>0 half at plane z5 (swept = upper rect):
    // rows with sin(θ−90°) > 0 and cos > 1e-4 stamp down to 5/cos
    stampBand(10, 5, [
      [
        { x: -12, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 12 },
        { x: -12, y: 12 },
      ],
    ]);
    const region = bigRegion();
    const trimmed = trimBand(10, 5, region);
    expect(trimmed.length).toBeGreaterThan(0);
    expect(netArea(trimmed)).toBeLessThan(netArea(region));

    // work cells (θ ∈ (30°, 90°): fresh stock standing above the plane on
    // the −y side) keep their surface area in the region
    const dTheta = (2 * Math.PI) / g.nTheta;
    const xMid = g.gx0 + 20 * g.pitchX; // the x=0 column
    for (let j = 6; j <= 15; j++) {
      const phi = j * dTheta - Math.PI / 2;
      expect(insideContours(xMid, 10 * Math.sin(phi), trimmed)).toBe(true);
    }
    // deep-interior points of the stamped no-work rows whose rectangles
    // survive the live-interval filter (φ ≈ 30°, 35.7°, 41.4°) are gone
    for (const y of [3.94, 4.7, 5.5]) {
      expect(insideContours(xMid, y, trimmed)).toBe(false);
    }
  });

  it('safety pin: a no-work wedge beside a full standing neighbour trims NOTHING (the live-interval counterexample)', () => {
    // cell at cutting angle φ=30° cut down to r=4 by a previous
    // orientation; its wedge's plan strip (y ∈ [3.88, 4.00] at φ=30°) is
    // crossed by the FRESH φ=24.3° neighbour's ray at height ~8.2 — well
    // above the z5 plane. Trimming there would strand live material and
    // under-stamp the neighbour; the live-interval filter must drop the
    // rectangle entirely.
    const g = mintStandingStock(geo());
    const dTheta = (2 * Math.PI) / g.nTheta;
    const j30 = Math.round((Math.PI / 6 + Math.PI / 2) / dTheta); // φ=+30° at A=90
    for (let i = 0; i < g.nx; i++) g.r[j30 * g.nx + i] = 4;
    const { trimBand } = standingHooksFor(g, 90);
    const region = bigRegion();
    const trimmed = trimBand(10, 5, region);
    expect(totalArea(trimmed)).toBeCloseTo(totalArea(region), 6);
    expect(insideContours(0, 3.94, trimmed)).toBe(true);
  });

  it('safety pins: stamp needs full coverage; an all-work trim leaves the region alone', () => {
    const g = mintStandingStock(geo());
    const { stampBand, trimBand, view } = standingHooksFor(g, 0);

    // (a) swept nowhere near the samples → nothing stamped
    stampBand(10, 5, [square(-30, 5)]);
    expect(g.r[20]).toBe(10); // row 0, column 20

    // (b) partial coverage — only the outermost radial sample inside →
    // the cell stays untouched (all-or-nothing)
    const j = 6; // θ = 34.3°: sinφ ≈ 0.563, cosφ ≈ 0.826 → samples y ≈ {3.4, 4.5, 5.6}
    stampBand(
      10,
      5,
      [
        [
          { x: -12, y: 5.0 },
          { x: 12, y: 5.0 },
          { x: 12, y: 6.5 },
          { x: -12, y: 6.5 },
        ],
      ],
    );
    expect(view.grid.r[j * g.nx + 20]).toBe(10);
    expect(view.cosRow(j)).toBeCloseTo(Math.cos(6 * ((2 * Math.PI) / g.nTheta)), 12);

    // (c) a band reaching below the axis: every cell has work, nothing is
    // provably empty → the region comes back unchanged
    const region = bigRegion();
    const trimmed = trimBand(0, -5, region);
    expect(totalArea(trimmed)).toBeCloseTo(totalArea(region), 6);
  });
});

describe('adoptStanding', () => {
  it('same shape: reindexes to the new datum exactly like reindexStanding, on a private copy', () => {
    const src = mintStandingStock(geo({ datumAngle: 0 }));
    for (let i = 0; i < src.nx; i++) src.r[10 * src.nx + i] = 5; // a cut row
    const g2 = geo({ datumAngle: 90 });
    const adopted = adoptStanding(src, g2);

    const expected = reindexStanding(src, 90, src.nTheta);
    expect(adopted.r).not.toBe(src.r); // private copy — the op will stamp it
    expect(Array.from(adopted.r)).toEqual(Array.from(expected.r));
    expect(adopted.datumAngle).toBe(90);
    // the shift: 90° / (360/63)° ≈ 15.75 → the cut row lands at row 26
    expect(adopted.r[26 * adopted.nx]).toBe(5);
    expect(src.r[10 * src.nx]).toBe(5); // donor untouched
  });

  it('different pitch: target r = MAX over overlapping sources — a hole never over-clears', () => {
    // coarse source (nTheta 31, rows 11.6° apart) with an 8-row notch of
    // removed material; the fine target (nTheta 63) must read 10 wherever
    // any fresh source row overlaps, and may only read 0 deep inside the
    // notch (the resample may over-claim standing, never under-claim)
    const src = mintStandingStock(geo({ thetaStepOver: 2 }));
    for (let j = 0; j < 8; j++) for (let i = 0; i < src.nx; i++) src.r[j * src.nx + i] = 0;
    const adopted = adoptStanding(src, geo({ thetaStepOver: 1 }));
    expect(adopted.nTheta).toBe(63);

    const dT = (2 * Math.PI) / adopted.nTheta;
    const dS = (2 * Math.PI) / src.nTheta;
    let sawZero = false;
    let sawTen = false;
    for (let j = 0; j < adopted.nTheta; j++) {
      const alpha = j * dT;
      const half = (dT + dS) / 2;
      const jLo = Math.ceil((alpha - half) / dS);
      const jHi = Math.floor((alpha + half) / dS);
      let exactHasFresh = false;
      for (let js = jLo; js <= jHi; js++) {
        const jw = ((js % src.nTheta) + src.nTheta) % src.nTheta;
        if (jw > 7) exactHasFresh = true;
      }
      const v = adopted.r[j * adopted.nx + 10]; // the x=0 column
      if (exactHasFresh) expect(v).toBe(10); // a hole never over-clears
      expect(v === 0 || v === 10).toBe(true);
      if (v === 0) {
        sawZero = true;
        expect(exactHasFresh).toBe(false); // removal claims stay inside the notch
      }
      if (v === 10) sawTen = true;
    }
    expect(sawZero).toBe(true);
    expect(sawTen).toBe(true);
    // spot checks: row 0's padded overlap touches the wrapped fresh row 30…
    expect(adopted.r[0 * adopted.nx + 10]).toBe(10);
    // …and a row deep inside the notch reads fully removed
    expect(adopted.r[6 * adopted.nx + 10]).toBe(0);
  });
});

describe('standingClear perf', () => {
  it('trimBand with ~10k no-work cells stays seconds-class', () => {
    // fine grid (nTheta 314, nx 201, 63k cells); rows 1..79 removed
    // (r=0) — rows 1..52 are provably empty with surviving rectangles
    // (~43 rows × 201 columns ≈ 8.6k rects), row 0 stays fresh so the
    // gate passes
    const g = mintStandingStock(geo({ thetaStepOver: 0.2 }));
    for (let j = 1; j <= 79; j++) for (let i = 0; i < g.nx; i++) g.r[j * g.nx + i] = 0;
    const { trimBand } = standingHooksFor(g, 0);
    const region = bigRegion();
    const t0 = performance.now();
    const trimmed = trimBand(10, 5, region);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(20000);
    expect(netArea(trimmed)).toBeLessThan(netArea(region));
    expect(ms).toBeLessThan(20_000);
  }, 60_000);
});

describe('waterline standing hooks', () => {
  // these live here with the analytic fixtures; the fixtures come from
  // the same shapes as waterline.test.ts's pyramid default
  const tool = { id: 't1', name: '2mm flat', type: 'flat' as const, diameter: 2, spindleRpm: 18000 };
  const positions = (() => {
    // square pyramid, apex (0,0,0), base half-width 5 at z −10 (the
    // waterline test's default fixture, inline to keep this file's deps
    // on the kernel only)
    const apex: [number, number, number] = [0, 0, 0];
    const c: [number, number, number][] = [
      [-5, -5, -10],
      [5, -5, -10],
      [5, 5, -10],
      [-5, 5, -10],
    ];
    const tri: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = c[i];
      const b = c[(i + 1) % 4];
      tri.push(...apex, ...a, ...b);
    }
    return new Float32Array(tri);
  })();
  const opts = () => ({
    positions: positions as ArrayLike<number>,
    footprint: [square(-15, 30)] as Vec2[][],
    topZ: 0,
    floorZ: -10,
    stepDown: 2.5,
    stepOver: 1,
    allowance: 0.5,
    margin: 3,
    tool,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
  });

  it('a trim that skips every level: zero moves, standingSkips counts the levels, no new warnings', () => {
    const without = waterlineRough(opts());
    expect(without.levels.length).toBeGreaterThan(0);
    const withHooks = waterlineRough({
      ...opts(),
      standing: { trimBand: () => [], stampBand: () => undefined },
    });
    expect(withHooks.moves).toHaveLength(0);
    expect(withHooks.standingSkips).toBe(without.levels.length);
    expect(withHooks.levels).toHaveLength(0);
    // nothing new was warned about the skipping — silence is the contract
    for (const w of withHooks.warnings) expect(without.warnings).toContain(w);
  });

  it('passthrough trim + recording stamp: identical moves, one stamp per emitted level, swept within the region', () => {
    const without = waterlineRough(opts());
    const stamps: { bandTop: number; cut: number; swept: Vec2[][] }[] = [];
    const regions = new Map<number, Vec2[][]>();
    const withHooks = waterlineRough({
      ...opts(),
      standing: {
        trimBand: (_bandTop, cut, region) => {
          regions.set(cut, region);
          return region;
        },
        stampBand: (bandTop, cut, swept) => stamps.push({ bandTop, cut, swept }),
      },
    });
    expect(JSON.stringify(withHooks.moves)).toBe(JSON.stringify(without.moves));
    expect(withHooks.standingSkips).toBe(0);
    expect(stamps.map((s) => s.cut)).toEqual(without.levels);
    for (const s of stamps) {
      const region = regions.get(s.cut);
      expect(region).toBeDefined();
      // the tool-disc opening of the pocketed region can never exceed it
      expect(totalArea(s.swept)).toBeLessThanOrEqual(totalArea(region!) + 1e-6);
      expect(s.swept.length).toBeGreaterThan(0);
    }
  });
});
