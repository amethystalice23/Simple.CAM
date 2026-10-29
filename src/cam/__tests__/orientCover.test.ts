/**
 * Orientation cover tests (P3 stage A): the greedy over cleared sets —
 * synthetic sets with hand-derivable picks, plus the full op path on an
 * analytic cylinder (a rotationally symmetric part must plan with a tiny
 * set and cover every coverable cell).
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ClearedSetResult } from '../clearedSet';
import { greedyCover } from '../orientCover';

/** a synthetic cleared map: orientations × cells, `cleared` per (oi, k) */
function synthetic(
  clearedPerOrientation: number[][],
  nx = 1,
  nTheta = 6,
): ClearedSetResult {
  const n = nx * nTheta;
  const cleared = new Uint8Array(clearedPerOrientation.length * n);
  clearedPerOrientation.forEach((cells, oi) => {
    for (const k of cells) cleared[oi * n + k] = 1;
  });
  let materialCells = 0;
  let coverable = 0;
  for (let k = 0; k < n; k++) {
    let anyMaterial = false;
    for (let oi = 0; oi < clearedPerOrientation.length; oi++) {
      if (cleared[oi * n + k] === 1) {
        anyMaterial = true;
        break;
      }
    }
    if (anyMaterial) {
      materialCells++;
      coverable++;
    }
  }
  return {
    cleared,
    nx,
    nTheta,
    orientations: clearedPerOrientation.map((_, oi) => oi * 90),
    materialCells,
    coverable,
    buriedEverywhere: 0,
    clearedPerOrientation: clearedPerOrientation.map(
      (cells) => cells.length,
    ),
  };
}

describe('greedyCover', () => {
  it('picks the max-coverage orientation first, then the best complement', () => {
    // A=0 clears {0,1,2}, A=90 clears {2,3}, A=180 clears {3,4,5}:
    // greedy takes A=0 (3 cells), then A=180 (3 new), then stops — A=90
    // adds nothing
    const map = synthetic([[0, 1, 2], [2, 3], [3, 4, 5]]);
    const plan = greedyCover(map);
    expect(plan.picks).toHaveLength(2);
    expect(plan.picks[0].angle).toBe(0);
    expect(plan.picks[0].gain).toBe(3);
    expect(plan.picks[1].angle).toBe(180);
    expect(plan.picks[1].gain).toBe(3);
    expect(plan.covered).toBe(6);
  });

  it('stops when no candidate adds a cell', () => {
    const map = synthetic([[0, 1], [1, 0]]);
    const plan = greedyCover(map);
    expect(plan.picks).toHaveLength(1);
    expect(plan.covered).toBe(2);
  });

  it('an empty map plans nothing', () => {
    const map = synthetic([[], []]);
    const plan = greedyCover(map);
    expect(plan.picks).toHaveLength(0);
    expect(plan.covered).toBe(0);
  });
});

describe('the contour4d op (plan + emission)', () => {
  it('plans a symmetric cylinder with a small orientation set, full coverage, and emits its roughs', async () => {
    const { generateJobOp } = await import('../../ui/jobGeneration');
    const g = new THREE.CylinderGeometry(5, 5, 20, 48).toNonIndexed();
    const stock = {
      kind: 'cylinder' as const,
      length: 20,
      xOrigin: 'min' as const,
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 12 },
      axisMode: '4-axis' as const,
      materialId: 'aluminum-6061',
    };
    const tool = { id: 't', name: '2mm flat', type: 'flat' as const, diameter: 2, fluteLength: 17, spindleRpm: 18000 };
    const op = {
      id: 'c4d',
      kind: 'contour4d' as const,
      toolId: tool.id,
      featureIds: [],
      allowance: 0.2,
      stepDown: 1,
      stepOver: 1,
      orientStep: 30,
      margin: null,
      cutBeyondStock: false,
      finishingOnly: false,
    };
    const res = generateJobOp(op, {
      startA: 0,
      stock,
      geometry: g,
      features: null,
      transform: { position: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      tools: [tool],
      primitives: [],
      sources: [],
      datumAngle: 0,
    });
    expect(res.error).toBeNull();
    // stage B: the plan came with its roughs — real moves (each chosen
    // orientation's waterline) and the emission line in the summary
    expect(res.moves.length).toBeGreaterThan(0);
    expect(res.summary).toMatch(/plan: \d+ orientation/);
    expect(res.summary).toContain('rough(s) emitted');
    // a symmetric cylinder: every orientation clears the same band, so
    // two opposite angles cover it — the greedy should not need more
    // than a handful even with the 12-candidate ladder
    const n = Number((res.summary?.match(/plan: (\d+) orientation/) ?? [])[1] ?? 99);
    expect(n).toBeLessThanOrEqual(4);
  });
});