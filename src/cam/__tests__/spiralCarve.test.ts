import { describe, expect, it } from 'vitest';
import { sampleSpiralMarks, slotPasses, slotToolWidth, spiralCarve, type SpiralCarveResult } from '../spiralCarve';
import type { RotaryCalibration, SpiralCarveOp, Tool } from '../../core/types';

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

  it('fills a wide slot exactly like one pass of a Ø=width tool (Alice 2026-11-16)', () => {
    const res = spiralCarve({ ...op, width: 15 }, cal, 6, 0);
    // ceil(15/6) = 3 channels + 2 cap arcs per strand
    // → 2 strands × (3 + 2) passes × 2 levels
    expect(res.passes).toBe(20);
    // every pass is labelled: channels first, the two rounded-end caps last
    const labels = res.moves
      .filter((m) => m.rapid && m.words.a !== undefined && m.comment)
      .map((m) => m.comment);
    expect(labels[0]).toMatch(/channel 1\/3/);
    expect(labels[2]).toMatch(/channel 3\/3/);
    expect(labels[3]).toMatch(/end cap/);
    expect(labels[4]).toMatch(/start cap/);
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

describe('spiralCarve: spin (starting A of strand 1)', () => {
  it('spin 0 / absent is a no-op: byte-identical moves', () => {
    const base = spiralCarve({ ...op, count: 1 }, cal, 6, 30, 350);
    const explicitZero = spiralCarve({ ...op, count: 1, spin: 0 }, cal, 6, 30, 350);
    expect(explicitZero.moves).toEqual(base.moves);
    expect(explicitZero.passes).toBe(base.passes);
  });

  it('spin shifts a single strand phase by +spin, stacking with the datum (shortest rotation preserved)', () => {
    // startA 350 exercises the shortest-rotation positioning: the phase
    // TARGET moves (30 → 30+90=120), A still gets there the short way
    const base = spiralCarve({ ...op, count: 1 }, cal, 6, 30, 350);
    const spun = spiralCarve({ ...op, count: 1, spin: 90 }, cal, 6, 30, 350);
    // every A word (positioning rapid + both level sweeps) is exactly the
    // base run's A + 90 — the whole groove rotated, nothing else changed
    const aWords = (r: SpiralCarveResult) =>
      r.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);
    const baseA = aWords(base);
    const spunA = aWords(spun);
    expect(spunA).toHaveLength(baseA.length);
    for (let i = 0; i < baseA.length; i++) {
      expect(spunA[i] - baseA[i]).toBeCloseTo(90, 6);
    }
    // the first positioning rapid lands on datum + spin (mod 360) — and
    // still within a half-turn of the machine A it came from (350)
    const rotate = spun.moves.find((m) => m.rapid && m.words.a !== undefined)!;
    const phase = ((rotate.words.a! % 360) + 360) % 360;
    expect(phase).toBeCloseTo(120, 6); // datum 30 + spin 90
    expect(Math.abs(rotate.words.a! - 350)).toBeLessThanOrEqual(180);
  });

  it('spin rotates ALL strands of a multi-start together, preserving the even 360/count spacing', () => {
    const spun = spiralCarve({ ...op, count: 3, spin: 40 }, cal, 6, 0);
    const plain = spiralCarve({ ...op, count: 3 }, cal, 6, 0);
    const phases = (r: SpiralCarveResult) =>
      r.moves
        .filter((m) => m.rapid && m.words.a !== undefined)
        .map((m) => ((m.words.a! % 360) + 360) % 360);
    const spunPhases = phases(spun);
    const plainPhases = phases(plain);
    expect(spunPhases).toHaveLength(3); // one positioning per strand
    for (let s = 0; s < 3; s++) {
      // absolute phase: spin + s·(360/3)
      expect(spunPhases[s]).toBeCloseTo(40 + s * 120, 6);
      // vs the un-spun op: each strand moved by exactly +40
      expect(spunPhases[s] - plainPhases[s]).toBeCloseTo(40, 6);
    }
    // the even multi-start spacing itself is untouched
    for (let s = 1; s < 3; s++) {
      expect(spunPhases[s] - spunPhases[s - 1]).toBeCloseTo(120, 6);
    }
  });

  it('sampleSpiralMarks with spin starts each sampled strand at the phase the generator cuts', () => {
    const datum = 30;
    const spunOp: SpiralCarveOp = { ...op, count: 3, spin: 40 };
    const marks = sampleSpiralMarks(spunOp, cal, 6, datum);
    expect(marks).toHaveLength(3); // strands × single fan pass
    // the generator's strand positioning phases, mod 360
    const gen = spiralCarve(spunOp, cal, 6, datum);
    const genPhases = gen.moves
      .filter((m) => m.rapid && m.words.a !== undefined)
      .map((m) => ((m.words.a! % 360) + 360) % 360);
    for (let s = 0; s < 3; s++) {
      // first sampled point's angle, recovered from y/z at the cut radius
      const p = marks[s][0];
      const theta = ((Math.atan2(p.y, p.z - 0) * 180) / Math.PI + 360) % 360;
      expect(theta).toBeCloseTo(datum + 40 + s * 120, 6); // datum + spin + s·120
      // …which is exactly where the generator positions strand s
      expect(theta).toBeCloseTo(genPhases[s], 6);
    }
  });
});

// ---------------------------------------------------------------------------
// THE WIDTH CONTRACT (Alice 2026-11-16): a wide spiral slot must come out
// EXACTLY as if one pass of a Ø=width tool cut it — the acceptance is
// geometric, on the developed cylinder surface:
//   no overcut:  every tool-center point stays inside the inset slot
//                (the center path's stadium shrunk by the tool's cut
//                half-width) — the emitted slot ⊆ the requested slot;
//   no undercut: every point of the REQUESTED slot is within the tool's
//                cut half-width of some tool-center segment — nothing
//                left standing in the middle or at the rounded ends.
describe('spiralCarve: the single-wide-tool slot contract', () => {
  const flat: Tool = { id: 't', name: 'flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
  const ball: Tool = { id: 't', name: 'ball', type: 'ball', diameter: 6, spindleRpm: 18000 };
  const vbit: Tool = {
    id: 't', name: 'v', type: 'vbit', diameter: 3.175, vAngle: 60, tipDiameter: 0.1, spindleRpm: 18000,
  };

  it('slotToolWidth: the honest surface cut width per tool family', () => {
    // flat: the full Ø at any depth
    expect(slotToolWidth(flat, 0.5)).toBe(6);
    // ball at depth 1 < R: the chord 2·√(R²−(R−d)²) = 2·√5 ≈ 4.472
    expect(slotToolWidth(ball, 1)).toBeCloseTo(2 * Math.sqrt(5), 6);
    // ball at depth ≥ R: the full Ø
    expect(slotToolWidth(ball, 3)).toBe(6);
    // V-bit at depth 1: tip + 2·1·tan30° ≈ 1.2546
    expect(slotToolWidth(vbit, 1)).toBeCloseTo(0.1 + 2 * Math.tan(Math.PI / 6), 6);
    // V-bit deeper than the cone: capped at the Ø
    expect(slotToolWidth(vbit, 10)).toBe(3.175);
  });

  /** point-to-segment distance, mm */
  function segDist(px: number, pu: number, ax: number, au: number, bx: number, bu: number): number {
    const dx = bx - ax, du = bu - au;
    const len2 = dx * dx + du * du;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pu - au) * du) / len2));
    return Math.hypot(px - (ax + t * dx), pu - (au + t * du));
  }

  /**
   * The contract check on the developed surface. The desired slot =
   * the center path segment ⊕ disc(width/2). Tool-center segments come
   * from slotPasses directly (the emitter walks exactly these polylines
   * — pinned by the pass-count/label tests above).
   */
  function checkContract(width: number, angle: number, tool: Tool, depth: number) {
    const testOp: SpiralCarveOp = {
      ...op,
      spiralAngle: angle,
      width,
      depth,
      count: 1,
      xStart: 20,
      xEnd: 80,
    };
    const r = testOp.surfaceDiameter / 2;
    const e = slotToolWidth(tool, depth);
    const { passes } = slotPasses(testOp, e);
    // developed-plane reconstruction: the a offsets ARE arc offsets
    // (degPerMm was applied); u = a·π/180·r (cw). Center path: from
    // (xStart, 0) toward (xEnd, arc), length span/sinα.
    const alpha = (angle * Math.PI) / 180;
    const L = (testOp.xEnd - testOp.xStart) / Math.sin(alpha);
    const path = { ax: testOp.xStart, au: 0, bx: testOp.xStart + L * Math.sin(alpha), bu: L * Math.cos(alpha) };
    // every polyline vertex → (x, u)
    const verts = passes.flatMap((p) =>
      p.pts.map((q) => ({ x: q.x, u: (q.a * Math.PI) / 180 * r })),
    );
    // NO OVERCUT: each center vertex inside the inset stadium (h)
    const h = (width - e) / 2;
    for (const v of verts) {
      const d = segDist(v.x, v.u, path.ax, path.au, path.bx, path.bu);
      expect(d).toBeLessThanOrEqual(h + 1e-6);
    }
    // NO UNDERCUT: a dense grid over the requested slot — every point
    // within e/2 (+ arc-sagitta tolerance) of some center segment
    const segs: { ax: number; au: number; bx: number; bu: number }[] = [];
    for (const p of passes) {
      for (let i = 1; i < p.pts.length; i++) {
        segs.push({
          ax: p.pts[i - 1].x,
          au: (p.pts[i - 1].a * Math.PI) / 180 * r,
          bx: p.pts[i].x,
          bu: (p.pts[i].a * Math.PI) / 180 * r,
        });
      }
    }
    const STEP = 0.1;
    let checked = 0;
    for (let x = testOp.xStart - width; x <= testOp.xEnd + width; x += STEP) {
      for (let u = -width - 2; u <= L * Math.cos(alpha) + width + 2; u += STEP) {
        const dPath = segDist(x, u, path.ax, path.au, path.bx, path.bu);
        if (dPath > width / 2) continue; // outside the requested slot
        checked++;
        const dCenters = Math.min(...segs.map((s) => segDist(x, u, s.ax, s.au, s.bx, s.bu)));
        expect(dCenters).toBeLessThanOrEqual(e / 2 + 0.15); // sagitta 0.05 + grid
      }
    }
    expect(checked).toBeGreaterThan(100); // the grid really sampled the slot
  }

  it('flat endmill: exact slot at a 45° helix (width 15, Ø6)', () => {
    checkContract(15, 45, flat, 1);
  });

  it('flat endmill: width an exact multiple of the Ø (width 12, Ø6) — the old knife-edge case', () => {
    checkContract(12, 30, flat, 1);
  });

  it('flat endmill: really wide (width 20, Ø3.175) at 30°', () => {
    checkContract(20, 30, { ...flat, diameter: 3.175 }, 1);
  });

  it('ball nose at shallow depth fills via the chord width (width 10, Ø6, depth 1)', () => {
    checkContract(10, 45, ball, 1);
  });

  it('V-bit at depth 1 fills via the cone opening (width 6, Ø3.175 60°) — the reported case', () => {
    checkContract(6, 30, vbit, 1);
  });

  it('a 90° axial slot fills around the circumference, rounded ends included (width 8, Ø2)', () => {
    checkContract(8, 90, { ...flat, diameter: 2 }, 1);
  });

  it('the cap arcs meet the outermost channels exactly (contiguous racetrack)', () => {
    const testOp: SpiralCarveOp = { ...op, width: 15, count: 1, xStart: 20, xEnd: 80 };
    const { passes } = slotPasses(testOp, 6);
    expect(passes).toHaveLength(5); // 3 channels + 2 caps
    const [chMinus, , chPlus, endCap, startCap] = passes;
    // end cap runs from the −h channel's end to the +h channel's end
    expect(endCap.pts[0].x).toBeCloseTo(chMinus.pts[1].x, 9);
    expect(endCap.pts[0].a).toBeCloseTo(chMinus.pts[1].a, 9);
    expect(endCap.pts[endCap.pts.length - 1].x).toBeCloseTo(chPlus.pts[1].x, 9);
    expect(endCap.pts[endCap.pts.length - 1].a).toBeCloseTo(chPlus.pts[1].a, 9);
    // start cap (reversed) runs from the +h channel's start to the −h's
    expect(startCap.pts[0].x).toBeCloseTo(chPlus.pts[0].x, 9);
    expect(startCap.pts[0].a).toBeCloseTo(chPlus.pts[0].a, 9);
    expect(startCap.pts[startCap.pts.length - 1].x).toBeCloseTo(chMinus.pts[0].x, 9);
    expect(startCap.pts[startCap.pts.length - 1].a).toBeCloseTo(chMinus.pts[0].a, 9);
  });
});
