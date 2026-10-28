import { describe, expect, it } from 'vitest';
import type { DrillOp, Tool } from '../../core/types';
import { drill } from '../drill';

const tool: Tool = { id: 't1', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };

function op(overrides: Partial<DrillOp> = {}): DrillOp {
  return {
    kind: 'drill',
    id: 'op1',
    toolId: 't1',
    targets: [{ x: 10, y: 20, topZ: 0, depth: 5 }],
    peckDepth: 2,
    plungeFeed: 300,
    safeClearance: 5,
    ...overrides,
  };
}

describe('drill', () => {
  it('pecks down with full chip-clear retracts', () => {
    const res = drill(op(), tool);
    expect(res.holes).toBe(1);
    const zs = res.moves.map((m) => m.words.z).filter((z): z is number => z !== undefined);
    // rapid to safe, approach, pecks at 5/3, 10/3, 5 with retracts between
    expect(zs).toContain(-5 / 3);
    expect(zs).toContain(-10 / 3);
    expect(zs).toContain(-5);
    // every feed move is a plunge with explicit F
    const plunges = res.moves.filter((m) => !m.rapid);
    expect(plunges.length).toBe(3);
    for (const p of plunges) {
      expect(p.feed).toBe(300);
      expect(p.words.z).toBeDefined();
    }
  });

  it('drills a single plunge when pecking is off', () => {
    const res = drill(op({ peckDepth: 0 }), tool);
    const plunges = res.moves.filter((m) => !m.rapid);
    expect(plunges.length).toBe(1);
    expect(plunges[0].words.z).toBe(-5);
  });

  it('orders multiple holes with safe retracts between them', () => {
    const res = drill(
      op({ targets: [
        { x: 0, y: 0, topZ: 0, depth: 3 },
        { x: 30, y: 0, topZ: 0, depth: 3 },
      ] }),
      tool,
    );
    expect(res.holes).toBe(2);
    const xRapids = res.moves.filter((m) => m.rapid && m.words.x !== undefined);
    expect(xRapids.map((m) => m.words.x)).toEqual([0, 30]);
    // final move retracts to safe Z
    const last = res.moves[res.moves.length - 1];
    expect(last.rapid).toBe(true);
    expect(last.words.z).toBe(5);
  });

  it('estimates time from total plunged depth', () => {
    const res = drill(op(), tool);
    expect(res.estimatedMinutes).toBeCloseTo(5 / 300, 6);
  });

  it('rejects empty targets and bad depth', () => {
    expect(() => drill(op({ targets: [] }), tool)).toThrowError(/target/);
    expect(() =>
      drill(op({ targets: [{ x: 0, y: 0, topZ: 0, depth: 0 }] }), tool),
    ).toThrowError(/depth/);
  });
});