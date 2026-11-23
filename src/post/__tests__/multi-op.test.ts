import { describe, expect, it } from 'vitest';
import { postCarvera } from '../carvera';
import { faceCylinder } from '../../cam/faceCylinder';
import { cylChamfer } from '../../cam/cylChamfer';
import type { Tool } from '../../core/types';

const tools: Tool[] = [
  { id: 't1', name: '6mm Flat End', type: 'flat', diameter: 6, spindleRpm: 18000 },
  { id: 't2', name: '3mm V-Bit', type: 'vbit', diameter: 3, vAngle: 60, spindleRpm: 12000 },
];

describe('Carvera multi-op post', () => {
  it('emits full tool-change blocks and markers for tagged ops', () => {
    const moves = [
      // Op 1: Tool 1
      {
        words: { x: 0, y: 0, z: 5 },
        feed: 0,
        rapid: true,
        spindleRpm: 18000,
        op: { number: 1, name: 'Face Top', toolNumber: 1 },
      },
      { words: { z: -1 }, feed: 200 },
      // Op 2: Tool 1 (same tool, should only emit marker)
      {
        words: { x: 10, y: 0, z: 5 },
        feed: 0,
        rapid: true,
        spindleRpm: 18000,
        op: { number: 2, name: 'Clear Pocket', toolNumber: 1 },
      },
      { words: { z: -2 }, feed: 200 },
      // Op 3: Tool 2 (new tool, should emit M5, T M6, and forced S M3)
      {
        words: { x: 0, y: 10, z: 5 },
        feed: 0,
        rapid: true,
        spindleRpm: 12000,
        op: { number: 3, name: 'Chamfer Edge', toolNumber: 2 },
      },
      { words: { z: -0.5 }, feed: 100 },
    ];

    const gcode = postCarvera({
      moves,
      tools,
      toolNumbers: [1, 2], // Explicit tool numbers
      options: { jobName: 'multi-op-test' },
    });

    // Op 1 start: No M5, but T1 M6
    expect(gcode).toContain(';@MKR|TOOLPATH_START|toolpath_number=1');
    expect(gcode).toContain('; T1-6mm Flat End');
    expect(gcode).toContain('T1 M6');
    expect(gcode).not.toMatch(/M5\s*\n\s*;\s*T1/); // No M5 before the very first tool

    // Op 2 start: Only marker, no M5/T M6
    expect(gcode).toContain(';@MKR|TOOLPATH_START|toolpath_number=2');
    const op2Marker = gcode.indexOf(';@MKR|TOOLPATH_START|toolpath_number=2');
    const op2T = gcode.indexOf('T1 M6', op2Marker);
    expect(op2T).toBe(-1); // No second T1 M6

    // Op 3 start: Marker + M5 + T2 M6 + S M3
    expect(gcode).toContain(';@MKR|TOOLPATH_START|toolpath_number=3');
    expect(gcode).toContain('M5');
    expect(gcode).toContain('; T2-3mm V-Bit');
    expect(gcode).toContain('T2 M6');

    // Verify S M3 re-fire
    const s3 = gcode.indexOf('S12000 M3');
    expect(s3).toBeGreaterThan(gcode.indexOf('T2 M6'));
  });

  it('emits nothing special for untagged moves', () => {
    const moves = [
      { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000 },
      { words: { z: -1 }, feed: 200 },
      { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 12000 },
      { words: { z: -2 }, feed: 200 },
    ];
    const gcode = postCarvera({
      moves,
      tools,
      options: { jobName: 'untagged-test' },
    });
    expect(gcode).not.toContain(';@MKR|TOOLPATH_START');
    expect(gcode).not.toContain('T1 M6');
    expect(gcode).not.toContain('M5');
  });

  it('uses provided toolNumbers', () => {
    const gcode = postCarvera({
      moves: [{ words: { x: 0 }, feed: 0, rapid: true, op: { number: 1, name: 'test', toolNumber: 10 } }],
      tools: [tools[0]],
      toolNumbers: [10],
      options: { jobName: 'tools-test' },
    });
    expect(gcode).toContain(';@MKR|TOOL|number=10');
    expect(gcode).toContain('T10 M6');
  });

  // SAFETY (Alice, 2026-10-23): with the 4th axis fitted, a diagonal
  // descent during the return travel after a tool swap can clip the
  // rotary hardware. The convention every generator now follows —
  // Makera's own ordering (examples/MakeraStudioSpindle_top…): travel at
  // the machine's existing height (the swap macro parks it high), THEN
  // descend over the destination. Pinned here across a real two-tool job.
  it('returns from a tool change safely: travel first, descend at the destination', () => {
    const cal = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };
    const faceMoves = faceCylinder(
      {
        kind: 'faceCylinder',
        id: 'f1',
        toolId: 't1',
        targetDiameter: 40,
        xStart: 0,
        xEnd: 50,
        stepDown: 2,
        stepOver: 5,
        finishAllowance: 0.2,
        plungeFeed: 100,
        feed: 400,
        rotation: 'cw',
        pattern: 'spiral',
      },
      cal,
      tools[0],
      0,
    ).moves.map((m, i) =>
      i === 0 ? { ...m, op: { number: 1, name: 'Face', toolNumber: 1 }, spindleRpm: 18000 } : m,
    );
    const chamMoves = cylChamfer(
      {
        kind: 'cylChamfer',
        id: 'c1',
        toolId: 't2',
        edges: [{ x: 25, diameter: 20 }],
        depth: 0,
        stepDown: 1,
        rotation: 'cw',
        plungeFeed: 100,
      },
      cal,
      tools[1],
      720,
    ).moves.map((m, i) =>
      i === 0 ? { ...m, op: { number: 2, name: 'Chamfer', toolNumber: 2 }, spindleRpm: 12000 } : m,
    );
    const gcode = postCarvera({
      moves: [...faceMoves, ...chamMoves],
      tools,
      toolNumbers: [1, 2],
      options: { jobName: 'toolchange-safety' },
    });
    const code = (l: string) => l.split(';')[0]; // comments never carry facts

    // after every T M6, the first motion line carries NO Z word: the
    // positioning travel (X/Y/A) runs at the swap macro's high park
    for (const m of gcode.matchAll(/^T\d+ M6$/gm)) {
      const after = gcode
        .slice(m.index! + m[0].length)
        .split('\n')
        .map(code);
      const firstMotion = after.find((l) => /^G[01][^0-9]/.test(l.trim()));
      expect(firstMotion, 'no motion found after a tool change').toBeDefined();
      expect(firstMotion, 'the return travel must not descend — travel first, descend at the destination')
        .not.toMatch(/\bZ[-\d.]/);
    }

    // and no rapid anywhere runs diagonal: a Z rapid never shares its
    // line with an X, Y, or A word (in-cut helical ENTRY moves are G1s,
    // deliberate — this pins the rapids only)
    const diagonals = gcode
      .split('\n')
      .map(code)
      .filter((l) => /^G0 /.test(l.trim()))
      .filter((l) => /\bZ[-\d.]/.test(l) && /\b[XYA][-.\d]/.test(l));
    expect(diagonals).toEqual([]);
  });

  it('positions the rotary centerline (G0 Y0) in 4-axis jobs, after the datum and every tool change', () => {
    // 2026-10-25 field report: two users, both controllers — after the
    // tool swap/length-measure/4th-axis-probe start cycle the machine
    // traversed X but never Y and cut in mid air. Wrapped ops live in
    // the X-Z-A frame (Y is constant at the centerline and NEVER
    // appears in the body), so the file must establish Y itself:
    // Studio's Stage1/Turned exports emit `G0 Y0` at every
    // centerline-riding toolpath start, and the controller's own cycles
    // are what knock Y off it in between.
    const rotary = [
      {
        words: { x: 0, z: 30 },
        feed: 0,
        rapid: true,
        spindleRpm: 18000,
        op: { number: 1, name: 'Face', toolNumber: 1 },
      },
      { words: { z: 24, a: 90 }, feed: 26.4, op: { number: 1, name: 'Face', toolNumber: 1 } },
      {
        words: { x: 0, z: 30 },
        feed: 0,
        rapid: true,
        spindleRpm: 12000,
        op: { number: 2, name: 'Chamfer', toolNumber: 2 },
      },
      { words: { z: 25, a: 120 }, feed: 30, op: { number: 2, name: 'Chamfer', toolNumber: 2 } },
    ];

    const gcode = postCarvera({
      moves: rotary,
      tools,
      toolNumbers: [1, 2],
      options: { jobName: 'rotary-y0' },
    });
    const lines = gcode.split('\n');

    // the header datum is immediately followed by the centerline rapid
    const datum = lines.findIndex((l) => l === 'G92.4 A0 R0');
    expect(datum).toBeGreaterThan(-1);
    expect(lines[datum + 1]).toBe('G0 Y0');

    // the mid-file tool change re-establishes it — and BEFORE any other
    // motion, so the op's own travel never runs off-centerline
    const m6 = lines.findIndex((l) => l === 'T2 M6');
    expect(m6).toBeGreaterThan(-1);
    const after = lines.slice(m6 + 1);
    const firstMotion = after.findIndex((l) => /^G[01][^0-9]/.test(l));
    expect(after[firstMotion]).toBe('G0 Y0');

    // 3-axis files never carry the line: nothing rides a centerline
    const flat = postCarvera({
      moves: [
        { words: { x: 5, y: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: { number: 1, name: 'Pocket', toolNumber: 1 } },
        { words: { z: -1 }, feed: 200, op: { number: 1, name: 'Pocket', toolNumber: 1 } },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'flat-no-y0' },
    });
    expect(flat).not.toContain('G0 Y0');
  });
});

describe('inter-op A shrink (G92.4 A0 S0 at op boundaries)', () => {
  it('shrinks work-A at an op boundary once it exceeds ±360, preserving the fractional orientation', () => {
    // Alice's 2026-10-26 call, ahead of the big continuous-rotary ops:
    // the S-shrink (whole-turn subtraction, no motion, no EEPROM) at op
    // boundaries where the counter has piled past ±360, so a multi-op job
    // stays small throughout; the fractional orientation a later op
    // continues from is exactly preserved. The plain G92.4 A<deg> reset is
    // deliberately avoided — it could lose registration.
    const op = (n: number) => ({
      number: n,
      name: `Op${n}`,
      toolNumber: 1,
    });
    const gcode = postCarvera({
      moves: [
        // op 1: a continuous spiral accumulating 540° of work-A
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op(1) },
        { words: { x: 10, a: 540 }, feed: 1, op: op(1) },
        // op 2: boundary — the accumulated 540° trips the shrink
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op(2) },
        { words: { z: -1 }, feed: 200, op: op(2) },
        // op 3: another boundary — A was shrunk, no second shrink
        { words: { x: 5, y: 5, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op(3) },
        { words: { z: -2 }, feed: 200, op: op(3) },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'inter-op-shrink' },
    });
    const lines = gcode.split('\n');
    const shrinks = lines.filter((l) => l === 'G92.4 A0 S0');
    // exactly ONE shrink: at the op2 boundary (after the 540° pile), and
    // the footer keeps its own — no, the footer emits only when usedA and
    // the counter is dirty again; here op2/op3 carry no A, so the footer
    // shrink is skipped (lastA was reset to 0 at the boundary)... assert
    // the boundary one sits right after the op2 marker
    expect(shrinks.length).toBe(1);
    const marker2 = lines.findIndex((l) => l.includes('toolpath_number=2'));
    expect(marker2).toBeGreaterThan(-1);
    const shrinkAt = lines.indexOf('G92.4 A0 S0', marker2);
    expect(shrinkAt).toBeGreaterThan(marker2);
    expect(lines[shrinkAt - 1]).toMatch(/shrink work-coordinate A back/i);
    // nothing after op3's marker shrinks (no A accumulated since)
    const marker3 = lines.findIndex((l) => l.includes('toolpath_number=3'));
    const shrink3 = lines.indexOf('G92.4 A0 S0', marker3);
    expect(shrink3).toBe(-1);
  });

  it('never shrinks when A stayed inside ±360', () => {
    const op = { number: 1, name: 'Index', toolNumber: 1 };
    const gcode = postCarvera({
      moves: [
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op },
        { words: { a: 180 }, feed: 0, rapid: true, op },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'small-a-no-shrink' },
    });
    // 180 < 360: the boundary/footer stays clean of inter-op shrinks (the
    // footer's own wrap only fires on usedA — a pure index rapid sets it)
    expect(gcode).not.toMatch(/shrink work-coordinate A back/i);
  });

  it('pre-anchor shrink: a >1-rev pure-A return rapid unwinds at most a partial turn', () => {
    // Alice's 2026-11-06 unwind report: the datum-discipline return is a
    // pure-A rapid from an accumulated pile (her TDC_Adjust face ops wound
    // to 6678°, the returns spun the whole pile back — ~10 min of dead
    // rotation). The post emits G92.4 A0 S0 (whole turns, zero motion)
    // IMMEDIATELY before the anchor move, so the physical return is < 1
    // rev. Partial-export safety (her ruling): the return stays a real
    // move — the shrink only shortens it, never replaces it.
    const op = { number: 1, name: 'Rotary face', toolNumber: 1 };
    const gcode = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op },
        { words: { z: 4, a: 6678 }, feed: 26.4, op }, // G93 helix, piles 18.55 turns
        {
          words: { a: 0 },
          feed: 0,
          rapid: true,
          op,
          comment: 'return A to the borrowed datum 0.0° (datum discipline)',
        },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'pre-anchor-shrink' },
    });
    const lines = gcode.split('\n');
    // 6678 piles 18.55 turns: the shrink drops 18 (6480°) leaving the
    // counter at 198. The return's re-expressed target is
    // 198 + signedRemainder(0 − 6678) = 198 + 162 = 360 — the SPOKE of
    // the datum, spoken post-shrink. |360 − 198| = 162° of physical
    // travel, ≤ 180: the alias branch doesn't fire (the property it
    // protects — never > 180° — already holds), so the anchor emits as a
    // direct G0 A360 and the counter lands ON the datum spoke 360 ≡ 0.
    const anchor = lines.findIndex((l) => /^G0 A360(;| |$)/.test(l));
    expect(anchor).toBeGreaterThan(-1);
    // the shrink is the last INSTRUCTION before the anchor motion — the
    // frame rebase must not land between any other A-bearing pair
    expect(lines[anchor - 1]).toBe('G92.4 A0 S0');
    expect(lines[anchor - 2]).toMatch(/whole turns, no motion/);
    // no further anchor motion or re-anchor needed: the counter is at
    // the spoke the next op expects (360 ≡ 0 mod 360) — no plain
    // G92.4 re-set after it
    expect(lines[anchor + 1]).not.toMatch(/^G92\.4/);
  });

  it('pre-anchor shrink: a mid-op stance anchor re-anchors the counter to the raw pile (the polish phantom-revolution fix)', () => {
    // Her spiral_test+polish report (2026-11-23): a mid-op stance anchor
    // past 360 fired the pre-anchor shrink, which re-expressed the anchor
    // as the reduced absolute (G0 A41.5 for raw A401.5) but left the
    // counter there — the SAME op's cut moves speak the generator's raw
    // accumulated A, so the first cut commanded a whole extra feed turn
    // (counter 41.5, cut word A401.5, tool buried at plunge depth): ~125
    // stances swept phantom full revolutions, the sim ate the model's
    // middle as un-flagged "circular swipes". The shrink path must
    // re-anchor the counter to the raw target like the short-way path.
    const op = { number: 1, name: '4D Polish', toolNumber: 1 };
    const gcode = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op },
        // stance 1's cuts pile A past one full turn (raw 395.5)
        { words: { z: 4, a: 395.5 }, feed: 26.4, op },
        // mid-op stance anchor — |preA| > 360 fires the shrink
        { words: { a: 401.5 }, feed: 0, rapid: true, op, comment: 'stance anchor' },
        // the next stance's cut moves speak RAW accumulated A — without
        // the re-anchor this move is a phantom 360° feed revolution
        { words: { x: 10.5, y: 0.5, z: 3.9, a: 401.5 }, feed: 900, op },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'stance-reanchor' },
    });
    const lines = gcode.split('\n');
    // the shrink fired: counter 395.5 → 35.5, anchor re-expressed to 41.5
    const anchor = lines.findIndex((l) => /^G0 A41\.5(;| |$)/.test(l));
    expect(anchor).toBeGreaterThan(-1);
    expect(lines[anchor - 1]).toBe('G92.4 A0 S0');
    // THE RE-ANCHOR: the counter returns to the raw pile before the
    // raw-A cut moves run (the anchor carries a comment line — index by
    // the re-anchor text, not by offset)
    const reAnchor = lines.indexOf('; re-anchor the counter to 401.5° (no motion)', anchor);
    expect(reAnchor).toBeGreaterThan(anchor);
    expect(lines[reAnchor + 1]).toBe('G92.4 A401.5');
    // the cut speaks raw A401.5 — now counter-consistent
    expect(gcode).toMatch(/^G1 .*A401\.5/m);
  });

  it('pre-anchor shrink: an UNTAGGED mid-op stance anchor re-anchors too — the discriminator is the next op START, not tags on the anchor', () => {
    // stampOp tags only each op's FIRST move, so the app's mid-op stance
    // anchors and their following cuts are untagged — the re-anchor must
    // fire on "next move is a continuation", not on the anchor's own tag
    const gcode = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000 },
        { words: { z: 4, a: 395.5 }, feed: 26.4 },
        { words: { a: 401.5 }, feed: 0, rapid: true },
        { words: { x: 10.5, y: 0.5, z: 3.9, a: 401.5 }, feed: 900 },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'untagged-stance' },
    });
    const lines = gcode.split('\n');
    const anchor = lines.findIndex((l) => /^G0 A41\.5(;| |$)/.test(l));
    expect(anchor).toBeGreaterThan(-1);
    const reAnchor = lines.indexOf('; re-anchor the counter to 401.5° (no motion)', anchor);
    expect(reAnchor).toBeGreaterThan(anchor);
    expect(lines[reAnchor + 1]).toBe('G92.4 A401.5');
  });

  it('never pre-shrinks a coordinated (X+Z+A) helix — cut moves keep frame', () => {
    const op = { number: 1, name: 'Thread', toolNumber: 1 };
    const gcode = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op },
        { words: { x: 23.6, a: -4680 }, feed: 0.51, op }, // G93 thread helix — the cut itself
        { words: { x: 23.6, a: -4680 }, feed: 0.51, op },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'no-midcut-shrink' },
    });
    // no shrink between the two helix passes: a rebase mid-op would strand
    // every later absolute A word by whole turns
    expect(gcode).not.toMatch(/whole turns, no motion[\s\S]*G93[\s\S]*G1 X23\.6 A-4680[\s\S]*whole turns, no motion/);
  });

  // THE ±360 WHOLE-TURN RESIDUE PIN (2026-11-13, the TDC_Adjust no-op ring
  // report): a datum-discipline return that lands the counter at EXACTLY
  // ±360 makes the next op's first absolute ring (startA + 360) a
  // zero-travel no-op — measured twice on her milled part (op 7's only
  // chamfer ring and op 10's level 1/3 both machined nothing). The pin is
  // a plain counter reset, and it is datum-agnostic: a |A| ≈ 360 residue
  // only ever sits on a spoke ≡ 0 (mod 360).
  it('pins the ±360 residue at an op boundary so the next ring cuts a real revolution', () => {
    const cal = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };
    const op1 = { number: 1, name: 'Rotary face', toolNumber: 1 };
    const op2 = { number: 2, name: 'Chamfer', toolNumber: 2 };
    // op 1 ends with a datum return whose post-shrink re-expression lands
    // the counter at exactly +360 (the TDC op-6 pattern: pile 4860 →
    // shrink → 180 → return target re-expressed to 360)
    const face = [
      { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op1 },
      { words: { a: 4860 }, feed: 2376, op: op1 },
      { words: { a: 5040 }, feed: 0, rapid: true, op: op1, comment: 'return A to the borrowed datum 0.0° (datum discipline)' },
    ];
    // op 2: the chamfer built from startA = 0 — its ONLY ring targets
    // A360, the exact alias the machine sits on without the pin
    const cham = cylChamfer(
      { kind: 'cylChamfer', id: 'c1', toolId: 't2', edges: [{ x: 10, diameter: 40 }], depth: 0.5, stepDown: 2, rotation: 'cw', plungeFeed: 200 },
      cal,
      tools[1],
      0,
    ).moves.map((m) => ({ ...m, op: op2 }));
    const gcode = postCarvera({
      moves: [...face, ...cham],
      tools,
      toolNumbers: [1, 2],
      options: { jobName: 'residue-pin' },
    });
    const lines = gcode.split('\n');
    const marker2 = lines.indexOf(';@MKR|TOOLPATH_START|toolpath_number=2');
    // the return's re-expressed target is 360 (as in the TDC job): the
    // counter arrives AT the residue
    const ret = lines.findIndex((l) => /^G0 A360(;| |$)/.test(l));
    expect(ret).toBeGreaterThan(-1);
    // THE PIN: at op 2's boundary the counter resets to the sub-360 spoke
    // — no motion, no S0 shrink needed (|360| never exceeded 360)
    const pinAt = lines.indexOf('G92.4 A0', marker2);
    expect(pinAt).toBeGreaterThan(marker2);
    expect(lines[pinAt - 1]).toMatch(/pin the ±360 whole-turn residue to 0(\.00)?/i);
    // and NO S0 shrink at this boundary — the pin alone unwraps it
    expect(lines.slice(marker2, pinAt + 1)).not.toContain('G92.4 A0 S0');
    // the ring still targets A360, but now from counter 0: ONE REAL
    // REVOLUTION of cut instead of the zero-travel no-op
    const ring = lines.findIndex((l, i) => i > pinAt && /^G1 A360(;| |$)/.test(l));
    expect(ring).toBeGreaterThan(pinAt);
  });

  it('pins the residue after a pre-anchor shrink of a whole-turn pile (the TDC thread→groove boundary)', () => {
    const op1 = { number: 1, name: 'Thread', toolNumber: 1 };
    const op2 = { number: 2, name: 'Grooves', toolNumber: 1 };
    const gcode = postCarvera({
      moves: [
        { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op1 },
        // the thread pile: exactly 13 whole turns negative
        { words: { x: 23.6, a: -4680 }, feed: 0.51, op: op1 },
        // op 2's opening anchor, built from startA = 0 (the idealized
        // datum): targets A0
        { words: { a: 0 }, feed: 0, rapid: true, op: op2, comment: 'strand 1/48' },
        { words: { x: 8.2 }, feed: 0, rapid: true, op: op2 },
      ],
      tools,
      toolNumbers: [1],
      options: { jobName: 'residue-pin-anchor' },
    });
    const lines = gcode.split('\n');
    // the pre-anchor shrink drops 12 turns leaving −360 (the firmware's
    // strictly-> 360 loop), then the PIN rewrites the counter to 0
    const shrinkAt = lines.indexOf('G92.4 A0 S0');
    expect(shrinkAt).toBeGreaterThan(-1);
    const pinAt = lines.indexOf('G92.4 A0', shrinkAt + 1);
    expect(pinAt).toBeGreaterThan(shrinkAt);
    expect(lines[pinAt - 1]).toMatch(/pin the ±360 whole-turn residue to 0(\.00)?/i);
    // the anchor then emits A0 — ZERO-TRAVEL under EITHER firmware
    // shrink semantics (the phantom full-rev the TDC job showed at its
    // groove ops dies here): never the raw ±360 alias
    const anchor = lines.findIndex((l, i) => i > pinAt && /^G0 A0(;| |$)/.test(l));
    expect(anchor).toBeGreaterThan(pinAt);
    const between = lines.slice(pinAt + 1, anchor);
    expect(between.some((l) => /^G0 A-?360/.test(l))).toBe(false);
  });

  it('indexed datum ≠ 0: the boundary shrink unwraps the pile to the datum, no pin, ring cuts one rev', () => {
    // the general indexing case (Alice, 2026-11-13: "i don't want to leave
    // indexed ops broken"): a pile of datum + 360·k unwraps to the datum
    // through the ordinary S0 shrink — |A| > 360 always — so the residue
    // class (a counter at exactly startA + 360) cannot arise for a datum
    // off the 0 spoke, and the pin never fires
    const cal = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };
    const op1 = { number: 1, name: 'Index + face', toolNumber: 1 };
    const op2 = { number: 2, name: 'Chamfer', toolNumber: 2 };
    const moves = [
      { words: { x: 10, y: 0, z: 5 }, feed: 0, rapid: true, spindleRpm: 18000, op: op1 },
      // the stock indexed to 90°, then a face pile of 90 + 360·k
      { words: { a: 90 }, feed: 0, rapid: true, op: op1 },
      { words: { a: 450 }, feed: 2376, op: op1 },
    ];
    const cham = cylChamfer(
      { kind: 'cylChamfer', id: 'c1', toolId: 't2', edges: [{ x: 10, diameter: 40 }], depth: 0.5, stepDown: 2, rotation: 'cw', plungeFeed: 200 },
      cal,
      tools[1],
      90, // startA = the datum
    ).moves.map((m) => ({ ...m, op: op2 }));
    const gcode = postCarvera({
      moves: [...moves, ...cham],
      tools,
      toolNumbers: [1, 2],
      options: { jobName: 'indexed-datum' },
    });
    const lines = gcode.split('\n');
    const marker2 = lines.indexOf(';@MKR|TOOLPATH_START|toolpath_number=2');
    // the boundary shrink unwraps 450 → 90 = the datum exactly
    const shrinkAt = lines.indexOf('G92.4 A0 S0', marker2);
    expect(shrinkAt).toBeGreaterThan(marker2);
    expect(lines.slice(marker2, shrinkAt).join('\n')).not.toMatch(/pin the ±360/i);
    // the chamfer's first ring targets startA + 360 = 450: from the
    // shrunk counter 90 that is ONE full revolution of real cut
    const ring = lines.findIndex((l, i) => i > shrinkAt && /^G1 A450(;| |$)/.test(l));
    expect(ring).toBeGreaterThan(shrinkAt);
  });
});
