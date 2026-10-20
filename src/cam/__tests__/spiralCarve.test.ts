import { describe, expect, it } from 'vitest';
import { sampleSpiralMarks, spiralCarve } from '../spiralCarve';
import type { RotaryCalibration, SpiralCarveOp } from '../../core/types';

const cal: RotaryCalibration = { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 };

const op: SpiralCarveOp = {
  kind: 'spiralCarve',
  id: 's1',
  toolId: 't1',
  surfaceDiameter: 50, // radius 25 — the stock surface
  xStart: 0,
  xEnd: 50,
  spiralAngle: 45, // lead = 2π·25·tan45 ≈ 157.08mm → ~0.318 revs over 50mm
  count: 2,
  depth: 2,
  width: 3, // Ø6 tool covers it: single pass per strand
  stepDown: 1, // two levels
  rotation: 'cw',
  feed: 400,
  plungeFeed: 100,
};

describe('spiralCarve', () => {
  it('sweeps every strand at the helix advance, retracing per level (G93)', () => {
    const res = spiralCarve(op, cal, 6, 0);
    expect(res.passes).toBe(4); // 2 strands × 1 fan pass × 2 levels
    const feedMoves = res.moves.filter((m) => !m.rapid);
    expect(feedMoves.length).toBeGreaterThan(4);
    // the coordinated sweeps carry A + X and inverse-time F
    const sweeps = feedMoves.filter((m) => m.words.a !== undefined && m.words.x !== undefined);
    expect(sweeps).toHaveLength(4);
    for (const m of sweeps) expect(m.feed).toBeGreaterThan(0);
    // advance per sweep = span / lead · 360
    const lead = 2 * Math.PI * 25 * Math.tan(Math.PI / 4);
    const adv = (50 / lead) * 360;
    const a0 = sweeps[0].words.a!;
    const a1 = sweeps[1].words.a!;
    // level 2 sweeps BACK along the helix: A returns toward the start
    expect(a0).toBeCloseTo(adv, 6);
    expect(a1).toBeCloseTo(0, 6);
    expect(res.moves[0].rapid).toBe(true);
  });

  it('strands sit evenly around 360° with datum-shifted phases', () => {
    const res = spiralCarve(op, cal, 6, 90);
    // positioning rapids per strand: A lands on datum + s·(360/count)
    const strandRapids = res.moves.filter((m) => m.rapid && m.words.a !== undefined);
    expect(strandRapids).toHaveLength(2);
    const a0 = ((strandRapids[0].words.a! % 360) + 360) % 360;
    const a1 = ((strandRapids[1].words.a! % 360) + 360) % 360;
    expect(a0).toBeCloseTo(90, 6); // the datum
    expect(a1).toBeCloseTo(270, 6); // datum + 180
  });

  it('fans parallel helices when the width exceeds the tool', () => {
    const res = spiralCarve({ ...op, width: 15 }, cal, 6, 0);
    // ceil(15/6) = 3 fan passes per strand → 2 strands × 3 × 2 levels
    expect(res.passes).toBe(12);
    const starts = res.moves.filter((m) => m.rapid && m.words.a !== undefined).map((m) => m.words.x);
    // per strand: the fan pass start Xs spread across (width − toolØ) = 9mm
    const firstStrand = starts.slice(0, 3).sort((a, b) => a! - b!);
    expect(firstStrand[1]! - firstStrand[0]!).toBeCloseTo(4.5, 5);
    expect(firstStrand[2]! - firstStrand[1]!).toBeCloseTo(4.5, 5);
  });

  it('a 90° spiral is a pure axial line: X-only G94 sweeps at fixed A', () => {
    const res = spiralCarve({ ...op, spiralAngle: 90 }, cal, 6, 0);
    const sweeps = res.moves.filter((m) => !m.rapid && m.words.x !== undefined && m.words.z === undefined);
    expect(sweeps.length).toBe(4);
    for (const m of sweeps) {
      expect(m.words.a).toBeUndefined();
      expect(m.feed).toBe(400); // G94 mm/min
    }
  });

  it('rejects degenerate parameters with diagnosis', () => {
    expect(() => spiralCarve({ ...op, xEnd: 0 }, cal, 6, 0)).toThrowError(/must differ/);
    expect(() => spiralCarve({ ...op, spiralAngle: 0 }, cal, 6, 0)).toThrowError(/angle/);
    expect(() => spiralCarve({ ...op, count: 1.5 }, cal, 6, 0)).toThrowError(/count/);
    expect(() => spiralCarve({ ...op, surfaceDiameter: 60 }, cal, 6, 0)).toThrowError(/stock radius/);
  });

  it('samples groove marks on the part-local cylinder for the preview', () => {
    const marks = sampleSpiralMarks(op, cal, 6, 0);
    expect(marks).toHaveLength(2); // strands (single fan pass)
    const [pts] = marks;
    expect(pts.length).toBeGreaterThan(2);
    // every point sits at the cut radius: sqrt(y² + (z−axisZ)²) = R − depth
    for (const p of pts) {
      expect(Math.hypot(p.y, p.z - 0)).toBeCloseTo(23, 5);
    }
    // the helix advances along X with the angle
    expect(pts[pts.length - 1].x).toBeCloseTo(50, 5);
  });
});
