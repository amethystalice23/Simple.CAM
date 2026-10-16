import { describe, expect, it } from 'vitest';
import type { Move, Stock } from '../../core/types';
import { faceCylinder } from '../../cam/faceCylinder';
import { movesToSegments } from '../toolpathPreview';

const cylinderStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  materialId: 'aluminum-6061',
};

describe('movesToSegments', () => {
  it('separates feed and rapid segments with modal axis accumulation', () => {
    const moves: Move[] = [
      { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true },
      { words: { z: 0 }, feed: 200 }, // x,y modal from previous
      { words: { x: 10, y: 0 }, feed: 500 }, // z modal from previous
      { words: { z: 5 }, feed: 0, rapid: true },
    ];
    const segs = movesToSegments(moves, null);
    // 3 moves close segments — the first only positions the tool
    expect(segs.rapid.length / 6).toBe(1);
    expect(segs.feed.length / 6).toBe(2);
    // the plunge segment ends at (0, 0, 0) — modal x/y carried over
    expect(segs.feed.slice(0, 6)).toEqual([0, 0, 5, 0, 0, 0]);
    // the retract runs back up from the cut end
    expect(segs.rapid.slice(0, 6)).toEqual([10, 0, 0, 10, 0, 5]);
  });

  it('wraps rotary moves back onto the cylinder for preview', () => {
    const op = {
      kind: 'faceCylinder',
      id: 'op1',
      toolId: 't1',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 100,
      stepDown: 1,
      finishAllowance: 0.2,
      plungeFeed: 300,
      rotation: 'cw',
    } as const;
    const tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 } as const;
    const res = faceCylinder(op, cylinderStock, tool);
    const segs = movesToSegments(res.moves, cylinderStock);
    expect(segs.feed.length).toBeGreaterThan(0);

    // the first helical entry (Δa=90°) is subdivided into 15° chords — 6
    // sub-segments, 36 numbers — and its final mapped point lands on the
    // cylinder side at radius 24 (surface 25 − 1 depth), angle 90°
    const plungePts = segs.feed.slice(0, 36);
    expect(plungePts[2]).toBeCloseTo(25 + 5, 1); // starts at safe Z (surface+5)
    const lastX = plungePts[33];
    const lastY = plungePts[34];
    const lastZ = plungePts[35];
    expect(Math.hypot(lastY, lastZ)).toBeCloseTo(24, 1); // mapped end radius
    expect(lastY).toBeCloseTo(24, 0); // at the 3 o'clock position
    expect(lastZ).toBeCloseTo(0, 0);
    // the long sweep (7500°) is subdivided into many chords, not one line
    const sweepCount = segs.feed.length / 6;
    expect(sweepCount).toBeGreaterThan(500);
    void lastX;
  });

  it('draws nothing from a phantom origin — the first move only positions', () => {
    const moves: Move[] = [
      { words: { x: 1, y: 2, z: 0 }, feed: 100 },
      { words: { x: 3, y: 2 }, feed: 100 },
    ];
    const segs = movesToSegments(moves, null);
    // one segment between the two moves, none into the first position
    expect(segs.feed).toEqual([1, 2, 0, 3, 2, 0]);
    expect(segs.rapid).toEqual([]);
  });

  it('index moves draw nothing; flat paths under a datum un-rotate over the feature', () => {
    const moves: Move[] = [
      { words: { x: 5, y: 5, z: 30 }, feed: 0, rapid: true }, // position only
      { words: { x: 5, y: 5, z: 0 }, feed: 500 }, // plunge to the surface
      { words: { a: 180 }, feed: 0, rapid: true }, // Index op: draws nothing
      { words: { x: 10, y: 5, z: 30 }, feed: 500 }, // retract after indexing
    ];
    const segs = movesToSegments(moves, cylinderStock);
    // the index move contributes no segment (no phantom line into it), and
    // the post-index move un-rotates by the datum: (10, 5, 30) machine →
    // (10, −5, −30) in the display frame — over the mirrored feature
    expect(segs.feed.length / 6).toBe(2);
    expect(segs.rapid).toEqual([]);
    const tail = segs.feed.slice(6, 12);
    expect(tail.slice(0, 4)).toEqual([5, 5, 0, 10]);
    expect(tail[4]).toBeCloseTo(-5, 9); // cos(π) is not exactly −1
    expect(tail[5]).toBeCloseTo(-30, 9);
  });
});