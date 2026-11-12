import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postCarvera } from '../carvera';
import { faceCylinder } from '../../cam/faceCylinder';
import type { FaceCylinderOp, Move, Stock, Tool } from '../../core/types';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
const stock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};
const op: FaceCylinderOp = {
  kind: 'faceCylinder',
  id: 'op1',
  toolId: 't1',
  targetDiameter: 40,
  xStart: 0,
  xEnd: 100,
  stepDown: 1,
  stepOver: 4.8, // 0.8·Ø — pins the pre-setting behavior of face-cylinder.nc
  finishAllowance: 0.2,
  plungeFeed: 300,
  rotation: 'cw',
  pattern: 'spiral',
  feed: 600,
  // this post test pins the G93/G94 FORMS on the raw spiral (helical entry
  // + coordinated sweep); the squared-edge rings are a face-strategy change
  // pinned in faceCylinder.test.ts — keep them out of the dialect pins
  cutBeyondStock: true,
};

const gcode = postCarvera({
  moves: faceCylinder(op, stock.calibration, tool).moves,
  tools: [tool],
  options: { jobName: 'face-test' },
});

// the generated-at timestamp is legitimately variable; exclude from goldens
const stripDate = (s: string) => s.split('\n').filter((l) => !l.startsWith('; generated')).join('\n');

describe('carvera post-processor', () => {
  it('sets up units/modes and wraps A back after continuous rotation', () => {
    expect(gcode).toContain('G90 G21');
    expect(gcode.trimEnd().endsWith('M02')).toBe(true);
    expect(gcode).toContain('G92.4 A0 S0'); // wrap after setup or at end
  });

  it('wraps A after A-only ring cuts past ±360 (vertical facing) but not small-A rapids', () => {
    // the footer shrink fires only when the counter is genuinely past
    // ±360 (the firmware's own action threshold — below it the shrink is a
    // no-op and is not emitted); inter-op boundaries carry their own shrink
    const ring = postCarvera({
      moves: [{ words: { a: 720 }, feed: 2376 }],
      tools: [tool],
      options: { jobName: 'ring-test' },
    });
    expect(ring.includes('G92.4 A0 S0\nM05')).toBe(true);

    // a full single turn (360) and a small index rapid alike: no-op, clean
    const full = postCarvera({
      moves: [{ words: { a: 360 }, feed: 2376 }],
      tools: [tool],
      options: { jobName: 'full-turn-test' },
    });
    expect(full.includes('G92.4 A0 S0')).toBe(false);

    const index = postCarvera({
      moves: [{ words: { a: 90 }, feed: 0, rapid: true }],
      tools: [tool],
      options: { jobName: 'index-test' },
    });
    expect(index.includes('G92.4 A0 S0\nM05')).toBe(false);
  });

  it('emits the 4th-axis prep header only for jobs that use A at all', () => {
    // a pure 3-axis job: no A word anywhere — no prep assumptions needed
    const flat = postCarvera({
      moves: [
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true },
        { words: { z: -1 }, feed: 200 },
        { words: { x: 10 }, feed: 500 },
      ],
      tools: [tool],
      options: { jobName: 'flat-test' },
    });
    expect(flat).not.toContain('M465.1');
    expect(flat).not.toContain('G10 L20 P0 A0');
    expect(flat).not.toContain('prep assumptions');

    // an index-only job still rides the 4th axis: the angular zero and axis
    // datum are exactly what it depends on, so it KEEPS the header
    const indexOnly = postCarvera({
      moves: [{ words: { a: 90 }, feed: 0, rapid: true, comment: 'index stock to A90°' }],
      tools: [tool],
      options: { jobName: 'index-only-test' },
    });
    expect(indexOnly).toContain('M465.1');
    expect(indexOnly).toContain('G10 L20 P0 A0');
  });

  it('never emits a G93 feed line without F (firmware halts otherwise)', () => {
    let inG93 = false;
    const offenders: string[] = [];
    for (const line of gcode.split('\n')) {
      if (line === 'G93') inG93 = true;
      if (line === 'G94') inG93 = false;
      if (inG93 && /^G1 /.test(line) && !/ F[\d.]+$/.test(line.replace(/\s*;.*$/, ''))) {
        offenders.push(line);
      }
    }
    expect(offenders, offenders.join(' | ')).toEqual([]);
  });

  it('never emits F0/F0.00 — sub-0.005 feeds clamp to the smallest honest feed (the field-report F0 bug)', () => {
    // A G93 pass slower than 200 min (span 133 @ stepOver 0.1 crosses it
    // with legal op settings) formats at 2 decimals to a literal `F0` —
    // undefined on real firmware, a stall mid-cut. Same for G94 feeds
    // under 0.005 mm/min. The post clamps to F0.01 instead.
    const slow: Move[] = [
      { words: { z: 10 }, feed: 0, rapid: true },
      { words: { z: 0 }, feed: 0.004 }, // G94 plunge, would round to F0
      { words: { x: 133, a: 360 }, feed: 0.00496 }, // G93 sweep, would round to F0
      { words: { x: 0 }, feed: 0.00496 }, // G94, would round to F0
      { words: { x: 50 }, feed: 200 }, // normal G94 feed untouched
    ];
    const slowGcode = postCarvera({ moves: slow, tools: [tool], options: { jobName: 'f0-test' } });
    const feedLines = slowGcode
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^G1 /.test(l));
    expect(feedLines.every((l) => !/\bF0(\.0+)?(?![\d.])/.test(l)), feedLines.join(' | ')).toBe(true);
    // the clamped lines read F0.01, the normal feed untouched
    expect(feedLines.filter((l) => / F0\.01$/.test(l.replace(/\s*;.*$/, ''))).length).toBe(3);
    expect(slowGcode).toContain('F200');
    // and the whole-judge: the pinned golden corpus carries no F0 either
    const corpus = [gcode, slowGcode].join('\n');
    expect(corpus.split('\n').filter((l) => /\bF0(\.0+)?(?![\d.])/.test(l))).toEqual([]);
  });

  it('emits helical entry and coordinated sweep in G93', () => {
    const lines = gcode.split('\n');
    expect(lines).toContain('G93');
    // sweep: A advances 7500° on the forward pass + 90° helical entry
    expect(gcode).toMatch(/G1 X100 A7590 F0\.32/);
    // helical entry on the finishing pass: surface 25 − 5 depth = Z20 while A
    // steps 90° at the rotary limit — the retrace keeps A oscillating around
    // the phase (Alice's ladder [1,2,3,4,4.8,5]: the finish level is the
    // 6th, its entry sits at 5×(90+7500) − 4×7500 + 90 = 8040)
    expect(gcode).toMatch(/G1 Z20 A8040 F26\.4/);
  });

  it('documents prep assumptions as comments by default', () => {
    expect(gcode).toContain('; M465.1');
    expect(gcode).toContain('; G10 L20 P0 A0');
  });

  it('emits tool headers in Makera’s @MKR tag format', () => {
    // tag names verified against MakeraStudio's emitted programs (examples/)
    expect(gcode).toContain(
      ';@MKR|TOOL|number=1|id=t1|name=6mm flat|type=Flat End',
    );
  });

  it('starts the spindle with Makera’s S<rpm> M3 line, only on speed change', () => {
    const cut = postCarvera({
      moves: [
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000 },
        { words: { z: -1 }, feed: 200 },
        // a second op with a different speed: restart at the new RPM
        { words: { x: 10, z: 5 }, feed: 0, rapid: true, spindleRpm: 12000 },
        { words: { z: -2 }, feed: 200 },
        // same speed again — modal, no re-emit
        { words: { x: 20, z: 5 }, feed: 0, rapid: true, spindleRpm: 12000 },
      ],
      tools: [tool],
      options: { jobName: 'spindle-test' },
    });
    const starts = cut.match(/S\d+ M3/g) ?? [];
    expect(starts).toEqual(['S18000 M3', 'S12000 M3']);
    // the start precedes the first move, not the header
    expect(cut.indexOf('S18000 M3')).toBeGreaterThan(cut.indexOf('G90 G21'));
    // moves without stamps emit no spindle command at all
    const bare = postCarvera({
      moves: [{ words: { z: -1 }, feed: 200 }],
      tools: [tool],
      options: { jobName: 'bare-test' },
    });
    expect(bare).not.toMatch(/ M3($|\n)/);
  });

  it('matches the golden file (regenerate deliberately with UPDATE_GOLDEN=1)', () => {
    const goldenPath = join(import.meta.dirname, 'golden', 'face-cylinder.nc');
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(goldenPath, stripDate(gcode));
      return; // golden written; review the diff before committing
    }
    expect(existsSync(goldenPath), 'golden missing — run UPDATE_GOLDEN=1 npx vitest run once').toBe(true);
    expect(stripDate(gcode)).toBe(stripDate(readFileSync(goldenPath, 'utf8')));
  });

  // THE Z1 TRUNCATION GUARD (field report, 2026-11-05): the firmware
  // silently truncates overlong instruction lines — a dropped coordinate
  // or a lost F mid-G93 is a ruined job or a broken bit. Comments and
  // TOOL headers are the controller's, not the firmware's, so the limit
  // guards INSTRUCTION words only.
  it('a legal worst-case full house passes the buffer guard untouched', () => {
    // every word at its sane worst: X/Y/Z ±999.99, A ±99999.99, F999.99 —
    // still only ~43 instruction chars, far inside the 61-char guard
    const out = postCarvera({
      moves: [{ words: { x: -999.99, y: -999.99, z: -999.99, a: -99999.99 }, feed: 999.99 }],
      tools: [tool],
      options: { jobName: 'full-house' },
    });
    expect(out).toContain('G1 X-999.99 Y-999.99 Z-999.99 A-99999.99 F999.99');
  });

  it('throws on the pathological coordinate case (the guard fires)', () => {
    // each word ~18 chars: the instruction line crosses the 61-char guard,
    // so the post refuses to emit rather than let the Z1 truncate silently
    expect(() =>
      postCarvera({
        moves: [
          { words: { x: -999999999999.99, y: -999999999999.99, z: -999999999999.99 }, feed: 999.99 },
        ],
        tools: [tool],
        options: { jobName: 'overflow-throw' },
      }),
    ).toThrow(/exceeds the \d+-char firmware buffer/);
  });

  it('trims a trailing comment to keep the whole motion line within 63 chars', () => {
    const long = 'a'.repeat(80);
    const out = postCarvera({
      moves: [
        { words: { x: 5 }, feed: 0, rapid: true, comment: long },
      ],
      tools: [tool],
      options: { jobName: 'comment-trim' },
    });
    const motion = out.split('\n').find((l) => l.startsWith('G0 X5'))!;
    expect(motion).toBeDefined();
    expect(motion.length).toBeLessThanOrEqual(63);
    expect(motion).toMatch(/ ; a+\.\.\.$/); // trimmed with an ellipsis
    // a short comment rides through untouched
    const short = postCarvera({
      moves: [{ words: { x: 5 }, feed: 0, rapid: true, comment: 'level 1/2' }],
      tools: [tool],
      options: { jobName: 'comment-short' },
    });
    const shortLine = short.split('\n').find((l) => l.startsWith('G0 X5'))!;
    expect(shortLine).toBe('G0 X5 ; level 1/2');
  });

  // ---- arcs (G2/G3) ----
  // The dialect facts pinned here come from the community firmware source
  // (reference/community-firmware Robot.cpp), not corpus files — the corpus
  // has ZERO G2/G3. I/J offset form only (Robot.cpp:1292); a G2 without
  // I/J silently no-ops (radius 0 bail, Robot.cpp:2146, no error printed),
  // so violations are refused at emission, never mis-emitted.

  it('emits arc moves as G2/G3 with I/J offsets, never R', () => {
    const out = postCarvera({
      // quarter circle ccw from (10,0) around (0,0) to (0,10)
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true },
        { words: { x: 10, y: 0, z: -1 }, feed: 200 },
        { words: { x: 0, y: 10, z: -1 }, feed: 300, arc: { i: -10, j: 0, cw: false } },
        // and back cw around the same center
        { words: { x: 10, y: 0, z: -1 }, feed: 300, arc: { i: 0, j: -10, cw: true } },
      ],
      tools: [tool],
      options: { jobName: 'arc-test' },
    });
    expect(out).toContain('G17'); // explicit plane select when arcs present
    expect(out).toContain('G3 X0 Y10 Z-1 I-10 J0 F300');
    // F is modal on arcs like G1 — emitted on change, not repeated
    expect(out).toContain('G2 X10 Y0 Z-1 I0 J-10');
    expect(out).not.toMatch(/ R-?\d/); // never the R form
  });

  it('emits a full circle as start==end with I/J (firmware forces ±2π)', () => {
    const out = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true },
        { words: { x: 10, y: 0, z: -1 }, feed: 200 },
        { words: { x: 10, y: 0, z: -1 }, feed: 300, arc: { i: -10, j: 0, cw: false } },
      ],
      tools: [tool],
      options: { jobName: 'full-circle' },
    });
    // start==end byte-identical coordinates: the firmware's full-circle
    // detection is an EXACT float equality on the previous target
    // (Robot.cpp:2123) — the emitted X/Y must round identically
    expect(out).toContain('G3 X10 Y0 Z-1 I-10 J0 F300');
  });

  it('emits helical arcs with a Z word (firmware interpolates plane_axis_2 linearly)', () => {
    const out = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true },
        { words: { x: 10, y: 0, z: -0.5 }, feed: 100 },
        // one full turn descending to Z-2 — the ramp entry form
        { words: { x: 10, y: 0, z: -2 }, feed: 200, arc: { i: -10, j: 0, cw: false } },
      ],
      tools: [tool],
      options: { jobName: 'helical' },
    });
    expect(out).toContain('G3 X10 Y0 Z-2 I-10 J0 F200');
  });

  it('refuses structurally-unsafe arc moves instead of silently no-opping on the machine', () => {
    const expectRefused = (moves: Move[]) =>
      expect(() =>
        postCarvera({ moves, tools: [tool], options: { jobName: 'arc-refuse' } }),
      ).toThrow();
    // zero I/J: radius-0 arc — the firmware would drop it without a word
    expectRefused([{ words: { x: 10, y: 0 }, feed: 200, arc: { i: 0, j: 0, cw: true } }]);
    // missing endpoint words: full circle must be explicit start==end
    expectRefused([{ words: { z: -1 }, feed: 200, arc: { i: -10, j: 0, cw: true } }]);
    // A-coordinated arc: G93 has no arc form
    expectRefused([
      { words: { x: 10, y: 0, a: 30 }, feed: 200, arc: { i: -10, j: 0, cw: true } },
    ]);
    // laser power on an arc: untested combination, refuse
    expectRefused([
      { words: { x: 10, y: 0 }, feed: 200, power: 0.5, arc: { i: -10, j: 0, cw: true } },
    ]);
  });

  it('omits G17 when the job has no arcs (dialect stays byte-identical for existing goldens)', () => {
    const out = postCarvera({
      moves: [{ words: { x: 0, y: 0, z: -1 }, feed: 200 }],
      tools: [tool],
      options: { jobName: 'no-arcs' },
    });
    expect(out).not.toContain('G17');
  });
});