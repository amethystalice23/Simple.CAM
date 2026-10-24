/**
 * Test-pattern planner — the cutting-calibration coupon's math (the v1–v5
 * hand-rolled Delrin matrix coupons, productized). Two parameters are
 * linspaced min→max across a grid of cells cut over the WHOLE stock; every
 * other parameter holds the tool-preset default so it can never confound
 * the read. Plain math only: cell counts come from the stock size and the
 * tool Ø.
 *
 * Rotary stock (cylinder, 4-axis): spiral grooves at a fixed 60° helix —
 * the derived sweet spot (the feed clamp lifts to ~634 mm/min while walls
 * stay ~2mm at 5 strands). Strands run around the cylinder (row), X
 * groupings along the bar (col). Flat stock (box): square pockets big
 * enough for several clearing passes each, rows on Y, cols on X.
 *
 * The planner is PURE and UI-shareable: the Calibration dialog runs it
 * live for the legend and warnings, then materializes its output into
 * ORDINARY OPS (face + spiralCarve per cell, or one box primitive + pocket
 * per cell) — the materialized ops list IS the record the user refers
 * back to: every cell an op row with its rates in the ⚡ popup, its minutes
 * in the estimate, and its parameters saved in the job file.
 *
 * Lessons from the coupon iterations are encoded here, not rediscovered
 * by users (see src/ui/__tests__/couponFeedMatrix.test.ts for the history):
 * - a whole-bar face pass first, when asked: trues the runout and strips
 *   any stress skin — the v4 confound (deepest cuts read cleanest only
 *   because eccentric stock engaged deeper on proud spots)
 * - RPM belongs on the grouping axis: a spindle settles slower than the
 *   machine repositions, so speed changes at every cell boundary skew
 *   adjacent cells (v5) — the planner WARNS, it never silently swaps
 * - a feed above the rotary ceiling (A ≈ 6.6 RPM sustained) clamps in the
 *   G93 timing, so labeled cells alias — warned, never silently cut
 * - the +X orientation tails are RANKED: strand 1 runs longest, each
 *   next strand shorter — every groove's own length ranks it, so each
 *   cell identifies itself with no "clockwise" convention (which is
 *   viewpoint-dependent and would flip end-for-end). The −X ends all
 *   align; the staggered end is the +X end.
 */

import type { MatrixParam, Stock, Tool } from '../core/types';
import { originSpan, rotaryCalibrationOf, round2 } from '../core/types';
import { MAX_ROTARY_RPM } from './faceCylinder';

/** The per-cell parameter set: the two axis params linspaced, the rest at
 * the tool-preset defaults. */
export interface MatrixDefaults {
  feed: number;
  spindleRpm: number;
  stepDown: number;
  stepOver: number;
}

/** Display names for the matrix parameters — the panel's axis selects,
 * the summaries, and the .nc face-comment all read from this one map. */
export const MATRIX_PARAM_LABEL: Record<MatrixParam, string> = {
  spindleRpm: 'spindle speed',
  feed: 'feed rate',
  stepDown: 'step down',
  stepOver: 'step over',
};

/** The testPattern fields of a JobOp (decouples the planner from the union
 * so the UI and tests can call it without assembling a whole op). */
export interface TestPatternFields {
  rowParam: MatrixParam;
  colParam: MatrixParam;
  rowMin: number;
  rowMax: number;
  colMin: number;
  colMax: number;
  faceFirst: boolean;
}

// ------------------------------------------------------------ constants

/** Helix angle off the circumferential direction, degrees — the derived
 * sweet spot: the rotary feed clamp lifts to ~634 mm/min while a groove's
 * A-footprint stays narrow enough for 2mm+ walls between 5 strands. */
const SPIRAL_ANGLE = 60;
/** Groove length along X per cell, mm (the v5 span). */
const GROOVE_SPAN = 5;
/** X wall between groupings, mm. */
const GROUP_GAP = 3;
/** Unused X at each stock end, mm (vice jaws / stock edge). */
const GROUP_MARGIN = 3;
/** Minimum wall between grooves around the cylinder, mm of arc. */
const STRAND_WALL = 2;
/** The useful strand cap: past 6, extra circumference is better spent
 * widening grooves (the step-over axis becomes real). */
const MAX_STRANDS = 6;
/** Divisions per axis cap — 10×10 is plenty of calibration; larger stock
 * GROWS the cells/grooves to fill it instead of multiplying them. */
const MAX_DIVISIONS = 10;
/** Radial skim of the face pass, mm (Ø16.35 → Ø15.75, the v4 skin cut). */
const FACE_SKIN = 0.3;
/** Face pass ring spacing, mm — endmills are not perfectly flat at the
 * end, so keep it small (the v4 note). */
const FACE_STEP_OVER = 1;
/** Flat-grid edge margin and inter-pocket wall, in tool diameters: the
 * pocket needs the tool plus clearance on every side. */
const FLAT_SPACING_FACTOR = 1;
/** Minimum flat pocket per side, in tool diameters — several
 * up/down/side/side clearing passes (Alice's requirement). */
const FLAT_MIN_CELL_FACTOR = 3;
/** How much bigger the flat perimeter border is than the inter-cell gap,
 * mm — cell 1/1 grows this far into it on its two outer sides, so the
 * oversized corner marks the grid origin (the flat analogue of the
 * ranked +X tails: row 1 and column 1 are the grown cell's row/column). */
const FLAT_ORIGIN_GROWTH = 2;

// ------------------------------------------------------------- planning

/** A groove's footprint around the cylinder, mm of arc at the surface.
 * Empirical 1/cos projection (the coupon notes): validated at both ends
 * — 5 strands fit at 60° on the faced Ø15.75, and 70° collides them. */
function grooveArcWidth(toolDiameter: number, width: number): number {
  return Math.max(toolDiameter, width) / Math.cos((SPIRAL_ANGLE * Math.PI) / 180);
}

/** Value rounding per parameter — the ladder reads clean in the .nc:
 * feeds to 10, RPM to 25, depths to 0.05, step-overs to 0.1. */
function roundParam(param: MatrixParam, v: number): number {
  switch (param) {
    case 'feed':
      return Math.round(v / 10) * 10;
    case 'spindleRpm':
      return Math.round(v / 25) * 25;
    case 'stepDown':
      return Math.round(v * 20) / 20;
    case 'stepOver':
      return Math.round(v * 10) / 10;
  }
}

/** Linspaced min→max over `count` cells (rounded per parameter); a single
 * cell cuts at the max — the aggressive end is the interesting probe. */
function ladder(param: MatrixParam, min: number, max: number, count: number): number[] {
  if (count <= 1) return [roundParam(param, max)];
  return Array.from(
    { length: count },
    (_, i) => roundParam(param, min + ((max - min) * i) / (count - 1)),
  );
}

/** Ordered min/max (a swapped box is friendlier than an error). */
function spanOf(min: number, max: number): [number, number] {
  return min <= max ? [min, max] : [max, min];
}

export interface TestPatternPlan {
  mode: 'flat' | 'rotary';
  /** fatal: nothing cuts (bad stock/mode combination, tool does not fit) */
  error: string | null;
  /** advisories: the coupon still cuts, but a read may be confounded */
  warnings: string[];
  /** strand count (rotary) / Y row count (flat) */
  rows: number;
  /** X grouping count (rotary) / X column count (flat) */
  cols: number;
  /** the linspaced values along each axis (row = strand / Y, col = group / X) */
  rowValues: number[];
  colValues: number[];
  /** the axis parameters, mirrored from the op for planCell */
  rowParam: MatrixParam;
  colParam: MatrixParam;
  /** the parameters NOT on an axis — the constant controls */
  fixed: MatrixDefaults;
  rotary: {
    /** whole-bar face pass first, when asked (the v4 confound lesson) */
    face: {
      targetDiameter: number;
      xStart: number;
      xEnd: number;
      feed: number;
      rpm: number;
      /** radial depth per face level, mm */
      stepDown: number;
      /** face ring spacing, mm — endmills are not perfectly flat */
      stepOver: number;
    } | null;
    /** the surface every groove cuts into: faced Ø or stock Ø */
    surfaceDiameter: number;
    /** X start of each grouping's groove, machine X */
    groupXs: number[];
    /** degrees between strand phases */
    spinStep: number;
    /** helix angle off the circumferential direction, degrees */
    angle: number;
    /** groove length along X per cell, mm */
    span: number;
    /** the +X orientation tail per rank step, mm — strand s's groove runs
     * tailStep·(rows−1−s) past the span: longest at strand 1, shortening
     * strand by strand, so every groove self-identifies. Chosen so the
     * longest tail still leaves ≥1mm wall to the next grouping. */
    tailStep: number;
  } | null;
  flat: {
    /** per-cell pocket size, mm */
    cellW: number;
    cellH: number;
    /** wall between pockets */
    spacing: number;
    /** cell 1/1 grows this far into the perimeter on its two outer
     * sides — the oversized corner marks the grid origin */
    originGrowth: number;
    /** machine X/Y of the grid block's low (−X, −Y) corner; rows run
     * TOP to bottom — row 1 is the +Y-most row, column 1 the −X-most */
    x0: number;
    y0: number;
    /** machine Z of the stock crown the pockets cut from */
    crownZ: number;
    /** every pocket's total depth, mm — the step-down axis varies the
     * PASS depth against it, never the pocket depth */
    totalDepth: number;
  } | null;
}

/**
 * The mode from the stock: a cylinder on the rotary axis carves the
 * spiral pattern; a box mills the pocket grid. A cylinder in 3-axis mode
 * can do neither.
 */
export function testPatternMode(stock: Stock): { mode: 'flat' | 'rotary' } | { error: string } {
  if (stock.kind === 'cylinder') {
    return stock.axisMode === '4-axis'
      ? { mode: 'rotary' }
      : { error: 'cylinder stock needs 4-axis mode for the spiral pattern — switch the Stock tab, or use box stock for the flat grid' };
  }
  return { mode: 'flat' };
}

/** Per-cell parameters: the axis param takes its ladder value, everything
 * else the constant preset default. If both axes name the same parameter
 * (the UI prevents it), the row ladder wins. */
export function planCell(plan: TestPatternPlan, row: number, col: number): MatrixDefaults {
  const pick = (p: MatrixParam): number =>
    plan.rowParam === p
      ? plan.rowValues[row]
      : plan.colParam === p
        ? plan.colValues[col]
        : plan.fixed[p];
  return {
    feed: pick('feed'),
    spindleRpm: pick('spindleRpm'),
    stepDown: pick('stepDown'),
    stepOver: pick('stepOver'),
  };
}

/**
 * Plan the coupon: cell counts from the stock and tool, value ladders
 * from the user's min/max, warnings from the coupon lessons. Pure — the
 * ops panel runs it live, generation runs the same result.
 */
export function planTestPattern(
  op: TestPatternFields,
  stock: Stock,
  tool: Tool,
  defaults: MatrixDefaults,
): TestPatternPlan {
  const warnings: string[] = [];
  const mode = testPatternMode(stock);
  if ('error' in mode) {
    return {
      mode: stock.kind === 'cylinder' ? 'rotary' : 'flat',
      error: mode.error,
      warnings,
      rows: 0, cols: 0, rowValues: [], colValues: [],
      rowParam: op.rowParam, colParam: op.colParam,
      fixed: defaults, rotary: null, flat: null,
    };
  }
  if (op.rowParam === op.colParam) {
    warnings.push('both axes vary the same parameter — the row ladder wins; pick two different parameters');
  }
  if (mode.mode === 'rotary') {
    // testPatternMode guarantees rotary ⇔ cylinder stock
    return planRotary(op, stock as Extract<Stock, { kind: 'cylinder' }>, tool, defaults, warnings);
  }
  return planFlat(op, stock as Extract<Stock, { kind: 'box' }>, tool, defaults, warnings);
}

/** The rotary plan — spiral grooves, strands × X groupings. */
function planRotary(
  op: TestPatternFields,
  stock: Extract<Stock, { kind: 'cylinder' }>,
  tool: Tool,
  defaults: MatrixDefaults,
  warnings: string[],
): TestPatternPlan {
  const cal = rotaryCalibrationOf(stock);
  const stockD = cal.effectiveRadius * 2;
  const [x0, x1] = originSpan(stock.xOrigin, stock.length);
  // round2 kills the float dust (8.175·2 − 0.6 → 15.750000000000002) so
  // the surfaced Ø reads clean in the .nc comments
  const surfaceD = op.faceFirst ? round2(stockD - 2 * FACE_SKIN) : stockD;
  const r = surfaceD / 2;
  if (r < 1) {
    return {
      mode: 'rotary', error: 'the stock is too thin to face and carve', warnings,
      rows: 0, cols: 0, rowValues: [], colValues: [],
      rowParam: op.rowParam, colParam: op.colParam,
      fixed: defaults, rotary: null, flat: null,
    };
  }
  const circ = Math.PI * surfaceD;

  // The widest groove any cell cuts drives the grouping pitch (a width
  // fan spreads the groove's X footprint) and the strand budget (a
  // groove's arc footprint grows with its width).
  const widthOnRow = op.rowParam === 'stepOver';
  const widthOnCol = op.colParam === 'stepOver';
  const widthWanted = widthOnRow
    ? Math.max(...spanOf(op.rowMin, op.rowMax))
    : widthOnCol
      ? Math.max(...spanOf(op.colMin, op.colMax))
      : tool.diameter;

  // X groupings: pitch covers the groove, its width fan, and a wall. The
  // count caps at MAX_DIVISIONS — a longer bar GROWS the grooves instead
  // of multiplying cells.
  const widthFan = Math.max(0, widthWanted - tool.diameter);
  const pitchMin = GROOVE_SPAN + widthFan + GROUP_GAP;
  const colsFit = Math.floor((stock.length - 2 * GROUP_MARGIN) / pitchMin);
  const cols = Math.min(colsFit, MAX_DIVISIONS);
  if (cols < 1) {
    return {
      mode: 'rotary',
      error: `the stock is too short for even one grouping at this groove width (needs ${round2(pitchMin + 2 * GROUP_MARGIN)}mm of bar)`,
      warnings,
      rows: 0, cols: 0, rowValues: [], colValues: [],
      rowParam: op.rowParam, colParam: op.colParam,
      fixed: defaults, rotary: null, flat: null,
    };
  }
  // capped out: stretch the span so the grooves fill the bar — floored
  // to 0.1mm so the footprint never exceeds the available pitch
  const span =
    colsFit <= MAX_DIVISIONS
      ? GROOVE_SPAN
      : Math.floor(((stock.length - 2 * GROUP_MARGIN) / cols - widthFan - GROUP_GAP) * 10) / 10;
  const pitch = span + widthFan + GROUP_GAP;
  const blockW = cols * pitch - GROUP_GAP;
  const gx0 = (x0 + x1) / 2 - blockW / 2;
  const groupXs = Array.from({ length: cols }, (_, g) => gx0 + g * pitch);

  // Strands: the arc each groove needs, a wall, around the circle — capped
  // at the useful count; the leftover circumference is the width budget.
  const strandsFit = Math.floor(circ / (grooveArcWidth(tool.diameter, widthWanted) + STRAND_WALL));
  if (strandsFit < 1) {
    return {
      mode: 'rotary',
      error: `a Ø${round2(tool.diameter)} tool at ${SPIRAL_ANGLE}° spans ${round2(grooveArcWidth(tool.diameter, widthWanted))}mm of arc — more than this stock's circumference`,
      warnings,
      rows: 0, cols: 0, rowValues: [], colValues: [],
      rowParam: op.rowParam, colParam: op.colParam,
      fixed: defaults, rotary: null, flat: null,
    };
  }
  const rows = Math.min(strandsFit, MAX_STRANDS);
  // The widest groove that keeps `rows` strands separated — the step-over
  // axis's ceiling. Meaningful only once the count caps out and the
  // circumference has room (Alice's large-Ø case).
  const widthAllowed = Math.max(
    tool.diameter,
    (circ / rows - STRAND_WALL) * Math.cos((SPIRAL_ANGLE * Math.PI) / 180),
  );
  if ((widthOnRow || widthOnCol) && widthAllowed <= tool.diameter + 0.05) {
    warnings.push('no circumferential room to widen the grooves with this tool — the step-over axis stays at tool width');
  }

  // Value ladders, clamped to what the geometry admits.
  const depthLimit = r - 0.1; // spiralCarve refuses depths at the axis
  const clampAxis = (param: MatrixParam, min: number, max: number, count: number): number[] => {
    let lo = min;
    let hi = max;
    if (param === 'stepDown' && hi > depthLimit) {
      hi = depthLimit;
      if (lo > hi) lo = hi;
      warnings.push(`groove depths clamped to ${round2(depthLimit)}mm — deeper would reach past the axis`);
    }
    if (param === 'stepOver' && hi > widthAllowed) {
      hi = widthAllowed;
      if (lo > hi) lo = hi;
      warnings.push(`groove widths clamped to ${round2(widthAllowed)}mm — strands would collide beyond that`);
    }
    if (param === 'stepOver' && lo < tool.diameter) lo = tool.diameter;
    if (param === 'feed' && hi < 10) hi = 10;
    if (param === 'spindleRpm' && hi < 100) hi = 100;
    return ladder(param, lo, hi, count);
  };
  const rowValues = clampAxis(op.rowParam, ...spanOf(op.rowMin, op.rowMax), rows);
  const colValues = clampAxis(op.colParam, ...spanOf(op.colMin, op.colMax), cols);
  if (rows < 2) warnings.push('only one strand fits around this stock — the strand axis holds a constant value');
  if (cols < 2) warnings.push('only one grouping fits along X — the grouping axis holds a constant value');

  // The rotary feed ceiling: G93 timing floors at the A-rate limit, so a
  // labeled feed above the clamp aliases cells (the cut stays safe —
  // spiralCarve floors the pass time; the LABEL lies). Only feeds/depths
  // some cell actually cuts counts: a parameter on an axis never uses
  // the preset default anywhere.
  const fixedDepth = Math.min(defaults.stepDown, depthLimit);
  const axisMax = (p: MatrixParam): number =>
    op.rowParam === p
      ? Math.max(...rowValues)
      : op.colParam === p
        ? Math.max(...colValues)
        : p === 'stepDown'
          ? fixedDepth
          : defaults[p];
  const advance = (span / (2 * Math.PI * r * Math.tan((SPIRAL_ANGLE * Math.PI) / 180))) * 360;
  const revs = advance / 360;
  const ceiling =
    (Math.hypot((advance * Math.PI) / 180 * (r - Math.min(axisMax('stepDown'), depthLimit)), span) *
      MAX_ROTARY_RPM) /
    revs;
  if (axisMax('feed') > ceiling) {
    warnings.push(
      `feeds above ~${ceiling.toFixed(0)} mm/min clamp at the rotary ceiling (A ≈ ${MAX_ROTARY_RPM} RPM) — cells beyond it all cut the same speed; cap the feed axis there`,
    );
  }

  // v5: RPM on the strand axis changes the spindle at every cell boundary,
  // and a still-settling spindle skews the neighboring reads.
  if (op.rowParam === 'spindleRpm') {
    warnings.push(
      'spindle speed on the strand axis — it changes at every cell and settles slower than the machine repositions; consider putting RPM on the X groupings',
    );
  }

  return {
    mode: 'rotary',
    error: null,
    warnings,
    rows,
    cols,
    rowValues,
    colValues,
    rowParam: op.rowParam,
    colParam: op.colParam,
    // fixed step-over reads as groove width: below the tool Ø it is a
    // plain single-pass groove
    fixed: { ...defaults, stepDown: fixedDepth, stepOver: Math.max(defaults.stepOver, tool.diameter) },
    rotary: {
      face: op.faceFirst
        ? {
            targetDiameter: surfaceD,
            xStart: x0,
            xEnd: x1,
            feed: defaults.feed,
            rpm: defaults.spindleRpm,
            stepDown: FACE_SKIN,
            stepOver: FACE_STEP_OVER,
          }
        : null,
      surfaceDiameter: surfaceD,
      groupXs,
      spinStep: 360 / rows,
      angle: SPIRAL_ANGLE,
      span,
      // the ranked +X tails live inside the grouping gap: the longest
      // (strand 1's) still leaves ≥1mm wall to the next grouping
      tailStep: rows > 1 ? Math.min(0.5, (GROUP_GAP - 1) / (rows - 1)) : 0,
    },
    flat: null,
  };
}

/** The flat plan — square pockets, rows on Y, cols on X. */
function planFlat(
  op: TestPatternFields,
  stock: Extract<Stock, { kind: 'box' }>,
  tool: Tool,
  defaults: MatrixDefaults,
  warnings: string[],
): TestPatternPlan {
  const [xa, xb] = originSpan(stock.origin.x, stock.sizeX);
  const [ya, yb] = originSpan(stock.origin.y, stock.sizeY);
  const [, zTop] = originSpan(stock.origin.z, stock.sizeZ);

  // Cells: a pocket needs the tool plus clearance on every side, and at
  // least 3 tool diameters per side so each cell runs several clearing
  // passes. The perimeter border is slightly wider than the inter-cell
  // gap (cell 1/1 grows into it — the origin marker); counts cap at
  // MAX_DIVISIONS per axis, pockets then GROW to fill what's left.
  const spacing = tool.diameter * FLAT_SPACING_FACTOR;
  const margin = spacing + FLAT_ORIGIN_GROWTH;
  const minCell = tool.diameter * FLAT_MIN_CELL_FACTOR;
  const fitAlong = (size: number): number =>
    Math.min(MAX_DIVISIONS, Math.floor((size - 2 * margin + spacing) / (minCell + spacing)));
  const cols = fitAlong(stock.sizeX);
  const rows = fitAlong(stock.sizeY);
  if (cols < 1 || rows < 1) {
    return {
      mode: 'flat',
      error: `a Ø${round2(tool.diameter)} tool needs ${round2(minCell + 2 * margin)}mm per cell — the stock fits none. Pick a smaller tool or bigger stock`,
      warnings,
      rows: 0, cols: 0, rowValues: [], colValues: [],
      rowParam: op.rowParam, colParam: op.colParam,
      fixed: defaults, rotary: null, flat: null,
    };
  }
  const cellW = (stock.sizeX - 2 * margin - (cols - 1) * spacing) / cols;
  const cellH = (stock.sizeY - 2 * margin - (rows - 1) * spacing) / rows;
  const blockW = cols * cellW + (cols - 1) * spacing;
  const blockH = rows * cellH + (rows - 1) * spacing;
  const x0 = (xa + xb) / 2 - blockW / 2;
  const y0 = (ya + yb) / 2 - blockH / 2;
  if (cols < 2) warnings.push('only one column fits along X — the column axis holds a constant value');
  if (rows < 2) warnings.push('only one row fits along Y — the row axis holds a constant value');

  // Every pocket cuts the same total depth (the material-appropriate
  // DOC); the step-down axis varies the PASS depth against it.
  const totalDepth = defaults.stepDown;
  const clampAxis = (param: MatrixParam, min: number, max: number, count: number): number[] => {
    let lo = min;
    let hi = max;
    if (param === 'stepDown') {
      if (hi > totalDepth) {
        hi = totalDepth;
        warnings.push(`pass depths clamped to the ${round2(totalDepth)}mm pocket depth — deeper passes cut single-level anyway`);
      }
      if (lo > hi) lo = hi;
      if (lo < 0.05) lo = 0.05;
    }
    if (param === 'stepOver' && lo < 0.1) lo = 0.1;
    if (param === 'feed' && hi < 10) hi = 10;
    if (param === 'spindleRpm' && hi < 100) hi = 100;
    return ladder(param, lo, hi, count);
  };
  const rowValues = clampAxis(op.rowParam, ...spanOf(op.rowMin, op.rowMax), rows);
  const colValues = clampAxis(op.colParam, ...spanOf(op.colMin, op.colMax), cols);

  // Cut order is row-outer (RPM on rows changes once per row); RPM on the
  // inner column axis changes at every cell.
  if (op.colParam === 'spindleRpm') {
    warnings.push('spindle speed on the column axis — it changes at every cell; consider rows (cut order is row-outer)');
  }

  return {
    mode: 'flat',
    error: null,
    warnings,
    rows,
    cols,
    rowValues,
    colValues,
    rowParam: op.rowParam,
    colParam: op.colParam,
    fixed: defaults,
    rotary: null,
    flat: { cellW, cellH, spacing, originGrowth: FLAT_ORIGIN_GROWTH, x0, y0, crownZ: zTop, totalDepth },
  };
}

/**
 * Prefill the min/max boxes when a parameter goes on an axis: a sensible
 * spread around the tool-library default for the stock material —
 * feed ±30%, RPM ±25%, step-down 0.5–1.5× (flat: a third of the pocket
 * depth up to single-pass), step-over ¼–¾ of the tool Ø (rotary: tool
 * width up to the widest groove the strand budget admits).
 */
export function axisSpread(
  param: MatrixParam,
  opts: { mode: 'flat' | 'rotary'; tool: Tool; defaults: MatrixDefaults; surfaceDiameter: number },
): [number, number] {
  const { tool, defaults } = opts;
  switch (param) {
    case 'feed':
      return [roundParam('feed', defaults.feed * 0.7), roundParam('feed', defaults.feed * 1.3)];
    case 'spindleRpm':
      return [
        roundParam('spindleRpm', defaults.spindleRpm * 0.75),
        roundParam('spindleRpm', defaults.spindleRpm * 1.25),
      ];
    case 'stepDown':
      return opts.mode === 'rotary'
        ? [roundParam('stepDown', defaults.stepDown * 0.5), roundParam('stepDown', defaults.stepDown * 1.5)]
        : [roundParam('stepDown', defaults.stepDown / 3), roundParam('stepDown', defaults.stepDown)];
    case 'stepOver': {
      if (opts.mode === 'rotary') {
        const circ = Math.PI * opts.surfaceDiameter;
        const strands = Math.min(
          Math.floor(circ / (grooveArcWidth(tool.diameter, tool.diameter) + STRAND_WALL)),
          MAX_STRANDS,
        );
        const widest = Math.max(
          tool.diameter,
          (circ / Math.max(strands, 1) - STRAND_WALL) * Math.cos((SPIRAL_ANGLE * Math.PI) / 180),
        );
        return [roundParam('stepOver', tool.diameter), roundParam('stepOver', widest)];
      }
      return [roundParam('stepOver', tool.diameter * 0.25), roundParam('stepOver', tool.diameter * 0.75)];
    }
  }
}