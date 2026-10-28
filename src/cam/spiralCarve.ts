/**
 * Spiral carving — the wrapped-groove family's first member (PLAN.md
 * Phase 2): helical grooves cut into a cylinder about the stock axis.
 *
 * Each strand is ONE helix at the op's angle off the circumferential
 * direction: as X sweeps the operating area, A advances
 * (span / (2πR·tan(angle)))·360°. `count` strands sit evenly around
 * 360° (multi-start, like the thread spec); `width` wider than the tool
 * fans adjacent parallel helices axially to cover it (each at full
 * depth); `width` 0 means no fan at all — the pass just follows the
 * lines and the groove is whatever the tool cuts (knurling with a
 * V-bit, where the real width knob is depth); `depth` is reached
 * through a step-down ladder whose levels
 * RETRACE the same helix — level sweeps alternate direction with A
 * returning along the groove, so every level deepens the identical 3D
 * curve, never a mirror of it.
 *
 * G93 for every X+A sweep (F = 1/passMinutes from the rotary limit);
 * plunges and axial fan re-positioning run G94. Entry is a straight
 * plunge at the strand start (a helical ramp along the groove is a
 * future refinement). A accumulates; the post wraps with G92.4.
 */

import type { Move, RotaryCalibration, SpiralCarveOp } from '../core/types';
import { MAX_ROTARY_RPM, SAFE_CLEARANCE, shortestATo } from './faceCylinder';

export interface SpiralCarveResult {
  moves: Move[];
  /** total helix sweeps (strands × fan passes × levels) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/** Axial offsets of the width-fan passes: n parallel helices whose tool
 * widths cover `width` (a single pass when the tool already spans it). */
function fanOffsets(width: number, toolDiameter: number): number[] {
  if (width <= toolDiameter) return [0];
  const n = Math.ceil(width / toolDiameter);
  const spread = width - toolDiameter;
  return Array.from({ length: n }, (_, i) => -spread / 2 + (i * spread) / (n - 1));
}

/** Depth levels down to `depth` in evenly distributed steps, the last exactly at it.
 * Rationale: acetal (POM) punishes too-short steps; even distribution maximizes the minimum cut. */
function depthLadder(depth: number, stepDown: number): number[] {
  const n = Math.ceil(depth / stepDown);
  const levels: number[] = [];
  for (let k = 1; k < n; k++) {
    levels.push((k * depth) / n);
  }
  levels.push(depth);
  return levels;
}

/** A advance per full sweep, degrees (0 for a pure axial line). */
function sweepAdvance(span: number, radius: number, spiralAngle: number): number {
  if (spiralAngle >= 90 - 1e-9) return 0; // axial: A stationary during sweeps
  const lead = 2 * Math.PI * radius * Math.tan((spiralAngle * Math.PI) / 180);
  return (span / lead) * 360;
}

export function spiralCarve(
  op: SpiralCarveOp,
  calibration: RotaryCalibration,
  toolDiameter: number,
  datumAngle: number,
  /** the machine's accumulated A when this op starts — phase positioning
   * takes the shortest rotation from it, never unwinding the previous
   * ops' pile to reach a small absolute target */
  startA: number = 0,
): SpiralCarveResult {
  if (op.xEnd === op.xStart) throw new Error('xStart and xEnd must differ');
  if (op.spiralAngle <= 0 || op.spiralAngle > 90) {
    throw new Error('spiral angle must be within (0°, 90°]');
  }
  if (!Number.isInteger(op.count) || op.count < 1) throw new Error('count must be a whole number ≥ 1');
  if (op.depth <= 0) throw new Error('depth must be positive');
  if (op.width < 0) {
    // 0 is legitimate: "just follow the lines" — one pass, the groove
    // being whatever the tool cuts (V-bit knurling). The panel warns only
    // on the unintentional narrow case: 0 < width < tool Ø.
    throw new Error('width cannot be negative (0 = just follow the lines)');
  }
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (toolDiameter <= 0) throw new Error('tool diameter must be positive');
  if (op.plungeFeed <= 0) throw new Error('plungeFeed must be positive');

  const { axisZ, effectiveRadius: stockRadius } = calibration;
  const r = op.surfaceDiameter / 2;
  if (r > stockRadius + 1e-9) {
    throw new Error(
      `surface Ø ${op.surfaceDiameter} is above the stock radius ${stockRadius} — carve into the stock, not above it`,
    );
  }
  if (op.depth >= r - 0.05) {
    throw new Error(
      `groove depth ${op.depth}mm leaves no material at Ø${op.surfaceDiameter} — the cut would reach past the axis`,
    );
  }
  const span = Math.abs(op.xEnd - op.xStart);
  const surfaceZ = axisZ + r;
  const safeZ = surfaceZ + (op.clearance ?? SAFE_CLEARANCE);
  const aAdvance = sweepAdvance(span, r, op.spiralAngle);
  const aSign = op.rotation === 'cw' ? 1 : -1;
  const helical = aAdvance > 1e-9; // else: pure axial lines at fixed A
  const revs = aAdvance / 360;
  // Per-level G93 timing: the groove's true path length at the CURRENT
  // cutting radius (r − depth) — `feed` means the surface speed AT the
  // cut, held constant across the ladder (the arc shortens as the groove
  // deepens, so A runs faster level by level), never above the rotary
  // ceiling (the ceiling floor keeps the machine's A limit). An axial
  // sweep has no rotation: plain G94 at op.feed.
  const passMinutesFor = (depth: number): number =>
    helical
      ? Math.max(
          Math.hypot((aAdvance * Math.PI) / 180 * (r - depth), span) / op.feed,
          revs / MAX_ROTARY_RPM,
        )
      : span / op.feed;
  const levels = depthLadder(op.depth, op.stepDown);
  const fans = fanOffsets(op.width, toolDiameter);

  const moves: Move[] = [];
  let a = startA; // accumulated machine A; the post wraps with G92.4
  let minutes = 0;
  let passes = 0;
  let entered = false; // the descent-after-travel runs on the first entry only

  for (let s = 0; s < op.count; s++) {
    // the strand's pattern phase: datum + spin + its share of the circle.
    // Each strand ends where it started (levels retrace), so the phase is
    // set once per strand by the shortest rotation to its spoke.
    const phase = datumAngle + (op.spin ?? 0) + s * (360 / op.count);
    a += shortestATo(phase, a);

    for (const off of fans) {
      const xs = op.xStart + off;
      const xe = op.xEnd + off;
      // axis-separate positioning (see thread/faceCylinder): a coordinated
      // X+Z+A rapid runs the traverse at the rotary clamp rate — rotate in
      // place and travel at the machine's existing height (after a tool
      // change, the swap macro's high park — never a low diagonal
      // descent), THEN descend to the clearance height. Later passes
      // already sit there from the previous retract.
      moves.push({
        words: { a },
        feed: 0,
        rapid: true,
        comment: `strand ${s + 1}/${op.count}${fans.length > 1 ? `, pass ${off.toFixed(2)}mm off-center` : ''}`,
      });
      moves.push({ words: { x: xs }, feed: 0, rapid: true });
      if (!entered) {
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        entered = true;
      }
      levels.forEach((depth, li) => {
        const passZ = surfaceZ - depth;
        const increment = li === 0 ? depth : depth - levels[li - 1];
        // straight plunge at fixed A (the groove start mark), or the
        // in-cut level step at the previous sweep's end
        moves.push({
          words: { z: passZ },
          feed: op.plungeFeed,
          comment: li === 0 ? `plunge to ${depth.toFixed(2)}mm deep` : undefined,
        });
        minutes += increment / op.plungeFeed;
        // the sweep alternates direction; A returns along the groove so
        // every level retraces the same helix
        const forward = li % 2 === 0;
        a += forward ? aSign * aAdvance : -aSign * aAdvance;
        const passMinutes = passMinutesFor(depth);
        moves.push({
          words: helical ? { x: forward ? xe : xs, a } : { x: forward ? xe : xs },
          feed: helical ? 1 / passMinutes : op.feed,
          comment: li === levels.length - 1 ? undefined : `level ${li + 1}/${levels.length}`,
        });
        minutes += passMinutes;
        passes++;
      });
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    }
  }

  return { moves, passes, estimatedMinutes: minutes };
}

// ------------------------------------------------------------- preview

/** The groove helices as 3D points for the setup display: each strand ×
 * width-fan pass sampled along its curve at the cut radius, in the
 * PART-LOCAL (A=0) frame — the viewport's datum rotation carries them
 * with the part. datumAngle + op.spin shift the strand phases exactly
 * like generation. */
export function sampleSpiralMarks(
  op: SpiralCarveOp,
  calibration: RotaryCalibration,
  toolDiameter: number,
  datumAngle: number,
): { x: number; y: number; z: number }[][] {
  const { axisZ } = calibration;
  const r = Math.max(op.surfaceDiameter / 2 - op.depth, op.surfaceDiameter / 4);
  const span = Math.abs(op.xEnd - op.xStart);
  const aAdvance = sweepAdvance(span, op.surfaceDiameter / 2, op.spiralAngle);
  const aSign = op.rotation === 'cw' ? 1 : -1;
  // ~15° chords like the toolpath preview
  const steps = Math.max(2, Math.ceil(aAdvance / 15) + 1);
  const marks: { x: number; y: number; z: number }[][] = [];
  for (let s = 0; s < op.count; s++) {
    // identical phase formula to spiralCarve() — preview and generation
    // angle conventions must never disagree (pinned iron finding)
    const phase = datumAngle + (op.spin ?? 0) + s * (360 / op.count);
    for (const off of fanOffsets(op.width, toolDiameter)) {
      const pts: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const ang = ((phase + aSign * t * aAdvance) * Math.PI) / 180;
        // the preview's validated angle convention (toolpathPreview
        // toDisplay): part angle θ sits at y = +r·sin(θ) — the minus
        // form mirrored the computed toolpath
        pts.push({
          x: op.xStart + off + t * span,
          y: r * Math.sin(ang),
          z: axisZ + r * Math.cos(ang),
        });
      }
      marks.push(pts);
    }
  }
  return marks;
}