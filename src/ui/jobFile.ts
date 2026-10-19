/**
 * Job save/load: the whole working state as one self-contained JSON file
 * (stock, model + its STL, placement, primitives, ops, and the tools the
 * ops reference so a job survives library differences). Generation results
 * are not persisted — they regenerate deterministically from the ops.
 */

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
    if (op.kind === 'chamfer') {
      // ops saved before all three fields existed (or by a mid-build dev
      // state) carry undefined values — the panel select then displays the
      // default while the generator treats undefined as the OTHER option
      const rawSide = (op as { side?: unknown }).side;
      const side = rawSide === 'inside' || rawSide === 'outside' || rawSide === 'auto' ? rawSide : 'auto';
      const rawDir = (op as { direction?: unknown }).direction;
      const direction = rawDir === 'down' || rawDir === 'up' ? rawDir : 'down';
      const rawDepth = (op as { depth?: unknown }).depth;
      const depth = typeof rawDepth === 'number' && rawDepth > 0 ? rawDepth : 0.5;
      const changed = side !== op.side || direction !== op.direction || depth !== op.depth;
      return changed ? { ...op, side, direction, depth } : op;
    }
    if (op.kind !== 'faceCylinder') return op;
    const raw = (op as { pattern?: unknown }).pattern;
    const pattern: FacePattern =
      raw === 'vertical' || raw === 'horizontal' || raw === 'spiral' ? raw : 'spiral';
    const rawStepOver = (op as { stepOver?: unknown }).stepOver;
    const stepOver = typeof rawStepOver === 'number' && rawStepOver > 0 ? rawStepOver : null;
    const changed = pattern !== op.pattern || stepOver !== op.stepOver;
    return changed ? { ...op, pattern, stepOver } : op;
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

/** Base64 with chunked conversion (String.fromCharCode chokes on spread
 * for multi-MB inputs). */
export function encodeStl(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
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