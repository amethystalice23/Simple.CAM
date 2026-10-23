import { describe, expect, it } from 'vitest';
import { sampleSpiralMarks, spiralCarve, type SpiralCarveResult } from '../spiralCarve';
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
    // axis-separate entries: the fan-pass start Xs live on the X-only travels
    const starts = res.moves.filter((m) => m.rapid && m.words.x !== undefined).map((m) => m.words.x);
    // per strand: the fan pass start Xs spread across (width − toolØ) = 9mm
    const firstStrand = starts.slice(0, 3).sort((a, b) => a! - b!);
    expect(firstStrand[1]! - firstStrand[0]!).toBeCloseTo(4.5, 5);
    expect(firstStrand[2]! - firstStrand[1]!).toBeCloseTo(4.5, 5);
  });

  it('width 0 just follows the lines: one pass per strand, no fan', () => {
    const zero = spiralCarve({ ...op, width: 0 }, cal, 6, 0);
    expect(zero.passes).toBe(4); // 2 strands × 1 fan pass × 2 levels
    // the path is identical to any sub-tool width (a 1mm width with the
    // Ø6 tool) — only the panel's warning distinguishes them
    const narrow = spiralCarve({ ...op, width: 1 }, cal, 6, 0);
    const xTravels = (r: SpiralCarveResult) =>
      r.moves.filter((m) => m.rapid && m.words.x !== undefined).map((m) => m.words.x);
    expect(xTravels(zero)).toEqual(xTravels(narrow));
    // negative width is still rejected
    expect(() => spiralCarve({ ...op, width: -1 }, cal, 6, 0)).toThrowError(/cannot be negative/);
  });

  it('samples a single groove line per strand at width 0 (knurling preview)', () => {
    const marks = sampleSpiralMarks({ ...op, width: 0 }, cal, 6, 0);
    expect(marks).toHaveLength(2); // strands only — no fan lines
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
    // a groove reaching the axis leaves no material to cut
    expect(() => spiralCarve({ ...op, depth: 25 }, cal, 6, 0)).toThrowError(/no material/);
  });

  it('per-level G93 timing holds the surface speed at the cut (depth-aware)', () => {
    // 45° helix on R25 over 50mm: aAdvance = 2 rad, so the pass's true
    // length at the cutting radius (25 − depth) is hypot(2·(25−d), 50).
    // feed 400 binds on every level — the pass time is that length /
    // 400, so the CUTTING SURFACE sees 400 mm/min no matter the depth:
    // A accelerates as the arc shortens level by level.
    const res = spiralCarve(op, cal, 6, 0); // depth 2, stepDown 1 → levels 1, 2
    const sweeps = res.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined,
    );
    expect(sweeps).toHaveLength(4); // 2 strands × 2 levels
    const lenAt = (d: number) => Math.hypot(2 * (25 - d), 50);
    for (const m of [sweeps[0], sweeps[1]]) {
      const d = m === sweeps[0] ? 1 : 2;
      expect(lenAt(d) * m.feed).toBeCloseTo(400, 3);
    }
    expect(sweeps[1].feed).toBeGreaterThan(sweeps[0].feed); // deeper = faster A
  });

  it('never exceeds the rotary ceiling: a big feed caps every level at MAX_ROTARY_RPM', () => {
    const res = spiralCarve({ ...op, feed: 100000 }, cal, 6, 0);
    const lead = 2 * Math.PI * 25 * Math.tan(Math.PI / 4);
    const revs = (50 / lead) / 1; // span / lead turns per sweep
    const sweeps = res.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined,
    );
    for (const m of sweeps) expect(m.feed).toBeCloseTo(6.6 / revs, 6);
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

describe('spiralCarve: clearance override', () => {
  it('lifts the approach to the ⚡ clearance above the groove surface', () => {
    // surface R25 at Z25: default clearance 5 → Z30, override 8 → Z33
    const res = spiralCarve({ ...op, clearance: 8 }, cal, 6, 0);
    const zs = res.moves.filter((m) => m.rapid && m.words.z !== undefined).map((m) => m.words.z);
    expect(zs.length).toBeGreaterThan(0);
    for (const z of zs) expect(z).toBeCloseTo(33, 6);
  });
});

describe('spiralCarve A continuity', () => {
  it('positions strands by the SHORTEST rotation from the machine A', () => {
    // axis at 350, strand phase 0 → +10° to 360, not −350 back to 0
    const res = spiralCarve(op, cal, 6, 0, 350);
    const rotate = res.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    expect(rotate.words.a).toBeCloseTo(360, 6);
    expect(Math.abs(rotate.words.a! - 350)).toBeLessThanOrEqual(180);
  });
});
