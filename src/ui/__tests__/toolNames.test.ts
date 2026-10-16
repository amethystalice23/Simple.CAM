import { describe, expect, it } from 'vitest';
import type { Tool } from '../../core/types';
import { groupToolsBySubtype, shortToolName, toolOptionLabel } from '../toolNames';

function tool(name: string, subtype: string | undefined, diameter: number): Tool {
  return { id: name, name, subtype, type: 'flat', diameter, spindleRpm: 18000 };
}

describe('shortToolName', () => {
  it('strips the subtype words and boilerplate', () => {
    expect(shortToolName(tool('Spiral O Metal 6*25mm DLC', 'Spiral O · Metal', 6))).toBe('6*25mm DLC');
    expect(shortToolName(tool('0.2*3.5mm Drill', 'Drill', 0.2))).toBe('0.2*3.5mm');
    expect(shortToolName(tool('Makera Ball Endmill Metal - 4*12mm', 'Ball · Metal', 4))).toBe('4*12mm');
    expect(shortToolName(tool('Carvera M1 Threadmill', 'Threadmill', 0.73))).toBe('M1');
    expect(shortToolName(tool('TiN Coating Corn Bit 0.6*3mm', 'Corn (TiN)', 0.6))).toBe('0.6*3mm');
  });

  it('keeps the meaningful dimensions of engraving bits', () => {
    expect(
      shortToolName(tool('Two Flute Engraving Bit - 6mm 20 deg .3 tip', 'Engraving', 6)),
    ).toBe('6mm 20 deg .3 tip');
    expect(
      shortToolName(tool('Single Flute Engraving Metal 30 deg*.3mm 4mm shaft', 'Engraving · Metal', 6)),
    ).toBe('30 deg*.3mm 4mm shaft');
  });

  it('falls back to the full name when nothing survives', () => {
    expect(shortToolName(tool('Custom shape', undefined, 5))).toBe('Custom shape');
  });
});

describe('groupToolsBySubtype', () => {
  it('groups by subtype, Ø ascending within, groups alphabetical', () => {
    const tools = [
      tool('Spiral O Metal 6*25mm DLC', 'Spiral O · Metal', 6),
      tool('Spiral O 1*3mm', 'Spiral O', 1),
      tool('Spiral O Metal 4*12mm', 'Spiral O · Metal', 4),
      tool('0.2*3.5mm Drill', 'Drill', 0.2),
    ];
    const groups = groupToolsBySubtype(tools);
    expect(groups.map((g) => g.label)).toEqual(['Drill', 'Spiral O', 'Spiral O · Metal']);
    const spiralMetal = groups.find((g) => g.label === 'Spiral O · Metal')!;
    expect(spiralMetal.tools.map((t) => t.diameter)).toEqual([4, 6]);
  });

  it('parks tools without a subtype under Custom', () => {
    const groups = groupToolsBySubtype([tool('My custom shape', undefined, 5)]);
    expect(groups[0].label).toBe('Custom');
  });
});

describe('toolOptionLabel', () => {
  it('appends the shank size so collet-mates are visible', () => {
    const spiral: Tool = {
      ...tool('Spiral O Metal 6*25mm DLC', 'Spiral O · Metal', 6),
      shaftDiameter: 6,
    };
    expect(toolOptionLabel(spiral)).toBe('6*25mm DLC · shank 6');
    const thin: Tool = {
      ...tool('Spiral O Metal 1*3mm', 'Spiral O · Metal', 1),
      shaftDiameter: 3.175,
    };
    expect(toolOptionLabel(thin)).toBe('1*3mm · shank 3.175');
  });

  it('omits the suffix when the shank is unknown', () => {
    expect(toolOptionLabel(tool('My custom shape', undefined, 5))).toBe('My custom shape');
  });
});