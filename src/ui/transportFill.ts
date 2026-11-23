/**
 * The scrub bar's two-layer redraw display (2026-11-23, Alice's spec):
 * a backward step or scrub commits a target the worker must RESET and
 * RE-CARVE to — voxels cannot un-carve — and while that runs the bar
 * turns the old fill YELLOW, holding the committed target in place,
 * and redraws the GREEN over the top to the worker's carved cursor.
 * When the carve reaches the target the green covers the yellow and
 * the yellow layer drops: hidden, and semantically done. A forward
 * step flashes the same overlay for the instant its one move carves.
 *
 * Pure logic, unit-pinned: the bar renders the verdict. No overlay
 * while playing (the bar already follows the carve) or mid-drag (the
 * preview owns the bar until the release commits).
 */

export interface TransportFillState {
  playing: boolean;
  /** the scrub-drag preview (null = not dragging) */
  preview: number | null;
  /** the committed transport position — the readout's number */
  position: number;
  /** the worker's carved cursor (0 while a reset is in flight) */
  carved: number;
  totalMoves: number;
}

export interface TransportFill {
  /** the yellow pending layer's width, 0–100 — null = not shown */
  pendingPct: number | null;
  /** the green fill's width, 0–100 */
  fillPct: number;
}

export function transportFill(s: TransportFillState): TransportFill {
  const pct = (v: number): number => (s.totalMoves > 0 ? (100 * v) / s.totalMoves : 0);
  const redrawing =
    s.preview === null && !s.playing && s.carved < s.position - 1e-9;
  if (!redrawing) return { pendingPct: null, fillPct: pct(s.preview ?? s.position) };
  return { pendingPct: pct(s.position), fillPct: pct(s.carved) };
}
