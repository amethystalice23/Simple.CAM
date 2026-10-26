import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { buildToolSpec } from '../toolShape';
import { movesToPoses } from '../poses';
import { carvePoses, emptyStats } from '../carve';
import type { CarveStats } from '../carve';
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

const flatTool: Tool = {
  id: 'f6',
  name: 'flat 6',
  type: 'flat',
  diameter: 6,
  fluteLength: 30,
  spindleRpm: 18000,
};

const stats0 = (): CarveStats => emptyStats();

/** count remaining material cells */
const countFilled = (g: VoxelGrid): number => {
  let n = 0;
  for (let k = 0; k < g.nz; k++)
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (g.filled(i, j, k)) n++;
  return n;
};

describe('carvePoses', () => {
  it('flat Ø6 plunge at (5,5): removes exactly the cells whose centers are within ρ ≤ 3', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves: Move[] = [
      { words: { x: 5, y: 5, z: 9 }, feed: 100 }, // position above
      { words: { z: 0 }, feed: 50 }, // plunge through the top
    ];
    const poses = movesToPoses(moves, stock, () => 0, 1);
    const stats = stats0();
    carvePoses(grid, [buildToolSpec(flatTool)], poses, stats);

    // expected: cells with center (i+0.5−5, j+0.5−5) within 3, k = 0..9
    let expectRemoved = 0;
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 10; i++) {
        const dx = i + 0.5 - 5;
        const dy = j + 0.5 - 5;
        if (dx * dx + dy * dy <= 9) expectRemoved += 10;
      }
    expect(stats.removed).toBe(expectRemoved);
    expect(stats.removed).toBe(320); // 32 columns × 10 deep — the π·9 ≈ 28 lattice fixture
    expect(stats.gouges).toBe(0);
    // fluteLen 30 ≥ grid, so the full column is carved: remaining = 1000 − 320
    expect(countFilled(grid)).toBe(1000 - 320);
    // pocket floor: carved columns' tops are −1
    expect(grid.columnTop[5 * grid.nx + 5]).toBe(-1);
    // a chunk went dirty
    expect(grid.chunkDirty[0]).toBe(1);
  });

  it('ball sweep leaves a hemispherical floor (probe kept/removed cells)', () => {
    const { grid } = boxStock(20, 1);
    const ball: Tool = { ...flatTool, type: 'ball', diameter: 10, fluteLength: 20 };
    // single pose: ball tip at (10,10,5) — Ø10 ball centered so the equator
    // is at z = 5 + 5 = 10
    const poses = [
      { x: 10, y: 10, z: 5, ax: 0, ay: 0, az: -1, tool: 0, moveIndex: 0, rapid: false },
    ];
    const stats = stats0();
    carvePoses(grid, [buildToolSpec(ball)], poses, stats);

    // directly under the tip (dx=dy=0): carved from top (k=19) down to the
    // pole at z=5 → k ≥ 5 removed; k=4 kept (center z=4.5 < 5)
    expect(grid.filled(9, 9, 19)).toBe(false);
    expect(grid.filled(9, 9, 5)).toBe(false);
    expect(grid.filled(9, 9, 4)).toBe(true);
    // probe cell (11, 9): center (11.5, 9.5), ρ² = 1.5² + 0.5² = 2.5 →
    // ball floor z = 10 − √(25 − 2.5) = 5.2566 → removed k ≥ 5 (center 5.5),
    // kept k ≤ 4 (center 4.5)
    const floorZ = 10 - Math.sqrt(25 - 2.5);
    const kFloor = Math.ceil(floorZ - 0.5); // first removed k = 5
    expect(grid.filled(9 + 2, 9, 19)).toBe(false);
    expect(grid.filled(9 + 2, 9, kFloor)).toBe(false);
    expect(grid.filled(9 + 2, 9, kFloor - 1)).toBe(true);
    // outside the ball radius nothing touched
    expect(grid.filled(2, 2, 19)).toBe(true);
  });

  it('rapid fully above the surface removes 0; intersecting rapid raises the gouge stat', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const high: Parameters<typeof carvePoses>[2] = [
      { x: 5, y: 5, z: 12, ax: 0, ay: 0, az: -1, tool: 0, moveIndex: 3, rapid: true },
    ];
    const s1 = stats0();
    carvePoses(grid, [spec], high, s1);
    expect(s1.removed).toBe(0);
    expect(s1.gouges).toBe(0);
    expect(s1.firstGougeMove).toBeNull();

    // flat tool flute ceiling at 30: tip at z = 8 cuts k = 8, 9 (centers 8.5,
    // 9.5 ≤ 8+flute). tip z=8 → zl up to 30 → carves where inside: zl for
    // k=9: 9.5−8 = 1.5 ≤ 30, ρ² ≤ 9 → yes → removes
    const goug: Parameters<typeof carvePoses>[2] = [
      { x: 5, y: 5, z: 8, ax: 0, ay: 0, az: -1, tool: 0, moveIndex: 7, rapid: true },
    ];
    const s2 = stats0();
    carvePoses(grid, [spec], goug, s2);
    expect(s2.removed).toBeGreaterThan(0);
    expect(s2.gouges).toBe(1);
    expect(s2.firstGougeMove).toBe(7);
  });

  it('air-skip: a pose over an already-cleared pocket removes nothing', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // clear the whole grid first
    grid.occ.fill(0);
    for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) grid.columnTop[j * grid.nx + i] = -1;
    const poses: Parameters<typeof carvePoses>[2] = [
      { x: 5, y: 5, z: 1, ax: 0, ay: 0, az: -1, tool: 0, moveIndex: 0, rapid: false },
    ];
    const s = stats0();
    carvePoses(grid, [spec], poses, s);
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(0);
  });

  it('laser/none spec (null) skips poses and counts each move once', () => {
    const { stock, grid } = boxStock(10, 1);
    const moves: Move[] = [
      { words: { x: 5, y: 5, z: 9 }, feed: 100 },
      { words: { z: 0 }, feed: 50 },
    ];
    const poses = movesToPoses(moves, stock, () => 3, 1);
    const s = stats0();
    carvePoses(grid, [null], poses, s); // index 0 of specs — but tool=3 → specs[3] undefined → null
    expect(s.laserSkipped).toBe(1); // one distinct move, not 2 poses
    expect(s.removed).toBe(0);
    expect(countFilled(grid)).toBe(1000);
  });

  it('4-axis facing ring: A-only feed move carves a ring into a 4-axis cylinder grid', () => {
    const stock: Stock = {
      kind: 'cylinder',
      length: 10,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 6, effectiveRadius: 6 },
      axisMode: '4-axis',
      materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    const moves: Move[] = [
      { words: { x: 5, y: -6, z: 6, a: 0 }, feed: 100 }, // tool tip on the surface at y=−r
      { words: { a: 360 }, feed: 360 * 6.6 }, // one full revolution
    ];
    const poses = movesToPoses(moves, stock, () => 0, 1);
    const s = stats0();
    carvePoses(grid, [buildToolSpec({ ...flatTool, diameter: 4 })], poses, s);
    expect(s.removed).toBeGreaterThan(0);
    // The sweep carves the annulus within tool radius (2mm) of the stock-
    // frame ring: circle radius 6 about (y=0, z=6) — cells whose center
    // sits 4..8 from that center get cut (fluteLen 30 covers the depth).
    // Cell (5, 0, 7): center (wx=5.5, wy=−5.5, wz=7.5) — 5.70 from the ring
    // center, inside the stock circle (≤ 6) and inside the annulus → carved
    expect(grid.filled(5, 0, 7)).toBe(false);
    // Cells near the rotation axis (y=0, z=6) stay: (5, 5, 5) and (5, 5, 6)
    // centers (wy=−0.5, wz=5.5/6.5) are 0.707 from the axis — 4mm inside
    // the annulus floor → untouched material
    expect(grid.filled(5, 5, 5)).toBe(true);
    expect(grid.filled(5, 5, 6)).toBe(true);
  });

});
