/**
 * The top-bar "Calibration…" launcher (2026-11-24): calibration used to be
 * one grid generator behind the button; now the button opens a popup of
 * "Calibration token generators" — one button with an ideogram per
 * generator, so the laser coupons (interlace, greyscale step-wedge) sit
 * beside the original feeds & speeds grid and future ones slot into the
 * list. The registry is the whole list: App renders the entry's component
 * by id; each component is a dialog with the shared panel props.
 */

import type { ComponentType } from 'react';
import { useEffect } from 'react';
import { CalibrationDialog } from './CalibrationDialog';
import { GreyscaleWedgeDialog, InterlaceCouponDialog } from './LaserCouponPanels';
import type { JobOp, Primitive, Stock, Tool } from '../core/types';

/** Props every generator dialog takes — App passes them straight through */
export interface CalibrationPanelProps {
  tools: Tool[];
  stock: Stock;
  materialId: string;
  /** the tool preselected — the last one used in the job */
  initialToolId: string | null;
  onClose: () => void;
  /** the Generate button: append the materialized ops (+ primitives) */
  onGenerate: (ops: JobOp[], primitives: Primitive[]) => void;
}

export interface CalibrationGeneratorEntry {
  /** the id App keys the open dialog on */
  id: string;
  label: string;
  /** simple glyph, consistent with the app's ⚡/⧉ button idiom */
  ideogram: string;
  hint: string;
  component: ComponentType<CalibrationPanelProps>;
}

export const CALIBRATION_GENERATORS: CalibrationGeneratorEntry[] = [
  {
    id: 'feeds-speeds',
    label: 'Feeds & speeds',
    ideogram: '▦',
    hint: 'the cutting grid: feed and RPM laddered across pocket or spiral cells',
    component: CalibrationDialog,
  },
  {
    id: 'laser-interlace',
    label: 'Laser interlacing',
    ideogram: '⇄',
    hint: 'nine small 1cm patches at interlace offsets −0.48…+0.48mm, one pass — the sharpest patch labels your interlace offset',
    component: InterlaceCouponDialog,
  },
  {
    id: 'greyscale-power',
    label: 'Greyscale power',
    ideogram: '◐',
    hint: 'labeled power bands in rows plus a 25/50/75% reference column — the pairing is the material power curve',
    component: GreyscaleWedgeDialog,
  },
];

export const calibrationGenerator = (id: string): CalibrationGeneratorEntry | undefined =>
  CALIBRATION_GENERATORS.find((g) => g.id === id);

export function CalibrationLauncher(props: {
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  // Escape closes — like the other dialogs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  return (
    <div className="modal-overlay">
      <div className="modal cal-modal" role="dialog" aria-modal="true" aria-label="Calibration token generators">
        <h2>
          Calibration token generators
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </h2>
        <p className="cal-intro">
          Each generator cuts or burns a calibration coupon as ordinary toolpaths — examine them,
          toggle them, save the result as your own calibration job.
        </p>
        <div className="cal-launch">
          {CALIBRATION_GENERATORS.map((g) => (
            <button key={g.id} type="button" title={g.hint} onClick={() => props.onOpen(g.id)}>
              <span className="cal-ideogram" aria-hidden>
                {g.ideogram}
              </span>
              <span className="cal-launch-label">
                {g.label}
                <span className="cal-launch-hint">{g.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
