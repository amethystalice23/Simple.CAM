import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postCarvera } from '../carvera';
import { faceCylinder } from '../../cam/faceCylinder';
import type { FaceCylinderOp, Stock, Tool } from '../../core/types';

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

  it('emits helical entry and coordinated sweep in G93', () => {
    const lines = gcode.split('\n');
    expect(lines).toContain('G93');
    // sweep: A advances 7500° on the forward pass + 90° helical entry
    expect(gcode).toMatch(/G1 X100 A7590 F0\.32/);
    // helical entry on the finishing pass: surface 25 − 5 depth = Z20 while A
    // steps 90° at the rotary limit — the retrace keeps A oscillating around
    // the phase (4 levels in: 4×90 = 360), not piling up per pass
    expect(gcode).toMatch(/G1 Z20 A450 F26\.4/);
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
});