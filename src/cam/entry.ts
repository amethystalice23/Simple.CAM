/**
 * Ramped entries (gap-analysis #4, 2026-10-29): an end mill never plunges
 * straight into material — the center cuts at zero peripheral speed and
 * chips pack into the hole they are making. The entry descends ALONG the
 * cut path instead, resolved by geometry alone (Alice, 2026-10-29: no UI
 * knob — the ladder is strictly ranked, a choice could only pick worse):
 *
 *   - closed loop → HELICAL descent along the loop itself: whole
 *     revolutions at ≤ MAX_RAMP_ANGLE slope and ≤ stepDown of fresh
 *     material per revolution, landing back at the pass start AT the cut
 *     level. The full loop pass that follows cleans the spiral's wedge,
 *     so the finished wall is exactly what the stepped cut produced.
 *     (The thread op's depth-along-the-helix trick, in XY.)
 *   - open span (tabbed / footprint-clipped) → ZIGZAG over the first
 *     stretch of the span: even leg count, ends at the span start AT the
 *     cut level, the span cut then covers the stretch at depth.
 *   - straight PLUNGE (the v1 emission) only through AIR — a finishing
 *     level with no material band at the entry — or when the geometry is
 *     too small to ramp at any sane steepness (degenerate pinched loops).
 *
 * Every traversal bounds the fresh material it engages: per-revolution /
 * per-leg descent ≤ stepDown (the global cut-band rule) and slope ≤
 * MAX_RAMP_ANGLE. Ramps ride the ACTUAL cut path through its vertices,
 * never a chord — a chord across a corner would gouge the finished wall.
 */

import type { Move, Vec2 } from '../core/types';
import { pointAtArc } from './clipUtils';

/** Max ramp slope (deg). 3° keeps full-width entries gentle on a desktop
 *  machine; steeper is a plunge in all but name. */
export const MAX_RAMP_ANGLE_DEG = 3;
/** Zigzag legs / helical revolutions beyond this mean the geometry is too
 *  small to ramp — fall back to a straight plunge. */
const MAX_RAMP_TRAVERSALS = 24;
/** A ramp stretch shorter than this is a plunge with extra steps. */
const MIN_RAMP_STRETCH = 0.5;

export type EntryMode = 'helical' | 'zigzag' | 'plunge';

export interface EntryResult {
  moves: Move[];
  /** feed-time of the entry, minutes */
  minutes: number;
  mode: EntryMode;
}

/**
 * Arc-length table of a closed loop (last entry closes back to vertex 0).
 */
export function arcTable(loop: Vec2[]): number[] {
  const cum = [0];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cum;
}

/**
 * Samples strictly after arc `sa` up to and including `sb`, ascending.
 * `sb` may wrap past the perimeter (whole revolutions); interior vertices
 * are kept whole, the end is interpolated on its segment. The start is
 * never included — the tool is already there, and a move back onto it
 * would be a zero-length plunge in disguise.
 */
function arcSamples(loop: Vec2[], cum: number[], sa: number, sb: number): { s: number; p: Vec2 }[] {
  const n = loop.length;
  const P = cum[n];
  // collect first, sort after: on a wrapped interval (sb past the
  // perimeter) vertices behind sa come around one perimeter later, and
  // base-arc order is NOT travel order — the pushed sequence would jump
  // ahead and back (a latent disorder spanPoints had too, invisible on
  // coarse square fixtures where both groups never hold vertices at once)
  const hits: { s: number; k: number }[] = [];
  for (let k = 0; k < n; k++) {
    const base = cum[k];
    if (base >= sb - 1e-9) break; // past the span end; every later vertex is too
    // wrap forward past sa — as many perimeters as the entry is deep into
    // its revolutions (a single +P wrap strands every vertex of revs ≥ 3
    // behind the start, collapsing them into zero-length closes)
    let a = base;
    while (a <= sa + 1e-9) a += P;
    if (a >= sb - 1e-9) continue;
    hits.push({ s: a, k });
  }
  hits.sort((u, v) => u.s - v.s);
  const out = hits.map(({ s, k }) => ({ s, p: loop[k] }));
  out.push({ s: sb, p: pointAtArc(loop, cum, sb) });
  return out;
}

/** Samples strictly after `fromS` back to `toS`, DESCENDING (a backward
 *  zigzag leg; never wraps — spans don't). */
function arcSamplesBack(loop: Vec2[], cum: number[], fromS: number, toS: number): { s: number; p: Vec2 }[] {
  const asc = arcSamples(loop, cum, toS, fromS);
  asc.pop(); // the leg's own start — the tool is already there
  asc.reverse();
  asc.push({ s: toS, p: pointAtArc(loop, cum, toS) });
  return asc;
}

export interface RampParams {
  loop: Vec2[];
  /** arc table of the loop (arcTable) */
  cum: number[];
  /** arc-length position of the entry point on the loop */
  sStart: number;
  /** arc length available to the ramp: the perimeter (closed) or the span */
  stretch: number;
  /** closed loop → helical revolutions; open span → zigzag legs */
  closed: boolean;
  /** standing material band at the entry, mm — 0 means the descent is
   *  pure air and a straight plunge is honest (finishing pass) */
  band: number;
  /** approach plane the rapid ends on */
  fromZ: number;
  /** cut level the entry must land on */
  toZ: number;
  stepDown: number;
  feed: number;
}

/** Straight plunge — the fallback and the pure-air case. */
function plungeEntry(p: RampParams, why: string): EntryResult {
  return {
    moves: [{ words: { z: p.toZ }, feed: p.feed, comment: `plunge — ${why}` }],
    minutes: (p.fromZ - p.toZ) / p.feed,
    mode: 'plunge',
  };
}

export function rampEntry(p: RampParams): EntryResult {
  const descent = p.fromZ - p.toZ;
  if (descent <= 0) return { moves: [], minutes: 0, mode: 'plunge' };
  // no material at the entry: the whole descent is air, plunging is honest
  if (p.band <= 1e-9) return plungeEntry(p, 'air above a finishing level');
  const tanA = Math.tan((MAX_RAMP_ANGLE_DEG * Math.PI) / 180);

  if (p.closed) {
    // helical: whole revolutions of the loop itself, per-rev descent bounded
    // by the cut-band rule (stepDown) and the slope (perimeter · tan)
    const P = p.stretch;
    if (P < MIN_RAMP_STRETCH) return plungeEntry(p, 'loop too short to ramp');
    const perRev = Math.min(p.stepDown, P * tanA);
    const revs = Math.max(1, Math.ceil(descent / perRev));
    if (revs > MAX_RAMP_TRAVERSALS) return plungeEntry(p, 'loop too short to ramp');

    const moves: Move[] = [];
    for (let k = 0; k < revs; k++) {
      const sa = p.sStart + k * P;
      for (const { s, p: pt } of arcSamples(p.loop, p.cum, sa, sa + P)) {
        const f = (s - sa) / P;
        const z = k + 1 === revs && f >= 1 - 1e-12 ? p.toZ : p.fromZ - (descent * (k + f)) / revs;
        moves.push({ words: { x: pt.x, y: pt.y, z }, feed: p.feed });
      }
    }
    moves[0].comment = `ramp entry — helical, ${revs} turn${revs > 1 ? 's' : ''}`;
    // the tool travels the 3D hypotenuse of the descent, not the flat arc
    return { moves, minutes: (revs * Math.hypot(P, descent / revs)) / p.feed, mode: 'helical' };
  }

  // zigzag over the first stretch: even legs, ends at the span start
  if (p.stretch < MIN_RAMP_STRETCH) return plungeEntry(p, 'span too short to ramp');
  const legCap = Math.min(p.stepDown, p.stretch * tanA);
  // smallest even leg count satisfying both bounds (odd +1 keeps the exit
  // at the span start, where the level-Z cut cleans up after the ramp)
  let legs = Math.max(2, Math.ceil(descent / legCap));
  if (legs % 2 === 1) legs += 1;
  if (legs > MAX_RAMP_TRAVERSALS) return plungeEntry(p, 'span too short to ramp');
  const stretch = Math.min(p.stretch, descent / (legs * tanA));
  if (stretch < MIN_RAMP_STRETCH) return plungeEntry(p, 'span too short to ramp');

  const moves: Move[] = [];
  for (let k = 0; k < legs; k++) {
    const forward = k % 2 === 0;
    const fromS = p.sStart + (forward ? 0 : stretch);
    const toS = p.sStart + (forward ? stretch : 0);
    const samples = forward
      ? arcSamples(p.loop, p.cum, fromS, toS)
      : arcSamplesBack(p.loop, p.cum, fromS, toS);
    for (const { s, p: pt } of samples) {
      const f = Math.abs(s - fromS) / stretch;
      const z = k + 1 === legs && f >= 1 - 1e-12 ? p.toZ : p.fromZ - (descent * (k + f)) / legs;
      moves.push({ words: { x: pt.x, y: pt.y, z }, feed: p.feed });
    }
  }
  moves[0].comment = `ramp entry — zigzag, ${legs} legs`;
  // 3D hypotenuse of the descent, as with the helical entry
  return { moves, minutes: (legs * Math.hypot(stretch, descent / legs)) / p.feed, mode: 'zigzag' };
}