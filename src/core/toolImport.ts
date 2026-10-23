/**
 * Runtime import of Fusion 360 tool-library CSV exports — the `csv/` files of
 * the Carvera community profiles repo (CAM_Post_Processors/Fusion360-profiles/
 * Tool Files/csv). The UI's "import tool library" button feeds the picked
 * file's text here.
 *
 * Format (verified against the real exports):
 * - Header cells are verbose display names carrying the stable Fusion API
 *   field name in parens — `Cutting Feedrate (tool_feedCutting)` — so columns
 *   key off the parenthesized token, not the display name. Fields are
 *   double-quoted and may contain commas.
 * - One row per tool × material preset: rows sharing `tool_index` are the
 *   same tool (geometry columns repeat); each distinct preset_name becomes
 *   one ToolPreset.
 *
 * Mapping decisions mirror the build-time importer
 * scripts/import-makera-tools.mjs (type/subtype derivation incl. the corn-bit
 * special case, preset filtering and plunge/ramp fallbacks, the 18000 RPM
 * default) so a CSV import and a .tools import yield the same Tool — one
 * exception: a preset-less tool whose row carries a singular spindle speed
 * keeps it (Makera's own drill CSVs say 10000; the .tools format has no such
 * field, so its preset-less tools keep the 18000 default).
 */
import type { Tool, ToolPreset } from './types';

export interface ToolImportResult {
  tools: Tool[];
  /** human-readable, one per skipped tool, meant for a UI toast */
  warnings: string[];
}

/** Carvera spindle ceiling — same default as scripts/import-makera-tools.mjs */
const DEFAULT_SPINDLE_RPM = 18000;

/** Fusion `tool_type` → our Tool.type. Corn bits are handled separately below. */
const TYPE_BY_FUSION_TYPE: Partial<Record<string, Tool['type']>> = {
  'flat end mill': 'flat',
  'ball end mill': 'ball',
  'bull end mill': 'bull',
  // Engraving and "Other" (chamfering / solder-mask) CSVs both use this type
  'chamfer mill': 'vbit',
  engraver: 'vbit',
  drill: 'drill',
  'thread mill': 'threadmill',
  // OUR extension (exportToolsCsv writes it; Makera CSVs never carry one)
  laser: 'laser',
};

/**
 * Hand-rolled RFC-4180-ish splitter: double-quoted fields, `""` escapes,
 * commas and newlines inside quotes, CRLF or LF line breaks, and a final
 * line without a trailing newline. No external deps.
 */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Column indexes keyed by the parenthesized Fusion API field name. */
type Columns = Record<string, number>;

/** `Cutting Feedrate (tool_feedCutting)` → `tool_feedCutting` (last parens). */
function headerToken(cell: string): string {
  const m = cell.match(/\(([^()]+)\)\s*$/);
  return (m ? m[1] : cell).trim();
}

function columnsOf(header: string[]): Columns {
  const cols: Columns = {};
  header.forEach((cell, i) => {
    const token = headerToken(cell);
    if (cols[token] === undefined) cols[token] = i;
  });
  return cols;
}

function cell(row: string[], cols: Columns, key: string): string {
  const i = cols[key];
  return i === undefined ? '' : (row[i] ?? '').trim();
}

/** Numeric cell → finite number; empty/unparsable → undefined (never NaN). */
function num(row: string[], cols: Columns, key: string): number | undefined {
  const s = cell(row, cols, key);
  if (s === '') return undefined;
  const v = Number(s);
  return Number.isFinite(v) ? v : undefined;
}

/** Kebab id slug — same rules as scripts/import-makera-tools.mjs. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[″"]/g, 'in')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Listing family — mirrors subtypeOf in scripts/import-makera-tools.mjs. */
function subtypeOf(fusionType: string, description: string): string {
  const d = description.toLowerCase();
  const metal = d.includes('metal');
  if (d.includes('drill') || fusionType.includes('drill')) return 'Drill';
  if (d.includes('corn')) return 'Corn (TiN)';
  if (d.includes('threadmill') || fusionType.includes('thread')) return 'Threadmill';
  if (d.includes('chamfering')) return 'Chamfering';
  if (d.includes('solder')) return 'Solder mask';
  if (d.includes('engraving')) return metal ? 'Engraving · Metal' : 'Engraving';
  if (fusionType.includes('ball') || d.includes('ball')) return metal ? 'Ball · Metal' : 'Ball';
  if (d.includes('spiral o')) return metal ? 'Spiral O · Metal' : 'Spiral O';
  return 'General';
}

/**
 * One row → one ToolPreset, or undefined when the row has no usable cutting
 * feed — the same silent filter the .tools importer applies (drills, whose
 * rows carry only plunge rates, intentionally end up with no presets).
 * Plunge/ramp fall back to 0.4×/0.6× the cutting feed like the script.
 */
function presetOf(row: string[], cols: Columns): ToolPreset | undefined {
  const material = cell(row, cols, 'preset_name');
  const feed = num(row, cols, 'tool_feedCutting');
  if (material === '' || feed === undefined || feed <= 0) return undefined;
  const plunge = num(row, cols, 'tool_feedPlunge') ?? feed * 0.4;
  const ramp = num(row, cols, 'tool_feedRamp') ?? feed * 0.6;
  const stepDownRaw = num(row, cols, 'tool_stepdown');
  return {
    material,
    spindleRpm: Math.round(num(row, cols, 'tool_spindleSpeed') ?? DEFAULT_SPINDLE_RPM),
    feed: Math.round(feed),
    plungeFeed: Math.round(plunge),
    stepDown: stepDownRaw === undefined ? 0 : Number(stepDownRaw.toFixed(3)),
    rampFeed: Math.round(ramp),
  };
}

/** Set a finite numeric optional field only when the source cell parses. */
function setFinite<K extends string>(target: { [k in K]?: number }, key: K, v: number | undefined): void {
  if (v !== undefined && Number.isFinite(v)) target[key] = v;
}

/**
 * Merge imported tools into an existing library: appended after the existing
 * tools, existing entries untouched (order, ids, and object identity kept).
 * An imported id that collides with an id already present — in the library or
 * earlier in the same batch — gets the same `-2`, `-3`… numeric suffix the
 * parser uses, so re-importing the same CSV yields a suffixed second copy
 * instead of a no-op or an overwrite. Returns a new array; inputs are not
 * mutated (a renamed tool is a shallow copy).
 */
export function mergeImportedTools(existing: Tool[], imported: Tool[]): Tool[] {
  const usedIds = new Set(existing.map((t) => t.id));
  const out: Tool[] = [...existing];
  for (const tool of imported) {
    const base = tool.id || 'tool';
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    usedIds.add(id);
    out.push(id === tool.id ? tool : { ...tool, id });
  }
  return out;
}

export function parseFusionToolCsv(text: string): ToolImportResult {
  const warnings: string[] = [];
  const rows = splitCsv(text);
  if (rows.length === 0) {
    return { tools: [], warnings: ['Empty file: no CSV rows found'] };
  }
  const cols = columnsOf(rows[0]);
  for (const required of ['tool_index', 'tool_type', 'tool_description', 'tool_diameter']) {
    if (cols[required] === undefined) {
      return {
        tools: [],
        warnings: [`Not a Fusion tool-library CSV: no "${required}" column`],
      };
    }
  }

  // Group rows by tool_index; Map preserves first-seen order.
  const groups = new Map<string, string[][]>();
  for (const row of rows.slice(1)) {
    const index = cell(row, cols, 'tool_index');
    const list = groups.get(index);
    if (list) list.push(row);
    else groups.set(index, [row]);
  }

  const tools: Tool[] = [];
  const usedIds = new Set<string>();
  for (const [index, group] of groups) {
    const first = group[0];
    const description = cell(first, cols, 'tool_description');
    const label = description !== '' ? `"${description}" (tool ${index})` : `tool ${index}`;

    const unit = cell(first, cols, 'tool_unit');
    if (unit !== 'millimeters') {
      warnings.push(`Skipped ${label}: unit "${unit || '(blank)'}" is not supported (only millimeter tools import)`);
      continue;
    }

    const fusionType = cell(first, cols, 'tool_type');
    let type = TYPE_BY_FUSION_TYPE[fusionType];
    if (type === undefined) {
      warnings.push(`Skipped ${label}: unknown tool type "${fusionType || '(blank)'}"`);
      continue;
    }
    // Corn bits: Fusion declares them flat end mills; the description says corn.
    if (type === 'flat' && description.toLowerCase().includes('corn')) type = 'corn';

    if (description === '') {
      warnings.push(`Skipped tool ${index}: missing description`);
      continue;
    }
    const diameter = num(first, cols, 'tool_diameter');
    if (diameter === undefined || diameter <= 0) {
      warnings.push(`Skipped ${label}: missing or invalid diameter`);
      continue;
    }

    const tool: Tool = {
      id: '',
      name: description,
      type,
      subtype: subtypeOf(fusionType, description),
      diameter,
      spindleRpm: DEFAULT_SPINDLE_RPM,
    };
    setFinite(tool, 'shaftDiameter', num(first, cols, 'tool_shaftDiameter'));
    setFinite(tool, 'fluteLength', num(first, cols, 'tool_fluteLength'));
    setFinite(tool, 'overallLength', num(first, cols, 'tool_overallLength'));
    setFinite(tool, 'flutes', num(first, cols, 'tool_numberOfFlutes'));
    setFinite(tool, 'cornerRadius', num(first, cols, 'tool_cornerRadius'));
    const material = cell(first, cols, 'tool_material');
    if (material !== '') tool.material = material.toLowerCase();
    if (type === 'vbit') {
      // Taper angle is per-side (matches the .tools importer's TA×2 rule);
      // chamfer angle uses the same convention as a fallback.
      const halfAngle = num(first, cols, 'tool_taperAngle') ?? num(first, cols, 'tool_chamferAngle');
      if (halfAngle !== undefined && halfAngle > 0) tool.vAngle = halfAngle * 2;
      setFinite(tool, 'tipDiameter', num(first, cols, 'tool_tipDiameter'));
    }
    if (type === 'drill') setFinite(tool, 'drillPointAngle', num(first, cols, 'tool_tipAngle'));
    if (type === 'threadmill') setFinite(tool, 'pitch', num(first, cols, 'tool_threadPitch'));
    if (type === 'laser') setFinite(tool, 'focus', num(first, cols, 'tool_focus'));

    const presets: ToolPreset[] = [];
    const seenMaterials = new Set<string>();
    for (const row of group) {
      const preset = presetOf(row, cols);
      if (preset && !seenMaterials.has(preset.material)) {
        seenMaterials.add(preset.material);
        presets.push(preset);
      }
    }
    if (presets.length > 0) {
      tool.presets = presets;
      tool.spindleRpm = presets[0].spindleRpm;
    } else {
      // no preset rows: a singular spindle speed on the tool's own row —
      // what exportToolsCsv writes for preset-less tools, and what Makera's
      // own drill rows carry (verified: 10000) — wins; blank → the default
      const singular = num(first, cols, 'tool_spindleSpeed');
      if (singular !== undefined && singular > 0) tool.spindleRpm = Math.round(singular);
    }

    // Kebab slug of the description, numeric suffix on collision within
    // this import (same pattern as the build-time importer).
    const base = slug(description) || 'tool';
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
    tool.id = id;
    usedIds.add(id);

    tools.push(tool);
  }

  return { tools, warnings };
}
// ------------------------------------------------------------------ export

/** our Tool.type → the Fusion `tool_type` token. Corn rides its
 * description (the import rule detects it, as with Makera's own CSVs);
 * `laser` is OUR extension — Makera libraries never carry one. */
const FUSION_TYPE_OF: Record<Tool['type'], string> = {
  flat: 'flat end mill',
  ball: 'ball end mill',
  bull: 'bull end mill',
  vbit: 'chamfer mill',
  drill: 'drill',
  threadmill: 'thread mill',
  corn: 'flat end mill',
  laser: 'laser',
};

/** RFC-4180 cell: quoted when it contains a quote, comma, or newline. */
function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fmtNum = (v: number | undefined): string => (v === undefined ? '' : String(v));

/**
 * The exact inverse of parseFusionToolCsv, in the Fusion shape Makera's
 * libraries use: one row per preset, or a single row for a preset-less
 * tool (carrying its singular spindle speed — the same column the
 * preset rows use). Round-trips losslessly EXCEPT ids, which the import
 * convention rebuilds from the description slug (mergeImportedTools
 * suffixes collisions, so re-importing beside the originals is safe).
 */
export function exportToolsCsv(tools: Tool[]): string {
  const header = [
    'Tool Index (tool_index)',
    'Type (tool_type)',
    'Description (tool_description)',
    'Unit (tool_unit)',
    'Diameter (tool_diameter)',
    'Shaft Diameter (tool_shaftDiameter)',
    'Flute Length (tool_fluteLength)',
    'Overall Length (tool_overallLength)',
    'Number of Flutes (tool_numberOfFlutes)',
    'Corner Radius (tool_cornerRadius)',
    'Material (tool_material)',
    'Taper Angle (tool_taperAngle)',
    'Tip Diameter (tool_tipDiameter)',
    'Tip Angle (tool_tipAngle)',
    'Thread Pitch (tool_threadPitch)',
    'Focus Height (tool_focus)',
    'Preset (preset_name)',
    'Spindle Speed (tool_spindleSpeed)',
    'Cutting Feedrate (tool_feedCutting)',
    'Feed Plunge (tool_feedPlunge)',
    'Feed Ramp (tool_feedRamp)',
    'Stepdown (tool_stepdown)',
  ]
    .map(csvCell)
    .join(',');

  const rows: string[] = [header];
  tools.forEach((t, ti) => {
    const cells = (preset: ToolPreset | undefined): string =>
      [
        String(ti + 1),
        FUSION_TYPE_OF[t.type],
        t.name,
        'millimeters',
        fmtNum(t.diameter),
        fmtNum(t.shaftDiameter),
        fmtNum(t.fluteLength),
        fmtNum(t.overallLength),
        fmtNum(t.flutes),
        fmtNum(t.cornerRadius),
        t.material ?? '',
        t.type === 'vbit' ? fmtNum(t.vAngle === undefined ? undefined : t.vAngle / 2) : '',
        t.type === 'vbit' ? fmtNum(t.tipDiameter) : '',
        t.type === 'drill' ? fmtNum(t.drillPointAngle) : '',
        t.type === 'threadmill' ? fmtNum(t.pitch) : '',
        t.type === 'laser' ? fmtNum(t.focus) : '',
        preset?.material ?? '',
        // preset rows carry their own speed; a preset-less tool carries
        // its singular value in the same column
        fmtNum(preset?.spindleRpm ?? (t.presets?.length ? undefined : t.spindleRpm)),
        fmtNum(preset?.feed),
        fmtNum(preset?.plungeFeed),
        fmtNum(preset?.rampFeed),
        fmtNum(preset?.stepDown),
      ]
        .map(csvCell)
        .join(',');
    if (t.presets && t.presets.length > 0) {
      for (const p of t.presets) rows.push(cells(p));
    } else {
      rows.push(cells(undefined));
    }
  });
  return rows.join('\r\n') + '\r\n'; // the corpus is CRLF
}
