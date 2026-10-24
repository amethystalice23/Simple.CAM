import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobFile } from '../src/ui/jobFile';
import { generateJobOp } from '../src/ui/jobGeneration';

const parsed = parseJobFile(readFileSync(join(import.meta.dirname, '..', 'jobs', 'coupon-delrin-feed-matrix.cam.json'), 'utf8'));
const ctx: object = {
  stock: parsed.stock, geometry: null, features: null, transform: parsed.transform,
  tools: parsed.tools, primitives: [], sources: [], datumAngle: 0, startA: 0,
};
let prev: number | undefined;
let total = 0;
for (const op of parsed.ops) {
  const res = generateJobOp(op, { ...ctx, prevRpm: prev });
  prev = res.spindleRpm;
  total += res.minutes;
  console.log(op.id.padEnd(16), res.minutes.toFixed(2).padStart(6), 'min —', (res.summary ?? '').slice(0, 100));
}
console.log('TOTAL', total.toFixed(1), 'min');