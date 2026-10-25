/**
 * Throwaway kernel-level raster timing on the REAL coin STL — the same
 * call generateJobOp makes, no browser. Confirms whether rasterContour on
 * OBJECT+coin.stl is fast (blame the browser) or slow (a real perf issue
 * for the Web Worker charter).
 */
import { readFileSync } from 'node:fs';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { rasterContour } from '../src/cam/relief';
import { transformedPositions } from '../src/cam/slicing';
import { identityTransform } from '../src/core/types';
import { BUILT_IN_TOOLS } from '../src/core/builtInTools';
import type { Tool } from '../src/core/types';

const bytes = readFileSync('/home/alice/reprap/3D Printing/OBJECT+coin.stl');
const geo = new STLLoader().parse(bytes.buffer as ArrayBuffer);
const positions = transformedPositions(geo, identityTransform());
console.log('triangles:', positions.length / 9);
let mnZ = Infinity, mxZ = -Infinity, mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
for (let i = 0; i < positions.length; i += 3) {
  if (positions[i] < mnX) mnX = positions[i];
  if (positions[i] > mxX) mxX = positions[i];
  if (positions[i+1] < mnY) mnY = positions[i+1];
  if (positions[i+1] > mxY) mxY = positions[i+1];
  if (positions[i+2] < mnZ) mnZ = positions[i+2];
  if (positions[i+2] > mxZ) mxZ = positions[i+2];
}
console.log(`bbox x ${mnX.toFixed(2)}..${mxX.toFixed(2)} y ${mnY.toFixed(2)}..${mxY.toFixed(2)} z ${mnZ.toFixed(2)}..${mxZ.toFixed(2)}`);

// a Ø6 flat from the built-in library (the smoke test's default tool class)
const tool: Tool = BUILT_IN_TOOLS.find((t: Tool) => t.type === 'flat' && t.diameter === 6)!;
const stepOver = 3; // defaultStepOver(Ø6) = 3
const t0 = performance.now();
const res = rasterContour({
  positions,
  pitch: stepOver / 2,
  stepOver,
  allowance: 0,
  topZ: 2.5, // crown just above the coin top (z 2.46)
  bottomZ: 0,
  tool,
  feed: 300,
  plungeFeed: 150,
  safeClearance: 5,
});
console.log(`rasterContour: ${(performance.now() - t0) / 1000}s`);
console.log('rows:', res.rows, 'moves:', res.moves.length, 'minutes:', res.estimatedMinutes.toFixed(1));
console.log('warnings:', res.warnings);
