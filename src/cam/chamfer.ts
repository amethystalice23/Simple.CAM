/**
 * Chamfer along edge loops with a V-bit/chamfer tool (PLAN.md Phase 1).
 *
 * Two placements, chosen by `mode`:
 *
 * - **'add'** — the selected edge is a sharp corner; cut a NEW chamfer
 *   through it. The machined surface IS the cone flank, placed so it
 *   passes through the anchor loop: tip Z is `depth` beyond the loop's
 *   plane ('down' along the wall below the edge, 'up' above it), and the
 *   tool-center path is the loop offset rt (the flat-tip radius) toward
 *   the tool side — the tip's far edge lands exactly on the loop at the
 *   chamfer's deepest point, the flank meets the anchor plane
 *   `depth · tan(α)` out along the face (α = vAngle/2).
 *
 * - **'existing'** — the model already has the chamfer; RIDE its face.
 *   The DIRECTION option selects which end of the modelled chamfer was
 *   clicked: 'up' anchors on the BOTTOM edge — the tip traces it
 *   exactly (tip Z = loop plane, path offset only rt; depth ignored: the
 *   bit cuts up and out from there). 'down' anchors on the TOP edge —
 *   the tool slides down the modelled chamfer plane by the chamfer
 *   length: tip at (r ∓ w, z − depth) with w = depth·tanα, so with depth
 *   equal to the modelled chamfer's depth the tip's material-side edge
 *   lands exactly on the bottom edge and the flank lies flush on the
 *   chamfer face (a cleanup pass). Both anchors produce the same cut
 *   when depth matches the model.
 *
 * Both placements reference only the anchor loop's plane, never the
 * wall, so either edge of an already-chamfered model anchors the same
 * cut.
 *
 * BAND PASSES (2026-11-23, Alice's "chamfer deeper than the bit's
 * cutting face"): when the chamfer width exceeds the cone's usable
 * flank width W = Ø/2 − rt, the chamfer is cut in BAND passes, each
 * placing the full cone flank on the SAME chamfer plane. Pass 1 is
 * exactly today's placement (deepest band, tip's far edge on the
 * anchor loop); pass k shifts the axis (k−1)·W toward the material
 * and the tip (k−1)·W/tanα up (direction 'down') or down ('up') the
 * plane. Cross-section: pass k's flank covers the band
 * [(k−1)·W, k·W] measured from the deepest point along the plane's
 * horizontal run; its flat tip and near flank ride strictly ABOVE the
 * plane over the bands earlier passes already cut (the near flank is
 * the mirror line, 2·(a_k + rt − o)/tanα above the plane), so upper
 * passes touch material only via their far flank — no seam dips, no
 * gouges, even with flat-tip bits. Each pass's plunge lands exactly
 * on the plane at o = (k−1)·W, the surface pass k−1 left. A chamfer
 * that once threw "cone is too short" now just runs ceil(w/W) passes;
 * the depth is bounded only by the feature, not the bit.
 */

import type { ChamferLoop, ChamferOp, Move, Tool, Vec2 } from '../core/types';
import { offsetInward, offsetOutward } from './clipper';
import { APPROACH_CLEARANCE, rotateToNearest } from './paths';

/** Sampled segments per analytic circle loop. */
export const CIRCLE_SEGMENTS = 64;

export interface ChamferResult {
  moves: Move[];
  /** loops cut */
  loops: number;
  /** chamfer width where the flank meets the anchor plane, mm */
  width: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
}

/** Signed area ×2; >0 = CCW. */
function signedArea2(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** Tool-center path for one loop, offset toward the cut side. A circle
 *  loop returns its analytic circle alongside the sampled polygon (the
 *  G2/G3 arc emission, 2026-11-12 — the polygon stays the fallback and
 *  the rotate-to-nearest start source). A NEGATIVE offset crosses the
 *  loop to the other side — band passes ≥ 2 offset toward the material,
 *  which is away from the cut side. */
export interface ChamferPath {
  pts: Vec2[];
  /** present only when this path IS the circle (not an offset approximation) */
  circle?: { cx: number; cy: number; r: number };
}

function toolPath(loop: ChamferLoop, side: 'inside' | 'outside', offset: number): ChamferPath[] {
  if (loop.kind === 'circle') {
    const r = side === 'inside' ? loop.radius - offset : loop.radius + offset;
    if (r <= 1e-9) throw new Error('chamfer loop is smaller than the tool tip');
    const pts: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push({ x: loop.center.x + r * Math.cos(a), y: loop.center.y + r * Math.sin(a) });
    }
    return [
      { pts, circle: { cx: loop.center.x, cy: loop.center.y, r } },
    ];
  }
  if (offset === 0) return [{ pts: loop.points }];
  // clipper's inward offset grows hole-oriented (CW) loops — normalize to
  // CCW so "inside" always means the loop's bounded region, whichever way
  // the detector stitched it. A negative offset offsets toward the OTHER
  // side (band passes crossing the loop toward the material).
  const ccw = signedArea2(loop.points) >= 0 ? loop.points : [...loop.points].reverse();
  const mag = Math.abs(offset);
  const inward = offset > 0 ? side === 'inside' : side === 'outside';
  const off = inward ? offsetInward([ccw], mag) : offsetOutward([ccw], mag);
  if (off.length === 0) throw new Error('chamfer loop is smaller than the tool tip');
  return off.map((pts) => ({ pts }));
}

export function chamfer(op: ChamferOp, tool: Tool): ChamferResult {
  if (op.loops.length === 0) throw new Error('chamfer needs at least one loop');
  if (op.depth <= 0) throw new Error('chamfer depth must be positive');
  // vitest does not typecheck: an undefined side/direction (an op created
  // before the field existed) must fail loudly, not silently take the
  // else branch of a ternary — that draws the chamfer on the wrong side
  // of the edge while the panel still displays the default option.
  if (op.side !== 'auto' && op.side !== 'inside' && op.side !== 'outside') {
    throw new Error(`unknown chamfer side ${String(op.side)}`);
  }
  if (op.direction !== 'down' && op.direction !== 'up') {
    throw new Error(`unknown chamfer direction ${String(op.direction)}`);
  }
  if (op.mode !== 'add' && op.mode !== 'existing') {
    throw new Error(`unknown chamfer mode ${String(op.mode)}`);
  }
  if (tool.type !== 'vbit') {
    throw new Error('chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
  }
  if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
    throw new Error('chamfer tool needs a sane included tip angle (0–180°)');
  }
  const alpha = ((tool.vAngle / 2) * Math.PI) / 180;
  const rt = (tool.tipDiameter ?? 0) / 2;
  const width = op.depth * Math.tan(alpha);
  // the cone's usable flank width per pass: flat-edge radius to cone top
  const coneWidth = tool.diameter / 2 - rt;
  if (op.feed <= 0) throw new Error('chamfer feed must be positive');
  if (op.plungeFeed <= 0) throw new Error('chamfer plunge feed must be positive');

  const moves: Move[] = [];
  let cur: Vec2 | null = null;
  let minutes = 0;
  let loops = 0;

  for (const loop of op.loops) {
    // 'auto' rides the void side of the edge: into the hole for a rim
    // (material outside the loop — the funnel cut), out around a boss
    // outline (material inside). The cone flank then removes the corner
    // where the face meets the wall, which is the conventional chamfer
    // in both cases.
    const side: 'inside' | 'outside' =
      op.side === 'auto' ? (loop.materialOutside ? 'inside' : 'outside') : op.side;
    // 'existing' + 'down' selected the chamfer's TOP edge: the tool slides
    // down the modelled chamfer plane by the chamfer length (tip in/out by
    // w = depth·tanα), landing on the bottom edge when depth matches the
    // model. 'existing' + 'up' selected the BOTTOM edge: the tip traces it
    // exactly — depth ignored, no slide. 'add' never slides.
    const slides = op.mode === 'existing' && op.direction === 'down';
    const along = slides ? op.depth * Math.tan(alpha) : 0;
    const tipDepth = op.mode === 'add' || op.direction === 'down' ? op.depth : 0;
    // BAND PASSES: a chamfer wider than one cone flank is cut in bands —
    // pass 1 is today's placement, pass k rides (k−1)·coneWidth further
    // along the plane. Existing+'up' traces the anchor with no depth
    // demand, so it always stays one pass. A degenerate bit (tip Ø = full
    // Ø) has no flank at all — refuse anything but a zero-demand trace.
    const flankDemand = tipDepth > 0 ? width : 0;
    if (flankDemand > 0 && coneWidth <= 1e-9) {
      throw new Error(
        `the Ø${tool.diameter} bit's tip is its full diameter — no cone flank to chamfer with`,
      );
    }
    const bands = Math.max(1, Math.ceil(flankDemand / Math.max(coneWidth, 1e-9) - 1e-9));
    const tipZ1 = op.direction === 'down' ? loop.z - tipDepth : loop.z + tipDepth;
    const shift1 = rt + along;
    const zStep = coneWidth / Math.tan(alpha);

    for (let band = 1; band <= bands; band++) {
      const k = band - 1;
      const tipZ = op.direction === 'down' ? tipZ1 + k * zStep : tipZ1 - k * zStep;
      const shift = shift1 - k * coneWidth;
      // retract above whichever is higher: the anchor plane ('down' cuts
      // below it) or the raised tip ('up' cuts above the anchor plane)
      const safeZ = (op.direction === 'down' ? loop.z : tipZ) + op.safeClearance;
      const bandNote = bands > 1 ? `, band ${band}/${bands}` : '';

      for (const raw of toolPath(loop, side, shift)) {
        const path = rotateToNearest(raw.pts, cur);
        const start = path[0];

        // travel first at the machine's existing height (after a tool change
        // that is the swap macro's high park — never a diagonal descent
        // across the table), then descend at the destination. Pass k ≥ 2
        // lands exactly on the plane where pass k−1's flank ended.
        moves.push({
          words: { x: start.x, y: start.y },
          feed: 0,
          rapid: true,
          comment: `chamfer ${op.depth.toFixed(2)}mm deep, ${width.toFixed(2)}mm wide, side ${side}${bandNote}`,
        });
        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        moves.push({ words: { z: tipZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
        moves.push({
          words: { z: tipZ },
          feed: op.plungeFeed,
          comment: `plunge to chamfer tip z${tipZ.toFixed(2)}${bandNote}`,
        });
        minutes += APPROACH_CLEARANCE / op.plungeFeed;

        let prev = start;
        if (raw.circle) {
          // ARC EMISSION (2026-11-12, G2/G3): the sampled polygon was only
          // ever an approximation of this circle — one full-circle arc cuts
          // the exact tool-center path. CCW matches the polygon's winding
          // (sampled with increasing angle), keeping today's cut direction.
          const c = raw.circle;
          moves.push({
            words: { x: start.x, y: start.y },
            feed: op.feed,
            arc: { i: c.cx - start.x, j: c.cy - start.y, cw: false },
            comment: `circular chamfer r${c.r.toFixed(2)}${bandNote}`,
          });
          minutes += (2 * Math.PI * c.r) / op.feed;
        } else {
          for (let i = 1; i <= path.length; i++) {
            const p = path[i % path.length];
            moves.push({ words: { x: p.x, y: p.y }, feed: op.feed });
            minutes += Math.hypot(p.x - prev.x, p.y - prev.y) / op.feed;
            prev = p;
          }
        }

        moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
        cur = start;
        loops++;
      }
    }
  }

  return { moves, loops, width, estimatedMinutes: minutes };
}