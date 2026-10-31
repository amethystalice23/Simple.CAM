/**
 * Engrave FILL — the scanline region resolver (Alice's rulings,
 * 2026-10-31: "always run the outlines, but then go back and raster
 * fill the closed and filled paths... be considerate of negative
 * closed areas within a filled one, such as the ankh logo").
 *
 * Pure geometry: closed FILLED loops in → scanline polylines out,
 * handed to the engrave generator as ordinary paths (each scanline is
 * a path — the generator's ladder, laser power stamping, and A
 * accumulation apply to it exactly as to an authored stroke).
 *
 * SCAN DIRECTION — the machine's fast X (Alice: "X axis rastering...
 * what i have come to expect from using dedicated laser cutters...
 * likely the case with the Makeras as well, being a bed slinger"):
 *  - FLAT frame: paths are machine (X,Y); scanlines run along X at
 *    constant Y, stepping Y by `stepOver` (`stepAxis: 'y'`).
 *  - WRAPPED frame: paths are (u = mm around, v = mm axial) with v on
 *    machine X; scanlines run along V at constant U, stepping U
 *    (`stepAxis: 'x'`) — every cut is a pure straight axial G94 move,
 *    and the U step between lines is an A rapid. Scanlines never cross
 *    the U seam (they are axial), and loop U coordinates arrive
 *    UNWRAPPED-continuous from the engrave wiring, so no seam split is
 *    needed: parity is preserved along the unwrapped axis.
 *
 * REGIONS — even-odd crossing parity over ALL loops together (no
 * grouping needed): a scanline's crossings with every loop segment are
 * sorted; inside = odd crossing count. Two disjoint letters read odd
 * inside each; a loop nested in a filled one (the ankh's hole) reads
 * even inside the hole and drops out. This is SVG's own fill rule for
 * non-self-intersecting loops.
 *
 * INSET — every span shrinks by `inset` (the tool radius; 0 for the
 * beam) at both ends so the swept cut clears the boundary without
 * crossing it. A span that cannot shrink (boundary-to-boundary closer
 * than 2·inset) is honestly dropped, and a region thinner than the
 * tool yields no lines at all.
 */
export interface EngraveFillOptions {
  /** closed FILLED loops, frame space (flat = machine XY; wrapped =
   *  (u around, v axial)). Topology flags were resolved by the caller —
   *  this resolver is blind to paint. */
  loops: { x: number; y: number }[][];
  /** scanline spacing along the step axis, mm on the surface */
  stepOver: number;
  /** clear inset at span ends, mm (tool radius; 0 for the beam) */
  inset: number;
  /** which coordinate the lines STEP in — 'y' (flat: step Y, cut X)
   *  or 'x' (wrapped: step U, cut V/machine-X). The cut direction is
   *  the OTHER axis, always machine-X. */
  stepAxis: 'x' | 'y';
}

/**
 * Resolve the fill scanlines: one polyline per even-odd span per line,
 * in frame space, ordered step-min to step-max. Empty when no loop
 * survives the inset (an honest no-fill).
 */
export function engraveFillSpans(o: EngraveFillOptions): { x: number; y: number }[][] {
  if (!(o.stepOver > 0)) throw new Error('fill step over must be positive');
  if (!(o.inset >= 0)) throw new Error('fill inset must not be negative');
  const loops = o.loops.filter((l) => l.length >= 3);
  if (loops.length === 0) return [];

  const stepKey = o.stepAxis === 'x' ? 'x' : 'y';
  const cutKey = o.stepAxis === 'x' ? 'y' : 'x';
  let lo = Infinity;
  let hi = -Infinity;
  for (const loop of loops) {
    for (const p of loop) {
      const v = p[stepKey];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // the tool cannot enter a region thinner than it — no lines at all
  const a = lo + o.inset;
  const b = hi - o.inset;
  if (!(a <= b)) return [];

  // lines at FULL stepOver stride from the low inset bound (the raster
  // convention: predictable spacing — on a laser, consistent power per
  // line), with the high inset bound appended when the stride skips it
  // (its gap is then < stepOver). No line ever rides outside [a, b].
  const lines: number[] = [];
  for (let k = 0; ; k++) {
    const v = a + k * o.stepOver;
    if (v > b + 1e-9) break;
    lines.push(Math.min(v, b));
  }
  if (lines.length === 0 || b - lines[lines.length - 1] > 1e-9) lines.push(b);

  const out: { x: number; y: number }[][] = [];
  for (const v of lines) {
    // crossings with the step-axis line `p[stepKey] = v`, half-open on
    // the high end ([lo,hi)) so a vertex shared by two segments counts
    // exactly once — parity is the whole region rule
    const xs: number[] = [];
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const p0 = loop[i];
        const p1 = loop[(i + 1) % loop.length];
        const s0 = p0[stepKey];
        const s1 = p1[stepKey];
        if (s0 === s1) continue; // parallel to the line: no crossing
        const crossLo = s0 < s1 ? s0 : s1;
        const crossHi = s0 < s1 ? s1 : s0;
        if (!(v >= crossLo && v < crossHi)) continue;
        xs.push(p0[cutKey] + ((v - s0) * (p1[cutKey] - p0[cutKey])) / (s1 - s0));
      }
    }
    xs.sort((p, q) => p - q);
    // even-odd spans, inset at both ends; a span that cannot survive
    // the inset is dropped (the outline already darkened the rim)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const u0 = xs[i] + o.inset;
      const u1 = xs[i + 1] - o.inset;
      if (u1 <= u0) continue;
      out.push([
        { [cutKey]: u0, [stepKey]: v } as { x: number; y: number },
        { [cutKey]: u1, [stepKey]: v } as { x: number; y: number },
      ]);
    }
  }
  return out;
}