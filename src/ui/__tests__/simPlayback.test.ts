import { describe, expect, it } from 'vitest';
import type { Move } from '../../core/types';
import {
  SPEEDS,
  cycleSpeed,
  cumulativeDurations,
  cumulativeFromMoves,
  minutesPerSecond,
  moveAtSimMinutes,
  simMinutesAtMove,
  speedLabel,
} from '../simPlayback';

/** a 10mm linear feed cut at 600mm/min = 1/60 simulated minute */
const cutShort: Move = { words: { x: 10 }, feed: 600 };
/** a 30mm cut at 600mm/min = 0.05 minutes */
const cutHalf: Move = { words: { x: 40 }, feed: 600 };
/** G93 simultaneous move: feed is 1/minutes — 0.5/min feed = 2 minutes */
const g93_2min: Move = { words: { x: 40, a: 90 }, feed: 0.5 };
/** a rapid: 600mm at the 600mm/min Z rate = 1 minute */
const rapid1min: Move = { words: { z: 600 }, feed: 0, rapid: true };
/** a zero-motion move (re-stamped position) — costs nothing */
const zero: Move = { words: { x: 40 }, feed: 600 };

/** the job the assertions below walk: 1/60 + 0.05 + 2 + 1 + 0 minutes.
 *  Boundaries: cum = [0, 1/60, 1/60+0.05, 2.0+, 3.0+, 3.0+] (the zero-
 *  duration move 4 shares move 3's end boundary). */
const job: Move[] = [cutShort, cutHalf, g93_2min, rapid1min, zero];
const cum = cumulativeFromMoves(job);

const T2 = 1 / 60 + 0.05; // move 2 starts
const T3 = T2 + 2; // move 3 starts (the G93's inverse-time minuteS)
const T4 = T3 + 1; // the end (move 4 is zero-duration)

describe('speed pill', () => {
  it('cycles 1→2→4→8→16→32→max→1 (the spec order, wrapping)', () => {
    expect(SPEEDS).toEqual([1, 2, 4, 8, 16, 32, 'max']);
    let s: (typeof SPEEDS)[number] = 1;
    const walked: (typeof SPEEDS)[number][] = [s];
    for (let i = 0; i < SPEEDS.length; i++) {
      s = cycleSpeed(s);
      walked.push(s);
    }
    expect(walked).toEqual([1, 2, 4, 8, 16, 32, 'max', 1]);
  });

  it('labels replace in place — 1× through 32×, then max', () => {
    expect(speedLabel(1)).toBe('1×');
    expect(speedLabel(32)).toBe('32×');
    expect(speedLabel('max')).toBe('max');
  });

  it("'max' disables the clock; N× is N simulated minutes per second", () => {
    expect(minutesPerSecond('max')).toBeNull();
    expect(minutesPerSecond(1)).toBe(1);
    expect(minutesPerSecond(16)).toBe(16);
  });
});

describe('cumulative durations', () => {
  it('is G93/G94-aware via moveDurations (inverse-time = minutes, linear = mm over mm/min)', () => {
    expect(cum.length).toBe(6);
    expect(cum[1]).toBeCloseTo(1 / 60, 15); // 10mm @ 600mm/min
    expect(cum[2]).toBeCloseTo(T2, 15); // + 30mm @ 600mm/min
    expect(cum[3]).toBeCloseTo(T3, 12); // + G93 1/0.5 = 2 min
    expect(cum[4]).toBeCloseTo(T4, 12); // + rapid 600mm @ 600mm/min
    expect(cum[5]).toBeCloseTo(T4, 12); // zero-motion move costs nothing
  });
});

describe('simMinutesAtMove (move → clock)', () => {
  it('maps move indices to their cumulative start minutes', () => {
    expect(simMinutesAtMove(cum, 0)).toBe(0);
    expect(simMinutesAtMove(cum, 2)).toBeCloseTo(T2, 15);
    expect(simMinutesAtMove(cum, 5)).toBeCloseTo(T4, 12); // the end
  });

  it('clamps to [0, total] — past the end returns the full duration', () => {
    expect(simMinutesAtMove(cum, 99)).toBeCloseTo(T4, 12);
    expect(simMinutesAtMove(cum, -3)).toBe(0);
  });
});

describe('moveAtSimMinutes (clock → move)', () => {
  it('lands on the move being carved at time t', () => {
    expect(moveAtSimMinutes(cum, 0)).toBe(0);
    expect(moveAtSimMinutes(cum, 0.03)).toBe(1); // 1/60 ≈ 0.0167 < 0.03 < T2
    expect(moveAtSimMinutes(cum, 1 / 60)).toBe(1); // exactly a boundary
    expect(moveAtSimMinutes(cum, 1)).toBe(2); // inside the G93's 2 minutes
    expect(moveAtSimMinutes(cum, T3 + 0.5)).toBe(3); // the rapid
  });

  it('clamps at both ends (0 and total)', () => {
    expect(moveAtSimMinutes(cum, -10)).toBe(0);
    expect(moveAtSimMinutes(cum, 100)).toBe(4); // last move index
  });

  it('skips zero-duration moves (the largest index at a duplicated boundary)', () => {
    // the zero-motion move 4 sits at the same minute as move 3's end
    expect(moveAtSimMinutes(cum, T4)).toBe(4);
  });

  it('handles an all-zero-duration job and an empty job', () => {
    const flat = cumulativeDurations([0, 0, 0]);
    expect(moveAtSimMinutes(flat, 0)).toBe(2);
    expect(moveAtSimMinutes([0], 5)).toBe(0);
  });
});

describe('roundtrip', () => {
  it('move → clock → move returns the original index (before zero-duration tails)', () => {
    for (let m = 0; m <= 3; m++) {
      expect(moveAtSimMinutes(cum, simMinutesAtMove(cum, m))).toBe(m);
    }
    // move 4 shares move 3's boundary — the mapping lands on the LATEST
    // move at that time (documented skip, not a bug)
    expect(moveAtSimMinutes(cum, simMinutesAtMove(cum, 4))).toBe(4);
  });

  it('clock never overshoots the job: t=total → the last move, not past it', () => {
    const total = cum[cum.length - 1];
    expect(moveAtSimMinutes(cum, total + 1000)).toBe(4);
  });
});
