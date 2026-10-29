/**
 * Job save/load: the whole working state as one self-contained JSON file
 * (stock, model + its STL, placement, primitives, ops, and the tools the
 * ops reference so a job survives library differences). Generation results
 * are not persisted — they regenerate deterministically from the ops.
 */

import { isDepthBearingJobOp } from '../core/types';
import type { JobOp, ModelTransform, Primitive, Stock, Tool } from '../core/types';

export const JOB_FORMAT = 'simple.cam job';
export const JOB_VERSION = 1;

export interface JobFile {
  format: string;
  version: number;
  stock: Stock;
  transform: ModelTransform;
  primitives: Primitive[];
  ops: JobOp[];
  /** tool records referenced by the ops (merged into the library on load) */
  tools: Tool[];
  /** the loaded STL, embedded so reopening needs no re-drop */
  model: { name: string; stlBase64: string } | null;
}

const FACE_PATTERNS = ['vertical', 'horizontal', 'spiral'] as const;
type FacePattern = (typeof FACE_PATTERNS)[number];

/**
 * Normalize the stock from a stored job to the current shape. Files
 * predating the axis-mode toggle carry no `axisMode`: shape implied it then
 * (cylinder = 4th axis, box = flat), so that is the fallback — an explicit
 * mode always wins. Runtime data, not a type error: parsed JSON is cast
 * to Stock without validation.
 */
export function normalizeStock(stock: Stock): Stock {
  const raw = (stock as { axisMode?: unknown }).axisMode;
  const axisMode = raw === '3-axis' || raw === '4-axis' ? raw : null;
  if (axisMode === stock.axisMode) return stock;
  return { ...stock, axisMode: axisMode ?? (stock.kind === 'cylinder' ? '4-axis' : '3-axis') };
}

/**
 * Normalize ops from a stored job to the current shapes. Job files predating
 * the three-pattern facing rework carry `pattern: 'zigzag'` (or none at all)
 * — both map to 'spiral', the closest of the new patterns (a per-pass
 * helical sweep; it stepped down in the cut). Pre-step-over files carry no
 * `stepOver` — it becomes null (derive 0.5·tool Ø at generation). Runtime
 * data, not a type error: parsed JSON is cast to JobOp[] without validation.
 */
export function normalizeJobOps(ops: JobOp[]): JobOp[] {
  return ops.map((op) => {
    // 'Finishing pass only' (Alice, 2026-10-26): the field is optional on
    // every ladder op — absent = unchecked everywhere EXCEPT raster
    // contour, where stepDown 0 (or absent) WAS the finishing-only
    // convention and migrates to checked. (Runs first, and reassigns
    // `op`, so every per-kind block below sees the normalized shape —
    // the tabs-era lesson: never an early return.)
    if (op.kind === 'rasterContour') {
      const raw = (op as { finishingOnly?: unknown }).finishingOnly;
      if (raw !== true && raw !== false) {
        const sd = (op as { stepDown?: unknown }).stepDown;
        op = {
          ...op,
          finishingOnly: !(typeof sd === 'number' && sd > 0),
        } as JobOp;
      }
    }
    // pre-surfaceDiameter thread saves: ladder from the stock surface
    if (op.kind === 'thread') {
      const rawSurf = (op as { surfaceDiameter?: unknown }).surfaceDiameter;
      if (typeof rawSurf !== 'number' && rawSurf !== null) {
        return { ...op, surfaceDiameter: null } as JobOp;
      }
    }
    // thread-mill saves from the naming round (2026-10-28, hours old):
    // hand 'right'/'left' → the cw/ccw thread perception (Alice: "dont
    // use right-hand/left-hand as the other thread tool uses cw/ccw, so
    // be consistant" — 'left' = 'ccw', their 14ccw example), and no
    // stepOver yet → 0 (one full-form pass, unchanged behavior)
    if (op.kind === 'threadMill') {
      const rawHand = (op as { hand?: unknown }).hand;
      const rawStep = (op as { stepOver?: unknown }).stepOver;
      if (rawHand !== undefined || typeof rawStep !== 'number') {
        const { hand: _handEra, ...rest } = op as typeof op & { hand?: unknown };
        return {
          ...rest,
          rotation: rawHand === 'left' ? 'ccw' : rawHand === 'right' ? 'cw' : (op as { rotation?: 'cw' | 'ccw' }).rotation ?? 'cw',
          stepOver: typeof rawStep === 'number' ? rawStep : 0,
        } as JobOp;
      }
    }
    // pre-margin waterline saves (interim builds, 2026-10-25): derive the
    // tool Ø + allowance + step over at generation. Saves from the
    // tabs-era interim build may also carry a `tabs` field — dropped (the
    // upper-shadow keep-out made the rough provably unable to sever, so
    // waterline tabs guarded a scenario that cannot occur). Pre-cut-over
    // saves (2026-10-26) carry no cutBeyondStock — the tool stays inside.
    if (op.kind === 'waterline') {
      const rawMargin = (op as { margin?: unknown }).margin;
      const rawTabs = (op as { tabs?: unknown }).tabs;
      const rawCut = (op as { cutBeyondStock?: unknown }).cutBeyondStock;
      const marginOk = typeof rawMargin === 'number' || rawMargin === null;
      const cutOk = rawCut === true || rawCut === false;
      if (!marginOk || rawTabs !== undefined || !cutOk) {
        const { tabs: _tabsEra, ...rest } = op as typeof op & { tabs?: unknown };
        return {
          ...rest,
          margin: marginOk ? rawMargin : null,
          cutBeyondStock: cutOk ? rawCut : false,
        } as JobOp;
      }
    }
    // pre-tabs profile/slicePocket saves: no bridges. ASSIGN, never return —
    // legacy saves lack tabs AND the depth-bearing fields below, and an
    // early return would skip that migration
    if (op.kind === 'profile' || op.kind === 'slicePocket') {
      const rawTabs = (op as { tabs?: unknown }).tabs;
      if (rawTabs !== null && typeof rawTabs !== 'object') {
        op = { ...op, tabs: null } as JobOp;
      }
    }
    // pre-split profile saves (2026-10-28): the single `allowance` moved
    // BOTH the floor and the wall — it migrates to bottom AND side alike.
    // MUTATE (assign), never return: legacy saves lack the split AND the
    // clearToStock/cutBeyondStock fields below, and an early return would
    // skip those migrations (the tabs-era lesson).
    if (op.kind === 'profile') {
      const hasSplit =
        typeof (op as { bottomAllowance?: unknown }).bottomAllowance === 'number' &&
        typeof (op as { sideAllowance?: unknown }).sideAllowance === 'number';
      if (!hasSplit) {
        const a = typeof (op as { allowance?: unknown }).allowance === 'number'
          ? (op as { allowance?: unknown }).allowance as number
          : 0;
        const { allowance: _old, ...rest } = op as typeof op & { allowance?: unknown };
        op = { ...rest, bottomAllowance: a, sideAllowance: a } as JobOp;
      }
    }
    // pre-⇩ saves carry no floorFeatureId — detached is the null default
    if (isDepthBearingJobOp(op)) {
      const normalized = op.floorFeatureId === undefined ? { ...op, floorFeatureId: null } : op;
      // pre-sliceDepth slice pockets kept the section plane in startDepth
      // (runtime data from an interim build — probe without narrowing)
      if (normalized.kind === 'slicePocket') {
        const rawSlice = (normalized as { sliceDepth?: unknown }).sliceDepth;
        if (typeof rawSlice !== 'number') {
          return { ...normalized, sliceDepth: normalized.startDepth } as JobOp;
        }
      }
      // pre-flatten pocket saves: islands preserved
      if (normalized.kind === 'pocket') {
        const rawFlat = (normalized as { flatten?: unknown }).flatten;
        if (rawFlat !== true && rawFlat !== false) {
          return { ...normalized, flatten: false } as JobOp;
        }
      }
      // pre-clearToStock profile/slicePocket saves: the toggle is off
      if (normalized.kind === 'profile' || normalized.kind === 'slicePocket') {
        const rawClear = (normalized as { clearToStock?: unknown }).clearToStock;
        if (rawClear !== true && rawClear !== false) {
          return { ...normalized, clearToStock: false } as JobOp;
        }
      }
      // pre-cut-over pocket/profile saves: absent = true (preserve unclamped behavior)
      if (normalized.kind === 'pocket' || normalized.kind === 'profile') {
        const rawCut = (normalized as { cutBeyondStock?: unknown }).cutBeyondStock;
        if (rawCut !== true && rawCut !== false) {
          return { ...normalized, cutBeyondStock: true } as JobOp;
        }
      }
      return normalized;
    }
    // contour4d saves from the plan-only stage carried no clearToStock —
    // the excess clear is the DEFAULT (Alice 2026-10-29: without it the
    // rough strands waste columns around the part, and the chunks drop
    // or fly off mid-job, leaving later orientations plotting against
    // stock that moved)
    if (op.kind === 'contour4d') {
      const rawClear = (op as { clearToStock?: unknown }).clearToStock;
      if (rawClear !== true && rawClear !== false) {
        return { ...op, clearToStock: true } as JobOp;
      }
    }
    if (op.kind === 'chamfer') {
      // ops saved before all four fields existed (or by a mid-build dev
      // state) carry undefined values — the panel select then displays the
      // default while the generator treats undefined as the OTHER option
      const rawMode = (op as { mode?: unknown }).mode;
      const mode = rawMode === 'add' || rawMode === 'existing' ? rawMode : 'add';
      const rawSide = (op as { side?: unknown }).side;
      const side = rawSide === 'inside' || rawSide === 'outside' || rawSide === 'auto' ? rawSide : 'auto';
      const rawDir = (op as { direction?: unknown }).direction;
      const direction = rawDir === 'down' || rawDir === 'up' ? rawDir : 'down';
      const rawDepth = (op as { depth?: unknown }).depth;
      const depth = typeof rawDepth === 'number' && rawDepth > 0 ? rawDepth : 0.5;
      const changed =
        mode !== op.mode || side !== op.side || direction !== op.direction || depth !== op.depth;
      return changed ? { ...op, mode, side, direction, depth } : op;
    }
    if (op.kind === 'cylChamfer') {
      // a save from a mid-build dev state may miss fields — normalize to
      // the newJobOp defaults so generation never sees undefined
      const rawDepth = (op as { depth?: unknown }).depth;
      const rawStep = (op as { stepDown?: unknown }).stepDown;
      const rawRot = (op as { rotation?: unknown }).rotation;
      const normalized = {
        ...op,
        depth: typeof rawDepth === 'number' && rawDepth >= 0 ? rawDepth : 0,
        stepDown: typeof rawStep === 'number' && rawStep > 0 ? rawStep : 0.5,
        rotation: rawRot === 'cw' || rawRot === 'ccw' ? rawRot : 'cw',
      } as JobOp;
      return normalized;
    }
    if (op.kind !== 'faceCylinder') return op;
    const raw = (op as { pattern?: unknown }).pattern;
    const pattern: FacePattern =
      raw === 'vertical' || raw === 'horizontal' || raw === 'spiral' ? raw : 'spiral';
    const rawStepOver = (op as { stepOver?: unknown }).stepOver;
    const stepOver = typeof rawStepOver === 'number' && rawStepOver > 0 ? rawStepOver : null;
    // pre-cut-over saves (2026-10-27) carry no cutBeyondStock — the tool
    // stays inside (off = the sharp rotary-pocket default)
    const rawCut = (op as { cutBeyondStock?: unknown }).cutBeyondStock;
    const cutBeyondStock = rawCut === true;
    const changed =
      pattern !== op.pattern || stepOver !== op.stepOver || cutBeyondStock !== op.cutBeyondStock;
    return changed ? { ...op, pattern, stepOver, cutBeyondStock } : op;
  });
}

export interface SaveableState {
  stock: Stock;
  transform: ModelTransform;
  primitives: Primitive[];
  ops: JobOp[];
  tools: Tool[];
  modelName: string;
  /** raw STL bytes of the loaded model, null when no model */
  modelBytes: Uint8Array | null;
}

/**
 * Base64 with chunked conversion (String.fromCharCode chokes on spread
 * for multi-MB inputs). Cached by the bytes' identity: the array is stable
 * for as long as a model is loaded, and every debounced autosave re-encodes
 * it — a 12MB STL paid seconds of main-thread base64 per edit otherwise
 * (a WeakMap so a replaced model's string can be collected).
 */
const stlBase64Cache = new WeakMap<Uint8Array, string>();

export function encodeStl(bytes: Uint8Array): string {
  const hit = stlBase64Cache.get(bytes);
  if (hit !== undefined) return hit;
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(s);
  stlBase64Cache.set(bytes, b64);
  return b64;
}

export function decodeStl(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function saveJobFile(state: SaveableState): JobFile {
  const used = new Set(state.ops.map((op) => op.toolId));
  return {
    format: JOB_FORMAT,
    version: JOB_VERSION,
    stock: state.stock,
    transform: state.transform,
    primitives: state.primitives,
    ops: state.ops,
    tools: state.tools.filter((t) => used.has(t.id)),
    model: state.modelBytes
      ? { name: state.modelName, stlBase64: encodeStl(state.modelBytes) }
      : null,
  };
}

export function parseJobFile(text: string): JobFile {
  const parsed = JSON.parse(text) as JobFile;
  if (!parsed || parsed.format !== JOB_FORMAT || typeof parsed.version !== 'number') {
    throw new Error('not a simple.cam job file');
  }
  if (parsed.version > JOB_VERSION) {
    throw new Error(
      `job file format v${parsed.version} is newer than this app supports (v${JOB_VERSION})`,
    );
  }
  if (!parsed.stock || !parsed.transform || !Array.isArray(parsed.ops) || !Array.isArray(parsed.primitives)) {
    throw new Error('job file is missing required sections');
  }
  return { ...parsed, stock: normalizeStock(parsed.stock), ops: normalizeJobOps(parsed.ops) };
}

/** Serialize + download (kept apart from the pure save/parse for testing). */
export function downloadJobFile(file: JobFile, baseName: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.cam.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Cheap identity digest for dirty tracking. The tool list is deliberately
 * excluded: merging a loaded job's tools into the library reorders them
 * without changing the job; the model is compared by name + encoded size.
 */
export function jobFingerprint(file: JobFile): string {
  return JSON.stringify({
    stock: file.stock,
    transform: file.transform,
    primitives: file.primitives,
    ops: file.ops,
    model: file.model ? { name: file.model.name, size: file.model.stlBase64.length } : null,
  });
}