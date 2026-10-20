/**
 * Job operation generation: resolve a JobOp (editable sequence state) into
 * moves by combining its feature selection with the stock, tool, and
 * material presets. Per-op errors are captured, not thrown, so one broken
 * op never blocks the rest of the job.
 */

import type * as THREE from 'three';
import { DEFAULT_STEP_OVER_FACTOR, faceCylinder } from '../cam/faceCylinder';
import { chamfer } from '../cam/chamfer';
import { drill } from '../cam/drill';
import { pocket2d } from '../cam/pocket';
import { profile2d } from '../cam/profile';
import { difference, offsetInward, offsetOutward } from '../cam/clipper';
import { sliceAtZ, transformedPositions } from '../cam/slicing';
import { indexedPointRotation } from '../cam/indexing';
import type { DetectedFeatures } from '../cam/features';
import { getMaterial } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import type {
  ChamferLoop,
  DrillOp,
  JobOp,
  ModelTransform,
  Move,
  OpRates,
  Primitive,
  Stock,
  Tool,
  ToolPreset,
  Vec2,
} from '../core/types';
import { isDepthBearingJobOp, rotaryCalibrationOf, round2 } from '../core/types';
import { chamferTargetsFromSelection, drillTargetsFromSelection, pocketRegionsFromSelection } from './opTargets';
import { resolveFeature, splitSelection, unmatchedIds, type FeatureSource } from './featureSources';
import { stockFootprint, stockSpan, stockTopZ } from './placement';

export interface GeneratedOp {
  moves: Move[];
  /** cutting time estimate, minutes */
  minutes: number;
  /** generation error, if any (kept per-op, not thrown) */
  error: string | null;
  /** one-line summary for the op panel */
  summary: string | null;
}

export interface GenContext {
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
}

export const OP_KINDS: { kind: JobOp['kind']; label: string }[] = [
  { kind: 'pocket', label: 'Pocket' },
  { kind: 'profile', label: 'Profile' },
  { kind: 'slicePocket', label: 'Slice pocket' },
  { kind: 'drill', label: 'Drill' },
  { kind: 'chamfer', label: 'Chamfer' },
  { kind: 'index', label: 'Index (4-axis)' },
  { kind: 'faceCylinder', label: 'Face cylinder' },
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
        primitiveId: null,
        stepDown,
        /** null = derive 0.5·tool Ø at generation (job files stay tool-agnostic) */
        stepOver: null,
        finishAllowance: 0.2,
        rotation: 'cw',
        pattern: 'spiral',
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
        stepOver: defaultStepOver(tool),
        floorFeatureId: null,
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
        stepOver: defaultStepOver(tool),
        floorFeatureId: null,
        clearToStock: false, // outline ring only unless asked
      };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2 };
    case 'chamfer':
      return { ...base, kind, mode: 'add', side: 'auto', direction: 'down', depth: 0.5 };
    case 'index':
      return { ...base, kind, angle: 90 };
    case 'profile':
      return {
        ...base,
        kind,
        selectionIs: 'floor',
        startDepth: 0,
        endDepth: 2,
        allowance: 0,
        stepDown,
        side: 'outside',
        floorFeatureId: null,
        clearToStock: false, // outline ring only unless asked
      };
  }
}

const fail = (error: string): GeneratedOp => ({ moves: [], minutes: 0, error, summary: null });

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
): { moves: Move[]; minutes: number; passes: number } | null {
  const keepOut = op.allowance > 0 ? offsetOutward(contours, op.allowance) : contours;
  const regions = difference(stockFootprint(ctx.stock), keepOut);
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
        safeClearance: 5,
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

/** The tool's own Makera preset for the stock material, if one matches
 * ('aluminum-6061' matches preset 'Aluminum'; unmatched falls back). */
export function toolPresetFor(tool: Tool, materialId: string): ToolPreset | null {
  const key = materialId.split('-')[0].toLowerCase();
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
 * The rates the ops-panel popup shows as this op's defaults — EXACTLY what
 * generation uses when the op has no `rates` overrides. Drill plunges at
 * the preset drill feed (no plunge fraction); spindle comes from the
 * tool's Tools-tab value.
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
    spindleRpm: tool.spindleRpm,
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
    return fail('the floor feature no longer exists — reselect');
  }
  const res = generateJobOpInner(op, ctx);
  if (op.kind === 'index' || res.moves.length === 0) return res;
  const rpm = op.rates?.spindleRpm ?? ctx.tools.find((t) => t.id === op.toolId)?.spindleRpm;
  if (rpm === undefined) return res;
  return {
    ...res,
    moves: [{ ...res.moves[0], spindleRpm: rpm }, ...res.moves.slice(1)],
  };
}

function generateJobOpInner(op: JobOp, ctx: GenContext): GeneratedOp {
  try {
    const tool = ctx.tools.find((t) => t.id === op.toolId);
    if (!tool) return fail('tool missing from library');
    const material = getMaterial(ctx.stock.materialId);
    const { feed, plungeFeed } = feedsFor(tool, material, op.rates);

    switch (op.kind) {
      case 'index': {
        if (ctx.stock.axisMode !== '4-axis') return fail('indexing needs 4-axis mode (Stock tab)');
        return {
          moves: [
            {
              words: { a: op.angle },
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
        // a target primitive overrides the X range and target diameter;
        // otherwise the op's explicit fields (avoiding vice jaws etc.)
        const prim =
          op.primitiveId !== null
            ? ctx.primitives.find(
                (p): p is Extract<Primitive, { kind: 'cylinder' }> =>
                  p.id === op.primitiveId && p.kind === 'cylinder',
              )
            : undefined;
        if (op.primitiveId !== null && !prim) return fail('the target primitive no longer exists');
        const xStart = prim ? prim.transform.position.x - prim.length / 2 : op.xStart;
        const xEnd = prim ? prim.transform.position.x + prim.length / 2 : op.xEnd;
        const res = faceCylinder(
          {
            kind: 'faceCylinder',
            id: op.id,
            toolId: tool.id,
            targetDiameter: prim ? prim.diameter : op.targetDiameter,
            xStart,
            xEnd,
            stepDown: op.stepDown,
            stepOver: op.stepOver ?? defaultFaceStepOver(tool),
            finishAllowance: op.finishAllowance,
            plungeFeed: plungeFeed,
            feed,
            rotation: op.rotation,
            pattern: op.pattern,
          },
          rotaryCalibrationOf(ctx.stock),
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} passes (${op.pattern}) → Ø${(prim ? prim.diameter : op.targetDiameter).toFixed(1)}mm, X ${xStart.toFixed(0)}…${xEnd.toFixed(0)}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
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
        const cutRegions =
          op.allowance > 0 ? offsetInward(regions, op.allowance) : regions;
        if (cutRegions.length === 0) {
          return fail('the side allowance exceeds the selected region — nothing left to cut');
        }
        const res = pocket2d(
          {
            kind: 'pocket',
            id: op.id,
            toolId: tool.id,
            regions: cutRegions,
            topZ: range.topZ,
            floorZ: range.floorZ,
            stepDown: op.stepDown,
            stepOver: op.stepOver,
            feed,
            plungeFeed,
            safeClearance: 5,
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} passes / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}${op.allowance > 0 ? `, ${op.allowance}mm allowance` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'slicePocket': {
        // the region is the model's cross-section (edge-tracing §2) — no
        // selection at all; the slice comes from the mesh at ONE plane
        if (!ctx.geometry) return fail('needs a loaded model — the slice comes from it');
        if (ctx.datumAngle !== 0) {
          return fail('slice pockets run in the flat frame — no Index op above them (tilted slicing comes later)');
        }
        const crown = stockTopZ(ctx.stock);
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        const positions = transformedPositions(ctx.geometry, ctx.transform);
        const slice = sliceAtZ(positions, crown - op.sliceDepth);
        if (slice.contours.length === 0) {
          return fail(
            'the section plane at this slice depth is empty — move it (the viewport handle ' +
              'or the Slice depth box) to where the model has a clean body',
          );
        }
        const dropped = slice.droppedChains;

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
              stepDown: op.stepDown,
              stepOver: op.stepOver,
              feed,
              plungeFeed,
              safeClearance: 5,
            },
            tool,
          );
          return {
            moves: res.moves,
            minutes: res.estimatedMinutes,
            error: null,
            summary: sliceSummary(op, range, res.passes, res.estimatedMinutes, dropped, 'pocket'),
          };
        }

        // 'outside': the tool rides the outline offset out by the tool
        // radius (+allowance as wall stock), exactly the profile op's
        // outside pass but over the section shape from the slice plane —
        // never needs to fit between the part and the stock wall, so a
        // snug stock can't reject the tool. The waste-stock toggle adds
        // full clearance to the stock edge on top of that.
        if (op.clearToStock) {
          const cleared = clearanceResult(
            op, tool, slice.contours, range, op.stepOver, feed, plungeFeed, ctx,
          );
          if (cleared) {
            return {
              moves: cleared.moves,
              minutes: cleared.minutes,
              error: null,
              summary:
                sliceSummary(op, range, cleared.passes, cleared.minutes, dropped, 'clearance') +
                ', to the stock edge',
            };
          }
        }
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours: slice.contours,
            side: 'outside',
            allowance: op.allowance,
            topZ: range.topZ,
            floorZ: range.floorZ,
            stepDown: op.stepDown,
            feed,
            plungeFeed,
            safeClearance: 5,
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            sliceSummary(op, range, res.passes, res.estimatedMinutes, dropped, 'profile') +
            (op.clearToStock ? ' · frame thinner than the tool — outline ring only' : ''),
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
            safeClearance: 5,
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
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        // waste-stock toggle: clear from the contour out to the stock
        // wall when asked — the outline ring is the fallback (a frame
        // thinner than the tool cannot be pocketed)
        if (op.clearToStock && op.side === 'outside') {
          const cleared = clearanceResult(
            op, tool, contours, range, defaultStepOver(tool), feed, plungeFeed, ctx,
          );
          if (cleared) {
            return {
              moves: cleared.moves,
              minutes: cleared.minutes,
              error: null,
              summary:
                `${cleared.passes} passes cleared to the stock edge / ` +
                `z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}` +
                (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
                `, ~${cleared.minutes.toFixed(1)} min`,
            };
          }
        }
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours,
            side: op.side,
            allowance: op.allowance, // wall stock (path offset from the line)
            topZ: range.topZ,
            floorZ: range.floorZ, // floor raised by the same allowance
            stepDown: op.stepDown,
            feed,
            plungeFeed,
            safeClearance: 5,
          },
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary:
            `${res.passes} wall pass(es) / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}` +
            (op.allowance > 0 ? `, ${op.allowance}mm allowance` : '') +
            `, ~${res.estimatedMinutes.toFixed(1)} min` +
            (op.clearToStock && op.side === 'outside'
              ? ' · frame thinner than the tool — outline ring only'
              : ''),
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
            safeClearance: 5,
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
    }
  } catch (e) {
    return fail(String(e));
  }
}