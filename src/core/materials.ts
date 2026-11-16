/**
 * Material presets: suggested feeds and depths of cut per tool type.
 *
 * Starting points for hobby-class spindles (Carvera's 20k RPM spindle,
 * Ø6mm-class cutters), not hard rules — every operation exposes its own
 * overrides. `feedByTool` is a G94 linear cut feed in mm/min; for drills it
 * is the plunge feed, and `stepDownByTool.drill` is the peck increment.
 */

import type { Tool } from './types';

export type ToolType = Tool['type'];

/** Suggested cutting parameters for one material. */
export interface MaterialPreset {
  id: string;
  name: string;
  /** suggested cut feed per tool type, mm/min */
  feedByTool: Record<ToolType, number>;
  /** suggested axial depth of cut per tool type, mm (drill: peck increment) */
  stepDownByTool: Record<ToolType, number>;
  /** plunge feed as a fraction of the cut feed (drills ignore this) */
  plungeFraction: number;
}

export const MATERIALS: MaterialPreset[] = [
  {
    id: 'aluminum-6061',
    name: 'Aluminum 6061',
    feedByTool: { flat: 420, bull: 420, ball: 500, vbit: 600, drill: 200, threadmill: 200, corn: 350, laser: 100 },
    stepDownByTool: { flat: 0.8, bull: 0.8, ball: 0.5, vbit: 0.4, drill: 2, threadmill: 0.15, corn: 0.3, laser: 0.5 },
    plungeFraction: 0.33,
  },
  {
    id: 'brass-360',
    name: 'Brass 360',
    feedByTool: { flat: 650, bull: 650, ball: 700, vbit: 800, drill: 300, threadmill: 250, corn: 500, laser: 100 },
    stepDownByTool: { flat: 1.2, bull: 1.2, ball: 0.8, vbit: 0.5, drill: 3, threadmill: 0.2, corn: 0.4, laser: 0.5 },
    plungeFraction: 0.3,
  },
  {
    id: 'delrin',
    name: 'Delrin (acetal)',
    feedByTool: { flat: 900, bull: 900, ball: 1000, vbit: 1000, drill: 350, threadmill: 400, corn: 700, laser: 100 },
    stepDownByTool: { flat: 2, bull: 2, ball: 1.5, vbit: 0.8, drill: 4, threadmill: 0.3, corn: 0.6, laser: 0.5 },
    plungeFraction: 0.5,
  },
  {
    id: 'hardwood',
    name: 'Hardwood (maple/birch)',
    feedByTool: { flat: 1400, bull: 1400, ball: 1600, vbit: 1600, drill: 500, threadmill: 500, corn: 1000, laser: 100 },
    stepDownByTool: { flat: 2.5, bull: 2.5, ball: 1.8, vbit: 1, drill: 6, threadmill: 0.4, corn: 0.8, laser: 0.5 },
    plungeFraction: 0.5,
  },
  {
    id: 'acrylic-cast',
    name: 'Acrylic (cast)',
    feedByTool: { flat: 800, bull: 800, ball: 900, vbit: 900, drill: 300, threadmill: 300, corn: 600, laser: 100 },
    stepDownByTool: { flat: 1.2, bull: 1.2, ball: 0.8, vbit: 0.5, drill: 3, threadmill: 0.2, corn: 0.4, laser: 0.5 },
    plungeFraction: 0.3,
  },
];

/**
 * User-defined material presets (2026-11-16, docs/TODO.md): the built-in
 * table stays immutable — customs live in localStorage and are consulted
 * AFTER the built-ins, so the panel lists them and every rate lookup
 * (generation, ⚡ popups, calibration) resolves a custom id the same way
 * it resolves 'aluminum-6061'.
 */
const CUSTOM_MATERIALS_KEY = 'simple.cam.materials.v1';

const CUSTOM_PREFIX = 'user-';

/** Custom presets as stored — parsed on demand (a tiny JSON array; the
 * built-in path never pays for it). Kept pure-read: no module state, so
 * storage edits between tests/worker reloads are always honored. */
function storedCustomMaterials(): MaterialPreset[] | null {
  return readCustomMaterials();
}

function isCustomPreset(m: MaterialPreset): boolean {
  return m.id.startsWith(CUSTOM_PREFIX);
}

/** All customs currently known, or null when none are stored (and the
 * parse failed — treat storage as absent, never break the app on it). */
function readCustomMaterials(): MaterialPreset[] | null {
  try {
    const raw = localStorage.getItem(CUSTOM_MATERIALS_KEY);
    const parsed = raw ? (JSON.parse(raw) as MaterialPreset[]) : null;
    if (Array.isArray(parsed)) {
      // trim to the preset shape — extra keys are harmless, missing keys
      // are the caller's validation problem, not a crash
      return parsed.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string');
    }
  } catch {
    // corrupt or unavailable storage — behave as if absent
  }
  return null;
}

function persistCustomMaterials(next: MaterialPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_MATERIALS_KEY, JSON.stringify(next));
  } catch {
    // best-effort: customs live for the session when storage is full
  }
}

/** Custom presets, parsed from storage on demand (a tiny array — the
 * no-cache cost is one JSON.parse per op creation, not per move). */
export function getCustomMaterials(): MaterialPreset[] {
  return storedCustomMaterials() ?? [];
}

/** The full menu the Stock tab offers: built-ins first, customs after. */
export function allMaterials(): MaterialPreset[] {
  return [...MATERIALS, ...getCustomMaterials()];
}

export function getMaterial(id: string): MaterialPreset {
  const m = allMaterials().find((p) => p.id === id);
  if (!m) throw new Error(`unknown material id: ${id}`);
  return m;
}

export function isCustomMaterialId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

/** Store the full custom list (replacing whatever was there), refresh the
 * cache, and return the saved list. Refuses ids that collide with a
 * built-in — the built-ins are immutable. */
export function saveCustomMaterials(
  next: MaterialPreset[],
): MaterialPreset[] {
  const clean = next.filter((m) => !MATERIALS.some((b) => b.id === m.id));
  persistCustomMaterials(clean);
  return clean;
}

/** Derive a fresh custom id for a name — `user-` + a slug, de-duplicated
 * against every known id (built-ins included). */
export function newCustomMaterialId(name: string): string {
  const base = `user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom'}`;
  const taken = new Set(allMaterials().map((m) => m.id));
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

export { isCustomPreset };