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
  return parsed;
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