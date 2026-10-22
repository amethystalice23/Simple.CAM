import { describe, expect, it } from 'vitest';
import { parsePathData, parseSvgPaths } from '../vectorImport';
import type { Vec2 } from '../types';

const close = (got: Vec2[], want: Vec2[], tol = 1e-6) => {
  expect(got.length).toBe(want.length);
  got.forEach((p, i) => {
    expect(p.x).toBeCloseTo(want[i].x, 6);
    expect(p.y).toBeCloseTo(want[i].y, 6);
  });
  void tol;
};

describe('parsePathData', () => {
  it('parses absolute lines with implicit repeats', () => {
    close(parsePathData('M 0 0 L 10 0 10 10')[0], [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('parses relative commands, and M repeats become lineTos', () => {
    close(parsePathData('m 1 2 l 10 0 0 5')[0], [
      { x: 1, y: 2 },
      { x: 11, y: 2 },
      { x: 11, y: 7 },
    ]);
    close(parsePathData('M 0 0 5 5')[0], [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ]);
  });

  it('parses H/V and closes Z back to the subpath start', () => {
    close(parsePathData('M 0 0 H 10 V 10 Z')[0], [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ]);
  });

  it('flattens a cubic Bézier: endpoints exact, curve within tolerance', () => {
    // the unit quarter-ish curve from (0,0) to (10,0) bulging to y≈7.5
    const pts = parsePathData('M 0 0 C 0 10 10 10 10 0', 0.05)[0];
    expect(pts.length).toBeGreaterThan(4);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1].x).toBeCloseTo(10, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(0, 6);
    // every chord stays within the chord tolerance of the true curve —
    // spot-check the apex is present near the analytic max (y = 7.5 at t=.5)
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxY).toBeGreaterThan(7.4);
    expect(maxY).toBeLessThan(7.6);
  });

  it('S reflects the previous cubic control; T reflects the quad control', () => {
    const s = parsePathData('M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0', 0.05)[0];
    expect(s[s.length - 1].x).toBeCloseTo(20, 6);
    expect(s[s.length - 1].y).toBeCloseTo(0, 6);
    // S's first control = reflection of (10,10) about (10,0) = (10,-10)
    // → the second half dips below zero
    expect(Math.min(...s.map((p) => p.y))).toBeLessThan(-1);
    const t = parsePathData('M 0 0 Q 0 10 10 10 T 20 0', 0.05)[0];
    expect(t[t.length - 1].x).toBeCloseTo(20, 6);
    expect(t[t.length - 1].y).toBeCloseTo(0, 6);
  });

  it('flattens arcs: a sweep semicircle passes through the top', () => {
    // from (5,0) to (-5,0), sweep=1 → the upper semicircle
    const pts = parsePathData('M 5 0 A 5 5 0 0 1 -5 0', 0.05)[0];
    expect(pts[pts.length - 1].x).toBeCloseTo(-5, 4);
    const maxY = Math.max(...pts.map((p) => p.y));
    expect(maxY).toBeCloseTo(5, 1);
    // every point sits ON the radius-5 circle
    for (const p of pts) expect(Math.abs(Math.hypot(p.x, p.y) - 5)).toBeLessThan(0.06);
    // the mirrored sweep runs along the bottom
    const low = parsePathData('M 5 0 A 5 5 0 0 0 -5 0', 0.05)[0];
    expect(Math.min(...low.map((p) => p.y))).toBeCloseTo(-5, 1);
  });

  it('scales too-small arc radii up to reach the endpoints (spec F6.6)', () => {
    const pts = parsePathData('M 0 0 A 1 1 0 0 1 10 0', 0.05)[0];
    expect(pts[pts.length - 1].x).toBeCloseTo(10, 6);
    expect(pts[pts.length - 1].y).toBeCloseTo(0, 6);
    for (const p of pts) expect(Math.abs(Math.hypot(p.x - 5, p.y) - 5)).toBeLessThan(0.06);
  });

  it('splits multiple subpaths into separate polylines', () => {
    const polys = parsePathData('M 0 0 L 1 0 M 5 5 L 6 5');
    expect(polys).toHaveLength(2);
    close(polys[0], [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    close(polys[1], [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
  });
});

describe('parseSvgPaths', () => {
  it('walks group transforms and reads the viewBox size', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">',
      '<g transform="translate(10,5)"><path d="M 0 0 L 1 0"/></g>',
      '<g transform="scale(2)"><path d="M 0 0 L 1 0" transform="translate(1,1)"/></g>',
      '</svg>',
    ].join('');
    const art = parseSvgPaths(svg);
    expect(art.width).toBe(100);
    expect(art.height).toBe(50);
    expect(art.paths).toHaveLength(2);
    close(art.paths[0], [
      { x: 10, y: 5 },
      { x: 11, y: 5 },
    ]);
    // outer scale(2) ∘ inner translate(1,1): point (0,0) → (2,2)
    close(art.paths[1], [
      { x: 2, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it('skips paths inside <defs>', () => {
    const svg =
      '<svg><defs><path d="M 0 0 L 1 0"/></defs><path d="M 2 2 L 3 3"/></svg>';
    const art = parseSvgPaths(svg);
    expect(art.paths).toHaveLength(1);
    close(art.paths[0], [
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('composes rotate(θ cx cy) about the given center', () => {
    // a point at (2,0) rotated 90° about (0,0) lands at (0,2)
    const svg = '<svg><g transform="rotate(90)"><path d="M 2 0 L 3 0"/></g></svg>';
    const art = parseSvgPaths(svg);
    close(art.paths[0], [
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ]);
  });

  it('parses Inkscape structure: self-closing defs, multiline tags, comments, prefixed elements', () => {
    // regression: a self-closing <defs ... /> never got its depth
    // popped, so EVERYTHING after it (the real paths) was skipped
    const svg = [
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<!-- Created with Inkscape -->',
      '<svg',
      '   width="14.98mm"',
      '   viewBox="0 0 14.98 24.97"',
      '   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">',
      '  <sodipodi:namedview id="nv" inkscape:zoom="7.4" />',
      '  <defs',
      '     id="defs1" />',
      '  <g inkscape:groupmode="layer" transform="translate(-1,-1)">',
      '    <path style="fill:none" d="M 1 1 L 2 1 2 2" />',
      '  </g>',
      '</svg>',
    ].join('\n');
    const art = parseSvgPaths(svg);
    expect(art.width).toBeCloseTo(14.98, 5);
    expect(art.height).toBeCloseTo(24.97, 5);
    expect(art.paths).toHaveLength(1);
    close(art.paths[0], [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});