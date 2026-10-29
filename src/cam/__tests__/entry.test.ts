/**
 * Unit pins for rampEntry (entry.ts) — the entry ladder of gap-analysis
 * #4. The op-level suites (pocket/profile/stepdownInvariant) pin the
 * integration; these pin the geometry resolution itself: helical
 * revolutions, zigzag legs, the plunge fallbacks, and the bounds —
 * per-traversal descent ≤ stepDown, slope ≤ MAX_RAMP_ANGLE.
 */

import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../core/types';
import { arcTable, MAX_RAMP_ANGLE_DEG, rampEntry, type RampParams } from '../entry';

/** CCW square contour spanning [min, min+size]². */
function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

const loop = square(0, 10); // P = 40, vertices at arcs 0/10/20/30

/** default: a closed-loop entry descending 2mm from the approach plane */
function params(over: Partial<RampParams> = {}): RampParams {
  return {
    loop,
    cum: arcTable(loop),
    sStart: 0,
    stretch: 40,
    closed: true,
    band: 2,
    fromZ: 0.5,
    toZ: -1.5,
    stepDown: 1,
    feed: 200,
    ...over,
  };
}

describe('arcTable', () => {
  it('closes back on vertex 0', () => {
    expect(arcTable(square(0, 10))).toEqual([0, 10, 20, 30, 40]);
  });
});

describe('rampEntry — helical (closed loops)', () => {
  it('two revolutions when one cannot hold the descent, each closing on the start', () => {
    // descent 2, per-rev bound min(stepDown 1, 40·tan3° ≈ 2.09) = 1 → 2 revs
    const r = rampEntry(params());
    expect(r.mode).toBe('helical');
    // one move per vertex (3 behind the start) + the interpolated close, per rev
    expect(r.moves).toHaveLength(8);
    // strictly descending, landing EXACTLY on the cut level
    let prevZ = Infinity;
    for (const m of r.moves) {
      expect(m.words.z!).toBeLessThan(prevZ - 1e-12);
      prevZ = m.words.z!;
    }
    expect(r.moves[r.moves.length - 1].words.z).toBeCloseTo(-1.5, 12);
    // rev 1 closes back on the start vertex (0,0) at half the descent
    expect(r.moves[3].words).toEqual({ x: 0, y: 0, z: -0.5 });
    // z is linear in arc: vertex 1 at quarter of a revolution
    expect(r.moves[0].words).toEqual({ x: 10, y: 0, z: 0.25 });
    // time: two full perimeters' 3D hypotenuse (the descent) at entry feed
    expect(r.minutes).toBeCloseTo((2 * Math.hypot(40, 1)) / 200, 9);
  });

  it('per-rev descent never exceeds stepDown, slope never the max angle', () => {
    const shapes: Partial<RampParams>[] = [
      { fromZ: 0.5, toZ: -1.5, stepDown: 1 }, // 2 revs of 1.0
      { fromZ: 0.5, toZ: -4.15, stepDown: 0.8 }, // deep: revs bound by 0.8
      { fromZ: 0.5, toZ: -0.75, stepDown: 1 }, // fits one rev
    ];
    for (const s of shapes) {
      const p = params(s);
      const r = rampEntry(p);
      expect(r.mode).toBe('helical');
      const revs = r.moves.filter((m) => Math.abs(m.words.x!) < 1e-9 && Math.abs(m.words.y!) < 1e-9).length;
      expect(revs).toBeGreaterThan(0);
      const descent = p.fromZ! - p.toZ!;
      expect(descent / revs).toBeLessThanOrEqual(p.stepDown! + 1e-9);
      let px = 0;
      let py = 0;
      let prevZ = p.fromZ!;
      for (const m of r.moves) {
        const dxy = Math.hypot(m.words.x! - px, m.words.y! - py);
        const dz = prevZ - m.words.z!;
        if (dz > 0) expect(dz / Math.max(dxy, 1e-12)).toBeLessThanOrEqual(Math.tan((MAX_RAMP_ANGLE_DEG * Math.PI) / 180) + 1e-9);
        prevZ = m.words.z!;
        px = m.words.x!;
        py = m.words.y!;
      }
    }
  });

  it('wraps past the perimeter in travel order from a mid-loop start', () => {
    // start at arc 15 (mid bottom→right edge): the rev visits arcs
    // 20, 30, 40(=vertex 0), 50(=vertex 1), closing at 55 — sorted by
    // TRAVEL arc, never by base arc (the wrap-order fix)
    const r = rampEntry(params({ sStart: 15 }));
    expect(r.mode).toBe('helical');
    const xs = r.moves.slice(0, 4).map((m) => `${m.words.x!.toFixed(2)},${m.words.y!.toFixed(2)}`);
    expect(xs).toEqual(['10.00,10.00', '0.00,10.00', '0.00,0.00', '10.00,0.00']);
  });

  it('a descent one rev can hold still rides a full revolution', () => {
    const r = rampEntry(params({ toZ: -0.4, band: 0.4 }));
    expect(r.mode).toBe('helical');
    expect(r.moves).toHaveLength(4);
    expect(r.minutes).toBeCloseTo(Math.hypot(40, 0.9) / 200, 9);
  });
});

describe('rampEntry — zigzag (open spans)', () => {
  it('even legs over the first stretch, ending at the span start at depth', () => {
    // a 10mm span, descent 2: leg cap min(1, 10·tan3° ≈ 0.524) → 4 legs of
    // 0.5 over stretch min(10, 2/(4·tan3°) ≈ 9.54)
    const r = rampEntry(params({ closed: false, stretch: 10, band: 2 }));
    expect(r.mode).toBe('zigzag');
    expect(r.moves).toHaveLength(4); // one move per leg (no interior vertices)
    // forward, back, forward, back — the exit is the span start at depth
    const last = r.moves[3];
    expect(last.words.x).toBeCloseTo(0, 9);
    expect(last.words.y).toBeCloseTo(0, 9);
    expect(last.words.z).toBeCloseTo(-1.5, 12);
    // monotone descent spread evenly over the legs
    expect(r.moves.map((m) => m.words.z)).toEqual([0, -0.5, -1, -1.5]);
    const stretch = Math.min(10, 2 / (4 * Math.tan((MAX_RAMP_ANGLE_DEG * Math.PI) / 180)));
    expect(r.minutes).toBeCloseTo((4 * Math.hypot(stretch, 0.5)) / 200, 9);
    // never leaves the span: every x within [0, 10]
    for (const m of r.moves) {
      expect(m.words.x!).toBeGreaterThanOrEqual(-1e-9);
      expect(m.words.x!).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('zigzags through the span vertices, in travel order both directions', () => {
    // start mid-edge at arc 15 of the square, a 17mm span, descent 1.6:
    // leg cap min(1, 17·tan3° ≈ 0.89) → 2 legs over stretch 15.26 — the
    // forward leg 15 → 30.26 crosses BOTH vertices at arcs 20 and 30
    const r = rampEntry(
      params({ closed: false, sStart: 15, stretch: 17, fromZ: 0.5, toZ: -1.1, band: 1.6 }),
    );
    expect(r.mode).toBe('zigzag');
    expect(r.moves).toHaveLength(6);
    const fwd = r.moves.slice(0, 3).map((m) => `${m.words.x!.toFixed(2)},${m.words.y!.toFixed(2)}`);
    expect(fwd).toEqual(['10.00,10.00', '0.00,10.00', '0.00,9.74']);
    const back = r.moves.slice(3, 6).map((m) => `${m.words.x!.toFixed(2)},${m.words.y!.toFixed(2)}`);
    // the backward leg retraces in REVERSE travel order, exiting at the
    // span start (arc 15 → (10,5)) at the cut level
    expect(back).toEqual(['0.00,10.00', '10.00,10.00', '10.00,5.00']);
    expect(r.moves[5].words.z).toBeCloseTo(-1.1, 12);
  });
});

describe('rampEntry — straight-plunge fallbacks', () => {
  it('plunges honestly through air when no material band stands at the entry', () => {
    const r = rampEntry(params({ band: 0 }));
    expect(r.mode).toBe('plunge');
    expect(r.moves).toHaveLength(1);
    expect(r.moves[0].words).toEqual({ z: -1.5 });
    expect(r.moves[0].comment).toMatch(/air/);
    expect(r.minutes).toBeCloseTo(2 / 200, 9);
  });

  it('plunges when the span is too short to ramp at any sane steepness', () => {
    expect(rampEntry(params({ closed: false, stretch: 0.3, band: 2 })).mode).toBe('plunge');
    // 1mm span, 2mm descent: would need 40 legs — degenerate
    expect(rampEntry(params({ closed: false, stretch: 1, band: 2 })).mode).toBe('plunge');
  });

  it('plunges when a pinched closed loop would need too many revolutions', () => {
    // P = 1mm, descent 2: 3° per rev takes 0.052mm → 39 revs — degenerate
    const tiny = square(0, 0.25); // P = 1
    expect(rampEntry(params({ loop: tiny, cum: arcTable(tiny), stretch: 1, band: 2 })).mode).toBe('plunge');
  });

  it('emits nothing for a zero descent', () => {
    const r = rampEntry(params({ fromZ: -1.5, toZ: -1.5 }));
    expect(r.moves).toEqual([]);
    expect(r.minutes).toBe(0);
  });
});