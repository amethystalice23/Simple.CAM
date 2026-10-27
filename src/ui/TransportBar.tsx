/**
 * The simulation transport bar (2026-10-27, Alice's spec): a floating
 * widget across the viewport's BOTTOM-CENTER, visible only while the
 * Simulation layer tick is on AND a completed simulation exists. Left to
 * right: play/pause, return-to-start (NO step-back — dropped deliberately),
 * step-forward, scrub bar, speed pill (immediately adjacent to the bar's
 * right end), move readout (trails last, muted). Styling follows the
 * projection-pill/layers-button floating-widget pattern.
 */

import { useCallback, useRef, useState } from 'react';
import type { SimTransport } from './useSimTransport';

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

  return (
    <div className="transport-bar">
      <button
        type="button"
        className="transport-btn"
        title={playing ? 'Pause the simulation playback' : 'Play the simulation (at the end: rewind and play)'}
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
        title="Step one move forward (pauses playback)"
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
        title="Playback speed — simulated minutes per second of playback. 'max' runs the carve flat out."
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
