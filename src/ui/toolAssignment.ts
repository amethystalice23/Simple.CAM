/**
 * Panel-side controller tool numbers (Alice, 2026-11-11, after ZCam's op
 * list): the OPS PANEL is the source of truth for which tool is T1, T2, …
 * and the G-code export dialog prefills from it (still hand-editable
 * there). Strict list-order renumbering (her ruling): walk the ops in job
 * order, each distinct toolId takes the next number; deleting op 1
 * renumbers everything. FRAME ops (Index, Fixture) carry no tool and take
 * no number — a re-clamp or A-rotation cuts nothing, so it must never
 * burn a T number out of the physical set-out set (Alice, 2026-11-21:
 * "one numbered set of tools they will set out before they begin"). The
 * assignment is derived, never stored — a saved job re-derives it on load
 * from its ops' toolIds.
 */

import type { JobOp } from '../core/types';

export function panelToolNumbers(ops: readonly JobOp[]): Map<string, number> {
  const nums = new Map<string, number>();
  let n = 1;
  for (const op of ops) {
    // frame ops carry a dummy creation-time toolId but cut nothing — they
    // never number (the fixture-first job where the re-clamp's dummy tool
    // took T1 and every real tool shifted up by one, measured 2026-11-21)
    if (op.kind === 'index' || op.kind === 'fixture') continue;
    if (nums.has(op.toolId)) continue; // same tool, same number
    nums.set(op.toolId, n++);
  }
  return nums;
}
