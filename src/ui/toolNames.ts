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