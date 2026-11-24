/**
 * The "Export g-code" dialog: pick which ops go into the .nc, assign the
 * controller tool numbers (they appear on the machine's tool-change prompt),
 * name the file MakeraStudio-style, and download the posted program. Pure
 * assignment/naming/stamping rules live in exportDialog.ts (tested there).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JobOp, Move, Stock, Tool } from '../core/types';
import { postCarvera } from '../post/carvera';
import { NumInput } from './fields';
import { OP_KINDS, type GeneratedOp } from './jobGeneration';
import { panelToolNumbers } from './toolAssignment';
import {
  allIncluded,
  assignToolNumbers,
  buildExportFilename,
  countToolChanges,
  fixtureSections,
  includeUnblocked,
  mergeFixtureFiles,
  refixturePauseMove,
  sanitizeFilename,
  setToolNumber,
  stampOp,
  toggleAllIncluded,
} from './exportDialog';

interface Props {
  ops: JobOp[];
  tools: Tool[];
  generated: Record<string, GeneratedOp>;
  /** per-op MACHINE minutes from the posted stream (item 13): opId → the
   *  minutes the machine will actually spend — cutting, rapids, spindle
   *  ramp, with the post's G92.4 shrink/alias machinery inside. Rows and
   *  totals read THIS, falling back to the IR's `generated.minutes` when
   *  an op has no posted figure (nothing posted yet). */
  postedMinutes: ReadonlyMap<string, number>;
  stock: Stock;
  /** loaded STL file name; null = no model (summary says "no model") */
  modelName: string | null;
  /** recalculate one op in place (the per-row ↻) — the dialog reflects the
   * fresh result through the generated prop */
  onRecalcOne: (id: string) => void;
  /** recalculate every op (the ops page's Recalculate All) — fresh results
   *  arrive through the generated prop, rows and totals update in place */
  onRecalculateAll: () => void;
  /** in-flight generation status ("Generating Waterline Contour…"), null
   *  when idle — recalculation is disabled while a pass runs */
  generating?: string | null;
  onClose: () => void;
}

/** OP_KINDS label for a kind, with the kind as a never-should-happen fallback. */
function opLabel(kind: JobOp['kind']): string {
  return OP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

/** Compact tool-type line for the row and the summary, e.g. `flat · Ø3.175`. */
function toolTypeLabel(tool: Tool): string {
  return `${tool.type} · Ø${tool.diameter}`;
}

/** A human name for a fixture section's origin, for the file header's
 *  registration statement: speaks the Stock page's own edge vocabulary. */
function originWords(origin: { x: string; y: string; z: string } | string): string {
  return typeof origin === 'string'
    ? `origin at ${origin} edge`
    : `origin X ${origin.x}, Y ${origin.y}, Z ${origin.z}`;
}

/** The origin the section's fixture declares, or null when it inherits
 *  the Stock page's (the header says so instead). */
function sectionOrigin(
  fixture: { origin: unknown } | null,
): { x: string; y: string; z: string } | string | null {
  return (fixture?.origin as { x: string; y: string; z: string } | string | null) ?? null;
}

function stockSummary(stock: Stock): string {
  if (stock.kind === 'cylinder') {
    const dia = stock.calibration.effectiveRadius * 2;
    return `cylinder Ø${dia} × ${stock.length} mm · ${stock.axisMode}`;
  }
  return `box ${stock.sizeX} × ${stock.sizeY} × ${stock.sizeZ} mm · ${stock.axisMode}`;
}

export function ExportDialog(props: Props) {
  const [included, setIncluded] = useState<ReadonlySet<string>>(
    // everything exportable starts checked; errored/empty ops cannot be
    () =>
      new Set(
        props.ops.filter((o) => {
          const g = props.generated[o.id];
          return g !== undefined && g.error === null && g.moves.length > 0;
        }).map((o) => o.id),
      ),
  );
  /** toolId → controller tool number; SEEDED FROM THE OPS PANEL (Alice,
   * 2026-11-11: the panel is the source of truth — the T1 it shows is the
   * number this dialog stamps). Hand-editable per tool as always; the
   * auto-assign effect below only fills tools the panel didn't number. */
  const [toolNumbers, setToolNumbers] = useState<ReadonlyMap<string, number>>(() =>
    panelToolNumbers(props.ops),
  );
  /** export-moment timestamp, captured once per open — the suggestion is
   * stable while the dialog is up */
  const [openedAt] = useState(() => new Date());

  const genOk = (id: string): boolean => {
    const g = props.generated[id];
    return g !== undefined && g.error === null && g.moves.length > 0;
  };

  /** ops that started blocked (errored/empty — checkbox disabled, no user
   * choice yet); recalculated ones auto-join the export when they succeed */
  const blockedRef = useRef<ReadonlySet<string>>(
    new Set(props.ops.filter((o) => !genOk(o.id)).map((o) => o.id)),
  );
  const lastGenerated = useRef(props.generated);
  useEffect(() => {
    if (lastGenerated.current === props.generated) return;
    lastGenerated.current = props.generated;
    const { checked, blocked } = includeUnblocked(
      included,
      blockedRef.current,
      props.ops,
      genOk,
    );
    blockedRef.current = blocked;
    setIncluded(checked);
    // genOk reads props.generated; included/blockRef are the only other inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.generated]);

  /** the ops going into the file, in job order — fixture ops included when
   *  their section exports at all (they never generate moves; they are the
   *  section boundaries the split below reads) */
  const includedOps = useMemo(
    () =>
      props.ops.filter(
        (o) => o.kind === 'fixture' || (included.has(o.id) && genOk(o.id)),
      ),
    [props.ops, props.generated, included],
  );

  /** auto-assign on every check change — existing numbers stay put (the
   * panel-seeded seed and any hand edits are prev entries, never renumbered) */
  const checkedToolIds = includedOps.map((o) => o.toolId);
  const checkedKey = checkedToolIds.join('\u0000');
  useEffect(() => {
    setToolNumbers((prev) => assignToolNumbers(checkedToolIds, prev));
    // checkedToolIds is derived from checkedKey — rerun on membership change only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKey]);

  /** tool changes across the whole job, in job order (the footer's count) */
  const toolChanges = countToolChanges(includedOps, toolNumbers);

  /** per-op minutes: the POSTED stream's machine figure when it exists
   *  (item 13 — the estimate carries the post's shrink/alias machinery),
   *  else the IR's figure */
  const minutesOf = (opId: string): number | null => {
    const posted = props.postedMinutes.get(opId);
    if (posted !== undefined) return posted;
    const g = props.generated[opId];
    return g !== undefined && g.error === null ? g.minutes : null;
  };

  const totalMinutes = includedOps.reduce(
    (sum, o) => sum + (minutesOf(o.id) ?? 0),
    0,
  );

  /** exportable op ids in job order — drives the select-all box; blocked ops
   * (errored/empty) can never be ticked, individually or all at once */
  const exportableIds = props.ops.filter((o) => genOk(o.id)).map((o) => o.id);
  const allChecked = allIncluded(included, exportableIds);
  const toggleAll = () => setIncluded(toggleAllIncluded(included, exportableIds));

  const suggested = useMemo(
    () =>
      buildExportFilename({
        modelName: props.modelName,
        minutes: totalMinutes,
        axisMode: props.stock.axisMode,
        now: openedAt,
      }),
    [props.modelName, props.stock.axisMode, openedAt, totalMinutes],
  );
  /** the field starts at the suggestion and refreshes whenever the checked
   * ops change it; typing overrides until then */
  const [filename, setFilename] = useState(suggested);
  useEffect(() => setFilename(suggested), [suggested]);

  /** Escape closes (plus the ✕) — the only dismissal paths, per spec */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const toggle = (id: string) => {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportAndDownload = () => {
    if (includedOps.length === 0) return;
    // fixture sections → export FILES (the 2026-11-21 ruling): a same-mode
    // re-clamp stays in one .nc with a synthetic re-fixture M6 hold in
    // between; only a MODE change (3↔4-axis) splits the file. The checkbox
    // set (`included`) picks which ops export; empty sections drop out.
    const name = sanitizeFilename(filename);
    const sections = fixtureSections(
      includedOps as unknown as { id: string; kind: string; toolId: string }[],
    ).filter((s) => s.ops.length > 0);
    const files = mergeFixtureFiles(
      sections,
      props.stock.axisMode,
      (fixture) => {
        const origin = sectionOrigin(fixture);
        const originComment =
          origin === null
            ? 'WCS origin: same as Stock page (inherited)'
            : `WCS origin: ${originWords(origin)}`;
        return `re-fixture: pose ${fixture?.pose ?? 'none'}, mode ${fixture?.axisMode ?? props.stock.axisMode} — ${originComment}`;
      },
    );
    files.forEach((file, fIndex) => {
      // stamp each op's first move: 1-based position in THIS file, its
      // label, and the controller tool number; a re-fixture pause opens
      // every merged section. Index ops inherit the previous cutting op's
      // number (stamped inline — an A-axis rapid never prompts a change).
      const moves: Move[] = [];
      let opNumber = 0;
      let prevCutNum: number | undefined;
      file.sections.forEach((section, si) => {
        if (si > 0) {
          opNumber++;
          moves.push(refixturePauseMove(opNumber, file.pauses[si] ?? 're-fixture'));
        }
        section.ops.forEach((o) => {
          opNumber++;
          const num =
            o.kind === 'index' ? (prevCutNum ?? toolNumbers.get(o.toolId) ?? 1) : toolNumbers.get(o.toolId) ?? 1;
          if (o.kind !== 'index') prevCutNum = num;
          // chunked: a coupon-scale op's stream overflows the spread
          const stamped = stampOp(props.generated[o.id].moves, opNumber, opLabel(o.kind), num);
          for (let k = 0; k < stamped.length; k += 4096) {
            moves.push(...stamped.slice(k, k + 4096));
          }
        });
      });
      // this file's tools (first-use order) and their panel numbers
      const tools = [...new Set(file.sections.flatMap((s) => s.ops.map((o) => o.toolId)))]
        .map((id) => props.tools.find((t) => t.id === id))
        .filter((t): t is Tool => t !== undefined);
      const toolNums = tools.map((t) => toolNumbers.get(t.id) ?? 1);
      // the file's setup notes: one per section, its origin statement
      const fixtureNote = file.sections.flatMap((section) => {
        const origin = section.fixture ? sectionOrigin(section.fixture) : null;
        const originComment =
          origin === null
            ? '; WCS origin: same as Stock page (inherited)'
            : `; WCS origin: ${originWords(origin)}`;
        return [
          originComment,
          section.fixture
            ? `; re-clamp: pose ${section.fixture.pose}, mode ${section.fixture.axisMode}`
            : `; setup: stock as placed (fixture 1)`,
        ];
      });
      const nc = postCarvera({
        moves,
        tools,
        toolNumbers: toolNums,
        options: {
          jobName: name.replace(/\.nc$/, ''),
          fixtureNote,
        },
      });
      const fileName =
        files.length > 1
          ? name.replace(/(\.nc)?$/, '') + `_S${fIndex + 1}.nc`
          : name;
      const url = URL.createObjectURL(new Blob([nc], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    });
    props.onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export g-code">
        <h2>
          Export g-code
          <button
            type="button"
            className="icon-btn"
            title="Close (Esc)"
            onClick={props.onClose}
          >
            ✕
          </button>
        </h2>

        <div className="export-summary">
          <p>
            <strong>{props.modelName ?? 'no model'}</strong> · {stockSummary(props.stock)}
          </p>
        </div>

        <div className="export-rows">
          <div className="export-row head">
            <input
              type="checkbox"
              checked={allChecked}
              disabled={exportableIds.length === 0}
              title={
                allChecked
                  ? 'Exclude every op from the exported file'
                  : 'Include every op in the exported file'
              }
              onChange={toggleAll}
            />
            <span>#</span>
            <span>Op</span>
            <span>Tool no.</span>
            <span>Tool type</span>
            <span className="export-time">Time</span>
            <span />
            <span />
          </div>
          {props.ops.map((op, index) => {
            const g = props.generated[op.id];
            const ok = genOk(op.id);
            const checked = ok && included.has(op.id);
            const tool = props.tools.find((t) => t.id === op.toolId);
            const num = toolNumbers.get(op.toolId);
            const problem = g?.error ?? 'no moves generated';
            /** the row's own honest estimate — '—' when it never generated;
             *  the posted stream's machine minutes when it exists */
            const mins = minutesOf(op.id);
            const time =
              mins !== null
                ? `${mins.toFixed(1)} min`
                : '—';
            const frameOp = op.kind === 'fixture' || op.kind === 'index';
            return (
              <div key={op.id} className={`export-row${ok ? '' : ' dim'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!ok}
                  title="Include this op in the exported file"
                  onChange={() => toggle(op.id)}
                />
                <span className="export-seq">{index + 1}</span>
                <span className="export-kind">{opLabel(op.kind)}</span>
                <span
                  className="export-toolno"
                  title={
                    frameOp
                      ? 'A frame op — no tool, no number; it declares the setup the ops below run in'
                      : "Controller tool number, shown on the machine's tool-change prompt — match your physical tool slot. Ops sharing a tool share the number."
                  }
                >
                  {frameOp || num === undefined ? (
                    <span
                      className="export-no-tool"
                      title={
                        frameOp
                          ? 'A frame op carries no tool'
                          : 'No number until an op using this tool is checked'
                      }
                    >
                      —
                    </span>
                  ) : (
                    <NumInput
                      value={num}
                      min={1}
                      onCommit={(v) => setToolNumbers((prev) => setToolNumber(prev, op.toolId, v))}
                    />
                  )}
                </span>
                <span className="export-tooltype">
                  {tool ? toolTypeLabel(tool) : 'tool missing from library'}
                </span>
                <span
                  className="export-time"
                  title="This op's own estimate — cutting time plus rapid travel and spindle ramp, same basis as the total"
                >
                  {time}
                </span>
                {!ok && (
                  <span className="export-error" title={problem}>
                    {problem}
                  </span>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  title={props.generating ?? 'Recalculate this toolpath'}
                  disabled={!!props.generating}
                  onClick={() => props.onRecalcOne(op.id)}
                >
                  ↻
                </button>
              </div>
            );
          })}
          {props.ops.length === 0 && <p className="hint">add a toolpath first (Ops tab)</p>}
          <p className="hint export-totals">
            {includedOps.length} of {props.ops.length} ops ·{' '}
            {toolChanges} tool change
            {toolChanges === 1 ? '' : 's'} · ~
            {totalMinutes.toFixed(1)} min estimated cut time
          </p>
        </div>

        <label className="export-filename" title="File name for the download — characters outside letters, digits, and . _ + - are dropped, and .nc is always appended">
          <span>.nc file name</span>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            spellCheck={false}
          />
        </label>

        <div className="buttons">
          {props.generating ? (
            <span className="hint generating" title="Heavy operations run in a background worker — the app stays responsive">
              {props.generating}
            </span>
          ) : (
            <button
              type="button"
              className="secondary"
              onClick={props.onRecalculateAll}
              title="Regenerate every op's toolpath (same as Recalculate on the Ops tab) — rows, times, and the total update in place"
            >
              Recalculate All
            </button>
          )}
          <button
            type="button"
            onClick={exportAndDownload}
            disabled={includedOps.length === 0}
          >
            Export .nc
          </button>
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}