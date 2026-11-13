import { describe, expect, it } from 'vitest';
import { chipLoad, cutAdvice, derivedTrochoidRates, docAdvice, materialFamily } from '../cutAdvisor';
import { getMaterial } from '../materials';
import type { Tool } from '../types';

const flat6: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };
const spiralO: Tool = {
  id: 't2',
  name: 'Spiral O Metal 3.175×12',
  type: 'flat',
  diameter: 3.175,
  flutes: 1,
  spindleRpm: 10000,
};
const laser: Tool = { id: 't3', name: 'Makera 5W Laser Module', type: 'laser', diameter: 0.2, spindleRpm: 20 };

describe('chipLoad', () => {
  it('is feed per tooth: feed/(rpm×flutes)', () => {
    // Alice's coupon winner: 300 mm/min @ 8000 RPM, 1 flute → 0.0375 mm/tooth
    expect(chipLoad(300, 8000, 1)).toBeCloseTo(0.0375, 4);
    // Makera's aluminum flat row: 18000 RPM × 2 flutes at their 1500 mm/min → 0.0417
    expect(chipLoad(1500, 18000, 2)).toBeCloseTo(0.0417, 3);
  });
  it('returns 0 on degenerate rpm/flutes rather than NaN', () => {
    expect(chipLoad(100, 0, 2)).toBe(0);
    expect(chipLoad(100, 1000, 0)).toBe(0);
  });
});

describe('materialFamily', () => {
  it('maps stock material ids onto preset family keys', () => {
    expect(materialFamily('delrin')).toBe('plastic');
    expect(materialFamily('acrylic-cast')).toBe('plastic');
    expect(materialFamily('aluminum-6061')).toBe('aluminum');
    expect(materialFamily('hardwood')).toBe('hardwood');
  });
});

describe('cutAdvice', () => {
  it('flags the coupon-1 melt-string regime as LOW chip load on Delrin', () => {
    // coupon #1: ~300 mm/min at the tool's singular S18000 — the rubbing regime
    const a = cutAdvice(spiralO, getMaterial('delrin'), { feed: 300, spindleRpm: 18000 });
    expect(a.verdict).toBe('low');
    expect(a.note).toMatch(/rub/);
    // the fix direction: raise feed at the same rpm
    expect(a.recommendedFeed).toBeGreaterThan(300);
  });
  it('rates her coupon-2 clean winner as healthy', () => {
    const a = cutAdvice(spiralO, getMaterial('delrin'), { feed: 300, spindleRpm: 8000 });
    expect(a.verdict).toBe('ok');
  });
  it('rates the Makera-recommended plastic row as healthy', () => {
    // Spiral O Plastic preset: 1000 mm/min @ 10000-12000 → 0.083-0.1 mm/tooth, 1 flute
    const a = cutAdvice(spiralO, getMaterial('delrin'), { feed: 1000, spindleRpm: 12000 });
    expect(a.verdict).toBe('ok');
  });
  it('flags an over-fed 2-flute 6mm on aluminum as HIGH', () => {
    // 2000 mm/min @ 18000 × 2 = 0.056 — just at the edge; 2500 pushes past max
    const a = cutAdvice(flat6, getMaterial('aluminum-6061'), { feed: 2500, spindleRpm: 18000 });
    expect(a.verdict).toBe('high');
    expect(a.recommendedFeed).toBeLessThan(2500);
  });
  it('raises a too-low feed toward the UPPER band end (0.05 × 18000 × 2 = 1800)', () => {
    // our fallback table's 420 is low vs the corpus band; the fix aims
    // 75% up the band (Makera's own rows sit at the top — mid-band
    // would needlessly halve the job speed; Alice, 2026-11-01)
    const a = cutAdvice(flat6, getMaterial('aluminum-6061'), { feed: 420, spindleRpm: 18000 });
    expect(a.verdict).toBe('low');
    expect(a.recommendedFeed).toBe(1800);
    expect(a.targetChipLoad).toBeCloseTo(0.05, 5);
  });
  it('healthy verdict targets nothing — no button, no nudge', () => {
    const a = cutAdvice(spiralO, getMaterial('delrin'), { feed: 1000, spindleRpm: 10000 });
    expect(a.verdict).toBe('ok');
    expect(a.recommendedFeed).toBeNull();
    expect(a.targetChipLoad).toBeNull();
  });
  it('laser tools carry no chip load (the rpm slot is beam power)', () => {
    const a = cutAdvice(laser, getMaterial('delrin'), { feed: 100, spindleRpm: 20 });
    expect(a.verdict).toBe('unknown');
    expect(a.band).toBeNull();
    expect(a.recommendedFeed).toBeNull();
  });
  it('carries DOC advice when a step-down is offered', () => {
    // aluminum band max 0.5×Ø: 2mm on Ø6 ok, 4mm = 0.67×Ø deep
    const ok = cutAdvice(flat6, getMaterial('aluminum-6061'), { feed: 1440, spindleRpm: 18000 }, 2);
    expect(ok.docVerdict).toBe('ok');
    const deep = cutAdvice(flat6, getMaterial('aluminum-6061'), { feed: 1440, spindleRpm: 18000 }, 4);
    expect(deep.docVerdict).toBe('deep');
    expect(deep.docNote).toMatch(/deep for aluminum/);
  });
  it('recommendedStepDown is the family best DOC × Ø', () => {
    // aluminum best 0.1 × 6 = 0.6mm; plastic best 0.3 × 3.175 = 0.95
    const alu = cutAdvice(flat6, getMaterial('aluminum-6061'));
    expect(alu.recommendedStepDown).toBe(0.6);
    const del = cutAdvice(spiralO, getMaterial('delrin'));
    expect(del.recommendedStepDown).toBe(0.95);
  });
});

describe('docAdvice', () => {
  it('ok within the family band, deep past it, very-deep past 1.5×', () => {
    // aluminum max 0.5×Ø: 2mm on Ø6 ok, 4mm deep, 6mm very-deep
    expect(docAdvice(2, 6, 'aluminum').verdict).toBe('ok');
    expect(docAdvice(4, 6, 'aluminum').verdict).toBe('deep');
    expect(docAdvice(6, 6, 'aluminum').verdict).toBe('very-deep');
  });
  it('the 1mm acetal ruling sits inside the plastic band', () => {
    // 1mm on Ø3.175 = 0.31×Ø; plastic band max 1.0
    expect(docAdvice(1, 3.175, 'plastic').verdict).toBe('ok');
  });
  it('unknown family or diameter reads unknown, never throws', () => {
    expect(docAdvice(1, 0, 'plastic').verdict).toBe('unknown');
    expect(docAdvice(1, 3, 'unobtanium').verdict).toBe('unknown');
    expect(docAdvice(NaN, 3, 'plastic').verdict).toBe('unknown');
  });
});

describe('derivedTrochoidRates (adaptive-clearing spec step 3)', () => {
  // ae comes from the emitter's AE_FACTOR (0.15·Ø) — the derivation must
  // stay consistent with what the walk actually engages
  const ae6 = 0.15 * 6; // 0.9mm on the Ø6 flat

  it('the chip-thinning scale buys back depth and feed: min(3, 0.5·Ø/ae)', () => {
    const r = derivedTrochoidRates(flat6, getMaterial('aluminum-6061'), {
      ae: ae6,
      stepDown: 0.5,
      feed: 500,
      spindleRpm: 18000,
    });
    expect(r).not.toBeNull();
    // 0.5·Ø/ae = 3/0.9 = 3.33 → capped at 3
    expect(r!.scale).toBe(3);
    expect(r!.stepDown).toBe(1.5);
    expect(r!.feed).toBe(1500);
    expect(r!.stepClamp).toBeNull();
    // aluminum flat band max 0.06: 1500/(18000·2) = 0.0417 < 0.06 — no clamp
    expect(r!.feedClamp).toBe(false);
  });

  it('a larger engagement thins the buy-back (scale follows 0.5·Ø/ae)', () => {
    const r = derivedTrochoidRates(flat6, getMaterial('aluminum-6061'), {
      ae: 1.5, // 0.25·Ø
      stepDown: 0.5,
      feed: 500,
      spindleRpm: 18000,
    });
    expect(r!.scale).toBe(2);
    expect(r!.stepDown).toBe(1);
  });

  it('the flute length clamps the derived step-down', () => {
    const longDoc: Tool = { ...flat6, fluteLength: 1.2 };
    const r = derivedTrochoidRates(longDoc, getMaterial('aluminum-6061'), {
      ae: ae6,
      stepDown: 0.5,
      feed: 500,
      spindleRpm: 18000,
    });
    expect(r!.stepDown).toBe(1.2);
    expect(r!.stepClamp).toBe('flute');
  });

  it('the material preset clamps the derived step-down to its max DOC × Ø', () => {
    // aluminum max 0.5×Ø = 3mm: a preset stepDown of 2mm × 3 = 6 → clamped
    const r = derivedTrochoidRates(flat6, getMaterial('aluminum-6061'), {
      ae: ae6,
      stepDown: 2,
      feed: 500,
      spindleRpm: 18000,
    });
    expect(r!.stepDown).toBe(3);
    expect(r!.stepClamp).toBe('material');
  });

  it('the chip-load band caps the derived feed at the band max × rpm × flutes', () => {
    // aluminum flat band max 0.06 mm/tooth: at 10000 RPM × 2 flutes the
    // ceiling is 1200 mm/min — 500 × 3 = 1500 must clamp to 1200
    const r = derivedTrochoidRates(flat6, getMaterial('aluminum-6061'), {
      ae: ae6,
      stepDown: 0.5,
      feed: 500,
      spindleRpm: 10000,
    });
    expect(r!.feed).toBe(1200);
    expect(r!.feedClamp).toBe(true);
  });

  it('null on degenerate inputs — callers keep the op rates unchanged', () => {
    expect(derivedTrochoidRates(laser, getMaterial('delrin'), { ae: 0.03, stepDown: 1, feed: 100 })).toBeNull();
    expect(derivedTrochoidRates(flat6, getMaterial('delrin'), { ae: 0, stepDown: 1, feed: 100 })).toBeNull();
    expect(derivedTrochoidRates(flat6, getMaterial('delrin'), { ae: ae6, stepDown: 0, feed: 100 })).toBeNull();
    expect(derivedTrochoidRates(flat6, getMaterial('delrin'), { ae: ae6, stepDown: 1, feed: 0 })).toBeNull();
  });
});