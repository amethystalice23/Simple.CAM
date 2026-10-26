/**
 * Move[] → carved pose stream (src/sim — pure core, no three.js).
 *
 * Mirrors src/ui/toolpathPreview.ts's modal accumulation EXACTLY: axis
 * words are absolute, a missing word = unchanged modal value; the first
 * move only positions (no pose — the machine's true start is unknown, the
 * no-phantom-segment rule); a pure-A RAPID (an Index op) emits nothing but
 * shifts θ for everything after it; A-only FEED moves cut (a vertical
 * facing ring) and emit poses.
 *
 * Poses are STOCK-frame (the un-rotated material at A=0 — VoxelGrid's
 * frame): for 4-axis, each sample at accumulated A = θ maps like
 * toolpathPreview's toDisplay — tipY = y·cosθ + zrel·sinθ, tipZ =
 * −y·sinθ + zrel·cosθ + axisZ — and the tool axis becomes machine −Z
 * rotated the same way: (0, −sinθ, −cosθ). θ stays the raw accumulated
 * value in radians (never normalized; trig is periodic). 3-axis is
 * identity with axis (0, 0, −1).
 *
 * Subdivision bounds every swept voxel kernel step: linear samples at ≤
 * pitch/2 mm AND rotary chord steps at Δθ ≤ (pitch/2)/rSurface radians
 * (rSurface = effectiveRadius; at r = 20mm, pitch 0.25 that is ~0.36° per
 * step). Rapids subdivide too — a rapid can gouge, and detection needs the
 * sweep.
 */

import type { Move, Stock } from '../core/types';
import { isSimultaneous, rotaryCalibrationOf } from '../core/types';
export interface Pose {
  /** stock-frame tip position, mm */
  x: number;
  y: number;
  z: number;
  /** stock-frame tool axis, unit (points the way the tool cuts: −Z at A=0) */
  ax: number;
  ay: number;
  az: number;
  /** index into the tool table (the caller's toolOf mapping) */
  tool: number;
  /** index of the Move this sample came from */
  moveIndex: number;
  rapid: boolean;
}

/** the tool-change macro's park height assumption: crown + clearance
 *  (SAFE_CLEARANCE's 5mm, src/cam/faceCylinder.ts — a named constant so
 *  the two stay visibly linked). Exported: the UI passes
 *  stockTopZ + this so the first rapid never dips inside the crown. */
export const SIM_PARK_CLEARANCE = 5;

export function movesToPoses(
  moves: Move[],
  stock: Stock,
  toolOf: (mi: number) => number,
  pitch: number,
  /** machine Z at job start (stockTopZ + park clearance — the tool-change
   *  macro's park). Default derives a sane value from the calibration so
   *  tests can omit it; production passes stockTopZ(stock). */
  startZ: number = rotaryCalibrationOf(stock).axisZ + rotaryCalibrationOf(stock).effectiveRadius + SIM_PARK_CLEARANCE,
): Pose[] {
  const rotary = stock.axisMode === '4-axis';
  const axisZ = rotary ? rotaryCalibrationOf(stock).axisZ : 0;
  const rSurface = rotary ? rotaryCalibrationOf(stock).effectiveRadius : 1;

  const maxStep = pitch / 2;
  const maxDTheta = maxStep / rSurface; // radians

  // Modal start: x/y at the machine origin, Z at the HIGH PARK (startZ —
  // the machine begins at the tool-change macro's park, and every
  // generator's first motion carries no Z until it positions and descends
  // at the destination per the entry-safety convention). Seeding Z at 0
  // would fabricate a sweep from mid-stock up through the crown on the
  // very first rapid and phantom-gouge (probe-verified 2026-10-25: the
  // move-1 "gouge" on the coin was exactly this).
  const pos = { x: 0, y: 0, z: startZ, a: 0 };
  const poses: Pose[] = [];
  let prevM: { x: number; y: number; z: number; a: number } | null = null;

  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi];
    pos.x = m.words.x ?? pos.x;
    pos.y = m.words.y ?? pos.y;
    pos.z = m.words.z ?? pos.z;
    pos.a = m.words.a ?? pos.a;

    // pure-A RAPID (an Index op): the stock rotates, the tool moves
    // nowhere and cuts nothing — no pose, but the datum shifts
    const aOnly =
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.y === undefined &&
      m.words.z === undefined;
    if (aOnly && m.rapid) {
      prevM = { ...pos };
      continue;
    }

    if (prevM !== null) {
      const dx = pos.x - prevM.x;
      const dy = pos.y - prevM.y;
      const dz = pos.z - prevM.z;
      const dTheta = rotary ? ((pos.a - prevM.a) * Math.PI) / 180 : 0;
      const nLin = Math.ceil(Math.hypot(dx, dy, dz) / maxStep);
      const nRot = rotary ? Math.ceil(Math.abs(dTheta) / maxDTheta) : 0;
      const n = Math.max(1, nLin, nRot);
      const tool = toolOf(mi);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const mx = prevM.x + dx * t;
        const my = prevM.y + dy * t;
        const mz = prevM.z + dz * t;
        const ma = prevM.a + (pos.a - prevM.a) * t;
        if (rotary) {
          const th = (ma * Math.PI) / 180;
          const cos = Math.cos(th);
          const sin = Math.sin(th);
          const zrel = mz - axisZ;
          poses.push({
            x: mx,
            y: my * cos + zrel * sin,
            z: -my * sin + zrel * cos + axisZ,
            ax: 0,
            ay: -sin,
            az: -cos,
            tool,
            moveIndex: mi,
            rapid: !!m.rapid,
          });
        } else {
          poses.push({
            x: mx,
            y: my,
            z: mz,
            ax: 0,
            ay: 0,
            az: -1,
            tool,
            moveIndex: mi,
            rapid: !!m.rapid,
          });
        }
      }
    }
    prevM = { ...pos };
  }

  return poses;
}

/**
 * Per-move duration, minutes — for the time-agnostic worker's progress and
 * any v2 playback clock. Feed unit follows the G93/G94 rule on Move:
 *  - G93 (isSimultaneous): feed = 1/minutes → duration = 1/feed
 *  - G94 with linear motion: 3D path length / feed (mm/min)
 *  - A-only G94 (rotary feed moves, e.g. cylChamfer's ROTARY_FEED_DEG_MIN
 *    sweeps): |ΔA| / feed (deg/min)
 *  - rapids: max(|Δx|/1200, |Δy|/1200, |Δz|/600, |ΔA|/3600) minutes
 * Zero-motion moves → 0.
 */
export function moveDurations(moves: Move[]): number[] {
  const pos = { x: 0, y: 0, z: 0, a: 0 };
  const out: number[] = [];
  for (const m of moves) {
    const w = m.words;
    const nx = w.x ?? pos.x;
    const ny = w.y ?? pos.y;
    const nz = w.z ?? pos.z;
    const na = w.a ?? pos.a;
    const dx = nx - pos.x;
    const dy = ny - pos.y;
    const dz = nz - pos.z;
    const da = na - pos.a;

    let t = 0;
    if (dx === 0 && dy === 0 && dz === 0 && da === 0) {
      t = 0; // zero-motion moves cost nothing, even when feed is stamped
    } else if (m.rapid) {
      t = Math.max(Math.abs(dx) / 1200, Math.abs(dy) / 1200, Math.abs(dz) / 600, Math.abs(da) / 3600);
    } else if (isSimultaneous(m)) {
      t = m.feed > 0 ? 1 / m.feed : 0;
    } else if (dx !== 0 || dy !== 0 || dz !== 0) {
      t = m.feed > 0 ? Math.hypot(dx, dy, dz) / m.feed : 0;
    } else if (da !== 0) {
      t = m.feed > 0 ? Math.abs(da) / m.feed : 0;
    }
    out.push(t);
    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
    pos.a = na;
  }
  return out;
}
