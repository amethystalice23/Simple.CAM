import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { movesToPoses, type Pose } from '../poses';
import { emptyStats, type CarveStats } from '../carve';
import { ghostMeshChunk } from '../mesher';
import {
  createLaserState,
  GHOST_BURN,
  laserBeamOf,
  laserMarkPose,
} from '../laser';
import type { Move, Stock, Tool } from '../../core/types';

const boxStock = (size = 10, pitch = 1): { stock: Stock; grid: VoxelGrid } => {
  const stock: Stock = {
    kind: 'box',
    sizeX: size,
    sizeY: size,
    sizeZ: size,
    origin: { x: 'min', y: 'min', z: 'min' },
    axisMode: '3-axis',
    materialId: 'test',
  };
  return { stock, grid: new VoxelGrid(stock, pitch) };
};

const laserTool = (diameter = 0.5): Tool => ({
  id: 'lz',
  name: 'laser 2.5W',
  type: 'laser',
  diameter,
  spindleRpm: 100,
});

const countFilled = (g: VoxelGrid): number => {
  let n = 0;
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (g.filled(i, j, k)) n++;
  return n;
};

const countBurned = (g: VoxelGrid): number => {
  let n = 0;
  for (let c = 0; c < g.ghost.length; c++) if (g.ghost[c] === GHOST_BURN) n++;
  return n;
};

/** the worker's routing, mirrored: every pose of the stream goes to the
 *  laser marker (beam on/off and the modal S live inside it) */
const runLaserStream = (
  grid: VoxelGrid,
  laser: Tool,
  moves: Move[],
  poses: Pose[],
  stats: CarveStats,
): void => {
  const beam = laserBeamOf(laser);
  if (beam === null) throw new Error('test tool is not a laser');
  const state = createLaserState();
  for (const p of poses) laserMarkPose(grid, beam, moves[p.moveIndex], p, state, stats);
};

describe('laserBeamOf', () => {
  it('beam disc = tipDiameter ?? diameter, halved; null for cutters', () => {
    expect(laserBeamOf(laserTool(0.5))).toEqual({ radius: 0.25 });
    expect(
      laserBeamOf({ ...laserTool(2), tipDiameter: 0.1 }),
    ).toEqual({ radius: 0.05 });
    expect(
      laserBeamOf({ id: 'f', name: 'flat', type: 'flat', diameter: 6, spindleRpm: 1 }),
    ).toBeNull();
  });
});

describe('modal power (the sparse-Move trap)', () => {
  // engraveLaser's stamp shape: power on each path's FIRST cut, bare
  // { power: 0 } extinguish-travels, nothing on the moves between
  const moves: Move[] = [
    { words: { x: 1, y: 2.5, z: 12 }, feed: 0, rapid: true }, // travel, beam never armed
    { words: { x: 2, y: 2.5 }, feed: 500, power: 0.8 }, // path 1 seg 1 — STAMP
    { words: { x: 4, y: 2.5 }, feed: 500 }, // seg 2 — inherits modal 0.8
    { words: {}, feed: 500, power: 0 }, // extinguish
    { words: { x: 1, y: 6.5 }, feed: 0, rapid: true }, // travel — beam OFF
    { words: { x: 2, y: 6.5 }, feed: 500, power: 0.8 }, // path 2 seg 1 — re-STAMP
    { words: { x: 4, y: 6.5 }, feed: 500 }, // seg 2 — inherits
    { words: {}, feed: 500, power: 0 }, // final extinguish
  ];

  it('a first-segment stamp marks the WHOLE path; power-0 travel stays clean; the next path re-stamps', () => {
    const { stock, grid } = boxStock(10, 1);
    const poses = movesToPoses(moves, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(), moves, poses, s);

    // path 1 trace: row j=2 (centers y=2.5 under the beam line), cells
    // i=1..4 — i=3,4 are marked by move 2's poses whose Move carries NO
    // power word: modal inheritance, not the dotted-first-segment bug
    for (const i of [1, 2, 3, 4]) {
      expect(grid.ghost[i + grid.nx * (2 + grid.ny * 9)]).toBe(GHOST_BURN);
    }
    // outside the beam's footprint: unmarked
    expect(grid.ghost[0 + grid.nx * (2 + grid.ny * 9)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (2 + grid.ny * 9)]).toBe(0);
    // the travel (move 4) passes EXACTLY through cell center (2.5, 4.5) —
    // it must leave nothing: the beam was extinguished before it
    expect(grid.ghost[2 + grid.nx * (4 + grid.ny * 9)]).toBe(0);
    // path 2 re-stamps: its own row j=6 traces i=1..4
    for (const i of [1, 2, 3, 4]) {
      expect(grid.ghost[i + grid.nx * (6 + grid.ny * 9)]).toBe(GHOST_BURN);
    }
    // honesty: 4 distinct CUT moves marked (1,2,5,6) — not 8 paths' worth
    // of poses, not 0 skipped
    expect(s.laserMarked).toBe(4);
    expect(s.laserSkipped).toBe(0);
    // marking removes nothing
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(1000);
    // 8 cells burned total
    expect(countBurned(grid)).toBe(8);
  });

  it('a power word on a RAPID never fires the beam (G0 contract)', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves2: Move[] = [
      { words: { x: 4.5, y: 4.5, z: 12 }, feed: 0, rapid: true, power: 0.8 },
      { words: { x: 5.5, y: 4.5 }, feed: 100, power: 0.8 },
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(), moves2, poses, s);
    expect(s.laserMarked).toBe(1); // only the feed move
    expect(countBurned(grid)).toBeGreaterThan(0);
  });
});

describe('footprint (the beam disc marks top standing voxels)', () => {
  it('cells whose centers sit within the beam disc blacken their top voxel; nothing below; nothing removed', () => {
    const { stock, grid } = boxStock(10, 1);
    // Ø2.8 beam (r 1.4, +half-pitch grace → 1.9): tip dead on a cell center
    // → 3×3 columns of top-layer voxels
    const moves2: Move[] = [
      { words: { x: 4.5, y: 4.5, z: 12 }, feed: 0, rapid: true },
      { words: { x: 4.5, y: 4.5 }, feed: 100, power: 1 },
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(2.8), moves2, poses, s);

    for (let j = 3; j <= 5; j++)
      for (let i = 3; i <= 5; i++) {
        expect(grid.ghost[i + grid.nx * (j + grid.ny * 9)]).toBe(GHOST_BURN);
      }
    // disc edge and depth stay clean
    expect(grid.ghost[2 + grid.nx * (4 + grid.ny * 9)]).toBe(0);
    expect(grid.ghost[6 + grid.nx * (6 + grid.ny * 9)]).toBe(0);
    expect(grid.ghost[4 + grid.nx * (4 + grid.ny * 8)]).toBe(0);
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(1000);
    expect(countBurned(grid)).toBe(9);
    expect(s.laserMarked).toBe(1);
  });

  it('a sub-pitch beam marks exactly one voxel', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves2: Move[] = [
      { words: { x: 4.5, y: 4.5, z: 12 }, feed: 0, rapid: true },
      { words: { x: 4.5, y: 4.5 }, feed: 100, power: 1 },
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(0.5), moves2, poses, s);
    expect(countBurned(grid)).toBe(1);
    expect(grid.ghost[4 + grid.nx * (4 + grid.ny * 9)]).toBe(GHOST_BURN);
  });

  it('the beam hits whatever surface is there: a pre-carved pocket burns its FLOOR', () => {
    const { stock, grid } = boxStock(10, 1);
    // pocket the center column down two voxels
    grid.set(4, 4, 9, 0);
    grid.onCarved(4, 4, 9);
    grid.set(4, 4, 8, 0);
    grid.onCarved(4, 4, 8);
    expect(grid.columnTop[4 * grid.nx + 4]).toBe(7);
    const moves2: Move[] = [
      { words: { x: 4.5, y: 4.5, z: 12 }, feed: 0, rapid: true },
      { words: { x: 4.5, y: 4.5 }, feed: 100, power: 1 },
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(0.5), moves2, poses, s);
    // the pocket floor burns, not the (now void) old surface
    expect(grid.ghost[4 + grid.nx * (4 + grid.ny * 7)]).toBe(GHOST_BURN);
    expect(grid.ghost[4 + grid.nx * (4 + grid.ny * 9)]).toBe(0);
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(998);
  });

  it('wrapped + flat ride the same machinery: a 4-axis cylinder burn lands on column tops', () => {
    const stock: Stock = {
      kind: 'cylinder',
      length: 10,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 6, effectiveRadius: 6 },
      axisMode: '4-axis',
      materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    const filled0 = countFilled(grid);
    // crown at A=0 is y=−6, z=6; the head rides focus 1 above (z=7), the
    // beam fires straight down as the stock rotates
    const moves2: Move[] = [
      { words: { x: 5, y: -6, z: 7, a: 0 }, feed: 0, rapid: true },
      { words: { x: 6 }, feed: 100, power: 0.8 },
      { words: {}, feed: 100, power: 0 },
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(2.8), moves2, poses, s);

    expect(s.laserMarked).toBe(1);
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(filled0);
    expect(countBurned(grid)).toBeGreaterThan(0);
    // EVERY burn sits on its column's top standing voxel (the surface the
    // beam meets), never below
    for (let k = 0; k < grid.nz; k++)
      for (let j = 0; j < grid.ny; j++)
        for (let i = 0; i < grid.nx; i++) {
          if (grid.ghost[i + grid.nx * (j + grid.ny * k)] !== GHOST_BURN) continue;
          expect(k).toBe(grid.columnTop[j * grid.nx + i]);
        }
    // spot-check the crown columns under the pass (y-center −5.5 and −4.5)
    expect(grid.ghost[5 + grid.nx * (0 + grid.ny * grid.columnTop[0 * grid.nx + 5])]).toBe(GHOST_BURN);
    expect(grid.ghost[5 + grid.nx * (0 + grid.ny * (grid.columnTop[0 * grid.nx + 5] - 1))]).toBe(0);
  });

  it('the beam over air marks nothing', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves2: Move[] = [
      { words: { x: 2, y: 20, z: 12 }, feed: 0, rapid: true }, // beside the stock
      { words: { x: 50, y: 20 }, feed: 100, power: 1 }, // stays off it
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    const s = emptyStats();
    runLaserStream(grid, laserTool(), moves2, poses, s);
    expect(s.laserMarked).toBe(0);
    expect(countBurned(grid)).toBe(0);
  });
});

describe('stat honesty', () => {
  it('one move subdivided into many poses counts ONCE in laserMarked', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves2: Move[] = [
      { words: { x: 1, y: 2.5, z: 12 }, feed: 0, rapid: true },
      { words: { x: 8, y: 2.5 }, feed: 500, power: 0.8 }, // 14 poses at pitch/2
    ];
    const poses = movesToPoses(moves2, stock, () => 0, 1);
    expect(poses.filter((p) => p.moveIndex === 1).length).toBeGreaterThan(5);
    const s = emptyStats();
    runLaserStream(grid, laserTool(), moves2, poses, s);
    expect(s.laserMarked).toBe(1);
    expect(countBurned(grid)).toBe(8); // columns i=1..8 of row j=2 (the sweep endpoints graze i=1 and i=8)
  });
});

describe('mesher renders the burn', () => {
  it('a burned voxel draws its void-exposed faces while it stands, and drops them when carved away', () => {
    const { grid } = boxStock(4, 1);
    const idx = 1 + grid.nx * (1 + grid.ny * 3); // top layer, interior column
    grid.ghost[idx] = GHOST_BURN;
    // interior top voxel: only its +Z face is void-exposed → 1 quad
    const geom = ghostMeshChunk(grid, 0);
    expect(geom.indices.length).toBe(6);
    // carve the voxel away: the mark goes with the material
    grid.set(1, 1, 3, 0);
    grid.onCarved(1, 1, 3);
    const gone = ghostMeshChunk(grid, 0);
    expect(gone.indices.length).toBe(0);
  });
});
