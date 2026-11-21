/**
 * Item 13's UI plumbing (PLAN.md "Simulate the POSTED g-code"): build the
 * move stream the MACHINE will actually execute — post the ops list to
 * .nc text, parse it back with the Carvera-dialect parser — plus the
 * sim/transport per-move companions (tool lookup) derived from the
 * PARSED stream's own op tags, not the generator IR.
 *
 * Why: the machine executes the nc; the sim/transport clock previously
 * executed the generator's Move[] IR — everything the post does in
 * between (G92.4 shrinks, short-way aliases, counter re-anchors) was
 * invisible, so a wind-then-shrink sequence simulated as ~63 phantom
 * loops and inflated estimates by tens of minutes (the TDC_Adjust
 * report). The parser reads the posted text back so what is simulated
 * is what the machine runs.
 *
 * Pure functions — unit-testable without the UI.
 */

import { postCarvera } from '../post/carvera';
import { parseCarveraNc } from '../post/ncParser';
import { stampOp } from './exportDialog';
import { OP_KINDS } from './jobGeneration';
import type { Move, Tool } from '../core/types';

/** Kind label for stamping (matches the export dialog's opLabel). */
function opLabel(kind: string): string {
  return OP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

export interface PostedOpInput {
  /** the op's kind — for the stamp name */
  kind: string;
  toolId: string;
  moves: Move[];
  /** the op's intended DOC (the IR sim's per-op step-down); 0 = default */
  stepDown: number;
  /** the op's section INVERSE fixture frame (16 column-major elements,
   *  null = the stock's own placement) — moves of a re-clamped section
   *  carry that section's WCS; the sim maps poses back through this so
   *  the grid carves the fixture-1 material. ONE SHARED ARRAY PER SECTION
   *  so boundary walkers can compare by reference. */
  frameInv?: readonly number[] | null;
}

export interface PostedStream {
  /** the parsed moves — what the machine executes */
  moves: Move[];
  /** parsed-move index → index into the passed tools table (0xffff = none) */
  toolOf: (moveIndex: number) => number;
  /** the .nc text (display/debug) */
  nc: string;
  /** per-move op step-down aligned to the PARSED move indices (the same
   *  values the IR-indexed array carries, re-indexed onto this stream) */
  stepDown: Float32Array;
  /** per PARSED move: the owning op's section INVERSE fixture frame
   *  (16 elements, null = fixture 1) — the sim's moveFrame. */
  frameInv: (readonly number[] | null)[];
}

/**
 * Build the posted stream for the sim and the transport clock: stamp the
 * ops exactly as the export dialog does, post to .nc text, parse back.
 * The tool lookup is derived from the PARSED moves' op tags (T numbers
 * from the T M6 blocks) mapped onto the tools table — not from the IR,
 * so what the sim carves with is what the machine loads.
 */
export function buildPostedStream(
  ops: readonly PostedOpInput[],
  tools: readonly Tool[],
  toolNumbers: ReadonlyMap<string, number>,
): PostedStream {
  const stampedList: Move[] = [];
  const toolsById = new Map(tools.map((t) => [t.id, t]));
  // dedupe tools in first-use order (the post's tool comments' order)
  const exportTools: Tool[] = [];
  const seen = new Set<string>();
  for (const o of ops) {
    if (o.moves.length === 0) continue;
    if (!seen.has(o.toolId)) {
      seen.add(o.toolId);
      const t = toolsById.get(o.toolId);
      if (t) exportTools.push(t);
    }
  }
  const toolNumberByToolId = new Map<string, number>();
  exportTools.forEach((t, i) => {
    toolNumberByToolId.set(t.id, toolNumbers.get(t.id) ?? i + 1);
  });

  ops.forEach((o, i) => {
    stampedList.push(
      ...stampOp(o.moves, i + 1, opLabel(o.kind), toolNumberByToolId.get(o.toolId) ?? 1),
    );
  });

  const nc = postCarvera({
    moves: stampedList,
    tools: exportTools,
    toolNumbers: exportTools.map((t) => toolNumberByToolId.get(t.id) ?? 1),
  });
  const parsed = parseCarveraNc(nc);

  // parsed move → tool table index: the T numbers the parser recovered
  // from the file, mapped back through the tools table; and the same walk
  // spreads each op's intended DOC and section frame over its parsed moves
  // (the op tag sits on the first move of the span)
  const table: number[] = new Array(parsed.moves.length).fill(0xffff);
  const stepDown = new Float32Array(parsed.moves.length);
  const frameInv: (readonly number[] | null)[] = new Array(parsed.moves.length).fill(null);
  const toolIndexByNumber = new Map<number, number>();
  exportTools.forEach((t, i) => {
    toolIndexByNumber.set(toolNumberByToolId.get(t.id) ?? i + 1, i);
  });
  // op number → the input op's step-down + section frame (1-based stamps)
  const stepByOpNumber = new Map<number, number>();
  const frameByOpNumber = new Map<number, readonly number[] | null>();
  ops.forEach((o, i) => {
    stepByOpNumber.set(i + 1, o.stepDown);
    frameByOpNumber.set(i + 1, o.frameInv ?? null);
  });

  for (let mi = 0; mi < parsed.moves.length; mi++) {
    const op = parsed.moves[mi].op;
    if (!op) continue;
    const ti = toolIndexByNumber.get(op.toolNumber);
    const sd = stepByOpNumber.get(op.number) ?? 0;
    const fi = frameByOpNumber.get(op.number) ?? null;
    // stamp the op's whole span (the tag sits on its first move only)
    let j = mi;
    while (j < parsed.moves.length) {
      if (ti !== undefined) table[j] = ti;
      stepDown[j] = sd;
      frameInv[j] = fi;
      const next = parsed.moves[j + 1];
      if (next?.op) break; // the next op's first move
      j++;
    }
  }
  return { moves: parsed.moves, toolOf: (mi) => table[mi] ?? 0xffff, nc, stepDown, frameInv };
}
