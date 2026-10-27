import { describe, expect, it } from 'vitest';
import type { Move, Stock } from '../../core/types';
import { faceCylinder } from '../../cam/faceCylinder';
import { movesToSegments } from '../toolpathPreview';

const cylinderStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};

/** a box riding the rotary axis: derived axisZ at the Z-span center
 * (z origin 'min', sizeZ 10 → axisZ 5), effective radius hypot(40,10)/2 */
const boxStock4: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 100,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'mid', z: 'min' },
  axisMode: '4-axis',
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
      stepOver: 4.8, // explicit — was the pre-setting derived default for a 6mm cutter
      finishAllowance: 0.2,
      plungeFeed: 300,
      feed: 500,
      rotation: 'cw',
      pattern: 'spiral',
      // tail stock cut-over: the raw spiral — the preview pins are against
      // the helical entries, not the squared-edge ring sequence (which
      // carries no X-word rings; cut-over keeps exactly the old shape)
      cutBeyondStock: true,
    } as const;
    const tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 } as const;
    const res = faceCylinder(op, cylinderStock.calibration, tool);
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

  it('A-only feed moves draw (vertical rings); A-only rapids stay invisible', () => {
    const moves: Move[] = [
      { words: { x: 10, z: 30, a: 0 }, feed: 0, rapid: true }, // approach at safe Z
      { words: { z: 24 }, feed: 300 }, // plunge to depth 1 (surface 25)
      { words: { a: 360 }, feed: 2376 }, // full-revolution ring: A-only CUT
      { words: { a: 540 }, feed: 0, rapid: true }, // index-style rapid: invisible
      { words: { x: 15 }, feed: 500 }, // flat move at A=540 (≡180°)
    ];
    const segs = movesToSegments(moves, cylinderStock);
    // plunge + ring (24 chords of 15°) + the post-index sweep; no rapids
    // (the approach only positions, the index rapid draws nothing)
    expect(segs.rapid).toEqual([]);
    expect(segs.feed.length / 6).toBe(26);
    // the plunge is vertical at the tool position, not a diagonal to top-center
    expect(segs.feed.slice(0, 6)).toEqual([10, 0, 30, 10, 0, 24]);
    // the ring sweeps a full circle at the cut radius: chord 6 of the
    // subdivision (75°→90°) ends at the 3 o'clock point of radius 24
    const mid = segs.feed.slice(6 * 6, 6 * 7);
    expect(mid[4]).toBeCloseTo(24, 1); // mapped Y
    expect(mid[5]).toBeCloseTo(0, 1); // mapped Z (axis at 0)
    // the flat move un-rotates by the accumulated A=540 (≡180°): it ends at
    // the bottom of the display cylinder, not back on top
    const tail = segs.feed.slice(6 * 25);
    expect(tail[3]).toBeCloseTo(15, 9); // x
    expect(tail[4]).toBeCloseTo(0, 1);
    expect(tail[5]).toBeCloseTo(-24, 1);
  });

  it('a facing plunge draws at the angle the stock sits at, not top-center', () => {
    const moves: Move[] = [
      { words: { x: 0, z: 30, a: 0 }, feed: 0, rapid: true }, // approach
      { words: { x: 0, z: 30, a: 90 }, feed: 0, rapid: true }, // rotate to pass angle
      { words: { z: 24 }, feed: 300 }, // plunge with the stock at A=90
      { words: { x: 50 }, feed: 500 }, // sweep the pass
    ];
    const segs = movesToSegments(moves, cylinderStock);
    // the plunge is vertical IN THE DISPLAY FRAME — from the A=90 safe point
    // down to the A=90 cut point, both mapped to the 3 o'clock side
    const plunge = segs.feed.slice(0, 6);
    expect(plunge[1]).toBeCloseTo(30, 1); // mapped Y at safe Z
    expect(plunge[4]).toBeCloseTo(24, 1); // mapped Y at depth: radius 24
    expect(plunge[3]).toBeCloseTo(plunge[0], 9); // same x — vertical, not diagonal
    expect(plunge[5]).toBeCloseTo(0, 1); // z stays at the axis height
    // the sweep runs along x at that same mapped angle
    const sweep = segs.feed.slice(6, 12);
    expect(sweep[1]).toBeCloseTo(24, 1); // start Y
    expect(sweep[4]).toBeCloseTo(24, 1); // end Y — constant angle, not a diagonal
    expect(sweep[3]).toBeCloseTo(50, 9); // x advance
  });

  it('maps rotary moves under a 4-axis box via the derived axisZ', () => {
    // index-style A-only rapid (invisible) turns the box 90°; the flat sweep
    // after it un-rotates about the DERIVED axis (Z-span center, here z=5):
    // machine (50, 0, 25) at A=90 draws at (50, 20, 5) — radius 20 about z=5
    const moves: Move[] = [
      { words: { x: 0, y: 0, z: 25 }, feed: 0, rapid: true }, // position only
      { words: { a: 90 }, feed: 0, rapid: true }, // rotate the box (invisible)
      { words: { x: 50 }, feed: 500 }, // sweep with the stock at A=90
    ];
    const segs = movesToSegments(moves, boxStock4);
    expect(segs.rapid).toEqual([]); // position + index rapid draw nothing
    expect(segs.feed.length / 6).toBe(1);
    const end = segs.feed.slice(3, 6);
    expect(end[0]).toBeCloseTo(50, 9); // x unchanged
    expect(end[1]).toBeCloseTo(20, 9); // mapped Y: radius 20 at 3 o'clock
    expect(end[2]).toBeCloseTo(5, 9); // mapped Z: the derived axis height
    // 3-axis mode: the same moves draw raw — no rotary mapping at all
    const flat = movesToSegments(moves, { ...boxStock4, axisMode: '3-axis' });
    expect(flat.feed.slice(3, 6)).toEqual([50, 0, 25]);
  });
});