/**
 * Cutting-rate advisor: chip load and depth-of-cut guidance for novice
 * users (PLAN.md gap #12 — "auto-warning on op settings + auto-suggest
 * on tool select — smarter presets, not new UI").
 *
 * The one number that predicts trouble is CHIP LOAD — the feed each
 * tooth actually removes, feed / (rpm × flutes) mm/tooth. Too low and
 * the tool rubs instead of shearing (heat → melted strings on acetal —
 * the 2026-10-21 coupon diagnosis; the same physics that made
 * simple.cam's early metal-row RPMs fail on Delrin); too high and the
 * teeth snap or the cutter stalls. Depth of cut rides alongside as the
 * second half of engagement: too deep per pass for the cutter's
 * diameter and the chip has nowhere to go.
 *
 * All bands below are MEASURED from two corpora, not invented:
 *  - Makera's own per-tool preset rows (makeraTools.generated.ts) —
 *    their feeds are chip-load-quantized per material × tool type:
 *    aluminum/brass/copper flat endmills sit at 0.0417 mm/tooth on
 *    EVERY row, ball mills at half that (0.0208), engraving bits near
 *    0.0833, plastics/woods 0.083–0.1.
 *  - Alice's Delrin feed×RPM matrix coupons (2026-10-24, cuts #2–4):
 *    the clean cells (300 mm/min @ 8000 RPM, 450 @ 8500, one-flute
 *    Spiral O) sit at 0.0375–0.053 mm/tooth; the stringy/ribboned
 *    losers (feed 50–150 at 6–10k RPM, and the 12000-RPM ribboning)
 *    sit at 0.008–0.017. "Acetal does not like you to go gentle."
 *
 * The advisor never changes generation: `cutAdvice` is a pure read the
 * ⚡ popup displays. Where we auto-act, it is one visible click ("apply
 * recommended feed") that stamps `rates` explicitly — the user always
 * keeps the choice.
 */

import type { MaterialPreset } from './materials';
import type { Tool } from './types';

/** chip load, mm per tooth — feed per revolution divided by teeth */
export function chipLoad(feed: number, rpm: number, flutes: number): number {
  if (!(rpm > 0) || !(flutes > 0)) return 0;
  return feed / (rpm * flutes);
}

/**
 * The healthy chip-load band per material family × tool type, mm/tooth,
 * from the Makera preset corpus + Alice's coupon measurements. `best`
 * is what "apply recommendation" stamps. Tool types not listed read
 * the `flat` row (the default cutting-endmill assumption).
 */
interface ChipBand {
  min: number;
  best: number;
  max: number;
}

const CHIP_BANDS: Record<string, ChipBand> = {
  // aluminum — every Makera flat row is exactly 0.0417; balls half
  'aluminum:flat': { min: 0.02, best: 0.04, max: 0.06 },
  'aluminum:ball': { min: 0.012, best: 0.021, max: 0.03 },
  'aluminum:bull': { min: 0.012, best: 0.021, max: 0.03 },
  'aluminum:vbit': { min: 0.02, best: 0.04, max: 0.06 },
  'aluminum:corn': { min: 0.015, best: 0.03, max: 0.05 },
  'aluminum:drill': { min: 0.005, best: 0.01, max: 0.02 },
  'aluminum:threadmill': { min: 0.004, best: 0.01, max: 0.02 },
  // brass/copper — Makera rows at 0.025 flat / 0.0208 ball
  'brass:flat': { min: 0.012, best: 0.025, max: 0.04 },
  'brass:ball': { min: 0.01, best: 0.021, max: 0.03 },
  'brass:bull': { min: 0.012, best: 0.025, max: 0.04 },
  'brass:vbit': { min: 0.012, best: 0.025, max: 0.04 },
  'brass:corn': { min: 0.01, best: 0.021, max: 0.03 },
  'brass:drill': { min: 0.004, best: 0.008, max: 0.016 },
  'brass:threadmill': { min: 0.004, best: 0.008, max: 0.015 },
  'copper:flat': { min: 0.012, best: 0.025, max: 0.04 },
  'copper:ball': { min: 0.01, best: 0.021, max: 0.03 },
  'copper:bull': { min: 0.012, best: 0.025, max: 0.04 },
  'copper:vbit': { min: 0.012, best: 0.025, max: 0.04 },
  'copper:corn': { min: 0.01, best: 0.021, max: 0.03 },
  'copper:drill': { min: 0.004, best: 0.008, max: 0.016 },
  'copper:threadmill': { min: 0.004, best: 0.008, max: 0.015 },
  // plastics — Makera rows 0.083–0.1; Alice's Delrin winners
  // 0.0375–0.053 widen the bottom of the band to include her
  // measured clean cells (a 1-flute Spiral O at 1000/12000 = 0.083
  // is Makera's own recommended row)
  'plastic:flat': { min: 0.03, best: 0.05, max: 0.1 },
  'plastic:ball': { min: 0.02, best: 0.035, max: 0.06 },
  'plastic:bull': { min: 0.02, best: 0.035, max: 0.06 },
  'plastic:vbit': { min: 0.04, best: 0.08, max: 0.12 },
  'plastic:corn': { min: 0.02, best: 0.04, max: 0.07 },
  'plastic:drill': { min: 0.008, best: 0.015, max: 0.03 },
  'plastic:threadmill': { min: 0.01, best: 0.03, max: 0.05 },
  // woods — Makera softwood/hardwood rows 0.0417–0.1
  'hardwood:flat': { min: 0.04, best: 0.08, max: 0.15 },
  'hardwood:ball': { min: 0.02, best: 0.04, max: 0.08 },
  'hardwood:bull': { min: 0.02, best: 0.04, max: 0.08 },
  'hardwood:vbit': { min: 0.04, best: 0.083, max: 0.15 },
  'hardwood:corn': { min: 0.02, best: 0.04, max: 0.08 },
  'hardwood:drill': { min: 0.01, best: 0.02, max: 0.04 },
  'hardwood:threadmill': { min: 0.008, best: 0.02, max: 0.04 },
  'softwood:flat': { min: 0.04, best: 0.08, max: 0.2 },
  'softwood:ball': { min: 0.02, best: 0.04, max: 0.08 },
  'softwood:bull': { min: 0.02, best: 0.05, max: 0.1 },
  'softwood:vbit': { min: 0.04, best: 0.08, max: 0.15 },
  'softwood:corn': { min: 0.02, best: 0.04, max: 0.08 },
  'softwood:drill': { min: 0.01, best: 0.02, max: 0.04 },
  'softwood:threadmill': { min: 0.008, best: 0.02, max: 0.04 },
};

/** The family a stock material id maps to ('delrin' → 'plastic'). */
export function materialFamily(id: string): string {
  const first = id.split('-')[0].toLowerCase();
  if (first === 'delrin' || first === 'acrylic') return 'plastic';
  return first;
}

/**
 * The healthy axial depth-of-cut band as a fraction of cutter Ø, per
 * material family — from Makera's preset DOC/Ø ratios (aluminum
 * 0.03–0.1, brass 0.017–0.05, plastics/woods 0.17–1.0) plus Alice's
 * 2026-10-24 acetal ruling: "1mm step-down" on a Ø3.175 cutter =
 * 0.31×Ø, her deepest tested winner ("acetal does not like you to go
 * gentle").
 */
const DOC_FRACTION: Record<string, { min: number; best: number; max: number }> = {
  aluminum: { min: 0.05, best: 0.1, max: 0.5 },
  brass: { min: 0.05, best: 0.1, max: 0.5 },
  copper: { min: 0.05, best: 0.1, max: 0.5 },
  plastic: { min: 0.1, best: 0.3, max: 1.0 },
  hardwood: { min: 0.15, best: 0.3, max: 1.0 },
  softwood: { min: 0.15, best: 0.3, max: 1.0 },
};

export type DocVerdict = 'ok' | 'deep' | 'very-deep' | 'unknown';

/**
 * Depth-of-cut advice for a step-down value against the family's
 * DOC/Ø band. `stepDown` ≤ band.max is healthy (the corpus tops at
 * 1×Ø on woods); past `max` the tool load climbs, past 1.5×max the
 * chips cannot clear.
 */
export function docAdvice(
  stepDown: number,
  toolDiameter: number,
  family: string,
): { verdict: DocVerdict; note: string } {
  const band = DOC_FRACTION[family];
  if (!band || !(toolDiameter > 0) || !Number.isFinite(stepDown)) {
    return { verdict: 'unknown', note: '' };
  }
  const ratio = stepDown / toolDiameter;
  if (ratio <= band.max) return { verdict: 'ok', note: '' };
  if (ratio <= band.max * 1.5) {
    return {
      verdict: 'deep',
      note:
        `step-down ${stepDown}mm is ${ratio.toFixed(1)}× the cutter Ø — deep for ${family}; ` +
        `more load on the tool, watch for stalling`,
    };
  }
  return {
    verdict: 'very-deep',
    note:
      `step-down ${stepDown}mm is ${ratio.toFixed(1)}× the cutter Ø — chips cannot clear that ` +
      `deep in one pass; snap risk. Take shallower passes`,
  };
}

export type ChipVerdict = 'ok' | 'low' | 'high' | 'unknown';

export interface CutAdvice {
  chipLoad: number;
  band: ChipBand | null;
  verdict: ChipVerdict;
  /** the feed that moves the chip load to `targetChipLoad`, mm/min —
   * DIRECTIONAL (Alice, 2026-11-01): a too-low feed is raised to the
   * UPPER end of the band (75% up — Makera's own plastic rows sit at
   * the band top, and mid-band needlessly halves the job speed), a
   * too-high feed is lowered to the lower-middle (40% up — back the
   * engagement off with margin). Null when the verdict is healthy or
   * unknown: nothing to change. */
  recommendedFeed: number | null;
  /** the chip-load target `recommendedFeed` aims at, mm/tooth */
  targetChipLoad: number | null;
  /** the family's best DOC as an absolute mm value for this cutter */
  recommendedStepDown: number | null;
  docVerdict: DocVerdict;
  docNote: string;
  note: string;
}

/**
 * Full advice for one op's effective rates: the chip load the current
 * feed/rpm/flutes produce, the healthy band for this material × tool
 * type, and the recommendation a single click applies. Pure: reads
 * tool + material + overrides, writes nothing. Display-only verdicts
 * in the ⚡ popup; `apply` in the UI stamps the returned feed into
 * `rates` — explicit, visible, undoable.
 *
 * Laser tools return `unknown` everywhere (the spindleRpm slot is beam
 * power, not a speed — no chip load exists).
 */
export function cutAdvice(
  tool: Tool,
  material: MaterialPreset,
  rates?: { feed?: number; plungeFeed?: number; spindleRpm?: number },
  stepDown?: number,
): CutAdvice {
  const family = materialFamily(material.id);
  const flutes = tool.flutes ?? 2;
  const band = tool.type === 'laser' ? null : CHIP_BANDS[`${family}:${tool.type}`] ?? null;
  const docVerdict =
    stepDown !== undefined ? docAdvice(stepDown, tool.diameter, family) : null;
  const docBand = DOC_FRACTION[family];
  const recommendedStepDown =
    tool.type !== 'laser' && docBand && tool.diameter > 0
      ? round2(docBand.best * tool.diameter)
      : null;
  if (tool.type === 'laser' || !band) {
    return {
      chipLoad: 0,
      band,
      verdict: 'unknown',
      recommendedFeed: null,
      targetChipLoad: null,
      recommendedStepDown,
      docVerdict: docVerdict?.verdict ?? 'unknown',
      docNote: docVerdict?.note ?? '',
      note: '',
    };
  }
  const feed = rates?.feed ?? null;
  const rpm = rates?.spindleRpm ?? tool.spindleRpm;
  if (feed === null) {
    return {
      chipLoad: 0,
      band,
      verdict: 'unknown',
      recommendedFeed: null,
      targetChipLoad: null,
      recommendedStepDown,
      docVerdict: docVerdict?.verdict ?? 'unknown',
      docNote: docVerdict?.note ?? '',
      note: '',
    };
  }
  const cl = chipLoad(feed, rpm, flutes);
  let verdict: ChipVerdict;
  let note: string;
  if (cl < band.min) {
    verdict = 'low';
    note =
      `chip load ${cl.toFixed(4)} mm/tooth is below ${band.min} — the tool rubs instead of ` +
      `shearing; expect heat, melted strings or a noisy polished cut. Raise the feed or slow the spindle`;
  } else if (cl > band.max) {
    verdict = 'high';
    note =
      `chip load ${cl.toFixed(4)} mm/tooth is above ${band.max} — each tooth bites hard; ` +
      `expect a rough cut, a stalling spindle or a snapped bit. Lower the feed or raise the spindle speed`;
  } else {
    verdict = 'ok';
    note =
      `chip load ${cl.toFixed(4)} mm/tooth — healthy for ${family} ` +
      `(band ${band.min}–${band.max} mm/tooth)`;
  }
  // DIRECTIONAL target (Alice, 2026-11-01): raising a too-low feed aims
  // 75% up the band — Makera's own rows sit at the band top (plastic
  // rows 0.083–0.1 on a 0.03–0.1 band), so mid-band needlessly halves
  // the job; lowering a too-high feed backs off to 40% up, leaving
  // margin under the ceiling it just broke. A healthy verdict targets
  // nothing (the button is hidden) — null, not the band's `best`.
  const target =
    verdict === 'low'
      ? band.min + (band.max - band.min) * 0.75
      : verdict === 'high'
        ? band.min + (band.max - band.min) * 0.4
        : null;
  return {
    chipLoad: cl,
    band,
    verdict,
    recommendedFeed: target !== null ? Math.round(target * rpm * flutes) : null,
    targetChipLoad: target,
    recommendedStepDown,
    docVerdict: docVerdict?.verdict ?? 'unknown',
    docNote: docVerdict?.note ?? '',
    note,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}