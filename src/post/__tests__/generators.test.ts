import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postCarvera } from '../carvera';
import { drill } from '../../cam/drill';
import { pocket2d } from '../../cam/pocket';
import { profile2d } from '../../cam/profile';
import type { DrillOp, PocketOp, ProfileOp, Tool, Vec2 } from '../../core/types';

const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const drillTool: Tool = { id: 't2', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };

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

describe('generator post goldens', () => {
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
});