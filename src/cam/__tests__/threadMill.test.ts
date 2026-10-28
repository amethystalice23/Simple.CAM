import { describe, expect, it } from 'vitest';
import {
  externalMinorDiameter,
  internalMinorDiameter,
  pathRadius,
  segmentsPerRevolution,
  threadMill,
} from '../threadMill';
import type { Move, ThreadMillOp, ThreadMillTarget, Tool } from '../../core/types';

const mill: Tool = {
  id: 'tm1',
  name: '6*M6*18mm Thread',
  type: 'threadmill',
  diameter: 4.75,
  pitch: 1,
  shaftDiameter: 6,
  fluteLength: 20,
  spindleRpm: 12000,
};

const target: ThreadMillTarget = { center: { x: 0, y: 0 }, internal: false, topZ: 0, depth: 10 };

const op: ThreadMillOp = {
  kind: 'threadMill',
  id: 'thm1',
  toolId: 'tm1',
  nominalDiameter: 14,
  pitch: 1,
  starts: 1,
  tolerance: 0,
  hand: 'left',
  feed: 100,
  plungeFeed: 100,
  safeClearance: 3,
  targets: [target],
};

const internalOp: ThreadMillOp = {
  ...op,
  nominalDiameter: 6,
  targets: [{ center: { x: 0, y: 0 }, internal: true, topZ: 0, depth: 10 }],
  safeClearance: 2,
};

const mill15: Tool = { ...mill, pitch: 1.5 }; // the matching M6×1.5-form mill

const multiOp: ThreadMillOp = {
  ...op,
  nominalDiameter: 10,
  pitch: 1.5,
  starts: 2,
  hand: 'right',
  targets: [{ center: { x: 0, y: 0 }, internal: false, topZ: 0, depth: 6 }],
};

/** G1 helix moves: x, y AND z all defined on the cut. */
const isHelix = (m: Move) => !m.rapid && m.words.x !== undefined && m.words.y !== undefined && m.words.z !== undefined;

/** The pass-1 block: from the first radial entry to the first Z rapid after it. */
function pass1(res: { moves: Move[] }): { g1s: Move[]; zLift: Move } {
  const start = res.moves.findIndex((m) => m.comment === 'radial entry');
  expect(start).toBeGreaterThan(0);
  const g1s: Move[] = [];
  let zLift: Move | null = null;
  for (let i = start; i < res.moves.length; i++) {
    const m = res.moves[i];
    if (m.rapid && m.words.z !== undefined) {
      zLift = m;
      break;
    }
    g1s.push(m);
  }
  if (zLift === null) throw new Error('no Z rapid after the first pass');
  return { g1s, zLift };
}

describe('threadMill geometry', () => {
  it('derives the ISO radii: external minor d3, internal minor d1, path radius', () => {
    // ground truth: their M14×1 path X8.76 = d3/2 + toolR
    expect(externalMinorDiameter(14, 1)).toBeCloseTo(12.7732, 4);
    expect(pathRadius(14, 1, 4.75 / 2, 0, false)).toBeCloseTo(8.7616, 3);
    expect(internalMinorDiameter(6, 1)).toBeCloseTo(4.9175, 4);
    expect(pathRadius(6, 1, 4.75 / 2, 0, true)).toBeCloseTo(0.625, 6);
    // tolerance loosens the fit in both modes (deeper grooves)
    expect(pathRadius(14, 1, 4.75 / 2, 0.05, false)).toBeCloseTo(8.7116, 3);
    expect(pathRadius(6, 1, 4.75 / 2, 0.05, true)).toBeCloseTo(0.675, 6);
  });

  it('clamps helix segments: 0.15mm chords, 64 floor, 512 cap', () => {
    expect(segmentsPerRevolution(8.7616)).toBe(368); // their ~1°/segment file
    expect(segmentsPerRevolution(0.625)).toBe(64); // 27 raw → floor
    expect(segmentsPerRevolution(25)).toBe(512); // 1047 raw → cap
  });
});

describe('threadMill — the mill-tested ground truth, replayed', () => {
  it('cuts the external M14×1 ccw cycle: Rc 8.76 entry, 368 segs/rev, 10 revs, twice', () => {
    const res = threadMill(op, mill);

    // path radius of the first target
    expect(res.pathRadius).toBeCloseTo(8.7616, 3);

    // radial entry lands on the d3-based path radius (their X8.76)
    const entries = res.moves.filter((m) => m.comment === 'radial entry');
    expect(entries).toHaveLength(2); // the whole cycle runs TWICE
    expect(entries[0].words.x).toBeCloseTo(8.7616, 3);
    expect(entries[0].words.y).toBeCloseTo(0, 6);
    expect(entries[0].feed).toBe(100);

    // the approach sits outside the boss at Rc + safeClearance, angle 0
    const approach = res.moves[0];
    expect(approach.rapid).toBe(true);
    expect(approach.words.x).toBeCloseTo(8.7616 + 3, 6);
    expect(approach.words.y).toBeCloseTo(0, 6);

    // two full-cycle plunges to the thread bottom, never rapid
    const plunges = res.moves.filter((m) => m.comment === 'plunge to the thread bottom');
    expect(plunges).toHaveLength(2);
    for (const p of plunges) {
      expect(p.rapid).toBeUndefined();
      expect(p.words.z).toBeCloseTo(-10, 9);
      expect(p.feed).toBe(100);
    }

    const pass = pass1(res);
    const helix = pass.g1s.filter(isHelix);
    // segments per full rev = ceil(2π·8.7616/0.15) = 368 (inside the clamp)
    expect(helix).toHaveLength(3680); // 10 revs × 368
    // every helix move carries x, y AND z at the cut feed
    for (const m of helix) expect(m.feed).toBe(100);
    // left-hand ascends CW viewed from above: first segment moves −Y
    expect(helix[0].words.y!).toBeLessThan(0);
    expect(helix[0].words.x!).toBeCloseTo(8.7616, 2);
    // z spans exactly bottomZ → topZ, strictly non-decreasing
    // (the plunge to −10 is pinned above via `plunges`; the radial entry
    // that opens the pass carries no z)
    expect(pass.g1s[0].words.z).toBeUndefined(); // radial entry, planar
    expect(helix[0].words.z!).toBeGreaterThan(-10);
    expect(helix[0].words.z!).toBeLessThan(-9.99);
    expect(helix[helix.length - 1].words.z!).toBeCloseTo(0, 9);
    for (let i = 1; i < helix.length; i++) {
      expect(helix[i].words.z!).toBeGreaterThanOrEqual(helix[i - 1].words.z!);
    }
    // a full second identical pass: spring comment on cycle 2's first move
    const springIdx = res.moves.findIndex((m) => m.comment === 'spring pass');
    expect(springIdx).toBeGreaterThan(0);
    expect(res.moves[springIdx].rapid).toBe(true);
    expect(res.passes).toBe(2);

    // honest estimate: ~1101mm of helix + 26mm plunges + 6mm entries at 100mm/min
    expect(res.estimatedMinutes).toBeGreaterThan(11);
    expect(res.estimatedMinutes).toBeLessThan(11.6);
    expect(res.notes.some((n) => n.includes('8.76'))).toBe(true);
  });

  it('right-hand flips the ascent to CCW (angle increasing)', () => {
    const res = threadMill({ ...op, hand: 'right' }, mill);
    const pass = pass1(res);
    const helix = pass.g1s.filter(isHelix);
    expect(helix[0].words.y!).toBeGreaterThan(0);
    expect(helix[0].words.x!).toBeCloseTo(8.7616, 2);
  });
});

describe('threadMill — internal retract decisions', () => {
  it('tight bore: spiral exit — the helix unwinds past the mouth, no straight lift', () => {
    // default bore = d1/2 = 2.45875 → room = 0.08375mm < 0.2 margin
    const res = threadMill(internalOp, mill);
    expect(res.pathRadius).toBeCloseTo(0.625, 6);
    expect(res.notes.some((n) => n.includes('spiral exit'))).toBe(true);
    expect(res.notes.some((n) => n.includes('0.084'))).toBe(true);

    const pass = pass1(res);
    const helix = pass.g1s.filter(isHelix);
    // the helix extends past topZ: ≤ 1 extra rev of unwind segments
    const spiral = helix.filter((m) => m.words.z! > 0);
    expect(spiral.length).toBeGreaterThan(0);
    expect(spiral.length).toBeLessThanOrEqual(segmentsPerRevolution(0.625));
    expect(helix[helix.length - 1].words.z!).toBeGreaterThan(0);
    // NO rapid-Z straight lift out of the engaged region (z ≤ topZ):
    // every Z rapid follows a G1 already above the face
    const lifts: number[] = [];
    for (let i = 1; i < res.moves.length; i++) {
      const m = res.moves[i];
      const prev = res.moves[i - 1];
      if (m.rapid && m.words.z !== undefined && !prev.rapid && (prev.words.z ?? Infinity) <= 0) {
        lifts.push(i);
      }
    }
    expect(lifts).toEqual([]);
    // the lift itself sits at least pitch + 0.5 above the face
    expect(pass.zLift.words.z!).toBeGreaterThanOrEqual(1.5 - 1e-9);
  });

  it('roomy bore: aside retract — radial in to the center at feed, then lift', () => {
    // Ø8 pre-drill → room = 4 − 2.375 = 1.625mm ≥ 0.2
    const res = threadMill(
      { ...internalOp, targets: [{ ...internalOp.targets[0], boreRadius: 4 }] },
      mill,
    );
    expect(res.notes.some((n) => n.includes('aside retract'))).toBe(true);
    expect(res.notes.some((n) => n.includes('1.63'))).toBe(true); // 1.625mm of room

    const pass = pass1(res);
    const helix = pass.g1s.filter(isHelix);
    // the cut itself stops exactly at topZ — no unwind segments
    expect(helix[helix.length - 1].words.z!).toBeCloseTo(0, 9);
    // immediately: a G1 radial in to the bore CENTER at the cut feed…
    const aside = res.moves[res.moves.indexOf(pass.zLift) - 1];
    expect(aside.rapid).toBeUndefined();
    expect(aside.words.x).toBeCloseTo(0, 9);
    expect(aside.words.y).toBeCloseTo(0, 9);
    expect(aside.feed).toBe(100);
    expect(aside.words.z).toBeUndefined();
    // …then the straight rapid lift
    expect(pass.zLift.words.z).toBeCloseTo(2, 9);
  });
});

describe('threadMill — multi-start', () => {
  it('cuts starts helices pitch-staggered, lead = starts × pitch, all repeated by the spring', () => {
    const res = threadMill(multiOp, mill15);
    const Rc = pathRadius(10, 1.5, 4.75 / 2, 0, false);
    expect(Rc).toBeCloseTo(6.4549, 3);
    const segs = segmentsPerRevolution(Rc);

    // 2 starts × 2 cycles
    const entries = res.moves.filter((m) => m.comment === 'radial entry');
    expect(entries).toHaveLength(4);

    // start k enters at bottomZ + k·pitch: plunges at −6 and −4.5 per cycle
    const plungeZ = res.moves
      .filter((m) => m.comment === 'plunge to the thread bottom')
      .map((m) => m.words.z!);
    expect(plungeZ).toEqual([-6, -4.5, -6, -4.5]);

    // each helix ascends the full depth in depth/lead = 2 revolutions
    // (lead = starts × pitch = 3)
    const helix = res.moves.filter(isHelix);
    expect(helix).toHaveLength(4 * 2 * segs);
    // start 0 spans −6 → 0, start 1 spans −4.5 → +1.5 (groove 0 shifted up)
    const span0 = helix.slice(0, 2 * segs);
    expect(span0[0].words.z!).toBeGreaterThan(-6);
    expect(span0[2 * segs - 1].words.z!).toBeCloseTo(0, 9);
    const span1 = helix.slice(2 * segs, 4 * segs);
    expect(span1[0].words.z!).toBeGreaterThan(-4.5);
    expect(span1[2 * segs - 1].words.z!).toBeCloseTo(1.5, 9);
    expect(res.passes).toBe(2);
  });
});

describe('threadMill — the Makera 09-11 gouge, pinned out', () => {
  // Alice's warning (2026-10-28): an early Makera Studio version re-plunged
  // between radial levels AT THE CUT RADIUS — a vertical descent straight
  // through the thread it had just cut, gouging every flank it crossed
  // (examples/…Stage3_TOP_20260911195828.nc: the `G1 Z-8 F1000 / Z-10`
  // transitions between its 9.44 → 9.1 → 8.76 helix levels; fixed by the
  // 1003 file, which re-approaches from outside the crest between passes).
  // Invariant: every Z-DESCENDING move starts from clear space — outside
  // the crest at the approach point (external) or at the bore center
  // (internal) — never at the cut radius.
  const assertDescentsFromClear = (
    res: { moves: Move[] },
    internal: boolean,
    /** the op's own path radius — the approach sits at Rc + safeClearance */
    rc: number,
  ) => {
    const clearR = internal ? 0 : rc + 3; // internal: the center; external: Rc + safeClearance
    let x: number | undefined;
    let y: number | undefined;
    let z: number | undefined;
    let descents = 0;
    for (const m of res.moves) {
      const w = m.words;
      if (z !== undefined && w.z !== undefined && w.z < z - 1e-9) {
        expect(x).toBeDefined();
        expect(y).toBeDefined();
        const r = Math.hypot(x!, y!); // fixtures center the target at the origin
        if (internal) expect(r).toBeLessThan(1e-6);
        else expect(r).toBeCloseTo(clearR, 6);
        descents++;
      }
      if (w.x !== undefined) x = w.x;
      if (w.y !== undefined) y = w.y;
      if (w.z !== undefined) z = w.z;
    }
    expect(descents).toBeGreaterThan(0); // the walker actually saw descents
  };

  it('external: every descent starts outside the crest at the approach point', () => {
    assertDescentsFromClear(threadMill(op, mill), false, pathRadius(14, 1, 4.75 / 2, 0, false));
    assertDescentsFromClear(threadMill(multiOp, mill15), false, pathRadius(10, 1.5, 4.75 / 2, 0, false)); // multi-start + spring
  });

  it('internal: every descent starts at the bore center', () => {
    assertDescentsFromClear(threadMill(internalOp, mill), true, pathRadius(6, 1, 4.75 / 2, 0, true)); // spiral exit
    assertDescentsFromClear(
      threadMill({ ...internalOp, targets: [{ ...internalOp.targets[0], boreRadius: 4 }] }, mill),
      true,
      pathRadius(6, 1, 4.75 / 2, 0, true),
    ); // aside retract
  });
});

describe('threadMill — validation', () => {
  const flat: Tool = { ...mill, type: 'flat', pitch: undefined };

  it('rejects a non-threadmill tool', () => {
    expect(() => threadMill(op, flat)).toThrow(/needs a thread mill/);
  });

  it('rejects a tool pitch mismatch, naming both pitches', () => {
    expect(() => threadMill(op, { ...mill, pitch: 1.25 })).toThrow(/mills a 1\.25mm pitch/);
    expect(() => threadMill(op, { ...mill, pitch: 1.25 })).toThrow(/wants 1mm/);
  });

  it('rejects a mill that does not fit the prep bore', () => {
    // Ø5.5 mill → toolR 2.75 ≥ d1/2 = 2.45875
    const fat = { ...mill, diameter: 5.5 };
    expect(() => threadMill(internalOp, fat)).toThrow(/does not fit the Ø4\.92 bore/);
  });

  it('rejects a shank-oversized bore cut deeper than the flute', () => {
    // shaft Ø6 > bore Ø4.92, thread 10mm deep vs a 2mm flute
    const stub = { ...mill, fluteLength: 2 };
    expect(() => threadMill(internalOp, stub)).toThrow(/cannot enter the Ø4\.92 bore deeper than the 2mm flute/);
    expect(() => threadMill(internalOp, stub)).toThrow(/use a longer mill/);
  });

  it('rejects degenerate op fields', () => {
    expect(() => threadMill({ ...op, pitch: 0 }, mill)).toThrow(/pitch/);
    expect(() => threadMill({ ...op, starts: 1.5 }, mill)).toThrow(/starts/);
    expect(() => threadMill({ ...op, tolerance: -0.1 }, mill)).toThrow(/tolerance/);
    expect(() =>
      threadMill({ ...op, targets: [{ ...target, depth: 0 }] }, mill),
    ).toThrow(/depth/);
    expect(() => threadMill({ ...op, feed: 0 }, mill)).toThrow(/feed/);
    expect(() => threadMill({ ...op, plungeFeed: 0 }, mill)).toThrow(/plunge/);
    expect(() => threadMill({ ...op, safeClearance: 0 }, mill)).toThrow(/clearance/);
    expect(() => threadMill({ ...op, targets: [] }, mill)).toThrow(/target/);
  });
});
