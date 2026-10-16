/**
 * Swappable polygon-offset kernel (see PLAN.md license policy: the Clipper
 * family stays behind this module). Currently `clipper-lib` — the pure-JS
 * BSL port of Clipper — chosen over the WASM wrappers for synchronous use in
 * both the generators and vitest; a Clipper2 WASM can replace it here without
 * touching any generator.
 *
 * All public coordinates are mm machine-space XY; Clipper's integer grid is
 * micrometers (scale ×1000). Contours follow our slicing convention: outer
 * loops CCW, holes CW.
 */

import { ClipperOffset, EndType, JoinType } from 'clipper-lib';
import type { ClipperPath } from 'clipper-lib';
import type { Vec2 } from '../core/types';

const SCALE = 1000; // µm grid
/** Round-join arc tolerance for offsets, µm (0.025 mm). */
const ARC_TOL = 25;
/** Miter limit for (unused here) sharp joins. */
const MITER_LIMIT = 2;

function toPath(contour: Vec2[]): ClipperPath {
  return contour.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
}

function fromSolution(sol: ClipperPath[]): Vec2[][] {
  return sol.map((p) => p.map((q) => ({ x: q.X / SCALE, y: q.Y / SCALE })));
}

/**
 * Offset closed polygons inward by `delta` mm (Clipper negative-delta
 * offset with round joins, so tool-center loops keep a constant wall
 * distance at corners). Outer loops shrink, holes grow, and loops that
 * vanish under the offset drop out. Returns [] when nothing survives.
 */
export function offsetInward(contours: Vec2[][], deltaMm: number): Vec2[][] {
  if (contours.length === 0 || deltaMm <= 0) return [];
  const co = new ClipperOffset(MITER_LIMIT, ARC_TOL);
  co.AddPaths(
    contours.map(toPath),
    JoinType.jtRound,
    EndType.etClosedPolygon,
  );
  const sol: ClipperPath[] = [];
  co.Execute(sol, -deltaMm * SCALE);
  return fromSolution(sol);
}

/**
 * Offset closed polygons outward by `delta` mm (positive-delta Clipper
 * offset). Grown regions that overlap are unioned. For profile work the
 * input is typically a single contour, so a CW hole loop shrinks — callers
 * pass the boundary they mean to follow.
 */
export function offsetOutward(contours: Vec2[][], deltaMm: number): Vec2[][] {
  if (contours.length === 0) return [];
  if (deltaMm <= 0) return contours;
  const co = new ClipperOffset(MITER_LIMIT, ARC_TOL);
  co.AddPaths(
    contours.map(toPath),
    JoinType.jtRound,
    EndType.etClosedPolygon,
  );
  const sol: ClipperPath[] = [];
  co.Execute(sol, deltaMm * SCALE);
  return fromSolution(sol);
}