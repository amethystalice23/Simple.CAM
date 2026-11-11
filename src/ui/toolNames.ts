/**
 * Tool display helpers: compact option labels (subtype words and Makera
 * boilerplate stripped, so grouped dropdowns don't repeat the section name
 * in every entry) and grouping by listing subtype.
 */

import type { Tool } from '../core/types';

const GENERIC_WORDS = new Set([
  'makera',
  'carvera',
  'bit',
  'bits',
  'tool',
  'two',
  'flute',
  'single',
  'endmill',
  'coating',
]);

/** Compact label: "Spiral O Metal 6*25mm DLC" (subtype: Spiral O · Metal) → "6*25mm DLC". */
export function shortToolName(tool: Tool): string {
  const subtype = new Set(
    (tool.subtype ?? '')
      .toLowerCase()
      .split(/[·\s]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean),
  );
  const kept = tool.name
    .split(' ')
    .filter((tok) => {
      const t = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
      return t !== '' && !subtype.has(t) && !GENERIC_WORDS.has(t);
    })
    .join(' ')
    .replace(/^[\s.·-]+|[\s.·-]+$/g, '');
  return kept || tool.name;
}

/** Tools grouped by listing subtype (e.g. "Spiral O · Metal"), Ø ascending within. */
export function groupToolsBySubtype(tools: Tool[]): { label: string; tools: Tool[] }[] {
  const groups = new Map<string, Tool[]>();
  for (const t of tools) {
    const key = t.subtype ?? 'Custom';
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.entries()]
    .map(([label, list]) => ({
      label,
      tools: [...list].sort((a, b) => a.diameter - b.diameter),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Dropdown option label: the compact name plus the shank size — critical
 * for picking tools that share a collet.
 */
export function toolOptionLabel(tool: Tool): string {
  const base = shortToolName(tool);
  return tool.shaftDiameter !== undefined ? `${base} · shank ${tool.shaftDiameter}` : base;
}

/**
 * The picker row's meta line (Alice, 2026-11-11): what matters when
 * SELECTING a tool is type, Ø, cutting length, cutting angle, shank —
 * rates and everything else are clutter (they live in the ⚡ popup). The
 * cutting angle shows only for V-bits whose name doesn't already carry it.
 */
export function toolMetaLine(tool: Tool): string {
  const parts: string[] = [tool.type];
  parts.push(`Ø${tool.diameter}`);
  if (tool.fluteLength !== undefined) parts.push(`cut ${tool.fluteLength}mm`);
  if (tool.type === 'vbit' && tool.vAngle !== undefined && !tool.name.includes(`${tool.vAngle}`)) {
    parts.push(`${tool.vAngle}°`);
  }
  if (tool.shaftDiameter !== undefined) parts.push(`shank ${tool.shaftDiameter}`);
  return parts.join(' · ');
}

/** The library-state of a tool entry (2026-11-11, against a BASELINE
 * SNAPSHOT of the library — the tools as last imported/restored/loaded,
 * not the shipped set): 'edited' = same id, changed since the snapshot;
 * 'new' = added since it (Add Tool this session); 'preset' = unchanged
 * AND a shipped Makera entry — an unchanged tool that isn't shipped
 * (your imports) earns NO badge. The library autosaves, so the snapshot
 * is what "edited since import" honestly measures against. */
export type ToolState = 'preset' | 'edited' | 'new';

/** key-sorted JSON: two rounds through localStorage must compare equal */
function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val !== null && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

export function toolState(
  tool: Tool,
  baseline: readonly Tool[],
  presetIds: ReadonlySet<string>,
): ToolState | null {
  const base = baseline.find((b) => b.id === tool.id);
  if (!base) return 'new';
  if (stableJson(base) === stableJson(tool)) return presetIds.has(tool.id) ? 'preset' : null;
  return 'edited';
}

/** A library snapshot that predates snapshots (the v1 storage format):
 * shipped versions win for shared ids (edits to Makera presets stay
 * visible), while imported/hand-added entries baseline as themselves —
 * they were never new *this* session. */
export function deriveBaseline(tools: readonly Tool[], builtIns: readonly Tool[]): Tool[] {
  const byId = new Map(tools.map((t) => [t.id, t]));
  for (const b of builtIns) byId.set(b.id, b);
  return [...byId.values()];
}