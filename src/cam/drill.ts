/**
 * Peck drilling (PLAN.md Phase 1): explicit G0/G1 moves, no canned cycles —
 * G83 semantics (full chip-clear retract between pecks) spelled out so the
 * behavior is visible and golden-testable.
 */

import type { DrillOp, Move, Tool } from '../core/types';

export const APPROACH_CLEARANCE = 0.5; // rapid plane above the hole mouth

export interface DrillResult {
  moves: Move[];
  holes: number;
  estimatedMinutes: number;
}

export function drill(op: DrillOp, tool: Tool): DrillResult {
  void tool; // drill geometry is the target depth, not a swept profile
  if (op.targets.length === 0) throw new Error('drill needs at least one target');
  if (op.plungeFeed <= 0) throw new Error('plungeFeed must be positive');

  const moves: Move[] = [];
  let minutes = 0;

  for (const t of op.targets) {
    if (t.depth <= 0) throw new Error('drill depth must be positive');
    const floorZ = t.topZ - t.depth;
    const retractZ = t.topZ + APPROACH_CLEARANCE;
    const safeZ = t.topZ + op.safeClearance;
    const peck = op.peckDepth > 0 ? op.peckDepth : t.depth;

    moves.push({
      words: { x: t.x, y: t.y, z: safeZ },
      feed: 0,
      rapid: true,
      comment: `drill (${t.x.toFixed(2)}, ${t.y.toFixed(2)}) depth ${t.depth.toFixed(2)}mm`,
    });
    moves.push({ words: { z: retractZ }, feed: 0, rapid: true });

    let peckZ = t.topZ;
    while (peckZ > floorZ + 1e-9) {
      const nextZ = Math.max(floorZ, peckZ - peck);
      // rapid back near the previous peck bottom, then feed the increment
      if (peckZ < t.topZ - 1e-9) {
        moves.push({ words: { z: peckZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
      }
      moves.push({ words: { z: nextZ }, feed: op.plungeFeed });
      minutes += (peckZ - nextZ) / op.plungeFeed;
      // full retract to clear chips
      moves.push({ words: { z: retractZ }, feed: 0, rapid: true });
      peckZ = nextZ;
    }

    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
  }

  return { moves, holes: op.targets.length, estimatedMinutes: minutes };
}