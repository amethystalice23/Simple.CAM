/**
 * restMaterial tests: the thin-streamer honesty report (PLAN.md spec
 * item 2). Grid states are hand-built (mintStandingStock + direct cell
 * writes) against a watertight cylinder model the dexel rays can hit.
 */

import { describe, expect, it } from 'vitest';
import { restMaterialReport } from '../restMaterial';
import { mintStandingStock, type StandingGeometry } from '../standingClear';

const geo = (over: Partial<StandingGeometry> = {}): StandingGeometry => ({
  x0: -10,
  x1: 10,
  radius: 10,
  axisZ: 0,
  thetaStepOver: 1, // nTheta 63, pitchX 0.5, nx 41
  datumAngle: 0,
  ...over,
});

/** a solid cylinder model of radius R over the grid's x span: a quad
 * strip around θ (watertight with the end fans) — the outer-wall hits
 * are all the dexel map reads */
function cylinderPositions(R: number, n = 24): number[] {
  const tri: number[] = [];
  for (let s = 0; s < n; s++) {
    const t0 = (s * 2 * Math.PI) / n;
    const t1 = ((s + 1) * 2 * Math.PI) / n;
    const p = (t: number, x: number) => [x, R * Math.sin(t), R * Math.cos(t)];
    // outer wall quad (two triangles), from x=-10 to x=10
    const a = p(t0, -10), b = p(t1, -10), c = p(t0, 10), d = p(t1, 10);
    tri.push(...a, ...b, ...c);
    tri.push(...b, ...d, ...c);
    // end fans
    tri.push(-10, 0, 0, ...p(t1, -10), ...p(t0, -10));
    tri.push(10, 0, 0, ...p(t0, 10), ...p(t1, 10));
  }
  return tri;
}

describe('restMaterialReport', () => {
  it('clean cut (grid at the model surface + allowance): no rest, no note', () => {
    const g = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g.r.length; k++) g.r[k] = 8.15;
    const rep = restMaterialReport({
      grid: g, positions, allowance: 0.2, thinBelow: 0.8, toolDiameter: 3.175,
    });
    expect(rep.anyRest).toBe(false);
    expect(rep.note).toBeNull();
  });

  it('thin streamer: a sub-threshold θ-run at the surface is counted and reported', () => {
    const g = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g.r.length; k++) g.r[k] = 8.15;
    // one thin ribbon: a single row of cells standing proud at full
    // radius over five x columns — width = one row of arc (~0.8mm at r8)
    const j = 5;
    for (let i = 10; i < 15; i++) g.r[j * g.nx + i] = 10;
    const rep = restMaterialReport({
      grid: g, positions, allowance: 0.2, thinBelow: 1.5, toolDiameter: 3.175,
    });
    expect(rep.anyRest).toBe(true);
    expect(rep.runs).toBe(5); // one run per x column
    expect(rep.thinRuns).toBe(5);
    expect(rep.thinVolume).toBeGreaterThan(0);
    expect(rep.note).toContain('thin streamer');
  });

  it('wide rest run (the rough missed a tool-wide band): counted in the struct, not the note', () => {
    const g = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g.r.length; k++) g.r[k] = 8.15;
    // a band 10 rows wide (~8mm arc) over five x columns
    for (let j = 20; j < 30; j++) {
      for (let i = 10; i < 15; i++) g.r[j * g.nx + i] = 10;
    }
    const rep = restMaterialReport({
      grid: g, positions, allowance: 0.2, thinBelow: 0.8, toolDiameter: 3.175,
    });
    expect(rep.thinRuns).toBe(0);
    expect(rep.wideRuns).toBe(5);
    // wide rest is the already-warned territory (maxDepth floor, deep
    // undercuts) — the note fires on the THIN class only
    expect(rep.note).toBeNull();
  });

  it('allowance filters the skin: rest below the allowance is finishing stock, not reported', () => {
    const g = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g.r.length; k++) g.r[k] = 8.1;
    const rep = restMaterialReport({
      grid: g, positions, allowance: 0.2, thinBelow: 0.8, toolDiameter: 3.175,
    });
    expect(rep.anyRest).toBe(false);
  });

  it('wrap-around runs: a ribbon crossing θ=0 is ONE run, not two', () => {
    const g = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g.r.length; k++) g.r[k] = 8.15;
    // rows 62, 0, 1 of one column — contiguous through the wrap. A
    // 3-cell run at r8 is ~2.4mm of arc: thin under a 3mm threshold
    for (const j of [g.nTheta - 1, 0, 1]) g.r[j * g.nx + 10] = 10;
    const rep = restMaterialReport({
      grid: g, positions, allowance: 0.2, thinBelow: 3, toolDiameter: 3.175,
    });
    expect(rep.runs).toBe(1);
    expect(rep.thinRuns).toBe(1);
  });

  it('datum reindex: a grid minted at datum 90 reports identically to one at 0', () => {
    const g0 = mintStandingStock(geo());
    const positions = cylinderPositions(8);
    for (let k = 0; k < g0.r.length; k++) g0.r[k] = 8.15;
    for (let i = 10; i < 15; i++) g0.r[5 * g0.nx + i] = 10;
    const rep0 = restMaterialReport({
      grid: g0, positions, allowance: 0.2, thinBelow: 1.5, toolDiameter: 3.175,
    });
    // same physical rest, minted at datum 90: the report must reindex
    // the grid to the material frame before reading it. reindexStanding's
    // own rule: material at new row j stood at old row j + shift.
    const g90 = mintStandingStock(geo({ datumAngle: 90 }));
    const shift = Math.round(90 / (360 / g0.nTheta));
    for (let j = 0; j < g90.nTheta; j++) {
      const src = (j - shift + g90.nTheta) % g90.nTheta;
      g90.r.set(g0.r.subarray(src * g0.nx, (src + 1) * g0.nx), j * g90.nx);
    }
    const rep90 = restMaterialReport({
      grid: g90, positions, allowance: 0.2, thinBelow: 1.5, toolDiameter: 3.175,
    });
    expect(rep90.thinRuns).toBe(rep0.thinRuns);
    expect(rep90.thinVolume).toBeCloseTo(rep0.thinVolume, 6);
  });
});
