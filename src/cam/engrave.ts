/**
 * Engrave — follow imported artwork line work at depth (docs/PLAN.md
 * "Engrave + artwork import"): the centerline IS the path, no tool
 * offset, which is what makes this engraving rather than profiling.
 *
 * One generator core, two frame mappers (the spec's key property):
 * FLAT maps (U,V) → machine (X,Y) on a plane, plain G94 at the cut
 * feed; WRAPPED maps the cylinder canvas — (U,V) = (mm around, mm
 * axial) → (A, X), θ = U/R — and times every segment from whichever
 * constraint binds: surface length at the feed, or the rotary limit.
 * The diameter couples them — a pure-circumferential move caps at
 * MAX_ROTARY_RPM × π·Ø mm/min of surface speed (Ø16 ≈ 330, the
 * measured spiral-groove regime). Coordinated X+A segments run G93
 * with F = 1/minutes; A-only segments G94 at ROTARY_FEED_DEG_MIN;
 * pure-axial segments G94 at the feed.
 *
 * Depth climbs a step-down ladder whose levels RETRACE the same path
 * (sweeps alternate, like the spiral ops, so plunges land at each end
 * in turn). Plunges at path starts run straight at fixed A. A
 * accumulates; the post wraps with G92.4.
 */

import type { Move } from '../core/types';
import { MAX_ROTARY_RPM, ROTARY_FEED_DEG_MIN, shortestATo } from './faceCylinder';

/** flat: cut the line work on a plane */
export interface EngraveFlatFrame {
  kind: 'flat';
  /** machine Z of the surface being engraved */
  surfaceZ: number;
}

/** wrapped: cut into the stock cylinder — U (around) maps to A, V (axial) to X */
export interface EngraveWrappedFrame {
  kind: 'wrapped';
  /** cut radius, mm (surfaceDiameter/2) */
  radius: number;
  /** machine Z of the cylinder surface (axisZ + radius) */
  surfaceZ: number;
  /** angular origin: the artwork's U=0 sits at the index datum */
  datumAngle: number;
  /** the machine's accumulated A when this op starts — phase positioning
   * takes the shortest rotation from it, never unwinding the pile */
  startA: number;
}

export interface EngraveParams {
  id: string;
  toolId: string;
  /** line work in frame space, mm ON THE SURFACE: flat = machine XY,
   * wrapped = (U around, V axial). Each path is traced start → end. */
  paths: { x: number; y: number }[][];
  /** cut depth below the surface, mm (ignored when `laser` is set) */
  depth: number;
  /** depth-per-level ladder, mm (ignored when `laser` is set) */
  stepDown: number;
  /** surface cut feed, mm/min (G94; wrapped segments may run slower) */
  feed: number;
  /** straight-plunge feed at path starts, mm/min (ignored when `laser`) */
  plungeFeed: number;
  /** rapid clearance above the surface, mm (ignored when `laser`) */
  clearance: number;
  frame: EngraveFlatFrame | EngraveWrappedFrame;
  /** LASER (docs/makera-dialect.md "Laser job"): single pass riding at
   * `focus` above the surface — no plunge, no depth ladder, no clearance
   * lifts; the beam is the modal S word on G1s, so each path's first cut
   * stamps `power` (0–1) and a bare-power move extinguishes (S0) before
   * travels. G0 never fires. */
  laser?: { focus: number; power: number };
}

export interface EngraveResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** the slowest cutting segment's surface speed, mm/min — below
   * `feed` when the rotary limit binds: the honest summary number */
  effectiveFeed: number;
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

export function engrave(op: EngraveParams): EngraveResult {
  if (op.paths.length === 0) throw new Error('engrave needs at least one path');
  op.paths.forEach((p, i) => {
    if (p.length < 2) throw new Error(`path ${i + 1} needs at least two points`);
  });
  if (op.feed <= 0) throw new Error('feed must be positive');
  if (op.laser) return engraveLaser(op);
  if (op.depth <= 0) throw new Error('depth must be positive');
  if (op.stepDown <= 0) throw new Error('stepDown must be positive');
  if (op.plungeFeed <= 0) throw new Error('plungeFeed must be positive');

  const wrapped = op.frame.kind === 'wrapped';
  const R = wrapped ? (op.frame as EngraveWrappedFrame).radius : 0;
  if (wrapped && R <= 0) throw new Error('radius must be positive');
  const degPerMm = wrapped ? 180 / (Math.PI * R) : 0;
  const safeZ = op.frame.surfaceZ + op.clearance;
  const levels = depthLadder(op.depth, op.stepDown);

  const moves: Move[] = [];
  let minutes = 0;
  /** slowest segment's surface speed — starts at the requested feed */
  let effective = op.feed;
  let a = wrapped ? (op.frame as EngraveWrappedFrame).startA : 0;
  let lifted = false;
  const lift = () => {
    if (!lifted) {
      moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
      lifted = true;
    }
  };

  for (const path of op.paths) {
    // axis-separate positioning (see thread/spiralCarve): a coordinated
    // rapid runs at the rotary clamp rate. Position first at the
    // machine's existing height (after a tool change that is the swap
    // macro's high park — never a diagonal descent), then descend
    if (wrapped) {
      const frame = op.frame as EngraveWrappedFrame;
      a += shortestATo(frame.datumAngle + path[0].x * degPerMm, a);
      moves.push({
        words: { a },
        feed: 0,
        rapid: true,
        comment: `path start, A${a.toFixed(2)}`,
      });
      moves.push({ words: { x: path[0].y }, feed: 0, rapid: true });
      lift();
    } else {
      moves.push({ words: { x: path[0].x, y: path[0].y }, feed: 0, rapid: true });
      lift();
    }

    levels.forEach((depth, li) => {
      const passZ = op.frame.surfaceZ - depth;
      const increment = li === 0 ? depth : depth - levels[li - 1];
      moves.push({
        words: { z: passZ },
        feed: op.plungeFeed,
        comment: li === 0 ? `plunge to ${depth.toFixed(2)}mm deep` : `level ${li + 1}/${levels.length}`,
      });
      minutes += increment / op.plungeFeed;
      // levels retrace: sweeps alternate, so each level's plunge lands
      // at the end the previous sweep reached
      const forward = li % 2 === 0;
      const n = path.length;
      const at = (i: number) => (forward ? i : n - 1 - i);
      for (let i = 0; i < n - 1; i++) {
        const p0 = path[at(i)];
        const p1 = path[at(i + 1)];
        if (wrapped) {
          const dA = (p1.x - p0.x) * degPerMm;
          const dX = p1.y - p0.y;
          // depth-aware: the segment's true length at the CURRENT cutting
          // radius (R − depth) — the circumferential part shrinks as the
          // groove deepens, so `feed` and `effectiveFeed` mean the surface
          // speed AT the cut, constant across the ladder
          const rc = R - depth;
          const len = Math.hypot((rc / R) * (p1.x - p0.x), dX);
          if (Math.abs(dA) < 1e-12 && Math.abs(dX) < 1e-12) continue;
          a += dA;
          if (Math.abs(dA) < 1e-12) {
            // pure axial: G94 at the cut feed
            moves.push({ words: { x: p1.y }, feed: op.feed });
            minutes += Math.abs(dX) / op.feed;
          } else if (Math.abs(dX) < 1e-12) {
            // A-only: G94 at the rotary limit, deg/min — the machine's A
            // rate is the constraint here; the honest effective number
            // still reads at the cutting radius
            moves.push({ words: { a }, feed: ROTARY_FEED_DEG_MIN });
            minutes += Math.abs(dA) / ROTARY_FEED_DEG_MIN;
            effective = Math.min(effective, len / (Math.abs(dA) / ROTARY_FEED_DEG_MIN));
          } else {
            // coordinated X+A: G93 inverse-time from the binding
            // constraint — true length at the cut at the feed, or the
            // rotary rate
            const t = Math.max(len / op.feed, (Math.abs(dA) / 360) / MAX_ROTARY_RPM);
            moves.push({ words: { x: p1.y, a }, feed: 1 / t });
            minutes += t;
            effective = Math.min(effective, len / t);
          }
        } else {
          const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          if (len < 1e-12) continue;
          moves.push({ words: { x: p1.x, y: p1.y }, feed: op.feed });
          minutes += len / op.feed;
        }
      }
    });
    // lift above the surface for the rapid to the next path
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    lifted = true;
  }

  return { moves, estimatedMinutes: minutes, effectiveFeed: effective };
}
/**
 * The LASER variant (docs/makera-dialect.md "Laser job"): single pass,
 * the head riding at `focus` above the surface — no plunge, no depth
 * ladder, no clearance lifts; the beam is the modal S word on G1s, so
 * each path's first cut stamps the power and a bare G1 (power 0)
 * extinguishes before the travel. The post brackets the op with
 * M321/M322 and arms the beam (M3) after the focus-height DESCENT.
 *
 * DELIBERATE divergence from Makera's example (Alice, 2026-10-23): their
 * sequence drops to focus height FIRST and then travels at that height;
 * the 5W module is bulky and barely cleared the 4th-axis tail holding on
 * coupon #2 — the approach travel runs at the machine's existing height
 * instead (the module-swap position, or the previous op's retract) and Z
 * descends to focus only over the first path's start. Makera's intent —
 * the beam never armed before focus height — is kept: the post arms M3
 * after the first Z-bearing move, whichever position it lands at.
 */
function engraveLaser(op: EngraveParams): EngraveResult {
  const { focus, power } = op.laser!;
  if (focus < 0) throw new Error('laser focus must not be negative');
  if (power <= 0 || power > 1) throw new Error('laser power must be within (0, 1]');
  const wrapped = op.frame.kind === 'wrapped';
  const R = wrapped ? (op.frame as EngraveWrappedFrame).radius : 0;
  if (wrapped && R <= 0) throw new Error('radius must be positive');
  const degPerMm = wrapped ? 180 / (Math.PI * R) : 0;
  const passZ = op.frame.surfaceZ + focus;

  const moves: Move[] = [];
  let minutes = 0;
  let effective = op.feed;
  let a = wrapped ? (op.frame as EngraveWrappedFrame).startA : 0;

  op.paths.forEach((path, pi) => {
    if (pi > 0) {
      // extinguish before the travel: a bare G1 with S0 (no axis words;
      // the feed is unchanged so no F — the modal state carries)
      moves.push({ words: {}, feed: op.feed, power: 0 });
    }
    // position at the machine's EXISTING height first — the approach
    // travel must not cross the work envelope low (the module swap /
    // previous op left the Z somewhere safe; the head is bulky)
    if (wrapped) {
      const frame = op.frame as EngraveWrappedFrame;
      a += shortestATo(frame.datumAngle + path[0].x * degPerMm, a);
      moves.push({ words: { a }, feed: 0, rapid: true });
      moves.push({ words: { x: path[0].y }, feed: 0, rapid: true });
    } else {
      moves.push({ words: { x: path[0].x, y: path[0].y }, feed: 0, rapid: true });
    }
    if (pi === 0) {
      // the ONE Z move of the op — descend to focus height over the first
      // path's start, after the travel. The post arms M3 after it; from
      // here the beam can only meet the surface, never the approach
      moves.push({ words: { z: passZ }, feed: 0, rapid: true, comment: 'laser focus height' });
    }
    let first = true;
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i];
      const p1 = path[i + 1];
      if (wrapped) {
        const dA = (p1.x - p0.x) * degPerMm;
        const dX = p1.y - p0.y;
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (Math.abs(dA) < 1e-12 && Math.abs(dX) < 1e-12) continue;
        a += dA;
        const stamp = first ? { power } : {};
        if (Math.abs(dA) < 1e-12) {
          moves.push({ words: { x: p1.y }, feed: op.feed, ...stamp });
          minutes += Math.abs(dX) / op.feed;
        } else if (Math.abs(dX) < 1e-12) {
          moves.push({ words: { a }, feed: ROTARY_FEED_DEG_MIN, ...stamp });
          minutes += Math.abs(dA) / ROTARY_FEED_DEG_MIN;
          effective = Math.min(effective, len / (Math.abs(dA) / ROTARY_FEED_DEG_MIN));
        } else {
          const t = Math.max(len / op.feed, (Math.abs(dA) / 360) / MAX_ROTARY_RPM);
          moves.push({ words: { x: p1.y, a }, feed: 1 / t, ...stamp });
          minutes += t;
          effective = Math.min(effective, len / t);
        }
      } else {
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        if (len < 1e-12) continue;
        moves.push({ words: { x: p1.x, y: p1.y }, feed: op.feed, ...(first ? { power } : {}) });
        minutes += len / op.feed;
      }
      first = false;
    }
  });
  // the last path ends beam-on: extinguish — the example's `G1 S0`
  // right before the M05/M322 tail
  moves.push({ words: {}, feed: op.feed, power: 0 });
  return { moves, estimatedMinutes: minutes, effectiveFeed: effective };
}
