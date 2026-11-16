/**
 * Spiral carving — the wrapped-groove family's first member (PLAN.md
 * Phase 2): helical grooves cut into a cylinder about the stock axis.
 *
 * Each strand is ONE helix at the op's angle off the circumferential
 * direction: as X sweeps the operating area, A advances
 * (span / (2πR·tan(angle)))·360°. `count` strands sit evenly around
 * 360° (multi-start, like the thread spec).
 *
 * THE WIDTH CONTRACT (Alice, 2026-11-16): a groove wider than the tool
 * must come out EXACTLY as if a single pass of a Ø=width tool had cut
 * it — flat sides, rounded ends, nothing left standing in the middle
 * (the reported hollow-tube spiral through-cut). That shape is the
 * tool-center path's stadium swept by a Ø=width disc; this tool covers
 * it the way slot milling always has:
 *  - parallel helix CHANNELS at perpendicular offsets across
 *    (width − cutW)/2, spaced ≤ cutW (the tool's honest surface cut
 *    width — full Ø for a flat, the depth chord for a ball, the cone
 *    opening for a V-bit — so ball/V grooves fill too, with their own
 *    wall profile), each channel's sweep EXTENDED onto the inset slot's
 *    end circles so the slot's rounded ends fill from the inside;
 *  - one CAP ARC around each end (the tool center rides the inset
 *    circle, radius (width−cutW)/2) so the rounded ends are cut, not
 *    left as the standing crescent straight channels cannot reach.
 * `width` 0 means no fan at all — the pass just follows the line and
 * the groove is whatever the tool cuts (knurling with a V-bit, where
 * the real width knob is depth); a width ≤ the tool's cut width is the
 * same single pass. `depth` is reached through a step-down ladder whose
 * levels RETRACE the same pass polyline — level walks alternate
 * direction with A returning along the groove, so every level deepens
 * the identical 3D curve, never a mirror of it.
 *
 * Perpendicular offsets decompose into BOTH an axial shift and an A
 * phase shift (a parallel helix is offset in the developed surface, not
 * just along X) — the old axial-only fan squeezed the groove by
 * cos(angle) and could leave the middle standing.
 *
 * G93 for every X+A coordinated segment (F = 1/segment-minutes from the
 * rotary limit); pure-X sweeps (a 90° spiral) run G94. Plunges and
 * re-positioning run G94. Entry is a straight plunge at each pass's
 * start. A accumulates; the post wraps with G92.4.
 */

import type { Move, RotaryCalibration, SpiralCarveOp, Tool } from '../core/types';
import { MAX_ROTARY_RPM, SAFE_CLEARANCE, shortestATo } from './faceCylinder';

export interface SpiralCarveResult {
  moves: Move[];
  /** total cutting passes (strands × [channels + cap arcs] × levels) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/**
 * The tool's honest cut width at the SURFACE for a groove `depth` deep —
 * the number the channel spacing must never exceed:
 * - flat/bull/corn/drill/laser: the full Ø;
 * - ball: the chord the sphere opens at depth (full Ø once depth ≥ R);
 * - vbit: the cone's opening, tip + 2·depth·tan(v/2) (full Ø past the
 *   cone; a record with no tip angle falls back to the flat assumption).
 */
export function slotToolWidth(tool: Tool, depth: number): number {
  const d = tool.diameter;
  switch (tool.type) {
    case 'ball': {
      const r = d / 2;
      if (depth >= r) return d;
      return 2 * Math.sqrt(Math.max(0, r * r - (r - depth) * (r - depth)));
    }
    case 'vbit': {
      if (!tool.vAngle || tool.vAngle < 20 || tool.vAngle > 180) return d;
      const half = ((tool.vAngle / 2) * Math.PI) / 180;
      return Math.min(d, (tool.tipDiameter ?? 0) + 2 * depth * Math.tan(half));
    }
    default:
      return d;
  }
}

/** A pass the tool runs: a polyline of (x, A) at the SURFACE, walked at
 * each ladder level, alternating direction so levels retrace. `a` values
 * are offsets from the strand's base A (degrees) — the emitter adds the
 * running machine A, so multi-wrap accumulation behaves like the sweeps
 * always have. */
export interface SlotPass {
  pts: { x: number; a: number }[];
}

/** Arc tessellation sagitta, mm — the caps are short; 0.05 keeps them
 * visibly smooth at every practical radius. */
const CAP_SAGITTA = 0.05;
/** fewest cap chords — degenerate tiny caps still cut a round end */
const CAP_MIN_STEPS = 6;

/**
 * The pass set for ONE strand of the slot: the channels (perpendicular
 * fan, sweeps extended onto the inset end circles) plus, when the tool
 * is narrower than the slot, the two cap arcs that finish the rounded
 * ends. Shared by the emitter and the preview marks — the drawn slot is
 * always the cut slot.
 */
export function slotPasses(
  op: SpiralCarveOp,
  effWidth: number,
): { passes: SlotPass[]; channels: number; caps: number } {
  const span = Math.abs(op.xEnd - op.xStart);
  const alpha = (op.spiralAngle * Math.PI) / 180;
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);
  const r = op.surfaceDiameter / 2;
  const degPerMm = 180 / (Math.PI * r); // developed arc mm → degrees
  const L = span / sinA; // center path length in the developed surface
  const aSign = op.rotation === 'cw' ? 1 : -1;

  // developed (x, arc) → the surface coordinates the emitter speaks
  // channel offset p (perpendicular): start = S + p·n̂, n̂ = (−cosα, sinα)
  const point = (t: number, p: number): { x: number; a: number } => ({
    x: op.xStart - p * cosA + t * sinA,
    a: aSign * (p * sinA + t * cosA) * degPerMm,
  });

  if (op.width <= effWidth) {
    // the tool alone IS the wide tool: one pass, its own rounded ends
    return {
      passes: [{ pts: [point(0, 0), point(L, 0)] }],
      channels: 1,
      caps: 0,
    };
  }

  const h = (op.width - effWidth) / 2; // the inset stadium's cap radius
  const n = Math.ceil(op.width / effWidth);
  const passes: SlotPass[] = [];

  // channels at perpendicular offsets across [−h, +h]
  const perp = (k: number) => -h + (k * 2 * h) / (n - 1);
  for (let k = 0; k < n; k++) {
    const p = perp(k);
    const cap = Math.sqrt(Math.max(0, h * h - p * p));
    passes.push({ pts: [point(-cap, p), point(L + cap, p)] });
  }

  // cap arcs: the tool center rides the inset circle around each path
  // end, from one outermost channel's endpoint to the other's — the
  // rounded end a straight channel cannot reach. γ ∈ [−90°, +90°]
  // measures from the along-path direction toward +perpendicular; the
  // START cap bulges BEHIND the path start, the END cap past its end.
  const steps = Math.max(
    CAP_MIN_STEPS,
    Math.ceil(Math.PI / (2 * Math.acos(Math.max(0, 1 - CAP_SAGITTA / h)))),
  );
  const capArc = (behind: boolean): SlotPass => {
    const pts: { x: number; a: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const g = -Math.PI / 2 + (i * Math.PI) / steps;
      // end cap: L + h·cosγ ∈ [L, L+h]; start cap: −h·cosγ ∈ [−h, 0] —
      // both meet the outer channels exactly at γ = ±90°
      const along = behind ? -h * Math.cos(g) : L + h * Math.cos(g);
      const p = h * Math.sin(g);
      pts.push(point(along, p));
    }
    return { pts };
  };
  const endCap = capArc(false);
  const startCap = capArc(true);
  // the start cap connects the OTHER two outer endpoints — reverse it
  // so the polyline runs from the +h channel's start to the −h one's
  startCap.pts.reverse();
  passes.push(endCap, startCap);

  return { passes, channels: n, caps: 2 };
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
  /** the tool's honest surface cut width (slotToolWidth) — the channel
   * spacing limit. Absent = the tool is a full-Ø cutter (flat). */
  effWidth: number = toolDiameter,
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
  if (effWidth <= 0) throw new Error('the tool cuts nothing at this depth');
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
  const surfaceZ = axisZ + r;
  const safeZ = surfaceZ + (op.clearance ?? SAFE_CLEARANCE);
  // Per-level G93 timing: each segment's true path length at the CURRENT
  // cutting radius (r − depth) — `feed` means the surface speed AT the
  // cut, held constant across the ladder, never above the rotary
  // ceiling. Pure-X segments (an axial channel) have no rotation: plain
  // G94 at op.feed.
  const segmentMinutes = (depth: number, dx: number, daDeg: number): number => {
    if (Math.abs(daDeg) < 1e-9) return Math.abs(dx) / op.feed;
    const arc = (Math.abs(daDeg) * Math.PI) / 180 * (r - depth);
    return Math.max(
      Math.hypot(arc, dx) / op.feed,
      Math.abs(daDeg) / 360 / MAX_ROTARY_RPM,
    );
  };
  const levels = depthLadder(op.depth, op.stepDown);
  const { passes: passSet, channels } = slotPasses(op, Math.max(effWidth, 1e-6));

  const moves: Move[] = [];
  let a = startA; // accumulated machine A; the post wraps with G92.4
  let minutes = 0;
  let passes = 0;
  let entered = false; // the descent-after-travel runs on the first entry only

  for (let s = 0; s < op.count; s++) {
    // the strand's pattern phase: datum + spin + its share of the circle.
    // The first pass of the strand starts there (offsets may shift it a
    // few degrees) — positioning is always the shortest rotation.
    const phase = datumAngle + (op.spin ?? 0) + s * (360 / op.count);
    const first = passSet[0].pts[0];
    a += shortestATo(phase + first.a, a);

    passSet.forEach((pass, pi) => {
      const pts = pass.pts;
      const isCap = channels > 1 && pi >= channels;
      // axis-separate positioning (see thread/faceCylinder): rotate in
      // place and travel at the machine's existing height, THEN descend
      const enter = pts[0];
      a += shortestATo(phase + enter.a, a);
      moves.push({
        words: { a },
        feed: 0,
        rapid: true,
        comment:
          channels > 1
            ? isCap
              ? pi === channels
                ? `strand ${s + 1}/${op.count}, end cap — the rounded slot end`
                : `strand ${s + 1}/${op.count}, start cap — the rounded slot end`
              : `strand ${s + 1}/${op.count}, channel ${pi + 1}/${channels}`
            : undefined,
      });
      moves.push({ words: { x: enter.x }, feed: 0, rapid: true });
      if (!entered) {
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        entered = true;
      }
      levels.forEach((depth, li) => {
        const passZ = surfaceZ - depth;
        const increment = li === 0 ? depth : depth - levels[li - 1];
        // straight plunge at the pass start on level 0 (the groove start
        // mark), the in-cut level step at the previous walk's end after
        moves.push({
          words: { z: passZ },
          feed: op.plungeFeed,
          comment: li === 0 ? `plunge to ${depth.toFixed(2)}mm deep` : undefined,
        });
        minutes += increment / op.plungeFeed;
        // the walk alternates direction; A returns along the groove so
        // every level retraces the same polyline
        const forward = li % 2 === 0;
        const seq = forward ? pts : [...pts].reverse();
        for (let i = 1; i < seq.length; i++) {
          const from = seq[i - 1];
          const to = seq[i];
          const dx = to.x - from.x;
          const da = to.a - from.a;
          const coordinated = Math.abs(da) > 1e-9;
          a += da;
          const segMin = segmentMinutes(depth, dx, Math.abs(da));
          moves.push({
            words: coordinated
              ? { x: to.x, a }
              : { x: to.x },
            feed: coordinated ? 1 / segMin : op.feed,
          });
          minutes += segMin;
        }
        passes++;
      });
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    });
  }

  return { moves, passes, estimatedMinutes: minutes };
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

// ------------------------------------------------------------- preview

/** The slot's passes as 3D points for the setup display: each strand's
 * channel and cap polylines sampled at the cut radius, in the PART-LOCAL
 * (A=0) frame — the viewport's datum rotation carries them with the
 * part. datumAngle + op.spin shift the strand phases exactly like
 * generation (the drawn slot is always the cut slot). */
export function sampleSpiralMarks(
  op: SpiralCarveOp,
  calibration: RotaryCalibration,
  toolDiameter: number,
  datumAngle: number,
  effWidth: number = toolDiameter,
): { x: number; y: number; z: number }[][] {
  const { axisZ } = calibration;
  const r = Math.max(op.surfaceDiameter / 2 - op.depth, op.surfaceDiameter / 4);
  const { passes } = slotPasses(op, Math.max(effWidth, 1e-6));
  const marks: { x: number; y: number; z: number }[][] = [];
  for (let s = 0; s < op.count; s++) {
    // identical phase formula to spiralCarve() — preview and generation
    // angle conventions must never disagree (pinned iron finding)
    const phase = datumAngle + (op.spin ?? 0) + s * (360 / op.count);
    for (const pass of passes) {
      const pts: { x: number; y: number; z: number }[] = [];
      const src = pass.pts;
      for (let i = 0; i < src.length; i++) {
        // ~15° chords like the toolpath preview: interpolate long channel
        // segments, keep the caps' own tessellation
        const from = src[i];
        const last = i === src.length - 1;
        const to = last ? from : src[i + 1];
        const segDeg = Math.abs(to.a - from.a);
        const steps = last ? 1 : Math.max(1, Math.ceil(segDeg / 15));
        for (let j = 0; j < steps; j++) {
          const t = j / steps;
          // the point's A is an offset from the strand phase (aSign
          // already baked in); the preview's validated angle convention
          // (toolpathPreview toDisplay): part angle θ at y = +r·sin(θ)
          const ang = (((phase + from.a + t * (to.a - from.a)) * Math.PI) / 180);
          pts.push({
            x: from.x + t * (to.x - from.x),
            y: r * Math.sin(ang),
            z: axisZ + r * Math.cos(ang),
          });
        }
      }
      marks.push(pts);
    }
  }
  return marks;
}
