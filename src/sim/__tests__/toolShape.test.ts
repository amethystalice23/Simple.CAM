import { describe, expect, it } from 'vitest';
import { buildToolSpec } from '../toolShape';
import type { Tool } from '../../core/types';

const tool = (t: Partial<Tool>): Tool => ({
  id: 't1',
  name: 'test tool',
  type: 'flat',
  diameter: 6,
  spindleRpm: 18000,
  ...t,
});

describe('buildToolSpec', () => {
  it('flat: inside at tip and flank; the cutting column is unbounded above', () => {
    const s = buildToolSpec(tool({ type: 'flat', diameter: 6, fluteLength: 20 }));
    expect(s.radius).toBe(3);
    expect(s.fluteLen).toBe(20);
    expect(s.inside(0, 0)).toBe(true); // the tip itself
    expect(s.inside(0, 9)).toBe(true); // ρ = 3 exactly on the wall
    expect(s.inside(0, 9.0001)).toBe(false);
    expect(s.inside(20, 0)).toBe(true); // flute ceiling inclusive
    expect(s.inside(20.001, 0)).toBe(false); // shank above — never carved
    expect(s.inside(10, 9)).toBe(true);
    expect(s.inside(10, 9.1)).toBe(false);
    expect(s.inside(-0.001, 0)).toBe(false); // below the tip
    const b = s.bounds();
    expect(b).toEqual([-3, 3, -3, 3, 0, 20]);
  });

  it('ball: hemisphere exact at equator and pole, column above center', () => {
    const s = buildToolSpec(tool({ type: 'ball', diameter: 6, fluteLength: 20 }));
    expect(s.radius).toBe(3);
    expect(s.inside(0, 0)).toBe(true); // pole of the hemisphere
    expect(s.inside(1.5, Math.max(0, 9 - 2.25))).toBe(true); // z−r = −1.5, ρ² ≤ 9−2.25
    expect(s.inside(3, 9)).toBe(true); // equator: ρ ≤ r
    expect(s.inside(3, 9.0001)).toBe(false);
    expect(s.inside(1.5, 9)).toBe(false); // at half depth the ball is narrower
    expect(s.inside(10, 9)).toBe(true); // cylindrical shank of the flute
    expect(s.inside(10, 9.0001)).toBe(false);
    expect(s.inside(20, 0)).toBe(true);
    expect(s.inside(20.001, 0)).toBe(false);
  });

  it('bull: profile matches the fillet formula at probed radii', () => {
    const s = buildToolSpec(tool({ type: 'bull', diameter: 10, cornerRadius: 2, fluteLength: 15 }));
    expect(s.radius).toBe(5);
    // below z = cr: effective radius = r − (cr − √(cr² − (cr−z)²))
    // z = 1: √(4 − 1) = √3 ≈ 1.7320508 → eff = 5 − (2 − 1.7320508) = 4.7320508
    expect(s.inside(1, 4.7320508 ** 2)).toBe(true);
    expect(s.inside(1, 4.7320508 ** 2 + 1e-6)).toBe(false);
    // z = 0: eff = 5 − 2 = 3 (the flat tip is Ø(r − cr)·2)
    expect(s.inside(0, 9)).toBe(true);
    expect(s.inside(0, 9.0001)).toBe(false);
    // z = cr = 2: full radius reached
    expect(s.inside(2, 25)).toBe(true);
    expect(s.inside(2, 25.0001)).toBe(false);
    // above: cylinder to fluteLen
    expect(s.inside(15, 25)).toBe(true);
    expect(s.inside(15.001, 0)).toBe(false);
  });

  it('bull: cornerRadius ≥ radius degenerates to a ball profile; missing cr is flat', () => {
    const s = buildToolSpec(tool({ type: 'bull', diameter: 6, cornerRadius: 5, fluteLength: 10 }));
    // at z = 0 the profile pulls fully in: eff = 3 − (3 − 3) = ... cr clamped
    // to r: at z=0 eff = r − (r − √(r² − r²)) = 0 — a ball point
    expect(s.inside(0, 0)).toBe(true);
    expect(s.inside(0, 0.01)).toBe(false);
    expect(s.inside(1.5, 9 - 2.25)).toBe(true);
    const f = buildToolSpec(tool({ type: 'bull', diameter: 6, fluteLength: 10 }));
    expect(f.inside(0, 9)).toBe(true); // no cornerRadius → flat
  });

  it('vbit: truncated cone slope ρ ≤ tipR + z·tan(vAngle/2), then cylinder', () => {
    // 90° included, Ø6 large end, tip Ø0.6 → tipR = 0.3, slope = tan45 = 1
    const s = buildToolSpec(tool({ type: 'vbit', diameter: 6, vAngle: 90, tipDiameter: 0.6, fluteLength: 30 }));
    expect(s.inside(0, 0.09)).toBe(true); // tipR² exactly
    expect(s.inside(0, 0.0901)).toBe(false);
    expect(s.inside(2, 2.3 ** 2)).toBe(true); // 0.3 + 2·1 = 2.3
    expect(s.inside(2, 2.3001 ** 2)).toBe(false);
    // cone reaches radius 3 just past z = 2.7 (slope is 0.9999… in fp),
    // cylinder above — probe safely inside the cylinder section
    expect(s.inside(2.75, 9)).toBe(true);
    expect(s.inside(2.75, 9.0001)).toBe(false);
    expect(s.inside(10, 9)).toBe(true);
    expect(s.inside(10, 9.0001)).toBe(false);
    expect(s.inside(30, 9)).toBe(true);
    expect(s.inside(30.001, 0)).toBe(false);
  });

  it('corn builds a vbit spec (the post maps corn → V-Bit)', () => {
    const s = buildToolSpec(tool({ type: 'corn', diameter: 4, vAngle: 60, tipDiameter: 0, fluteLength: 12 }));
    const slope = Math.tan((Math.PI / 180) * 30);
    expect(s.inside(1, slope ** 2)).toBe(true); // tipR = 0 → ρ ≤ z·tan30
    expect(s.inside(1, slope ** 2 + 1e-9)).toBe(false);
  });

  it('drill: cone by drillPointAngle 118° then cylinder', () => {
    const s = buildToolSpec(tool({ type: 'drill', diameter: 6, drillPointAngle: 118, fluteLength: 25 }));
    const slope = Math.tan((Math.PI / 180) * 59);
    const coneH = 3 / slope;
    expect(s.inside(0, 0)).toBe(true);
    expect(s.inside(coneH / 2, (coneH / 2 * slope) ** 2)).toBe(true);
    expect(s.inside(coneH / 2, (coneH / 2 * slope) ** 2 + 1e-6)).toBe(false);
    expect(s.inside(coneH, 9)).toBe(true); // cone meets the cylinder wall
    expect(s.inside(coneH + 1, 9)).toBe(true);
    expect(s.inside(25.001, 0)).toBe(false);
  });

  it('threadmill approximates flat (documented v1)', () => {
    const s = buildToolSpec(tool({ type: 'threadmill', diameter: 4, fluteLength: 8 }));
    expect(s.radius).toBe(2);
    expect(s.inside(0, 4)).toBe(true);
    expect(s.inside(0, 4.0001)).toBe(false);
  });

  it('laser THROWS — the caller must skip laser moves before the kernel', () => {
    expect(() => buildToolSpec(tool({ type: 'laser', diameter: 0.1 }))).toThrow(/laser/);
  });

  it('shank solid: radius from shaftDiameter/2 (default diameter/2), top from overallLength (default +30)', () => {
    // explicit shaft + overall length
    const s = buildToolSpec(tool({ type: 'flat', diameter: 6, fluteLength: 20, shaftDiameter: 8, overallLength: 40 }));
    expect(s.shankRadius).toBe(4);
    expect(s.shankTop).toBe(40);
    expect(s.shankInside(19.999, 0)).toBe(false); // flute band — never the shank test
    expect(s.shankInside(20, 0)).toBe(false); // boundary inclusive-exclusive at the flute top
    expect(s.shankInside(20.001, 0)).toBe(true);
    expect(s.shankInside(40, 0)).toBe(true);
    expect(s.shankInside(40.001, 0)).toBe(false);
    expect(s.shankInside(30, 15.999)).toBe(true); // ρ < 4
    expect(s.shankInside(30, 16)).toBe(true);
    expect(s.shankInside(30, 16.0001)).toBe(false);
    // defaults: no shaftDiameter → diameter/2; no overallLength → +30
    const d = buildToolSpec(tool({ type: 'flat', diameter: 6, fluteLength: 20 }));
    expect(d.shankRadius).toBe(3);
    expect(d.shankTop).toBe(50);
    expect(d.shankInside(25, 8.99)).toBe(true);
    expect(d.shankInside(25, 9.01)).toBe(false);
    // the FLUTE inside test is untouched by the shank fields (pinned
    // "shank above — never carved")
    expect(s.inside(20.001, 0)).toBe(false);
    expect(s.bounds()).toEqual([-3, 3, -3, 3, 0, 20]);
  });

  it('undercutting head band: a T-slot-style head wider than the shaft contacts out to the head, then the slimmer shaft above it', () => {
    // Alice's 2026-10-26 groundwork: "T slot undercutting bits that have a
    // head wider than the shaft" — the shank profile is BANDS: the wide head
    // directly above the flute (headDiameter/headLength), the slimmer shaft
    // continuing above it. shankRadius/shankTop span the WHOLE solid so the
    // kernel's pose AABB covers the head too.
    const s = buildToolSpec(
      tool({
        type: 'flat',
        diameter: 3,
        fluteLength: 10,
        shaftDiameter: 4,
        headDiameter: 10,
        headLength: 3,
        overallLength: 40,
      }),
    );
    expect(s.shankRadius).toBe(5); // the HEAD radius, wider than the shaft's 2
    expect(s.shankTop).toBe(40);
    // inside the head band (z 10..13): contact within 5, not at 5.01
    expect(s.shankInside(11, 24.99)).toBe(true);
    expect(s.shankInside(11, 25)).toBe(true);
    expect(s.shankInside(11, 25.01)).toBe(false);
    expect(s.shankInside(10, 0)).toBe(false); // flute top is exclusive to the band
    // above the head (z > 13): the shaft's slimmer radius 2 rules again
    expect(s.shankInside(14, 3.99)).toBe(true);
    expect(s.shankInside(14, 4.01)).toBe(false);
    expect(s.shankInside(40, 0)).toBe(true); // shankTop inclusive
    expect(s.shankInside(40.001, 0)).toBe(false);
    // without head fields: the plain single-band shaft behaves as before
    const plain = buildToolSpec(tool({ type: 'flat', diameter: 3, fluteLength: 10, shaftDiameter: 4, overallLength: 40 }));
    expect(plain.shankRadius).toBe(2);
    expect(plain.shankInside(14, 4.01)).toBe(false);
    expect(plain.shankInside(14, 3.99)).toBe(true);
  });
});
