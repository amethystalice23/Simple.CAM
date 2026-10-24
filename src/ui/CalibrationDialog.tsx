/**
 * The Calibration dialog (top-bar "Calibration…" — BambuStudio's name for
 * the same idea). Generates a feed/speed test-pattern coupon over the
 * whole stock as ORDINARY OPS: two parameters linspaced across the grid,
 * everything else pinned to the tool's material preset. The materialized
 * ops are the record — each cell an op row with its rates in the ⚡
 * popup, its minutes in the estimate, and its parameters saved in the
 * job file; the user examines, toggles, edits, and saves the result as
 * their own coupon job. Regenerating means delete + Generate again.
 *
 * The plan comes from src/cam/testPattern.ts — the v1–v5 coupon lessons
 * live there (face pass first, RPM on the grouping axis, the rotary feed
 * ceiling, the strand-1 tail), and this dialog shows its warnings live,
 * before anything is cut.
 */

import { useEffect, useMemo, useState } from 'react';
import type { JobOp, MatrixParam, Primitive, Stock, Tool } from '../core/types';
import { getMaterial } from '../core/materials';
import { round2, rotaryCalibrationOf } from '../core/types';
import {
  axisSpread,
  MATRIX_PARAM_LABEL,
  planTestPattern,
  testPatternMode,
  type TestPatternFields,
} from '../cam/testPattern';
import { materializeTestPattern, testPatternDefaults } from './jobGeneration';
import { groupToolsBySubtype, toolOptionLabel } from './toolNames';
import { NumberField } from './fields';

interface Props {
  tools: Tool[];
  stock: Stock;
  materialId: string;
  /** the tool preselected — the last one used in the job */
  initialToolId: string | null;
  onClose: () => void;
  /** the Generate button: append the materialized ops (+ cell outline
   * primitives, flat mode) to the job */
  onGenerate: (ops: JobOp[], primitives: Primitive[]) => void;
}

/** The v5 arrangement: feed around the cylinder (instant changes), RPM
 * along X (few, monotonic — a spindle settles slower than the machine
 * repositions). */
const DEFAULT_ROW_PARAM: MatrixParam = 'feed';
const DEFAULT_COL_PARAM: MatrixParam = 'spindleRpm';

export function CalibrationDialog(props: Props) {
  const cuttingTools = useMemo(
    () => props.tools.filter((t) => t.type !== 'laser'),
    [props.tools],
  );
  const initialTool =
    cuttingTools.find((t) => t.id === props.initialToolId) ?? cuttingTools[0];

  const [toolId, setToolId] = useState(initialTool?.id ?? '');
  const [rowParam, setRowParam] = useState<MatrixParam>(DEFAULT_ROW_PARAM);
  const [colParam, setColParam] = useState<MatrixParam>(DEFAULT_COL_PARAM);
  const [rowMin, setRowMin] = useState(0);
  const [rowMax, setRowMax] = useState(0);
  const [colMin, setColMin] = useState(0);
  const [colMax, setColMax] = useState(0);
  const [faceFirst, setFaceFirst] = useState(true); // the v4 lesson

  const tool = props.tools.find((t) => t.id === toolId) ?? initialTool;
  const mode = testPatternMode(props.stock);
  const m = 'error' in mode ? 'flat' : mode.mode;
  const defaults = tool ? testPatternDefaults(tool, props.materialId) : null;
  const surfaceDiameter =
    props.stock.kind === 'cylinder'
      ? rotaryCalibrationOf(props.stock).effectiveRadius * 2
      : 0;

  /** (re)fill an axis's min/max with a spread around the preset — on
   * first open and on a tool or parameter change */
  const spread = (param: MatrixParam): [number, number] => {
    if (!tool || !defaults) return [0, 0];
    return axisSpread(param, { mode: m, tool, defaults, surfaceDiameter });
  };

  // first open: prefill both axes (useState initializers can't see tool)
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled || !tool) return;
    setPrefilled(true);
    const [rMin, rMax] = spread(DEFAULT_ROW_PARAM);
    const [cMin, cMax] = spread(DEFAULT_COL_PARAM);
    setRowMin(rMin);
    setRowMax(rMax);
    setColMin(cMin);
    setColMax(cMax);
    // tool/defaults are stable at first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilled, tool]);

  /** selecting a parameter refills that axis's range; the other axis keeps
   * the user's numbers (min == max makes it a constant control) */
  const onAxisParam = (axis: 'row' | 'col', param: MatrixParam) => {
    const [lo, hi] = spread(param);
    if (axis === 'row') {
      setRowParam(param);
      setRowMin(lo);
      setRowMax(hi);
    } else {
      setColParam(param);
      setColMin(lo);
      setColMax(hi);
    }
  };

  /** a new cutter is a new experiment — re-derive both ranges from its
   * presets (the parameter assignment stays) */
  const onTool = (id: string) => {
    setToolId(id);
    const t = props.tools.find((x) => x.id === id);
    if (!t) return;
    const d = testPatternDefaults(t, props.materialId);
    const sd = props.stock.kind === 'cylinder'
      ? rotaryCalibrationOf(props.stock).effectiveRadius * 2
      : 0;
    const sp = (param: MatrixParam) => axisSpread(param, { mode: m, tool: t, defaults: d, surfaceDiameter: sd });
    const [rMin, rMax] = sp(rowParam);
    const [cMin, cMax] = sp(colParam);
    setRowMin(rMin);
    setRowMax(rMax);
    setColMin(cMin);
    setColMax(cMax);
  };

  const fields: TestPatternFields = {
    rowParam,
    colParam,
    rowMin,
    rowMax,
    colMin,
    colMax,
    faceFirst,
  };
  const plan =
    tool && defaults ? planTestPattern(fields, props.stock, tool, defaults) : null;

  /** Escape closes (plus the ✕) — like the export dialog */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const axisSelect = (axis: 'row' | 'col', label: string, value: MatrixParam, other: MatrixParam) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onAxisParam(axis, e.target.value as MatrixParam)}>
        {(['feed', 'spindleRpm', 'stepDown', 'stepOver'] as MatrixParam[]).map((p) => (
          <option key={p} value={p} disabled={p === other}>
            {MATRIX_PARAM_LABEL[p]}
          </option>
        ))}
      </select>
    </label>
  );

  const boxMin = (p: MatrixParam) =>
    p === 'feed' ? 10 : p === 'spindleRpm' ? 100 : p === 'stepDown' ? 0.05 : 0.1;
  const boxStep = (p: MatrixParam) =>
    p === 'feed' ? 10 : p === 'spindleRpm' ? 50 : p === 'stepDown' ? 0.05 : 0.1;

  const generate = () => {
    if (!plan || plan.error || !tool) return;
    const { ops, primitives } = materializeTestPattern(plan, tool, props.materialId);
    if (ops.length === 0) return;
    props.onGenerate(ops, primitives);
  };

  const rowLabel = m === 'rotary' ? 'Around the cylinder (strands)' : 'Rows (top to bottom)';
  const colLabel = m === 'rotary' ? 'Along X (groupings)' : 'Columns (left to right)';

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Calibration coupon">
        <h2>
          Calibration coupon
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>

        <p className="cal-intro">
          A feed/speed test pattern cut over the <strong>whole stock</strong> —{' '}
          {m === 'rotary' ? (
            <>spiral grooves at a fixed 60° helix: strands around the cylinder × groupings along X</>
          ) : (
            <>a grid of square pockets, one per cell, each big enough for several clearing passes</>
          )}
          . The two parameters you pick are linspaced between their min and max across the grid;
          everything else holds the tool's preset for the stock material, so it never confounds
          the read. The result is ordinary toolpaths — examine them, toggle them, save them as
          your own coupon job.
        </p>

        <label className="field">
          <span>
            Select tool to calibrate for{' '}
            {(() => {
              try {
                return getMaterial(props.materialId).name;
              } catch {
                return props.materialId;
              }
            })()}
          </span>
          <select value={toolId} onChange={(e) => onTool(e.target.value)}>
            {groupToolsBySubtype(cuttingTools).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {toolOptionLabel(t)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="cal-axes">
          {axisSelect('row', `${rowLabel} — varies`, rowParam, colParam)}
          <div className="cal-range">
            <NumberField
              label={`${MATRIX_PARAM_LABEL[rowParam]} min`}
              value={rowMin}
              min={boxMin(rowParam)}
              step={boxStep(rowParam)}
              onCommit={setRowMin}
            />
            <NumberField
              label="max"
              value={rowMax}
              min={boxMin(rowParam)}
              step={boxStep(rowParam)}
              onCommit={setRowMax}
            />
          </div>
          {axisSelect('col', `${colLabel} — varies`, colParam, rowParam)}
          <div className="cal-range">
            <NumberField
              label={`${MATRIX_PARAM_LABEL[colParam]} min`}
              value={colMin}
              min={boxMin(colParam)}
              step={boxStep(colParam)}
              onCommit={setColMin}
            />
            <NumberField
              label="max"
              value={colMax}
              min={boxMin(colParam)}
              step={boxStep(colParam)}
              onCommit={setColMax}
            />
          </div>
        </div>

        {m === 'rotary' && (
          <label className="check" title="A whole-bar facing pass first trues the runout and strips any stress skin, so every cell starts from the same genuine cylinder — eccentric stock cuts deeper on its proud spots and skews the read">
            <input
              type="checkbox"
              checked={faceFirst}
              onChange={(e) => setFaceFirst(e.target.checked)}
            />
            <span>face the whole bar first — true the runout, strip the stress skin</span>
          </label>
        )}

        {plan && !plan.error && (
          <div className="cal-legend">
            <p className="hint">
              {m === 'rotary'
                ? `${plan.rows} strands × ${plan.cols} groupings`
                : `${plan.rows} rows × ${plan.cols} columns`}{' '}
              = {plan.rows * plan.cols} cells, cut {m === 'rotary' ? 'grouping-outer' : 'row-outer'}
              {' '}· counts cap at 10 per axis — bigger stock grows the cells, not the count
            </p>
            <div className="cal-ladders">
              <table className="cal-ladder">
                <thead>
                  <tr>
                    <th colSpan={2}>
                      {MATRIX_PARAM_LABEL[plan.colParam]} —{' '}
                      {m === 'rotary' ? 'by grouping (along X)' : 'by column (left to right)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.colValues.map((v, i) => (
                    <tr key={i}>
                      <td>{m === 'rotary' ? 'grouping' : 'column'} {i + 1}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="cal-ladder">
                <thead>
                  <tr>
                    <th colSpan={2}>
                      {MATRIX_PARAM_LABEL[plan.rowParam]} —{' '}
                      {m === 'rotary' ? 'by strand (around the cylinder)' : 'by row (top to bottom)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rowValues.map((v, i) => (
                    <tr key={i}>
                      <td>{m === 'rotary' ? 'strand' : 'row'} {i + 1}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              constant controls (never vary):{' '}
              {(['feed', 'spindleRpm', 'stepDown', 'stepOver'] as MatrixParam[])
                .filter((p) => p !== plan.rowParam && p !== plan.colParam)
                .map((p) => `${MATRIX_PARAM_LABEL[p]} ${plan.fixed[p]}`)
                .join(' · ')}
              {m === 'rotary' ? ' · plunge feed from the preset' : ''}
            </p>
          </div>
        )}

        {'error' in mode && <p className="hint warn">{mode.error}</p>}
        {plan?.error && <p className="hint warn">{plan.error}</p>}
        {plan?.warnings.map((w) => (
          <p className="hint warn" key={w}>
            {w}
          </p>
        ))}

        <p className="hint">
          {m === 'rotary' ? (
            <>
              the −X ends of every groove align; the +X ends stagger — strand 1 runs longest and
              each next strand shorter, so every groove's own length ranks it: the strand ladder
              reads straight off the stagger, with no clockwise convention to remember. Spindle
              changes are few and monotonic when RPM runs along X; feeds change instantly at
              strand boundaries.
            </>
          ) : (
            <>
              each cell's pocket is preceded by a thin outline plate on the stock — click one in
              the Model list to see which cell an op cuts. Cell 1/1 is the TOP-LEFT cell: it
              grows into the perimeter, so its oversized corner marks the grid origin — rows
              number top to bottom, columns left to right. Cells cut row by row, top row first.
            </>
          )}{' '}
          {tool ? `A Ø${round2(tool.diameter)} cutter on ` : 'Pick a tool for '}
          {props.stock.kind === 'cylinder'
            ? `Ø${round2(surfaceDiameter)} stock`
            : `${props.stock.sizeX} × ${props.stock.sizeY} stock`}
          .
        </p>

        <div className="dialog-buttons">
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!plan || plan.error !== null || !tool}
          >
            Generate Toolpaths
          </button>
        </div>
      </div>
    </div>
  );
}