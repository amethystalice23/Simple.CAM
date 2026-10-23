import { describe, expect, it } from 'vitest';
import { thread, threadDepth, threadFaceDiameter } from '../thread';
import type { RotaryCalibration, ThreadOp, Tool } from '../../core/types';

const cal: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 12 };

const vbit: Tool = {
  id: 't1',
  name: '90° chamfer bit',
  type: 'vbit',
  diameter: 6,
  vAngle: 90,
  spindleRpm: 12000,
};

const op: ThreadOp = {
  kind: 'thread',
  id: 'th1',
  toolId: 't1',
  nominalDiameter: 20,
  xStart: 0,
  xEnd: 20,
  pitch: 2,
  starts: 1,
  tolerance: 0,
  stepDown: 0.5,
  rotation: 'cw',
  feed: 10000, // high: the rotary ceiling binds (the machine's as-cut rate)
  plungeFeed: 100,
  surfaceDiameter: null,
};

describe('thread geometry helpers', () => {
  it('derives the groove depth from pitch, tool angle, and tolerance', () => {
    // 90° bit: depth = pitch/4 + tolerance
    expect(threadDepth(2, 90, 0)).toBeCloseTo(0.5, 6);
    expect(threadDepth(2, 90, 0.1)).toBeCloseTo(0.6, 6);
    // a 60° bit cuts deeper for the same crest width
    expect(threadDepth(2, 60, 0)).toBeCloseTo((0.5 * 2) / Math.tan((30 * Math.PI) / 180) / 2, 6);
  });

  it('shrinks the crest diameter by the tolerance, per side', () => {
    expect(threadFaceDiameter(20, 0)).toBe(20);
    expect(threadFaceDiameter(20, 0.1)).toBeCloseTo(19.8, 6);
  });
});

describe('thread', () => {
  it('advances A by (span/lead)·360 with phase-locked retrace levels + a spring', () => {
    const res = thread(op, cal, vbit, 0);
    // stock R12 − root R(10−0.5)=9.5 → total 2.5mm: levels [0.5, 1, 1.5, 2, 2.5] + spring
    expect(res.passes).toBe(6);
    const sweeps = res.moves.filter((m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined);
    expect(sweeps).toHaveLength(6);
    const adv = (20 / 2) * 360; // lead = 1 start × 2mm
    // cw threads cut with A DECanalysisSING (cam/thread.ts's swapped hand)
    expect(sweeps[0].words.a!).toBeCloseTo(-adv, 6);
    // the level sweep returns along the helix (A back toward the phase)
    expect(sweeps[1].words.a!).toBeCloseTo(0, 6);
    // the spring pass retraces the last level — backward by the
    // alternation, the same 3D curve ending at the phase start
    expect(sweeps[5].words.a!).toBeCloseTo(0, 6);
    expect(res.moves.some((m) => m.comment === 'spring pass')).toBe(true);
    expect(res.depth).toBeCloseTo(0.5, 6);
  });

  it('multi-start: lead = starts × pitch, starts at 360/starts phases', () => {
    const res = thread({ ...op, starts: 2 }, cal, vbit, 0);
    const strandRapids = res.moves.filter((m) => m.rapid && m.words.a !== undefined);
    expect(strandRapids).toHaveLength(2);
    const a0 = ((strandRapids[0].words.a! % 360) + 360) % 360;
    const a1 = ((strandRapids[1].words.a! % 360) + 360) % 360;
    expect(a0).toBeCloseTo(0, 6);
    expect(a1).toBeCloseTo(180, 6);
    // lead 4mm: half the A advance of the single start, negative for cw
    const sweep = res.moves.find((m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined)!;
    expect(sweep.words.a!).toBeCloseTo(-(20 / 4) * 360, 6);
  });

  it('surfaceDiameter sets where the ladder starts — no air levels after a facing op', () => {
    // faced to the crest Ø (nominal 20, tolerance 0 → root R 9.5): the
    // ladder is exactly the groove depth, not the stock surplus
    const faced = thread({ ...op, surfaceDiameter: 20 }, cal, vbit, 0);
    const raw = thread({ ...op }, cal, vbit, 0);
    expect(faced.passes).toBeLessThan(raw.passes);
    // depth 0.25 at stepDown 0.25 → 1 level + spring = 2 sweeps
    expect(faced.passes).toBe(2);
  });

  it('tolerance shrinks teeth: deeper grooves and a smaller crest', () => {
    const nominal = thread({ ...op, tolerance: 0 }, cal, vbit, 0);
    const loose = thread({ ...op, tolerance: 0.1 }, cal, vbit, 0);
    expect(loose.depth).toBeCloseTo(nominal.depth + 0.1, 6);
    expect(loose.faceDiameter).toBeCloseTo(19.8, 6);
  });

  it('rejects non-V-bit tools and degenerate geometry with diagnosis', () => {
    expect(() => thread(op, cal, { ...vbit, type: 'flat' }, 0)).toThrowError(/V-bit/);
    expect(() => thread({ ...op, pitch: 0 }, cal, vbit, 0)).toThrowError(/pitch/);
    expect(() => thread({ ...op, starts: 1.5 }, cal, vbit, 0)).toThrowError(/starts/);
    expect(() => thread({ ...op, tolerance: -1 }, cal, vbit, 0)).toThrowError(/tolerance/);
    expect(() => thread({ ...op, nominalDiameter: 60 }, cal, vbit, 0)).toThrowError(/root/);
  });
});

describe('thread: depth-aware feed (constant surface speed at the cut)', () => {
  // the sweep is one helix: 10 turns over 20mm (lead 2mm), so the true
  // path length at the cutting radius rc is hypot(2π·rc·10, 20)
  const sweepMoves = (r: ReturnType<typeof thread>) =>
    r.moves.filter((m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined);
  const lenAt = (depth: number) => Math.hypot(2 * Math.PI * (12 - depth) * 10, 20);

  it('holds the feed as the surface speed at the cut on every level', () => {
    // feed 300 binds (never the ceiling): each level's time is its true
    // length at the CURRENT cutting radius / 300 — A accelerates as the
    // grooves deepen toward the root, keeping 300 mm/min at the cut
    const res = thread({ ...op, feed: 300 }, cal, vbit, 0);
    const sweeps = sweepMoves(res);
    // ladder from stock R12 to root R9.5: [0.5, 1, 1.5, 2, 2.5] + spring
    const depths = [0.5, 1, 1.5, 2, 2.5, 2.5];
    expect(sweeps).toHaveLength(depths.length);
    for (let i = 0; i < sweeps.length; i++) {
      expect(lenAt(depths[i]) * sweeps[i].feed).toBeCloseTo(300, 3);
    }
    // deeper level = shorter arc at the smaller radius = faster A
    expect(sweeps[4].feed).toBeGreaterThan(sweeps[0].feed);
  });

  it('never exceeds the rotary ceiling: a big feed caps every level at MAX_ROTARY_RPM', () => {
    const res = thread(op, cal, vbit, 0); // feed 10000 — the ceiling binds
    const sweeps = sweepMoves(res);
    const revs = 10; // (20mm span / 2mm lead) turns per sweep
    for (const m of sweeps) expect(m.feed).toBeCloseTo(6.6 / revs, 6);
  });

  it('rejects a non-positive feed', () => {
    expect(() => thread({ ...op, feed: 0 }, cal, vbit, 0)).toThrowError(/feed/);
  });
});

describe('thread positioning', () => {
  it('positions each start with axis-separate rapids — never a coordinated X+A rapid', () => {
    // a coordinated X+Z+A rapid runs at the slowest axis' rate — the rotary
    // clamp crawls the X traverse across the stock at clearance height
    const res = thread({ ...op, xStart: 5 }, cal, vbit, 0);
    expect(res.moves.filter((m) => m.rapid && m.words.a !== undefined && m.words.x !== undefined))
      .toHaveLength(0);
    // lift (Z only) → rotate in place (A only) → travel (X only), then plunge
    expect(res.moves[0]).toEqual({ words: { z: 17 }, feed: 0, rapid: true });
    expect(res.moves[1]).toEqual({ words: { a: 0 }, feed: 0, rapid: true, comment: 'start 1/1' });
    expect(res.moves[2]).toEqual({ words: { x: 5 }, feed: 0, rapid: true });
    expect(res.moves[3].words.z).toBeDefined(); // the plunge begins
    expect(res.moves[3].rapid).toBeFalsy();
  });

  it('later starts rotate and travel from the shared clearance height (no re-lift)', () => {
    const res = thread({ ...op, starts: 2, xStart: 5 }, cal, vbit, 0);
    // the entry lifts: z-only rapids that PRECEDE a start's rotate. The
    // closing {z} retract after each start's runs is its own move — the
    // second start must go straight rotate → travel, no extra lift between.
    const rotates = res.moves
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.rapid && m.words.a !== undefined && m.words.x === undefined);
    expect(rotates).toHaveLength(2);
    expect(rotates[1].m.comment).toBe('start 2/2');
    // what sits between the first start's closing retract and the second
    // start's rotate: nothing (the retract already parked Z at safeZ)
    const beforeSecond = res.moves[rotates[1].i - 1];
    expect(beforeSecond.rapid).toBe(true);
    expect(beforeSecond.words.z).toBeCloseTo(17, 6); // the closing retract
    // second start's entry: rotate → X travel → plunge, no Z word in between
    expect(res.moves[rotates[1].i + 1]).toEqual({ words: { x: 5 }, feed: 0, rapid: true });
    expect(res.moves[rotates[1].i + 2].words.z).toBeDefined();
  });

  it('honors the ⚡ clearance override for the approach height', () => {
    const res = thread({ ...op, clearance: 12 }, cal, vbit, 0);
    // axisZ 0 + stock R12 + override 12
    expect(res.moves[0].words.z).toBeCloseTo(24, 6);
    const plain = thread(op, cal, vbit, 0);
    expect(plain.moves[0].words.z).toBeCloseTo(17, 6); // default SAFE_CLEARANCE 5
  });
});

describe('thread A continuity', () => {
  it('positions to the phase by the SHORTEST rotation from the machine A', () => {
    // axis sits at 4600° (12.8 revs of prior work): the nearest phase-0
    // spoke is +80° at 4680 — not 4600° of unwinding back to absolute 0
    const res = thread(op, cal, vbit, 0, 4600);
    const lift = res.moves[0];
    expect(lift).toEqual({ words: { z: 17 }, feed: 0, rapid: true });
    const rot = res.moves[1];
    expect(rot.words.a).toBeCloseTo(4680, 6);
    expect(Math.abs(rot.words.a! - 4600)).toBeLessThanOrEqual(180);
  });

  it('startA=350 positions forward 10° to the phase-0 spoke at 360', () => {
    const res = thread(op, cal, vbit, 0, 350);
    expect(res.moves[1].words.a).toBeCloseTo(360, 6);
  });
});
