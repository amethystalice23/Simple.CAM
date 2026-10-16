/**
 * Job operation generation: resolve a JobOp (editable sequence state) into
 * moves by combining its feature selection with the stock, tool, and
 * material presets. Per-op errors are captured, not thrown, so one broken
 * op never blocks the rest of the job.
 */

import type * as THREE from 'three';
import { faceCylinder } from '../cam/faceCylinder';
import { drill } from '../cam/drill';
import { pocket2d } from '../cam/pocket';
import { profile2d } from '../cam/profile';
import { offsetInward } from '../cam/clipper';
import { indexedPointRotation } from '../cam/indexing';
import type { DetectedFeatures } from '../cam/features';
import { getMaterial } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import type { JobOp, ModelTransform, Move, Stock, Tool, ToolPreset } from '../core/types';
import { originSpan } from '../core/types';
import { drillTargetsFromSelection, pocketRegionsFromSelection } from './opTargets';
import { stockTopZ } from './placement';

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
}

export const OP_KINDS: { kind: JobOp['kind']; label: string }[] = [
  { kind: 'pocket', label: 'Pocket' },
  { kind: 'profile', label: 'Profile' },
  { kind: 'drill', label: 'Drill' },
  { kind: 'faceCylinder', label: 'Face cylinder' },
];

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
 * New op of the given kind with defaults derived from the tool and stock
 * material (preset step-downs and a diameter-fraction step-over — never a
 * fixed guess that ignores the cutter size).
 */
export function newJobOp(kind: JobOp['kind'], tool: Tool, materialId: string): JobOp {
  const base = { id: `jobop-${++opCount}`, toolId: tool.id, featureIds: [] };
  const stepDown = defaultStepDown(tool, materialId);
  switch (kind) {
    case 'faceCylinder':
      return { ...base, kind, targetDiameter: 40, stepDown, finishAllowance: 0.2, rotation: 'cw' };
    case 'pocket':
      return {
        ...base,
        kind,
        selectionIs: 'floor',
        startDepth: 0,
        endDepth: 2,
        allowance: 0,
        indexAngle: 0,
        stepDown,
        stepOver: defaultStepOver(tool),
      };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2, indexAngle: 0 };
    case 'profile':
      return {
        ...base,
        kind,
        selectionIs: 'floor',
        startDepth: 0,
        endDepth: 2,
        allowance: 0,
        indexAngle: 0,
        stepDown,
        side: 'outside',
      };
  }
}

const fail = (error: string): GeneratedOp => ({ moves: [], minutes: 0, error, summary: null });

/**
 * The indexed cutting frame for an op: null for flat work (angle 0 or box
 * stock), else a rotation about the stock axis. When non-null the op also
 * emits one rapid A positioning move before its flat moves.
 */
function indexFrame(
  op: { indexAngle?: number },
  stock: Stock,
): { rotate?: (p: { x: number; y: number; z: number }) => import('three').Vector3; aMove?: Move } {
  const angle = op.indexAngle ?? 0;
  if (angle === 0) return {};
  if (stock.kind !== 'cylinder') {
    throw new Error('indexing needs cylinder stock');
  }
  return {
    rotate: indexedPointRotation(angle, stock.calibration.axisZ),
    aMove: {
      words: { a: angle },
      feed: 0,
      rapid: true,
      comment: `index stock to A${angle}°`,
    },
  };
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
  if (endDepth < startDepth - 1e-9) return null; // end above start: nothing to cut
  const topZ = crown - startDepth;
  const floorZ = crown - endDepth + allowance;
  if (floorZ > topZ + 1e-9) return null; // allowance swallows the whole range
  return { topZ, floorZ };
}

export function generateJobOp(op: JobOp, ctx: GenContext): GeneratedOp {
  const tool = ctx.tools.find((t) => t.id === op.toolId);
  if (!tool) return fail('tool missing from library');
  const material = getMaterial(ctx.stock.materialId);
  const { feed, plungeFeed } = feedsFor(tool, material);

  try {
    switch (op.kind) {
      case 'faceCylinder': {
        if (ctx.stock.kind !== 'cylinder') return fail('needs cylinder stock');
        const [xStart, xEnd] = originSpan(ctx.stock.xOrigin, ctx.stock.length);
        const res = faceCylinder(
          {
            kind: 'faceCylinder',
            id: op.id,
            toolId: tool.id,
            targetDiameter: op.targetDiameter,
            xStart,
            xEnd,
            stepDown: op.stepDown,
            finishAllowance: op.finishAllowance,
            plungeFeed: plungeFeed,
            rotation: op.rotation,
          },
          ctx.stock,
          tool,
        );
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} passes → Ø${op.targetDiameter}mm, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'pocket': {
        if (!ctx.geometry || !ctx.features) return fail('load a model first');
        const { rotate, aMove } = indexFrame(op, ctx.stock);
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
          moves: aMove ? [aMove, ...res.moves] : res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} passes / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}${op.allowance > 0 ? `, ${op.allowance}mm allowance` : ''}${aMove ? `, indexed A${op.indexAngle ?? 0}°` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'drill': {
        if (!ctx.features) return fail('load a model first');
        const { rotate, aMove } = indexFrame(op, ctx.stock);
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
          moves: aMove ? [aMove, ...res.moves] : res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.holes} hole(s)${aMove ? ` at A${op.indexAngle ?? 0}°` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'profile': {
        if (!ctx.geometry || !ctx.features) return fail('load a model first');
        const { rotate, aMove } = indexFrame(op, ctx.stock);
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
          moves: aMove ? [aMove, ...res.moves] : res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} wall pass(es) / ${res.levels} level(s), z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}${op.allowance > 0 ? `, ${op.allowance}mm allowance` : ''}${aMove ? `, indexed A${op.indexAngle ?? 0}°` : ''}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }
    }
  } catch (e) {
    return fail(String(e));
  }
}