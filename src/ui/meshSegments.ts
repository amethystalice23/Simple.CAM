/**
 * Sagitta-scaled radial segment count for cylinder geometries (2026-11-03,
 * Alice: the number of segments a cylinder is rendered into "is waaay too
 * coarse… we did great on small scale things, now we need to do better on
 * large scale things too" — the retical ring, a Ø20 part, at the old fixed
 * 48/64 segments). Segments scale with RADIUS at a fixed chord tolerance,
 * not with a fixed count: n = ceil(π / acos(1 − tol/r)) keeps every
 * rendered chord within `tol` of the true circle (sagitta err = r·(1 −
 * cos(π/n))). The floor keeps small primitives' rim circles fittable
 * (fitCircle's n ≥ 9 threshold); the cap bounds render cost on huge
 * radii. A Ø2 primitive stays 48; Ø20 → 124; Ø50 → 248 (vs the old 48).
 */

/** Max chord deviation of the rendered circle from the true one, mm. */
const CHORD_TOL_MM = 0.02;
/** Floor: small primitives keep the old 48 (rim circles stay fittable). */
const MIN_SEGMENTS = 48;
/** Cap: render cost bound on huge radii. */
const MAX_SEGMENTS = 512;

/** Radial segments for a full revolution at CHORD_TOL_MM chord tolerance.
 *  Rounded up to a multiple of 4 so a vertex lands on each cardinal
 *  direction — bounding-box measurements of the rendered cylinder stay
 *  EXACT (a raw 50 segments puts no vertex at ±Y; the pinned bbox test
 *  caught exactly that). */
export function segmentsForRadius(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return MIN_SEGMENTS;
  const halfSegment = Math.acos(Math.max(-1, 1 - CHORD_TOL_MM / radius));
  const n = Math.ceil(Math.PI / Math.max(1e-9, halfSegment));
  const n4 = Math.ceil(n / 4) * 4;
  return Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, n4));
}