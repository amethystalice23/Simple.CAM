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
import { difference, totalArea } from '../clipper';
import { insideContours } from '../clipUtils';
import { reindexStanding } from '../rotaryCarve';
import {
  adoptStanding,
  mintStandingStock,
  standingHooksFor,
  type StandingGeometry,
} from '../standingClear';
import { waterlineRough } from '../waterline';
import { pocket2d } from '../pocket';

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
  it('level gate: after a full-disc stamp at the plane the band cannot gate (slab-edge material stands above it), but the trim still removes most of the region', () => {
    const g = mintStandingStock(geo());
    const { stampBand, trimBand } = standingHooksFor(g, 0);
    stampBand(10, 5, bigRegion());
    const region = bigRegion();
    const before = JSON.stringify(region);
    const trimmed = trimBand(10, 5, region);
    // the stamp leaves rows at exactly the plane bound r = 5/cos(φ); at
    // the slab edge nearest the pole the same radius reaches
    // r·cHi — up to ~0.4mm ABOVE the plane — and the grid's per-row-max
    // model cannot deny it, so every stamped row stays live (skipping
    // the level would be the forbidden direction). The m-padded live
    // slivers merge into a carpet across the mid band, so the trim only
    // removes the far strips past the carpet — ~23% here — and the
    // region itself is never mutated:
    expect(trimmed.length).toBeGreaterThan(0);
    expect(netArea(trimmed)).toBeLessThan(netArea(region) * 0.9);
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
    // the stamped rows (θ ∈ (90°, 150°): cut to exactly the plane bound
    // r = 5/cos) stay live under the slab-edge classification — material
    // at that radius reaches r·cHi above the plane at the row's slab
    // edge — so their slab-edge strips (y up to ≈ 9.2 at x=0) are kept;
    // only the far field past the topmost live strip is provably air
    expect(insideContours(xMid, 8.0, trimmed)).toBe(true);
    expect(insideContours(xMid, 11.5, trimmed)).toBe(false);
    expect(netArea(trimmed)).toBeLessThan(netArea(region) * 0.9);
  });

  it('safety pin: a no-work wedge beside a full standing neighbour keeps the neighbour strip (the live-interval counterexample)', () => {
    // cell at cutting angle φ=30° cut down to r=4 by a previous
    // orientation; its plan strip (y ∈ [2.89, 5.00] at φ=30°) is
    // crossed by the FRESH φ=24.3° neighbour's ray at height ~8.2 — well
    // above the z5 plane. Trimming there would strand live material and
    // under-stamp the neighbour; the neighbour's padded live strip
    // (y ∈ [0.66, 5.72]) must be kept. Only the provably-beyond-material
    // far field (|y| past every ray's reach) may go.
    const g = mintStandingStock(geo());
    const dTheta = (2 * Math.PI) / g.nTheta;
    const j30 = Math.round((Math.PI / 6 + Math.PI / 2) / dTheta); // φ=+30° at A=90
    for (let i = 0; i < g.nx; i++) g.r[j30 * g.nx + i] = 4;
    const { trimBand } = standingHooksFor(g, 90);
    const region = bigRegion();
    const trimmed = trimBand(10, 5, region);
    // the neighbour's live strip survives the trim…
    expect(insideContours(0, 3.94, trimmed)).toBe(true);
    expect(insideContours(0, 3.0, trimmed)).toBe(true);
    expect(insideContours(0, 5.5, trimmed)).toBe(true);
    // …while only the far field beyond every row's material reach goes
    expect(insideContours(0, 11.5, trimmed)).toBe(false);
    expect(totalArea(trimmed)).toBeLessThan(totalArea(region));
  });

  it('re-pin (H1): a stepDown-thin band trims the FULL no-work wedge [r_cut, R], not the band slice', () => {
    // the real op's shape: band [bandTop, cut] is stepDown-thin. The band
    // slice [r_cut, r_top] spans ≤ stepDown/cos in radius — under the
    // ~1mm wedge-vs-rect margin (2m ≈ 2·0.998) every rectangle died
    // before Clipper and the trim was inert (~0.08% on the bench job).
    // The honest wedge is everything above the cut plane on a no-work
    // ray: r ∈ [r_cut, R] — the band top bounds the STAMP, not the TRIM.
    const g = mintStandingStock(geo({ thetaStepOver: 0.5 })); // nTheta 126, m ≈ 0.499
    const dTheta = (2 * Math.PI) / g.nTheta;
    // every upper-half row stamped down to r=5 (below the z=5 plane) by
    // earlier orientations, except the work row near φ=45° which keeps
    // fresh stock standing above the plane (so the gate passes)
    const j45 = Math.round((Math.PI / 4) / dTheta);
    for (let j = 0; j < g.nTheta; j++) {
      const c = Math.cos(j * dTheta);
      if (c > 1e-4 && Math.sin(j * dTheta) > 0 && j !== j45) {
        for (let i = 0; i < g.nx; i++) g.r[j * g.nx + i] = 5;
      }
    }
    const { trimBand } = standingHooksFor(g, 0);
    const region = bigRegion();
    const trimmed = trimBand(7, 5, region); // stepDown-thin band
    expect(trimmed.length).toBeGreaterThan(0); // gate does not fire (work row)
    // the band-slice era's plan strips (e.g. y ≈ [3.23, 4.29]) and every
    // other gap between live strips go — points below the plane on every
    // ray (2.5, 3.94) are provably air at this level…
    expect(insideContours(0, 3.94, trimmed)).toBe(false);
    expect(insideContours(0, 2.5, trimmed)).toBe(false);
    // …while the work row's own padded live strip (φ=45.7°: live y ≈
    // [5.1, 7.2] → kept [4.6, 7.7]) survives
    expect(insideContours(0, 4.7, trimmed)).toBe(true);
    expect(insideContours(0, 5.5, trimmed)).toBe(true);
    expect(insideContours(0, 7.5, trimmed)).toBe(true);
    expect(netArea(trimmed)).toBeLessThan(netArea(region) * 0.9);
  });

  it('re-pin (H1 safety): the extended wedge still dies against a fresh neighbour whose ray crosses it', () => {
    // the H1 counterexample at a stepDown-thin band: the φ=28.6° no-work
    // row's full wedge strip y ∈ [3.73, 3.79] is crossed by the FRESH
    // φ=22.9° neighbour's ray (radius 5.4–10 up there, height ≫ z5); the
    // live-interval filter must still drop the rectangle.
    const g = mintStandingStock(geo());
    const dTheta = (2 * Math.PI) / g.nTheta;
    const j30 = Math.round((Math.PI / 6) / dTheta); // φ=+28.6° at A=0
    for (let i = 0; i < g.nx; i++) g.r[j30 * g.nx + i] = 5;
    const { trimBand } = standingHooksFor(g, 0);
    const region = bigRegion();
    const trimmed = trimBand(7, 5, region);
    expect(insideContours(0, 3.76, trimmed)).toBe(true); // nothing trimmed there
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

    // (c) a band reaching below the axis: every cell has work (fresh
    // grid) → the live strips carpet the whole plan and only the far
    // field beyond every ray's material reach (|y| > R + m there, radius
    // > R) may go
    const region = bigRegion();
    const trimmed = trimBand(0, -5, region);
    expect(totalArea(trimmed)).toBeLessThan(totalArea(region));
    expect(totalArea(trimmed)).toBeGreaterThan(totalArea(region) - 45);
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

// ---------------------------------------------------------------- oracle
// SOUNDNESS ORACLE (ported from the committee's randomized probe,
// scripts/probe-c5m6-analytic.ts fixture D): does ANY band material
// (height above the floor plane) sit under a point the trim subtracted?
// Material is checked at row centers AND slab edges — the same worst-case
// model the slab-edge (cHi) classification must survive.
function bandMaterialUnder(
  grid: ReturnType<typeof mintStandingStock>,
  angleDeg: number,
  x: number,
  y: number,
  cut: number,
): boolean {
  const A = (angleDeg * Math.PI) / 180;
  const dT = (2 * Math.PI) / grid.nTheta;
  const i = Math.round((x - grid.gx0) / grid.pitchX);
  if (i < 0 || i >= grid.nx) return false;
  for (let j = 0; j < grid.nTheta; j++) {
    const phiC = j * dT - A;
    for (const phi of [phiC - dT / 2, phiC, phiC + dT / 2]) {
      const s = Math.sin(phi);
      if (Math.abs(s) < 1e-6) continue;
      const r = y / s;
      if (r < 0 || r > grid.r[j * grid.nx + i]) continue;
      const z = grid.axisZ + r * Math.cos(phi);
      if (z > cut + 1e-9) return true;
    }
  }
  return false;
}

/** even-odd point-in-SET across all loops; visit each interior sample point */
function sampleSet(loops: Vec2[][], step: number, visit: (x: number, y: number) => void): number {
  let xmin = 1e9;
  let xmax = -1e9;
  let ymin = 1e9;
  let ymax = -1e9;
  for (const loop of loops)
    for (const p of loop) {
      xmin = Math.min(xmin, p.x);
      xmax = Math.max(xmax, p.x);
      ymin = Math.min(ymin, p.y);
      ymax = Math.max(ymax, p.y);
    }
  let count = 0;
  for (let x = xmin + step / 2; x < xmax; x += step)
    for (let y = ymin + step / 2; y < ymax; y += step) {
      let inside = false;
      for (const loop of loops)
        for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
          const yi = loop[i].y;
          const yj = loop[j].y;
          if ((yi > y) !== (yj > y) && x < ((loop[j].x - loop[i].x) * (y - yi)) / (yj - yi) + loop[i].x)
            inside = !inside;
        }
      if (!inside) continue;
      count++;
      visit(x, y);
    }
  return count;
}

describe('standingClear soundness (randomized oracle)', () => {
  it('grazing planes, random surfaces/orientations: zero band material in the trimmed-away area', () => {
    const R = 45;
    let seed = 12345; // fixed LCG — deterministic in CI
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let pts = 0;
    let hits = 0;
    for (let trial = 0; trial < 60; trial++) {
      const g = mintStandingStock({
        x0: -20,
        x1: 20,
        radius: R,
        axisZ: 0,
        thetaStepOver: 1.6,
        datumAngle: 0,
      });
      const dT = (2 * Math.PI) / g.nTheta;
      const band = rnd() * 40; // random surface radius 0..40
      for (let j = 0; j < g.nTheta; j++)
        for (let i = 0; i < g.nx; i++) {
          // lumpy surface: base band plus a bump toward +theta
          const phi = j * dT;
          g.r[j * g.nx + i] = Math.min(R, Math.max(0, band + 12 * Math.cos(phi) * rnd()));
        }
      const A = rnd() * 360;
      // adversarial plane: graze a random row's material top within ±1.5mm
      const jg = Math.floor(rnd() * g.nTheta);
      const ig = Math.floor(rnd() * g.nx);
      const cut = Math.max(
        -10,
        Math.min(25, g.r[jg * g.nx + ig] * Math.cos(jg * dT - (A * Math.PI) / 180) + (rnd() - 0.5) * 3),
      );
      const bandTop = cut + 1 + rnd() * 8;
      const region: Vec2[][] = [
        [
          { x: -20, y: -R - 4 },
          { x: 20, y: -R - 4 },
          { x: 20, y: R + 4 },
          { x: -20, y: R + 4 },
        ],
      ];
      const { trimBand } = standingHooksFor(g, A, 2);
      const trimmed = trimBand(bandTop, cut, region);
      if (trimmed.length === 0) continue;
      const removed = difference(region, trimmed);
      pts += sampleSet(removed, 0.6, (x, y) => {
        if (bandMaterialUnder(g, A, x, y, cut)) hits++;
      });
    }
    expect(hits).toBe(0);
    expect(pts).toBeGreaterThan(1000); // the sweep actually sampled
  }, 120_000);
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

describe('standingClear ceiling', () => {
  it('the honest approach ceiling: fresh stock tops at the pole row, stamps cap it at the cut plane, and nothing-live keeps the band top', () => {
    const g = mintStandingStock(geo());
    const { computeCeiling } = standingHooksFor(g, 0);
    // fresh Ø20 stock on axis z0: the tallest standing material over any
    // region containing the pole is R itself (axisZ + R·1)
    expect(computeCeiling(5, 0, bigRegion())).toBeCloseTo(10, 9);
    // no region → nothing to raise above; the band top is honest
    expect(computeCeiling(5, 0, [])).toBe(5);
    // a cut plane above all standing material: no live cell, band top
    expect(computeCeiling(5, 11, bigRegion())).toBe(5);

    // after a full-disc stamp at plane z5, the ceiling sits at that plane
    // plus the clamp-at-stock rows' residue (a mid-latitude row whose
    // plane-radius 5/cos(φ) exceeds R keeps full stock, standing a hair
    // above the plane at the slab edge — honest, never under it)
    const g2 = mintStandingStock(geo());
    const { stampBand, computeCeiling: cc2 } = standingHooksFor(g2, 0);
    stampBand(10, 5, bigRegion());
    expect(cc2(6, 0, bigRegion())).toBeGreaterThan(5);
    expect(cc2(6, 0, bigRegion())).toBeLessThan(5.5);
  });
});

describe('waterline standing ceiling', () => {
  const tool = { id: 't1', name: '2mm flat', type: 'flat' as const, diameter: 2, spindleRpm: 18000 };
  const positions = (() => {
    const apex: [number, number, number] = [0, 0, 0];
    const c: [number, number, number][] = [
      [-5, -5, -10], [5, -5, -10], [5, 5, -10], [-5, 5, -10],
    ];
    const tri: number[] = [];
    for (let i = 0; i < 4; i++) {
      tri.push(...apex, ...c[i], ...c[(i + 1) % 4]);
    }
    return new Float32Array(tri);
  })();
  const opts = () => ({
    positions: positions as ArrayLike<number>,
    footprint: [[{ x: -15, y: -15 }, { x: 15, y: -15 }, { x: 15, y: 15 }, { x: -15, y: 15 }]] as Vec2[][],
    topZ: 0, floorZ: -10, stepDown: 2.5, stepOver: 1, allowance: 0.5, margin: 3,
    tool, feed: 500, plungeFeed: 200, safeClearance: 5,
  });
  /** passthrough trim/no-op stamp, with or without a fixed ceiling */
  const stub = (ceiling?: number) => ({
    trimBand: (_b: number, _c: number, region: Vec2[][]) => region,
    stampBand: () => undefined,
    ...(ceiling === undefined ? {} : { computeCeiling: () => ceiling }),
  });
  const rapidZs = (moves: { rapid: boolean; words: Record<string, number> }[]) =>
    moves.filter((m) => m.rapid && m.words.z !== undefined).map((m) => m.words.z);

  it('without a ceiling the approach plane stays at band top + APPROACH_CLEARANCE (0.5) — the pre-fix behavior', () => {
    const res = waterlineRough({ ...opts(), standing: stub() });
    const belowTravel = rapidZs(res.moves as never).filter((z) => z < 4.9);
    expect(Math.max(...belowTravel)).toBeCloseTo(0.5, 9);
  });

  it('a ceiling above the band top raises the approach plane — clamped to one step-down, never the ladder (the 2026-10-30 yellow-streak fix)', () => {
    const base = waterlineRough({ ...opts(), standing: stub() });
    const raised = waterlineRough({ ...opts(), standing: stub(6) });
    // the ceiling 6 clamps to band top + stepDown (0 + 2.5): the highest
    // approach plane = clamp + APPROACH_CLEARANCE — clear of the skin,
    // without re-machining boundary columns (the unclamped variant
    // measured 3× the moves on the bench knight)
    expect(Math.max(...rapidZs(raised.moves as never).filter((z) => z < 4.9))).toBeCloseTo(3.0, 9);
    // the ladder is UNTOUCHED: identical orbit passes, the ceiling only
    // lifts the approach plane and lengthens the entry ramps
    const passes = (r: { moves: { comment?: string }[] }) =>
      r.moves.filter((m) => /pass \d+/.test(m.comment ?? '')).length;
    expect(passes(raised)).toBe(passes(base));
  });
});

describe('standingClear segmentClear (keep-down chaining corridor, spec item 3)', () => {
  // A=0. The stamp writes the ROW-CENTER bound (the pinned θ-row
  // convention), so a cell freshly stamped at plane 5 keeps its
  // slab-edge residue topping a HAIR above 5 — the honest read (the
  // same residue computeCeiling deliberately keeps) refuses a corridor
  // at the stamp's own plane and proves one a step above. The real
  // chaining use is cross-orientation: an earlier orientation's DEEPER
  // stamp leaves cells far below the current level's plane.
  it('raw stock blocks; a full stamp proves the corridor one step above its plane, not at it', () => {
    const g = mintStandingStock(geo());
    const { stampBand, segmentClear } = standingHooksFor(g, 0);
    // raw stock at plane 5: blocked
    expect(segmentClear(5, -5, 0, 5, 0, 1)).toBe(false);
    stampBand(10, 5, bigRegion());
    // at the stamp plane itself: the slab-edge residue stands a hair
    // above it — honestly blocked (a stamp never proves its own plane)
    expect(segmentClear(5, -5, 0, 5, 0, 1)).toBe(false);
    // one step above: every cell's material tops at/below the plane
    expect(segmentClear(6, -5, 0, 5, 0, 1)).toBe(true);
  });

  it('below-axis planes: never-stamped lower-half material blocks; above-axis planes read it clear (it cannot reach them)', () => {
    const g = mintStandingStock(geo());
    const { stampBand, segmentClear } = standingHooksFor(g, 0);
    stampBand(10, 5, bigRegion());
    // the stamp never touches cos ≤ eps rows (the lower half at A=0);
    // their material tops at the AXIS, so a plane above the axis reads
    // clear through them and a plane below the axis stays blocked
    expect(segmentClear(5, -5, 9.5, 5, 9.5, 1)).toBe(true);
    expect(segmentClear(-2, -5, 9.5, 5, 9.5, 1)).toBe(false);
  });

  it('a deeper stamp proves the shallower corridor (the cross-orientation chaining case)', () => {
    const g = mintStandingStock(geo());
    const { stampBand, segmentClear } = standingHooksFor(g, 0);
    // an earlier orientation's ladder bottoms at plane 2: every upper
    // cell is stamped to 2/cos — a level at plane 3 links through water
    // proven clear a full plane deeper
    stampBand(10, 2, bigRegion());
    expect(segmentClear(3, -5, 0, 5, 0, 1)).toBe(true);
    // but a level at plane 2 (the stamp's own plane) still reads the
    // slab-edge residue — blocked, the honest direction
    expect(segmentClear(2, -5, 0, 5, 0, 1)).toBe(false);
  });

  it('pocket2d chains a link between islands when the corridor proves it (integration)', () => {
    // two disjoint square regions at one level; the plain two-clause
    // test refuses the link (the capsule exits the regions); a corridor
    // that says "swept" must let it chain. The pocket result's `links`
    // count is the observable.
    const tool = { id: 't1', name: '2mm flat', type: 'flat' as const, diameter: 2, spindleRpm: 18000 };
    const op: Parameters<typeof pocket2d>[0] = {
      kind: 'pocket',
      id: 'linktest',
      toolId: 't1',
      regions: [
        [ { x: -6, y: -4 }, { x: -2, y: -4 }, { x: -2, y: -0 }, { x: -6, y: 0 } ],
        [ { x: 2, y: -4 }, { x: 6, y: -4 }, { x: 6, y: -0 }, { x: 2, y: 0 } ],
      ],
      topZ: 0,
      floorZ: -2,
      stepDown: 2,
      stepOver: 1,
      feed: 500,
      plungeFeed: 200,
      safeClearance: 5,
    };
    // sanity: without the corridor, the far island forces a fresh entry
    const plain = pocket2d(op, tool);
    expect(plain.entries.helical + plain.entries.zigzag + plain.entries.plunge).toBeGreaterThan(1);
    // with an always-clear corridor, the islands chain in visit order
    const chained = pocket2d(op, tool, {
      sweptCorridor: () => true,
    });
    expect(chained.links).toBeGreaterThan(plain.links);
  });
});

describe('waterline keep-down corridor (spec item 3 integration)', () => {
  // the pyramid fixture's levels all sit in one island region, so the
  // plain two-clause test already chains there; the pin here is the
  // WIRING: a corridor hook that says NO must leave emission
  // byte-identical (a false-only corridor is exactly today's behavior),
  // and one that says YES can only ever ADD links, never remove them
  const tool = { id: 't1', name: '2mm flat', type: 'flat' as const, diameter: 2, spindleRpm: 18000 };
  const positions = (() => {
    const apex: [number, number, number] = [0, 0, 0];
    const c: [number, number, number][] = [
      [-5, -5, -10], [5, -5, -10], [5, 5, -10], [-5, 5, -10],
    ];
    const tri: number[] = [];
    for (let i = 0; i < 4; i++) tri.push(...apex, ...c[i], ...c[(i + 1) % 4]);
    return new Float32Array(tri);
  })();
  const opts = () => ({
    positions: positions as ArrayLike<number>,
    footprint: [square(-15, 30)] as Vec2[][],
    topZ: 0, floorZ: -10, stepDown: 2.5, stepOver: 1, allowance: 0.5, margin: 3,
    tool, feed: 500, plungeFeed: 200, safeClearance: 5,
  });
  const stub = (segmentClear?: (z: number, x0: number, y0: number, x1: number, y1: number, r: number) => boolean) => ({
    trimBand: (_b: number, _c: number, region: Vec2[][]) => region,
    stampBand: () => undefined,
    ...(segmentClear === undefined ? {} : { segmentClear }),
  });

  it('a never-clear corridor is byte-identical to no corridor (the hooks-absent contract)', () => {
    const plain = waterlineRough(opts());
    const refused = waterlineRough({ ...opts(), standing: stub(() => false) });
    expect(JSON.stringify(refused.moves)).toBe(JSON.stringify(plain.moves));
  });

  it('an always-clear corridor never REMOVES a link the two-clause test made', () => {
    const plain = waterlineRough(opts());
    const chained = waterlineRough({ ...opts(), standing: stub(() => true) });
    // links can only grow (the corridor is a third OR-clause), and the
    // passes themselves are untouched: same count of orbit passes
    const linkCount = (r: { moves: { comment?: string }[] }) =>
      r.moves.filter((m) => /stay-down link/.test(m.comment ?? '')).length;
    expect(linkCount(chained)).toBeGreaterThanOrEqual(linkCount(plain));
    const passes = (r: { moves: { comment?: string }[] }) =>
      r.moves.filter((m) => /pass \d+/.test(m.comment ?? '')).length;
    expect(passes(chained)).toBe(passes(plain));
  });
});
