/**
 * Face a cylinder to a target diameter — the "4D lathe" operation.
 *
 * Z is stepped down per depth level until the radial depth reaches
 * effectiveRadius - targetDiameter/2: roughing passes at stepDown, then one
 * finishing pass at full depth. Three stroke patterns share those depth
 * levels and the step-over setting (see docs/PLAN.md):
 *
 * - 'spiral': one continuous helix per level — A advances with the axial
 *   sweep, and depth steps happen in the cut at the sweep ends.
 * - 'vertical': rings — one straight plunge per level, then a full A
 *   revolution at each X with in-cut X steps between rings, all rings
 *   turning the same way; levels snake back and forth across X and plunge
 *   to the next depth at the level end (no retract between rings).
 * - 'horizontal': indexed passes — a full X sweep at each A; A steps by
 *   the step-over arc between passes.
 *
 * The machine's A axis is rotation-rate limited (~6.6 RPM sustained, see
 * docs/PLAN.md), so every cut that rotates A is timed from that limit:
 * moves coordinating A with a linear axis run in G93 with F = 1/passMinutes;
 * A-only ring moves are classified G94 by the post (isSimultaneous) and run
 * at ROTARY_FEED_DEG_MIN (deg/min).
 */

import type { FaceCylinderOp, Move, Stock, Tool } from '../core/types';

/** Community-firmware sustainable rotary limit (C1 harmonic drive). */
export const MAX_ROTARY_RPM = 6.6;

/** G94 feed for A-only cutting moves (deg/min): one revolution takes
 * 360 / this = 1 / MAX_ROTARY_RPM minutes. */
export const ROTARY_FEED_DEG_MIN = MAX_ROTARY_RPM * 360;

/** Default step-over as a fraction of tool diameter — the UI derives its
 * field default from this; the generator only reads op.stepOver. */
export const DEFAULT_STEP_OVER_FACTOR = 0.8;

/** Z clearance above the crown for rapids, mm. */
export const SAFE_CLEARANCE = 5;

/** A rotation during a radial plunge (helical entry), degrees. */
export const PLUNGE_SWEEP_DEG = 90;

export interface FaceCylinderResult {
  moves: Move[];
  /** depth-level count including the finishing level */
  passes: number;
  /** total radial depth removed, mm */
  radialDepth: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/** X positions covering [from, to] spaced ≤ stepOver apart, always ending
 * exactly at `to` — the final gap may be shorter than the step-over. */
function ringPositions(from: number, to: number, stepOver: number): number[] {
  const span = Math.abs(to - from);
  const n = Math.floor(span / stepOver);
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) xs.push(from + (to - from) * ((k * stepOver) / span));
  if (Math.abs(xs[xs.length - 1] - to) > 1e-9) xs.push(to);
  return xs;
}

export function faceCylinder(
  op: FaceCylinderOp,
  stock: Extract<Stock, { kind: 'cylinder' }>,
  tool: Tool,
): FaceCylinderResult {
  if (stock.kind !== 'cylinder') throw new Error('faceCylinder requires cylindrical stock');
  if (op.targetDiameter <= 0) throw new Error('targetDiameter must be positive');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.stepOver <= 0) throw new Error('stepOver must be positive');
  if (op.finishAllowance < 0) throw new Error('finishAllowance must be >= 0');
  if (op.feed <= 0) throw new Error('feed must be positive');
  if (tool.diameter <= 0) throw new Error('tool diameter must be positive');
  if (op.pattern !== 'vertical' && op.pattern !== 'horizontal' && op.pattern !== 'spiral') {
    throw new Error(`unknown face pattern ${String(op.pattern)}`);
  }

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

  const stepOver = op.stepOver;
  const revs = span / stepOver;
  const aAdvance = revs * 360;
  const passMinutes = revs / MAX_ROTARY_RPM;
  const aSign = op.rotation === 'cw' ? 1 : -1;

  // Z0 is the stock center (axis datum); the surface sits at axisZ + r0
  const surfaceZ = axisZ + r0;
  const safeZ = surfaceZ + SAFE_CLEARANCE;
  const moves: Move[] = [];
  let a = 0; // accumulated machine A, degrees (post emits G92.4 A0 afterwards)
  let minutes = 0;
  let passIndex = 0; // global: horizontal X zigzags across levels
  const rings = ringPositions(op.xStart, op.xEnd, stepOver);

  depths.forEach((depth, i) => {
    const isFinish = i === depths.length - 1;
    const prevDepth = i === 0 ? 0 : depths[i - 1];
    const increment = depth - prevDepth;
    const passZ = surfaceZ - depth;
    // Z rate bounded by plungeFeed; the A rate by the rotary limit
    const entryMinutes = Math.max(
      increment / op.plungeFeed,
      (PLUNGE_SWEEP_DEG / 360) / MAX_ROTARY_RPM,
    );
    const passComment = `pass ${i + 1}/${depths.length}${isFinish ? ' (finish)' : ''} depth ${depth.toFixed(3)}mm radial`;

    if (op.pattern === 'spiral') {
      // Alternate sweep direction between levels so each starts where the
      // last one ended — no wasted rapids.
      const sweepStart = i % 2 === 0 ? op.xStart : op.xEnd;
      const sweepEnd = i % 2 === 0 ? op.xEnd : op.xStart;

      // approach once; afterwards depth steps happen in the cut at the
      // sweep ends, retracting only after the final level
      if (i === 0) {
        moves.push({
          words: { x: sweepStart, z: safeZ, a },
          feed: 0,
          rapid: true,
          comment: passComment,
        });
      }

      a += aSign * PLUNGE_SWEEP_DEG;
      moves.push({
        words: { z: passZ, a },
        feed: 1 / entryMinutes, // G93 inverse time
        comment:
          i === 0
            ? `helical entry ${increment.toFixed(3)}mm radial`
            : `spiral step down ${increment.toFixed(3)}mm radial`,
      });

      a += aSign * aAdvance;
      moves.push({
        words: { x: sweepEnd, a },
        feed: 1 / passMinutes, // G93 inverse time
        comment: isFinish ? undefined : `rough to r=${(r0 - depth).toFixed(3)}`,
      });

      if (isFinish) moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      minutes += entryMinutes + passMinutes;
    } else if (op.pattern === 'vertical') {
      // Rings: one straight plunge per level, then a full revolution at
      // each X with in-cut X steps between rings. Levels snake back and
      // forth across X (each starts where the last ended — the plunge to
      // the next depth happens right there, in the cut); only the final
      // level retracts.
      const xs = i % 2 === 0 ? rings : [...rings].reverse();
      if (i === 0) {
        moves.push({
          words: { x: xs[0], z: safeZ },
          feed: 0,
          rapid: true,
          comment: `${passComment} — ${xs.length} rings`,
        });
      }

      // straight plunge at fixed A (G94 plungeFeed): from safe Z on the
      // first level, stepped down in the cut at the level ends afterwards
      moves.push({
        words: { z: passZ },
        feed: op.plungeFeed,
        comment: `plunge ${increment.toFixed(3)}mm radial`,
      });

      xs.forEach((_, k) => {
        // Full revolution at fixed X. A-only, so the post runs it in G94 —
        // feed is deg/min at the sustainable rotary limit.
        a += aSign * 360;
        moves.push({ words: { a }, feed: ROTARY_FEED_DEG_MIN });

        // in-cut axial step to the next ring position (A stationary)
        if (k < xs.length - 1) {
          moves.push({ words: { x: xs[k + 1] }, feed: op.feed });
        }
      });
      if (isFinish) moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      minutes += increment / op.plungeFeed + xs.length / MAX_ROTARY_RPM + span / op.feed;
    } else {
      // Indexed passes: a full X sweep at each A, stepping A by the
      // step-over arc at the swept radius. X zigzags so A only ever advances
      // one way (it accumulates across levels; the post wraps via G92.4).
      const stepDeg = (op.stepOver / (r0 - depth)) * (180 / Math.PI);
      const n = Math.ceil(360 / stepDeg);
      for (let k = 0; k < n; k++) {
        const forward = passIndex % 2 === 0;
        const sweepStart = forward ? op.xStart : op.xEnd;
        const sweepEnd = forward ? op.xEnd : op.xStart;
        moves.push({
          words: { x: sweepStart, z: safeZ, a },
          feed: 0,
          rapid: true,
          comment: k === 0 ? `${passComment} — ${n} indexed passes` : undefined,
        });
        moves.push({
          words: { z: passZ },
          feed: op.plungeFeed, // G94 mm/min, A stationary
          comment: `plunge ${increment.toFixed(3)}mm radial`,
        });
        moves.push({
          words: { x: sweepEnd },
          feed: op.feed, // G94 mm/min
          comment: isFinish ? undefined : `rough to r=${(r0 - depth).toFixed(3)}`,
        });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        minutes += increment / op.plungeFeed + span / op.feed;
        a += aSign * stepDeg;
        passIndex++;
      }
    }
  });

  return {
    moves,
    passes: depths.length,
    radialDepth: totalDepth,
    estimatedMinutes: minutes,
  };
}