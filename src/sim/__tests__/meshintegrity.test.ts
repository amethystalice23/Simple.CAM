import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { greedyMeshChunk } from '../mesher';
import { movesToPoses } from '../poses';
import { carvePoses, emptyStats, type CarveStats } from '../carve';
import { buildToolSpec } from '../toolShape';
import type { Move, Stock, Tool } from '../../core/types';

/** build a full-mesh dump of the grid and assert the cut interior's faces
 *  are present: for a plunge column, the WALLS of the hole must exist in
 *  the mesh, not just the top boundary around it */
function allFaces(grid: VoxelGrid): number[][] {
  const faces: number[][] = [];
  const total = grid.chunkX * grid.chunkY * grid.chunkZ;
  for (let id = 0; id < total; id++) {
    const g = greedyMeshChunk(grid, id);
    for (let i = 0; i < g.indices.length; i += 3) {
      const tri = [
        g.positions[g.indices[i] * 3],
        g.positions[g.indices[i] * 3 + 1],
        g.positions[g.indices[i] * 3 + 2],
        g.positions[g.indices[i + 1] * 3],
        g.positions[g.indices[i + 1] * 3 + 1],
        g.positions[g.indices[i + 1] * 3 + 2],
        g.positions[g.indices[i + 2] * 3],
        g.positions[g.indices[i + 2] * 3 + 1],
        g.positions[g.indices[i + 2] * 3 + 2],
      ];
      faces.push(tri);
    }
  }
  return faces;
}

describe('carve display integrity (the gaps regression)', () => {
  it('a plunge hole produces interior WALL faces in the full-chunk mesh dump', () => {
    const stock: Stock = {
      kind: 'box', sizeX: 32, sizeY: 32, sizeZ: 32,
      origin: { x: 'min', y: 'min', z: 'min' },
      axisMode: '3-axis', materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    const tool: Tool = { id: 'f', name: 'f6', type: 'flat', diameter: 6, fluteLength: 40, spindleRpm: 1 };
    const moves: Move[] = [
      { words: { x: 16, y: 16, z: 31 }, feed: 0, rapid: true },
      { words: { z: 4 }, feed: 100 }, // plunge to z=4 (12 deep into the box)
    ];
    const poses = movesToPoses(moves, stock, () => 0, 1);
    const stats: CarveStats = emptyStats();
    carvePoses(grid, [buildToolSpec(tool)], poses, stats);
    expect(stats.removed).toBeGreaterThan(0);

    // the hole walls: faces at the hole's flank INSIDE the stock. Count
    // quads lying in x/y planes INSIDE the box volume below the top (k
    // interior) — vertical wall faces on the hole boundary.
    const tris = allFaces(grid);
    // every wall face of the hole is a vertical quad at |dist from (16,16)|
    // ≈ 3: collect face centroid z below the top surface (z < 31)
    let interiorWallFaces = 0;
    for (const t of tris) {
      // centroid
      const cx = (t[0] + t[3] + t[6]) / 3;
      const cy = (t[1] + t[4] + t[7]) / 3;
      const cz = (t[2] + t[5] + t[8]) / 3;
      const d = Math.hypot(cx - 16, cy - 16);
      if (d > 2.2 && d < 4 && cz < 30.5 && cz > 4) interiorWallFaces++;
    }
    // the hole is 12 deep with ~6Ø walls: MANY wall quads must exist in
    // the mesh; zero means the mesher only kept the top skin — the gaps bug
    expect(interiorWallFaces).toBeGreaterThan(10);
  });

  it('a steady-Z linear run clears the material ABOVE the cut (column semantics through the MESH)', () => {
    const stock: Stock = {
      kind: 'box', sizeX: 32, sizeY: 32, sizeZ: 32,
      origin: { x: 'min', y: 'min', z: 'min' },
      axisMode: '3-axis', materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    const tool: Tool = { id: 'f', name: 'f6', type: 'flat', diameter: 6, fluteLength: 40, spindleRpm: 1 };
    // tip at z=8 sweeping along X: the column above z=8 must clear
    const moves: Move[] = [
      { words: { x: 4, y: 16, z: 31 }, feed: 0, rapid: true },
      { words: { z: 8 }, feed: 100 },
      { words: { x: 28 }, feed: 300 },
    ];
    const poses = movesToPoses(moves, stock, () => 0, 1);
    const stats: CarveStats = emptyStats();
    carvePoses(grid, [buildToolSpec(tool)], poses, stats);
    // occupancy: every cell above z=8.0 within the swept band is empty
    for (let i = 6; i <= 26; i++) {
      for (let j = 14; j <= 18; j++) {
        const dx = i + 0.5 - 16; // cell center vs the sweep line y=16
        const dy = j + 0.5 - 16;
        if (dx * dx + dy * dy > 9) continue; // outside the Ø6 column of the sweep
        for (let k = 9; k < 32; k++) {
          // cells above the tip plane (z=8, k≥9 center 9.5 → zl>0)
          expect(grid.filled(i, j, k)).toBe(false);
        }
      }
    }
    // the MESH must reflect it: no face may exist above the cut INSIDE the
    // swept band (those cells are air; the mesher draws the slot's floor
    // and walls, not a floating skin above)
    const tris = allFaces(grid);
    let floatingAbove = 0;
    for (const t of tris) {
      const cx = (t[0] + t[3] + t[6]) / 3;
      const cy = (t[1] + t[4] + t[7]) / 3;
      const cz = (t[2] + t[5] + t[8]) / 3;
      const d = Math.hypot(cx - 16, cy - 16);
      if (d < 2.9 && cz > 9.1 && cz < 31.4) floatingAbove++;
    }
    expect(floatingAbove).toBe(0);
  });
});