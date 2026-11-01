/**
 * DXF parser tests (docs/PLAN.md "Engrave + artwork import" phase 3).
 * Every fixture is a minimal ASCII DXF (group-code/value pairs); each
 * test asserts NUMBERS, not snapshots — geometry (bulge direction, the
 * y-up→v-down flip, insert transforms, units) is pinned to the spec.
 *
 * Artwork-coordinate reminder (parseDxf output): u = (x − minX)·k grows
 * right, v = (maxY − y)·k grows DOWN (SVG's convention, mm).
 */

import { describe, expect, it } from 'vitest';
import { parseDxf } from '../dxfImport';

/** build a minimal DXF: HEADER (with $INSUNITS when given) + ENTITIES */
function doc(entities: string, units?: number): string {
  const header = units === undefined ? '' : `9\n$INSUNITS\n70\n${units}\n`;
  return `0\nSECTION\n2\nHEADER\n${header}0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`;
}

/** entity slices with an R2000-style handle/subclass preamble — pins
 * that geometry is read by code, not position */
const LINE = (x1: number, y1: number, x2: number, y2: number, ex?: [number, number, number]): string =>
  `0\nLINE\n5\n2A\n330\n1F\n100\nAcDbEntity\n8\n0\n100\nAcDbLine\n` +
  (ex ? `210\n${ex[0]}\n220\n${ex[1]}\n230\n${ex[2]}\n` : '') +
  `10\n${x1}\n20\n${y1}\n30\n0.0\n11\n${x2}\n21\n${y2}\n31\n0.0\n`;

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 1e-6): boolean =>
  Math.hypot(a.x - b.x, a.y - b.y) <= tol;

const hasPoint = (pts: { x: number; y: number }[], p: { x: number; y: number }, tol = 0.06): boolean =>
  pts.some((q) => near(q, p, tol));

/** distance from p to the nearest SEGMENT of the polyline — the check
 *  that matches chord-tolerance flattening (a curve's extreme point can
 *  fall between samples, but the chord stays within tol of it) */
function nearPath(pts: { x: number; y: number }[], p: { x: number; y: number }): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby || 1e-12;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby)));
  }
  return best;
}

describe('parseDxf', () => {
  it('reads a LINE through the R2000 preamble: open, unfilled, v-down flipped', () => {
    const art = parseDxf(doc(LINE(1, 2, 3, 6)));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: false, filled: false });
    // native (1,2)→(3,6); bounds x 1..3, y 2..6 → u = x−1, v = 6−y
    expect(art.width).toBeCloseTo(2, 9);
    expect(art.height).toBeCloseTo(4, 9);
    const path = art.paths[0];
    expect(near(path[0], { x: 0, y: 4 })).toBe(true); // (1,2): higher y = LOWER v
    expect(near(path[path.length - 1], { x: 2, y: 0 })).toBe(true); // (3,6) → v 0
  });

  it('reads a CIRCLE: closed loop, every point on the radius', () => {
    const art = parseDxf(doc(`0\nCIRCLE\n8\n0\n10\n0\n20\n0\n30\n0\n40\n5\n`));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: true, filled: false });
    // width/height come from the FLATTENED bounds — within one chord
    // tolerance (0.05) of the CAD extents on each side
    expect(Math.abs(art.width - 10)).toBeLessThan(0.11);
    expect(Math.abs(art.height - 10)).toBeLessThan(0.11);
    // center (0,0) → art (5,5); samples lie exactly on the circle
    for (const p of art.paths[0]) {
      expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(5, 1);
    }
  });

  it('reads an ARC: CCW from start to end, open', () => {
    // 0°→90°, r=10 at origin: (10,0) → (0,10) through Q1
    const art = parseDxf(doc(`0\nARC\n8\n0\n10\n0\n20\n0\n30\n0\n40\n10\n50\n0\n51\n90\n`));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: false, filled: false });
    const path = art.paths[0];
    // bounds from flattened geometry: x,y ∈ [0,10] → art u = x, v = 10 − y
    expect(near(path[0], { x: 10, y: 10 })).toBe(true); // native (10,0)
    expect(near(path[path.length - 1], { x: 0, y: 0 })).toBe(true); // native (0,10)
    expect(path[1].y).toBeLessThan(10); // CCW: from (10,0) the arc heads DOWN in v
    expect(hasPoint(path, { x: 7.07, y: 2.93 })).toBe(true); // 45° point in Q1
  });

  it('flattens an LWPOLYLINE bulge = +1 to the CCW semicircle (below the chord)', () => {
    // bulge b = tan(Δθ/4): +1 ⇒ CCW half turn. From (0,0) to (2,0) the
    // CCW arc around (1,0) passes (1,−1) — the sign convention, pinned.
    const art = parseDxf(doc(`0\nLWPOLYLINE\n90\n2\n70\n0\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n`));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: false, filled: false });
    // the OPEN half-circle spans y ∈ [−1,0] → art v = −y ∈ [0,1];
    // the arc bottom (1,−1) → art (1,1)
    expect(nearPath(art.paths[0], { x: 1, y: 1 })).toBeLessThan(0.06);
    // it never crosses ABOVE the chord (the CW/top semicircle would)
    for (const p of art.paths[0]) expect(p.y).toBeGreaterThanOrEqual(-1e-9);
  });

  it('a closed two-bulge LWPOLYLINE reconstructs the same circle as CIRCLE', () => {
    const lw = parseDxf(
      doc(`0\nLWPOLYLINE\n90\n2\n70\n1\n10\n0\n20\n0\n42\n1\n10\n2\n20\n0\n42\n1\n`),
    );
    const circ = parseDxf(doc(`0\nCIRCLE\n8\n0\n10\n1\n20\n0\n40\n1\n`));
    expect(lw.meta[0]).toEqual({ closed: true, filled: false });
    // both flatten the circle centered (1,0) r=1; lw bounds y −1..1, v = 1−y;
    // circ bounds 0..2, v = 2−y — same circle in art space, so same radii
    const cLw = { x: 1, y: 1 };
    for (const p of lw.paths[0]) expect(Math.hypot(p.x - cLw.x, p.y - cLw.y)).toBeCloseTo(1, 1);
    const cCirc = { x: 1, y: 1 };
    for (const p of circ.paths[0]) expect(Math.hypot(p.x - cCirc.x, p.y - cCirc.y)).toBeCloseTo(1, 1);
  });

  it('reads an old-style POLYLINE/VERTEX/SEQEND with a bulge and closed flag', () => {
    const art = parseDxf(
      doc(
        `0\nPOLYLINE\n8\n0\n66\n1\n70\n1\n` +
          `0\nVERTEX\n8\n0\n10\n0\n20\n0\n42\n1\n` +
          `0\nVERTEX\n8\n0\n10\n2\n20\n0\n42\n0\n` +
          `0\nSEQEND\n8\n0\n`,
      ),
    );
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: true, filled: false });
    // closed: the last→first segment uses the LAST vertex's bulge (0 here),
    // so the D-shape is the CCW semicircle below + the chord back at y=0.
    // Art: y ∈ [−1,0] → v = −y; the arc bottom (1,−1) → (1,1)
    expect(nearPath(art.paths[0], { x: 1, y: 1 })).toBeLessThan(0.06);
  });

  it('reads an ELLIPSE: full = closed, semi-axes from major + ratio', () => {
    // major axis (4,0), ratio 0.5 → semi-axes 4 and 2
    const art = parseDxf(doc(`0\nELLIPSE\n8\n0\n10\n0\n20\n0\n30\n0\n11\n4\n21\n0\n31\n0\n40\n0.5\n41\n0\n42\n6.283185307179586\n`));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: true, filled: false });
    expect(art.width).toBeCloseTo(8, 6);
    expect(art.height).toBeCloseTo(4, 6);
  });

  it('reads a control-point SPLINE: clamped NURBS hits its end controls', () => {
    // quadratic, controls (0,0) (2,2) (4,0), clamped knots [0,0,0,1,1,1]
    const spl =
      `0\nSPLINE\n8\n0\n70\n8\n71\n2\n72\n6\n73\n3\n74\n0\n` +
      `40\n0\n40\n0\n40\n0\n40\n1\n40\n1\n40\n1\n` +
      `41\n1\n41\n1\n41\n1\n` +
      `10\n0\n20\n0\n30\n0\n10\n2\n20\n2\n30\n0\n10\n4\n20\n0\n30\n0\n`;
    const art = parseDxf(doc(spl));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: false, filled: false });
    const path = art.paths[0];
    // endpoints = the end controls exactly; v of both = the sampled
    // maxY (curve peak ≈ (2,1), the bounds reference), equal at both ends
    expect(path[0].x).toBeCloseTo(0, 6);
    expect(path[path.length - 1].x).toBeCloseTo(4, 6);
    expect(Math.abs(path[0].y - path[path.length - 1].y)).toBeLessThan(0.11);
    // curve height ≈ 1 (peak 1, endpoints 0), sampled within chord tol
    const vs = path.map((p) => p.y);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(1, 1);
    // the peak sits over x = 2
    const peak = path.reduce((a, b) => (b.y < a.y ? b : a));
    expect(peak.x).toBeCloseTo(2, 1);
  });

  it('reads INSERT with base point, scale, rotation — and nested INSERTs', () => {
    const text =
      `0\nSECTION\n2\nHEADER\n0\nENDSEC\n` +
      `0\nSECTION\n2\nBLOCKS\n` +
      // LEAF: a circle r=1 at origin; base (0,0)
      `0\nBLOCK\n2\nLEAF\n10\n0\n20\n0\n` +
      `0\nCIRCLE\n8\n0\n10\n0\n20\n0\n40\n1\n` +
      `0\nENDBLK\n` +
      // MID inserts LEAF at (3,0), no scale/rot; base (0,0)
      `0\nBLOCK\n2\nMID\n10\n0\n20\n0\n` +
      `0\nINSERT\n2\nLEAF\n10\n3\n20\n0\n` +
      `0\nENDBLK\n` +
      // PART: one authored LINE, base (1,1)
      `0\nBLOCK\n2\nPART\n10\n1\n20\n1\n` +
      `0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1\n21\n0\n` +
      `0\nENDBLK\n` +
      `0\nENDSEC\n` +
      `0\nSECTION\n2\nENTITIES\n` +
      // PART at (10,20), scale 2, rot 90: line (0,0)→(1,0) in block space
      // → −(1,1) → ×2 → rot90 → +(10,20) = (12,18)→(12,20)
      `0\nINSERT\n2\nPART\n10\n10\n20\n20\n41\n2\n42\n2\n50\n90\n` +
      // nested MID: the leaf circle lands at (3,0) r=1
      `0\nINSERT\n2\nMID\n10\n0\n20\n0\n` +
      `0\nENDSEC\n0\nEOF\n`;
    const art = parseDxf(text);
    // two INSERTs: the LINE from PART, the nested LEAF circle via MID
    expect(art.paths.length).toBe(2);
    // the transformed LINE: (12,18)→(12,20); bounds x 2..12 (circle x-min
    // within a chord of 2), y −1..20 → u = x−minX ≈ 10, v = 20 − y
    const linePath = art.paths[0];
    expect(near(linePath[0], { x: 10, y: 2 }, 0.06)).toBe(true);
    expect(near(linePath[1], { x: 10, y: 0 }, 0.06)).toBe(true);
    // the nested circle: center (3,0) r=1 → art center (1,20)
    const circlePath = art.paths[1];
    expect(circlePath.length).toBeGreaterThan(8);
    for (const p of circlePath) expect(Math.hypot(p.x - 1, p.y - 20)).toBeCloseTo(1, 1);
  });

  it('reads a HATCH with a polyline boundary: closed and filled', () => {
    // 10×10 square boundary, bulged flag off, closed
    const hatch =
      `0\nHATCH\n8\n0\n2\nSOLID\n70\n1\n71\n0\n91\n1\n` +
      `92\n2\n72\n0\n73\n1\n93\n4\n` +
      `10\n0\n20\n0\n10\n10\n20\n0\n10\n10\n20\n10\n10\n0\n20\n10\n`;
    const art = parseDxf(doc(hatch));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: true, filled: true });
    expect(art.width).toBeCloseTo(10, 9);
    expect(art.height).toBeCloseTo(10, 9);
    const path = art.paths[0];
    for (const corner of [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]) {
      expect(hasPoint(path, corner)).toBe(true);
    }
  });

  it('reads a HATCH edge loop of lines and a CCW arc edge', () => {
    // line (0,0)→(5,0); arc center (0,5) r5 from 270°→0° CCW ((0,0)→(5,5));
    // line (5,5)→(0,0). bounds x 0..5 y 0..5 → art u = x, v = 5 − y
    const hatch =
      `0\nHATCH\n8\n0\n91\n1\n` +
      `92\n0\n72\n3\n` +
      `71\n1\n10\n0\n20\n0\n11\n5\n21\n0\n` +
      `71\n2\n10\n0\n20\n5\n40\n5\n50\n270\n51\n0\n73\n1\n` +
      `71\n1\n10\n5\n20\n5\n11\n0\n21\n0\n`;
    const art = parseDxf(doc(hatch));
    expect(art.paths).toHaveLength(1);
    expect(art.meta[0]).toEqual({ closed: true, filled: true });
    const path = art.paths[0];
    expect(near(path[0], { x: 0, y: 5 })).toBe(true); // first edge's start (0,0)
    expect(hasPoint(path, { x: 5, y: 5 })).toBe(true); // (5,0)
    expect(hasPoint(path, { x: 5, y: 0 })).toBe(true); // (5,5)
    expect(hasPoint(path, { x: 3.5355, y: 3.5355 })).toBe(true); // arc mid at 315°, CCW side
    expect(hasPoint(path, { x: -3.5355, y: 3.5355 })).toBe(false); // the CW side
  });

  it('honors $INSUNITS (inches → mm) in the output scale', () => {
    const art = parseDxf(doc(`0\nCIRCLE\n8\n0\n10\n0\n20\n0\n40\n2\n`, 1));
    // r=2in → Ø 101.6 mm, within flattened-bounds sagitta (≤ 0.1 mm/side)
    expect(Math.abs(art.width - 101.6)).toBeLessThan(0.15);
    expect(Math.abs(art.height - 101.6)).toBeLessThan(0.15);
    // samples lie exactly on the scaled circle; the art-space center is
    // the SAMPLED bounds corner (off the true center by ≤ a sagitta), so
    // the radius check carries that offset too
    for (const p of art.paths[0]) expect(Math.hypot(p.x - 50.8, p.y - 50.8)).toBeCloseTo(50.8, 0);
  });

  it('treats a unitless file as mm', () => {
    const art = parseDxf(doc(LINE(0, 0, 5, 0)));
    expect(art.width).toBeCloseTo(5, 9);
  });

  it('skips text/dimensions/unknown entities and keeps the line work', () => {
    const art = parseDxf(
      doc(
        `0\nTEXT\n8\n0\n10\n1\n20\n1\n40\n2\n1\nhello\n` +
          `0\nDIMENSION\n8\n0\n2\n*D1\n10\n0\n20\n0\n` +
          `0\n3DSOLID\n8\n0\n` +
          LINE(0, 0, 4, 0),
      ),
    );
    expect(art.paths).toHaveLength(1);
    expect(art.width).toBeCloseTo(4, 9);
  });

  it('skips an entity with a non-identity OCS extrusion, keeps (0,0,1)', () => {
    const art = parseDxf(
      doc(
        LINE(0, 0, 1, 0, [0, 1, 0]) + // tilted plane: dropped
        LINE(0, 2, 3, 2, [0, 0, 1]), // identity OCS: kept
      ),
    );
    expect(art.paths).toHaveLength(1);
    expect(art.width).toBeCloseTo(3, 9);
  });

  it('returns empty artwork (never throws) for empty, unknown-only, or truncated files', () => {
    expect(parseDxf(doc(''))).toEqual({ paths: [], meta: [], width: 0, height: 0 });
    expect(parseDxf(doc(`0\nPOINT\n8\n0\n10\n1\n20\n1\n`)).paths).toHaveLength(0);
    const truncated = doc(LINE(0, 0, 4, 0)).slice(0, 200); // cut mid-entity
    const art = parseDxf(truncated);
    expect(Array.isArray(art.paths)).toBe(true);
    expect(art.meta.length).toBe(art.paths.length);
  });

  it('refuses binary DXF with a clear message', () => {
    expect(() => parseDxf('AutoCAD Binary DXF\r\n\u001a\u0000binary junk')).toThrow(/ASCII DXF/);
  });
});