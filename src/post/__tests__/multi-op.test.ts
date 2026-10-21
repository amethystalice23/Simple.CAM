import { describe, expect, it } from 'vitest';
import { postCarvera } from '../carvera';
import type { Tool } from '../../core/types';

const tools: Tool[] = [
  { id: 't1', name: '6mm Flat End', type: 'flat', diameter: 6, spindleRpm: 18000 },
  { id: 't2', name: '3mm V-Bit', type: 'vbit', diameter: 3, spindleRpm: 12000 },
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
});
