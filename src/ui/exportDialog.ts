/**
 * Export-dialog pure helpers: controller tool-number assignment, the
 * Makera-style export file name, and the op-tag stamping the post reads for
 * `;@MKR|TOOLPATH_START` markers and T<n> M6 tool-change blocks. UI state
 * (checkboxes, the editable file-name field) lives in ExportDialog.tsx;
 * everything here is pure so the assignment/sanitizing rules get tests.
 */

import type { AxisMode, JobOp, Move, OriginEdge } from '../core/types';
import { REFIXTURE_TOOL_NUMBER } from '../core/types';

export { REFIXTURE_TOOL_NUMBER };

/** Clamp a user-typed tool number: integer ≥ 1 (garbage becomes 1). */
export function clampToolNumber(n: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
}

/**
 * Auto-assign controller tool numbers: ops sharing a toolId share a number,
 * assigned 1, 2, 3… in first-use order among the checked ops. Existing
 * assignments are kept, so unchecking ops never renumbers the tools that
 * remain (numbers stay stable per tool, they don't collapse) and re-checking
 * gets the old number back. Newly seen tools fill the smallest unused
 * integer — a hand-edited number just leaves a gap, it is never reused.
 */
export function assignToolNumbers(
  checkedToolIds: readonly string[],
  prev: ReadonlyMap<string, number> = new Map(),
): Map<string, number> {
  const next = new Map(prev);
  const used = new Set(prev.values());
  for (const id of checkedToolIds) {
    if (next.has(id)) continue;
    let n = 1;
    while (used.has(n)) n++;
    next.set(id, n);
    used.add(n);
  }
  return next;
}

/** Set one tool's number (user edit) — clamped, without mutating `prev`. */
export function setToolNumber(
  prev: ReadonlyMap<string, number>,
  toolId: string,
  n: number,
): Map<string, number> {
  return new Map(prev).set(toolId, clampToolNumber(n));
}

/**
 * Tool changes the machine will prompt for across the exported ops, in job
 * order: loading the FIRST op's tool counts (the spindle starts with
 * whatever was in it before), then every switch to a different controller
 * tool number. Ops sharing a number (same tool, or two tools a human
 * numbered alike) do not prompt in between. FRAME ops (index/fixture — no
 * kind read as a cutting op) never prompt: they carry no tool change of
 * their own, and the in-file re-fixture pause is not a tool load.
 */
export function countToolChanges(
  ops: readonly { kind?: string; toolId: string }[],
  toolNumbers: ReadonlyMap<string, number>,
): number {
  let changes = 0;
  let prev: number | undefined;
  for (const op of ops) {
    if (op.kind === 'index' || op.kind === 'fixture') continue;
    const num = toolNumbers.get(op.toolId) ?? 1;
    if (prev === undefined || num !== prev) changes++;
    prev = num;
  }
  return changes;
}

/**
 * Fold a per-row recalculation (the ↻ in the export dialog) into the checked
 * set. Ops that were blocked — errored or empty, so their checkbox was
 * disabled and the user never made a choice — join the export once they
 * become exportable; every choice the user actually made (checked or
 * unchecked) is left exactly as it was. Returns the next checked set and the
 * blocked set to carry forward (blocked ids leave it the moment they first
 * become exportable — a later error→ok round-trip no longer auto-checks,
 * because by then the user has had a say).
 */
export function includeUnblocked(
  checked: ReadonlySet<string>,
  blocked: ReadonlySet<string>,
  ops: readonly { id: string }[],
  exportable: (id: string) => boolean,
): { checked: Set<string>; blocked: Set<string> } {
  const nextChecked = new Set(checked);
  const nextBlocked = new Set(blocked);
  for (const { id } of ops) {
    if (!nextBlocked.has(id) || !exportable(id)) continue;
    nextChecked.add(id); // never had a user choice — now exportable, join in
    nextBlocked.delete(id);
  }
  return { checked: nextChecked, blocked: nextBlocked };
}

/** Select-all state: is every exportable op currently included? */
export function allIncluded(
  included: ReadonlySet<string>,
  exportableIds: readonly string[],
): boolean {
  return exportableIds.length > 0 && exportableIds.every((id) => included.has(id));
}

/**
 * The select-all toggle over the exportable ops: any op currently excluded →
 * include every exportable op; all included → exclude all. Blocked ops
 * (errored/empty) are never exportable, so they stay untouched either way.
 */
export function toggleAllIncluded(
  included: ReadonlySet<string>,
  exportableIds: readonly string[],
): Set<string> {
  return exportableIds.some((id) => !included.has(id))
    ? new Set(exportableIds)
    : new Set();
}

/**
 * Stamp an op's moves for export: the FIRST move carries the op tag the post
 * reads — the op's 1-based position in the exported file, its display name,
 * and the controller tool number. The input array is never mutated; only the
 * first move is copied (everything the generators stamped on it, e.g.
 * spindleRpm, is preserved).
 */
export function stampOp(
  moves: readonly Move[],
  opNumber: number,
  name: string,
  toolNumber: number,
): Move[] {
  if (moves.length === 0) return [];
  return [
    { ...moves[0], op: { number: opNumber, name, toolNumber } },
    ...moves.slice(1),
  ];
}

/**
 * In-file re-fixture pause: a wordless cut move with the RE-FIXTURE tool
 * tag. The post turns it into the pseudo-tool's T M6 block — the machine
 * holds with the controller dialog reading the note; the operator turns
 * the part over, re-zeros, presses continue. Emitted at every fixture
 * boundary that does NOT split the file (see mergeFixtureFiles — a mode
 * change splits, a same-mode re-clamp pauses in place).
 */
export function refixturePauseMove(opNumber: number, note: string): Move {
  return {
    words: {},
    feed: 0,
    rapid: false,
    comment: note,
    op: { number: opNumber, name: 'Re-fixture', toolNumber: REFIXTURE_TOOL_NUMBER },
  };
}

// ---- fixture sections (the fixture-ops spec's one-.nc-per-setup export) ----

/** Fixture fields the export needs from a fixture op, isolated so ops[]
 * can stay the loose { kind, toolId } shape the pure helpers take. */
interface FixtureOp {
  kind: 'fixture';
  id: string;
  toolId: string;
  pose: 'none' | 'flipX' | 'flipY' | 'standVertical' | 'endForEnd';
  axisMode: AxisMode;
  origin: OriginEdge | { x: OriginEdge; y: OriginEdge; z: OriginEdge } | null;
}

/** File-name-safe fragment: whitespace runs become '-', everything outside
 * [A-Za-z0-9._+-] (spaces included after the run collapse, parens, Ø, °,
 * path separators…) is dropped. */
export function safeNamePart(s: string): string {
  return s.replace(/\s+/g, '-').replace(/[^A-Za-z0-9._+-]/g, '');
}

/** YYYYMMDDHHmmss, local time — the MakeraStudio output-naming stamp. */
export function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * Suggested export file name, MakeraStudio style:
 * `<modelBase>_<opsDescriptor>_<TOP|MULT>_<YYYYMMDDHHmmss>.nc` — modelBase is
 * the STL file name sans extension ("job" without a model), opsDescriptor is
 * the deduped op labels of the checked ops joined by '-' ("ops" when none),
 * and TOP/MULT follows the stock axis mode (3-axis/4-axis).
 */
export interface ExportSection {
  fixture: FixtureOp | null;
  ops: { id: string; kind: JobOp['kind']; toolId: string }[];
}

/**
 * Split an op list into fixture sections. A FIXTURE op starts a new
 * section (its frame binds to the ops AFTER it); INDEX ops stay with the
 * section they sit in — their A-datum rapid is part of the section's
 * move list, not a cut. Zero fixture ops → one section, `fixture: null`
 * — today's export unchanged.
 */
export function fixtureSections(
  ops: readonly { id: string; kind: string; toolId: string }[],
): ExportSection[] {
  const sections: ExportSection[] = [{ fixture: null, ops: [] }];
  for (const op of ops) {
    if (op.kind === 'fixture') {
      sections.push({ fixture: op as unknown as FixtureOp, ops: [] });
    } else {
      sections[sections.length - 1].ops.push(op as ExportSection['ops'][number]);
    }
  }
  return sections.filter((s) => s.fixture === null || s.ops.length > 0);
}

/** The mode a section runs in: its fixture's declared mode, or the stock's
 * (fixture 1). The FILE-SPLIT rule reads this — see mergeFixtureFiles. */
export function sectionAxisMode(
  section: ExportSection,
  stockMode: '3-axis' | '4-axis',
): '3-axis' | '4-axis' {
  return section.fixture?.axisMode ?? stockMode;
}

/**
 * Group the fixture sections into EXPORT FILES (Alice's 2026-11-21
 * ruling): one tool set is laid out before the job begins, so the T chain
 * is job-wide; and a same-mode re-clamp does not need a new .nc — the
 * machine holds at a synthetic "Re-fixture" T M6 (the controller's
 * tool-change popup doubles as the "please turn over" prompt), the
 * operator flips and re-zeros, and continue finishes the file.
 *
 * A MODE change (3↔4-axis) still splits: the WCS lands in a wildly
 * different place — the 4th-axis machinery cannot be co-sited with
 * end-work clamping — so no pause carries that; each mode's sections go
 * to their own file. 4-axis end-for-end re-clamps MERGE (the user
 * realigns the turned stock to the origin — their task, never a gate;
 * selective export stays the escape hatch for separate files).
 *
 * Back-to-back same-mode fixtures stay DISTINCT pauses (each carries its
 * own pose/origin note), only the FILE boundary merges.
 */
export interface ExportFile {
  /** the sections in this file, in job order */
  sections: ExportSection[];
  /** the re-clamp notes of every boundary WITHIN this file, aligned to
   * `sections[i]` — notes[i] is the pause that PRECEDES sections[i]
   * (null for sections[0], which starts the file) */
  pauses: (string | null)[];
}

export function mergeFixtureFiles(
  sections: readonly ExportSection[],
  stockMode: '3-axis' | '4-axis',
  noteOf: (fixture: FixtureOp | null) => string,
): ExportFile[] {
  const files: ExportFile[] = [];
  let current: ExportFile | null = null;
  let currentMode: '3-axis' | '4-axis' | null = null;
  for (const section of sections) {
    const mode = sectionAxisMode(section, stockMode);
    if (current === null || mode !== currentMode) {
      if (current) files.push(current);
      current = { sections: [section], pauses: [null] };
      currentMode = mode;
    } else {
      // same mode: merge into the file, a re-fixture pause at the boundary
      current.sections.push(section);
      current.pauses.push(noteOf(section.fixture));
    }
  }
  if (current) files.push(current);
  return files;
}

/**
 * Suggested export file name, MakeraStudio style:
 * `<modelBase>_<opsDescriptor>_<TOP|MULT>_<YYYYMMDDHHmmss>.nc` — modelBase is
 * the STL file name sans extension ("job" without a model), opsDescriptor is
 * the deduped op labels of the checked ops joined by '-' ("ops" when none),
 * and TOP/MULT follows the stock axis mode (3-axis/4-axis).
 */
export function buildExportFilename(input: {
  /** loaded STL file name; null = no model */
  modelName: string | null;
  /** total estimated cut time of the included ops, minutes */
  minutes: number;
  axisMode: AxisMode;
  now?: Date;
  /** section ordinal (1-based) among the EXPORTED files — appended as
   *  `_S<n>` from the SECOND section on (a single-setup job keeps today's
   *  name unchanged) */
  section?: number;
}): string {
  const modelBase =
    safeNamePart(input.modelName ? input.modelName.replace(/\.[^.]*$/, '') : '') || 'job';
  const axisTag = input.axisMode === '4-axis' ? 'MULT' : 'TOP';
  const suffix = input.section !== undefined && input.section > 1 ? `_S${input.section}` : '';
  return `${modelBase}${suffix}_${axisTag}_${condensedMinutes(input.minutes)}_${formatTimestamp(input.now ?? new Date())}.nc`;
}

/**
 * Condensed cut-time estimate for the file name: `42m`, `1h23m` — rounded
 * to the nearest minute, never below 1.
 */
export function condensedMinutes(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const h = Math.floor(total / 60);
  return h > 0 ? `${h}h${total % 60}m` : `${total}m`;
}

/**
 * Sanitize a user-typed file name for download: strip path separators and
 * anything outside [A-Za-z0-9._+-], and make sure it ends in .nc. An empty
 * (or all-junk) name falls back to job.nc so the download always has one.
 */
export function sanitizeFilename(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._+-]+/g, '');
  const m = /\.nc$/i.exec(cleaned);
  const base = (m ? cleaned.slice(0, m.index) : cleaned).replace(/^\.+/, '');
  return `${base || 'job'}.nc`;
}