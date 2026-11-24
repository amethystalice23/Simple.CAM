/**
 * The TEXT primitive (2026-11-24): typed lettering as a first-class object
 * — "+ Text" on the Model tab. The layout (src/core/textLayout.ts, the
 * vendored single-line vector fonts) runs once per edit and the primitive
 * stores the resulting STROKE PATHS in mm — the engrave pipeline consumes
 * them exactly like artwork paths (each a selectable feature), and the
 * user never types a width or height: both derive from the layout.
 */

import { layoutText, TEXT_FONT_IDS } from '../core/textLayout';
import type { Primitive, Stock, Vec2 } from '../core/types';
import { rotaryCalibrationOf } from '../core/types';
import { nextPrimitiveId, unitTransform } from './primitives';
import { stockSpan } from './placement';

/** the font select's default — the first vendored face */
export const DEFAULT_TEXT_FONT_ID: string = TEXT_FONT_IDS[0];

/** The spec the + Text dialog (and the panel editor) edits — everything
 *  EXCEPT dimensions, which derive from the layout. */
export interface TextSpec {
  text: string;
  fontId: string;
  /** cap height, mm */
  size: number;
  /** extra tracking between characters, mm (negative tightens) */
  letterSpacing: number;
  /** wrap width, mm — 0 = no wrap */
  wrapWidth: number;
}

export interface TextLayoutPaths {
  paths: Vec2[][];
  width: number;
  height: number;
}

/**
 * layoutText's output in the primitive's STORED frame: paths centered on
 * the layout box, y UP. layoutText ships the SVG orientation (y down,
 * origin top-left) like every import path in the app — the same flip the
 * artwork import applies. Empty text lays out to zero paths (a legal,
 * invisible primitive; the dialog gates on it anyway).
 */
export function layoutTextPaths(spec: TextSpec): TextLayoutPaths {
  const lay = layoutText(spec.text, {
    fontId: spec.fontId,
    size: spec.size,
    letterSpacing: spec.letterSpacing,
    ...(spec.wrapWidth > 0 ? { wrapWidth: spec.wrapWidth } : {}),
  });
  const paths = lay.paths.map((path) =>
    path.map((q) => ({ x: q.x - lay.width / 2, y: lay.height / 2 - q.y })),
  );
  return { paths, width: lay.width, height: lay.height };
}

/**
 * Rotate a laid-out label 90° CCW about its center — the compact-chart
 * idiom (Alice, 2026-11-24: "turn the text 90° and you can then squeeze
 * all the columns together"). The label's advance (+x) points UP after
 * rotation, so the text reads bottom-up along its column edge; the glyph
 * tops face left. Width and height swap (a rotated "10%" at 3mm cap is
 * ~3.4mm wide × its text length tall). The rotation is BAKED into the
 * stored points — the primitive's transform semantics stay flat, and the
 * wrapped bend composes (the stored advance maps to the arc/axial as
 * ever).
 */
export function rotateLayout90(lay: TextLayoutPaths): TextLayoutPaths {
  const paths = lay.paths.map((path) => path.map((q) => ({ x: -q.y, y: q.x })));
  return { paths, width: lay.height, height: lay.width };
}

/**
 * The + Text constructor — mirror of artworkFromImport's frame choice:
 * 3-axis lands FLAT on the stock crown (centered), 4-axis lands WRAPPED
 * on the stock's effective Ø with the transform centered on the rotation
 * axis (the wrapped-artwork convention). The paths are already mm, so
 * unlike artwork there is no scale knob — the wrap is a pure bend, arc mm
 * = layout mm, whatever Ø the text sits on.
 */
export function textPrimitiveFromSpec(
  spec: TextSpec,
  stock: Stock,
  sourceName?: string,
): Extract<Primitive, { kind: 'text' }> {
  const lay = layoutTextPaths(spec);
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const [, z1] = stockSpan(stock, 'z');
  const cal = rotaryCalibrationOf(stock);
  const rotary = stock.axisMode === '4-axis';
  return {
    kind: 'text',
    id: nextPrimitiveId(),
    sourceName,
    text: spec.text,
    fontId: spec.fontId,
    size: spec.size,
    letterSpacing: spec.letterSpacing,
    wrapWidth: spec.wrapWidth,
    paths: lay.paths,
    width: lay.width,
    height: lay.height,
    presentation: rotary ? 'wrapped' : 'flat',
    wrapDiameter: Math.max(1, cal.effectiveRadius * 2),
    transform: unitTransform({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      // wrapped: the rotation axis (the on-axis convention); flat: the crown
      z: rotary ? cal.axisZ : z1,
    }),
  };
}

/**
 * Re-layout after an edit (the panel's text/font/size fields): same
 * primitive identity, transform, presentation and Ø — only the text
 * fields and the derived paths/extent change. Selections holding path
 * ids dangle when the path count changes — the standard visible
 * "reselect" failure, like a resized primitive.
 */
export function relayoutText(
  p: Extract<Primitive, { kind: 'text' }>,
  spec: TextSpec,
): Extract<Primitive, { kind: 'text' }> {
  const lay = layoutTextPaths(spec);
  return {
    ...p,
    text: spec.text,
    fontId: spec.fontId,
    size: spec.size,
    letterSpacing: spec.letterSpacing,
    wrapWidth: spec.wrapWidth,
    paths: lay.paths,
    width: lay.width,
    height: lay.height,
  };
}
