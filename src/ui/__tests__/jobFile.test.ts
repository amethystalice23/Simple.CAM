import { describe, expect, it } from 'vitest';
import type { JobOp, Stock, Tool } from '../../core/types';
import { identityTransform } from '../../core/types';
import {
  decodeStl,
  encodeStl,
  JOB_FORMAT,
  JOB_VERSION,
  parseJobFile,
  saveJobFile,
} from '../jobFile';

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
  materialId: 'aluminum-6061',
};

const tools: Tool[] = [
  { id: 't-used', name: 'A', type: 'flat', diameter: 6, spindleRpm: 18000 },
  { id: 't-unused', name: 'B', type: 'flat', diameter: 3, spindleRpm: 18000 },
];

const ops: JobOp[] = [
  {
    id: 'jobop-1',
    toolId: 't-used',
    featureIds: [],
    kind: 'pocket',
    selectionIs: 'floor',
    startDepth: 0,
    endDepth: 2,
    allowance: 0,
    stepDown: 0.5,
    stepOver: 3,
  },
];

describe('stl encoding', () => {
  it('round-trips arbitrary binary bytes', () => {
    const bytes = new Uint8Array(70000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const decoded = decodeStl(encodeStl(bytes));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded[0]).toBe(0);
    expect(decoded[65535]).toBe(255);
    expect(Buffer.compare(Buffer.from(decoded), Buffer.from(bytes))).toBe(0);
  });
});

describe('saveJobFile', () => {
  it('embeds the model and only the tools the ops reference', () => {
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops,
      tools,
      modelName: 'part.stl',
      modelBytes: new Uint8Array([1, 2, 3, 255]),
    });
    expect(file.format).toBe(JOB_FORMAT);
    expect(file.version).toBe(JOB_VERSION);
    expect(file.model).not.toBeNull();
    expect(file.model!.name).toBe('part.stl');
    expect(decodeStl(file.model!.stlBase64)).toEqual(new Uint8Array([1, 2, 3, 255]));
    expect(file.tools.map((t) => t.id)).toEqual(['t-used']);
  });

  it('saves a model-less job when nothing is loaded', () => {
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops: [],
      tools,
      modelName: 'none',
      modelBytes: null,
    });
    expect(file.model).toBeNull();
    expect(file.ops).toEqual([]);
  });
});

describe('parseJobFile', () => {
  it('accepts a file saved by saveJobFile and round-trips the state', () => {
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops,
      tools,
      modelName: 'part.stl',
      modelBytes: new Uint8Array([9, 9]),
    });
    const parsed = parseJobFile(JSON.stringify(file));
    expect(parsed.stock.kind).toBe('box');
    expect(parsed.ops[0].toolId).toBe('t-used');
    expect(decodeStl(parsed.model!.stlBase64)).toEqual(new Uint8Array([9, 9]));
  });

  it('rejects foreign files and newer formats', () => {
    expect(() => parseJobFile('{"format":"something else"}')).toThrowError(/not a simple/);
    expect(() => parseJobFile('not json at all')).toThrowError();
    const newer = JSON.stringify({ format: JOB_FORMAT, version: JOB_VERSION + 1 });
    expect(() => parseJobFile(newer)).toThrowError(/newer/);
    const gutted = JSON.stringify({ format: JOB_FORMAT, version: JOB_VERSION, ops: [] });
    expect(() => parseJobFile(gutted)).toThrowError(/missing required sections/);
  });
});