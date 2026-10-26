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
});
