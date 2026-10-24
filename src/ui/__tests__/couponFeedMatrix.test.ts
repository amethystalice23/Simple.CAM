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
 * The Delrin matrix coupon v4 (Alice's spiral-cut design, cut iteratively
 * 2026-10-24): the calibration piece for groove cutting in Delrin — the
 * acetal-fluff question, one job, no trial-and-error.
 *
 * v2 found a decisive winner (300 mm/min × 8000 RPM completely clear);
 * v3's finer grid around it read worse everywhere (best 400 × 8500),
 * and Alice caught the confound: the cleanest cuts were the DEEPEST —
 * the stock rod sits slightly eccentric to the rotation axis, so
 * strands on proud spots engaged deeper and sheared, strands on low
 * spots rubbed. Extruded rod may also carry a stress skin. v4 removes
 * both: a WHOLE-BAR face pass first (Ø16.35 → 15.75, one 0.3mm radial
 * level — pass COUNT drives the cost at ~50 A-revs ≈ 7.6 min per pass at
 * the rotary ceiling, so one level beats two gentle ones — stepOver 1mm
 * MAX, the endmills aren't perfectly flat at the end), then the matrix
 * cuts into the TRUE, skin-free surface.
 *
 * The v4 matrix answered the step-down question decisively: the deepest,
 * fastest cell won (450 mm/min × 0.8 single-pass) — "acetal does not
 * like you to go gentle" (Alice); within every feed group the deepest
 * cut was cleanest, and on the deepest row the fastest feed had the
 * least fringe. Step-down is now PEGGED at 1mm (Alice's recommended
 * acetal/Delrin default, single pass) and v5 returns to spindle speed:
 * feeds "around 450 and up" by grouping × RPMs either side of 8500 by
 * strand.
 *
 * The angle moves 45° → 60° to make the feed axis REAL: the 45° geometry
 * clamps at ~450 mm/min (everything above is rotary-ceiling-capped), but
 * too axial collides grooves — a groove's A-width grows 1/cos(angle):
 * at 70° it spans 9.3mm = 77° of arc, WIDER than the 72° strand pitch
 * (v1's overlap lesson); at 60° it is 53° with 2.3mm walls and the
 * clamp lifts to ~634 mm/min. Feeds 450…650 — 650 is a deliberate edge
 * probe that clamps to ~634.
 *
 * AXES SWAPPED per Alice: RPM by GROUPING (X position), feed by STRAND
 * (around the cylinder) — the spindle slows down slower than the
 * machine repositions, so a spindle change at every cell boundary would
 * let a still-settling spindle skew adjacent cells. This way the
 * spindle changes only 5× per job, in small monotonic +750 rises, and
 * the per-strand feed changes are instantaneous. Find the groove that
 * finishes LATE (the +X tail) — strand 1, the lowest FEED — and read
 * around the cylinder for the feed ladder; RPM runs −X → +X.
 * New bar, so the whole-bar face pass runs again.
 *
 * Regenerate deliberately with UPDATE_GOLDEN=1 — that rewrites the job
 * file, so never run it over hand edits.
 */

const couponPath = join(import.meta.dirname, '..', '..', '..', 'jobs', 'coupon-delrin-feed-matrix.cam.json');

/** the faced surface every matrix op cuts into */
const FACE_DIAMETER = 15.75; // 0.3mm of skin+runout off the raw Ø16.35
const FACE_STEP_OVER = 1; // endmills aren't perfectly flat — keep it small
const FACE_STEP_DOWN = 0.3; // ONE radial level: pass COUNT drives the ~7.6min/pass cost
/** feeds by STRAND, spin 0 → 288° (instant changes, no settling skew) */
const FEEDS = [450, 500, 550, 600, 650];
/** RPMs by GROUPING, −X → +X: either side of v4's 8500 — only 5 spindle
 * changes per job, small monotonic +750 rises (spindles slow slower
 * than the machine repositions — keep changes off the cell boundaries) */
const RPMS = [7000, 7750, 8500, 9250, 10000];
const SPIN_STEP = 72; // 5 strands evenly around 360°
const GROUP_X0 = -20; // grouping 1's cut start (machine X)
const GROUP_PITCH = 8; // groupings at −20, −12, −4, +4, +12 …
const SPAN = 5; // groove length along X (advance ≈ 21° at 60° on the faced Ø)
const TAIL = 1.5; // strand 1's +X finish marker (END, not start)
const ANGLE = 60; // lifts the ceiling clamp to ~634; 70° would collide grooves
const DEPTH = 1.0; // v4's verdict: single full-depth pass — gentle is worse
const PLUNGE = 150; // fixed on every op so plunge never confounds the matrix

function coupon(): { stock: Stock; ops: JobOp[]; tools: Tool[] } {
  const flat = MAKERA_TOOLS.find((t) => t.id === 'makera-o-flute-bits-spiral-o-metal-3-175-12mm')!;
  const stock: Extract<Stock, { kind: 'cylinder' }> = {
    kind: 'cylinder',
    length: 50,
    xOrigin: 'mid', // machine X −25…25
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 }, // the TRUE stock Ø 16.35
    axisMode: '4-axis',
    materialId: 'delrin',
  };
  const ops: JobOp[] = [
    // the whole-bar face: trues the runout and strips any stress skin —
    // every matrix cell then starts from the same genuine cylinder
    {
      id: 'jobop-0-face',
      toolId: flat.id,
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: FACE_DIAMETER,
      xStart: -25, // the whole bar
      xEnd: 25,
      stepDown: FACE_STEP_DOWN,
      stepOver: FACE_STEP_OVER,
      finishAllowance: 0,
      rotation: 'cw',
      pattern: 'spiral',
      rates: { feed: 400, spindleRpm: 8500, plungeFeed: PLUNGE },
    },
  ];
  RPMS.forEach((rpm, g) => {
    FEEDS.forEach((feed, s) => {
      ops.push({
        id: `jobop-g${g + 1}-s${s + 1}`,
        toolId: flat.id,
        featureIds: [],
        kind: 'spiralCarve',
        surfaceDiameter: FACE_DIAMETER, // the surface the face op just made
        xStart: GROUP_X0 + g * GROUP_PITCH,
        xEnd: GROUP_X0 + g * GROUP_PITCH + SPAN + (s === 0 ? TAIL : 0), // strand 1 finishes late
        spiralAngle: ANGLE,
        count: 1,
        depth: DEPTH,
        width: 0, // just follow the lines — one tool-width groove
        stepDown: DEPTH, // v4's verdict: one full-depth pass per groove
        rotation: 'cw',
        spin: s * SPIN_STEP,
        rates: { feed, spindleRpm: rpm, plungeFeed: PLUNGE },
      });
    });
  });
  return { stock, ops, tools: [flat] };
}

describe('the Delrin step-down × feed matrix coupon job', () => {
  it('generates cleanly, end to end, and matches the shipped file', () => {
    const { stock, ops, tools } = coupon();
    const file = saveJobFile({
      stock,
      transform: identityTransform(),
      primitives: [],
      ops,
      tools,
      modelName: 'none', // no model — face op + 25 spiral cuts, one tool
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
      startA: 0,
    };
    let minutes = 0;
    for (const op of parsed.ops) {
      const res = generateJobOp(op, ctx);
      expect(res.error, `${op.id}: ${res.error}`).toBeNull();
      expect(res.moves.length).toBeGreaterThan(0);
      minutes += res.minutes;
    }
    // the face pass first, then the matrix: 5 groupings × 5 strands
    expect(parsed.ops).toHaveLength(1 + FEEDS.length * RPMS.length);
    const face = parsed.ops[0];
    if (face.kind === 'faceCylinder') expect(face.targetDiameter).toBe(FACE_DIAMETER);
    // grouping 1's strands sit at their spin phases, in cut order — the
    // positioning takes the SIGNED shortest rotation, so compare mod 360.
    // Within a grouping the RPM is constant (it varies only by X position);
    // the feed varies per strand.
    FEEDS.forEach((feed, s) => {
      const res = generateJobOp(parsed.ops[1 + s], ctx);
      const a = res.moves[0].words.a ?? 0;
      expect((((a % 360) + 360) % 360).toFixed(6)).toBe((s * SPIN_STEP).toFixed(6));
      expect(res.moves[0].spindleRpm).toBe(RPMS[0]); // ⚡ RPM reaches the spindle line
      expect(parsed.ops[1 + s].rates?.feed).toBe(feed);
      const last = generateJobOp(parsed.ops[1 + 4 * RPMS.length + s], ctx);
      expect(last.moves[0].spindleRpm).toBe(RPMS[RPMS.length - 1]); // group 5 runs the top RPM
    });
    // strand 1 of every grouping carries the +X finish tail, into the gap;
    // every cell is a single full-depth pass (v4's verdict)
    parsed.ops.forEach((op, i) => {
      if (op.kind !== 'spiralCarve') return;
      const g = Math.floor((i - 1) / RPMS.length);
      const s = (i - 1) % RPMS.length;
      expect(op.xStart).toBe(GROUP_X0 + g * GROUP_PITCH);
      expect(op.xEnd).toBe(GROUP_X0 + g * GROUP_PITCH + SPAN + (s === 0 ? TAIL : 0));
      expect(op.stepDown).toBe(DEPTH);
      expect(op.depth).toBe(DEPTH);
    });
    // honest time estimate — printed for the run sheet
    console.log(`matrix coupon cut time ≈ ${minutes.toFixed(1)} min (face pass dominates)`);
  });
});