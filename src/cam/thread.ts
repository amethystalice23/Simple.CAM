/**
 * External 4th-axis threads — PLAN.md Phase 2, cut with a V-bit on the
 * rotary axis. The same phase-locked helix skeleton as spiralCarve:
 * per pass `G1 X… A…` at constant Z with A advancing (span/lead)·360°;
 * Z depth-steps between passes re-entering at the identical absolute A
 * phase (levels retrace the same helix — sweeps alternate direction
 * with A returning along the groove); multi-start = angular offsets of
 * 360/starts; a final spring pass at full depth sizes the flanks.
 *
 * Geometry (empirical, per PLAN risk #3 — cut a coupon to tune):
 *  - lead = starts × pitch; each start is one helix advancing lead/rev
 *  - groove depth = (pitch/4)/tan(vAngle/2) + tolerance — grooves half
 *    a pitch wide at the crest surface, teeth half a pitch at crest;
 *    tolerance shrinks the teeth (a looser fit), tenths of a mm
 *  - face Ø (the crest diameter) = nominal − 2·tolerance
 *  - `faceFirst` pre-faces the stock to the crest Ø via the faceCylinder
 *    generator (spiral pattern) before the grooves; without it the depth
 *    ladder starts at the stock surface and walks down to the thread
 *    root, so surplus stock simply becomes extra levels.
 */

import type { FaceCylinderOp, Move, RotaryCalibration, ThreadOp, Tool } from '../core/types';
import { faceCylinder } from './faceCylinder';
import { MAX_ROTARY_RPM, SAFE_CLEARANCE, DEFAULT_STEP_OVER_FACTOR } from './faceCylinder';

/** Groove depth below the crest surface, mm. */
export function threadDepth(pitch: number, vAngle: number, tolerance: number): number {
  return pitch / 4 / Math.tan(((vAngle / 2) * Math.PI) / 180) + tolerance;
}

/** The crest (outer) diameter the thread should be cut into. */
export function threadFaceDiameter(nominalDiameter: number, tolerance: number): number {
  return nominalDiameter - 2 * tolerance;
}

export interface ThreadResult {
  moves: Move[];
  /** groove sweeps incl. spring passes (facing passes not counted) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** the groove depth used, mm (derived — surfaced for the summary) */
  depth: number;
  /** the crest diameter used, mm */
  faceDiameter: number;
}

export function thread(
  op: ThreadOp,
  calibration: RotaryCalibration,
  tool: Tool,
  datumAngle: number,
): ThreadResult {
  if (op.xEnd === op.xStart) throw new Error('xStart and xEnd must differ');
  if (op.pitch <= 0) throw new Error('pitch must be positive');
  if (!Number.isInteger(op.starts) || op.starts < 1) throw new Error('starts must be a whole number ≥ 1');
  if (op.tolerance < 0) throw new Error('tolerance must be ≥ 0');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (tool.type !== 'vbit') throw new Error('threading needs a V-bit tool (chamfering bit)');
  if (!tool.vAngle || tool.vAngle < 20 || tool.vAngle > 180) {
    throw new Error('the V-bit has no usable tip angle — set one in the tool library');
  }

  const { axisZ, effectiveRadius: stockR } = calibration;
  const depth = threadDepth(op.pitch, tool.vAngle, op.tolerance);
  const faceDiameter = threadFaceDiameter(op.nominalDiameter, op.tolerance);
  const rootR = faceDiameter / 2 - depth;
  if (rootR <= 0) throw new Error('the groove depth exceeds the thread radius — nothing would remain');
  const startR = op.faceFirst ? faceDiameter / 2 : stockR;
  if (rootR >= startR) {
    throw new Error(
      'the stock is at or below the thread root — nothing to cut (face up first, or check the nominal Ø)',
    );
  }

  const moves: Move[] = [];
  let minutes = 0;
  let a = 0; // accumulated machine A; the post wraps with G92.4

  // ---- the optional pre-face: spiral facing to the crest diameter ----
  if (op.faceFirst) {
    const face: FaceCylinderOp = {
      kind: 'faceCylinder',
      id: op.id,
      toolId: tool.id,
      targetDiameter: faceDiameter,
      xStart: op.xStart,
      xEnd: op.xEnd,
      stepDown: op.stepDown,
      stepOver: DEFAULT_STEP_OVER_FACTOR * tool.diameter,
      finishAllowance: 0,
      rotation: op.rotation,
      pattern: 'spiral',
      feed: op.feed,
      plungeFeed: op.plungeFeed,
    };
    const res = faceCylinder(face, calibration, tool);
    moves.push(...res.moves);
    minutes += res.estimatedMinutes;
    // the facing's final A (the facing's last move is an A-less retract)
    const lastA = [...res.moves].reverse().find((m) => m.words.a !== undefined)?.words.a;
    a = lastA ?? a;
  }

  // ---- the grooves: phase-locked retrace levels + spring passes ----
  const span = Math.abs(op.xEnd - op.xStart);
  const lead = op.starts * op.pitch;
  const aAdvance = (span / lead) * 360;
  const revs = aAdvance / 360;
  const passMinutes = revs / MAX_ROTARY_RPM; // G93 from the rotary limit
  const aSign = op.rotation === 'cw' ? 1 : -1;
  const safeZ = axisZ + startR + SAFE_CLEARANCE;

  // depth ladder from the working surface down to the root, last at it
  const total = startR - rootR;
  const levels: number[] = [];
  for (let d = op.stepDown; d < total - 1e-9; d += op.stepDown) levels.push(d);
  levels.push(total);

  let passes = 0;
  const surfaceZ = axisZ + startR;
  for (let s = 0; s < op.starts; s++) {
    // the start's pattern phase: datum + its share of the circle
    const phase = datumAngle + s * (360 / op.starts);
    a += (((phase - a) % 360) + 360) % 360; // positive positioning delta
    moves.push({ words: { x: op.xStart, z: safeZ, a }, feed: 0, rapid: true, comment: `start ${s + 1}/${op.starts}` });

    // levels + one spring pass retrace the same helix at full depth
    const runs = [...levels, total]; // the spring: the final depth again
    runs.forEach((depthFromSurface, li) => {
      const passZ = surfaceZ - depthFromSurface;
      const isSpring = li === runs.length - 1;
      moves.push({
        words: { z: passZ },
        feed: op.plungeFeed,
        comment: li === 0 ? 'plunge to thread depth' : undefined,
      });
      minutes += (li === 0 ? levels[0] : depthFromSurface - runs[li - 1]) / op.plungeFeed;
      const forward = li % 2 === 0;
      a += forward ? aSign * aAdvance : -aSign * aAdvance;
      moves.push({
        words: { x: forward ? op.xEnd : op.xStart, a },
        feed: 1 / passMinutes, // G93 inverse time
        comment: isSpring ? 'spring pass' : undefined,
      });
      minutes += passMinutes;
      passes++;
    });
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
  }

  return { moves, passes, estimatedMinutes: minutes, depth, faceDiameter };
}