/**
 * Pins for the scrub bar's redraw overlay (2026-11-23, Alice's spec):
 * while a backward re-carve runs, the committed target holds as a
 * YELLOW layer and the green redraws over it to the carved cursor;
 * when the carve reaches the target the yellow drops. No overlay while
 * playing (the bar follows the carve) or mid-drag (the preview owns
 * the bar until the release commits).
 */
import { describe, expect, it } from 'vitest';
import { transportFill } from '../transportFill';

const pct = (v: number, total: number) => (100 * v) / total;

describe('transportFill — the redraw overlay', () => {
  it('a backward re-carve in flight: yellow holds the target, green the carve', () => {
    const f = transportFill({ playing: false, preview: null, position: 140, carved: 37, totalMoves: 141 });
    expect(f.pendingPct).toBeCloseTo(pct(140, 141), 9);
    expect(f.fillPct).toBeCloseTo(pct(37, 141), 9);
  });

  it('the carve caught up: green covers the yellow, the yellow drops', () => {
    const f = transportFill({ playing: false, preview: null, position: 140, carved: 140, totalMoves: 141 });
    expect(f.pendingPct).toBeNull();
    expect(f.fillPct).toBeCloseTo(pct(140, 141), 9);
  });

  it('a reset just posted shows the carve from zero under the target', () => {
    const f = transportFill({ playing: false, preview: null, position: 140, carved: 0, totalMoves: 141 });
    expect(f.pendingPct).toBeCloseTo(pct(140, 141), 9);
    expect(f.fillPct).toBe(0);
  });

  it('playing: the bar follows the carve, no overlay', () => {
    const f = transportFill({ playing: true, preview: null, position: 37, carved: 37, totalMoves: 141 });
    expect(f.pendingPct).toBeNull();
    expect(f.fillPct).toBeCloseTo(pct(37, 141), 9);
  });

  it('a drag preview owns the bar even mid-redraw — the release re-commits', () => {
    const f = transportFill({ playing: false, preview: 20, position: 140, carved: 37, totalMoves: 141 });
    expect(f.pendingPct).toBeNull();
    expect(f.fillPct).toBeCloseTo(pct(20, 141), 9);
  });

  it('an empty job shows nothing', () => {
    const f = transportFill({ playing: false, preview: null, position: 0, carved: 0, totalMoves: 0 });
    expect(f.pendingPct).toBeNull();
    expect(f.fillPct).toBe(0);
  });
});
