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
import type { JobOp, ModelTransform, Move, Stock, Tool } from '../core/types';
import { originSpan } from '../core/types';
import { drillTargetsFromSelection, pocketRegionsFromSelection } from './opTargets';

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
/** New op of the given kind with sensible default parameters. */
export function newJobOp(kind: JobOp['kind'], toolId: string): JobOp {
  const base = { id: `jobop-${++opCount}`, toolId, featureIds: [] };
  switch (kind) {
    case 'faceCylinder':
      return { ...base, kind, targetDiameter: 40, stepDown: 1, finishAllowance: 0.2, rotation: 'cw' };
    case 'pocket':
      return { ...base, kind, depth: 2, stepDown: 1, stepOver: 3 };
    case 'drill':
      return { ...base, kind, depth: 5, peckDepth: 2 };
    case 'profile':
      return { ...base, kind, depth: 2, stepDown: 1, allowance: 0, side: 'outside' };
  }
}

const fail = (error: string): GeneratedOp => ({ moves: [], minutes: 0, error, summary: null });

export function generateJobOp(op: JobOp, ctx: GenContext): GeneratedOp {
  const tool = ctx.tools.find((t) => t.id === op.toolId);
  if (!tool) return fail('tool missing from library');
  const material = getMaterial(ctx.stock.materialId);
  const feed = material.feedByTool[tool.type];
  const plungeFeed = Math.round(feed * material.plungeFraction);

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
        const res = pocket2d(
          {
            kind: 'pocket',
            id: op.id,
            toolId: tool.id,
            regions: src.regions,
            topZ: src.topZ,
            floorZ: src.topZ - op.depth,
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
          summary: `${res.passes} passes / ${res.levels} level(s), ~${res.estimatedMinutes.toFixed(1)} min`,
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
            plungeFeed: material.feedByTool.drill, // drill preset feed IS the plunge feed
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
        const res = profile2d(
          {
            kind: 'profile',
            id: op.id,
            toolId: tool.id,
            contours: src.regions,
            side: op.side,
            allowance: op.allowance,
            topZ: src.topZ,
            floorZ: src.topZ - op.depth,
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
          summary: `${res.passes} wall pass(es) / ${res.levels} level(s), ~${res.estimatedMinutes.toFixed(1)} min`,
        };
      }
    }
  } catch (e) {
    return fail(String(e));
  }
}