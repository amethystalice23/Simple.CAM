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
import { DEFAULT_WEDGE_MIN_POWER } from '../cam/rasterCoupons';
import type { Tool } from '../core/types';
import { toolOptionLabel } from './toolNames';
import {
  materializeGreyscaleWedge,
  materializeInterlaceCoupon,
  planInterlaceCouponV2,
  planWedgeCouponV2,
  interlaceLabel,
  wedgeLabel,
  INTERLACE_PATCH_MM,
  WEDGE_BAND_MM,
  type GreyscaleWedgeV2,
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

// ------------------------------------------------------------- step wedge

export function GreyscaleWedgeDialog(props: CalibrationPanelProps) {
  const lasers = lasersForCoupons(props.tools);
  const initial = lasers.find((t) => t.id === props.initialToolId) ?? lasers[0];
  const [laserId, setLaserId] = useState(initial?.id ?? '');
  // the range boxes + band size (the interlace idioms, Alice's 2026-11-24
  // follow-up): the band ladder derives from these live
  const [min, setMin] = useState(DEFAULT_WEDGE_MIN_POWER);
  const [max, setMax] = useState(1);
  const [bandHeight, setBandHeight] = useState(WEDGE_BAND_MM);
  useEscape(props.onClose);

  const laser = lasers.find((t) => t.id === laserId) ?? initial;

  const result: PlanResult<GreyscaleWedgeV2> = useMemo(() => {
    if (!laser) return { plan: null, error: null };
    try {
      return { plan: planWedgeCouponV2(props.stock, min, max, bandHeight), error: null };
    } catch (e) {
      return { plan: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [laser, props.stock, min, max, bandHeight]);

  const generate = () => {
    if (!laser || !result.plan || result.plan.bands.length < 2) return;
    const { ops, primitives } = materializeGreyscaleWedge(result.plan, props.stock, laser);
    if (ops.length === 0) return;
    props.onGenerate(ops, primitives);
  };

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Greyscale power coupon">
        <h2>
          Greyscale power
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="cal-intro">
          A compact step-wedge: labeled square bands burned in a row across the power range you
          set, plus the fixed 25/50/75% gray patches in a reference block beside them. Match each
          gray patch to the closest-matching band — those pairs are the material's{' '}
          <strong>power curve</strong>, the calibration the greyscale raster mode will read.
        </p>

        <LaserSelect {...props} laserId={laserId} onPick={setLaserId} lasers={lasers} />
        {laser && (
          <div className="cal-axes">
            <NumberField
              label="Min power"
              value={min}
              min={0}
              step={0.01}
              title="the ladder's floor, 0–1 — the first band burns exactly here; diodes barely lase below ~5%"
              onCommit={setMin}
            />
            <NumberField
              label="Max power"
              value={max}
              min={0}
              step={0.01}
              title="the ladder's top, 0–1 — the last band burns exactly here"
              onCommit={setMax}
            />
            <NumberField
              label="Band height (mm)"
              value={bandHeight}
              min={2}
              step={1}
              title="each band is a square block of this side, mm — bigger is easier to read and photograph; the band COUNT derives from the power range, not from this"
              onCommit={setBandHeight}
            />
          </div>
        )}

        {result.plan && (
          <div className="cal-legend">
            <p className="hint">
              ladder:{' '}
              {result.plan.bands.map((b) => (
                <strong key={b}>{wedgeLabel(b)} </strong>
              ))}
              — step {result.plan.steps.map((s) => s.toFixed(3)).join(' / ')}
            </p>
            <p className="hint">
              {result.plan.bands.length} bands of {result.plan.patch}×{result.plan.patch}mm —
              row 1: {result.plan.row1.length}, row 2: {result.plan.row2.length}, refs column
              (25/50/75%) beside the rows; {result.plan.gap.toFixed(1)}mm between blocks (fits{' '}
              {result.plan.labelWidth.toFixed(1)}mm labels at {result.plan.labelCap}mm cap)
            </p>
            <p className="hint">
              total size ≈ {result.plan.size.x.toFixed(0)} × {result.plan.size.y.toFixed(0)}mm on
              the stock
            </p>
            <p className="hint">
              the read: burn the wedge, then match each gray patch (25 / 50 / 75%) to the
              closest-matching band — the band whose burn looks the same tone is the power that
              material's gray needs. Note the pairs down; that ladder is the material's power
              curve.
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
            disabled={!laser || !result.plan || result.plan.bands.length < 2}
          >
            Generate Toolpaths
          </button>
        </div>
      </div>
    </div>
  );
}