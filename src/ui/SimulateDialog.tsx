/**
 * The Simulate dialog (top-bar "Simulate…" — PLAN "cutting simulator"):
 * kicks off the carve-simulator worker over the generated job. The result
 * renders as a VIEWPORT LAYER (the Layers dropdown's Simulation tick —
 * the sim chunks + ghosted model), NOT as a modal: Run dismisses the
 * dialog and turns the tick on, so the carved stock stays visible and
 * orbitable while the run streams chunks; re-opening the dialog shows
 * the completed run's stats. Clear (bottom-left) wipes the overlay.
 * v1 is result-first (one run to completion); playback is v2 on the
 * same time-agnostic protocol. Warnings surface here: gouges (a rapid
 * that removed material = bad clearance) and laser moves (no burn model
 * in v1 — skipped).
 */

import { useMemo, useState } from 'react';
import type { Move, Stock, Tool } from '../core/types';
import { NumberField } from './fields';
import { derivePitch } from '../sim/pitch';
import { SIM_PARK_CLEARANCE } from '../sim/poses';
import { stockTopZ } from './placement';
import type { CarveSim } from './useCarveSim';

interface Props {
  stock: Stock;
  tools: Tool[];
  moves: Move[];
  /** moveIndex → index into `tools` (which tool cuts that move) */
  toolOf: (moveIndex: number) => number;
  /** per-move op step-down (the 3-class classification's tolerance) */
  stepDown: Float32Array;
  sim: CarveSim;
  /** Run was pressed: dismiss the dialog, turn the Simulation layer on */
  onRun: () => void;
  onClose: () => void;
}

export function SimulateDialog(props: Props) {
  const [pitch, setPitch] = useState<number | null>(null);
  const { state } = props.sim;

  const moveCount = props.moves.length;
  // a run exists if the worker is carving or has finished (chunks may
  // still be displayed via the Simulation tick even with the dialog shut)
  const ranOrRunning = state.running || state.result !== null;

  // the derived default: the same ladder the worker applies (it re-derives
  // on setup; this is display-only)
  const defaultPitch = useMemo(() => derivePitch(props.stock), [props.stock]);

  return (
    <div className="modal-overlay">
      <div className="modal sim-modal" role="dialog" aria-modal="true">
        <h2>Simulate tool run</h2>
        <p className="hint">
          carves the generated toolpaths out of a voxel model of the stock and
          shows the result in the viewport, with the model as a ghost for
          comparison. {moveCount} move(s).
        </p>
        {!ranOrRunning ? (
          <>
            <NumberField
              label="Voxel pitch (mm)"
              value={pitch ?? defaultPitch}
              min={0.05}
              step={0.05}
              title="Voxel size — smaller is finer and slower. Empty = derive from the stock size."
              onCommit={(v) => setPitch(v)}
            />
            <p className="hint">
              the pitch defaults to the finest that keeps the voxel count
              manageable for this stock
            </p>
            <div className="dialog-buttons">
              <button type="button" onClick={props.onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={moveCount === 0}
                onClick={() => {
                  props.sim.run(props.moves, props.toolOf, props.stock, props.tools, pitch ?? undefined, stockTopZ(props.stock) + SIM_PARK_CLEARANCE, props.stepDown);
                  props.onRun();
                }}
              >
                Run simulation
              </button>
            </div>
          </>
        ) : (
          <>
            {state.running && (
              <div className="sim-progress">
                <div className="sim-progress-bar">
                  <div
                    className="sim-progress-fill"
                    style={{
                      width: `${state.progress && state.progress.totalMoves > 0
                        ? (100 * state.progress.move) / state.progress.totalMoves
                        : 0}%`,
                    }}
                  />
                </div>
                <span>
                  {state.progress?.move ?? 0}/{state.progress?.totalMoves ?? moveCount} moves ·{' '}
                  {state.progress?.removedVoxels.toLocaleString() ?? 0} voxels removed ·{' '}
                  {state.grid ? `${(state.grid.nx * state.grid.ny * state.grid.nz / 1e6).toFixed(1)}M cells @ ${state.grid.pitch}mm` : '…'}
                  {state.build ? ` · worker ${state.build}` : ''}
                </span>
              </div>
            )}
            {state.result && (
              <div className="sim-result">
                <p>
                  carved {state.result.removedVoxels.toLocaleString()} voxels in{' '}
                  {state.result.carveSeconds.toFixed(1)}s
                  {state.grid && <> @ {state.grid.pitch}mm pitch ({state.grid.nx}×{state.grid.ny}×{state.grid.nz})</>}
                  {state.build && <span className="sim-note"> · worker {state.build}</span>}
                </p>
                {state.result.gougeCount > 0 && (
                  <p className="sim-warning">
                    ⚠ {state.result.gougeCount} gouge move(s) — a rapid removed
                    material (first at move {state.result.firstGougeMove}): check
                    clearances
                  </p>
                )}
                {state.result.gougeVoxels > 0 && (
                  <p className="sim-warning">
                    ⚠ {state.result.gougeVoxels.toLocaleString()} voxel(s) removed
                    beyond the op's step-down (yellow) — material cut where the
                    op assumed it was already cleared: run a roughing op first
                  </p>
                )}
                {state.result.collisionMoves > 0 && (
                  <p className="sim-warning">
                    ⚠ {state.result.collisionMoves.toLocaleString()} move(s) with
                    SHANK contact (first at move {state.result.firstCollisionMove}) —
                    the holder ground into the stock (red): deepen the clearance
                    or shorten the stick-out
                  </p>
                )}
                {state.result.laserSkipped > 0 && (
                  <p className="sim-note">
                    {state.result.laserSkipped} laser move(s) skipped — no burn
                    model in v1
                  </p>
                )}
                {state.result.gougeCount === 0 && state.result.gougeVoxels === 0 && state.result.collisionMoves === 0 && (
                  <p className="sim-ok">no rapid gouges detected</p>
                )}
              </div>
            )}
            <div className="sim-buttons">
              <button
                type="button"
                title="Discard the simulation overlay (the carved chunks and ghosting)"
                onClick={() => {
                  props.sim.dispose();
                }}
              >
                Clear
              </button>
              <div className="dialog-buttons" style={{ marginTop: 0 }}>
                <button type="button" onClick={props.onClose}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
