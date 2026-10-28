/**
 * Job operation generation: resolve a JobOp (editable sequence state) into
 * moves by combining its feature selection with the stock, tool, and
 * material presets. Per-op errors are captured, not thrown, so one broken
 * op never blocks the rest of the job.
 */

import type * as THREE from 'three';
import { DEFAULT_STEP_OVER_FACTOR, faceCylinder, SAFE_CLEARANCE, shortestATo } from '../cam/faceCylinder';
import { cylChamfer } from '../cam/cylChamfer';
import { engrave } from '../cam/engrave';
import { spiralCarve } from '../cam/spiralCarve';
import { thread, threadDepth, threadFaceDiameter } from '../cam/thread';
import { threadMill } from '../cam/threadMill';
import { planCell, type MatrixDefaults, type TestPatternPlan } from '../cam/testPattern';
import { chamfer } from '../cam/chamfer';
import { drill } from '../cam/drill';
import { pocket2d } from '../cam/pocket';
import { profile2d } from '../cam/profile';
import { waterlineRough } from '../cam/waterline';
import { rasterContour } from '../cam/relief';
import { rotaryCarve } from '../cam/rotaryCarve';
import { difference, offsetInward, offsetOutward } from '../cam/clipper';
import { sliceAtZ, transformedPositions } from '../cam/slicing';
import { indexedPointRotation } from '../cam/indexing';
import type { DetectedFeatures } from '../cam/features';
import { getMaterial } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import type {
  ChamferLoop,
  CylChamferEdge,
  DrillOp,
  JobOp,
  ModelTransform,
  Move,
  OpRates,
  Primitive,
  Stock,
  ThreadMillTarget,
  Tool,
  ToolPreset,
  Vec2,
} from '../core/types';
import { isDepthBearingJobOp, rotaryCalibrationOf, round2 } from '../core/types';
import {
  chamferTargetsFromSelection,
  cylChamferTargetsFromSelection,
  drillTargetsFromSelection,
  pocketRegionsFromSelection,
  threadTargetsFromSelection,
  type ThreadSourceTarget,
} from './opTargets';
import { transformFn } from './featureOverlays';
import { boxTopFaceId, resolveFeature, splitSelection, unmatchedIds, type FeatureSource } from './featureSources';
import { nextPrimitiveId, unitTransform } from './primitives';
import { stockFootprint, stockSpan, stockTopZ } from './placement';

export interface GeneratedOp {
  moves: Move[];
  /** honest time estimate, minutes: the generator's cutting figure ×
   * CUT_ACCEL_ALLOWANCE plus non-cutting overhead (rapid travel + spindle
   * ramp — see overheadMinutes). The ops-panel summary still quotes the
   * generator's cutting-only figure. */
  minutes: number;
  /** generation error, if any (kept per-op, not thrown) */
  error: string | null;
  /** one-line summary for the op panel */
  summary: string | null;
  /** the machine's accumulated A the NEXT op continues from — the DATUM
   *  DISCIPLINE (Alice's 2026-10-28 rule): only an Index op may change the
   *  datum; every rotary op BORROWS it (its sweeps accumulate freely — the
   *  machine needs that) and hands it back unchanged via an explicit
   *  return move appended in the stamp below, so a machine-frame op
   *  (pocket/profile/…) after it sees the same stock orientation it was
   *  generated against. Her outer_barrel_adapter report: a face left A at
   *  4770° ≡ 90° and the following pocket landed 90° off its feature. */
  finalA: number;
  /** the spindle RPM this op stamps (its `S<rpm> M3` line) — undefined for
   * index/laser/no-stamp ops; the NEXT op's prevRpm, so back-to-back ops at
   * the same speed charge no ramp */
  spindleRpm?: number;
}

export interface GenContext {
  /** the machine's accumulated A when generating this op (the previous
   * op's finalA; 0 for the first) */
  startA: number;
  stock: Stock;
  geometry: THREE.BufferGeometry | null;
  features: DetectedFeatures | null;
  transform: ModelTransform;
  tools: Tool[];
  /** user-added primitives (the face op can target a cylinder) */
  primitives: Primitive[];
  /** every selectable-feature provider: the model + one per primitive.
   * The four feature ops resolve their selections against these. */
  sources: FeatureSource[];
  /** the cutting datum for this op: the absolute A established by the
   * latest Index op preceding it in the job sequence (0 = flat) */
  datumAngle: number;
  /** the spindle speed the PREVIOUS op left running, RPM — the ramp this
   * op charges is |its rpm − this|; undefined = a cold spindle (ramp from
   * 0). Threaded by the recalculation pass, never the generators. */
  prevRpm?: number;
}

export const OP_KINDS: { kind: JobOp['kind']; label: string; rotaryOnly?: boolean }[] = [
  { kind: 'pocket', label: 'Pocket' },
  { kind: 'profile', label: 'Profile' },
  { kind: 'slicePocket', label: 'Slice pocket' },
  { kind: 'waterline', label: 'Waterline contour' },
  { kind: 'rasterContour', label: 'Raster contour (3D finish)' },
  { kind: 'rotaryCarve', label: 'Rotary contour (4-axis)', rotaryOnly: true },
  { kind: 'drill', label: 'Drill' },
  { kind: 'chamfer', label: 'Chamfer' },
  { kind: 'cylChamfer', label: 'Cylinder chamfer (4-axis)', rotaryOnly: true },
  { kind: 'index', label: 'Index (4-axis)', rotaryOnly: true },
  { kind: 'faceCylinder', label: 'Face cylinder (4-axis)', rotaryOnly: true },
  { kind: 'spiralCarve', label: 'Spiral carve (4-axis)', rotaryOnly: true },
  { kind: 'engrave', label: 'Engrave (artwork paths)' },
  { kind: 'thread', label: 'Thread (4-axis)', rotaryOnly: true },
  { kind: 'threadMill', label: 'Thread mill (3-axis)' },
];

/**
 * The absolute A active when `opId` starts: the angle of the latest Index
 * op preceding it (0 before any indexing). Index ops themselves establish
 * the datum for everything after them.
 */
export function datumAngleBefore(ops: JobOp[], opId: string): number {
  let angle = 0;
  for (const op of ops) {
    if (op.id === opId) break;
    if (op.kind === 'index') angle = op.angle;
  }
  return angle;
}

/** ISO 261 coarse metric threads: nominal Ø (mm) → pitch (mm). */
const METRIC_PITCH: Record<number, number> = {
  1: 0.25, 1.2: 0.25, 1.6: 0.35, 2: 0.4, 2.5: 0.45,
  3: 0.5, 3.5: 0.6, 4: 0.7, 5: 0.8, 6: 1.0, 7: 1.0, 8: 1.25,
  9: 1.25, 10: 1.5, 11: 1.5, 12: 1.75, 14: 2.0, 16: 2.0,
  18: 2.5, 20: 2.5, 22: 2.5, 24: 3.0, 27: 3.0, 30: 3.5,
  33: 3.5, 36: 4.0, 39: 4.0, 42: 4.5, 45: 4.5, 48: 5.0,
  52: 5.0, 56: 5.5, 60: 5.5, 64: 6.0,
};

/** The standard coarse metric pitch for a nominal Ø (M6 → 1.0, M4 → 0.7),
 * null when the Ø is not a standard size. */
export function metricPitch(nominalDiameter: number): number | null {
  return METRIC_PITCH[nominalDiameter] ?? null;
}

let opCount = 0;
/** Loaded jobs carry their own op ids — seed the counter above them so a
 * later "+ Add toolpath" can never collide. */
export function seedJobOpIds(ops: JobOp[]): void {
  for (const o of ops) {
    const n = Number(o.id.replace(/^jobop-/, ''));
    if (Number.isFinite(n) && n > opCount) opCount = n;
  }
}
/**
 * New op of the given kind with defaults derived from the tool, the stock
 * material (preset step-downs and a diameter-fraction step-over — never a
 * fixed guess that ignores the cutter size), and — for facing — the stock
 * geometry itself: the X range spans the stock and the target Ø starts one
 * skim (0.5mm radial) below its probed surface.
 */
export function newJobOp(kind: JobOp['kind'], tool: Tool, materialId: string, stock: Stock): JobOp {
  const base = { id: `jobop-${++opCount}`, toolId: tool.id, featureIds: [] };
  const stepDown = defaultStepDown(tool, materialId);
  switch (kind) {
    case 'faceCylinder': {
      // face defaults follow the stock in 4-axis mode — any shape: a box
      // rides the rotary axis too, its Ø being the Y-Z diagonal. 3-axis
      // keeps the last-resort constants until the user picks real values
      // (the panel warns).
      const rotary = stock.axisMode === '4-axis';
      const [xStart, xEnd] = rotary ? stockSpan(stock, 'x') : [0, 100];
      return {
        ...base,
        kind,
        targetDiameter: rotary
          ? Math.max(1, rotaryCalibrationOf(stock).effectiveRadius * 2 - 1)
          : 40,
        xStart,
        xEnd,
        stepDown,
        finishingOnly: false, // the roughing ladder; the panel toggle skips it
        /** null = derive 0.5·tool Ø at generation (job files stay tool-agnostic) */
        stepOver: null,
        finishAllowance: 0.2,
        rotation: 'cw',
        pattern: 'spiral',
        /** off = the sharp rotary pocket (edge rings square both ends) */
        cutBeyondStock: false,
      };
    }
    case 'spiralCarve': {
      const rotary = stock.axisMode === '4-axis';
      const [xStart, xEnd] = rotary ? stockSpan(stock, 'x') : [0, 80];
      return {
        ...base,
        kind,
        surfaceDiameter: rotary ? rotaryCalibrationOf(stock).effectiveRadius * 2 : 50,
        xStart,
        xEnd,
        spiralAngle: 30,
        count: 4,
        depth: 1,
        width: 3,
        stepDown: Math.max(stepDown, 0.5),
        finishingOnly: false,
        rotation: 'cw',
      };
    }
    case 'thread': {
      const rotary = stock.axisMode === '4-axis';
      const [xStart, xEnd] = rotary ? stockSpan(stock, 'x') : [0, 40];
      const nominal = rotary ? Math.max(1, rotaryCalibrationOf(stock).effectiveRadius * 2 - 1) : 20;
      return {
        ...base,
        kind,
        nominalDiameter: nominal,
        xStart,
        xEnd,
        pitch: metricPitch(nominal) ?? 2, // the standard thread for the size
        starts: 1,
        tolerance: 0,
        stepDown,
        finishingOnly: false,
        rotation: 'cw',
        surfaceDiameter: null, // ladder from the stock surface
      };
    }
    case 'pocket':
      return {
        ...base,
        kind,
        selectionIs: 'floor',
        startDepth: 0,
        endDepth: 2,
        allowance: 0,
        stepDown,
        finishingOnly: false,
        stepOver: defaultStepOver(tool),
        floorFeatureId: null,
        flatten: false, // islands preserved unless asked
        cutBeyondStock: false,
      };
    case 'slicePocket':
      return {
        ...base,
        kind,
        regionMode: 'outside',
        sliceDepth: 2, // into the body by default — away from small tops
        startDepth: 0, // the cut starts at the crown
        endDepth: 2,
        allowance: 0,
        stepDown,
        finishingOnly: false,
        stepOver: defaultStepOver(tool),
        floorFeatureId: null,
        clearToStock: false, // outline ring only unless asked
        tabs: null, // bridges only when cutting a part out
      };
    case 'waterline':
      // a ROUGH op by charter (PLAN.md Phase A): default stock left for the
      // finishing op that follows — 0 cut-to-size is a deliberate choice.
      // margin null = derive the tool Ø + allowance at generation (job files
      // stay tool-agnostic, like facing's step-over)
      return {
        ...base,
        kind,
        allowance: 0.2,
        // floored at 0.5mm: several presets say 0.2, and a step-down equal
        // to the 0.2 allowance self-skips every level (allowance ≥
        // step-down) — the op would silently degenerate to a single pass
        stepDown: Math.max(stepDown, 0.5),
        stepOver: defaultStepOver(tool),
        margin: null, // derive tool Ø + allowance + step over at generation
        cutBeyondStock: false, // the tool stays inside the declared stock
        clearToStock: false, // the model's column only; the toggle clears to the stock edge
        maxDepth: null, // to the model floor; the 4-axis short-tool throttle
        finishingOnly: false, // full clearing per level; the toggle scrubs surfaces only
      };
    case 'rasterContour':
      // the paired SURFACE pass (PLAN.md Phase B): default allowance 0 —
      // a waterline contour with allowance ahead of it already left stock,
      // and "rough vs finish" is this one knob. Grid pitch ≈ stepOver/2
      // (PLAN.md) derived at generation; step-over from the tool Ø.
      // angle absent = 0 = rows along X (the spiral-spin precedent: old
      // saves and goldens stay byte-identical). Finishing-only is the
      // DEFAULT (the old stepDown-0 convention) — the roughing ladder is
      // the explicit choice now; stepDown carries the preset for when the
      // box is unchecked.
      return {
        ...base,
        kind,
        allowance: 0,
        stepOver: defaultStepOver(tool),
        angle: 0,
        finishingOnly: true,
        stepDown,
        clearToStock: false, // the model's column only; the toggle clears to the stock edge
        cutBeyondStock: false, // row centers stay inside the declared stock
      };
    case 'rotaryCarve':
      // Phase C (PLAN.md): one op roughs AND finishes (Makera's ladder —
      // full wrap per depth level until nothing is left, then the surface
      // pass). Rough-vs-finish is the finishingOnly toggle + allowance;
      // the panel zeroes the allowance on tick (the raster precedent).
      return {
        ...base,
        kind,
        allowance: 0.2,
        stepDown: Math.max(stepDown, 0.5), // a rung below the allowance degenerates the ladder
        stepOver: defaultStepOver(tool),
        strategy: 'horizontal',
        finishingOnly: false,
      };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2 };
    case 'chamfer':
      return { ...base, kind, mode: 'add', side: 'auto', direction: 'down', depth: 0.5 };
    case 'cylChamfer':
      // depth 0 = anchor on the selected circle (cut up-and-out) — the
      // rod-end cases set a depth from the rim instead
      return { ...base, kind, depth: 0, stepDown, finishingOnly: false, rotation: 'cw' };
    case 'engrave':
      return { ...base, kind, depth: 0.5, stepDown: 0.25, finishingOnly: false };
    case 'threadMill': {
      // no stock/Ø defaults to read yet — the selection prefills the
      // thread (Ø/pitch/length from the rim or wall facet); M6-coarse
      // is a sane editable starting point for a hand-set op. Pitch
      // locks to the tool the moment one is picked (changeTool).
      const nominal = 6;
      return {
        ...base,
        kind,
        internal: true,
        nominalDiameter: nominal,
        pitch: metricPitch(nominal) ?? 1,
        starts: 1,
        tolerance: 0,
        rotation: 'cw',
        stepOver: 0, // one full-form pass; > 0 ladders for tough materials
        startDepth: 0,
        endDepth: 5,
      };
    }
    case 'index':
      return { ...base, kind, angle: 90 };
    case 'profile':
      return {
        ...base,
        kind,
        selectionIs: 'floor',
        startDepth: 0,
        endDepth: 2,
        bottomAllowance: 0, // floor stock (the 2026-10-28 split)
        sideAllowance: 0, // radial — SIGNED: negative turns a boss down
        stepDown,
        finishingOnly: false,
        side: 'outside',
        floorFeatureId: null,
        clearToStock: false, // outline ring only unless asked
        tabs: null, // bridges only when cutting a part out
      };
  }
}

/** an op result before the finalA stamp (generateJobOp adds it) */
type OpResult = Omit<GeneratedOp, 'finalA'>;

const fail = (error: string): OpResult => ({ moves: [], minutes: 0, error, summary: null });

/**
 * The waste-stock toggle (edge-tracing §2): clear the excess between the
 * given contours and the stock wall over the cut band, pocketing the frame
 * with step-over passes. Returns null when the frame is thinner than the
 * tool (the tool Ø check throws) or nothing survives — callers fall back
 * to the outline ring and say so in their summary.
 */
function clearanceResult(
  op: Extract<JobOp, { kind: 'profile' | 'slicePocket' }>,
  tool: Tool,
  contours: Vec2[][],
  range: { topZ: number; floorZ: number },
  stepOver: number,
  feed: number,
  plungeFeed: number,
  ctx: GenContext,
  datumRotated: boolean,
): { moves: Move[]; minutes: number; passes: number } | null {
  // the keep-out steps out by the RADIAL stock: the profile's SIGNED side
  // allowance (the 2026-28 split), the slice-pocket's single allowance.
  // Negative never shrinks it (the raw guard) — conservative.
  const radial = op.kind === 'profile' ? op.sideAllowance : op.allowance;
  const keepOut = radial > 0 ? offsetOutward(contours, radial) : contours;
  const regions = difference(stockFootprint(ctx.stock, datumRotated), keepOut);
  if (regions.length === 0) return null;
  try {
    const res = pocket2d(
      {
        kind: 'pocket',
        id: op.id,
        toolId: tool.id,
        regions,
        topZ: range.topZ,
        floorZ: range.floorZ,
        stepDown: op.stepDown,
        stepOver,
        feed,
        plungeFeed,
        safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
      },
      tool,
    );
    if (res.moves.length === 0) return null;
    return { moves: res.moves, minutes: res.estimatedMinutes, passes: res.passes };
  } catch {
    return null; // e.g. `tool Ø… does not fit` on a thin frame
  }
}

/** One-line summary for a slice-pocket result, shared by both modes. */
function sliceSummary(
  op: Extract<JobOp, { kind: 'slicePocket' }>,
  range: { topZ: number; floorZ: number },
  passes: number,
  minutes: number,
  dropped: number,
  mode: 'pocket' | 'profile' | 'clearance',
): string {
  return (
    `${passes} passes around the section ${op.sliceDepth.toFixed(1)} below the crown (${mode}), ` +
    `z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}` +
    (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
    `, ~${minutes.toFixed(1)} min` +
    (dropped > 0 ? ` · ${dropped} open chain(s) dropped — slice incomplete` : '')
  );
}

/**
 * The indexed cutting frame for an op: null for flat work (datum 0 or 3-axis
 * mode), else a rotation about the stock axis mapping the A=0 features into
 * the frame the stock sits in at the datum angle. The A positioning move is
 * emitted by the Index op itself — these ops run after it.
 */
function indexFrame(
  datumAngle: number,
  stock: Stock,
): { rotate?: (p: { x: number; y: number; z: number }) => import('three').Vector3 } {
  if (datumAngle === 0) return {};
  if (stock.axisMode !== '4-axis') {
    throw new Error('indexing needs 4-axis mode — the job has an index datum without it');
  }
  return { rotate: indexedPointRotation(datumAngle, rotaryCalibrationOf(stock).axisZ) };
}

/**
 * Our stock material → the Makera preset ROW name that carries its
 * recommended rates. Makera's tool library has six material rows —
 * Aluminum, Brass, Copper, Hardwood, Softwood, Plastic — and no dedicated
 * acetal/Delrin or acrylic rows: both ride the Plastic row. A wrong or
 * missing alias silently falls back to the built-in material table, which
 * is how a Delrin job ended up running a metal-row S18000.
 */
const PRESET_MATERIAL_KEYS: Record<string, string> = {
  'aluminum-6061': 'aluminum',
  'brass-360': 'brass',
  delrin: 'plastic',
  hardwood: 'hardwood',
  'acrylic-cast': 'plastic',
};

/** The tool's own Makera preset for the stock material, if one matches
 * ('aluminum-6061' → preset 'Aluminum', 'delrin' → preset 'Plastic');
 * unmatched falls back to the built-in material table. */
export function toolPresetFor(tool: Tool, materialId: string): ToolPreset | null {
  const key = PRESET_MATERIAL_KEYS[materialId] ?? materialId.split('-')[0].toLowerCase();
  return tool.presets?.find((p) => p.material.toLowerCase().includes(key)) ?? null;
}

/** Feeds for an op: the tool's own preset for the stock material wins,
 * else the material-preset tables; per-op overrides win over both. */
function feedsFor(tool: Tool, material: MaterialPreset, rates?: OpRates) {
  const preset = toolPresetFor(tool, material.id);
  const feed = rates?.feed ?? preset?.feed ?? material.feedByTool[tool.type];
  const plungeFeed =
    rates?.plungeFeed ??
    preset?.plungeFeed ??
    Math.round(material.feedByTool[tool.type] * material.plungeFraction);
  return { feed, plungeFeed };
}

/**
 * Effective spindle RPM for an op: the ⚡ override, else the tool's own
 * Makera preset for the stock material (their per-material recommended
 * speed — an acetal job should not run the metal row's RPM), else the
 * tool's singular Tools-tab RPM.
 */
function rpmFor(tool: Tool | undefined, materialId: string, rates?: OpRates): number | undefined {
  if (rates?.spindleRpm !== undefined) return rates.spindleRpm;
  if (!tool) return undefined;
  return toolPresetFor(tool, materialId)?.spindleRpm ?? tool.spindleRpm;
}

/** Z1 max feed rates, mm/min (docs/makera-dialect.md "Community Controller
 *  parsing" — the Z1 profile config): rapids are axis-separate in our
 *  generators, so each rapid is timed at its own axis's rate */
const RAPID_MM_MIN = { x: 1200, y: 1200, z: 600 };
/** the 4th axis rapid rate, °/min (same Z1 profile) */
const A_RAPID_DEG_MIN = 3600;
/** spindle spin-up/down, assumed rpm/sec — the one soft constant here;
 *  calibrated against two measured coupon cuts (2026-10-24) */
const SPINDLE_RAMP_RPM_PER_SEC = 1800;
/** acceleration allowance on cutting moves — moves this short spend a
 *  real fraction ramping; empirical, same calibration */
const CUT_ACCEL_ALLOWANCE = 1.1;

/**
 * Non-cutting time of one op's move list, minutes: rapid travel at the
 * axis rates, plus the spindle ramp for the rpm change this op stamps.
 *
 * Moves carry ABSOLUTE word targets; a missing axis word means "unchanged
 * since the previous move". For the FIRST move the previous position is
 * unknown except A, which starts from `startA` — axes with no known
 * previous position contribute 0 (the move list alone cannot say how far
 * the initial approach traveled). Each rapid is timed as the MAX over the
 * axes it actually specifies: our generators emit axis-separate rapids,
 * so this is exact; a coordinated rapid is conservatively its slowest
 * axis.
 *
 * Spindle ramp: |rpm − prevRpm| at SPINDLE_RAMP_RPM_PER_SEC. `prevRpm`
 * undefined means a cold spindle — a real spin-up, charged from 0.
 * `rpm` undefined (no spindle stamp) means no ramp at all.
 */
export function overheadMinutes(
  moves: Move[],
  startA: number,
  prevRpm: number | undefined,
  rpm: number | undefined,
): number {
  let rapidMinutes = 0;
  let x: number | undefined;
  let y: number | undefined;
  let z: number | undefined;
  let a = startA;
  for (const m of moves) {
    const w = m.words;
    if (m.rapid) {
      let t = 0;
      if (w.x !== undefined && x !== undefined) {
        t = Math.max(t, Math.abs(w.x - x) / RAPID_MM_MIN.x);
      }
      if (w.y !== undefined && y !== undefined) {
        t = Math.max(t, Math.abs(w.y - y) / RAPID_MM_MIN.y);
      }
      if (w.z !== undefined && z !== undefined) {
        t = Math.max(t, Math.abs(w.z - z) / RAPID_MM_MIN.z);
      }
      if (w.a !== undefined) {
        t = Math.max(t, Math.abs(w.a - a) / A_RAPID_DEG_MIN);
      }
      rapidMinutes += t;
    }
    // the position carries through cutting moves too — a later rapid is
    // measured from wherever the cut left the axis
    if (w.x !== undefined) x = w.x;
    if (w.y !== undefined) y = w.y;
    if (w.z !== undefined) z = w.z;
    if (w.a !== undefined) a = w.a;
  }
  const rampMinutes =
    rpm === undefined
      ? 0
      : Math.abs(rpm - (prevRpm ?? 0)) / SPINDLE_RAMP_RPM_PER_SEC / 60;
  return rapidMinutes + rampMinutes;
}

/**
 * The rates the ops-panel popup shows as this op's defaults — EXACTLY what
 * generation uses when the op has no `rates` overrides. Drill plunges at
 * the preset drill feed (no plunge fraction); spindle is the tool's
 * material-matched preset RPM, else its Tools-tab value.
 */
export function presetRates(
  kind: JobOp['kind'],
  tool: Tool,
  materialId: string,
): { feed: number; plungeFeed: number; spindleRpm: number } {
  const material = getMaterial(materialId);
  const { feed, plungeFeed } = feedsFor(tool, material);
  return {
    feed,
    plungeFeed:
      kind === 'drill'
        ? (toolPresetFor(tool, material.id)?.plungeFeed ?? material.feedByTool.drill)
        : plungeFeed,
    spindleRpm: rpmFor(tool, materialId) ?? tool.spindleRpm,
  };
}

/**
 * Default radial step-over: a fraction of the cutter diameter — no tool
 * library carries step-over, it is a strategy parameter.
 */
export function defaultStepOver(tool: Tool): number {
  return Math.max(0.1, Math.round(tool.diameter * 0.5 * 10) / 10);
}

/**
 * Facing step-over default: the generator's DEFAULT_STEP_OVER_FACTOR × the
 * cutter diameter, rounded to 0.1mm — the shared pass spacing for vertical
 * rings, horizontal pass arcs, and spiral per-rev advance.
 */
export function defaultFaceStepOver(tool: Tool): number {
  return Math.max(0.1, Math.round(DEFAULT_STEP_OVER_FACTOR * tool.diameter * 10) / 10);
}

/**
 * Default axial step-down: the tool's own Makera preset value for the
 * stock material when available, capped at half the cutter diameter (small
 * tools must not bury themselves) and by the material tables otherwise.
 */
export function defaultStepDown(tool: Tool, materialId: string): number {
  const material = getMaterial(materialId);
  const preset = toolPresetFor(tool, materialId);
  const raw =
    preset?.stepDown && preset.stepDown > 0
      ? preset.stepDown
      : material.stepDownByTool[tool.type];
  return Math.max(0.05, Math.min(raw, tool.diameter * 0.5));
}

/**
 * The constant controls of a test-pattern matrix: the tool's own preset
 * for the stock material (feed, RPM — the material-matched row, never the
 * Tools-tab default that once ran a Delrin job at the metal row's S18000)
 * with the derived step defaults. Every parameter NOT on a matrix axis
 * holds these for all cells, so it can never confound the read.
 */
export function testPatternDefaults(tool: Tool, materialId: string): MatrixDefaults {
  const material = getMaterial(materialId);
  const preset = toolPresetFor(tool, materialId);
  return {
    feed: preset?.feed ?? material.feedByTool[tool.type],
    spindleRpm: preset?.spindleRpm ?? tool.spindleRpm,
    stepDown: defaultStepDown(tool, materialId),
    stepOver: defaultStepOver(tool),
  };
}

/** Thickness of a flat calibration cell's outline plate, mm — thin enough
 * not to read as stock, thick enough to render and click. */
const CELL_PLATE_MM = 1;

/**
 * Materialize a planned test pattern into ORDINARY OPS — the coupon the
 * user refers back to: every cell is a normal op row with its rates in
 * the ⚡ popup, its minutes in the estimate, and its parameters saved in
 * the job file; regenerating means delete + Generate again. Rotary: a
 * face cylinder op (when planned) then one spiral carve op per cell,
 * grouping-outer, ranked +X tails (strand 1 longest). Flat: one thin
 * box primitive per cell sitting on the crown (the visible, clickable
 * cell outline; its top face is the pocket region) then one pocket op
 * per cell, row-outer.
 * The plunge feed is shared by every op so it can never confound a read.
 */
export function materializeTestPattern(
  plan: TestPatternPlan,
  tool: Tool,
  materialId: string,
): { ops: JobOp[]; primitives: Primitive[] } {
  if (plan.error) return { ops: [], primitives: [] };
  const plungeFeed = presetRates('pocket', tool, materialId).plungeFeed;
  const ops: JobOp[] = [];
  const primitives: Primitive[] = [];

  if (plan.rotary) {
    const rt = plan.rotary;
    if (rt.face) {
      ops.push({
        id: `jobop-${++opCount}`,
        toolId: tool.id,
        featureIds: [],
        kind: 'faceCylinder',
        targetDiameter: rt.face.targetDiameter,
        xStart: rt.face.xStart,
        xEnd: rt.face.xEnd,
        stepDown: rt.face.stepDown,
        finishingOnly: false,
        stepOver: rt.face.stepOver,
        finishAllowance: 0,
        rotation: 'cw',
        pattern: 'spiral',
        rates: { feed: rt.face.feed, spindleRpm: rt.face.rpm, plungeFeed },
      });
    }
    for (let g = 0; g < plan.cols; g++) {
      for (let s = 0; s < plan.rows; s++) {
        const p = planCell(plan, s, g);
        // the RANKED +X tail: strand 1 longest, shortening strand by
        // strand — each groove's own length identifies it
        const tail = rt.tailStep * (plan.rows - 1 - s);
        ops.push({
          id: `jobop-${++opCount}`,
          toolId: tool.id,
          featureIds: [],
          kind: 'spiralCarve',
          surfaceDiameter: rt.surfaceDiameter,
          xStart: rt.groupXs[g],
          xEnd: rt.groupXs[g] + rt.span + tail,
          spiralAngle: rt.angle,
          count: 1,
          depth: p.stepDown, // the tested DOC IS the groove depth
          width: Math.max(p.stepOver, tool.diameter), // single pass at tool width
          stepDown: p.stepDown, // one full-depth pass — the v4 verdict
          finishingOnly: false, // explicit; the panel toggle is the user's
          rotation: 'cw',
          spin: s * rt.spinStep,
          rates: { feed: p.feed, spindleRpm: p.spindleRpm, plungeFeed },
        });
      }
    }
  }

  if (plan.flat) {
    const f = plan.flat;
    for (let r = 0; r < plan.rows; r++) {
      for (let c = 0; c < plan.cols; c++) {
        const p = planCell(plan, r, c);
        const x = f.x0 + c * (f.cellW + f.spacing);
        // row 1 is the TOP row — rows run top to bottom (+Y down to −Y)
        const y = f.y0 + (plan.rows - 1 - r) * (f.cellH + f.spacing);
        // cell 1/1 (top-left) grows into the perimeter on its two outer
        // sides — the oversized corner marks the grid origin
        const origin = r === 0 && c === 0;
        const w = f.cellW + (origin ? f.originGrowth : 0);
        const h = f.cellH + (origin ? f.originGrowth : 0);
        const size = { x: w, y: h, z: CELL_PLATE_MM };
        const prim: Extract<Primitive, { kind: 'box' }> = {
          kind: 'box',
          id: nextPrimitiveId(),
          size,
          original: { ...size },
          transform: unitTransform({
            // extends −X (left) and +Y (up) into the wider perimeter —
            // the inner edges stay flush with the row/column
            x: x + (origin ? -f.originGrowth : 0) + w / 2,
            y: y + h / 2,
            z: f.crownZ + CELL_PLATE_MM / 2,
          }),
        };
        const faceId = boxTopFaceId(prim);
        if (faceId === null) continue; // a box always detects its top face
        primitives.push(prim);
        ops.push({
          id: `jobop-${++opCount}`,
          toolId: tool.id,
          featureIds: [faceId],
          kind: 'pocket',
          selectionIs: 'floor',
          startDepth: 0,
          endDepth: f.totalDepth,
          allowance: 0,
          stepDown: p.stepDown,
          finishingOnly: false, // the matrix tests the step-down axis
          stepOver: p.stepOver,
          floorFeatureId: null,
          flatten: false,
          rates: { feed: p.feed, spindleRpm: p.spindleRpm, plungeFeed },
        });
      }
    }
  }

  return { ops, primitives };
}

/**
 * Prefill an op's depth boxes from a selected feature's machine height:
 * 'floor' sets the end depth to the crown-to-feature distance (cut down
 * TO it); 'rim' sets the start depth (cut down FROM it). The boxes stay
 * user-editable — this is a convenience, not a constraint.
 */
export function prefillDepths(op: JobOp, selectionZ: number, crownZ: number): JobOp {
  if (!isDepthBearingJobOp(op)) return op;
  // slice pockets select no features — a stray pick reads as a floor
  const selectionIs = 'selectionIs' in op ? op.selectionIs : 'floor';
  if (selectionIs === 'floor') {
    return { ...op, startDepth: 0, endDepth: round2(Math.max(crownZ - selectionZ, 0.3)) } as JobOp;
  }
  const start = round2(Math.max(crownZ - selectionZ, 0));
  return { ...op, startDepth: start, endDepth: round2(start + 2) } as JobOp;
}

/**
 * Prefill a thread-mill op from its FIRST selected feature (the same
 * hook prefillDepths gives the depth-bearing ops): the resolved rim
 * carries the thread Ø, the inside/outside side, the rim depth below the
 * crown, and — when the click was a cylindrical wall facet — the thread
 * length the shape itself declares (Alice, 2026-10-28). A pick that
 * doesn't resolve stays untouched: generation will diagnose it loudly.
 */
export function prefillThreadMill(
  op: Extract<JobOp, { kind: 'threadMill' }>,
  sources: FeatureSource[],
  featureId: string,
  crown: number,
  datumAngle: number,
  stock: Stock,
): Extract<JobOp, { kind: 'threadMill' }> {
  const parts = splitSelection(sources, [featureId]);
  if (parts.length === 0) return op;
  const rotate =
    datumAngle !== 0 ? indexedPointRotation(datumAngle, rotaryCalibrationOf(stock).axisZ) : undefined;
  let targets: ReturnType<typeof threadTargetsFromSelection>;
  try {
    targets = threadTargetsFromSelection(
      parts[0].source.features,
      [featureId],
      parts[0].source.transform,
      rotate,
    );
  } catch {
    return op; // a bad pick stays silent here — generation diagnoses it
  }
  const t = targets?.targets[0];
  if (!t) return op;
  const diameter = round2(t.radius * 2);
  const start = Math.max(0, round2(crown - t.rimZ));
  const end = t.spanZ
    ? Math.max(start + 0.3, round2(crown - t.spanZ[1]))
    : round2(start + 5);
  return {
    ...op,
    internal: t.internal,
    nominalDiameter: diameter,
    pitch: metricPitch(diameter) ?? op.pitch,
    startDepth: start,
    endDepth: end,
  };
}

/**
 * Machine-Z cut range from the explicit depth boxes: startZ/endZ are mm
 * below the stock crown. Roughing allowance raises the actual cut floor
 * and insets the region (walls), so a finishing pass (allowance 0, start
 * = end) later takes the surface to size.
 */
function cutRange(
  startDepth: number,
  endDepth: number,
  allowance: number,
  crown: number,
): { topZ: number; floorZ: number } | null {
  if (!Number.isFinite(startDepth) || !Number.isFinite(endDepth) || !Number.isFinite(allowance)) {
    return null; // garbage params (corrupt job files) never emit NaN moves
  }
  if (endDepth < startDepth - 1e-9) return null; // end above start: nothing to cut
  const topZ = crown - startDepth;
  const floorZ = crown - endDepth + allowance;
  if (floorZ > topZ + 1e-9) return null; // allowance swallows the whole range
  return { topZ, floorZ };
}

/**
 * Selection pre-flight shared by the four feature ops: emptiness, source
 * presence, and dangling ids (a resized/deleted primitive or a gone model —
 * old ids must fail visibly, not silently drop). Returns per-source parts.
 */
function selectionAcrossSources(
  sources: FeatureSource[],
  featureIds: string[],
  emptyMessage: string,
): { parts: { source: FeatureSource; ids: string[] }[]; error: string | null } {
  if (featureIds.length === 0) return { parts: [], error: emptyMessage };
  if (sources.length === 0) return { parts: [], error: 'add a primitive or load a model first' };
  if (unmatchedIds(sources, featureIds).length > 0) {
    return {
      parts: [],
      error: 'the selected features no longer exist — the primitive was resized or deleted; reselect',
    };
  }
  return { parts: splitSelection(sources, featureIds), error: null };
}

/**
 * Resolve one op into moves. NEVER THROWS: every failure — including bad
 * context (unknown material, missing tool) — comes back as a per-op error
 * so one broken op can never silently kill a whole-job recalculation.
 *
 * Each cutting op's first move is stamped with its effective spindle speed
 * (the op's ⚡ override, else the tool's library RPM) so the post emits a
 * `S<rpm> M3` line at every op boundary where the speed changes.
 */
export function generateJobOp(op: JobOp, ctx: GenContext): GeneratedOp {
  // a dangling ⇩ floor pick fails visibly (the standard reselect path)
  if (
    isDepthBearingJobOp(op) &&
    op.floorFeatureId !== null &&
    !resolveFeature(ctx.sources, op.floorFeatureId)
  ) {
    // the axis never moved: the failure keeps the incoming A position
    return { ...fail('the floor feature no longer exists — reselect'), finalA: ctx.startA };
  }
  const res = generateJobOpInner(op, ctx);
  // the machine's A after the op: the last A word emitted (the op continued
  // from ctx.startA), or startA itself when the op never touched A
  let lastA = ctx.startA;
  for (let i = res.moves.length - 1; i >= 0; i--) {
    const a = res.moves[i].words.a;
    if (a !== undefined) {
      lastA = a;
      break;
    }
  }
  // DATUM DISCIPLINE (Alice's 2026-10-28 rule — see GeneratedOp.finalA):
  // only an Index op changes the datum (its own move below sets finalA).
  // Every other op that touched A hands the borrowed datum BACK with an
  // explicit return move — the datum is a shared session value the next op
  // (machine-frame pockets, anything) generates against. The return runs
  // only when the op actually moved the stock OFF its borrowed orientation
  // (mod whole turns): a same-orientation end needs no spin back, and the
  // post's inter-op G92.4 shrink only ever drops whole turns, so fractional
  // orientation survives the pair. A machine at |datum| ≤ 360 spins back at
  // most a partial turn; the explicit move (not a G92.4 reset) keeps
  // physical orientation honest — no silent re-registration.
  let finalA = ctx.startA;
  const touchedA = lastA !== ctx.startA;
  if (op.kind !== 'index' && res.moves.length > 0 && touchedA) {
    // equivalent orientation? (mod 360 — whole turns are the same spoke,
    // and the post's inter-op shrink drops them without motion)
    const deltaBack = finalA - lastA;
    if (Math.abs(deltaBack % 360) > 1e-9) {
      res.moves.push({
        words: { a: finalA },
        feed: 0,
        rapid: true,
        comment: `return A to the borrowed datum ${finalA.toFixed(1)}° (datum discipline)`,
      });
      lastA = finalA;
    }
  }
  if (op.kind === 'index') {
    // the Index op IS the datum move: its move targets the new angle
    finalA = lastA;
  }
  const stamped: GeneratedOp = { ...res, finalA };
  // index ops position the stock; failed ops cut nothing — neither carries
  // cutting time, so neither carries overhead
  if (op.kind === 'index' || stamped.moves.length === 0) return stamped;
  const opTool = ctx.tools.find((t) => t.id === op.toolId);
  // a laser op's S word is the BEAM POWER (stamped per path by the
  // generator) — an `S<rpm> M3` spindle line would fight it: rapid overhead
  // only, never a spindle ramp
  if (opTool?.type === 'laser') {
    return {
      ...stamped,
      minutes:
        stamped.minutes * CUT_ACCEL_ALLOWANCE +
        overheadMinutes(stamped.moves, ctx.startA, undefined, undefined),
    };
  }
  const rpm = rpmFor(opTool, ctx.stock.materialId, op.rates);
  if (rpm === undefined) {
    // no spindle stamp (no `S<rpm> M3` line) — rapids still happen
    return {
      ...stamped,
      minutes:
        stamped.minutes * CUT_ACCEL_ALLOWANCE +
        overheadMinutes(stamped.moves, ctx.startA, ctx.prevRpm, undefined),
    };
  }
  return {
    ...stamped,
    spindleRpm: rpm,
    moves: [{ ...stamped.moves[0], spindleRpm: rpm }, ...stamped.moves.slice(1)],
    minutes:
      stamped.minutes * CUT_ACCEL_ALLOWANCE +
      overheadMinutes(stamped.moves, ctx.startA, ctx.prevRpm, rpm),
  };
}

function generateJobOpInner(op: JobOp, ctx: GenContext): OpResult {
  try {
    const tool = ctx.tools.find((t) => t.id === op.toolId);
    if (!tool) return fail('tool missing from library');
    if (tool.type === 'laser' && op.kind !== 'engrave') {
      // the module is a beam, not a cutter: it only fits engrave
      return fail('the laser only fits the engrave operation — pick a cutting tool for this op');
    }
    const material = getMaterial(ctx.stock.materialId);
    const { feed, plungeFeed } = feedsFor(tool, material, op.rates);

    switch (op.kind) {
      case 'index': {
        if (ctx.stock.axisMode !== '4-axis') return fail('indexing needs 4-axis mode (Stock tab)');
        // shortest rotation to the datum spoke from wherever the axis sits —
        // never unwind the previous ops' accumulated pile
        const target = ctx.startA + shortestATo(op.angle, ctx.startA);
        return {
          moves: [
            {
              words: { a: target },
              feed: 0,
              rapid: true,
              comment: `index stock to A${op.angle}° — datum for following ops`,
            },
          ],
          minutes: 0,
          error: null,
          summary: `index A${op.angle}° (datum for the ops below)`,
        };
      }
      case 'faceCylinder': {
        if (ctx.stock.axisMode !== '4-axis') return fail('face cylinder needs 4-axis mode (Stock tab)');
        // the op's own explicit fields: Start/End X and the target Ø,
        // hand-set or filled by the ⇩ pick-from-feature modes
        const res = faceCylinder(
          {
            kind: 'faceCylinder',
            id: op.id,
            toolId: tool.id,
            targetDiameter: op.targetDiameter,
            xStart: op.xStart,
            xEnd: op.xEnd,
            stepDown: op.stepDown,
            finishingOnly: op.finishingOnly,
            stepOver: op.stepOver ?? defaultFaceStepOver(tool),
            finishAllowance: op.finishAllowance,
            plungeFeed: plungeFeed,
            feed,
            rotation: op.rotation,
            pattern: op.pattern,
            clearance: op.rates?.clearance,
            cutBeyondStock: op.cutBeyondStock,
          },
          rotaryCalibrationOf(ctx.stock),
          tool,
          ctx.startA,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${res.passes} passes (${op.pattern}) → Ø${op.targetDiameter.toFixed(1)}mm, X ${op.xStart.toFixed(0)}…${op.xEnd.toFixed(0)}` +
            (op.finishingOnly ? ', finishing pass only' : '') +
            (op.cutBeyondStock ? ', tail stock cut-over' : ', squared edges') +
            `, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'spiralCarve': {
        if (ctx.stock.axisMode !== '4-axis') return fail('spiral carving needs 4-axis mode (Stock tab)');
        try {
          const res = spiralCarve(
            {
              kind: 'spiralCarve',
              id: op.id,
              toolId: tool.id,
              surfaceDiameter: op.surfaceDiameter,
              xStart: op.xStart,
              xEnd: op.xEnd,
              spiralAngle: op.spiralAngle,
              count: op.count,
              depth: op.depth,
              width: op.width,
              // finishing-only collapses the retrace ladder to one
              // full-depth sweep per strand (depthLadder: stepDown ≥ depth)
              stepDown: op.finishingOnly ? op.depth : op.stepDown,
              rotation: op.rotation,
              spin: op.spin,
              feed,
              plungeFeed,
              clearance: op.rates?.clearance,
            },
            rotaryCalibrationOf(ctx.stock),
            tool.diameter,
            ctx.datumAngle,
            ctx.startA,
          );
          return {
            moves: res.moves,
            minutes: res.estimatedMinutes,
            error: null,
            summary:
              `${op.count} strand(s) × ${res.passes / op.count} sweep(s), ${op.spiralAngle}° helix, ` +
              `${op.depth}mm deep × ${op.width === 0 ? 'following the lines' : `${op.width}mm wide`}` +
              (op.finishingOnly ? ', finishing pass only' : '') +
              `, X ${op.xStart.toFixed(0)}…${op.xEnd.toFixed(0)}, ` +
              `~${res.estimatedMinutes.toFixed(1)} min`,
          };
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      }

      case 'thread': {
        if (ctx.stock.axisMode !== '4-axis') return fail('threading needs 4-axis mode (Stock tab)');
        try {
          // finishing-only collapses the groove depth ladder to the full
          // depth (single groove sweep per start + the spring pass)
          const fullGroove =
            op.finishingOnly && tool.vAngle
              ? (() => {
                  const cal = rotaryCalibrationOf(ctx.stock);
                  const depth = threadDepth(op.pitch, tool.vAngle, op.tolerance);
                  const rootR = threadFaceDiameter(op.nominalDiameter, op.tolerance) / 2 - depth;
                  const startR =
                    op.surfaceDiameter !== null ? op.surfaceDiameter / 2 : cal.effectiveRadius;
                  return startR - rootR; // the ladder's full span
                })()
              : NaN;
          const res = thread(
            {
              kind: 'thread',
              id: op.id,
              toolId: tool.id,
              nominalDiameter: op.nominalDiameter,
              xStart: op.xStart,
              xEnd: op.xEnd,
              pitch: op.pitch,
              starts: op.starts,
              tolerance: op.tolerance,
              stepDown: fullGroove > 0 ? fullGroove : op.stepDown,
              rotation: op.rotation,
              feed,
              plungeFeed,
              surfaceDiameter: op.surfaceDiameter,
              clearance: op.rates?.clearance,
            },
            rotaryCalibrationOf(ctx.stock),
            tool,
            ctx.datumAngle,
            ctx.startA,
          );
          return {
            moves: res.moves,
            minutes: res.estimatedMinutes,
            error: null,
            summary:
              `Ø${op.nominalDiameter} × ${op.pitch}mm pitch` +
              (op.starts > 1 ? ` (${op.starts} starts)` : '') +
              `, crest Ø${res.faceDiameter.toFixed(2)}, ${res.depth.toFixed(2)}mm grooves, ` +
              `${res.passes} sweep(s) + spring` +
              (op.finishingOnly ? ', finishing pass only' : '') +
              `, X ${op.xStart.toFixed(0)}…${op.xEnd.toFixed(0)}, ~${res.estimatedMinutes.toFixed(1)} min`,
          };
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      }

      case 'pocket': {
        const SEL = 'select features (circles or flat faces)';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const regions: Vec2[][] = [];
        let sawHole = false;
        let sawFace = false;
        for (const part of parts) {
          // pure-part classification keeps faces-XOR-holes true across
          // sources too (the resolver enforces it within one source)
          const allCircles = part.ids.every((id) =>
            part.source.features.circles.some((c) => c.id === id),
          );
          const allPlanes = part.ids.every((id) =>
            part.source.features.planes.some((p) => p.id === id),
          );
          const src = pocketRegionsFromSelection(
            part.source.features,
            part.ids,
            part.source.transform,
            rotate,
            op.flatten,
          );
          if (!src || src.regions.length === 0) continue;
          if (allCircles) sawHole = true;
          if (allPlanes) sawFace = true;
          regions.push(...src.regions);
        }
        if (sawHole && sawFace) {
          return fail('select either faces or holes for this operation, not both');
        }
        if (regions.length === 0) return fail(SEL);
        const crown = stockTopZ(ctx.stock);
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        // roughing wall stock: clear a region inset by the allowance
        let cutRegions =
          op.allowance > 0 ? offsetInward(regions, op.allowance) : regions;
        if (cutRegions.length === 0) {
          return fail('the side allowance exceeds the selected region — nothing left to cut');
        }
        // Tail stock cut-over ON = a DELIBERATE step-over perimeter around
        // the defined area (Alice, 2026-10-28): the region grows by one
        // step-over before the tool-radius inset, so the swept cut extends
        // exactly one step-over past the selected outline — clean past the
        // drop-offs at the boundary (her flat-on-the-barrel: clear past the
        // horizon so the transition to the curve is crisp, no rim skin).
        // If you allowed it, you already vouched nothing of value sits there.
        if (op.cutBeyondStock !== false) {
          cutRegions = offsetOutward(cutRegions, op.stepOver);
        }
        // finishing-only: collapse the step-down ladder to ONE level at the
        // floor (zLadder with stepDown ≥ span) — the explicit version of the
        // old start = end trick, keeping the start depth as the travel
        // reference. Assumes the bulk above is already gone.
        const finStep = op.finishingOnly
          ? Math.max(range.topZ - range.floorZ + 1e-6, 0.1)
          : op.stepDown;
        const res = pocket2d(
          {
            kind: 'pocket',
            id: op.id,
            toolId: tool.id,
            regions: cutRegions,
            topZ: range.topZ,
            floorZ: range.floorZ,
            stepDown: finStep,
            stepOver: op.stepOver,
            feed,
            plungeFeed,
            safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
            // the stock clamp stays the outer bound: OFF = the declared
            // stock, ON = the stock dilated by one step-over (a region that
            // reaches the stock edge steps over it the same way)
            footprint: op.cutBeyondStock === false
              ? stockFootprint(ctx.stock, ctx.datumAngle !== 0)
              : offsetOutward(stockFootprint(ctx.stock, ctx.datumAngle !== 0), op.stepOver),
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${res.passes} passes / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}` +
            (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
            (op.finishingOnly ? ', finishing pass only' : '') +
            (op.cutBeyondStock ? ', step-over past the edge' : '') +
            `, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'slicePocket': {
        // the region is the model's cross-section (edge-tracing §2) — no
        // selection at all; the slice comes from the mesh at ONE plane.
        // Under an index datum the part sits rotated, so slice the
        // ROTATED positions at machine Z — the same convention as every
        // other indexed op (features mapped through the datum).
        if (!ctx.geometry) return fail('needs a loaded model — the slice comes from it');
        const crown = stockTopZ(ctx.stock);
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const positions0 = transformedPositions(ctx.geometry, ctx.transform);
        const positions = rotate
          ? (() => {
              const out = new Float32Array(positions0.length);
              for (let i = 0; i < positions0.length; i += 3) {
                const v = rotate({
                  x: positions0[i],
                  y: positions0[i + 1],
                  z: positions0[i + 2],
                });
                out[i] = v.x;
                out[i + 1] = v.y;
                out[i + 2] = v.z;
              }
              return out;
            })()
          : positions0;
        const slice = sliceAtZ(positions, crown - op.sliceDepth);
        if (slice.contours.length === 0) {
          return fail(
            'the section plane at this slice depth is empty — move it (the viewport handle ' +
              'or the Slice depth box) to where the model has a clean body',
          );
        }
        const dropped = slice.droppedChains;
        // finishing-only: ONE level at the floor across the band (both the
        // ring/profile branch and the interior pocket below)
        const finStep = op.finishingOnly
          ? Math.max(range.topZ - range.floorZ + 1e-6, 0.1)
          : op.stepDown;

        if (op.regionMode === 'inside') {
          // pocket the section's interior over the whole band
          const regions =
            op.allowance > 0 ? offsetInward(slice.contours, op.allowance) : slice.contours;
          if (regions.length === 0) {
            return fail('the side allowance exceeds the section — nothing left to clear');
          }
          const res = pocket2d(
            {
              kind: 'pocket',
              id: op.id,
              toolId: tool.id,
              regions,
              topZ: range.topZ,
              floorZ: range.floorZ,
              stepDown: finStep,
              stepOver: op.stepOver,
              feed,
              plungeFeed,
              safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
            },
            tool,
          );
          return {
            moves: res.moves,
            minutes: res.estimatedMinutes,
            error: null,
            summary:
              sliceSummary(op, range, res.passes, res.estimatedMinutes, dropped, 'pocket') +
              (op.finishingOnly ? ' · finishing pass only' : ''),
          };
        }

        // 'outside': the tool rides the outline offset out by the tool
        // radius (+allowance as wall stock), exactly the profile op's
        // outside pass over the section shape — the ring may cross the
        // stock edge (settled: leaving the stock is fine). The
        // waste-stock toggle APPENDS clearing of whatever waste remains
        // inside the stock; it never replaces the ring.
        const ring = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours: slice.contours,
            side: 'outside',
            sideAllowance: op.allowance, // the slice-pocket's single allowance is the radial one
            bottomAllowance: 0, // unused inside profile2d — the caller raises floorZ
            topZ: range.topZ,
            floorZ: range.floorZ,
            stepDown: finStep,
            tabs: op.tabs ?? undefined,
            feed,
            plungeFeed,
            safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
          },
          tool,
        );
        let moves = ring.moves;
        let minutes = ring.estimatedMinutes;
        let passes = ring.passes;
        let wasteNote = '';
        if (op.clearToStock) {
          const cleared = clearanceResult(
            // the waste frame rides the same collapsed ladder in
            // finishing-only mode
            op.finishingOnly ? ({ ...op, stepDown: finStep } as typeof op) : op,
            tool, slice.contours, range, op.stepOver, feed, plungeFeed, ctx,
            ctx.datumAngle !== 0,
          );
          if (cleared) {
            moves = moves.concat(cleared.moves);
            minutes += cleared.minutes;
            passes += cleared.passes;
            wasteNote = ', waste cleared to the stock edge';
          } else {
            wasteNote = ' · frame thinner than the tool — waste left standing';
          }
        }
        return {
          moves,
          minutes,
          error: null,
          summary:
            sliceSummary(op, range, passes, minutes, dropped, 'profile') +
            (op.finishingOnly ? ' · finishing pass only' : '') +
            wasteNote +
            (ring.warnings.length > 0 ? ` · ${ring.warnings.join(' · ')}` : ''),
        };
      }
      case 'waterline': {
        // Phase A 3D relief roughing (PLAN.md): the whole loaded model is the
        // target — no selection, no depth boxes. Constant-Z waterline levels
        // from the stock crown down to the model floor, each level clearing
        // the model's column minus the UPPER SHADOW of everything above the
        // cut plane (src/cam/waterline.ts owns the math). Works in 4-axis
        // INDEXED mode too (Alice's call, 2026-10-25): the datum rotation
        // below maps the part into the cutting frame, and the ladder needs
        // no Z-stop knob — it is bounded twice, by whichever is higher: the
        // model's own floor in the rotated frame (never the stock bottom;
        // the holder below the part stays) and the moat-only stop at the
        // part's widest section in that orientation (vertical-sided parts
        // stop at their top: a constant cross-section is one full-depth
        // profile pass, not N waterline levels). Multiple waterline ops
        // with index rotations between them compose — each is bounded by
        // its own orientation's geometry, and the rough can never free
        // the part.
        if (!ctx.geometry) return fail('needs a loaded model — the rough targets it');
        const crown = stockTopZ(ctx.stock);
        const stockBottom = stockSpan(ctx.stock, 'z')[0];
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const positions0 = transformedPositions(ctx.geometry, ctx.transform);
        const positions = rotate
          ? (() => {
              const out = new Float32Array(positions0.length);
              for (let i = 0; i < positions0.length; i += 3) {
                const v = rotate({
                  x: positions0[i],
                  y: positions0[i + 1],
                  z: positions0[i + 2],
                });
                out[i] = v.x;
                out[i + 1] = v.y;
                out[i + 2] = v.z;
              }
              return out;
            })()
          : positions0;
        // model extent in the cutting frame: the ladder runs crown → model
        // floor, clamped at the stock bottom (below it is the fixture)
        let modelMinZ = Infinity;
        let modelMaxZ = -Infinity;
        for (let i = 2; i < positions.length; i += 3) {
          if (positions[i] < modelMinZ) modelMinZ = positions[i];
          if (positions[i] > modelMaxZ) modelMaxZ = positions[i];
        }
        const floorZ = Math.max(modelMinZ, stockBottom);
        const setup: string[] = [];
        if (modelMinZ < stockBottom - 1e-9) {
          setup.push(
            `model extends ${(stockBottom - modelMinZ).toFixed(1)}mm below the stock bottom — roughing stops at the bottom`,
          );
        }
        if (modelMaxZ > crown + 1e-9) {
          setup.push(
            `model rises ${(modelMaxZ - crown).toFixed(1)}mm above the stock crown — the excess is left as-is`,
          );
        }
        const res = waterlineRough({
          positions,
          // null footprint = the tail-stock cut-over toggle: skip the reach
          // clip so the boundary pass may run outside the declared stock.
          // Clear-excess-stock WINS over it: the clear needs the footprint
          // (every level clears out to the stock edge — clearToStock is
          // about reaching the edge, cutBeyondStock about leaving it).
          footprint:
            op.clearToStock || !op.cutBeyondStock
              ? stockFootprint(ctx.stock, ctx.datumAngle !== 0)
              : undefined,
          topZ: crown,
          floorZ,
          stepDown: op.stepDown,
          stepOver: op.stepOver,
          allowance: op.allowance,
          finishingOnly: op.finishingOnly,
          clearToStock: op.clearToStock,
          maxDepth: op.maxDepth ?? undefined,
          // null = derive Ø + allowance + step over at generation (job files
          // stay tool-agnostic): the moat is two tool passes wide, so its
          // tool-center track keeps a step-over of width even at the
          // widest-section level where the model-vs-silhouette gap
          // collapses to wall-tessellation noise — exactly one pass wide
          // (Ø + allowance alone) shatters into plunge-per-sliver arcs there
          margin: op.margin ?? tool.diameter + op.allowance + op.stepOver,
          tool,
          feed,
          plungeFeed,
          safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
        });
        if (res.moves.length === 0) {
          return fail(
            'nothing to rough — the model already fills the stock footprint down to its floor',
          );
        }
        const deepest = res.levels[res.levels.length - 1];
        const notes = [...setup, ...res.warnings];
        if (res.droppedChains > 0) {
          notes.push(`${res.droppedChains} open chain(s) dropped — broken mesh, some levels incomplete`);
        }
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${res.levels.length} waterline level(s), ${res.passes} passes, ` +
            `z${crown.toFixed(1)} → z${deepest.toFixed(1)}` +
            (res.skippedLevels > 0 ? `, ${res.skippedLevels} level(s) skipped` : '') +
            (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
            (op.clearToStock ? ', excess cleared to the stock edge' : '') +
            (op.maxDepth && op.maxDepth > 0 ? `, ${op.maxDepth}mm max depth` : '') +
            (op.finishingOnly ? ', finishing pass only (surface scrub, waste cleared at the floor level)' : '') +
            `, ~${res.estimatedMinutes.toFixed(1)} min` +
            (notes.length > 0 ? ` · ${notes.join(' · ')}` : ''),
        };
      }
      case 'rasterContour': {
        // Phase B 3D relief surface pass (PLAN.md): the paired finish to
        // the waterline contour — the whole model is the target, no
        // selection, no depth boxes (the crown is the cut ceiling, the
        // model's own surface sets every z). Assumes the rough ran first:
        // the deep-plunge warning in the result says when it didn't.
        // 4-axis indexed like the waterline op (Alice's 2026-10-25 call):
        // the datum rotation maps the part into the cutting frame.
        if (!ctx.geometry) return fail('needs a loaded model — the surface pass targets it');
        const crown = stockTopZ(ctx.stock);
        const stockBottom = stockSpan(ctx.stock, 'z')[0];
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const positions0 = transformedPositions(ctx.geometry, ctx.transform);
        const positions = rotate
          ? (() => {
              const out = new Float32Array(positions0.length);
              for (let i = 0; i < positions0.length; i += 3) {
                const v = rotate({
                  x: positions0[i],
                  y: positions0[i + 1],
                  z: positions0[i + 2],
                });
                out[i] = v.x;
                out[i + 1] = v.y;
                out[i + 2] = v.z;
              }
              return out;
            })()
          : positions0;
        // model floor in the cutting frame — the clear-excess waste floor
        // (the same plane the waterline ladder bottoms at; the stock bottom
        // clamps it when the model hangs below)
        let modelMinZ = Infinity;
        for (let i = 2; i < positions.length; i += 3) {
          if (positions[i] < modelMinZ) modelMinZ = positions[i];
        }
        const res = rasterContour({
          positions,
          // PLAN.md: grid pitch ≈ stepover/2
          pitch: op.stepOver / 2,
          stepOver: op.stepOver,
          allowance: op.allowance,
          angleDeg: op.angle ?? 0,
          // finishing-only = the single surface pass (the old stepDown-0
          // convention, now the explicit toggle); unchecked = the flat
          // roughing ladder at the op's step-down
          stepDown: op.finishingOnly
            ? undefined
            : op.stepDown && op.stepDown > 0
              ? op.stepDown
              : undefined,
          topZ: crown,
          bottomZ: stockBottom,
          // the waterline's clear-excess, the raster's semantics: waste
          // cells clear flat at the model floor; cut-over widens the waste
          // domain so row centers may cross the stock edge
          clearToStock: op.clearToStock,
          footprint: op.clearToStock ? stockFootprint(ctx.stock, ctx.datumAngle !== 0) : undefined,
          clearFloorZ: Number.isFinite(modelMinZ) ? Math.max(modelMinZ, stockBottom) : stockBottom,
          cutBeyondStock: op.cutBeyondStock,
          tool,
          feed,
          plungeFeed,
          safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
        });
        const angle = op.angle ?? 0;
        if (res.moves.length === 0) {
          return fail('nothing to surface — the model top already sits at the stock crown');
        }
        const notes = [...res.warnings];
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${res.rows} raster row(s) at ${op.stepOver}mm step over` +
            (angle !== 0 ? `, rows at ${angle}°` : '') +
            (op.finishingOnly
              ? ', finishing pass only'
              : (op.stepDown ?? 0) > 0
                ? `, ${op.stepDown}mm step down`
                : '') +
            (op.allowance > 0 ? `, ${op.allowance}mm allowance` : ', to size') +
            (op.clearToStock ? ', excess cleared to the stock edge' : '') +
            (op.cutBeyondStock ? ', tail stock cut-over' : '') +
            `, ~${res.estimatedMinutes.toFixed(1)} min` +
            (notes.length > 0 ? ` · ${notes.join(' · ')}` : ''),
        };
      }
      case 'rotaryCarve': {
        // Phase C 4-axis relief (PLAN.md): the raster core in the unwrapped
        // (x, θ) frame — ONE op roughs and finishes (Makera's ladder: a
        // complete full-wrap sweep per depth level until nothing is left,
        // then the surface pass). No selection: the whole model on the
        // stock's rotation axis is the target, indexed like the waterline
        // (the datum rotation maps the part into the cutting frame).
        if (!ctx.geometry) return fail('needs a loaded model — the carve targets it');
        if (ctx.stock.kind !== 'cylinder') {
          return fail('rotary contour needs cylinder stock (Stock tab)');
        }
        if (ctx.stock.axisMode !== '4-axis') {
          return fail('rotary contour needs 4-axis mode (Stock tab)');
        }
        const cal = rotaryCalibrationOf(ctx.stock);
        const [sx0, sx1] = stockSpan(ctx.stock, 'x');
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const positions0 = transformedPositions(ctx.geometry, ctx.transform);
        const positions = rotate
          ? (() => {
              const out = new Float32Array(positions0.length);
              for (let i = 0; i < positions0.length; i += 3) {
                const v = rotate({
                  x: positions0[i],
                  y: positions0[i + 1],
                  z: positions0[i + 2],
                });
                out[i] = v.x;
                out[i + 1] = v.y;
                out[i + 2] = v.z;
              }
              return out;
            })()
          : positions0;
        // the carve cannot touch anything at or above the stock radius —
        // model surfaces sticking out of the stock are unreachable, said
        // up front rather than left as mystery material
        let maxRadial = 0;
        for (let i = 0; i < positions.length; i += 3) {
          const r = Math.hypot(positions[i + 1], positions[i + 2] - cal.axisZ);
          if (r > maxRadial) maxRadial = r;
        }
        const res = rotaryCarve({
          positions,
          x0: sx0,
          x1: sx1,
          radius: cal.effectiveRadius,
          axisZ: cal.axisZ,
          tool,
          stepDown: op.stepDown,
          stepOver: op.stepOver,
          allowance: op.allowance,
          finishingOnly: op.finishingOnly,
          strategy: op.strategy,
          datumAngle: ctx.datumAngle,
          startA: ctx.startA,
          feed,
          plungeFeed,
          safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
        });
        if (res.moves.length === 0) {
          return fail('nothing to carve — the model already sits at the stock surface');
        }
        const notes = [...res.warnings];
        if (maxRadial > cal.effectiveRadius + 1e-6) {
          notes.push(
            `the model extends ${(
              maxRadial - cal.effectiveRadius
            ).toFixed(1)}mm above the stock radius — that part cannot be cut`,
          );
        }
        const strategyNote =
          op.strategy === 'vertical'
            ? ', vertical rings'
            : op.strategy === 'spiralWrap'
              ? ', spiral wrap'
              : '';
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            (op.finishingOnly
              ? 'finishing pass only'
              : `${res.stats.levels} rough level(s), `) +
            `${res.stats.wraps} wrap(s)` +
            strategyNote +
            (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
            `, ~${res.estimatedMinutes.toFixed(1)} min` +
            (notes.length > 0 ? ` · ${notes.join(' · ')}` : ''),
        };
      }
      case 'drill': {
        const SEL = 'select holes (interior circles)';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const targets: DrillOp['targets'] = [];
        for (const part of parts) {
          const t = drillTargetsFromSelection(
            part.source.features,
            part.ids,
            part.source.transform,
            op.depth,
            rotate,
          );
          if (t) targets.push(...t);
        }
        if (targets.length === 0) return fail(SEL);
        const res = drill(
          {
            kind: 'drill',
            id: op.id,
            toolId: tool.id,
            targets,
            peckDepth: op.peckDepth,
            plungeFeed:
              op.rates?.plungeFeed ??
              toolPresetFor(tool, material.id)?.plungeFeed ??
              material.feedByTool.drill,
            safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.holes} hole(s), ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'profile': {
        const SEL = 'select features (circles or flat faces)';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const contours: Vec2[][] = [];
        let sawHole = false;
        let sawFace = false;
        for (const part of parts) {
          const allCircles = part.ids.every((id) =>
            part.source.features.circles.some((c) => c.id === id),
          );
          const allPlanes = part.ids.every((id) =>
            part.source.features.planes.some((p) => p.id === id),
          );
          const src = pocketRegionsFromSelection(
            part.source.features,
            part.ids,
            part.source.transform,
            rotate,
          );
          if (!src || src.regions.length === 0) continue;
          if (allCircles) sawHole = true;
          if (allPlanes) sawFace = true;
          contours.push(...src.regions);
        }
        if (sawHole && sawFace) {
          return fail('select either faces or holes for this operation, not both');
        }
        if (contours.length === 0) return fail(SEL);
        const crown = stockTopZ(ctx.stock);
        // BOTTOM allowance raises the floor (forced ≥ 0 — a negative bottom
        // would cut below the declared floor); SIDE is the radial one,
        // SIGNED: negative steps the tool-center path INSIDE the contour,
        // turning a boss down past its modeled Ø (the thread-prep case).
        // The 2026-10-28 split: one knob must never move two axes.
        const bottomAllowance = Math.max(0, op.bottomAllowance);
        const range = cutRange(op.startDepth, op.endDepth, bottomAllowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        // the wall passes always run (the ring may cross the stock edge
        // — settled: leaving the stock is fine); the waste-stock toggle
        // APPENDS clearing of whatever waste remains inside the stock.
        // Finishing-only: ONE full-depth level at the floor.
        const finStep = op.finishingOnly
          ? Math.max(range.topZ - range.floorZ + 1e-6, 0.1)
          : op.stepDown;
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours,
            side: op.side,
            sideAllowance: op.sideAllowance, // radial wall stock — signed, the path offset from the line
            bottomAllowance: 0, // unused inside profile2d — jobGeneration raised floorZ by it
            topZ: range.topZ,
            floorZ: range.floorZ, // floor raised by the bottom allowance
            stepDown: finStep,
            tabs: op.tabs ?? undefined,
            feed,
            plungeFeed,
            safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
            // Profile cut-over keeps the ORIGINAL meaning (Alice,
            // 2026-10-28): a single-cut op, so ON = permission to keep the
            // loop intact across obstacles (running out of stock to cut
            // through mid-loop) — the loop is never clipped. OFF clamps the
            // wall pass to the stock: open spans at the edge.
            footprint: op.cutBeyondStock === false
              ? stockFootprint(ctx.stock, ctx.datumAngle !== 0)
              : undefined,
          },
          tool,
        );
        let moves = res.moves;
        let minutes = res.estimatedMinutes;
        let wasteNote = '';
        if (op.clearToStock && op.side === 'outside') {
          const cleared = clearanceResult(
            // the waste frame rides the same collapsed ladder
            op.finishingOnly ? ({ ...op, stepDown: finStep } as typeof op) : op,
            tool, contours, range, defaultStepOver(tool), feed, plungeFeed, ctx,
            ctx.datumAngle !== 0,
          );
          if (cleared) {
            moves = moves.concat(cleared.moves);
            minutes += cleared.minutes;
            wasteNote = ', waste cleared to the stock edge';
          } else {
            wasteNote = ' · frame thinner than the tool — waste left standing';
          }
        }
        return {
          moves,
          minutes,
          error: null,
          summary:
            `${res.passes} wall pass(es) / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}` +
            (bottomAllowance > 0 ? `, ${bottomAllowance}mm floor allowance` : '') +
            (op.sideAllowance !== 0 ? `, ${op.sideAllowance}mm side offset` : '') +
            (op.finishingOnly ? ', finishing pass only' : '') +
            (op.cutBeyondStock ? ', tail stock cut-over' : '') +
            `, ~${minutes.toFixed(1)} min` +
            wasteNote +
            (res.warnings.length > 0 ? ` · ${res.warnings.join(' · ')}` : ''),
        };
      }

      case 'chamfer': {
        if (tool.type !== 'vbit') {
          return fail('chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
        }
        if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
          return fail('this V-bit has no usable tip angle — set the included angle in the tool library');
        }
        const SEL = 'select circles or flat faces to chamfer';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const loops: ChamferLoop[] = [];
        for (const part of parts) {
          const src = chamferTargetsFromSelection(
            part.source.features,
            part.ids,
            part.source.transform,
            rotate,
          );
          if (src) loops.push(...src.loops);
        }
        if (loops.length === 0) return fail(SEL);
        const res = chamfer(
          {
            kind: 'chamfer',
            id: op.id,
            toolId: tool.id,
            loops,
            mode: op.mode,
            side: op.side,
            direction: op.direction,
            depth: op.depth,
            feed,
            plungeFeed,
            safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${loops.length} loop(s), ${op.depth}mm chamfer, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'cylChamfer': {
        if (ctx.stock.axisMode !== '4-axis') {
          return fail('cylinder chamfer needs 4-axis mode (Stock tab)');
        }
        if (tool.type !== 'vbit') {
          return fail('cylinder chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
        }
        if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
          return fail('this V-bit has no usable tip angle — set the included angle in the tool library');
        }
        const SEL =
          'select edge circles around the stock axis — face-op step edges and ' +
          'stock end rims show as green circles, and on-axis model circles work too';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const cal = rotaryCalibrationOf(ctx.stock);
        const edges: CylChamferEdge[] = [];
        for (const part of parts) {
          const src = cylChamferTargetsFromSelection(
            part.source.features,
            part.ids,
            part.source.transform,
            cal,
          );
          if (src) edges.push(...src.edges);
        }
        if (edges.length === 0) return fail(SEL);
        // finishing-only collapses each edge's radial ladder to one level at
        // the final flank depth (levelRadii: stepDown ≥ span → [bottom]).
        // The span is per-edge: the stock-surface-to-anchor descent for a
        // 0-depth anchor, the slide-below-the-circle for a depth.
        const finSpan = op.finishingOnly
          ? Math.max(
              ...edges.map((e) => {
                const anchorR = e.diameter / 2;
                const top = op.depth <= 1e-9 ? cal.effectiveRadius : anchorR;
                return top - (anchorR - op.depth);
              }),
              0.1,
            )
          : NaN;
        const res = cylChamfer(
          {
            kind: 'cylChamfer',
            id: op.id,
            toolId: tool.id,
            edges,
            depth: op.depth,
            stepDown: op.finishingOnly ? finSpan : op.stepDown,
            rotation: op.rotation,
            plungeFeed,
            clearance: op.rates?.clearance,
          },
          cal,
          tool,
          ctx.startA,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${edges.length} edge(s) × ${res.passes / edges.length} pass(es) ` +
            (op.depth <= 1e-9
              ? 'up-and-out from the anchor Ø'
              : `${op.depth.toFixed(2)}mm below the rim (${res.width.toFixed(2)}mm wide)`) +
            (op.finishingOnly ? ', finishing pass only' : '') +
            `, ${res.chamferAngleDeg.toFixed(0)}° from the bit, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'threadMill': {
        if (tool.type !== 'threadmill') {
          return fail('thread milling needs a thread mill — pick one from the Threadmill family in the library');
        }
        const SEL =
          'select the bore or boss to thread — the rim circle, the cylinder ' +
          'wall, or the flat face around it';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const resolved: ThreadSourceTarget[] = [];
        for (const part of parts) {
          try {
            const src = threadTargetsFromSelection(
              part.source.features,
              part.ids,
              part.source.transform,
              rotate,
            );
            if (src) resolved.push(...src.targets);
          } catch (e) {
            return fail(e instanceof Error ? e.message : String(e));
          }
        }
        if (resolved.length === 0) return fail(SEL);
        // one op threads one Ø and one kind — across sources too
        if (resolved.some((t) => Math.abs(t.radius - resolved[0].radius) > 0.02)) {
          return fail(
            'the selection mixes diameters — one thread op cuts one size; ' +
              'add a second Thread mill op for the other',
          );
        }
        const kindMism = resolved.some((t) => t.internal !== op.internal);
        if (kindMism) {
          return fail(
            op.internal
              ? 'the op is set to internal but the selection holds a boss outline — ' +
                'flip Inside/Outside or split the ops'
              : 'the op is set to external but the selection holds a bore — ' +
                'flip Inside/Outside or split the ops',
          );
        }
        const crown = stockTopZ(ctx.stock);
        const topZ = crown - op.startDepth;
        const depth = op.endDepth - op.startDepth;
        if (!(depth > 0)) {
          return fail('the thread length must be positive — set the end depth below the start depth');
        }
        // the prep bore this op itself recommends is the ISO minor d1;
        // the modeled radius is the honest pre-prep size — the aside-room
        // retract reads whichever is larger (the prep opens an undersized bore)
        const d1R = (op.nominalDiameter - 1.0825 * op.pitch) / 2;
        const targets: ThreadMillTarget[] = resolved.map((t) => ({
          center: t.center,
          internal: op.internal,
          topZ,
          depth,
          ...(op.internal ? { boreRadius: Math.max(t.radius, d1R) } : {}),
        }));
        try {
          const res = threadMill(
            {
              kind: 'threadMill',
              id: op.id,
              toolId: tool.id,
              targets,
              nominalDiameter: op.nominalDiameter,
              pitch: op.pitch,
              starts: op.starts,
              tolerance: op.tolerance,
              rotation: op.rotation,
              stepOver: op.stepOver,
              feed,
              plungeFeed,
              safeClearance: op.rates?.clearance ?? SAFE_CLEARANCE,
            },
            tool,
          );
          return {
            moves: res.moves,
            minutes: res.estimatedMinutes,
            error: null,
            summary:
              `${resolved.length} ${op.internal ? 'internal' : 'external'} thread(s), ` +
              `${op.nominalDiameter}×${op.pitch}` +
              (op.starts > 1 ? ` (${op.starts} starts)` : '') +
              ` ${op.rotation}, ${depth.toFixed(1)}mm, ${res.passes} pass(es) incl. spring` +
              (op.tolerance > 0 ? `, ${op.tolerance}mm fit` : '') +
              (res.notes.length > 0 ? ` · ${res.notes.join(' · ')}` : '') +
              `, ~${res.estimatedMinutes.toFixed(1)} min`,
          };
        } catch (e) {
          return fail(e instanceof Error ? e.message : String(e));
        }
      }

      case 'engrave': {
        const SEL = 'select artwork paths (drop an SVG onto the viewport to create one)';
        const { parts, error } = selectionAcrossSources(ctx.sources, op.featureIds, SEL);
        if (error) return fail(error);
        // the frame is the ARTWORK's own, inherited per source — and one
        // op cuts in one frame. Flat paths land in the indexed cutting
        // frame (rotated like every flat op); wrapped paths are part-
        // ABSOLUTE: the artwork's angular position is set in the Model
        // tab, so the cut deliberately IGNORES the index rotation — an
        // Index op before the engrave only changes the machine's approach
        // (startA), never where on the part the artwork cuts.
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const axisZ = rotaryCalibrationOf(ctx.stock).axisZ;
        const flatPaths: { x: number; y: number }[][] = [];
        const wrappedPaths: { x: number; y: number }[][] = [];
        let flatZ = 0;
        let wrapD = 0;
        for (const part of parts) {
          const aw = part.source.artworkFrame;
          if (!aw) {
            return fail(
              'engrave cuts artwork paths — the selection holds model or primitive features',
            );
          }
          const xf0 = transformFn(part.source.transform);
          const sel = new Set(part.ids);
          for (const path of part.source.features.paths) {
            if (!sel.has(path.id)) continue;
            if (aw.kind === 'flat') {
              const pts = path.points.map((pt) => (rotate ? rotate(xf0(pt)) : xf0(pt)));
              const z = pts[0].z;
              if (pts.some((p) => Math.abs(p.z - z) > 0.05)) {
                return fail(
                  "the artwork's plane must be horizontal to engrave — rotate it flat, " +
                    'or use the wrapped presentation',
                );
              }
              flatZ = z;
              flatPaths.push(pts.map((p) => ({ x: p.x, y: p.y })));
            } else {
              wrapD = aw.diameter;
              const r = aw.diameter / 2;
              const circ = Math.PI * aw.diameter;
              const uv: { x: number; y: number }[] = [];
              path.points.forEach((pt, i) => {
                const p = xf0(pt);
                if (Math.abs(Math.hypot(p.y, p.z - axisZ) - r) > 0.05) {
                  throw new Error(
                    'the wrapped artwork must sit ON the stock axis — move it back ' +
                      'onto the axis before engraving',
                  );
                }
                const th = (Math.atan2(p.y, p.z - axisZ) * 180) / Math.PI;
                let u = (th / 360) * circ;
                if (i > 0) {
                  // unwrap CONTINUOUSLY through ±180°: a wrapped artwork
                  // may straddle the seam (a 360° wrap almost always does,
                  // spun to sit anywhere) — the cut just rotates on
                  // through it and the post re-zeros A afterwards (G92.4),
                  // so the seam is no boundary at all. Each step takes the
                  // short way, so a single AUTHORED stroke spanning more
                  // than half a turn would fold the wrong way — real line
                  // work samples densely and never has one.
                  const prev = uv[i - 1].x;
                  while (u - prev > circ / 2) u -= circ;
                  while (prev - u > circ / 2) u += circ;
                }
                uv.push({ x: u, y: p.x });
              });
              wrappedPaths.push(uv);
            }
          }
        }
        if (flatPaths.length > 0 && wrappedPaths.length > 0) {
          return fail('one engrave op cuts in one frame — split flat and wrapped artwork into separate ops');
        }
        const paths = flatPaths.length > 0 ? flatPaths : wrappedPaths;
        if (paths.length === 0) return fail(SEL);
        const res = engrave({
          id: op.id,
          toolId: tool.id,
          paths,
          depth: op.depth,
          // finishing-only collapses the depth ladder to one full-depth pass
          // (depthLadder: stepDown ≥ depth)
          stepDown: op.finishingOnly ? op.depth : op.stepDown,
          feed,
          plungeFeed,
          clearance: op.rates?.clearance ?? SAFE_CLEARANCE,
          frame:
            flatPaths.length > 0
              ? { kind: 'flat', surfaceZ: flatZ }
              : {
                  kind: 'wrapped',
                  radius: wrapD / 2,
                  surfaceZ: axisZ + wrapD / 2,
                  // 0, NOT ctx.datumAngle: the artwork's position is
                  // absolute — the index rotation must not move the cut
                  datumAngle: 0,
                  startA: ctx.startA,
                },
          ...(tool.type === 'laser'
            ? {
                // power% rides the spindleRpm slot through the same
                // ⚡→preset→tool chain; the S word is the 0–1 fraction
                laser: {
                  focus: tool.focus ?? 1,
                  power:
                    (rpmFor(tool, ctx.stock.materialId, op.rates) ?? tool.spindleRpm) / 100,
                },
              }
            : {}),
        });
        const limited =
          wrapD > 0 && res.effectiveFeed < feed - 1e-9
            ? ` — rotary-limited to ~${res.effectiveFeed.toFixed(0)} mm/min on the surface`
            : '';
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${paths.length} path(s), ${op.depth}mm deep${op.finishingOnly ? ', finishing pass only' : ''}${limited}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }
    }
  } catch (e) {
    return fail(String(e));
  }
}