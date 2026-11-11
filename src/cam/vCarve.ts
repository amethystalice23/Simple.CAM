/**
 * V-carve on the rotary (4-axis) — a V-bit following a constant-radius
 * chain (docs/PLAN.md "chain-following chamfer", extended per Alice's
 * 2026-11-08 ruling: the V-carve IS this mechanism — "a v-carve in
 * 4-axis instead of 3"): the tool follows the chain's silhouette around
 * the stock at a depth, which is exactly what `engrave`'s WRAPPED frame
 * cuts. No new motion machinery here — this module DEVELOPS the chain
 * into wrapped-engrave paths:
 *
 * - U (around) = θ·R, θ = atan2(y, z − axisZ) unwrapped CONTINUOUSLY in
 *   loop order (the engrave job-unwrap precedent: a silhouette crossing
 *   the ±180° seam keeps rotating through it — the post re-zeros A with
 *   G92.4, the seam is no boundary);
 * - V (axial) = the point's X (4th axis ∥ X, machine X);
 * - frame radius = the chain's meanRadius — the Pass-4 detector admits a
 *   loop only when every vertex sits within RADIAL_TOL (0.1mm) of one
 *   radial distance from the STOCK axis, so the development is exact to
 *   that tolerance and the depth read at the surface is honest.
 *
 * Depth semantics ride engrave's: the ladder descends from the chain's
 * surface (a chamfer anchors at the surface radius and cuts down; depth 0
 * would engrave nothing, so it is refused). Segment timing is engrave's:
 * depth-aware lengths at the CURRENT cut radius, G93 X+A per segment with
 * F = 1/t, A-only moves G94 at ROTARY_FEED_DEG_MIN.
 *
 * The Y-fixed X+A mechanism (Alice's adjudication, 2026-11-08): the tool
 * stays over the stock axis and the SURFACE rotates under it, so the
 * tool axis stays normal to the cut — the chamfer angle and depth are
 * uniform all the way around, unlike an A-locked XYZ trace whose
 * effective angle varies with θ. Zero chordal error: A interpolates
 * linearly per move, so each move traces the developed chain segment
 * exactly (a linear XYZ chord would dip r·(1−cos(Δθ/2)) inside the
 * surface — the reason densifyWrappedPath exists).
 */

import type { Move, Vec3 } from '../core/types';
import { engrave, type EngraveParams } from './engrave';

/** ONE chain's developed wrapped paths: U (around) × V (axial), mm on the
 * surface at the chain's radius. Loop order preserved — the chain is a
 * closed loop, so the engrave pass ends where it started (same U). */
export interface DevelopedChain {
  /** the developed loop, closed (first point repeats as last) */
  path: { x: number; y: number }[];
  /** the chain's mean radius about the stock axis, mm */
  radius: number;
}

/** Develop one chain's model-space ring into wrapped-engrave (U, V).
 * `axisZ` is the stock axis's machine Z (machine X is the axis
 * direction — 4th axis ∥ X). The ring is CLOSED: the detected loop does
 * not repeat its first vertex, so the developed path appends it — the
 * engrave pass closes the loop back at its start. */
export function developChain(
  points: Vec3[],
  meanRadius: number,
  axisZ: number,
): DevelopedChain {
  const circ = 2 * Math.PI * meanRadius;
  const path: { x: number; y: number }[] = [];
  let uPrev = 0;
  const ring = [...points, points[0]]; // close the loop
  ring.forEach((p, i) => {
    const th = Math.atan2(p.y, p.z - axisZ);
    let u = (th / (2 * Math.PI)) * circ;
    if (i > 0) {
      // unwrap continuously: each step takes the short way around, so a
      // densely-sampled silhouette never folds (the engrave unwrap
      // precedent — real chain points sample densely). A ring wrapping
      // the full 360° unwraps to U ∈ [0, circ) monotonically and closes
      // through the seam; the post re-zeros A (G92.4).
      while (u - uPrev > circ / 2) u -= circ;
      while (uPrev - u > circ / 2) u += circ;
    }
    uPrev = u;
    path.push({ x: u, y: p.x });
  });
  return { path, radius: meanRadius };
}

export interface VCarveParams {
  /** the chains to carve, developed (developChain) */
  chains: DevelopedChain[];
  /** cut depth below the chain's surface radius, mm */
  depth: number;
  /** depth-per-level ladder, mm */
  stepDown: number;
  /** surface cut feed, mm/min */
  feed: number;
  /** straight-plunge feed at path starts, mm/min */
  plungeFeed: number;
  /** rapid clearance above the surface, mm */
  clearance: number;
  /** machine Z of the stock axis */
  axisZ: number;
  /** the machine's accumulated A when this op starts */
  startA: number;
  toolId: string;
  id: string;
}

export interface VCarveResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** the slowest segment's surface speed, mm/min (engrave's honest number) */
  effectiveFeed: number;
}

/** V-carve the chains: one wrapped engrave per chain, A accumulating
 * across chains so the axis never unwinds between loops. */
export function vCarve(op: VCarveParams): VCarveResult {
  if (op.chains.length === 0) {
    throw new Error('v-carve needs at least one selected chain');
  }
  if (op.depth <= 0) {
    throw new Error('v-carve depth must be positive — anchor on the chain surface and cut down');
  }
  const moves: Move[] = [];
  let minutes = 0;
  let effective = op.feed;
  let a = op.startA;
  for (const chain of op.chains) {
    const res = engrave({
      id: op.id,
      toolId: op.toolId,
      paths: [chain.path],
      depth: op.depth,
      stepDown: op.stepDown,
      feed: op.feed,
      plungeFeed: op.plungeFeed,
      clearance: op.clearance,
      frame: {
        kind: 'wrapped',
        radius: chain.radius,
        surfaceZ: op.axisZ + chain.radius,
        datumAngle: 0,
        startA: a,
      },
    });
    moves.push(...res.moves);
    minutes += res.estimatedMinutes;
    effective = Math.min(effective, res.effectiveFeed);
    // continue accumulating from where this chain's pass ended: the last
    // cut move's A — the moves carry it, so read it back
    const lastA = [...res.moves].reverse().find((m) => m.words.a !== undefined);
    if (lastA) a = lastA.words.a!;
  }
  return { moves, estimatedMinutes: minutes, effectiveFeed: effective };
}

/** Convenience re-export: the engrave params type narrows here (paths =
 * developed chains, wrapped frame). Callers stay on engrave's types. */
export type { EngraveParams };