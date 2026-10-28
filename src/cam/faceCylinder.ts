/**
 * Face rotary stock to a target diameter — the "4D lathe" operation.
 *
 * Works for any 4-axis stock via its resolved calibration: cylinder stock
 * passes its probed calibration; box stock is faced as a cylinder of the
 * Y-Z half-diagonal radius (rotaryCalibrationOf) — corners turn off first,
 * early passes cut air over the flats, so it never gouges.
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

import type { FaceCylinderOp, Move, RotaryCalibration, Tool } from '../core/types';

/** Community-firmware sustainable rotary limit (C1 harmonic drive). */
export const MAX_ROTARY_RPM = 6.6;

/** G94 feed for A-only cutting moves (deg/min): one revolution takes
 * 360 / this = 1 / MAX_ROTARY_RPM minutes. */
export const ROTARY_FEED_DEG_MIN = MAX_ROTARY_RPM * 360;

/** Default step-over as a fraction of tool diameter — the UI derives its
 * field default from this; the generator only reads op.stepOver. Half the
 * cutter (the radius): past 50% radial engagement the fresh-material chip
 * load rises steeply toward slotting, and on this machine the rotary axis
 * carries the cutting torque directly (harmonic drive). */
export const DEFAULT_STEP_OVER_FACTOR = 0.5;

/** Z clearance above the crown for rapids, mm. */
export const SAFE_CLEARANCE = 5;

/** A rotation during a radial plunge (helical entry), degrees. */
export const PLUNGE_SWEEP_DEG = 90;

/**
 * Shortest signed rotation from `a` to an angle equivalent to `phase`
 * (mod 360): the delta in (−180, 180] that lands on the phase's spoke.
 * Used for every A positioning between ops and strands — never wind the
 * whole accumulated pile back to a small absolute target.
 */
export function shortestATo(phase: number, a: number): number {
  let delta = (((phase - a) % 360) + 360) % 360; // 0..360
  if (delta > 180) delta -= 360;
  return delta;
}

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
  calibration: RotaryCalibration,
  tool: Tool,
  /** the machine's accumulated A when this op starts — the sweeps continue
   * from it, so the op never drags the axis back to a small absolute
   * target through the whole previous pile */
  startA: number = 0,
): FaceCylinderResult {
  if (op.targetDiameter <= 0) throw new Error('targetDiameter must be positive');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.stepOver <= 0) throw new Error('stepOver must be positive');
  if (op.finishAllowance < 0) throw new Error('finishAllowance must be >= 0');
  if (op.feed <= 0) throw new Error('feed must be positive');
  if (tool.diameter <= 0) throw new Error('tool diameter must be positive');
  if (op.pattern !== 'vertical' && op.pattern !== 'horizontal' && op.pattern !== 'spiral') {
    throw new Error(`unknown face pattern ${String(op.pattern)}`);
  }

  const { axisZ, effectiveRadius: r0 } = calibration;
  const r1 = op.targetDiameter / 2;
  const totalDepth = r0 - r1;
  if (totalDepth <= 0) {
    throw new Error(
      `target diameter ${op.targetDiameter} is not below stock radius ${r0} — nothing to face`,
    );
  }

  const span = Math.abs(op.xEnd - op.xStart);
  if (span <= 0) throw new Error('xStart and xEnd must differ');

  // TOOL-CENTER PATH BOUNDS (Alice, 2026-10-27 "cutting too far" report):
  // a path centered on xStart/xEnd overhangs the defined span by the tool
  // radius at both ends — the flute cuts past the line. With tail stock
  // cut-over OFF the defined span is the FINISHED FACE (the rotary-pocket
  // rule): inset the tool-center travel by toolR so the flute's EDGE cuts
  // exactly to the line. With cut-over ON the overhang is the point —
  // the raw path bounds stand.
  const toolR = tool.diameter / 2;
  const pathX0 = op.cutBeyondStock
    ? op.xStart
    : Math.min(op.xStart + toolR, op.xEnd - toolR);
  const pathX1 = op.cutBeyondStock
    ? op.xEnd
    : Math.max(op.xEnd - toolR, pathX0);
  const pathSpan = Math.abs(pathX1 - pathX0);

  // The depth ladder (Alice's rule, 2026-10-28): every step ≤ stepDown, the
  // rough ladder lands EXACTLY ON the rough target (totalDepth − allowance —
  // "you always go entirely to your target depth"), a final SHORTER
  // remainder step when the last whole step-down falls short, never a step
  // past it, and the finish then takes exactly the allowance band ("leave
  // only allowance at the bottom, no more or less" — one level when
  // allowance ≤ stepDown, itself laddered if it ever exceeds it). Same
  // shape with no allowance: the rough ladder ends at totalDepth and its
  // last level IS the finishing pass. The old ladder stopped BELOW the
  // target (last whole k·stepDown) and let the finish jump the remainder
  // + allowance in one step — larger than the step-down whenever the two
  // summed over it (e.g. depth 4.15, step 0.8, allowance 0.2 → a 0.95
  // finish step), which must never happen.
  const roughTarget = Math.max(totalDepth - op.finishAllowance, 0);
  const roughDepths: number[] = [];
  for (let k = 1; k * op.stepDown < roughTarget - 1e-9; k++) roughDepths.push(k * op.stepDown);
  if (roughTarget > 0) roughDepths.push(roughTarget); // the remainder step, ≤ stepDown
  const finishDepths: number[] = [];
  if (op.finishAllowance > 1e-9) {
    // the allowance band, laddered at ≤ stepDown (one level in the normal case)
    let d = roughTarget;
    while (totalDepth - d > op.stepDown + 1e-9) {
      d += op.stepDown;
      finishDepths.push(d);
    }
    finishDepths.push(totalDepth);
  } // else: the rough ladder already ends at totalDepth — its last level is the finish
  // FINISHING PASS ONLY (Alice, 2026-10-26): skip the roughing ladder —
  // one pass straight to the target Ø (the step-down and finish allowance
  // are meaningless without roughing; the op assumes the bulk is gone).
  const depths = op.finishingOnly ? [totalDepth] : [...roughDepths, ...finishDepths];

  const stepOver = op.stepOver;
  const revs = pathSpan / stepOver;
  const aAdvance = revs * 360;
  const passMinutes = revs / MAX_ROTARY_RPM;
  const aSign = op.rotation === 'cw' ? 1 : -1;
  /** one full revolution, minutes — the entry/exit rings' cost
   *  (1/MAX_ROTARY_RPM) and the rate the post times A-only cuts at */
  const ringMinutes = 1 / MAX_ROTARY_RPM;

  // Z0 is the stock center (axis datum); the surface sits at axisZ + r0
  const surfaceZ = axisZ + r0;
  const safeZ = surfaceZ + (op.clearance ?? SAFE_CLEARANCE);
  const moves: Move[] = [];
  let a = startA; // accumulated machine A, degrees (post emits G92.4 A0 afterwards)
  let minutes = 0;
  let passIndex = 0; // global: horizontal X zigzags across levels
  const rings = ringPositions(pathX0, pathX1, stepOver);

  /** entry/exit EDGE RINGS (Alice, 2026-10-27): with tail stock cut-over
   *  OFF, every level opens and closes with a full 360° A ring at passZ —
   *  a rotary pocket: the helical entry then descends into PRE-CLEARED
   *  material at a fixed X (no helical groove scarred into the end wall),
   *  and the closing ring squares the far edge. With cut-over ON the
   *  overhang is the point — dive straight in and out of the spiral. */
  const edgeRings = !op.cutBeyondStock;

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
      // last one ended — no wasted rapids. PATH bounds (tool-center, inset
      // by toolR with cut-over off — see pathX0/pathX1): the flute's EDGE,
      // not its center, cuts to the defined line.
      const sweepStart = i % 2 === 0 ? pathX0 : pathX1;
      const sweepEnd = i % 2 === 0 ? pathX1 : pathX0;

      // approach once; afterwards depth steps happen in the cut at the
      // sweep ends, retracting only after the final level. Axis-separate
      // rapids (see thread) — and the spiral has no pattern phase: it just
      // starts turning from wherever the axis sits (startA), so there is
      // no positioning rotation to make.
      if (i === 0) {
        // travel first at the machine's existing height (after a tool
        // change, the swap macro's high park — never a low diagonal
        // descent), then descend at the destination
        moves.push({ words: { x: sweepStart }, feed: 0, rapid: true, comment: passComment });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      }

      // helical entry / in-cut step down, then the sweep. The sweep RETRACES
      // the helix: the return sweep rotates BACK along the groove (like the
      // thread and spiral-carve levels), so A oscillates around the phase
      // instead of piling up another aAdvance per level — the machine never
      // winds up to levels×(aAdvance+90) and has to unwind it afterwards.
      if (edgeRings) {
        // EDGE RINGS (Alice, 2026-10-27 — the rotary-pocket rule): the tool
        // first descends to THIS level's passZ at the entry X (a straight
        // plunge — at most one increment deep into pre-cleared material:
        // everything above was ring-cleared last level), then one full 360°
        // A ring at that fixed X brings the WHOLE circumference to passZ.
        // Only then does the helical entry/sweep run — and every point it
        // reaches is already pre-cleared AT THIS DEPTH, so no helical
        // groove is scarred into the end wall; the entry edge stands sharp
        // and flush. (A ring at the machine's current Z would clear air on
        // level 1 and redundantly re-cut the previous level afterwards.)
        // ADVANCE-BEFORE-PUSH (committee #5's wisp verdict): each ring move
        // must carry its OWN +360° target — a push at the stale `a` is a
        // dead move whose rotation the NEXT level's entry ring absorbs at
        // one step-down too deep (the end wedges engaged at up to 2× the
        // step-down; the sim flagged it yellow — honest paint of a
        // toolpath defect, not an artifact).
        moves.push({
          words: { z: passZ },
          feed: op.plungeFeed, // G94 mm/min, A stationary
          comment: `plunge ${increment.toFixed(3)}mm radial`,
        });
        a += aSign * 360;
        moves.push({
          words: { a },
          feed: ROTARY_FEED_DEG_MIN,
          comment: `entry ring 360° at X${sweepStart.toFixed(1)} — squaring the edge`,
        });
        minutes += increment / op.plungeFeed + ringMinutes;
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

      const forward = i % 2 === 0;
      a += forward ? aSign * aAdvance : -aSign * aAdvance;
      moves.push({
        words: { x: sweepEnd, a },
        feed: 1 / passMinutes, // G93 inverse time
        comment: isFinish ? undefined : `rough to r=${(r0 - depth).toFixed(3)}`,
      });

      if (edgeRings) {
        // closing ring: the exit edge squared at passZ too — the level
        // enters AND exits through ring-cleared circumference.
        // ADVANCE-BEFORE-PUSH, same as the entry ring: a push at the
        // stale `a` never rotates — the committee #5 wisp mechanism
        // (the sim's yellow curve-inwards at both ends).
        a += aSign * 360;
        moves.push({
          words: { a },
          feed: ROTARY_FEED_DEG_MIN,
          comment: `exit ring 360° at X${sweepEnd.toFixed(1)} — squaring the edge`,
        });
        minutes += ringMinutes;
      }

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
        // travel first at the machine's existing height (after a tool
        // change, the swap macro's high park — never a diagonal descent
        // across the table), then descend at the destination
        moves.push({
          words: { x: xs[0] },
          feed: 0,
          rapid: true,
          comment: `${passComment} — ${xs.length} rings`,
        });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
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
      minutes += increment / op.plungeFeed + xs.length / MAX_ROTARY_RPM + pathSpan / op.feed;
    } else {
      // Indexed passes: a full X sweep at each A, stepping A by the
      // step-over arc at the swept radius. X zigzags so A only ever advances
      // one way (it accumulates across levels; the post wraps via G92.4).
      const stepDeg = (op.stepOver / (r0 - depth)) * (180 / Math.PI);
      const n = Math.ceil(360 / stepDeg);
      for (let k = 0; k < n; k++) {
        const forward = passIndex % 2 === 0;
        // path bounds (tool-center, inset by toolR with cut-over off — see
        // pathX0/pathX1): the flute's edge, not its center, cuts to the line
        const sweepStart = forward ? pathX0 : pathX1;
        const sweepEnd = forward ? pathX1 : pathX0;
        // axis-separate repositioning (see thread): rotate in place and
        // travel at the machine's existing height (after a tool change,
        // the swap macro's high park), THEN descend — a coordinated
        // X+Z+A rapid runs the whole traverse at the rotary clamp rate
        moves.push({
          words: { a },
          feed: 0,
          rapid: true,
          comment: k === 0 ? `${passComment} — ${n} indexed passes` : undefined,
        });
        moves.push({ words: { x: sweepStart }, feed: 0, rapid: true });
        if (passIndex === 0) moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
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
        minutes += increment / op.plungeFeed + pathSpan / op.feed;
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