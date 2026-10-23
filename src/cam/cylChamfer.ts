/**
 * Cylinder chamfer — a V-bit ring pass at one fixed X (edge-tracing §6,
 * the "circular chamfer"): the degenerate face-cylinder vertical pattern,
 * one X, one full A revolution per level. Sweeps are A-only, so the post
 * runs them G94 at ROTARY_FEED_DEG_MIN (deg/min); level entries are G94
 * Z plunges at the seam angle, re-cut by the following sweep.
 *
 * Placement: tip at (edge.x, edge.diameter/2 − depth) — the DEPTH is the
 * only direction there is (see CylChamferOp). The cone flank shears
 * whichever side of X carries material, so no side parameter exists; and
 * the ladder never needs to know the adjoining diameter:
 * - depth 0 — levels descend from the STOCK surface (the wall above the
 *   anchor is unknown; levels above it sweep air, harmlessly) and the
 *   final pass at the anchor radius produces the finished flank;
 * - depth > 0 — the circle is the highest point, so the ladder runs from
 *   the circle down to (Ø/2 − depth).
 */

import type { CylChamferOp, Move, RotaryCalibration, Tool } from '../core/types';
import { MAX_ROTARY_RPM, ROTARY_FEED_DEG_MIN, SAFE_CLEARANCE } from './faceCylinder';

export interface CylChamferResult {
  moves: Move[];
  /** full 360° sweeps (levels × edges) */
  passes: number;
  /** chamfer angle from the rod axis, degrees — set by the tool (90 − half-angle) */
  chamferAngleDeg: number;
  /** axial chamfer width at the anchor Ø, mm (depth · tan(half-angle)) */
  width: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/**
 * Tip radii per level, descending from `top` to exactly `bottom` in ≤
 * stepDown steps — a single pass when the span fits one step (the whole
 * wedge at the seam then, which is what "already the highest point"
 * means). The final level is the cut's finished radius.
 */
function levelRadii(top: number, bottom: number, stepDown: number): number[] {
  if (top - bottom <= stepDown + 1e-9) return [bottom];
  const out: number[] = [];
  let r = top - stepDown;
  while (r > bottom + 1e-9) {
    out.push(r);
    r -= stepDown;
  }
  out.push(bottom);
  return out;
}

export function cylChamfer(
  op: CylChamferOp,
  calibration: RotaryCalibration,
  tool: Tool,
  /** the machine's accumulated A when this op starts — sweeps continue
   * from it so the axis never unwinds the previous ops' pile */
  startA: number = 0,
): CylChamferResult {
  if (op.edges.length === 0) throw new Error('cylinder chamfer needs at least one edge circle');
  if (op.depth < 0) throw new Error('chamfer depth cannot be negative');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.plungeFeed <= 0) throw new Error('plungeFeed must be positive');
  if (tool.type !== 'vbit') {
    throw new Error('cylinder chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
  }
  if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
    throw new Error('chamfer tool needs a sane included tip angle (0–180°)');
  }
  const half = (tool.vAngle / 2) * (Math.PI / 180);
  const rt = (tool.tipDiameter ?? 0) / 2;
  const width = op.depth * Math.tan(half);
  // depth > 0 cuts below the anchor Ø, so the flank must reach the anchor
  // surface before the shank starts (depth 0 anchors ON it — no reach needed)
  if (op.depth > 0 && rt + width > tool.diameter / 2 + 1e-9) {
    throw new Error(
      `chamfer of ${op.depth.toFixed(2)}mm needs ${(rt + width).toFixed(2)}mm of flank — ` +
        `the Ø${tool.diameter} bit's cone is too short`,
    );
  }

  const { axisZ, effectiveRadius: r0 } = calibration;
  const surfaceZ = axisZ + r0;
  const safeZ = surfaceZ + (op.clearance ?? SAFE_CLEARANCE);
  const aSign = op.rotation === 'cw' ? 1 : -1;
  const anchorMode = op.depth <= 1e-9;

  const moves: Move[] = [];
  let a = startA; // accumulated machine A; the post wraps with G92.4
  let minutes = 0;
  let passes = 0;
  let entered = false; // the descent-after-travel runs on the first edge only

  for (const edge of op.edges) {
    if (!(edge.diameter > 0)) throw new Error('edge circle diameter must be positive');
    const rA = edge.diameter / 2;
    if (rA > r0 + 1e-6) {
      throw new Error(
        `edge circle Ø${edge.diameter.toFixed(2)} is above the stock surface (Ø${(r0 * 2).toFixed(2)}) — nothing to chamfer through`,
      );
    }
    if (anchorMode && rA >= r0 - 1e-6) {
      throw new Error(
        'depth 0 anchors exactly on the circle, but nothing rises above it at the stock ' +
          'surface — set a depth to chamfer down from the rim instead',
      );
    }
    const tipR = rA - op.depth;
    if (tipR <= 0.05) {
      throw new Error(
        `chamfer depth ${op.depth}mm at Ø${edge.diameter.toFixed(2)} would cut past the axis`,
      );
    }
    // ladder top: the stock surface when anchoring on the circle (material
    // above is unknown — air levels are harmless), else the circle itself
    // (it is the highest point)
    const top = anchorMode ? r0 : rA;
    const levels = levelRadii(top, tipR, op.stepDown);

    // axis-separate positioning (see spiralCarve): travel to the edge at
    // the machine's existing height (after a tool change, the swap
    // macro's high park — never a low diagonal descent over the rotary
    // hardware), then descend at the destination. Between edges the
    // retract above already provides the height.
    moves.push({
      words: { x: edge.x },
      feed: 0,
      rapid: true,
      comment:
        `chamfer edge X${edge.x.toFixed(2)}, Ø${edge.diameter.toFixed(2)} — ` +
        (anchorMode ? 'cut up-and-out' : `${op.depth.toFixed(2)}mm below`),
    });
    if (!entered) {
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      entered = true;
    }

    let prevLevel = top; // the plunge's material start (the surface/circle)
    levels.forEach((level, li) => {
      // straight plunge at fixed A (the seam angle); the following sweep
      // re-cuts it, so no dwell mark survives
      moves.push({
        words: { z: axisZ + level },
        feed: op.plungeFeed,
        comment: li === levels.length - 1 ? undefined : `level ${li + 1}/${levels.length}`,
      });
      minutes += Math.max(prevLevel - level, 0) / op.plungeFeed;
      prevLevel = level;
      // full revolution at fixed X — A-only, so the post runs it in G94
      // at the sustainable rotary limit (deg/min)
      a += aSign * 360;
      moves.push({ words: { a }, feed: ROTARY_FEED_DEG_MIN });
      minutes += 1 / MAX_ROTARY_RPM;
      passes++;
    });

    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
  }

  return {
    moves,
    passes,
    chamferAngleDeg: 90 - tool.vAngle / 2,
    width,
    estimatedMinutes: minutes,
  };
}