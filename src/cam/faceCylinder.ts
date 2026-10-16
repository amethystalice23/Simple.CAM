/**
 * Face a cylinder to a target diameter — the "4D lathe" operation.
 *
 * Full-circumference passes: A rotates continuously while X sweeps axially,
 * Z stepped down per pass until the radial depth reaches
 * effectiveRadius - targetDiameter/2. Roughing passes at stepDown, then one
 * finishing pass at full depth.
 *
 * The machine's A axis is rotation-rate limited (~6.6 RPM sustained, see
 * docs/PLAN.md), so pass duration = revolutions / rpm and the coordinated
 * move runs in G93 with F = 1/passMinutes.
 */

import type { FaceCylinderOp, Move, Stock, Tool } from '../core/types';

/** Community-firmware sustainable rotary limit (C1 harmonic drive). */
export const MAX_ROTARY_RPM = 6.6;

/** Axial advance per revolution as a fraction of tool diameter. */
const AXIAL_STEP_OVER_FACTOR = 0.8;

/** Z clearance above the crown for rapids, mm. */
export const SAFE_CLEARANCE = 5;

/** A rotation during a radial plunge (helical entry), degrees. */
export const PLUNGE_SWEEP_DEG = 90;

export interface FaceCylinderResult {
  moves: Move[];
  /** pass count including the finishing pass */
  passes: number;
  /** total radial depth removed, mm */
  radialDepth: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

export function faceCylinder(
  op: FaceCylinderOp,
  stock: Extract<Stock, { kind: 'cylinder' }>,
  tool: Tool,
): FaceCylinderResult {
  if (stock.kind !== 'cylinder') throw new Error('faceCylinder requires cylindrical stock');
  if (op.targetDiameter <= 0) throw new Error('targetDiameter must be positive');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.finishAllowance < 0) throw new Error('finishAllowance must be >= 0');

  const { axisZ, effectiveRadius: r0 } = stock.calibration;
  const r1 = op.targetDiameter / 2;
  const totalDepth = r0 - r1;
  if (totalDepth <= 0) {
    throw new Error(
      `target diameter ${op.targetDiameter} is not below stock radius ${r0} — nothing to face`,
    );
  }

  const span = Math.abs(op.xEnd - op.xStart);
  if (span <= 0) throw new Error('xStart and xEnd must differ');

  // Roughing depths: k * stepDown while below (total - allowance), capped.
  const roughTarget = Math.max(totalDepth - op.finishAllowance, 0);
  const roughDepths: number[] = [];
  for (let k = 1; k * op.stepDown < roughTarget; k++) roughDepths.push(k * op.stepDown);
  if (roughTarget > 0 && roughDepths.length === 0) roughDepths.push(roughTarget);
  const depths = [...roughDepths, totalDepth];

  // Per pass: axial advance per revolution bounded by the step-over rule.
  const stepOver = AXIAL_STEP_OVER_FACTOR * tool.diameter;
  const revs = span / stepOver;
  const aAdvance = revs * 360;
  const passMinutes = revs / MAX_ROTARY_RPM;
  const aSign = op.rotation === 'cw' ? 1 : -1;

  // Z0 is the stock center (axis datum); the surface sits at axisZ + r0
  const surfaceZ = axisZ + r0;
  const safeZ = surfaceZ + SAFE_CLEARANCE;
  const moves: Move[] = [];
  let a = 0; // accumulated A, machine degrees (post emits G92.4 A0 afterwards)
  let minutes = 0;

  const spiral = op.pattern === 'spiral';

  depths.forEach((depth, i) => {
    const isFinish = i === depths.length - 1;
    const prevDepth = i === 0 ? 0 : depths[i - 1];
    // Alternate sweep direction between passes so each pass starts where the
    // last one ended — no wasted rapids.
    const sweepStart = i % 2 === 0 ? op.xStart : op.xEnd;
    const sweepEnd = i % 2 === 0 ? op.xEnd : op.xStart;
    const passZ = surfaceZ - depth;

    // Helical entry: plunge the radial increment while rotating, so the cut
    // engages progressively around the stock instead of chewing one spot.
    // Z rate is bounded by plungeFeed; the A rate by the rotary limit.
    const increment = depth - prevDepth;
    const plungeMinutes = Math.max(
      increment / op.plungeFeed,
      (PLUNGE_SWEEP_DEG / 360) / MAX_ROTARY_RPM,
    );

    if (i === 0 || !spiral) {
      // zigzag re-enters from safe Z each pass; the spiral only does this
      // once — afterwards it steps down at the sweep ends, in the cut
      moves.push({
        words: { x: sweepStart, z: safeZ, a: a * aSign },
        feed: 0,
        rapid: true,
        comment: `pass ${i + 1}/${depths.length}${isFinish ? ' (finish)' : ''} depth ${depth.toFixed(3)}mm radial`,
      });
    }

    a += PLUNGE_SWEEP_DEG;
    moves.push({
      words: { z: passZ, a: a * aSign },
      feed: 1 / plungeMinutes, // G93 inverse time
      comment:
        i === 0 || !spiral
          ? `helical entry ${increment.toFixed(3)}mm radial`
          : `spiral step down ${increment.toFixed(3)}mm radial`,
    });

    moves.push({
      words: { x: sweepEnd, a: (a + aAdvance) * aSign },
      feed: 1 / passMinutes, // G93 inverse time
      comment: isFinish ? undefined : `rough to r=${(r0 - depth).toFixed(3)}`,
    });
    a += aAdvance;

    if (!spiral || isFinish) {
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    }
    minutes += plungeMinutes + passMinutes;
  });

  return {
    moves,
    passes: depths.length,
    radialDepth: totalDepth,
    estimatedMinutes: minutes,
  };
}