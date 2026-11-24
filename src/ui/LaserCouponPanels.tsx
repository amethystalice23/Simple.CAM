/**
 * The laser calibration coupon dialogs (2026-11-24) — the raster analogue
 * of the feeds & speeds CalibrationDialog. Same shape: a pure planner in
 * src/cam/rasterCoupons.ts plans, the dialog shows its warnings LIVE, then
 * Generate materializes ORDINARY ops via materializeInterlaceCoupon /
 * materializeGreyscaleWedge (jobGeneration.ts) and hands them to
 * props.onGenerate. Laser-only: both gates on a laser tool existing.
 *
 * Panel text speaks in the plan's own terms (the interlace ladder, the
 * wedge's band COUNT and returned band height, the warnings list) — caps
 * clamp silently the same way the cutting coupon's cell counts cap, so
 * the text never invents a "requested" number the plan didn't honor.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Tool } from '../core/types';
import { toolOptionLabel } from './toolNames';
import {
  materializeGreyscaleChart,
  materializeInterlaceCoupon,
  planGreyscaleChart,
  planInterlaceCouponV2,
  interlaceLabel,
  chartColumnLabel,
  chartRowLabel,
  CHART_CELL_MM,
  INTERLACE_PATCH_MM,
  type GreyscaleChart,
  type InterlaceCouponV2,
} from './jobGeneration';
import { NumberField } from './fields';
import type { CalibrationPanelProps } from './CalibrationLauncher';

/** the laser tools a coupon can burn with — the panels' laser-only gate */
export const lasersForCoupons = (tools: Tool[]): Tool[] => tools.filter((t) => t.type === 'laser');

/** Escape closes — like the other dialogs */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

interface PlanResult<P> {
  plan: P | null;
  error: string | null;
}

/** The laser select the panels share (empty tools = the gate message). */
function LaserSelect(props: CalibrationPanelProps & { laserId: string; onPick: (id: string) => void; lasers: Tool[] }) {
  if (props.lasers.length === 0) {
    return (
      <p className="hint warn">
        these coupons burn on the laser module — add a laser tool first (Tools tab)
      </p>
    );
  }
  return (
    <label className="field">
      <span>Laser module</span>
      <select value={props.laserId} onChange={(e) => props.onPick(e.target.value)}>
        {props.lasers.map((t) => (
          <option key={t.id} value={t.id}>
            {toolOptionLabel(t)}
          </option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------- interlace

export function InterlaceCouponDialog(props: CalibrationPanelProps) {
  const lasers = lasersForCoupons(props.tools);
  const initial = lasers.find((t) => t.id === props.initialToolId) ?? lasers[0];
  const [laserId, setLaserId] = useState(initial?.id ?? '');
  // the range boxes (Alice's follow-up ruling): the ladder derives from
  // these live — prefill −0.5…+0.5 gives 5 + 5 steps of 0.1 plus the zero
  const [from, setFrom] = useState(-0.5);
  const [to, setTo] = useState(0.5);
  useEscape(props.onClose);

  const laser = lasers.find((t) => t.id === laserId) ?? initial;

  const result: PlanResult<InterlaceCouponV2> = useMemo(() => {
    if (!laser) return { plan: null, error: null };
    try {
      return { plan: planInterlaceCouponV2(props.stock, from, to), error: null };
    } catch (e) {
      return { plan: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [laser, props.stock, from, to]);

  const degenerate = result.plan !== null && result.plan.values.length < 2;

  const generate = () => {
    if (!laser || !result.plan || degenerate) return;
    const { ops, primitives } = materializeInterlaceCoupon(result.plan, props.stock, laser);
    if (ops.length === 0) return;
    props.onGenerate(ops, primitives);
  };

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Laser interlacing coupon">
        <h2>
          Laser interlacing
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="cal-intro">
          Small 1×1cm patches burned in <strong>one pass</strong> — a grid of single-pixel columns
          each, at interlace offsets across the range you set. The nonzero settings split into two
          rows (ascending left→right); the zero reference burns as its own column beside them,
          centered across the seam. Every patch carries a text label naming its setting.
        </p>

        <LaserSelect {...props} laserId={laserId} onPick={setLaserId} lasers={lasers} />
        {laser && (
          <div className="cal-axes">
            <NumberField
              label="From (mm)"
              value={from}
              step={0.01}
              title="the range's low end, signed mm — the ladder's first patch burns exactly here"
              onCommit={setFrom}
            />
            <NumberField
              label="To (mm)"
              value={to}
              step={0.01}
              title="the range's high end, signed mm — the last patch burns exactly here; zero is always included when it falls inside the range"
              onCommit={setTo}
            />
          </div>
        )}

        {result.plan && (
          <div className="cal-legend">
            <p className="hint">
              ladder:{' '}
              {result.plan.values.map((v) => (
                <strong key={v}>{interlaceLabel(v)} </strong>
              ))}
              — step {result.plan.steps.map((s) => s.toFixed(3)).join(' / ')}mm
            </p>
            <p className="hint">
              {result.plan.values.length} patches of {INTERLACE_PATCH_MM}×{INTERLACE_PATCH_MM}mm —
              row 1: {result.plan.row1.length}, row 2: {result.plan.row2.length}
              {result.plan.zero !== null ? ', zero column beside the rows' : ''};{' '}
              {result.plan.gap.toFixed(1)}mm between blocks (fits{' '}
              {result.plan.labelWidth.toFixed(1)}mm labels at {result.plan.labelCap}mm cap)
            </p>
            <p className="hint">
              total size ≈ {result.plan.size.x.toFixed(0)} × {result.plan.size.y.toFixed(0)}mm on
              the stock
            </p>
            <p className="hint">
              the read: burn once, compare the patches with a loupe or camera — the{' '}
              <strong>sharpest</strong>, cleanest patch's label is your interlace offset value
              (the zero column is the unmodified reference to judge against). Enter it in the
              raster op's <strong>Interlace offset (mm)</strong> field: a POSITION fix on
              serpentine reverse rows only — it will NOT fix run-start fade-in (that lever is min
              power or lead-in).
            </p>
          </div>
        )}

        {result.error && <p className="hint warn">{result.error}</p>}
        {result.plan?.warnings.map((w) => (
          <p className="hint warn" key={w}>
            {w}
          </p>
        ))}

        <div className="dialog-buttons">
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" onClick={generate} disabled={!laser || !result.plan || degenerate}>
            Generate Toolpaths
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- power chart

export function GreyscaleWedgeDialog(props: CalibrationPanelProps) {
  const lasers = lasersForCoupons(props.tools);
  const initial = lasers.find((t) => t.id === props.initialToolId) ?? lasers[0];
  const [laserId, setLaserId] = useState(initial?.id ?? '');
  // the chart's live fields (matched to the MakeraStudio ground truth):
  // power columns from the range + step, feed rows fastest first, and the
  // 6×6mm cell size — the extent derives, nothing tiles the whole stock
  const [from, setFrom] = useState(0.1);
  const [to, setTo] = useState(1);
  const [step, setStep] = useState(0.1);
  const [feedsText, setFeedsText] = useState('3000, 2500, 2000, 1500, 1000');
  const [cell, setCell] = useState(CHART_CELL_MM);
  useEscape(props.onClose);

  const laser = lasers.find((t) => t.id === laserId) ?? initial;

  const feeds = useMemo(
    () =>
      feedsText
        .split(/[\s,]+/)
        .map((t) => parseFloat(t))
        .filter((v) => Number.isFinite(v) && v > 0),
    [feedsText],
  );

  const result: PlanResult<GreyscaleChart> = useMemo(() => {
    if (!laser) return { plan: null, error: null };
    try {
      return { plan: planGreyscaleChart(props.stock, from, to, step, feeds, cell), error: null };
    } catch (e) {
      return { plan: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [laser, props.stock, from, to, step, feeds, cell]);

  const degenerate =
    result.plan !== null && (result.plan.columns.length === 0 || result.plan.feeds.length === 0);

  const generate = () => {
    if (!laser || !result.plan || degenerate) return;
    const { ops, primitives } = materializeGreyscaleChart(result.plan, props.stock, laser);
    if (ops.length === 0) return;
    props.onGenerate(ops, primitives);
  };

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Greyscale power chart">
        <h2>
          Greyscale power
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="cal-intro">
          The power chart, matched to the machine's own grid: raster squares stepped by{' '}
          <strong>power along X</strong> and <strong>feed down the rows</strong> (fastest at top),
          the max-power reference repeated at the right edge, and every square labeled. Burn once;
          read the chart off the stock.
        </p>

        <LaserSelect {...props} laserId={laserId} onPick={setLaserId} lasers={lasers} />
        {laser && (
          <div className="cal-axes">
            <NumberField
              label="From power"
              value={from}
              min={0}
              step={0.01}
              title="the leftmost column's S, 0–1 — fine steps near the nothing→burnt flip are what the chart is for"
              onCommit={setFrom}
            />
            <NumberField
              label="To power"
              value={to}
              min={0}
              step={0.01}
              title="the right-edge reference column's S, 0–1 — repeated at full power so every feed row has its burn-everything baseline"
              onCommit={setTo}
            />
            <NumberField
              label="Step"
              value={step}
              min={0.01}
              step={0.01}
              title="the power increment between columns, S units — finer steps read the flip point closer"
              onCommit={setStep}
            />
            <label className="field">
              <span>Feeds (fastest first)</span>
              <input
                type="text"
                value={feedsText}
                onChange={(e) => setFeedsText(e.target.value)}
                placeholder="3000, 2500, 2000, 1500, 1000"
                title="the feed rows, mm/min, comma or space separated — the FIRST feed burns the TOP row; up to 10 rows"
              />
            </label>
            <NumberField
              label="Cell size (mm)"
              value={cell}
              min={1}
              step={1}
              title="each chart square's side, mm — the machine's own chart uses 6×6mm squares at 0.15mm line pitch"
              onCommit={setCell}
            />
          </div>
        )}

        {result.plan && (
          <div className="cal-legend">
            <p className="hint">
              powers:{' '}
              {[...result.plan.columns, result.plan.ref].map((p) => (
                <strong key={p}>{chartColumnLabel(p)} </strong>
              ))}
              — step {result.plan.step.toFixed(2)}, S{result.plan.ref.toFixed(2)} reference at the
              right edge
            </p>
            <p className="hint">
              feeds: {result.plan.feeds.map((f) => chartRowLabel(f)).join(' / ')} —{' '}
              {result.plan.columns.length + 1} × {result.plan.feeds.length} ={' '}
              {(result.plan.columns.length + 1) * result.plan.feeds.length} cells of{' '}
              {result.plan.cell}×{result.plan.cell}mm
            </p>
            <p className="hint">
              total size ≈ {result.plan.size.x.toFixed(0)} × {result.plan.size.y.toFixed(0)}mm on
              the stock
            </p>
            <p className="hint">
              the read: burn once; the nothing→burnt flip shows along the power axis at each feed —
              the lowest power that fully burns at your chosen feed is the sweet spot, minus a
              safety margin (fine steps nearby); each row also carries the{' '}
              {chartColumnLabel(result.plan.ref)} reference at its right edge.
            </p>
          </div>
        )}

        {result.error && <p className="hint warn">{result.error}</p>}
        {result.plan?.warnings.map((w) => (
          <p className="hint warn" key={w}>
            {w}
          </p>
        ))}

        <div className="dialog-buttons">
          <button type="button" className="secondary" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!laser || !result.plan || degenerate}
          >
            Generate Toolpaths
          </button>
        </div>
      </div>
    </div>
  );
}