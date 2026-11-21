/** The ops list's fixture sections (the fixture-ops spec): a Fixture op is a
 * FRAME BOUNDARY — every op belongs to the section of the latest divider at
 * or above it, and the implicit fixture 1 (mode + origin from the Stock
 * page) owns everything before the first divider.
 *
 * Pure list walks shared by the ops panel (its per-section add rows) and App
 * (where a new op lands), so the two never disagree about where a section
 * ends. JobOps are read structurally — only id + kind matter here. */

import type { JobOp } from '../core/types';
import { IMPLICIT_FIXTURE_ID } from './jobGeneration';

/** The least a section walk needs to see of an op. */
export type SectionalOp = { id: string; kind: JobOp['kind'] };

/** "Fixture 1" for the implicit start setup; "Fixture n" for the n-th real
 * divider (its position in the list — fixture numbers are never stored). */
export function sectionLabel(ops: readonly SectionalOp[], sectionId: string): string {
  let n = 1;
  for (const o of ops) {
    if (o.kind !== 'fixture') continue;
    n += 1;
    if (o.id === sectionId) return `Fixture ${n}`;
  }
  return 'Fixture 1'; // the implicit section (or an unknown id)
}

/** The list index where a new op joins this section: right before the NEXT
 * divider, or the list end for the last section. App splices there; the
 * panel renders its + Add row above that index. */
export function sectionEndIndex(ops: readonly SectionalOp[], sectionId: string): number {
  let inside = sectionId === IMPLICIT_FIXTURE_ID;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.kind !== 'fixture') continue;
    if (inside) return i; // the next divider closes the section
    if (o.id === sectionId) inside = true; // past the section's own divider
  }
  return ops.length;
}