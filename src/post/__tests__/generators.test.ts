import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postCarvera } from '../carvera';
import { chamfer } from '../../cam/chamfer';
import { drill } from '../../cam/drill';
import { faceCylinder } from '../../cam/faceCylinder';
import { pocket2d } from '../../cam/pocket';
import { profile2d } from '../../cam/profile';
import { engrave } from '../../cam/engrave';
import type { ChamferOp, DrillOp, PocketOp, ProfileOp, Tool, Vec2 } from '../../core/types';

const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const drillTool: Tool = { id: 't2', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };
const chamferTool: Tool = {
  id: 't3',
  name: 'Chamfering Bit 1/8',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 90,
  tipDiameter: 0.1,
  spindleRpm: 12000,
};

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const pocketOp: PocketOp = {
  kind: 'pocket',
  id: 'op1',
  toolId: 't1',
  regions: [square],
  topZ: 0,
  floorZ: -1,
  stepDown: 1,
  stepOver: 1,
  feed: 500,
  plungeFeed: 200,
  safeClearance: 5,
};

const drillOp: DrillOp = {
  kind: 'drill',
  id: 'op2',
  toolId: 't2',
  targets: [
    { x: 5, y: 5, topZ: 0, depth: 5 },
    { x: 25, y: 5, topZ: 0, depth: 3 },
  ],
  peckDepth: 2,
  plungeFeed: 300,
  safeClearance: 5,
};

const profileOp: ProfileOp = {
  kind: 'profile',
  id: 'op3',
  toolId: 't1',
  contours: [square],
  side: 'outside',
  allowance: 0,
  topZ: 0,
  floorZ: -2,
  stepDown: 1,
  feed: 500,
  plungeFeed: 200,
  safeClearance: 5,
};

const stripDate = (s: string) => s.split('\n').filter((l) => !l.startsWith('; generated')).join('\n');

function checkGolden(name: string, gcode: string) {
  it(`matches the golden file for ${name} (regenerate deliberately with UPDATE_GOLDEN=1)`, () => {
    const goldenPath = join(import.meta.dirname, 'golden', name);
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(goldenPath, stripDate(gcode));
      return; // golden written; review the diff before committing
    }
    expect(existsSync(goldenPath), 'golden missing — run UPDATE_GOLDEN=1 npx vitest run once').toBe(true);
    expect(stripDate(gcode)).toBe(stripDate(readFileSync(goldenPath, 'utf8')));
  });
}

const laserTool: Tool = {
  id: 'l1',
  name: 'Laser Module',
  type: 'laser',
  diameter: 0.1, // spot
  spindleRpm: 20, // the power% slot (documented reuse)
  focus: 1.5,
};

// the mill-tested Makera sequence (examples/lengrave_TOP): M321, focus
// rapid, M3 (after the rapid), S per path start, S0 between paths and
// at the end, M05/M322 tails — no T M6, no TOOL header
const laserMoves = engrave({
  id: 'opL',
  toolId: 'l1',
  paths: [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    [{ x: 0, y: 5 }, { x: 10, y: 5 }],
  ],
  depth: 0.5, // ignored by the laser variant
  stepDown: 0.25,
  feed: 100, // Makera's own aluminum vector-engrave feed
  plungeFeed: 50,
  clearance: 5,
  frame: { kind: 'flat', surfaceZ: 0 },
  laser: { focus: 1.5, power: 0.2 }, // the example's S0.2
}).moves.map((m, i) =>
  i === 0 ? { ...m, op: { number: 1, name: 'Laser Vector', toolNumber: 1 } } : m,
);

describe('generator post goldens', () => {
  checkGolden(
    'engrave-laser.nc',
    postCarvera({
      moves: laserMoves,
      tools: [laserTool],
      options: { jobName: 'engrave-laser' },
    }),
  );


  checkGolden(
    'pocket-square.nc',
    postCarvera({
      moves: pocket2d(pocketOp, tool).moves,
      tools: [tool],
      options: { jobName: 'pocket-square' },
    }),
  );

  checkGolden(
    'drill-holes.nc',
    postCarvera({
      moves: drill(drillOp, drillTool).moves,
      tools: [drillTool],
      options: { jobName: 'drill-holes' },
    }),
  );

  checkGolden(
    'profile-square.nc',
    postCarvera({
      moves: profile2d(profileOp, tool).moves,
      tools: [tool],
      options: { jobName: 'profile-square' },
    }),
  );

  // indexed drill: one rapid A positioning move, then flat drilling
  const indexMove = {
    words: { a: 90 },
    feed: 0,
    rapid: true,
    comment: 'index stock to A90°',
  };
  checkGolden(
    'drill-indexed.nc',
    postCarvera({
      moves: [indexMove, ...drill(drillOp, drillTool).moves],
      tools: [drillTool],
      options: { jobName: 'drill-indexed' },
    }),
  );

  // spiral facing: step-downs in the cut, no safe-Z retracts between passes
  const spiralFaceOp = {
    kind: 'faceCylinder',
    id: 'op4',
    toolId: 't1',
    targetDiameter: 40,
    xStart: 0,
    xEnd: 100,
    stepDown: 1,
    stepOver: 1.6, // 0.8·Ø — pins the pre-setting behavior of face-spiral.nc
    finishAllowance: 0.2,
    plungeFeed: 300,
    rotation: 'cw',
    pattern: 'spiral',
    feed: 600,
  } as const;
  const faceStock = {
    kind: 'cylinder',
    length: 100,
    xOrigin: 'min',
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
    axisMode: '4-axis',
    materialId: 'aluminum-6061',
  } as const;
  checkGolden(
    'face-spiral.nc',
    postCarvera({
      moves: faceCylinder(spiralFaceOp, faceStock.calibration, tool).moves,
      tools: [tool],
      options: { jobName: 'face-spiral' },
    }),
  );

  // vertical facing: one straight plunge per level plus full-revolution
  // A-only cuts, which the post classifies G94 and runs at deg/min, with
  // in-cut X steps between rings
  const ringFaceOp = {
    kind: 'faceCylinder',
    id: 'op5',
    toolId: 't1',
    targetDiameter: 40,
    xStart: 0,
    xEnd: 12,
    stepDown: 2,
    stepOver: 1.6, // 0.8·Ø
    finishAllowance: 0.2,
    plungeFeed: 300,
    rotation: 'cw',
    pattern: 'vertical',
    feed: 600,
  } as const;
  checkGolden(
    'face-vertical.nc',
    postCarvera({
      moves: faceCylinder(ringFaceOp, faceStock.calibration, tool).moves,
      tools: [tool],
      options: { jobName: 'face-cylinder' },
    }),
  );

  // two face ops back to back: the second CONTINUES from the first's final
  // A (cross-op threading). Before this, every op restarted at absolute 0 —
  // the machine unwound the entire accumulated pile between ops, winding
  // round and round. The golden pins the continuation.
  const faceA = faceCylinder(spiralFaceOp, faceStock.calibration, tool);
  const finalA = [...faceA.moves].reverse().find((m) => m.words.a !== undefined)!.words.a!;
  const faceB = faceCylinder(
    { ...spiralFaceOp, id: 'op4b' },
    faceStock.calibration,
    tool,
    finalA,
  );
  checkGolden(
    'face-pair.nc',
    postCarvera({
      moves: [...faceA.moves, ...faceB.moves],
      tools: [tool],
      options: { jobName: 'face-pair' },
    }),
  );

  // V-bit chamfer on one hole rim: auto side (material outside the loop →
  // tool rides inside it), tip 0.5mm below the anchor plane, one closed pass
  const chamferOp: ChamferOp = {
    kind: 'chamfer',
    id: 'op6',
    toolId: 't3',
    loops: [
      { kind: 'circle', center: { x: 5, y: 5 }, radius: 2, z: 0, materialOutside: true },
    ],
    mode: 'add',
    side: 'auto',
    direction: 'down',
    depth: 0.5,
    feed: 600,
    plungeFeed: 200,
    safeClearance: 5,
  };
  checkGolden(
    'chamfer-rim.nc',
    postCarvera({
      moves: chamfer(chamferOp, chamferTool).moves,
      tools: [chamferTool],
      options: { jobName: 'chamfer-rim' },
    }),
  );
});