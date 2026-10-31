import { describe, expect, it } from 'vitest';
import { engraveFillSpans } from '../engraveFill';

/** a rectangle loop — winding order is irrelevant to crossing parity */
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

// LINE PLACEMENT (probed, pinned): full stepOver stride from the low
// inset bound, the high bound appended if the stride skips it. Lines
// exactly ON the high boundary find no crossings (the half-open rule
// [lo,hi) leaves both boundary edges uncounted) and yield no spans —
// the boundary itself is zero-measure, the outline pass already
// darkened it, and the stride's last interior line sits < stepOver
// below. The expectations below are the resolver's real output.
describe('engraveFillSpans — the flat frame (step Y, cut along X)', () => {
  it('a rectangle rasters as full-width scanlines at stride, inset off the boundary', () => {
    const spans = engraveFillSpans({
      loops: [rect(0, 0, 10, 4)],
      stepOver: 1,
      inset: 0.5,
      stepAxis: 'y',
    });
    expect(spans.map((s) => s[0].y)).toEqual([0.5, 1.5, 2.5, 3.5]);
    for (const s of spans) {
      expect(s).toHaveLength(2);
      expect(s[0].x).toBeCloseTo(0.5, 9); // inset off the boundary
      expect(s[1].x).toBeCloseTo(9.5, 9);
    }
  });

  it('a hole inside a filled loop drops out (even-odd — the ankh)', () => {
    const spans = engraveFillSpans({
      loops: [rect(0, 0, 10, 10), rect(3, 3, 7, 7)], // filled ring with a hole
      stepOver: 2,
      inset: 0,
      stepAxis: 'y',
    });
    // lines y = 0,2,4,6,8 (10 is the empty boundary line): the lines
    // through the hole read even inside it → two spans flanking it
    expect(spans.map((s) => [s[0].y, s[0].x, s[1].x])).toEqual([
      [0, 0, 10],
      [2, 0, 10],
      [4, 0, 3],
      [4, 7, 10],
      [6, 0, 3],
      [6, 7, 10],
      [8, 0, 10],
    ]);
  });

  it('two disjoint letters fill independently (no grouping needed)', () => {
    const spans = engraveFillSpans({
      loops: [rect(0, 0, 2, 2), rect(5, 0, 7, 2)],
      stepOver: 2,
      inset: 0,
      stepAxis: 'y',
    });
    // lines y = 0 (spans) and y = 2 (the empty boundary line)
    expect(spans).toEqual([
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      [
        { x: 5, y: 0 },
        { x: 7, y: 0 },
      ],
    ]);
  });

  it('a region thinner than the tool yields NO lines (honest no-fill)', () => {
    expect(
      engraveFillSpans({
        loops: [rect(0, 0, 10, 0.8)],
        stepOver: 1,
        inset: 0.5,
        stepAxis: 'y',
      }),
    ).toEqual([]);
  });

  it('a span narrower than 2·inset drops; the line-mates survive', () => {
    // L-shape with a 0.3-wide tongue below y=4: at the y=3.2 line the
    // tongue's span (0.3 − 2·0.2 < 0) drops; at y=4.4 the region is
    // CONTINUOUS across the tongue root (even-odd: one span to 5.7)
    const loops = [
      [
        { x: 0, y: 3 },
        { x: 5, y: 3 },
        { x: 5, y: 4 },
        { x: 5.4, y: 4 },
        { x: 5.4, y: 3.2 },
        { x: 5.7, y: 3.2 },
        { x: 5.7, y: 4.6 },
        { x: 0, y: 4.6 },
      ],
    ];
    const spans = engraveFillSpans({
      loops,
      stepOver: 5,
      inset: 0.2,
      stepAxis: 'y',
    });
    // (the second line's y is hi−inset = 4.6−0.2 in float — closeTo,
    // never exact equality on derived arithmetic)
    expect(spans).toHaveLength(2);
    expect(spans[0][0].y).toBeCloseTo(3.2, 9);
    expect(spans[0][0].x).toBeCloseTo(0.2, 9);
    expect(spans[0][1].x).toBeCloseTo(4.8, 9); // tongue dropped at its line
    expect(spans[1][0].y).toBeCloseTo(4.4, 9);
    expect(spans[1][0].x).toBeCloseTo(0.2, 9);
    expect(spans[1][1].x).toBeCloseTo(5.5, 9); // inset off the continuous edge
  });
});

describe('engraveFillSpans — the wrapped frame (step U around, cut along V = machine X)', () => {
  it('scanlines run AXIAL (varying y/V) at stepped U, per the bed-slinger idiom', () => {
    // loops in (u around, v axial): a band around u ∈ [2,8], v ∈ [0,4]
    const spans = engraveFillSpans({
      loops: [rect(2, 0, 8, 4)],
      stepOver: 3,
      inset: 0,
      stepAxis: 'x',
    });
    // lines u = 2, 5 (8 is the empty boundary line): every span is a
    // pure axial cut at constant u — machine X at a fixed attitude
    expect(spans.map((s) => [s[0].x, s[0].y, s[1].y])).toEqual([
      [2, 0, 4],
      [5, 0, 4],
    ]);
  });
});

describe('engraveFillSpans — validation', () => {
  it('rejects bad spacing and inset', () => {
    expect(() =>
      engraveFillSpans({ loops: [rect(0, 0, 2, 2)], stepOver: 0, inset: 0, stepAxis: 'y' }),
    ).toThrow(/step over/i);
    expect(() =>
      engraveFillSpans({ loops: [rect(0, 0, 2, 2)], stepOver: 1, inset: -1, stepAxis: 'y' }),
    ).toThrow(/inset/i);
  });
  it('degenerate loops (fewer than 3 points) are ignored, not crashed on', () => {
    expect(
      engraveFillSpans({
        loops: [
          [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        ],
        stepOver: 1,
        inset: 0,
        stepAxis: 'y',
      }),
    ).toEqual([]);
  });
});