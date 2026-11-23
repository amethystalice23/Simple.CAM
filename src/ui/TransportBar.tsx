/**
 * The simulation transport bar (2026-10-27, Alice's spec): a floating
 * widget across the viewport's BOTTOM, visible only while the
 * Simulation layer tick is on AND a completed simulation exists. Left to
 * right: play/pause, return-to-start (the button row still has no
 * step-back), step-forward, scrub bar, speed pill (immediately adjacent
 * to the bar's right end), move readout (trails last, muted). Styling
 * follows the projection-pill/layers-button floating-widget pattern.
 *
 * Keyboard (2026-11-23, Alice's ask): space toggles play/pause, the
 * cursor keys step one move at a time — right forward, left back. The
 * keys live exactly as long as the bar does, and refuse typing, key
 * repeats (a backward step behind the carved cursor costs a full stock
 * reset), and modifier chords (transportKeys.ts, unit-pinned).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimTransport } from './useSimTransport';
import { transportKeyAction } from './transportKeys';

interface Props {
  transport: SimTransport;
}

export function TransportBar({ transport }: Props) {
  const {
    playing,
    position,
    totalMoves,
    label,
    togglePlay,
    returnToStart,
    stepForward,
    stepBack,
    scrubTo,
    cycleSpeed,
  } = transport;
  const barRef = useRef<HTMLDivElement>(null);
  /** dragging previews the position WITHOUT committing (commit is on
   *  release — scrub-behind costs a full grid rebuild, per spec) */
  const [scrubPreview, setScrubPreview] = useState<number | null>(null);
  const shown = scrubPreview ?? position;
  const pct = totalMoves > 0 ? (100 * shown) / totalMoves : 0;

  const moveFromEvent = useCallback(
    (clientX: number): number => {
      const bar = barRef.current;
      if (!bar || totalMoves <= 0) return 0;
      const rect = bar.getBoundingClientRect();
      const t = (clientX - rect.left) / Math.max(rect.width, 1);
      return Math.round(Math.min(Math.max(t, 0), 1) * totalMoves);
    },
    [totalMoves],
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (totalMoves <= 0) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setScrubPreview(moveFromEvent(e.clientX));
    },
    [moveFromEvent, totalMoves],
  );
  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubPreview === null) return;
      setScrubPreview(moveFromEvent(e.clientX));
    },
    [moveFromEvent, scrubPreview],
  );
  const onUp = useCallback(
    (e: React.PointerEvent) => {
      if (scrubPreview === null) return;
      setScrubPreview(null);
      scrubTo(moveFromEvent(e.clientX)); // the RELEASE commits
    },
    [moveFromEvent, scrubTo, scrubPreview],
  );

  // keyboard: space / cursor keys, active exactly while the bar exists.
  // preventDefault keeps a focused transport button from ALSO firing on
  // the space keyup — the transport's own action runs instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = transportKeyAction(e);
      if (action === null) return;
      e.preventDefault();
      if (action === 'togglePlay') togglePlay();
      else if (action === 'stepForward') stepForward();
      else stepBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, stepForward, stepBack]);

  return (
    <div className="transport-bar">
      <button
        type="button"
        className="transport-btn"
        title={playing ? 'Pause the simulation playback (space)' : 'Play the simulation — at the end, rewind and play (space)'}
        onClick={togglePlay}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        className="transport-btn"
        title="Return to start — resets the stock and re-carves from move 0"
        onClick={returnToStart}
      >
        ⏮
      </button>
      <button
        type="button"
        className="transport-btn"
        title="Step one move forward (pauses playback; → key, ← steps back)"
        onClick={stepForward}
      >
        ⏭
      </button>
      <div
        ref={barRef}
        className="transport-scrub"
        title="Drag to scrub — releasing re-carves to that move (scrubbing back rebuilds the stock)"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="transport-scrub-fill" style={{ width: `${pct}%` }} />
      </div>
      <button
        type="button"
        className="transport-speed"
        title="Playback speed — 1× plays in honest real time, N× that many times faster. 'max' runs the carve flat out."
        onClick={cycleSpeed}
      >
        {label}
      </button>
      <span className="transport-readout">
        {position.toLocaleString()} / {totalMoves.toLocaleString()}
      </span>
    </div>
  );
}
