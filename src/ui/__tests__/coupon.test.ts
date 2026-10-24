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
 * cut 60° flanks, not the chamfer bit's 90°).
 *
 * Coupon v3 (Alice's spec 2026-10-22, the day before the cut): ONE M14×1
 * ccw thread at tolerance 0.1 — the middle of v1's sweep, the one that
 * worked — at the BAR'S END (X 15…25) so a fitting screws straight on,
 * no sawing the coupon apart, faced to its crest Ø 13.9 first; a
 * 4-strand 30° spiral groove section at 3mm width (v2's five at 4mm was
 * too much) with the facing bit; and a knurling section opposite the
 * thread: a CROSSED pair of width-0 V-bit ops — 60° off the
 * circumferential (30° off the axis, the lathe diagonal-knurl angle),
 * one cw one ccw, 24 strands each, 0.4mm deep — the two helix families
 * cross into the diamond grid. Op order groups by tool — flat face +
 * spiral, one swap, V-bit thread + knurl. Regenerate deliberately with
 * UPDATE_GOLDEN=1 — that rewrites the job file, so never run it over
 * hand edits.
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
  const ops: JobOp[] = [
    // flat bit first: face the thread's crest at the bar's end…
    {
      id: 'jobop-1-face',
      toolId: flat.id,
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: 13.9, // the crest the thread's surfaceDiameter claims
      xStart: 15,
      xEnd: 25, // the bar's end — the thread screws straight into a fitting
      stepDown: 0.5,
      stepOver: 1,
      finishAllowance: 0,
      rotation: 'cw',
      pattern: 'spiral',
    },
    // …then the spiral grooves on the raw rod behind it
    {
      id: 'jobop-2-spiral',
      toolId: flat.id,
      featureIds: [],
      kind: 'spiralCarve',
      surfaceDiameter: 16, // the raw rod
      xStart: -11,
      xEnd: -1,
      spiralAngle: 30,
      count: 4, // v2's five at 4mm wide was too much — four at 3mm
      depth: 0.5,
      width: 3,
      stepDown: 0.25,
      rotation: 'cw', // the other hand than the thread — both on one bar
    },
    // one tool swap: the V-bit thread on the faced end…
    {
      id: 'jobop-3-thread',
      toolId: vbit.id,
      featureIds: [],
      kind: 'thread',
      nominalDiameter: 14,
      xStart: 15,
      xEnd: 25,
      pitch: 1,
      starts: 1,
      tolerance: 0.1, // the middle of v1's tolerance sweep
      stepDown: 0.25,
      rotation: 'ccw',
      surfaceDiameter: 13.9, // the facing op just made it so
    },
    // …then the knurling opposite: two crossed helix families, one per
    // hand, width 0 — each groove is the V-bit's own ~0.46mm cut
    {
      id: 'jobop-4-knurl-cw',
      toolId: vbit.id,
      featureIds: [],
      kind: 'spiralCarve',
      surfaceDiameter: 16, // the raw rod
      xStart: -24,
      xEnd: -14,
      spiralAngle: 60, // 30° off the axis — the diagonal-knurl angle
      count: 24, // ~2.1mm pitch around the Ø16 rod
      depth: 0.4,
      width: 0, // just follow the lines — no width fan
      stepDown: 0.2,
      rotation: 'cw',
    },
    {
      id: 'jobop-5-knurl-ccw',
      toolId: vbit.id,
      featureIds: [],
      kind: 'spiralCarve',
      surfaceDiameter: 16,
      xStart: -24,
      xEnd: -14,
      spiralAngle: 60, // the mirror family — the two cross into diamonds
      count: 24,
      depth: 0.4,
      width: 0,
      stepDown: 0.2,
      rotation: 'ccw',
    },
  ];
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
      datumAngle: 0, startA: 0,
    };
    // generate exactly like the app's recalcAll: A and the spindle state
    // thread op-to-op, so the printed figure matches the export's honest one
    let a = 0;
    let prevRpm: number | undefined;
    let minutes = 0;
    for (const op of parsed.ops) {
      const res = generateJobOp(op, { ...ctx, startA: a, prevRpm });
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      expect(res.moves[0].spindleRpm).toBeDefined();
      a = res.finalA;
      prevRpm = res.spindleRpm ?? prevRpm;
      minutes += res.minutes;
    }
    // sanity: face + spiral + thread + knurl pair = 5 ops
    expect(parsed.ops).toHaveLength(5);
    // honest time estimate at the rotary limit — printed for the run sheet
    console.log(`coupon cut time ≈ ${minutes.toFixed(1)} min`);
  });
});
