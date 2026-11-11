/**
 * Panel-side controller tool numbers (Alice, 2026-11-11, after ZCam's op
 * list): the OPS PANEL is the source of truth for which tool is T1, T2, …
 * and the G-code export dialog prefills from it (still hand-editable
 * there). Strict list-order renumbering (her ruling): walk the ops in job
 * order, each distinct toolId takes the next number; deleting op 1
 * renumbers everything. Index ops carry no tool and take no number. The
 * assignment is derived, never stored — a saved job re-derives it on load
 * from its ops' toolIds.
 */

import type { JobOp } from '../core/types';

export function panelToolNumbers(ops: readonly JobOp[]): Map<string, number> {
  const nums = new Map<string, number>();
  let n = 1;
  for (const op of ops) {
    if (op.kind === 'index') continue; // no tool — no number
    if (nums.has(op.toolId)) continue; // same tool, same number
    nums.set(op.toolId, n++);
  }
  return nums;
}
