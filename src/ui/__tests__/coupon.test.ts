import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { identityTransform } from '../../core/types';
import type { JobOp, Stock, Tool } from '../../core/types';
import { MAKERA_TOOLS } from '../../core/makeraTools.generated';
import { generateJobOp } from '../jobGeneration';
import { parseJobFile, saveJobFile } from '../jobFile';
import type { GenContext } from '../jobGeneration';

/**
 * The Delrin coupon: the Phase 1/2 hardware acceptance job for Alice's
 * Ø16 rod (jobs/coupon-delrin-m14x1.cam.json). Everything fits a 50mm
 * section of rod. 3.175 shank bits only — Alice's everyday set: the
 * Spiral O Metal 3.175×12 flat, and a 60° engraving bit (metric threads
 * cut 60° flanks, not the chamfer bit's 90°). Four segments: three
 * M14×1 ccw threads at tolerance 0 / 0.1 / 0.2 (fit tuned against a nut
 * on the machine — PLAN risk 3), each faced to its crest Ø first (the
 * thread's surfaceDiameter says so — no air levels), then a 3-strand
 * spiral carve on the raw rod, cw — the other hand, both on one bar.
 * Regenerate deliberately with UPDATE_GOLDEN=1.
 */

const couponPath = join(import.meta.dirname, '..', '..', '..', 'jobs', 'coupon-delrin-m14x1.cam.json');

function coupon(): { stock: Stock; ops: JobOp[]; tools: Tool[] } {
  const flat = MAKERA_TOOLS.find((t) => t.id === 'makera-o-flute-bits-spiral-o-metal-3-175-12mm')!;
  const vbit = MAKERA_TOOLS.find(
    (t) => t.id === 'makera-engraving-bits-single-flute-engraving-metal-60-deg-1mm',
  )!;
  const stock: Extract<Stock, { kind: 'cylinder' }> = {
    kind: 'cylinder',
    length: 50,
    xOrigin: 'mid', // machine X −25…25 — a 50mm section of rod
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8 },
    axisMode: '4-axis',
    materialId: 'delrin',
  };
  // tolerance sweep → crest Ø 14 / 13.9 / 13.8 (nominal − 2·tol);
  // 10mm threads with 3mm gaps, spiral behind — all within ±24mm
  const threads: [string, number, number, number, number][] = [
    // [id, xStart, xEnd, tolerance, crest Ø]
    ['jobop-1', -24, -14, 0.0, 14.0],
    ['jobop-2', -11, -1, 0.1, 13.9],
    ['jobop-3', 2, 12, 0.2, 13.8],
  ];
  const ops: JobOp[] = [];
  threads.forEach(([id, xStart, xEnd, tolerance, crest], i) => {
    ops.push({
      id: `${id}-face`,
      toolId: flat.id,
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: crest,
      xStart,
      xEnd,
      stepDown: 0.5,
      stepOver: null,
      finishAllowance: 0,
      rotation: 'cw',
      pattern: 'spiral',
    });
    ops.push({
      id: `${id}-thread`,
      toolId: vbit.id,
      featureIds: [],
      kind: 'thread',
      nominalDiameter: 14,
      xStart,
      xEnd,
      pitch: 1,
      starts: 1,
      tolerance,
      stepDown: 0.25,
      rotation: 'ccw',
      surfaceDiameter: crest, // the facing op just made it so
    });
    if (i === threads.length - 1) {
      ops.push({
        id: 'jobop-4-spiral',
        toolId: flat.id,
        featureIds: [],
        kind: 'spiralCarve',
        surfaceDiameter: 16, // the raw rod behind the threads
        xStart: 15,
        xEnd: 24,
        // width 4 > the Ø3.175 tool fans two parallel passes — the fan
        // path gets iron time too
        spiralAngle: 30,
        count: 3,
        depth: 0.5,
        width: 4,
        stepDown: 0.25,
        rotation: 'cw', // the other hand than the threads — both on one bar
      });
    }
  });
  return { stock, ops, tools: [flat, vbit] };
}

describe('the Delrin coupon job', () => {
  it('generates cleanly, end to end, and matches the shipped file', () => {
    const { stock, ops, tools } = coupon();
    const file = saveJobFile({
      stock,
      transform: identityTransform(),
      primitives: [],
      ops,
      tools,
      modelName: 'none', // no model — the coupon is rotary ops only
      modelBytes: null,
    });
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(couponPath, JSON.stringify(file, null, 2));
      return;
    }
    expect(existsSync(couponPath), 'coupon missing — run UPDATE_GOLDEN=1 npx vitest run once').toBe(true);
    expect(JSON.parse(readFileSync(couponPath, 'utf8'))).toEqual(JSON.parse(JSON.stringify(file)));

    // the shipped job loads and EVERY op generates without error
    const parsed = parseJobFile(readFileSync(couponPath, 'utf8'));
    const ctx: GenContext = {
      stock: parsed.stock,
      geometry: null,
      features: null,
      transform: parsed.transform,
      tools: parsed.tools,
      primitives: [],
      sources: [],
      datumAngle: 0,
    };
    let minutes = 0;
    for (const op of parsed.ops) {
      const res = generateJobOp(op, ctx);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      expect(res.moves[0].spindleRpm).toBeDefined();
      minutes += res.minutes;
    }
    // sanity: 3 facings + 3 threads + 1 spiral = 7 ops
    expect(parsed.ops).toHaveLength(7);
    // honest time estimate at the rotary limit — printed for the run sheet
    console.log(`coupon cut time ≈ ${minutes.toFixed(1)} min`);
  });
});
