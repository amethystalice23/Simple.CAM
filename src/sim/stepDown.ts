/**
 * The carve simulator's per-op intended depth of cut — drives the 3-class
 * classification (a removal deeper than this below the pre-move standing
 * surface paints yellow; a RAPID removal always paints). 0/undefined → the
 * kernel's one-voxel-pitch fallback (a finish op / single-pass op).
 *
 * Most ops carry their own stepDown; the exceptions are ruled per kind:
 *  - drill: peckDepth (chip clearance is the intended plunge DOC)
 *  - threadMill: the FULL THREAD LENGTH — a thread is cut full axial depth
 *    in one helical pass BY TOOL DESIGN (the cutting length spans the
 *    thread); the radial Step over ladders the FORM, never the axial depth.
 *    Her 2026-10-28 report: a yellow wall at any step over, because the
 *    moves were being read against the 0.61mm form depth.
 *  - chamfer: op.depth — the flank reach. A chamfer bit's intended vertical
 *    DOC is its OWN CONE GEOMETRY (dressing an edge IS a full-flank cut,
 *    there is no ladder); reading it against the grid-pitch fallback painted
 *    every honest flank voxel yellow (her 2026-10-28 report: "a whole bunch
 *    of yellow warnings around the chamfer loops"). A genuine plow —
 *    removal deeper than the flank's own geometry below the standing
 *    surface — still warns.
 */

import type { JobOp } from '../core/types';

export function simStepDownFor(op: JobOp): number {
  switch (op.kind) {
    case 'drill':
      return op.peckDepth;
    case 'threadMill':
      return op.endDepth - op.startDepth;
    case 'chamfer':
      return op.depth;
    default:
      return 'stepDown' in op ? (op.stepDown as number | undefined) ?? 0 : 0;
  }
}