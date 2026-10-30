/**
 * THIN-STREAMER HONESTY (PLAN.md spec item 2, 2026-10-30 — the Fusion
 * "Ignore Stock Less Than" analog): the rough deliberately never chases
 * rest material thinner than the tool can usefully cut — the stage-C
 * trim's boundary ribbons, the sliver orbits pocket2d drops, the skin
 * the allowance owns. That refusal is correct; what was missing is the
 * HONESTY: the user never heard how much was being left or why. This
 * pass measures it, once, after the op's cuts are stamped.
 *
 * The measure: per X column of the standing grid, contiguous θ-runs of
 * cells whose standing radius still exceeds the MODEL's surface radius
 * by more than the allowance are rest material; a run's WIDTH is its
 * arc length at the model surface (the carve kernel's row-spacing
 * convention), and a run whose minimum width along its length is below
 * the threshold is a THIN STREAMER — counted, reported, and by design
 * left standing for the finishing pass. No toolpath is generated, no
 * cell is touched: this is a REPORT, the same honesty class as the
 * gap-narrower-than-tool and dropped-sliver warnings.
 *
 * Pure module: grid + model surface in, numbers out. The grid is
 * reindexed to datum 0 internally so its rows meet the material-frame
 * dexel rows directly (the caller passes un-rotated positions — the
 * same positions the op sliced).
 */

import { buildDexelMap } from './rotaryCarve';
import { reindexStanding, type StandingGrid } from './rotaryCarve';

export interface RestMaterialOptions {
  /** the standing grid after the op's cuts are stamped (final state) */
  grid: StandingGrid;
  /** machine-space xyz triples of the MODEL, non-indexed, in the
   *  material frame (the same positions the op sliced) */
  positions: ArrayLike<number>;
  /** both-axis roughing allowance, mm — rest thinner than this is the
   *  finishing op's intended stock, not an honest leftover to report */
  allowance: number;
  /** the thinness threshold, mm of arc at the surface (Alice's ruled
   *  default: max(0.2, stepOver)) */
  thinBelow: number;
  /** the tool's diameter — runs at least this wide that the rough left
   *  standing are counted in `wideRuns` for diagnostics only: they are
   *  the already-warned territory (maxDepth floor, deep undercuts, the
   *  endcap gap), never the note */
  toolDiameter: number;
}

export interface RestMaterialReport {
  /** contiguous rest runs found, all widths */
  runs: number;
  /** runs whose minimum arc width is below `thinBelow` — the streamer
   *  class: deliberately left, reported once */
  thinRuns: number;
  /** runs at least a tool wide the rough left standing */
  wideRuns: number;
  /** total rest volume, mm³ (cell slab × radial excess) — the honest
   *  "how much is left" number */
  volume: number;
  /** volume of the THIN class only */
  thinVolume: number;
  /** true when any rest at all was found */
  anyRest: boolean;
  /** human-readable one-line summary, or null when there is no rest */
  note: string | null;
}

/** depth tolerance on the allowance boundary, mm — a fine relief mesh
 *  wobbles ±0.05mm around its true surface (the measured wall noise
 *  behind the dropped-sliver warning), and without this the skin reads
 *  as thousands of hairline rest arcs, one per tessellation dip */
const REST_EPS = 0.05;

export function restMaterialReport(o: RestMaterialOptions): RestMaterialReport {
  // rows meet the material frame: reindex to datum 0 (a pure copy when
  // the grid already sits there)
  const grid = o.grid.datumAngle === 0 ? o.grid : reindexStanding(o.grid, 0, o.grid.nTheta);
  const surface = buildDexelMap(
    o.positions,
    grid.gx0,
    grid.pitchX,
    grid.nx,
    grid.nTheta,
    grid.radius,
    grid.axisZ,
  );
  const dTheta = (2 * Math.PI) / grid.nTheta;

  // rest excess per cell: standing radius minus model surface, beyond
  // the allowance. Air cells (no model on the ray) are not the streamer
  // class — leftover raw stock out there belongs to the clear-excess op.
  const excess = new Float64Array(grid.nx * grid.nTheta);
  let anyRest = false;
  for (let k = 0; k < excess.length; k++) {
    const s = surface[k];
    if (s === Infinity) continue;
    const d = grid.r[k] - s;
    if (d > o.allowance + REST_EPS) {
      excess[k] = d;
      anyRest = true;
    }
  }
  if (!anyRest) {
    return { runs: 0, thinRuns: 0, wideRuns: 0, volume: 0, thinVolume: 0, anyRest: false, note: null };
  }

  // contiguous θ-runs per X column (wrap-around counts; θ-neighbours
  // only — merging along X would fuse side-by-side skins into one
  // dishonest giant run). A run's WIDTH is its total arc extent (the
  // sum of its cells' arc widths) — the width of the ribbon the
  // finishing tool would meet, not the width of one grid cell.
  let runs = 0;
  let thinRuns = 0;
  let wideRuns = 0;
  let volume = 0;
  let thinVolume = 0;
  const seen = new Uint8Array(grid.nx * grid.nTheta);
  for (let i = 0; i < grid.nx; i++) {
    for (let j = 0; j < grid.nTheta; j++) {
      if (seen[j * grid.nx + i] || excess[j * grid.nx + i] <= 0) continue;
      // flood the run along θ within this column
      let w = 0;
      let vol = 0;
      const stack: number[] = [j];
      while (stack.length > 0) {
        const c = stack.pop()!;
        const k = c * grid.nx + i;
        if (seen[k] || excess[k] <= 0) continue;
        seen[k] = 1;
        const cw = dTheta * surface[k]; // arc width of the cell at the surface
        w += cw;
        vol += excess[k] * cw * grid.pitchX;
        stack.push((c + 1) % grid.nTheta, (c - 1 + grid.nTheta) % grid.nTheta);
      }
      runs++;
      volume += vol;
      if (w < o.thinBelow) {
        thinRuns++;
        thinVolume += vol;
      } else if (w >= o.toolDiameter) {
        wideRuns++;
      }
    }
  }

  // The note carries the THIN class only: wider rest is the legitimate
  // already-warned territory (the maxDepth floor, deep undercuts, the
  // endcap gap — each has its own warning class), and double-reporting
  // it here as a "bug smell" reads as an alarm where there is none.
  // wideRuns stays in the struct for diagnostics.
  const note =
    thinRuns === 0
      ? null
      : `${thinRuns} thin streamer${thinRuns === 1 ? '' : 's'} left standing ` +
        `(< ${o.thinBelow.toFixed(1)}mm wide, ~${Math.round(thinVolume)}mm³) — finishing stock, not cuttable by the roughing tool`;
  return { runs, thinRuns, wideRuns, volume, thinVolume, anyRest, note };
}
