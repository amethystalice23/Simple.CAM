import { describe, expect, it } from 'vitest';
import { chamfer, CIRCLE_SEGMENTS } from '../chamfer';
import type { ChamferOp, Move, Tool, Vec2 } from '../../core/types';

const vbit = (over: Partial<Tool> = {}): Tool => ({
  id: 't1',
  name: '90° chamfer bit',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 90,
  tipDiameter: 0,
  spindleRpm: 12000,
  ...over,
});

const rim = {
  kind: 'circle',
  center: { x: 0, y: 0 },
  radius: 5,
  z: 0,
  materialOutside: true,
} as const;

const op = (over: Partial<ChamferOp> = {}): ChamferOp => ({
  kind: 'chamfer',
  id: 'op1',
  toolId: 't1',
  loops: [rim],
  mode: 'add',
  side: 'inside',
  direction: 'down',
  depth: 1,
  feed: 600,
  plungeFeed: 200,
  safeClearance: 5,
  ...over,
});

/** XY targets of the feed (cutting) moves. */
function feedXY(moves: Move[]): Vec2[] {
  return moves
    .filter((m) => !m.rapid && m.words.x !== undefined && m.words.y !== undefined)
    .map((m) => ({ x: m.words.x as number, y: m.words.y as number }));
}

function radii(pts: Vec2[], cx = 0, cy = 0): number[] {
  return pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
}

describe('chamfer generator', () => {
  it('places the cone flank through the rim: path on the loop, tip depth below', () => {
    const res = chamfer(op(), vbit());
    const pts = feedXY(res.moves);
    // 90° bit, rt = 0: the tool rides exactly on the Ø10 rim circle
    expect(pts).toHaveLength(CIRCLE_SEGMENTS); // one closed pass
    for (const r of radii(pts)) expect(r).toBeCloseTo(5, 6);
    // tip one depth below the anchor plane
    const plunge = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    expect(plunge?.words.z).toBeCloseTo(-1, 9);
    // retract above the anchor plane — positioned BEFORE any Z move: the
    // entry travels at the machine's existing height, then descends
    // (never a diagonal X+Y+Z rapid from a tool-change park)
    expect(res.moves[0].words.z).toBeUndefined();
    expect(res.moves[1].words.z).toBeCloseTo(5, 6);
    expect(res.loops).toBe(1);
    expect(res.width).toBeCloseTo(1, 9); // d·tan45
    expect(res.estimatedMinutes).toBeGreaterThan(0);
  });

  it('shifts the path inward by the flat-tip radius', () => {
    const res = chamfer(op(), vbit({ tipDiameter: 0.5 }));
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(4.75, 6);
  });

  it('rides outside for an outside chamfer (boss outline)', () => {
    const res = chamfer(op({ side: 'outside' }), vbit({ tipDiameter: 0.5 }));
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(5.25, 6);
  });

  it("mirrors the cut above the anchor for direction 'up' (hole-floor edge)", () => {
    const res = chamfer(op({ direction: 'up' }), vbit());
    const plunge = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    expect(plunge?.words.z).toBeCloseTo(1, 9); // z₀ + d
    // retract clears the raised tip, not just the anchor plane
    expect(res.moves[0].words.z).toBeUndefined(); // travel first, descend second
    expect(res.moves[1].words.z).toBeCloseTo(1 + 5, 6);
  });

  it("'auto' rides the void side: into a hole rim, out around a boss", () => {
    const hole = chamfer(
      op({ side: 'auto', loops: [{ ...rim, materialOutside: true }] }),
      vbit({ tipDiameter: 0.5 }),
    );
    for (const r of radii(feedXY(hole.moves))) expect(r).toBeCloseTo(4.75, 6);
    const boss = chamfer(
      op({ side: 'auto', loops: [{ ...rim, materialOutside: false }] }),
      vbit({ tipDiameter: 0.5 }),
    );
    for (const r of radii(feedXY(boss.moves))) expect(r).toBeCloseTo(5.25, 6);
  });

  it('widens per the included angle: 60° bit → width = d·tan30', () => {
    const res = chamfer(op(), vbit({ vAngle: 60 }));
    expect(res.width).toBeCloseTo(Math.tan((30 * Math.PI) / 180), 9);
  });

  it('offsets polygon loops via clipper on both sides', () => {
    const square: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const poly = { kind: 'poly', points: square, z: 0, materialOutside: true } as const;
    const inside = chamfer(op({ loops: [poly] }), vbit({ tipDiameter: 0.5 }));
    const inPts = feedXY(inside.moves);
    expect(inPts.length).toBeGreaterThanOrEqual(4); // closed, whatever the join style
    for (const p of inPts) {
      expect(p.x).toBeGreaterThan(0.2);
      expect(p.x).toBeLessThan(9.95);
      expect(p.y).toBeGreaterThan(0.2);
      expect(p.y).toBeLessThan(9.95);
    }
    const outside = chamfer(op({ loops: [poly], side: 'outside' }), vbit({ tipDiameter: 0.5 }));
    const outPts = feedXY(outside.moves);
    expect(outPts.some((p) => p.x < -0.24)).toBe(true); // grown rt past the edge
    for (const p of outPts) {
      expect(p.x).toBeGreaterThan(-0.3);
      expect(p.x).toBeLessThan(10.3);
    }
  });

  it('rejects bad inputs with clear errors', () => {
    expect(() => chamfer(op({ loops: [] }), vbit())).toThrow('at least one loop');
    expect(() => chamfer(op({ depth: 0 }), vbit())).toThrow('depth must be positive');
    expect(() => chamfer(op(), { ...vbit(), type: 'flat' })).toThrow('needs a V-bit');
    expect(() => chamfer(op(), vbit({ vAngle: undefined }))).toThrow('tip angle');
    expect(() => chamfer(op(), vbit({ vAngle: 180 }))).toThrow('tip angle');
    expect(() => chamfer(op({ feed: 0 }), vbit())).toThrow('feed must be positive');
  });

  it('fails when the cone is too short to reach the anchor plane', () => {
    // Ø1 bit (0.5mm flank half-width), 1mm depth at 90° needs 1mm of flank
    expect(() => chamfer(op({ depth: 1 }), vbit({ diameter: 1 }))).toThrow(
      /cone is too short/,
    );
    // but a shallow chamfer on the same bit fits
    expect(() => chamfer(op({ depth: 0.4 }), vbit({ diameter: 1 }))).not.toThrow();
  });

  it('fails when the loop is smaller than the tool tip', () => {
    expect(() =>
      chamfer(
        op({ loops: [{ ...rim, radius: 0.2 }] }),
        vbit({ tipDiameter: 1 }),
      ),
    ).toThrow('smaller than the tool tip');
    expect(() =>
      chamfer(
        op({
          loops: [
            {
              kind: 'poly',
              points: [
                { x: 0, y: 0 },
                { x: 0.3, y: 0 },
                { x: 0.3, y: 0.3 },
                { x: 0, y: 0.3 },
              ],
              z: 0,
              materialOutside: true,
            },
          ],
        }),
        vbit({ tipDiameter: 1 }),
      ),
    ).toThrow('smaller than the tool tip');
  });
});
describe('chamfer validation', () => {
  it('throws on unknown side/direction instead of silently inverting (undefined reads as the else branch)', () => {
    expect(() => chamfer(op({ side: undefined as unknown as ChamferOp['side'] }), vbit())).toThrow(/side/);
    expect(() => chamfer(op({ direction: undefined as unknown as ChamferOp['direction'] }), vbit())).toThrow(/direction/);
    expect(() => chamfer(op({ mode: undefined as unknown as ChamferOp['mode'] }), vbit())).toThrow(/mode/);
  });
});

describe("mode 'existing': ride the modelled chamfer face", () => {
  // the user's case: a modelled 1.3mm 45° chamfer on a bore — top edge
  // at Ø12.6 (r 6.3) on the face plane, bottom edge at Ø10 (r 5) 1.3mm down.
  // DIRECTION selects which end was clicked: 'down' = top edge (slide by
  // depth), 'up' = bottom edge (trace exactly, depth ignored).
  const topEdge = { ...rim, radius: 6.3 };
  const bottomEdge = { ...rim, radius: 5, z: -1.3 };

  it("direction 'down' (top edge selected): tip traces down-and-in by depth, landing on the bottom edge", () => {
    const res = chamfer(op({ mode: 'existing', loops: [topEdge], depth: 1.3 }), vbit());
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(5, 6); // 6.3 − 1.3·tan45
    const plunge = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    expect(plunge?.words.z).toBeCloseTo(-1.3, 9);
  });

  it('top edge with a flat tip: path shifted by rt so the tip edge hits the bottom edge', () => {
    const res = chamfer(op({ mode: 'existing', loops: [topEdge], depth: 1.3 }), vbit({ tipDiameter: 0.1 }));
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(4.95, 6); // 5 − 0.05
  });

  it("direction 'up' (bottom edge selected): depth ignored — the tip traces the anchor exactly", () => {
    const res = chamfer(op({ mode: 'existing', loops: [bottomEdge], depth: 0.5, direction: 'up' }), vbit());
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(5, 6); // rt = 0
    const plunge = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    expect(plunge?.words.z).toBeCloseTo(-1.3, 9); // anchor z, not 0.5 above it
    // a flat tip still shifts the path so the tip edge rides the wall
    const flat = chamfer(op({ mode: 'existing', loops: [bottomEdge], depth: 0.5, direction: 'up' }), vbit({ tipDiameter: 0.1 }));
    for (const r of radii(feedXY(flat.moves))) expect(r).toBeCloseTo(4.95, 6);
    // a huge depth stays ignored — the flank guard needs only rt
    expect(() => chamfer(op({ mode: 'existing', loops: [bottomEdge], depth: 99, direction: 'up' }), vbit({ diameter: 1 }))).not.toThrow();
  });

  it("bottom-edge and top-edge anchors agree when depth matches the modelled chamfer", () => {
    const fromTop = chamfer(op({ mode: 'existing', loops: [topEdge], depth: 1.3 }), vbit({ tipDiameter: 0.1 }));
    const fromBottom = chamfer(op({ mode: 'existing', loops: [bottomEdge], depth: 99, direction: 'up' }), vbit({ tipDiameter: 0.1 }));
    // identical cut geometry; the safe-Z rapids legitimately track each
    // anchor's own plane
    expect(feedXY(fromBottom.moves)).toEqual(feedXY(fromTop.moves));
    const tip = (m: Move[]) => m.find((x) => !x.rapid && x.words.z !== undefined)?.words.z;
    expect(tip(fromBottom.moves)).toBeCloseTo(tip(fromTop.moves) as number, 9);
  });

  it("'add' makes no bottom/top distinction: direction is the wall side, either edge is cut through", () => {
    const res = chamfer(op({ mode: 'add', loops: [bottomEdge] }), vbit());
    for (const r of radii(feedXY(res.moves))) expect(r).toBeCloseTo(5, 6); // no slide
    const plunge = res.moves.find((m) => !m.rapid && m.words.z !== undefined);
    expect(plunge?.words.z).toBeCloseTo(-2.3, 9); // anchor z − depth: no special case
  });
});
