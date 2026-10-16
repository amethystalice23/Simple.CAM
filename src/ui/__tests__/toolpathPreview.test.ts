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

    // first helical entry: plunge to Z24 while A advances to 90° — on the
    // un-rotated stock the cut lands on the cylinder side at (x, 24, 0)
    const plungeSeg = segs.feed.slice(0, 6);
    expect(plungeSeg[2]).toBeCloseTo(25 + 5, 1); // from safe Z (surface+5)
    expect(plungeSeg[5]).toBeCloseTo(0, 1); // mapped onto the axis plane
    // the segment's mapped end radius is 24 (surface 25 − 1 depth)
    expect(Math.hypot(plungeSeg[4], plungeSeg[5])).toBeCloseTo(24, 1);
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

  it('draws no segment for a pure-A index move (the stock rotates, not the tool)', () => {
    const moves: Move[] = [
      { words: { x: 5, y: 5, z: 30 }, feed: 0, rapid: true }, // position only
      { words: { x: 5, y: 5, z: 0 }, feed: 500 }, // plunge to the surface
      { words: { a: 180 }, feed: 0, rapid: true }, // Index op: draws nothing
      { words: { x: 10, y: 5, z: 30 }, feed: 500 }, // retract after indexing
    ];
    const segs = movesToSegments(moves, cylinderStock);
    // both feed segments start from real tool positions — the index move
    // contributes none, and its wrapped phantom (5, −5, −30) never appears
    expect(segs.feed.length / 6).toBe(2);
    expect(segs.rapid).toEqual([]);
    const zs = [segs.feed[2], segs.feed[5], segs.feed[8], segs.feed[11]];
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1); // nothing at z=−30
    // the post-index move continues from the last real position (5, 5, 0)
    expect(segs.feed.slice(6, 12)).toEqual([5, 5, 0, 10, 5, 30]);
  });
});