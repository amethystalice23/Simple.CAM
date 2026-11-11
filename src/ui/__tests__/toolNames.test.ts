import { describe, expect, it } from 'vitest';
import type { Tool } from '../../core/types';
import { deriveBaseline, groupToolsBySubtype, shortToolName, toolMetaLine, toolOptionLabel, toolState } from '../toolNames';

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

describe('toolMetaLine', () => {
  it('carries what matters when selecting: type, Ø, cut length, shank', () => {
    const spiral: Tool = {
      ...tool('Spiral O Metal 6*25mm DLC', 'Spiral O · Metal', 6),
      fluteLength: 25,
      shaftDiameter: 6,
    };
    expect(toolMetaLine(spiral)).toBe('flat · Ø6 · cut 25mm · shank 6');
  });

  it('shows the cutting angle for V-bits unless the name already carries it', () => {
    const vbit: Tool = {
      ...tool('V-Bit Engraving 0.2mm', 'Engraving · V', 0.2),
      type: 'vbit',
      vAngle: 60,
      tipDiameter: 0.2,
      fluteLength: 8,
    };
    expect(toolMetaLine(vbit)).toBe('vbit · Ø0.2 · cut 8mm · 60°');
    const named: Tool = { ...vbit, name: 'V-Bit 60° 0.2mm' };
    expect(toolMetaLine(named)).toBe('vbit · Ø0.2 · cut 8mm');
  });

  it('omits the unknowns quietly — no placeholder clutter', () => {
    expect(toolMetaLine(tool('Custom shape', undefined, 5))).toBe('flat · Ø5');
  });
});

describe('toolState', () => {
  const preset: Tool = { id: 't1', name: 'Factory bit', type: 'flat', diameter: 6, spindleRpm: 18000 };
  const presetIds = new Set(['t1']);

  it('preset = unchanged AND shipped; an unchanged import earns NO badge', () => {
    const imported: Tool = { ...preset, id: 'fusion-1' };
    expect(toolState(preset, [preset, imported], presetIds)).toBe('preset');
    expect(toolState(imported, [preset, imported], presetIds)).toBe(null);
  });

  it('edited = same id, changed since the baseline snapshot', () => {
    expect(toolState({ ...preset, diameter: 8 }, [preset], presetIds)).toBe('edited');
    const imported: Tool = { ...preset, id: 'fusion-1' };
    expect(toolState({ ...imported, name: 'Retuned' }, [imported], presetIds)).toBe('edited');
  });

  it('new = not in the baseline — an import that joined the baseline stops reading new', () => {
    expect(toolState(preset, [], presetIds)).toBe('new');
    const imported: Tool = { ...preset, id: 'fusion-1' };
    // before the baseline folds the import in…
    expect(toolState(imported, [preset], presetIds)).toBe('new');
    // …and after (importMerge's onBaseline call)
    expect(toolState(imported, [preset, imported], presetIds)).toBe(null);
  });
});

describe('deriveBaseline', () => {
  const shipped: Tool = { id: 't1', name: 'Factory bit', type: 'flat', diameter: 6, spindleRpm: 18000 };

  it('a v1 library: imported entries baseline as themselves, shipped wins for shared ids', () => {
    const imported: Tool = { id: 'fusion-1', name: 'My bit', type: 'ball', diameter: 3, spindleRpm: 12000 };
    const editedPreset: Tool = { ...shipped, diameter: 8 };
    const baseline = deriveBaseline([imported, editedPreset], [shipped]);
    // the edited preset measures against the SHIPPED version (edit stays visible)
    expect(baseline.find((t) => t.id === 't1')).toEqual(shipped);
    // the import baselines as itself — never new this session
    expect(baseline.find((t) => t.id === 'fusion-1')).toEqual(imported);
  });
});