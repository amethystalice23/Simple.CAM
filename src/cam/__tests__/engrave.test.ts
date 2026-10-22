import { describe, expect, it } from 'vitest';
import { engrave } from '../engrave';
import { ROTARY_FEED_DEG_MIN } from '../faceCylinder';
import type { EngraveParams } from '../engrave';

const base: EngraveParams = {
  id: 'e1',
  toolId: 't1',
  paths: [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  ],
  depth: 1,
  stepDown: 1,
  feed: 400,
  plungeFeed: 100,
  clearance: 5,
  frame: { kind: 'flat', surfaceZ: 10 },
};

describe('engrave: flat frame', () => {
  it('traces the path at the cut feed with a plunge and a lift', () => {
    const res = engrave(base);
    const cut = res.moves.filter((m) => !m.rapid);
    // plunge to Z9 (surface 10 − 1 deep), then the XY trace
    expect(cut).toHaveLength(2);
    expect(cut[0].words.z).toBeCloseTo(9, 6);
    expect(cut[0].words.x).toBeUndefined();
    expect(cut[1].words.x).toBeCloseTo(10, 6);
    expect(cut[1].words.y).toBeCloseTo(0, 6);
    expect(cut[1].feed).toBe(400); // G94 mm/min
    expect(res.moves[0].rapid).toBe(true); // lift before positioning
    expect(res.moves[res.moves.length - 1].rapid).toBe(true); // lift after
    expect(res.effectiveFeed).toBe(400);
    expect(res.estimatedMinutes).toBeCloseTo(1 / 100 + 10 / 400, 6);
  });

  it('ladders depth levels, each level retracing the path', () => {
    const res = engrave({ ...base, depth: 1, stepDown: 0.4 }); // levels 0.4, 0.8, 1.0
    const zs = res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z);
    expect(zs).toEqual([9.6, 9.2, 9.0]);
    // traces alternate direction: level 0 forward to x=10, level 1 back to 0
    const xMoves = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(xMoves[0].words.x).toBeCloseTo(10, 6);
    expect(xMoves[1].words.x).toBeCloseTo(0, 6);
    expect(xMoves[2].words.x).toBeCloseTo(10, 6);
  });

  it('positions and lifts per path', () => {
    const res = engrave({
      ...base,
      paths: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ],
      ],
    });
    // a rapid to each path's start (XY), and a lift between them
    const rapids = res.moves.filter((m) => m.rapid && m.words.x !== undefined);
    expect(rapids).toHaveLength(2);
    expect(rapids[1].words.x).toBeCloseTo(5, 6);
    expect(rapids[1].words.y).toBeCloseTo(5, 6);
  });
});

describe('engrave: wrapped frame', () => {
  const R = 8; // Ø16 stock — the coupon rod
  const wrapped: EngraveParams = {
    ...base,
    frame: { kind: 'wrapped', radius: R, surfaceZ: R, datumAngle: 0, startA: 0 },
  };

  it('A-only segments (circumferential lines) run G94 at the rotary limit', () => {
    // a quarter turn around the Ø16: U = πR/2 → ΔA = 90°
    const res = engrave({
      ...wrapped,
      paths: [
        [
          { x: 0, y: 0 },
          { x: (Math.PI * R) / 2, y: 0 },
        ],
      ],
    });
    const cut = res.moves.filter((m) => !m.rapid);
    expect(cut).toHaveLength(2); // plunge + one A sweep
    const sweep = cut[1];
    expect(sweep.words.a).toBeCloseTo(90, 4);
    expect(sweep.words.x).toBeUndefined();
    expect(sweep.feed).toBe(ROTARY_FEED_DEG_MIN); // deg/min at the limit
    // the honest surface speed: MAX_ROTARY_RPM × π·Ø ≈ 332 mm/min
    expect(res.effectiveFeed).toBeCloseTo(6.6 * Math.PI * 16, -1);
  });

  it('axial segments (V lines) run G94 at the cut feed', () => {
    const res = engrave({
      ...wrapped,
      paths: [
        [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      ],
    });
    const axial = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(axial[0].words.x).toBeCloseTo(10, 6);
    expect(axial[0].words.a).toBeUndefined();
    expect(axial[0].feed).toBe(400);
    expect(res.effectiveFeed).toBe(400);
  });

  it('diagonal segments run G93 at 1/time from the BINDING constraint', () => {
    const dU = 10;
    const dV = 10;
    const res = engrave({
      ...wrapped,
      feed: 1000, // fast enough that the rotary limit binds
      paths: [
        [
          { x: 0, y: 0 },
          { x: dU, y: dV },
        ],
      ],
    });
    const diag = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(diag).toHaveLength(1);
    const dA = (dU / R) * (180 / Math.PI);
    expect(diag[0].words.a).toBeCloseTo(dA, 4);
    expect(diag[0].words.x).toBeCloseTo(10, 6);
    const len = Math.hypot(dU, dV);
    const t = Math.max(len / 1000, (dA / 360) / 6.6);
    expect(diag[0].feed).toBeCloseTo(1 / t, 6); // inverse minutes
    expect(res.effectiveFeed).toBeCloseTo(len / t, 3);
  });

  it('feeds the full surface rate when the rotary limit does not bind', () => {
    const res = engrave({
      ...wrapped,
      feed: 100,
      paths: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
      ],
    });
    const diag = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(diag[0].feed).toBeCloseTo(1 / (Math.hypot(10, 10) / 100), 6); // G93: 1/minutes — the linear rate rides at the feed
    expect(res.effectiveFeed).toBeCloseTo(100, 3);
  });

  it('positions each path from the index datum by the shortest rotation', () => {
    const res = engrave({
      ...wrapped,
      frame: { kind: 'wrapped', radius: R, surfaceZ: R, datumAngle: 90, startA: 350 },
      paths: [
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
      ],
    });
    // datum 90 from A350: +100 forward, never −260 back
    const position = res.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    expect(position.words.a).toBeCloseTo(450, 4);
    expect(Math.abs(position.words.a! - 350)).toBeLessThanOrEqual(180);
  });

  it('keeps A continuous across the paths of one op', () => {
    const quarter = (Math.PI * R) / 2;
    const res = engrave({
      ...wrapped,
      depth: 1,
      stepDown: 1,
      paths: [
        [
          { x: 0, y: 0 },
          { x: quarter, y: 0 },
        ],
        [
          { x: 0, y: 5 },
          { x: 0, y: 6 },
        ],
      ],
    });
    const aRapids = res.moves.filter((m) => m.rapid && m.words.a !== undefined);
    // path 1 ends at A90; path 2 starts back at the datum: shortest is −90
    expect(aRapids).toHaveLength(2);
    expect(aRapids[0].words.a).toBeCloseTo(0, 4);
    expect(aRapids[1].words.a).toBeCloseTo(0, 4); // 90 → 0 the short way
  });
});

describe('engrave: validation', () => {
  it('rejects degenerate parameters with diagnosis', () => {
    expect(() => engrave({ ...base, depth: 0 })).toThrowError(/depth/);
    expect(() => engrave({ ...base, stepDown: 0 })).toThrowError(/stepDown/);
    expect(() => engrave({ ...base, paths: [] })).toThrowError(/at least one path/);
    expect(() =>
      engrave({ ...base, paths: [[{ x: 0, y: 0 }]] }),
    ).toThrowError(/two points/);
  });
});