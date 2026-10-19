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
import { offsetInward } from '../cam/clipper';
import { indexedPointRotation } from '../cam/indexing';
import type { DetectedFeatures } from '../cam/features';
import { getMaterial } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import type { JobOp, ModelTransform, Move, Primitive, Stock, Tool, ToolPreset } from '../core/types';
import { rotaryCalibrationOf } from '../core/types';
import { chamferTargetsFromSelection, drillTargetsFromSelection, pocketRegionsFromSelection } from './opTargets';
import { stockSpan, stockTopZ } from './placement';

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
  /** the cutting datum for this op: the absolute A established by the
   * latest Index op preceding it in the job sequence (0 = flat) */
  datumAngle: number;
}

export const OP_KINDS: { kind: JobOp['kind']; label: string }[] = [
  { kind: 'pocket', label: 'Pocket' },
  { kind: 'profile', label: 'Profile' },
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
      };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2 };
    case 'chamfer':
      return { ...base, kind, side: 'auto', direction: 'down', depth: 0.5 };
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
      };
  }
}

const fail = (error: string): GeneratedOp => ({ moves: [], minutes: 0, error, summary: null });

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
 * else the material-preset tables. */
function feedsFor(tool: Tool, material: MaterialPreset) {
  const preset = toolPresetFor(tool, material.id);
  const feed = preset?.feed ?? material.feedByTool[tool.type];
  const plungeFeed =
    preset?.plungeFeed ?? Math.round(material.feedByTool[tool.type] * material.plungeFraction);
  return { feed, plungeFeed };
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
  if (op.kind !== 'pocket' && op.kind !== 'profile') return op;
  if (op.selectionIs === 'floor') {
    return { ...op, startDepth: 0, endDepth: Math.max(crownZ - selectionZ, 0.3) } as JobOp;
  }
  const start = Math.max(crownZ - selectionZ, 0);
  return { ...op, startDepth: start, endDepth: start + 2 } as JobOp;
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
 * Resolve one op into moves. NEVER THROWS: every failure — including bad
 * context (unknown material, missing tool) — comes back as a per-op error
 * so one broken op can never silently kill a whole-job recalculation.
 */
export function generateJobOp(op: JobOp, ctx: GenContext): GeneratedOp {
  try {
    const tool = ctx.tools.find((t) => t.id === op.toolId);
    if (!tool) return fail('tool missing from library');
    const material = getMaterial(ctx.stock.materialId);
    const { feed, plungeFeed } = feedsFor(tool, material);

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
        if (!ctx.geometry || !ctx.features) return fail('load a model first');
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const src = pocketRegionsFromSelection(
          ctx.geometry,
          ctx.features,
          op.featureIds,
          ctx.transform,
          rotate,
        );
        if (!src) return fail('select features (circles or flat faces)');
        const crown = stockTopZ(ctx.stock);
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        // roughing wall stock: clear a region inset by the allowance
        const regions =
          op.allowance > 0 ? offsetInward(src.regions, op.allowance) : src.regions;
        if (regions.length === 0) {
          return fail('the side allowance exceeds the selected region — nothing left to cut');
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
          summary: `${res.passes} passes / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}${op.allowance > 0 ? `, ${op.allowance}mm allowance` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'drill': {
        if (!ctx.features) return fail('load a model first');
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const targets = drillTargetsFromSelection(
          ctx.features,
          op.featureIds,
          ctx.transform,
          op.depth,
          rotate,
        );
        if (!targets) return fail('select holes (interior circles)');
        const res = drill(
          {
            kind: 'drill',
            id: op.id,
            toolId: tool.id,
            targets,
            peckDepth: op.peckDepth,
            plungeFeed: toolPresetFor(tool, material.id)?.plungeFeed ?? material.feedByTool.drill,
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
        if (!ctx.geometry || !ctx.features) return fail('load a model first');
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const src = pocketRegionsFromSelection(
          ctx.geometry,
          ctx.features,
          op.featureIds,
          ctx.transform,
          rotate,
        );
        if (!src) return fail('select features (circles or flat faces)');
        const crown = stockTopZ(ctx.stock);
        const range = cutRange(op.startDepth, op.endDepth, op.allowance, crown);
        if (!range) {
          return fail(
            'end depth must be at or below start depth, and the allowance must leave something to cut',
          );
        }
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours: src.regions,
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
          summary: `${res.passes} wall pass(es) / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}${op.allowance > 0 ? `, ${op.allowance}mm allowance` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'chamfer': {
        if (!ctx.features) return fail('load a model first');
        if (tool.type !== 'vbit') {
          return fail('chamfer needs a V-bit — pick a chamfering/engraving bit from the library');
        }
        if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
          return fail('this V-bit has no usable tip angle — set the included angle in the tool library');
        }
        const { rotate } = indexFrame(ctx.datumAngle, ctx.stock);
        const src = chamferTargetsFromSelection(
          ctx.features,
          op.featureIds,
          ctx.transform,
          rotate,
        );
        if (!src) return fail('select circles or flat faces to chamfer');
        const res = chamfer(
          {
            kind: 'chamfer',
            id: op.id,
            toolId: tool.id,
            loops: src.loops,
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
          summary: `${src.loops.length} loop(s), ${op.depth}mm chamfer, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }
    }
  } catch (e) {
    return fail(String(e));
  }
}