/**
 * The laser calibration coupon dialogs (2026-11-24) — the raster analogue
 * of the feeds & speeds CalibrationDialog. Same shape: a pure planner in
 * src/cam/rasterCoupons.ts plans, the dialog shows its warnings LIVE, then
 * Generate materializes ORDINARY ops via materializeInterlaceCoupon /
 * materializeGreyscaleWedge (jobGeneration.ts) and hands them to
 * props.onGenerate. Laser-only: both gates on a laser tool existing.
 *
 * Panel text speaks in the plan's own terms (band COUNT, the returned band
 * height, the warnings list) — the >10 band cap clamps silently the same
 * way the cutting coupon's cell counts cap, so the text never invents a
 * "requested" number the plan didn't honor.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_COLUMN_SPACING_MM,
  DEFAULT_WEDGE_BAND_MM,
  DEFAULT_WEDGE_MIN_POWER,
  planGreyscaleWedge,
  planInterlaceCoupon,
  type GreyscaleWedgePlan,
  type InterlaceCouponPlan,
} from '../cam/rasterCoupons';
import { RASTER_PITCH_MM } from '../cam/rasterEngrave';
import type { Tool } from '../core/types';
import { toolOptionLabel } from './toolNames';
import {
  materializeGreyscaleWedge,
  materializeInterlaceCoupon,
  laserCouponLadder,
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
  const [pitch, setPitch] = useState(RASTER_PITCH_MM);
  const [columnSpacing, setColumnSpacing] = useState(DEFAULT_COLUMN_SPACING_MM);
  useEscape(props.onClose);

  const laser = lasers.find((t) => t.id === laserId) ?? initial;
  // the two burn slots the materializer fills — the planner takes the same span
  const slot = useMemo(() => laserCouponLadder(props.stock, 2), [props.stock]);

  const result: PlanResult<InterlaceCouponPlan> = useMemo(() => {
    if (!laser) return { plan: null, error: null };
    try {
      return { plan: planInterlaceCoupon(slot.span, { pitch, columnSpacing }), error: null };
    } catch (e) {
      return { plan: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [laser, slot, pitch, columnSpacing]);

  const generate = () => {
    if (!laser || !result.plan) return;
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
          Two identical grids of single-pixel columns, one burned{' '}
          <strong>serpentine</strong>, one <strong>one-way</strong>, stacked as separate bitmaps
          over the stock. If the serpentine's reverse rows misalign, the columns land offset from
          the one-way set — that offset is the value for the raster op's <strong>interlace</strong>{' '}
          field.
        </p>

        <LaserSelect {...props} laserId={laserId} onPick={setLaserId} lasers={lasers} />
        {laser && (
          <div className="cal-axes">
            <NumberField
              label="Pixel pitch (mm)"
              value={pitch}
              min={0.02}
              step={0.01}
              title="spacing of the burn's rows and columns, mm — 0.1 is the Studio pitch; finer is slower"
              onCommit={setPitch}
            />
            <NumberField
              label="Column spacing (mm)"
              value={columnSpacing}
              min={0.2}
              step={0.1}
              title="gap between coupon columns, mm — snaps to whole pixels at the pitch"
              onCommit={setColumnSpacing}
            />
          </div>
        )}

        {result.plan && (
          <div className="cal-legend">
            <p className="hint">
              {result.plan.columns.length} columns × {result.plan.grid.height} rows at{' '}
              {result.plan.pitch}mm pitch, burned twice (serpentine lowest, one-way above it)
            </p>
            <p className="hint">
              the read: burn the coupon, compare the two column sets with a loupe or camera, and
              enter the measured offset (mm) into the <strong>serpentine</strong> op's interlace
              field — the knob shifts the reverse-row fired runs; a POSITION error only, it will
              not fix run-start fade-in (that lever is min power or lead-in).
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
          <button type="button" onClick={generate} disabled={!laser || !result.plan}>
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
  const [bandHeight, setBandHeight] = useState(DEFAULT_WEDGE_BAND_MM);
  const [minPower, setMinPower] = useState(DEFAULT_WEDGE_MIN_POWER);
  const [maxPower, setMaxPower] = useState(1);
  useEscape(props.onClose);

  const laser = lasers.find((t) => t.id === laserId) ?? initial;
  const slots = useMemo(() => laserCouponLadder(props.stock, 1).span.y, [props.stock]);

  const result: PlanResult<GreyscaleWedgePlan> = useMemo(() => {
    if (!laser) return { plan: null, error: null };
    try {
      // converge the ladder ↔ planner count: the bands strip + the refs
      // slot share the stock's span, so the planner's span is the strip of
      // n ladder slots (n bands, each the slot height) — iterate until the
      // planner's clamped count agrees, then bands × bandHeight tile the
      // strip exactly and each band face = one slot height
      let n = Math.min(10, Math.max(3, Math.floor(slots / bandHeight)));
      let plan: GreyscaleWedgePlan | null = null;
      for (let i = 0; i < 4; i++) {
        const slot = laserCouponLadder(props.stock, n + 1);
        plan = planGreyscaleWedge(slot.span.y * n, { minPower, maxPower, bandHeight });
        if (plan.bands.length === n) break;
        n = plan.bands.length;
      }
      return { plan, error: null };
    } catch (e) {
      return { plan: null, error: String(e instanceof Error ? e.message : e) };
    }
  }, [laser, slots, bandHeight, minPower, maxPower]);

  const generate = () => {
    if (!laser || !result.plan) return;
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
          A step-wedge: one solid band burned per power level (a constant-power ladder from the
          floor to full power), plus fixed 25/50/75% gray patches burned at the job's power. Match
          each gray patch to the closest-matching band — those pairs are the material's{' '}
          <strong>power curve</strong>, the calibration the greyscale raster mode will read.
        </p>

        <LaserSelect {...props} laserId={laserId} onPick={setLaserId} lasers={lasers} />
        {laser && (
          <div className="cal-axes">
            <NumberField
              label="Band height (mm)"
              value={bandHeight}
              min={0.5}
              step={0.5}
              title="target band height, mm — the band COUNT derives from it (capped at 10 bands); larger stock grows the bands, never the count"
              onCommit={setBandHeight}
            />
            <NumberField
              label="Min power"
              value={minPower}
              min={0}
              step={0.01}
              title="the ladder's floor, 0–1 — diodes barely lase below ~5%"
              onCommit={setMinPower}
            />
            <NumberField
              label="Max power"
              value={maxPower}
              min={0}
              step={0.01}
              title="the ladder's top, 0–1 — the last rung burns exactly here"
              onCommit={setMaxPower}
            />
          </div>
        )}

        {result.plan && (
          <div className="cal-legend">
            <p className="hint">
              {result.plan.bands.length} bands of {result.plan.bandHeight.toFixed(2)}mm each, S{' '}
              {Math.round(result.plan.bands[0] * 100)}% → {Math.round(result.plan.bands[result.plan.bands.length - 1] * 100)}%
              (one raster op per band at its own power; the gray-refs bitmap burns above the ladder
              at the job's power)
            </p>
            <p className="hint">
              the read: burn the wedge, then match each gray patch (25 / 50 / 75%) to the
              closest-matching band — the band whose burn looks the same tone is the power that
              material's 25 / 50 / 75% gray needs. Note the pairs down; that ladder is the
              material's power curve.
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
          <button type="button" onClick={generate} disabled={!laser || !result.plan}>
            Generate Toolpaths
          </button>
        </div>
      </div>
    </div>
  );
}
