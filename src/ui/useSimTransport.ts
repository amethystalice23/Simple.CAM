/**
 * Transport playback clock (2026-10-27, Alice's spec) — the client-side
 * half of the transport bar, sibling hook to useCarveSim: a
 * requestAnimationFrame loop advances simulated minutes at the chosen
 * speed (1× = honest real time: one simulated second per wall-clock
 * second, i.e. 1/60 simulated minutes per second), maps them
 * through the cumulative move durations (simPlayback.ts) to a carve
 * target, and re-targets the SAME worker with the SAME token (`carve`
 * re-sends just re-target, idempotent, self-driving — never supersede the
 * token: the supersede path is what KILLS a worker, only `run` may).
 *
 * src/sim stays UNCHANGED (zero worker/protocol changes): `reset` makes
 * the worker rebuild its grid and re-post the full stock (the client's
 * chunk map re-fills through useCarveSim's existing chunk handlers), and
 * progress messages drive the bar during playback. The protocol has no
 * pause message — pausing stops the CLOCK; the worker finishes its last
 * posted target and parks (done only fires at the very end of the job).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move } from '../core/types';
import type { CarveSim } from './useCarveSim';
import {
  cycleSpeed as cycle,
  cumulativeFromMoves,
  minutesPerSecond,
  moveAtSimMinutes,
  simMinutesAtMove,
  speedLabel,
  type PlaybackSpeed,
} from './simPlayback';

/** wall-clock seconds per rAF frame we'll believe — a backgrounded tab
 *  returns one giant dt; clamp so a replay never teleports the clock */
const MAX_FRAME_S = 0.25;

export interface SimTransport {
  playing: boolean;
  /** the move the BAR shows: the carved position (worker progress) while
   *  playing, the committed position while paused */
  position: number;
  totalMoves: number;
  speed: PlaybackSpeed;
  label: string;
  togglePlay: () => void;
  returnToStart: () => void;
  stepForward: () => void;
  /** scrub commit (on RELEASE — the bar previews locally while dragging) */
  scrubTo: (moveIndex: number) => void;
  cycleSpeed: () => void;
}

export function useSimTransport(sim: CarveSim, moves: Move[] | null): SimTransport {
  const { state } = sim;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  /** the paused bar position (a commit from step/scrub/return-to-start);
   *  null = follow the carved position (playing, or parked at the end) */
  const [commit, setCommit] = useState<number | null>(null);

  const rafRef = useRef(0);
  const lastWallRef = useRef(0);
  const clockRef = useRef(0); // simulated minutes since move 0
  /** the last target we posted (rising re-targets gate the per-frame post;
   *  MAX = the initial run's carve-to-end armed at `ready`) */
  const postedTargetRef = useRef(0);
  /** the carved position, from progress messages — zeroed by a posted
   *  reset because the worker stays silent until the next carve runs */
  const carvedRef = useRef(0);
  /** true between a posted reset and the first progress message after it:
   *  state.progress still holds the PRE-reset value (the worker posts no
   *  progress during a reset), and showing it would snap the bar forward */
  const staleRef = useRef(false);
  /** the max watch-loop's end-check twin of staleRef: true from arming a
   *  fresh run at 'max' (play-from-end, resume, the pill) until that run's
   *  FIRST progress arrives. Across a reset state.progress still holds the
   *  PREVIOUS run's final move (= total) — the end-check reading it killed
   *  playing on frame one and the replay carved on with a dead ▶ button
   *  that needed two clicks to pause (Alice's 2026-10-27 report) */
  const awaitingRef = useRef(false);
  const playingRef = useRef(false);
  playingRef.current = playing;

  // live mirrors for the rAF loop (state closures would be stale)
  const progressRef = useRef(state.progress);
  progressRef.current = state.progress;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const sendRef = useRef(sim.send);
  sendRef.current = sim.send;

  const cum = useMemo(() => cumulativeFromMoves(moves ?? []), [moves]);
  const cumRef = useRef(cum);
  cumRef.current = cum;

  const totalMoves = state.progress?.totalMoves ?? 0;
  const totalRef = useRef(totalMoves);
  totalRef.current = totalMoves;
  const position = commit ?? (staleRef.current ? 0 : (state.progress?.move ?? 0));
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    // progress confirms the carve — clears the post-reset staleness too
    if (!state.progress) return;
    carvedRef.current = state.progress.move;
    staleRef.current = false;
  }, [state.progress]);

  /** commit the position to `k` (pausing callers only): behind the carved
   *  position needs reset + re-carve (voxels cannot un-carve); ahead is an
   *  incremental retarget the worker self-drives. With the b10 worker the
   *  retargets also SERIALIZE: each click posts one deterministic target,
   *  the worker actions them in arrival order (parked → drive → parked). */
  const commitTo = useCallback((k: number) => {
    const total = totalRef.current;
    const target = Math.max(0, Math.min(k, total));
    clockRef.current = simMinutesAtMove(cumRef.current, target);
    postedTargetRef.current = target;
    setCommit(target);
    // clamp reads to honest worker progress (b10 reports the last carved
    // move, so this tracks exactly); a reset only when genuinely behind it
    const carved = Math.min(carvedRef.current, total);
    if (target < carved) {
      staleRef.current = true;
      carvedRef.current = 0;
      sendRef.current({ type: 'reset' });
      if (target > 0) sendRef.current({ type: 'carve', throughMove: target });
    } else if (target > carved) {
      sendRef.current({ type: 'carve', throughMove: target });
    }
  }, []);

  const stopClock = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const loop = useCallback((now: number) => {
    rafRef.current = 0;
    if (!playingRef.current) return;
    const total = totalRef.current;
    const cumL = cumRef.current;
    const mps = minutesPerSecond(speedRef.current);
    if (mps === null) {
      // 'max': no clock — the worker was pointed at the end and runs flat
      // out; the bar follows progress and the done-effect flips the button.
      // A fresh carve arms awaitingRef (above): until its FIRST progress
      // arrives, state.progress holds the PREVIOUS run's final move —
      // pausing on it kills the replay before it carves anything
      if (awaitingRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      if (staleRef.current || (progressRef.current?.move ?? 0) >= total) {
        setPlaying(false);
      } else {
        rafRef.current = requestAnimationFrame(loop);
      }
      return;
    }
    const dt = Math.min((now - lastWallRef.current) / 1000, MAX_FRAME_S);
    lastWallRef.current = now;
    clockRef.current += dt * mps;
    const totalMinutes = cumL[cumL.length - 1] ?? 0;
    // finite speeds: a fresh clock re-arms awaitingRef the same way —
    // a progress from THIS run arriving mid-flight is a bonus park check
    awaitingRef.current = false;
    let target = moveAtSimMinutes(cumL, clockRef.current);
    if (clockRef.current >= totalMinutes) {
      // end reached: pause at the boundary — the worker finishes the final
      // target and posts done; the bar snaps to the carved end
      clockRef.current = totalMinutes;
      target = total;
      if (target > postedTargetRef.current) {
        postedTargetRef.current = target;
        sendRef.current({ type: 'carve', throughMove: target });
      }
      setPlaying(false);
      return;
    }
    // rising re-target only: the same/lower target is already armed (or
    // still being driven to) — re-sending is idempotent but per-frame
    // would be noise. THE LOCKUP GUARD (Alice's 2026-10-29 report: "after
    // a few clicks of speed multiplier and play/pause it locks up"):
    // a pill-cycle off 'max' can leave the clock BEHIND the worker's
    // already-carved cursor (the park retarget parks late — the worker
    // finishes its in-flight slice past the target), and then no clock
    // target ever exceeds the stale postedTarget — the loop spins posting
    // nothing, forever. Heal it: clamp the post to at least the carved
    // position, so an armed-behind gate re-arms to the truth.
    const carvedNow = Math.min(carvedRef.current, total);
    if (target < carvedNow) target = carvedNow;
    if (target > postedTargetRef.current) {
      postedTargetRef.current = target;
      sendRef.current({ type: 'carve', throughMove: target });
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    lastWallRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopClock]);

  // run lifecycle (App.tsx's existing coupling disposes the sim on
  // Clear/new job/model drop — the transport resets with it):
  //  - disposed (build null): drop everything (the pill rests at 1×)
  //  - ready (running): the initial run's carve-to-end is armed — the
  //    transport OWNS that run (2026-10-27 revision): play at 'max' with
  //    an honest pill (launch = flat out, and pause works on it), the bar
  //    following progress messages from move 0 up
  //  - done: the whole job is carved; auto-pause, bar at the end. Does NOT
  //    fire during playback (running/build don't change on re-targets) —
  //    a finished replay re-posts done with the same deps, no refire.
  useEffect(() => {
    if (state.build === null) {
      stopClock();
      setPlaying(false);
      setCommit(null);
      setSpeed(1);
      clockRef.current = 0;
      carvedRef.current = 0;
      staleRef.current = false;
      postedTargetRef.current = 0;
      awaitingRef.current = false;
    } else if (state.running) {
      setCommit(null);
      setSpeed('max');
      speedRef.current = 'max'; // the loop reads the mirror — sync before the first frame
      setPlaying(true);
      playingRef.current = true; // …and the guard, before the first frame
      clockRef.current = 0;
      carvedRef.current = 0;
      staleRef.current = false;
      postedTargetRef.current = Number.MAX_SAFE_INTEGER;
      awaitingRef.current = true; // arm: progress may hold the last run's end
      startClock(); // the 'max' watch-loop (auto-pause at the end)
    } else {
      // done: keep the user's pill speed (a finished replay just pauses);
      // the speed rests at 1× only after dispose (build null above)
      stopClock();
      setPlaying(false);
      setCommit(null);
    }
  }, [state.running, state.build, startClock, stopClock]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      stopClock();
      if (minutesPerSecond(speedRef.current) === null) {
        // 'max' pause (2026-10-27 revision): the worker is driving to MAX —
        // retarget it DOWN to the carved position so it parks where it is
        // (a lower target just stops it at its cursor — that is correct)
        const carved = carvedRef.current;
        postedTargetRef.current = carved;
        sendRef.current({ type: 'carve', throughMove: carved });
      }
      // finite speeds: stop the rAF clock; the worker parks at its current
      // posted target (the clock never got past it)
      setPlaying(false);
      return;
    }
    // play AT the end = return-to-start then play (the spec's only way
    // back to the top — there is no separate rewind-from-here)
    if (totalRef.current > 0 && positionRef.current >= totalRef.current) {
      if (carvedRef.current > 0) {
        staleRef.current = true;
        carvedRef.current = 0;
        sendRef.current({ type: 'reset' });
      }
      commitTo(0);
    }
    if (minutesPerSecond(speedRef.current) === null) {
      // max: one flat-out carve to the end (from wherever the worker is) —
      // await THIS run's first progress (the loop's end-check would
      // otherwise read the pre-reset final move and kill the replay)
      postedTargetRef.current = Number.MAX_SAFE_INTEGER;
      staleRef.current = false;
      awaitingRef.current = true;
      sendRef.current({ type: 'carve', throughMove: Number.MAX_SAFE_INTEGER });
    }
    // the bar follows the CARVED position while playing (per spec) — drop
    // the paused commit, the clock owns the targets from here.
    // PLAY RESYNC (her 2026-10-29 lockup report): the clock may sit BEHIND
    // the worker's carved cursor — a max pause parks it (posted=carved),
    // pill cycles while PAUSED never re-sync the clock, and a play then
    // starts the clock minutes-of-simulation behind: no clock target
    // exceeds the posted park for real minutes, nothing is posted, the
    // readout freezes mid-"playing". Sync the clock to the carved cursor
    // so play always resumes FROM THE TRUTH, never from a stale clock.
    const carvedOnPlay = Math.min(carvedRef.current, totalRef.current);
    clockRef.current = Math.max(clockRef.current, simMinutesAtMove(cumRef.current, carvedOnPlay));
    setCommit(null);
    setPlaying(true);
    playingRef.current = true; // sync BEFORE the first frame — a batched
    // render may not have committed when rAF fires (the pill cycles above
    // queue state updates), and the loop's first-frame guard reads this
    // ref: a stale false kills the loop on frame one, playing shows true,
    // and the transport is dead until a re-click (her lockup report)
    startClock();
  }, [commitTo, startClock, stopClock]);

  const returnToStart = useCallback(() => {
    setPlaying(false);
    stopClock();
    // always rewind the worker: commitTo(0) posts reset only when BEHIND
    // the carved position, but a parked-at-0 worker still holds its carved
    // grid — force the reset so the stock visibly refills
    if (carvedRef.current > 0) {
      staleRef.current = true;
      carvedRef.current = 0;
      sendRef.current({ type: 'reset' });
    }
    commitTo(0);
  }, [commitTo, stopClock]);

  const stepForward = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false);
      if (minutesPerSecond(speedRef.current) === null) {
        // stepping out of a max run parks the worker at the carved
        // position (the same max-pause retarget) — otherwise it keeps
        // carving to the end while the user steps
        postedTargetRef.current = carvedRef.current;
        sendRef.current({ type: 'carve', throughMove: carvedRef.current });
      }
    }
    stopClock();
    commitTo(positionRef.current + 1);
  }, [commitTo, stopClock]);

  const scrubTo = useCallback(
    (k: number) => {
      if (playingRef.current) {
        setPlaying(false);
        if (minutesPerSecond(speedRef.current) === null) {
          // same max-park as step: the commit below decides behind/ahead
          // against the parked position, not against a still-running one
          postedTargetRef.current = carvedRef.current;
          sendRef.current({ type: 'carve', throughMove: carvedRef.current });
        }
      }
      stopClock();
      commitTo(k);
    },
    [commitTo, stopClock],
  );

  const cycleSpeed = useCallback(() => {
    const next = cycle(speedRef.current);
    if (playingRef.current) {
      // the freshest carved position — progress messages update carvedRef
      // asynchronously (a state effect), so read the mirror the loop sees;
      // a STALE carved here rewound the clock behind the worker's cursor
      // and the rising-gate dead-locked the replay (her lockup report)
      const carvedNow = Math.min(carvedRef.current, totalRef.current);
      const mps = minutesPerSecond(next);
      if (mps === null) {
        // finite → max mid-flight: point the worker at the end (MAX, per
        // the launch/resume semantics), keep the clock synced to the
        // carved spot for a clean switch back
        clockRef.current = simMinutesAtMove(cumRef.current, carvedNow);
        postedTargetRef.current = Number.MAX_SAFE_INTEGER;
        awaitingRef.current = true; // same arm: this is a fresh max carve
        sendRef.current({ type: 'carve', throughMove: Number.MAX_SAFE_INTEGER });
      } else if (minutesPerSecond(speedRef.current) === null) {
        // max → finite mid-flight: the worker was driving to MAX — park it
        // at the carved position (a max-pause retarget), restart the clock
        // AT THE CARVED SPOT (never behind — the park lands late, past the
        // target, when the worker was mid-slice; a behind clock stalls the
        // rising-gate), and let the re-targets pick the carve back up
        clockRef.current = simMinutesAtMove(cumRef.current, carvedNow);
        postedTargetRef.current = carvedNow;
        sendRef.current({ type: 'carve', throughMove: carvedNow });
        lastWallRef.current = performance.now();
      }
    }
    setSpeed(next);
  }, []);

  // stop the loop on unmount
  useEffect(() => stopClock, [stopClock]);

  return {
    playing,
    position,
    totalMoves,
    speed,
    label: speedLabel(speed),
    togglePlay,
    returnToStart,
    stepForward,
    scrubTo,
    cycleSpeed,
  };
}
