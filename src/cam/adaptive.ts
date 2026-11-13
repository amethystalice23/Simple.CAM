/**
 * ADAPTIVE CLEARING SELECTOR (PLAN.md, "Adaptive clearing — constant-
 * engagement roughing", SPEC 2026-11-13): the deep-bulk third route for
 * flat area-clearing ops. Adaptive/trochoidal roughing is NOT an operation
 * and NOT a user choice — it is picked automatically the way the
 * continuous-descent path already is, inside `pocket2d`.
 *
 * Ownership of the three strategies:
 *  - `descent` is NOT decided here. pocket2d's existing continuous-descent
 *    branch (single surviving orbit, bore-fits, real ladder, not
 *    finishingOnly) takes precedence and stays exactly where it is — it
 *    returns before this selector is ever consulted. The value exists in
 *    the union because callers reason about all three routes; this
 *    function never returns it.
 *  - `trochoid` fires when the cut is DEEP in bulk stock, per the spec
 *    rule (constants are first-cut, the RULE SHAPE is the contract —
 *    depth × area, never material-dependent, never user-set):
 *
 *        trochoid  ⇔  depth > 2·D  AND  levels ≥ 2  AND  orbitCount > 1
 *
 *    `depth` = topZ − floorZ in mm; D is the tool diameter (depth in tool
 *    diameters is the real variable); `levels` = the z-ladder count;
 *    `orbitCount` = flatPassCount, the summed surviving-loop count the
 *    emitter already works from.
 *  - `orbits` is everything else: today's contour-offset emission,
 *    byte-identical (the minLoopPerimeter/leadIn precedent: absent ⇒
 *    unchanged). Shallow or single-orbit cuts stay on contour offsets —
 *    they are shorter and gentler there (spec, "what it will NOT address").
 */

export type ClearingStrategy = 'descent' | 'orbits' | 'trochoid';

export interface ClearingFacts {
  /** cutting diameter of the tool, mm */
  toolDiameter: number;
  /** topZ − floorZ, mm */
  depth: number;
  /** roughing z-ladder level count */
  levels: number;
  /** flatPassCount: summed surviving clearing loops (all inset passes) */
  orbitCount: number;
}

export function chooseClearingStrategy(f: ClearingFacts): ClearingStrategy {
  return f.depth > 2 * f.toolDiameter && f.levels >= 2 && f.orbitCount > 1
    ? 'trochoid'
    : 'orbits';
}
