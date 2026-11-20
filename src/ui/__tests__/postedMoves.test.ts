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
        kind: 'pocket',
        toolId: 't-flat',
        moves: [mv({ z: 5 }, 0, { rapid: true }), mv({ x: 10, z: -1 }), mv({ x: 0 })],
        stepDown: 1,
      },
      {
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
      { kind: 'pocket', toolId: 't-flat', moves: [mv({ x: 5 })], stepDown: 1 },
      { kind: 'profile', toolId: 't-ball', moves: [mv({ x: 6 })], stepDown: 1 },
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
});
