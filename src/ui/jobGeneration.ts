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
import type { DetectedFeatures } from '../cam/features';
import { getMaterial } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import type { JobOp, ModelTransform, Move, Stock, Tool, ToolPreset } from '../core/types';
import { originSpan } from '../core/types';
import { drillTargetsFromSelection, pocketRegionsFromSelection, type PocketSource } from './opTargets';
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
        depth: 2,
        stepDown,
        stepOver: defaultStepOver(tool),
      };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2 };
    case 'profile':
      return { ...base, kind, selectionIs: 'floor', depth: 2, stepDown, allowance: 0, side: 'outside' };
  }
}

const fail = (error: string): GeneratedOp => ({ moves: [], minutes: 0, error, summary: null });

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
 * Cut range from the selection and the op's toggle: 'floor' cuts from the
 * stock crown down TO the selected plane; 'top' cuts down FROM it by the
 * op's depth. Geometry alone can't tell a hole rim from a hole bottom.
 */
function cutRange(
  src: PocketSource,
  selectionIs: 'floor' | 'top',
  depth: number,
  stock: Stock,
): { topZ: number; floorZ: number } | null {
  if (selectionIs === 'top') {
    return { topZ: src.selectionZ, floorZ: src.selectionZ - depth };
  }
  const crown = stockTopZ(stock);
  if (src.selectionZ >= crown) {
    return null; // nothing above the selection to cut through
  }
  return { topZ: crown, floorZ: src.selectionZ };
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
        const src = pocketRegionsFromSelection(ctx.geometry, ctx.features, op.featureIds, ctx.transform);
        if (!src) return fail('select features (circles or flat faces)');
        const range = cutRange(src, op.selectionIs, op.depth, ctx.stock);
        if (!range) {
          return fail('the selected feature is at or above the stock crown — nothing to cut down to it');
        }
        const res = pocket2d(
          {
            kind: 'pocket',
            id: op.id,
            toolId: tool.id,
            regions: src.regions,
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
        const rangeText =
          op.selectionIs === 'floor'
            ? `z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}`
            : `${op.depth.toFixed(1)}mm below selection`;
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} passes / ${res.levels} level(s), ${rangeText}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }

      case 'drill': {
        if (!ctx.features) return fail('load a model first');
        const targets = drillTargetsFromSelection(ctx.features, op.featureIds, ctx.transform, op.depth);
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
        const src = pocketRegionsFromSelection(ctx.geometry, ctx.features, op.featureIds, ctx.transform);
        if (!src) return fail('select features (circles or flat faces)');
        const range = cutRange(src, op.selectionIs, op.depth, ctx.stock);
        if (!range) {
          return fail('the selected feature is at or above the stock crown — nothing to cut down to it');
        }
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours: src.regions,
            side: op.side,
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
        const rangeText =
          op.selectionIs === 'floor'
            ? `z${range.topZ.toFixed(1)} → z${range.floorZ.toFixed(1)}`
            : `${op.depth.toFixed(1)}mm below selection`;
        return {
          moves: res.moves,
          minutes: res.estimatedMinutes,
          error: null,
          summary: `${res.passes} wall pass(es) / ${res.levels} level(s), ${rangeText}, ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }
    }
  } catch (e) {
    return fail(String(e));
  }
}