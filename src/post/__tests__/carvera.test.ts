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
    expect(gcode).toContain('G21 G90 G94');
    expect(gcode.trimEnd().endsWith('G92.4 A0 S0\nM30')).toBe(true);
    expect(gcode).toContain('G92.4 A0 S0\nG0'); // initial wrap after setup
  });

  it('wraps A after A-only ring cuts (vertical facing) but not after a pure-A index rapid', () => {
    const ring = postCarvera({
      moves: [{ words: { a: 360 }, feed: 2376 }],
      tools: [tool],
      options: { jobName: 'ring-test' },
    });
    expect(ring.includes('G92.4 A0 S0\nM30')).toBe(true);

    const index = postCarvera({
      moves: [{ words: { a: 90 }, feed: 0, rapid: true }],
      tools: [tool],
      options: { jobName: 'index-test' },
    });
    expect(index.includes('G92.4 A0 S0\nM30')).toBe(false);
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
    // sweep: A advances 7500°/pass + 90° helical entry per pass
    expect(gcode).toMatch(/G1 X100\.000 A7590\.000 F0\.3168/);
    // helical entry on the finishing pass: surface 25 − 5 depth = Z20 while A
    // advances 90° at the rotary limit
    expect(gcode).toMatch(/G1 Z20\.000 A30450\.000 F26\.4000/);
  });

  it('documents prep assumptions as comments by default', () => {
    expect(gcode).toContain('; M465.1');
    expect(gcode).toContain('; G10 L20 P0 A0');
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