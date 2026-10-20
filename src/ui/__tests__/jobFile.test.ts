import { describe, expect, it } from 'vitest';
import type { JobOp, Primitive, Stock, Tool } from '../../core/types';
import { identityTransform } from '../../core/types';
import {
  decodeStl,
  encodeStl,
  jobFingerprint,
  JOB_FORMAT,
  JOB_VERSION,
  normalizeJobOps,
  normalizeStock,
  parseJobFile,
  saveJobFile,
} from '../jobFile';

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 60,
  sizeY: 40,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'max' },
  axisMode: '3-axis',
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

  it('round-trips per-op rate overrides, and absent rates stay absent', () => {
    const withRates: JobOp[] = [
      { ...ops[0], id: 'jobop-2', rates: { feed: 300, spindleRpm: 12000 } },
    ];
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops: withRates,
      tools,
      modelName: 'part.stl',
      modelBytes: new Uint8Array([9, 9]),
    });
    const parsed = parseJobFile(JSON.stringify(file));
    expect(parsed.ops[0].rates).toEqual({ feed: 300, spindleRpm: 12000 });
    // a job saved before the popup existed loads with rates simply absent
    const plain = parseJobFile(
      JSON.stringify(
        saveJobFile({
          stock: boxStock,
          transform: identityTransform(),
          primitives: [],
          ops,
          tools,
          modelName: 'part.stl',
          modelBytes: new Uint8Array([9, 9]),
        }),
      ),
    );
    expect(plain.ops[0].rates).toBeUndefined();
  });

  it('rejects foreign files and newer formats', () => {
    expect(() => parseJobFile('{"format":"something else"}')).toThrowError(/not a simple/);
    expect(() => parseJobFile('not json at all')).toThrowError();
    const newer = JSON.stringify({ format: JOB_FORMAT, version: JOB_VERSION + 1 });
    expect(() => parseJobFile(newer)).toThrowError(/newer/);
    const gutted = JSON.stringify({ format: JOB_FORMAT, version: JOB_VERSION, ops: [] });
    expect(() => parseJobFile(gutted)).toThrowError(/missing required sections/);
  });

  it('normalizes legacy face patterns: zigzag and missing both map to spiral', () => {
    const legacyFace = {
      id: 'jobop-9',
      toolId: 't-used',
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 100,
      primitiveId: null,
      stepDown: 1,
      finishAllowance: 0.2,
      rotation: 'cw',
      pattern: 'zigzag',
    };
    const file = {
      format: JOB_FORMAT,
      version: JOB_VERSION,
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops: [legacyFace, { ...legacyFace, id: 'jobop-10', pattern: undefined }],
      tools,
      model: null,
    };
    const parsed = parseJobFile(JSON.stringify(file));
    for (const op of parsed.ops) {
      if (op.kind !== 'faceCylinder') throw new Error('kind');
      expect(op.pattern).toBe('spiral');
    }
  });

  it('keeps current face patterns and non-face ops untouched', () => {
    const file = {
      format: JOB_FORMAT,
      version: JOB_VERSION,
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops: [
        {
          id: 'jobop-9',
          toolId: 't-used',
          featureIds: [],
          kind: 'faceCylinder',
          targetDiameter: 40,
          xStart: 0,
          xEnd: 100,
          primitiveId: null,
          stepDown: 1,
          finishAllowance: 0.2,
          rotation: 'cw',
          pattern: 'vertical',
        },
      ],
      tools,
      model: null,
    };
    const parsed = parseJobFile(JSON.stringify(file));
    const op = parsed.ops[0];
    if (op.kind !== 'faceCylinder') throw new Error('kind');
    expect(op.pattern).toBe('vertical');
  });

  it('normalizes facing step-over: absent or invalid → null (derived), valid kept', () => {
    const face = {
      id: 'jobop-9',
      toolId: 't-used',
      featureIds: [],
      kind: 'faceCylinder',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 100,
      primitiveId: null,
      stepDown: 1,
      finishAllowance: 0.2,
      rotation: 'cw',
      pattern: 'vertical',
    };
    const file = (stepOver: unknown) => ({
      format: JOB_FORMAT,
      version: JOB_VERSION,
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      tools,
      model: null,
      ops: [{ ...face, stepOver }],
    });
    const norm = (stepOver: unknown) => {
      const parsed = parseJobFile(JSON.stringify(file(stepOver)));
      const op = parsed.ops[0];
      if (op.kind !== 'faceCylinder') throw new Error('kind');
      return op.stepOver;
    };
    expect(norm(undefined)).toBeNull(); // pre-step-over job files
    expect(norm(null)).toBeNull();
    expect(norm(0)).toBeNull(); // invalid values must not reach the generator
    expect(norm(-3)).toBeNull();
    expect(norm('wide')).toBeNull();
    expect(norm(3)).toBeCloseTo(3, 9); // an explicit setting survives round-trips
  });

  it('normalizes the stock axis mode: absent falls back by shape, explicit survives', () => {
    // a file predating the mode toggle carries no axisMode at all (the type
    // lies about parsed JSON — that is exactly what normalizeStock repairs)
    const legacyCyl = {
      kind: 'cylinder',
      length: 80,
      xOrigin: 'mid',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
      materialId: 'aluminum-6061',
    };
    const legacyBox = { ...boxStock, axisMode: undefined };
    // shape implied the mode then: cylinder = 4th axis, box = flat
    expect(normalizeStock(legacyCyl as unknown as Stock).axisMode).toBe('4-axis');
    expect(normalizeStock(legacyBox as unknown as Stock).axisMode).toBe('3-axis');
    // explicit values survive round-trips untouched...
    expect(normalizeStock({ ...boxStock, axisMode: '4-axis' }).axisMode).toBe('4-axis');
    // ...and invalid values fall back by shape rather than reaching the app
    const junk = normalizeStock({ ...boxStock, axisMode: 'spin' } as unknown as Stock);
    expect(junk.axisMode).toBe('3-axis');
    // normalization runs on the parse path too
    const file = { format: JOB_FORMAT, version: JOB_VERSION, stock: legacyCyl as unknown as Stock, transform: identityTransform(), primitives: [], ops, tools, model: null };
    const parsed = parseJobFile(JSON.stringify(file));
    expect(parsed.stock.axisMode).toBe('4-axis');
  });
});

describe('jobFingerprint', () => {
  const base = {
    stock: boxStock,
    transform: identityTransform(),
    primitives: [],
    ops,
    tools,
    modelName: 'part.stl',
    modelBytes: new Uint8Array([1, 2, 3]),
  };

  it('is stable across identical saves and ignores tool-list order', () => {
    const a = saveJobFile(base);
    const b = saveJobFile({ ...base, tools: [...tools].reverse() });
    expect(jobFingerprint(a)).toBe(jobFingerprint(b));
    expect(jobFingerprint(a)).toBe(jobFingerprint(saveJobFile(base)));
  });

  it('changes when the job content changes', () => {
    const a = saveJobFile(base);
    const b = saveJobFile({ ...base, ops: [...ops, { ...ops[0], id: 'jobop-2' }] });
    expect(jobFingerprint(a)).not.toBe(jobFingerprint(b));
    const c = saveJobFile({ ...base, modelBytes: new Uint8Array([1, 2, 3, 4]) });
    expect(jobFingerprint(a)).not.toBe(jobFingerprint(c));
    const d = saveJobFile({ ...base, modelName: 'other.stl' });
    expect(jobFingerprint(a)).not.toBe(jobFingerprint(d));
  });
});
describe('chamfer op round-trip', () => {
  it('saves and parses a chamfer op unchanged', () => {
    const chamferOp: JobOp = {
      id: 'jobop-9',
      toolId: 't-used',
      featureIds: ['some-circle'],
      kind: 'chamfer',
      mode: 'add',
      side: 'auto',
      direction: 'down',
      depth: 0.5,
    };
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [],
      ops: [chamferOp],
      tools,
      modelName: 'part.stl',
      modelBytes: new Uint8Array([1, 2, 3]),
    });
    const parsed = parseJobFile(JSON.stringify(file));
    expect(parsed.ops).toEqual([chamferOp]);
  });
});

describe('normalizeJobOps: chamfer', () => {
  const base = { id: 'jobop-1', toolId: 't1', featureIds: ['f1'] };
  it('repairs ops saved before mode/side/direction/depth existed (panel showed the default, generator read undefined)', () => {
    const stale = normalizeJobOps([
      { ...base, kind: 'chamfer' },
    ] as unknown as JobOp[]);
    expect(stale[0]).toEqual({
      ...base, kind: 'chamfer', mode: 'add', side: 'auto', direction: 'down', depth: 0.5,
    });
  });

  it('repairs invalid values but keeps valid ones', () => {
    const repaired = normalizeJobOps([
      { ...base, kind: 'chamfer', mode: 'sometimes', side: 'sideways', direction: 'up', depth: -1 },
    ] as unknown as JobOp[]);
    expect(repaired[0]).toEqual({
      ...base, kind: 'chamfer', mode: 'add', side: 'auto', direction: 'up', depth: 0.5,
    });

    const kept = normalizeJobOps([
      { ...base, kind: 'chamfer', mode: 'existing', side: 'outside', direction: 'up', depth: 1.5 },
    ] as unknown as JobOp[]);
    expect(kept[0]).toEqual({
      ...base, kind: 'chamfer', mode: 'existing', side: 'outside', direction: 'up', depth: 1.5,
    });
  });
});

describe('model-less jobs with primitive-targeted ops', () => {
  it('round-trips primitives and namespaced feature ids unchanged', () => {
    const primitive: Primitive = {
      kind: 'cylinder',
      id: 'prim-1',
      diameter: 20,
      length: 50,
      original: { diameter: 20, length: 50 },
      transform: identityTransform(),
    };
    const chamfer: JobOp = {
      id: 'jobop-2',
      toolId: 't-used',
      featureIds: ['p:prim-1:circle-abc123'],
      kind: 'chamfer',
      mode: 'add',
      side: 'auto',
      direction: 'down',
      depth: 0.5,
    };
    const file = saveJobFile({
      stock: boxStock,
      transform: identityTransform(),
      primitives: [primitive],
      ops: [chamfer],
      tools,
      modelName: 'none',
      modelBytes: null,
    });
    const parsed = parseJobFile(JSON.stringify(file));
    expect(parsed.model).toBeNull();
    expect(parsed.primitives).toEqual([primitive]);
    const op = parsed.ops[0];
    if (op.kind !== 'chamfer') throw new Error('kind');
    expect(op.featureIds).toEqual(['p:prim-1:circle-abc123']);
    expect(op.mode).toBe('add');
  });
});
