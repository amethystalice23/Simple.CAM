import { describe, expect, it } from 'vitest';
import { layoutText, TEXT_FONT_IDS, textFontLabel } from '../textLayout';
import { TEXT_FONTS } from '../textFonts';

/** Characters coupon labels and short user text rely on. */
const REQUIRED_CHARS = ['A', 'B', 'C', 'Z', 'a', 'z', '0', '9', '-', '+', '.', ',', ':', '%', '/', '°', '(', ')'];

describe('vendored font registry', () => {
  it('exposes every TEXT_FONT_IDS entry in the registry with a unique nonempty label', () => {
    expect(TEXT_FONT_IDS.length).toBeGreaterThanOrEqual(3);
    const labels = TEXT_FONT_IDS.map((id) => textFontLabel(id));
    for (const id of TEXT_FONT_IDS) {
      expect(TEXT_FONTS[id], `font ${id} registered`).toBeDefined();
      expect(textFontLabel(id).length, `label for ${id} nonempty`).toBeGreaterThan(0);
    }
    expect(new Set(labels).size, 'labels unique').toBe(labels.length);
  });

  it('covers required characters in every font, with positive advance and well-formed paths', () => {
    for (const id of TEXT_FONT_IDS) {
      const font = TEXT_FONTS[id];
      for (const ch of REQUIRED_CHARS) {
        const glyph = font.glyphs[ch];
        expect(glyph, `${id} has '${ch}'`).toBeDefined();
        expect(glyph.a, `${id} '${ch}' advance > 0`).toBeGreaterThan(0);
        expect(glyph.p.length, `${id} '${ch}' has strokes`).toBeGreaterThan(0);
        for (const poly of glyph.p) {
          expect(poly.length, `${id} '${ch}' stroke has >= 2 points`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('keeps cap-height conventions (baseline 22, cap top 1) in every font', () => {
    for (const id of TEXT_FONT_IDS) {
      const font = TEXT_FONTS[id];
      expect(font.capHeight).toBe(21);
      expect(font.baseline).toBe(22);
      const h = font.glyphs['H'];
      for (const poly of h.p) {
        for (const [, y] of poly) {
          expect(y).toBeGreaterThanOrEqual(1);
          expect(y).toBeLessThanOrEqual(22);
        }
      }
    }
  });

  it('throws on unknown font ids', () => {
    expect(() => layoutText('A', { fontId: 'nope', size: 5 })).toThrow();
  });
});

describe('layoutText glyph metrics', () => {
  const size = 10; // mm cap height → scale 10/21

  it.each(TEXT_FONT_IDS)('font %s lays out "ABC" with monotone glyph advance and plausible width', (id) => {
    const lay = layoutText('ABC', { fontId: id, size });
    expect(lay.paths.length).toBeGreaterThan(0);
    // Advance-box width is exactly the sum of glyph advances × scale — pen
    // position strictly increases per glyph, no overlaps in the slot model.
    const font = TEXT_FONTS[id];
    const scale = size / font.capHeight;
    const expectedWidth = [...'ABC'].reduce((sum, ch) => sum + font.glyphs[ch].a, 0) * scale;
    expect(lay.width).toBeCloseTo(expectedWidth, 6);
    // Width within loose bounds × size for three caps.
    expect(lay.width).toBeGreaterThan(1.2 * size);
    expect(lay.width).toBeLessThan(5 * size);
    // Each glyph's ink stays inside its advance slot (± 2 units of slop for
    // the script swashes and negative side bearings in the source data).
    const slop = 2 * scale;
    for (const ch of ['A', 'B', 'C']) {
      const single = layoutText(ch, { fontId: id, size });
      const minX = Math.min(...single.paths.flat().map((q) => q.x));
      const maxX = Math.max(...single.paths.flat().map((q) => q.x));
      expect(minX, `${id} '${ch}' ink not far left of pen origin`).toBeGreaterThanOrEqual(-slop);
      expect(maxX, `${id} '${ch}' ink within advance slot`).toBeLessThanOrEqual(
        font.glyphs[ch].a * scale + slop,
      );
    }
    // Cap height: ink of caps reaches the baseline exactly (y = size).
    expect(lay.height).toBeCloseTo(size, 6);
    expect(lay.baseline).toBeCloseTo(size, 6);
  });

  for (const id of TEXT_FONT_IDS) {
    for (const text of ['-0.48', '+0.36'] as const) {
      it(`font ${id} lays out "${text}" with all glyphs present`, () => {
        const lay = layoutText(text, { fontId: id, size });
        expect(lay.paths.length).toBeGreaterThan(0);
        expect(lay.width).toBeGreaterThan(0);
        // digits and sign: 5 glyphs, none skipped
        const font = TEXT_FONTS[id];
        for (const ch of [...text]) {
          expect(font.glyphs[ch], `'${ch}' in ${id}`).toBeDefined();
          expect(font.glyphs[ch].a).toBeGreaterThan(0);
        }
        // Width matches the advance model exactly; plausibly bounded for 5
        // glyphs (the source data draws hyphen/minus wide — a long dash).
        const scale = size / font.capHeight;
        const expectedWidth = [...text].reduce((sum, ch) => sum + font.glyphs[ch].a, 0) * scale;
        expect(lay.width).toBeCloseTo(expectedWidth, 6);
        expect(lay.width).toBeGreaterThan(1.2 * size);
        expect(lay.width).toBeLessThan(5.5 * size);
      });
    }
  }

  it.each(TEXT_FONT_IDS)('font %s scales linearly with size (×2 → ×2 within 1e-6)', (id) => {
    const a = layoutText('H2O', { fontId: id, size: 5 });
    const b = layoutText('H2O', { fontId: id, size: 10 });
    expect(b.width / a.width).toBeCloseTo(2, 6);
    expect(b.height / a.height).toBeCloseTo(2, 6);
    // Path geometry scales point-for-point.
    expect(b.paths.length).toBe(a.paths.length);
    for (let i = 0; i < a.paths.length; i++) {
      expect(b.paths[i].length).toBe(a.paths[i].length);
      for (let j = 0; j < a.paths[i].length; j++) {
        expect(b.paths[i][j].x).toBeCloseTo(a.paths[i][j].x * 2, 6);
        expect(b.paths[i][j].y).toBeCloseTo(a.paths[i][j].y * 2, 6);
      }
    }
  });
});

describe('layoutText multiline and wrapping', () => {
  const size = 10;
  const fontId = TEXT_FONT_IDS[0];

  it('stacks lines at lineHeight × size pitch, baselines measured from the cap-top line', () => {
    const one = layoutText('A', { fontId, size });
    const three = layoutText('A\nB\nC', { fontId, size });
    expect(three.baseline).toBeCloseTo(2 * 1.2 * size + size, 6);
    expect(three.height).toBeCloseTo(three.baseline, 6); // caps have no descenders
    expect(one.baseline).toBeCloseTo(size, 6);
    // Each line's cap ink starts exactly at its cap-top line: first path
    // point y (line 0 cap top) = 0 for 'A' which reaches cap top.
    const minY = Math.min(...three.paths[0].map((q) => q.y));
    expect(minY).toBeCloseTo(0, 6);
  });

  it('counts descender depth in height', () => {
    const lay = layoutText('Ap', { fontId, size });
    expect(lay.height).toBeGreaterThan(size);
  });

  it('wraps at spaces when wrapWidth is smaller than the line', () => {
    const hello = layoutText('HELLO', { fontId, size });
    const world = layoutText('WORLD', { fontId, size });
    const both = layoutText('HELLO WORLD', { fontId, size });
    const noWrapWidth = both.width;
    expect(noWrapWidth).toBeGreaterThan(hello.width + world.width * 0.9);
    // Wrap at a width that fits the longer word but not both words.
    const wrapWidth = Math.max(hello.width, world.width) + 0.5;
    const wrapped = layoutText('HELLO WORLD', { fontId, size, wrapWidth });
    expect(wrapped.baseline).toBeCloseTo(1.2 * size + size, 6); // two lines
    expect(wrapped.width).toBeLessThanOrEqual(wrapWidth + 1e-6);
    expect(wrapped.height).toBeCloseTo(wrapped.baseline, 6);
  });

  it('does not wrap a single word even if wider than wrapWidth', () => {
    const word = layoutText('WORLDWIDE', { fontId, size });
    const wrapped = layoutText('WORLDWIDE', { fontId, size, wrapWidth: word.width * 0.5 });
    expect(wrapped.baseline).toBeCloseTo(size, 6); // still one line
    expect(wrapped.width).toBeCloseTo(word.width, 6);
  });

  it('is deterministic (deep-equal across calls) and order-stable', () => {
    const a = layoutText('Coupon 07: +0.36 mm 40°', { fontId, size: 4 });
    const b = layoutText('Coupon 07: +0.36 mm 40°', { fontId, size: 4 });
    expect(a).toEqual(b);
  });
});

describe('layoutText degenerate inputs', () => {
  const fontId = TEXT_FONT_IDS[0];

  it('empty string → empty paths, zero extents, no throw', () => {
    const lay = layoutText('', { fontId, size: 10 });
    expect(lay.paths).toEqual([]);
    expect(lay.width).toBe(0);
    expect(lay.height).toBe(0);
    expect(lay.baseline).toBe(0);
  });

  it('whitespace-only and unsupported-only text → empty result', () => {
    for (const text of ['   ', '\n', '\n\n', 'é', 'ΩΩ']) {
      const lay = layoutText(text, { fontId, size: 10 });
      expect(lay.paths).toEqual([]);
      expect(lay.width).toBe(0);
      expect(lay.height).toBe(0);
    }
  });

  it('non-positive size → empty result, no throw', () => {
    for (const size of [0, -3, NaN]) {
      const lay = layoutText('A', { fontId, size });
      expect(lay.paths).toEqual([]);
      expect(lay.width).toBe(0);
      expect(lay.height).toBe(0);
    }
  });
});
