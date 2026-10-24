/**
 * Time-estimate comparison for the feed-matrix coupon: emits the real .nc
 * (exactly as the app's export does), then runs (a) our estimator
 * (Σ per-op estimatedMinutes), (b) the community controller's algorithm
 * (per-segment XYZ length ÷ F-word-as-mm/min, rapids at 3000 mm/min, A
 * invisible), and (c) a G93-aware "expected truth" (cutting moves at
 * 1/F in G93 / length÷feed in G94, linear rapids at 3000, A-only rapid
 * time reported separately at a few candidate A rapid rates).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJobFile } from '../src/ui/jobFile';
import { generateJobOp } from '../src/ui/jobGeneration';
import { postCarvera } from '../src/post/carvera';
import type { Move } from '../src/core/types';

const root = import.meta.dirname;
const parsed = parseJobFile(readFileSync(join(root, '..', 'jobs', 'coupon-delrin-feed-matrix.cam.json'), 'utf8'));
const ctx = {
  stock: parsed.stock,
  geometry: null,
  features: null,
  transform: parsed.transform,
  tools: parsed.tools,
  primitives: [],
  sources: [] as never[],
  datumAngle: 0,
  startA: 0,
};

let datum = 0;
let a = 0;
let prevRpm: number | undefined;
const moves: Move[] = [];
let ours = 0; // Σ estimatedMinutes
for (const op of parsed.ops) {
  const res = generateJobOp(op, { ...ctx, datumAngle: datum, startA: a, prevRpm });
  if (res.error) throw new Error(`${op.id}: ${res.error}`);
  moves.push(...res.moves);
  ours += res.minutes;
  a = res.finalA;
  prevRpm = res.spindleRpm ?? prevRpm;
  if (op.kind === 'index') datum = op.angle;
}
const nc = postCarvera({ moves, tools: parsed.tools });
writeFileSync('/tmp/coupon-feed-matrix.nc', nc);

// ---- simulate the community controller's estimator on the .nc text ----
const lines = nc.split('\n');
let mode: 'G0' | 'G1' = 'G0';
let g93 = false;
let f = 0;
const pos = { x: 0, y: 0, z: 0, a: 0 };
const first: Record<string, number> = {};
let controllerSec = 0;
let truthSec = 0;
let truthARapidSec = 0;
const controllerByKind: Record<string, number> = {};
const truthByKind: Record<string, number> = {};
for (const line of lines) {
  const code = line.split(';')[0].trim();
  if (!code) continue;
  if (/^G93\b/.test(code)) { g93 = true; continue; }
  if (/^G94\b/.test(code)) { g93 = false; continue; }
  if (/^G92\.4\b/.test(code)) {
    // coordinate reset, no motion — rebase A without counting travel
    const ra = /A(-?[\d.]+)/.exec(code)?.[1];
    if (ra !== undefined) pos.a = parseFloat(ra);
    continue;
  }
  const m = /^G([01])\b/.exec(code);
  if (!m) continue;
  mode = (`G${m[1]}` as 'G0' | 'G1');
  const w = {
    x: /X(-?[\d.]+)/.exec(code)?.[1],
    y: /Y(-?[\d.]+)/.exec(code)?.[1],
    z: /Z(-?[\d.]+)/.exec(code)?.[1],
    a: /A(-?[\d.]+)/.exec(code)?.[1],
    f: /F([\d.]+)/.exec(code)?.[1],
  };
  if (w.f !== undefined) f = parseFloat(w.f);
  const nx = w.x !== undefined ? parseFloat(w.x) : pos.x;
  const ny = w.y !== undefined ? parseFloat(w.y) : pos.y;
  const nz = w.z !== undefined ? parseFloat(w.z) : pos.z;
  const na = w.a !== undefined ? parseFloat(w.a) : pos.a;
  const xyz = Math.hypot(nx - pos.x, ny - pos.y, nz - pos.z);
  const dA = Math.abs(na - pos.a);
  // controller: length ÷ feed (F as mm/min); rapid (feed<0.001) → 3000
  const ctlFeed = mode === 'G1' && f >= 0.001 ? f : 3000;
  const ctl = (xyz * 60) / ctlFeed;
  controllerSec += ctl;
  // truth: G93 cutting = 1/F minutes; G94 = xyz ÷ F; G0 linear at 3000 (A separately)
  let t: number;
  if (mode === 'G0') {
    t = (xyz * 60) / 3000;
    truthARapidSec += dA; // degrees to cover at the machine's A rapid rate
  } else if (g93) {
    t = f > 0 ? 60 / f : 0;
  } else {
    t = f > 0 ? (xyz * 60) / f : 0;
  }
  truthSec += t;
  const kind = mode === 'G0' ? 'rapid' : g93 ? 'g93-cut' : 'g94-cut';
  controllerByKind[kind] = (controllerByKind[kind] ?? 0) + ctl;
  truthByKind[kind] = (truthByKind[kind] ?? 0) + t;
  if (!(kind in first)) first[kind] = t;
  pos.x = nx; pos.y = ny; pos.z = nz; pos.a = na;
}

const fmtMin = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
console.log('=== our estimate (Σ per-op minutes):', fmtMin(ours * 60));
console.log('=== controller estimate (its algorithm):', fmtMin(controllerSec));
console.log('  by kind:', controllerByKind);
console.log('=== expected truth (G93-aware):', fmtMin(truthSec));
console.log('  by kind:', truthByKind);
console.log('  plus A-only rapid degrees to cover:', truthARapidSec.toFixed(0), '° →',
  ['3000°/min', '2000°/min', '1000°/min'].map(r =>
    `${r}: ${fmtMin(truthARapidSec / parseInt(r))}`).join(', '));
console.log('  sample first-of-kind truth secs:', first);
console.log('=== g93 F words seen (first 10):');
console.log(nc.split('\n').filter(l => /G1 .*F/.test(l) && g93 !== undefined).slice(0, 0));
const g93F = new Set<string>();
let in93 = false;
for (const l of lines) {
  const c = l.split(';')[0];
  if (/^G93\b/.test(c)) in93 = true;
  if (/^G94\b/.test(c)) in93 = false;
  if (in93 && /^G1\b/.test(c)) g93F.add(/F([\d.]+)/.exec(c)?.[1] ?? '');
}
console.log([...g93F].slice(0, 12).join(' | '));