import { describe, expect, it } from 'vitest';
import type { Tool } from '../types';
import { mergeImportedTools, parseFusionToolCsv, splitCsv } from '../toolImport';

/**
 * Fixtures excerpted from the real Carvera community-profile exports
 * (reference/community-profiles/CAM_Post_Processors/Fusion360-profiles/
 * Tool Files/csv — Makera Ball Endmills / Corn Bits / Thread Mills /
 * Drill Bits / Engraving Bits). Only the columns the parser consumes are
 * carried over, with the real display-name headers; edge-case rows
 * (inch unit, unknown type, duplicates) are synthetic.
 */
const FIELDS = [
  ['Tool Index', 'tool_index'],
  ['Preset Name', 'preset_name'],
  ['Type', 'tool_type'],
  ['Description', 'tool_description'],
  ['Diameter', 'tool_diameter'],
  ['Unit', 'tool_unit'],
  ['Number of Flutes', 'tool_numberOfFlutes'],
  ['Flute Length', 'tool_fluteLength'],
  ['Shaft Diameter', 'tool_shaftDiameter'],
  ['Shoulder Diameter', 'tool_shoulderDiameter'],
  ['Corner Radius', 'tool_cornerRadius'],
  ['Overall Length', 'tool_overallLength'],
  ['Material', 'tool_material'],
  ['Tip Angle', 'tool_tipAngle'],
  ['Taper Angle', 'tool_taperAngle'],
  ['Tip Diameter', 'tool_tipDiameter'],
  ['Thread Pitch', 'tool_threadPitch'],
  ['Spindle Speed', 'tool_spindleSpeed'],
  ['Cutting Feedrate', 'tool_feedCutting'],
  ['Plunge Feedrate', 'tool_feedPlunge'],
  ['Ramp Feedrate', 'tool_feedRamp'],
  ['Maximum Stepdown', 'tool_stepdown'],
] as const;

const HEADER = FIELDS.map(([display, token]) => `"${display} (${token})"`).join(',');
const KEYS = FIELDS.map(([, token]) => token);

/** One CSV row: every field double-quoted like the real exports, embedded
 * quotes escaped by doubling (RFC 4180). */
function row(values: Partial<Record<(typeof KEYS)[number], string>>): string {
  return KEYS.map((k) => `"${(values[k] ?? '').replace(/"/g, '""')}"`).join(',');
}

// "Makera Metal - 1*3mm" — real ball endmill, all six material presets.
const ballRows = ['Aluminum', 'Brass', 'Copper', 'Hardwood', 'Softwood', 'Plastic'].map(
  (preset, i) =>
    row({
      tool_index: '1',
      preset_name: preset,
      tool_type: 'ball end mill',
      tool_description: 'Makera Metal - 1*3mm',
      tool_diameter: '1',
      tool_unit: 'millimeters',
      tool_numberOfFlutes: '2',
      tool_fluteLength: '3',
      tool_shaftDiameter: '3.175',
      tool_shoulderDiameter: '1',
      tool_overallLength: '38',
      tool_material: 'carbide',
      tool_spindleSpeed: '12000',
      tool_feedCutting: '500',
      tool_feedPlunge: '200',
      tool_feedRamp: '333.333',
      tool_stepdown: ['0.2', '0.1', '0.1', '1', '2', '1'][i],
    }),
);

// "TiN Coating Corn Bit 0.6*3mm" — real corn bit: Fusion says flat end mill.
const cornRows = ['Carbon Fiber', 'PCB'].map((preset) =>
  row({
    tool_index: '2',
    preset_name: preset,
    tool_type: 'flat end mill',
    tool_description: 'TiN Coating Corn Bit 0.6*3mm',
    tool_diameter: '0.6',
    tool_unit: 'millimeters',
    tool_numberOfFlutes: '2',
    tool_fluteLength: '3',
    tool_shaftDiameter: '3.175',
    tool_shoulderDiameter: '0.6',
    tool_material: 'carbide',
    tool_spindleSpeed: '12000',
    tool_feedCutting: '500',
    tool_feedPlunge: '300',
    tool_feedRamp: '333.333',
    tool_stepdown: '0.3',
  }),
);

// "Carvera M1 Threadmill" — real thread mill rows (pitch 0.25 mm).
const threadRows = [
  row({
    tool_index: '3',
    preset_name: 'Plastic',
    tool_type: 'thread mill',
    tool_description: 'Carvera M1 Threadmill',
    tool_diameter: '0.73',
    tool_unit: 'millimeters',
    tool_numberOfFlutes: '3',
    tool_fluteLength: '2',
    tool_shaftDiameter: '3.175',
    tool_shoulderDiameter: '0.296987',
    tool_threadPitch: '0.25',
    tool_spindleSpeed: '10000',
    tool_feedCutting: '100',
    tool_feedPlunge: '100',
    tool_feedRamp: '333.333',
    tool_stepdown: '0.25',
  }),
  row({
    tool_index: '3',
    preset_name: 'Hardwood',
    tool_type: 'thread mill',
    tool_description: 'Carvera M1 Threadmill',
    tool_diameter: '0.73',
    tool_unit: 'millimeters',
    tool_numberOfFlutes: '3',
    tool_fluteLength: '2',
    tool_shaftDiameter: '3.175',
    tool_shoulderDiameter: '0.296987',
    tool_threadPitch: '0.25',
    tool_spindleSpeed: '12000',
    tool_feedCutting: '100',
    tool_feedPlunge: '100',
    tool_feedRamp: '333.333',
    tool_stepdown: '0.25',
  }),
];

// "0.2*3.5mm Drill" — real drill rows: no cutting feedrate at all (drills
// only plunge), so every preset row is filtered per the script's rule.
const drillRows = ['Aluminum', 'Brass'].map((preset, i) =>
  row({
    tool_index: '4',
    preset_name: preset,
    tool_type: 'drill',
    tool_description: '0.2*3.5mm Drill',
    tool_diameter: '0.2',
    tool_unit: 'millimeters',
    tool_numberOfFlutes: '2',
    tool_fluteLength: '3.5',
    tool_shaftDiameter: '3.175',
    tool_overallLength: '38',
    tool_material: 'carbide',
    tool_tipAngle: '118',
    tool_spindleSpeed: '10000',
    tool_feedPlunge: ['100', '200'][i],
    tool_stepdown: '',
  }),
);

// "Two Flute Engraving Bit - 6mm 20 deg .3 tip" — real engraving row: Fusion
// type is chamfer mill, taper angle is per-side (10° → 20° included).
const engraveRow = row({
  tool_index: '5',
  preset_name: 'Hardwood',
  tool_type: 'chamfer mill',
  tool_description: 'Two Flute Engraving Bit - 6mm 20 deg .3 tip',
  tool_diameter: '6',
  tool_unit: 'millimeters',
  tool_numberOfFlutes: '2',
  tool_fluteLength: '17',
  tool_shaftDiameter: '6',
  tool_shoulderDiameter: '6',
  tool_taperAngle: '10',
  tool_tipDiameter: '0.3',
  tool_spindleSpeed: '12000',
  tool_feedCutting: '1000',
  tool_feedPlunge: '500',
  tool_feedRamp: '333.333',
  tool_stepdown: '1',
});

// Edge rows (synthetic).
const commaRow = row({
  tool_index: '6',
  preset_name: 'Aluminum',
  tool_type: 'flat end mill',
  tool_description: 'End Mill, 3mm, 4 flute',
  tool_diameter: '3',
  tool_unit: 'millimeters',
  tool_spindleSpeed: '12000',
  tool_feedCutting: '400',
  tool_feedPlunge: '150',
  tool_feedRamp: '250',
  tool_stepdown: '0.5',
});
const inchRow = row({
  tool_index: '7',
  preset_name: 'Aluminum',
  tool_type: 'flat end mill',
  tool_description: 'Inch End Mill 1/4"',
  tool_diameter: '6.35',
  tool_unit: 'inch',
  tool_spindleSpeed: '12000',
  tool_feedCutting: '400',
  tool_feedPlunge: '150',
  tool_feedRamp: '250',
  tool_stepdown: '0.5',
});
const unknownRow = row({
  tool_index: '8',
  preset_name: 'Aluminum',
  tool_type: 'dovetail cutter',
  tool_description: 'Dovetail 6mm',
  tool_diameter: '6',
  tool_unit: 'millimeters',
  tool_spindleSpeed: '12000',
  tool_feedCutting: '400',
  tool_feedPlunge: '150',
  tool_feedRamp: '250',
  tool_stepdown: '0.5',
});
const dupRow = (index: string) =>
  row({
    tool_index: index,
    preset_name: 'Aluminum',
    tool_type: 'flat end mill',
    tool_description: 'Dup End Mill 4mm',
    tool_diameter: '4',
    tool_unit: 'millimeters',
    tool_spindleSpeed: '12000',
    tool_feedCutting: '400',
    tool_feedPlunge: '150',
    tool_feedRamp: '250',
    tool_stepdown: '0.5',
  });
// One usable preset (Aluminum) + one with an empty cutting-feed cell, which
// the script's filter drops.
const partialPresetRows = [
  row({
    tool_index: '10',
    preset_name: 'Aluminum',
    tool_type: 'flat end mill',
    tool_description: 'Partial Preset Mill 2mm',
    tool_diameter: '2',
    tool_unit: 'millimeters',
    tool_spindleSpeed: '12000',
    tool_feedCutting: '300',
    tool_feedPlunge: '100',
    tool_feedRamp: '180',
    tool_stepdown: '0.3',
  }),
  row({
    tool_index: '10',
    preset_name: 'Brass',
    tool_type: 'flat end mill',
    tool_description: 'Partial Preset Mill 2mm',
    tool_diameter: '2',
    tool_unit: 'millimeters',
    tool_spindleSpeed: '12000',
    tool_feedCutting: '',
    tool_feedPlunge: '80',
    tool_feedRamp: '180',
    tool_stepdown: '0.3',
  }),
];

const CSV = [
  HEADER,
  ...ballRows,
  ...cornRows,
  ...threadRows,
  ...drillRows,
  engraveRow,
  commaRow,
  inchRow,
  unknownRow,
  dupRow('9a'),
  dupRow('9b'),
  ...partialPresetRows,
].join('\r\n');

describe('splitCsv', () => {
  it('splits quoted fields containing commas and escaped quotes', () => {
    const rows = splitCsv('a,"b,c","d""e",f\r\n"x, y",,z\nlast,"tail"');
    expect(rows).toEqual([
      ['a', 'b,c', 'd"e', 'f'],
      ['x, y', '', 'z'],
      ['last', 'tail'],
    ]);
  });
});

describe('parseFusionToolCsv', () => {
  const { tools, warnings } = parseFusionToolCsv(CSV);

  it('imports one tool per tool_index, skipping the bad rows with warnings', () => {
    expect(tools.map((t) => t.id)).toEqual([
      'makera-metal-1-3mm',
      'tin-coating-corn-bit-0-6-3mm',
      'carvera-m1-threadmill',
      '0-2-3-5mm-drill',
      'two-flute-engraving-bit-6mm-20-deg-3-tip',
      'end-mill-3mm-4-flute',
      'dup-end-mill-4mm',
      'dup-end-mill-4mm-2',
      'partial-preset-mill-2mm',
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Inch End Mill 1/4"');
    expect(warnings[0]).toContain('inch');
    expect(warnings[1]).toContain('dovetail cutter');
  });

  it('keys columns off the parenthesized API token, not the display name', () => {
    // The fixture header uses the real verbose display names; parsing
    // succeeded at all only because the parenthesized tokens were used.
    const ball = tools.find((t) => t.name === 'Makera Metal - 1*3mm');
    expect(ball).toBeDefined();
  });

  it('maps a ball endmill with all six material presets', () => {
    const ball = tools[0];
    expect(ball.type).toBe('ball');
    expect(ball.subtype).toBe('Ball · Metal');
    expect(ball.diameter).toBe(1);
    expect(ball.fluteLength).toBe(3);
    expect(ball.shaftDiameter).toBe(3.175);
    expect(ball.flutes).toBe(2);
    expect(ball.overallLength).toBe(38);
    expect(ball.material).toBe('carbide');
    expect(ball.spindleRpm).toBe(12000); // first parsed preset's speed
    expect(ball.presets?.map((p) => p.material)).toEqual([
      'Aluminum',
      'Brass',
      'Copper',
      'Hardwood',
      'Softwood',
      'Plastic',
    ]);
    expect(ball.presets?.[0]).toEqual({
      material: 'Aluminum',
      spindleRpm: 12000,
      feed: 500,
      plungeFeed: 200,
      stepDown: 0.2,
      rampFeed: 333, // 333.333 rounded like the build-time importer
    });
    expect(ball.presets?.[3].stepDown).toBe(1); // Hardwood
    expect(ball.presets?.[4].stepDown).toBe(2); // Softwood
  });

  it('gives corn bits our corn type despite Fusion declaring flat end mill', () => {
    const corn = tools[1];
    expect(corn.name).toBe('TiN Coating Corn Bit 0.6*3mm');
    expect(corn.type).toBe('corn');
    expect(corn.subtype).toBe('Corn (TiN)');
    expect(corn.diameter).toBe(0.6);
    expect(corn.presets?.map((p) => p.material)).toEqual(['Carbon Fiber', 'PCB']);
    expect(corn.presets?.[0]).toEqual({
      material: 'Carbon Fiber',
      spindleRpm: 12000,
      feed: 500,
      plungeFeed: 300,
      stepDown: 0.3,
      rampFeed: 333,
    });
  });

  it('maps a thread mill with its pitch and preset speeds', () => {
    const thread = tools[2];
    expect(thread.type).toBe('threadmill');
    expect(thread.subtype).toBe('Threadmill');
    expect(thread.diameter).toBe(0.73);
    expect(thread.pitch).toBe(0.25);
    expect(thread.spindleRpm).toBe(10000); // Plastic preset comes first
    expect(thread.presets?.[1]).toEqual({
      material: 'Hardwood',
      spindleRpm: 12000,
      feed: 100,
      plungeFeed: 100,
      stepDown: 0.25,
      rampFeed: 333,
    });
  });

  it('imports drills with no presets (empty cutting feed) and the default RPM', () => {
    const drill = tools[3];
    expect(drill.type).toBe('drill');
    expect(drill.subtype).toBe('Drill');
    expect(drill.drillPointAngle).toBe(118);
    expect(drill.presets).toBeUndefined(); // feedCutting empty on every row
    expect(drill.spindleRpm).toBe(18000); // script default
  });

  it('maps the engraving chamfer mill to a vbit with included angle', () => {
    const vbit = tools[4];
    expect(vbit.type).toBe('vbit');
    expect(vbit.subtype).toBe('Engraving');
    expect(vbit.diameter).toBe(6);
    expect(vbit.vAngle).toBe(20); // per-side 10° × 2, like the .tools TA rule
    expect(vbit.tipDiameter).toBe(0.3);
    expect(vbit.presets?.[0].feed).toBe(1000);
  });

  it('keeps quoted descriptions containing commas intact', () => {
    const comma = tools[5];
    expect(comma.name).toBe('End Mill, 3mm, 4 flute');
    expect(comma.id).toBe('end-mill-3mm-4-flute');
  });

  it('suffixes duplicate descriptions with a numeric id tail', () => {
    const dup = tools.filter((t) => t.name === 'Dup End Mill 4mm');
    expect(dup.map((t) => t.id)).toEqual(['dup-end-mill-4mm', 'dup-end-mill-4mm-2']);
  });

  it('drops preset rows with an empty feed cell but keeps the tool', () => {
    const partial = tools[8];
    expect(partial.name).toBe('Partial Preset Mill 2mm');
    expect(partial.presets?.map((p) => p.material)).toEqual(['Aluminum']);
    expect(partial.presets?.[0].plungeFeed).toBe(100);
  });

  it('reports a non-Fusion CSV instead of throwing', () => {
    const bad = parseFusionToolCsv('name,diameter\n"Drill 3mm",3\n');
    expect(bad.tools).toEqual([]);
    expect(bad.warnings[0]).toContain('tool_index');
    expect(parseFusionToolCsv('').warnings).toHaveLength(1);
  });
});

describe('mergeImportedTools', () => {
  const mill = (id: string, name = `Tool ${id}`): Tool => ({
    id,
    name,
    type: 'flat',
    diameter: 3,
    spindleRpm: 18000,
  });

  it('appends imported tools after the existing ones without touching either', () => {
    const kept = mill('old-a');
    const added = mill('new-b');
    const merged = mergeImportedTools([kept], [added]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(kept); // same object, same position — never overwritten
    expect(merged[1]).toBe(added);
  });

  it('suffixes an id that collides with an existing library tool', () => {
    const merged = mergeImportedTools([mill('dup-end-mill-4mm')], [mill('dup-end-mill-4mm')]);
    expect(merged.map((t) => t.id)).toEqual(['dup-end-mill-4mm', 'dup-end-mill-4mm-2']);
    expect(merged[0].name).toBe('Tool dup-end-mill-4mm'); // existing entry intact
  });

  it('skips taken suffixes: colliding id whose -2 is also taken becomes -3', () => {
    const merged = mergeImportedTools(
      [mill('x'), mill('x-2')],
      [mill('x')],
    );
    expect(merged.map((t) => t.id)).toEqual(['x', 'x-2', 'x-3']);
  });

  it('de-dupes ids within one batch too (multi-file import of the same CSV)', () => {
    const merged = mergeImportedTools([], [mill('a'), mill('a')]);
    expect(merged.map((t) => t.id)).toEqual(['a', 'a-2']);
  });

  it('re-importing the same parse twice yields a suffixed second copy', () => {
    const first = parseFusionToolCsv(CSV);
    const library = mergeImportedTools([], first.tools);
    const again = parseFusionToolCsv(CSV);
    const reimported = mergeImportedTools(library, again.tools);
    expect(reimported).toHaveLength(2 * first.tools.length);
    // originals keep their ids and positions; ids stay unique across the merge
    expect(reimported.slice(0, first.tools.length).map((t) => t.id)).toEqual(
      first.tools.map((t) => t.id),
    );
    expect(new Set(reimported.map((t) => t.id)).size).toBe(reimported.length);
    // a plain id only collides with the library → -2; a base whose -2 is also
    // taken (the within-file dup already claimed it) skips to -3
    const byId = new Map(reimported.map((t) => [t.id, t]));
    expect(byId.get('makera-metal-1-3mm-2')).toBeDefined();
    expect(byId.get('dup-end-mill-4mm-3')).toBeDefined();
    expect(byId.get('dup-end-mill-4mm-2-2')).toBeDefined();
  });

  it('does not mutate its inputs and copies only renamed tools', () => {
    const existing = [mill('old')];
    const imported = [mill('old'), mill('fresh')];
    const merged = mergeImportedTools(existing, imported);
    expect(existing.map((t) => t.id)).toEqual(['old']);
    expect(imported.map((t) => t.id)).toEqual(['old', 'fresh']);
    expect(merged[1]).not.toBe(imported[0]); // renamed → shallow copy
    expect(merged[2]).toBe(imported[1]); // collision-free → same object
  });

  it('returns the existing library unchanged for an empty import', () => {
    const existing = [mill('a'), mill('b')];
    expect(mergeImportedTools(existing, [])).toEqual(existing);
  });
});