/** Tests for buildPostedStream — item 13's posted-moves pipeline. */
import { describe, expect, it } from 'vitest';
import type { Move, Tool } from '../../core/types';
import { buildPostedStream } from '../postedMoves';

const flat: Tool = {
  id: 't-flat',
  name: 'Flat 3.175',
  type: 'flat',
  diameter: 3.175,
  fluteLength: 12,
  spindleRpm: 12000,
};

const ball: Tool = {
  id: 't-ball',
  name: 'Ball 3',
  type: 'ball',
  diameter: 3,
  fluteLength: 10,
  spindleRpm: 10000,
};

const mv = (words: Move['words'], feed = 500, extra: Partial<Move> = {}): Move => ({
  words,
  feed,
  ...extra,
});

describe('buildPostedStream', () => {
  it('round-trips a simple op list through the post and back', () => {
    const ops = [
      {
        id: 'op1',
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ z: 5 }, 0, { rapid: true }), mv({ x: 10, z: -1 }), mv({ x: 0 })],
        stepDown: 1,
      },
      {
        id: 'op2',
        kind: 'profile',
        toolId: 't-ball',
        moves: [mv({ y: 5 }, 0, { rapid: true }), mv({ x: 10, y: 10, z: -2 })],
        stepDown: 1,
      },
    ];
    const s = buildPostedStream(ops, [flat, ball], new Map([['t-flat', 1], ['t-ball', 2]]));
    // the parsed stream carries the post's real moves (positioning + cuts)
    expect(s.moves.length).toBeGreaterThan(0);
    // every parsed move resolves a tool when its op carries one
    const t0 = s.toolOf(0);
    expect(t0).not.toBe(0xffff);
    // both ops' tools are resolvable and distinct
    const toolsSeen = new Set<number>();
    for (let i = 0; i < s.moves.length; i++) toolsSeen.add(s.toolOf(i));
    expect(toolsSeen.size).toBeGreaterThanOrEqual(2);
  });

  it('maps parsed moves to the tools table by the file T-numbers', () => {
    const ops = [
      { id: 'op1', kind: 'pocket', toolId: 't-flat', moves: [mv({ x: 5 })], stepDown: 1 },
      { id: 'op2', kind: 'profile', toolId: 't-ball', moves: [mv({ x: 6 })], stepDown: 1 },
    ];
    const nums = new Map([['t-flat', 1], ['t-ball', 2]]);
    const s = buildPostedStream(ops, [flat, ball], nums);
    // tool index 0 = flat, 1 = ball
    let sawFlat = false;
    let sawBall = false;
    for (let i = 0; i < s.moves.length; i++) {
      const t = s.toolOf(i);
      if (t === 0) sawFlat = true;
      if (t === 1) sawBall = true;
    }
    expect(sawFlat).toBe(true);
    expect(sawBall).toBe(true);
  });

  it('empty ops produce an empty stream', () => {
    const s = buildPostedStream([], [flat], new Map());
    expect(s.moves).toEqual([]);
    expect(s.toolOf(0)).toBe(0xffff);
  });

  it('computes per-op machine minutes over the parsed stream (motion + ramp)', () => {
    // op 1: a 10mm X cut at F500 (0.02 min) + spindle 10000 ramp from cold
    // (10000/1800/60 min); op 2: a 5mm Y cut at F500 (0.01 min), spindle
    // 10000 → 12000 ramp charged to op 2
    const ops = [
      {
        id: 'op1',
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ z: 5 }, 0, { rapid: true }), mv({ x: 10, z: -1 }, 500, { spindleRpm: 10000 })],
        stepDown: 1,
      },
      {
        id: 'op2',
        kind: 'profile',
        toolId: 't-ball',
        moves: [mv({ y: 5 }, 500, { spindleRpm: 12000 })],
        stepDown: 1,
      },
    ];
    const s = buildPostedStream(ops, [flat, ball], new Map([['t-flat', 1], ['t-ball', 2]]));
    expect(s.opMinutes).toHaveLength(2);
    const ramp1 = 10000 / 1800 / 60;
    const ramp2 = Math.abs(12000 - 10000) / 1800 / 60;
    // op 1: rapid (z 5, ~0.008 min) + cut 0.02 + ramp — loose bounds so the
    // rapid's exact distance doesn't pin the test
    expect(s.opMinutes[0]).toBeGreaterThan(0.02 + ramp1);
    expect(s.opMinutes[0]).toBeLessThan(0.02 + ramp1 + 0.05);
    // op 2's rapid repositioning here is zero-distance, so its minutes are
    // exactly the cut + the 2000-rpm ramp
    expect(s.opMinutes[1]).toBeGreaterThanOrEqual(0.01 + ramp2);
    expect(s.opMinutes[1]).toBeLessThan(0.01 + ramp2 + 0.05);
  });

  it('charges no ramp when consecutive ops run the same speed', () => {
    const ops = [
      {
        id: 'op1',
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ x: 5 }, 500, { spindleRpm: 10000 })],
        stepDown: 1,
      },
      {
        id: 'op2',
        kind: 'profile',
        toolId: 't-flat', // same tool, same speed
        moves: [mv({ x: 10 }, 500, { spindleRpm: 10000 })],
        stepDown: 1,
      },
    ];
    const s = buildPostedStream(ops, [flat], new Map([['t-flat', 1]]));
    // op 2's minutes are pure motion: 5mm at F500 = 0.01 min, ± the
    // post's inserted positioning rapids (small)
    expect(s.opMinutes[1]).toBeGreaterThan(0.005);
    expect(s.opMinutes[1]).toBeLessThan(0.08);
  });

  it('threads the op ids onto the parsed moves (per-op preview colouring)', () => {
    const ops = [
      {
        id: 'pocket-row',
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ z: 5 }, 0, { rapid: true }), mv({ x: 10, z: -1 })],
        stepDown: 1,
      },
      {
        id: 'profile-row',
        kind: 'profile',
        toolId: 't-ball',
        moves: [mv({ x: 3, z: -2 }, 500)],
        stepDown: 1,
      },
    ];
    const s = buildPostedStream(ops, [flat, ball], new Map([['t-flat', 1], ['t-ball', 2]]));
    expect(s.moveOpIds.length).toBe(s.moves.length);
    // every parsed move answers to its op row; the only legal unowned
    // move is the file's opening G0 Y0 centerline rapid (pre-first-op,
    // emitted by the header) — at most one null
    const ids = new Set(s.moveOpIds);
    expect(ids.has('pocket-row')).toBe(true);
    expect(ids.has('profile-row')).toBe(true);
    expect(s.moveOpIds.filter((id) => id === null).length).toBeLessThanOrEqual(1);
  });

  it("toolOf indexes the CALLER'S tools table, never the export list (spiral shank-ghost regression, 2026-11-23)", () => {
    // the library-shaped table the worker builds its spec list from: the
    // op's tool sits at slot 1, a short-flute decoy at slot 0. The export
    // list holds only the op's tool, so its own index is 0 — the old
    // mapping carved the whole job with the decoy and painted phantom red
    // shank contacts (41,458 moves on the spiral_test waterline)
    const decoy: Tool = {
      id: 't-decoy',
      name: 'Ball 1',
      type: 'ball',
      diameter: 1,
      fluteLength: 3,
      spindleRpm: 18000,
    };
    const ops = [
      {
        id: 'op1',
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ z: 5 }, 0, { rapid: true }), mv({ x: 10, z: -1 }), mv({ x: 0 })],
        stepDown: 1,
      },
    ];
    const library = [decoy, flat];
    const s = buildPostedStream(ops, library, new Map([['t-flat', 1]]));
    for (let i = 0; i < s.moves.length; i++) {
      const ti = s.toolOf(i);
      expect(ti).not.toBe(0xffff);
      expect(ti).toBe(1); // the flat's slot in the CALLER's table
      expect(library[ti].id).toBe('t-flat'); // what the worker would carve with
    }
  });
});
