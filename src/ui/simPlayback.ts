/**
 * Playback clock for the transport bar (2026-10-27, Alice's spec) — PURE:
 * no React, no worker, no three.js. The worker is time-agnostic (it
 * speaks move indices, src/sim/protocol.ts), so the clock lives entirely
 * client-side: simulated minutes advance with wall time, and a binary
 * search over the cumulative move durations maps them to a carve target
 * the worker self-drives to (`carve` re-sends just re-target — idempotent).
 *
 * Scale: 1× = HONEST real time — one simulated SECOND per wall-clock
 * second (moveDurations returns minutes, so 1× = 1/60 minutes per
 * second). N× multiplies that. 'max' disables the clock entirely (one
 * carve(MAX_SAFE_INTEGER) and the worker runs flat out — the bar then
 * just follows progress messages).
 *
 * Ladder rationale (2026-10-27 revision): contour jobs run for HOURS
 * (Alice's knight ≈ 10h real time) — real-time 1× is for watching a
 * short op behave, and each doubling keeps the ladder short enough to
 * cycle; 64× plays the knight back in ~10 min, and 'max' is flat-out.
 */

import type { Move } from '../core/types';
import { moveDurations } from '../sim/poses';

export type PlaybackSpeed = 1 | 2 | 4 | 8 | 16 | 32 | 64 | 'max';

/** the pill's cycle order — clicking walks this left to right, wrapping */
export const SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4, 8, 16, 32, 64, 'max'];

/** next speed in the pill cycle (max wraps to 1×) */
export function cycleSpeed(s: PlaybackSpeed): PlaybackSpeed {
  return SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length];
}

/** pill label — replaces the old one in place (no dropdown, per spec) */
export function speedLabel(s: PlaybackSpeed): string {
  return s === 'max' ? 'max' : `${s}×`;
}

/** simulated minutes per wall-clock second; null = 'max' (clock off).
 *  1/60 = real time (60 wall seconds per simulated minute). */
export function minutesPerSecond(s: PlaybackSpeed): number | null {
  return s === 'max' ? null : s / 60;
}

/** prefix sums: cum[i] = simulated minutes elapsed BEFORE move i starts,
 *  cum[n] = the whole job. Built from moveDurations (G93/G94-aware —
 *  inverse-time feeds already come back in minutes). */
export function cumulativeDurations(durations: number[]): number[] {
  const cum: number[] = [0];
  for (let i = 0; i < durations.length; i++) cum.push(cum[i] + durations[i]);
  return cum;
}

/** the whole-pipeline convenience the hook uses: Move[] → cumulative */
export function cumulativeFromMoves(moves: Move[]): number[] {
  return cumulativeDurations(moveDurations(moves));
}

/** the clock position at which the carve boundary reaches `moveIndex`
 *  (clamped to [0, n] — the end of the job, not past it) */
export function simMinutesAtMove(cum: number[], moveIndex: number): number {
  return cum[Math.max(0, Math.min(moveIndex, cum.length - 1))];
}

/** the move being carved at `simMinutes`: the LARGEST i with cum[i] ≤ t,
 *  clamped to [0, n-1]. Zero-duration moves (zero-motion, feed-less) sit
 *  at duplicated boundaries and skip — the largest index wins, matching
 *  the worker's "carve poses with moveIndex ≤ target" semantics. */
export function moveAtSimMinutes(cum: number[], simMinutes: number): number {
  const last = cum.length - 2; // last move index (cum has n+1 entries)
  if (last < 0) return 0; // empty job
  const t = Math.min(Math.max(simMinutes, 0), cum[last + 1]);
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
