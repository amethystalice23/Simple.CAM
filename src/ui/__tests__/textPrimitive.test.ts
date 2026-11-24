/**
 * The TEXT primitive (2026-11-24): layout → centered stroke paths, the
 * artwork-plumbing feature source, the constructor's frame choice, the
 * job-file v3 round-trip, and an engrave op generating through the real
 * pipeline over a text source.
 */

import { describe, expect, it } from 'vitest';
import { identityTransform, rotaryCalibrationOf } from '../../core/types';
import type { JobOp, Primitive, Stock, Tool } from '../../core/types';
import {
  generateJobOp,
  type GenContext,
} from '../jobGeneration';
import { resolveFeature, sourcesFor, textLocalPoints } from '../featureSources';
import { parseJobFile, saveJobFile, JOB_VERSION } from '../jobFile';
import {
  DEFAULT_TEXT_FONT_ID,
  layoutTextPaths,
  relayoutText,
  textPrimitiveFromSpec,
} from '../textPrimitive';

const BOX: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 100,
  sizeY: 60,
  sizeZ: 20,
  origin: { x: 'mid', y: 'mid', z: 'min' },
  axisMode: '3-axis',
  materialId: 'delrin',
};

const ROD: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 50,
  xOrigin: 'mid',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 },
  axisMode: '4-axis',
  materialId: 'delrin',
};

const LASER: Tool = {
  id: 'l1',
  name: 'laser module',
  type: 'laser',
  diameter: 0.1,
  spindleRpm: 80,
};

describe("layoutTextPaths — the primitive's stored frame", () => {
  it("centers the paths and flips the layout's y-down to y-up", () => {
    const lay = layoutTextPaths({
      text: 'HELLO',
      fontId: DEFAULT_TEXT_FONT_ID,
      size: 5,
      letterSpacing: 0,
      wrapWidth: 0,
    });
    expect(lay.paths.length).toBeGreaterThan(0);
    expect(lay.width).toBeGreaterThan(0);
    expect(lay.height).toBeGreaterThan(0);
    for (const path of lay.paths) {
      for (const q of path) {
        expect(q.x).toBeGreaterThanOrEqual(-lay.width / 2 - 1e-6);
        expect(q.x).toBeLessThanOrEqual(lay.width / 2 + 1e-6);
        expect(q.y).toBeGreaterThanOrEqual(-lay.height / 2 - 1e-6);
        expect(q.y).toBeLessThanOrEqual(lay.height / 2 + 1e-6);
      }
    }
  });

  it("multi-line text grows the height; wrap width caps the width", () => {
    const one = layoutTextPaths({ text: 'HELLO', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 0, wrapWidth: 0 });
    const two = layoutTextPaths({ text: 'HELLO\nWORLD', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 0, wrapWidth: 0 });
    expect(two.height).toBeGreaterThan(one.height);
    const long = layoutTextPaths({ text: 'HELLO WORLD HELLO WORLD', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 0, wrapWidth: 20 });
    const raw = layoutTextPaths({ text: 'HELLO WORLD HELLO WORLD', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 0, wrapWidth: 0 });
    // wrapping narrows the layout and stacks lines (a single word wider
    // than the wrap width still lands on its own line — greedy first-fit)
    expect(long.width).toBeLessThan(raw.width);
    expect(long.height).toBeGreaterThan(one.height);
  });

  it('letter spacing widens the layout', () => {
    const tight = layoutTextPaths({ text: 'HELLO', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 0, wrapWidth: 0 });
    const loose = layoutTextPaths({ text: 'HELLO', fontId: DEFAULT_TEXT_FONT_ID, size: 5, letterSpacing: 1, wrapWidth: 0 });
    expect(loose.width).toBeGreaterThan(tight.width);
  });
});

describe('textPrimitiveFromSpec — the frame choice', () => {
  it('flat: on the box crown, centered', () => {
    const p = textPrimitiveFromSpec({ text: 'A', fontId: DEFAULT_TEXT_FONT_ID, size: 3, letterSpacing: 0, wrapWidth: 0 }, BOX);
    expect(p.kind).toBe('text');
    expect(p.presentation).toBe('flat');
    expect(p.transform.position.z).toBeCloseTo(20, 6);
    expect(p.paths.length).toBeGreaterThan(0);
  });

  it("wrapped: on the rod's rotation axis, at the stock's own Ø", () => {
    const p = textPrimitiveFromSpec({ text: 'A', fontId: DEFAULT_TEXT_FONT_ID, size: 3, letterSpacing: 0, wrapWidth: 0 }, ROD);
    expect(p.presentation).toBe('wrapped');
    expect(p.wrapDiameter).toBeCloseTo(16.35, 6);
    expect(p.transform.position.y).toBe(0);
    expect(p.transform.position.z).toBeCloseTo(rotaryCalibrationOf(ROD).axisZ, 6);
  });

  it('relayout keeps identity, transform and presentation', () => {
    const p = textPrimitiveFromSpec({ text: 'A', fontId: DEFAULT_TEXT_FONT_ID, size: 3, letterSpacing: 0, wrapWidth: 0 }, BOX);
    const q = relayoutText(p, { text: 'LONGER TEXT', fontId: DEFAULT_TEXT_FONT_ID, size: 6, letterSpacing: 0.5, wrapWidth: 0 });
    expect(q.id).toBe(p.id);
    expect(q.transform).toEqual(p.transform);
    expect(q.presentation).toBe(p.presentation);
    expect(q.width).toBeGreaterThan(p.width);
  });
});

describe('text features — the artwork plumbing', () => {
  it('publishes per-path features the resolver finds; local points stay centered', () => {
    const p = textPrimitiveFromSpec({ text: 'OK', fontId: DEFAULT_TEXT_FONT_ID, size: 4, letterSpacing: 0, wrapWidth: 0 }, BOX);
    const sources = sourcesFor(null, null, identityTransform(), [p]);
    expect(sources).toHaveLength(1);
    expect(sources[0].artworkFrame).toEqual({ kind: 'flat' });
    expect(sources[0].features.paths).toHaveLength(p.paths.length);
    for (const f of sources[0].features.paths) {
      expect(f.id).toMatch(new RegExp(`^p:${p.id}:path:\\d+$`));
    }
    const r = resolveFeature(sources, sources[0].features.paths[0].id);
    expect(r?.kind).toBe('path');
    // flat local points: centered mm, y up, z 0
    const pts = textLocalPoints(p).flat();
    expect(pts.every((q) => q.z === 0)).toBe(true);
    // wrapped: bent onto the own Ø at radius r, ascending arc left→right
    const w = { ...p, presentation: 'wrapped' as const, wrapDiameter: 16.35 };
    const wpts = textLocalPoints(w).flat();
    for (const q of wpts) {
      expect(Math.hypot(q.y, q.z)).toBeCloseTo(16.35 / 2, 6);
    }
    // face-up (round 4): the cap top sits toward −X
    const topMost = wpts.reduce((a, b) => (b.z > a.z ? b : a));
    expect(topMost.z).toBeGreaterThan(0);
  });

  it("an engrave op over a text source generates through the real pipeline", () => {
    const p = textPrimitiveFromSpec({ text: 'CAL', fontId: DEFAULT_TEXT_FONT_ID, size: 3, letterSpacing: 0, wrapWidth: 0 }, BOX);
    const sources = sourcesFor(null, null, identityTransform(), [p]);
    const op: JobOp = {
      kind: 'engrave',
      id: 'jobop-1',
      toolId: LASER.id,
      featureIds: sources[0].features.paths.map((f) => f.id),
      depth: 0.1,
      stepDown: 0.1,
      fillMode: 'outlines',
    };
    const ctx: GenContext = {
      stock: BOX,
      geometry: null,
      features: null,
      transform: identityTransform(),
      tools: [LASER],
      primitives: [p],
      sources,
      datumAngle: 0,
      startA: 0,
    };
    const res = generateJobOp(op, ctx);
    expect(res.error).toBeNull();
    expect(res.moves.length).toBeGreaterThan(0);
  });
});

describe('job-file round-trip (v3)', () => {
  it('saves and re-loads a text primitive byte-faithfully', () => {
    const p = textPrimitiveFromSpec({ text: 'R 12.5', fontId: DEFAULT_TEXT_FONT_ID, size: 4, letterSpacing: 0.2, wrapWidth: 0 }, BOX);
    const file = saveJobFile({
      stock: BOX,
      transform: identityTransform(),
      primitives: [p as Primitive],
      ops: [],
      tools: [],
      modelName: 'none',
      modelBytes: null,
    });
    expect(file.version).toBe(JOB_VERSION);
    expect(JOB_VERSION).toBe(3);
    const parsed = parseJobFile(JSON.stringify(file));
    const t = parsed.primitives[0];
    expect(t.kind).toBe('text');
    if (t.kind !== 'text') return;
    expect(t.text).toBe('R 12.5');
    expect(t.fontId).toBe(DEFAULT_TEXT_FONT_ID);
    expect(t.size).toBe(4);
    expect(t.letterSpacing).toBeCloseTo(0.2, 9);
    expect(t.paths).toEqual(p.paths);
    expect(t.width).toBeCloseTo(p.width, 9);
    expect(t.height).toBeCloseTo(p.height, 9);
  });
});
