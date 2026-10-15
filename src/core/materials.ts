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
    feedByTool: { flat: 420, bull: 420, ball: 500, vbit: 600, drill: 200 },
    stepDownByTool: { flat: 0.8, bull: 0.8, ball: 0.5, vbit: 0.4, drill: 2 },
    plungeFraction: 0.33,
  },
  {
    id: 'brass-360',
    name: 'Brass 360',
    feedByTool: { flat: 650, bull: 650, ball: 700, vbit: 800, drill: 300 },
    stepDownByTool: { flat: 1.2, bull: 1.2, ball: 0.8, vbit: 0.5, drill: 3 },
    plungeFraction: 0.3,
  },
  {
    id: 'delrin',
    name: 'Delrin (acetal)',
    feedByTool: { flat: 900, bull: 900, ball: 1000, vbit: 1000, drill: 350 },
    stepDownByTool: { flat: 2, bull: 2, ball: 1.5, vbit: 0.8, drill: 4 },
    plungeFraction: 0.5,
  },
  {
    id: 'hardwood',
    name: 'Hardwood (maple/birch)',
    feedByTool: { flat: 1400, bull: 1400, ball: 1600, vbit: 1600, drill: 500 },
    stepDownByTool: { flat: 2.5, bull: 2.5, ball: 1.8, vbit: 1, drill: 6 },
    plungeFraction: 0.5,
  },
  {
    id: 'acrylic-cast',
    name: 'Acrylic (cast)',
    feedByTool: { flat: 800, bull: 800, ball: 900, vbit: 900, drill: 300 },
    stepDownByTool: { flat: 1.2, bull: 1.2, ball: 0.8, vbit: 0.5, drill: 3 },
    plungeFraction: 0.3,
  },
];

export function getMaterial(id: string): MaterialPreset {
  const m = MATERIALS.find((p) => p.id === id);
  if (!m) throw new Error(`unknown material id: ${id}`);
  return m;
}