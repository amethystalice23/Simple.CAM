/**
 * Text layout for the vendored single-line vector fonts (src/core/textFonts.ts).
 *
 * Pure module — no DOM, no three.js. `layoutText` turns a string into stroke
 * polylines (single-line fonts: strokes only, never fills) plus the extents
 * the object sizes itself from.
 *
 * Output frame (SVG-style, the same orientation every import path ships in):
 *   - x rightward from the left edge of the layout box;
 *   - y DOWNWARD from the cap-top line: y = 0 at the top line of a capital
 *     letter, baseline at y = `size` mm on the first line. Callers that store
 *     y-up geometry flip exactly like artwork imports do
 *     (e.g. y' = height/2 − y after centering).
 *   - Parentheses and quotes overhang above the cap-top line, so a few path
 *     points may have y < 0; descenders push ink below the baseline.
 *
 * `size` semantics: millimetres of CAP HEIGHT (top of a capital to the
 * baseline), NOT a point size — "ABC" at size 10 is exactly 10 mm tall.
 *
 * Line pitch is `lineHeight` (multiplier of size, default 1.2) between
 * baselines. `wrapWidth` > 0 wraps greedily at spaces (runs of spaces
 * collapse to one step); without it, every character advances the pen,
 * spaces included. Unsupported characters are skipped (pen untouched).
 * Trailing tracking (`letterSpacing`) is not charged to line width.
 * Empty or whitespace-only text returns an empty result (width 0,
 * height 0) and never throws; an unknown fontId throws (caller bug).
 */

import { getTextFont, TEXT_FONT_IDS, textFontLabel } from './textFonts';
import type { TextFont, TextGlyph } from './textFonts';

export { TEXT_FONT_IDS, textFontLabel };

export interface TextLines {
  /** Stroke polylines, mm, y downward (see module doc for the frame). */
  paths: { x: number; y: number }[][];
  /** Advance-box width, mm — the widest line. */
  width: number;
  /** Ink extent, mm — cap height plus any descender depth below the baseline. */
  height: number;
  /** Baseline of the LAST line, mm below the cap-top line (y = size for one line). */
  baseline: number;
  /** The requested cap height, mm (echoes `size`). */
  capHeight: number;
}

export interface LayoutTextOptions {
  /** Key into the font registry (see TEXT_FONT_IDS). Unknown ids throw. */
  fontId: string;
  /** Cap height in mm. Non-positive or non-finite sizes give an empty result. */
  size: number;
  /** Line pitch as a multiplier of size — default 1.2. */
  lineHeight?: number;
  /** Extra tracking between characters, mm (negative tightens) — default 0. */
  letterSpacing?: number;
  /** Wrap width mm — 0 (default) = no wrap, > 0 wraps greedily at spaces. */
  wrapWidth?: number;
}

/** Default line pitch multiplier. */
const DEFAULT_LINE_HEIGHT = 1.2;

/** A placed glyph on a planned line: glyph plus pen x (mm, line-local). */
interface PlacedGlyph {
  glyph: TextGlyph;
  x: number;
}

/** A planned line: its placed glyphs and advance-box width (mm). */
interface LinePlan {
  items: PlacedGlyph[];
  width: number;
}

/** Plan a word (any space-free run): supported glyphs placed at the pen. */
function planWord(word: string, font: TextFont, scale: number, letterSpacing: number): LinePlan {
  const items: PlacedGlyph[] = [];
  let pen = 0;
  for (const ch of word) {
    const glyph = font.glyphs[ch];
    if (!glyph) continue;
    items.push({ glyph, x: pen });
    pen += glyph.a * scale + letterSpacing;
  }
  // Trailing tracking is not part of the advance width.
  return { items, width: items.length > 0 ? pen - letterSpacing : 0 };
}

/** Plan a segment with no wrapping: every character steps the pen. */
function planSegmentUnwrapped(
  segment: string,
  font: TextFont,
  scale: number,
  letterSpacing: number,
  spaceStep: number,
): LinePlan {
  const items: PlacedGlyph[] = [];
  let pen = 0;
  let width = 0;
  for (const ch of segment) {
    if (ch === ' ') {
      pen += spaceStep;
      continue;
    }
    const glyph = font.glyphs[ch];
    if (!glyph) continue;
    items.push({ glyph, x: pen });
    pen += glyph.a * scale + letterSpacing;
    width = pen - letterSpacing;
  }
  return { items, width };
}

/**
 * Plan a segment under the wrap policy: greedy first-fit at spaces, one
 * LinePlan per wrapped line. An empty segment yields one empty line (it
 * still counts toward line pitch). Never returns fewer than one plan.
 */
function planSegmentWrapped(
  segment: string,
  font: TextFont,
  scale: number,
  letterSpacing: number,
  spaceStep: number,
  wrapWidth: number,
): LinePlan[] {
  const words = segment.split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return [{ items: [], width: 0 }];
  const plans = words.map((w) => planWord(w, font, scale, letterSpacing));

  const groups: number[][] = [];
  let current: number[] = [];
  let currentWidth = 0;
  for (let i = 0; i < plans.length; i++) {
    const candidate =
      current.length > 0 ? currentWidth + spaceStep + plans[i].width : plans[i].width;
    if (current.length > 0 && candidate > wrapWidth) {
      groups.push(current);
      current = [i];
      currentWidth = plans[i].width;
    } else {
      current.push(i);
      currentWidth = candidate;
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group) => {
    const items: PlacedGlyph[] = [];
    let pen = 0;
    let width = 0;
    for (const idx of group) {
      const plan = plans[idx];
      for (const item of plan.items) items.push({ glyph: item.glyph, x: pen + item.x });
      pen += plan.width + spaceStep;
      width = pen - spaceStep;
    }
    return { items, width };
  });
}

/**
 * Lay text out into stroke paths. See the module doc for the output frame
 * and `size` semantics. Empty/whitespace-only text returns an empty result;
 * unknown fontId throws.
 */
export function layoutText(text: string, opts: LayoutTextOptions): TextLines {
  const font = getTextFont(opts.fontId);
  const capHeight = opts.size;
  const lineHeight = opts.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const letterSpacing = opts.letterSpacing ?? 0;
  const wrapWidth = opts.wrapWidth ?? 0;

  if (!(capHeight > 0) || !Number.isFinite(capHeight)) {
    return { paths: [], width: 0, height: 0, baseline: 0, capHeight };
  }

  const scale = capHeight / font.capHeight;
  const spaceStep = font.spaceAdvance * scale + letterSpacing;
  const pitch = lineHeight * capHeight;

  const plans: LinePlan[] = [];
  for (const segment of text.split('\n')) {
    if (wrapWidth > 0) {
      plans.push(...planSegmentWrapped(segment, font, scale, letterSpacing, spaceStep, wrapWidth));
    } else {
      plans.push(planSegmentUnwrapped(segment, font, scale, letterSpacing, spaceStep));
    }
  }

  const paths: { x: number; y: number }[][] = [];
  let width = 0;
  let height = 0;
  for (let li = 0; li < plans.length; li++) {
    const plan = plans[li];
    if (plan.width > width) width = plan.width;
    const baselineY = li * pitch + capHeight;
    for (const item of plan.items) {
      for (const poly of item.glyph.p) {
        const out = poly.map(([xu, yu]) => ({
          x: item.x + xu * scale,
          y: baselineY + (yu - font.baseline) * scale,
        }));
        paths.push(out);
        for (const pt of out) if (pt.y > height) height = pt.y;
      }
    }
  }

  if (paths.length === 0) {
    return { paths: [], width: 0, height: 0, baseline: 0, capHeight };
  }

  return {
    paths,
    width,
    height,
    baseline: (plans.length - 1) * pitch + capHeight,
    capHeight,
  };
}
