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
  faceFirst: false,
  feed: 400,
  plungeFeed: 100,
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
    expect(sweeps[0].words.a!).toBeCloseTo(adv, 6);
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
    // lead 4mm: half the A advance of the single start
    const sweep = res.moves.find((m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined)!;
    expect(sweep.words.a!).toBeCloseTo((20 / 4) * 360, 6);
  });

  it('faceFirst prefixes the spiral facing to the crest Ø', () => {
    const res = thread({ ...op, faceFirst: true }, cal, vbit, 0);
    expect(res.moves.length).toBeGreaterThan(6);
    // the first rapid is the facing approach; a facing rough comment exists
    expect(res.moves.some((m) => m.comment?.includes('pass'))).toBe(true);
    // with the facing, the groove ladder is exactly the derived depth
    expect(res.faceDiameter).toBe(20);
    // facing moves end at the crest radius Z: 10 (R = face Ø/2)
    expect(res.moves.some((m) => m.words.z !== undefined && Math.abs(m.words.z - 10) < 1e-6)).toBe(true);
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
