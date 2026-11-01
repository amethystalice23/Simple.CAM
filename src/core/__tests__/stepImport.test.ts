/**
 * STEP import tests (probes/probe-step.mjs pinned the occt facts; these
 * pin OUR glue): unit normalization (OCCT converts to mm — the package's
 * own mm/inch/metre cube trio must yield IDENTICAL soups), non-indexed
 * soup format, assembly concatenation (18-mesh fixture), the binary-STL
 * job-save round-trip through the REAL STLLoader (what a saved job
 * re-parses), and the honest failure paths.
 *
 * Fixtures read from the occt-import-js package at test time (its
 * test/testfiles) — the package is a hard dependency of this feature,
 * and its LGPL data files are read, never copied into our tree.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { encodeBinaryStl, stepMeshesToSoup, type OcctStepResult } from '../stepImport';

const require = createRequire(import.meta.url);
const occtimportjs = require('occt-import-js') as (moduleArg?: {
  locateFile?: (path: string, dir: string) => string;
}) => Promise<{ ReadStepFile: (b: Uint8Array, p: unknown) => OcctStepResult }>;

const fixture = (rel: string): Uint8Array =>
  new Uint8Array(readFileSync(require.resolve(`occt-import-js/test/testfiles/${rel}`)));

let occt: { ReadStepFile: (b: Uint8Array, p: unknown) => OcctStepResult };
beforeAll(async () => {
  occt = await occtimportjs();
});

const readStep = (rel: string): OcctStepResult => occt.ReadStepFile(fixture(rel), null);

const bbox = (pos: Float32Array): { min: number; max: number } => {
  let min = Infinity;
  let max = -Infinity;
  for (const v of pos) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
};

describe('stepMeshesToSoup', () => {
  it('converts a mm cube to the canonical non-indexed soup', () => {
    const soup = stepMeshesToSoup(readStep('cube-units/cube-mm.step'));
    expect(soup.triangles).toBe(12);
    expect(soup.positions.length).toBe(12 * 9); // non-indexed: every triangle carries its vertices
    const bb = bbox(soup.positions);
    expect(bb.min).toBeCloseTo(0, 6); // OCCT returns millimetres (probe-verified)
    expect(bb.max).toBeCloseTo(1000, 6);
    for (const n of soup.normals) expect(Number.isFinite(n)).toBe(true);
  });

  it('normalizes inch and metre files to the SAME mm soup (OCCT unit conversion, pinned)', () => {
    const mm = stepMeshesToSoup(readStep('cube-units/cube-mm.step')).positions;
    const inch = stepMeshesToSoup(readStep('cube-units/cube-in.step')).positions;
    const metre = stepMeshesToSoup(readStep('cube-units/cube-m.step')).positions;
    // the fixture trio is one cube authored in its file's declared unit —
    // byte-identical after conversion is the whole guarantee
    expect([...inch]).toEqual([...mm]);
    expect([...metre]).toEqual([...mm]);
  });

  it('curved surfaces tessellate to more than the flat-cube 12 triangles', () => {
    const soup = stepMeshesToSoup(readStep('rounded-cube/rounded-cube.step'));
    expect(soup.triangles).toBeGreaterThan(12);
    expect(soup.positions.length).toBe(soup.triangles * 9);
  });

  it('concatenates an 18-mesh assembly into one soup (single model slot)', () => {
    const raw = readStep('cax-if/as1-oc-214.stp');
    const soup = stepMeshesToSoup(raw);
    const expected = raw.meshes!.reduce((s, m) => s + Math.floor(m.index!.array.length / 3), 0);
    expect(soup.triangles).toBe(expected);
    expect(expected).toBeGreaterThan(300); // really an assembly, not one part
  });

  it('throws the honest message on a failed read', () => {
    // the package's own non-STEP text parses to success=false
    expect(() => stepMeshesToSoup(readStep('cax-if/source.txt'))).toThrow(/did not parse/);
    expect(() => stepMeshesToSoup({ success: false })).toThrow(/did not parse/);
  });

  it('a success with no meshes is an empty soup, not a crash', () => {
    const soup = stepMeshesToSoup({ success: true, meshes: [] });
    expect(soup.triangles).toBe(0);
    expect(soup.positions.length).toBe(0);
  });
});

describe('encodeBinaryStl (job-save round-trip)', () => {
  it('round-trips through the REAL STLLoader — what a saved job re-parses', () => {
    const soup = stepMeshesToSoup(readStep('cube-units/cube-mm.step'));
    const bytes = encodeBinaryStl(soup);
    expect(bytes.length).toBe(84 + 12 * 50);
    const geo = new STLLoader().parse(bytes.buffer as ArrayBuffer);
    expect(geo.getAttribute('position').count).toBe(36); // 12 triangles, non-indexed
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    expect(bb.min.x).toBeCloseTo(0, 3);
    expect(bb.max.x).toBeCloseTo(1000, 3);
    expect(bb.max.z).toBeCloseTo(1000, 3);
    expect(geo.getAttribute('normal')).toBeTruthy(); // the job's normals survive too
  });
});