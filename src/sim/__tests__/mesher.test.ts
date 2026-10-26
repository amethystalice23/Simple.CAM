import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { greedyMeshChunk } from '../mesher';
import type { Stock } from '../../core/types';

const boxStock = (size: number): Stock => ({
  kind: 'box',
  sizeX: size,
  sizeY: size,
  sizeZ: size,
  origin: { x: 'min', y: 'min', z: 'min' },
  axisMode: '3-axis',
  materialId: 'test',
});

const quadCount = (g: ReturnType<typeof greedyMeshChunk>): number => g.indices.length / 6;

/** count boundary edges of the triangle soup. Greedy meshes carry
 *  T-junctions (a small quad's edge can abut a big quad's longer edge), so
 *  raw whole-edge counting false-positives; instead each edge is subdivided
 *  into pitch-length segments (greedy quad corners are on the voxel lattice,
 *  edges are axis-aligned, lengths are integer multiples of pitch) and every
 *  unit segment must be shared by exactly 2 triangles for a closed mesh. */
const boundaryEdges = (geom: ReturnType<typeof greedyMeshChunk>, pitch = 1): number => {
  const counts = new Map<string, number>();
  const bump = (pa: number[], pb: number[]): void => {
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const n = Math.max(1, Math.round(len / pitch));
    for (let s = 0; s < n; s++) {
      const t0 = s / n;
      const t1 = (s + 1) / n;
      const qa = [0, 1, 2].map((ax) => pa[ax] + (pb[ax] - pa[ax]) * t0);
      const qb = [0, 1, 2].map((ax) => pa[ax] + (pb[ax] - pa[ax]) * t1);
      const ka = qa.map((v) => v.toFixed(4)).join(',');
      const kb = qb.map((v) => v.toFixed(4)).join(',');
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  };
  for (let t = 0; t < geom.indices.length; t += 3) {
    const idx = [geom.indices[t], geom.indices[t + 1], geom.indices[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = idx[e];
      const b = idx[(e + 1) % 3];
      bump(
        [geom.positions[a * 3], geom.positions[a * 3 + 1], geom.positions[a * 3 + 2]],
        [geom.positions[b * 3], geom.positions[b * 3 + 1], geom.positions[b * 3 + 2]],
      );
    }
  }
  let boundary = 0;
  for (const c of counts.values()) if (c !== 2) boundary++;
  return boundary;
};

describe('greedyMeshChunk', () => {
  it('a 1×1×1-cell grid → exactly 6 quads, 36 indices, correct normals and positions', () => {
    const grid = new VoxelGrid(boxStock(1), 1);
    const geom = greedyMeshChunk(grid, 0);
    expect(quadCount(geom)).toBe(6);
    expect(geom.indices.length).toBe(36);
    expect(geom.positions.length).toBe(72);
    // one face is the +z top: a quad at z=1 spanning (0,0)-(1,1)
    // find the quad with normal (0,0,1)
    let foundTop = false;
    for (let q = 0; q < 6; q++) {
      if (geom.normals[q * 12 + 2] === 1 && geom.normals[q * 12] === 0) {
        foundTop = true;
        const xs: number[] = [];
        const zs: number[] = [];
        for (let c = 0; c < 4; c++) {
          xs.push(geom.positions[q * 12 + c * 3]);
          zs.push(geom.positions[q * 12 + c * 3 + 2]);
        }
        expect(new Set(xs)).toEqual(new Set([0, 1]));
        expect(new Set(zs)).toEqual(new Set([1]));
      }
    }
    expect(foundTop).toBe(true);
    expect(boundaryEdges(geom)).toBe(0);
  });

  it('a 4³ grid fully solid → 6 greedy quads (maximal rectangles, not 54 cell faces)', () => {
    const grid = new VoxelGrid(boxStock(4), 1);
    const geom = greedyMeshChunk(grid, 0);
    expect(quadCount(geom)).toBe(6);
    // each quad spans 4×4 world units
    for (let q = 0; q < 6; q++) {
      const xs = new Set<number>();
      const ys = new Set<number>();
      const zs = new Set<number>();
      for (let c = 0; c < 4; c++) {
        xs.add(geom.positions[q * 12 + c * 3]);
        ys.add(geom.positions[q * 12 + c * 3 + 1]);
        zs.add(geom.positions[q * 12 + c * 3 + 2]);
      }
      const spans = [xs.size === 1 ? 0 : 4, ys.size === 1 ? 0 : 4, zs.size === 1 ? 0 : 4].sort().join(',');
      expect(['0,0,4', '0,4,4']).toContain(spans);
    }
  });

  it('removing the middle voxel of a 3³ grid adds exactly 6 faces (12 quads total)', () => {
    const grid = new VoxelGrid(boxStock(3), 1);
    grid.set(1, 1, 1, 0);
    grid.onCarved(1, 1, 1);
    const geom = greedyMeshChunk(grid, 0);
    // the outer cube: 6 quads. the hole: 3 faces of the 26-neighborhood? no —
    // the cavity's walls: the six neighbors of (1,1,1) each contribute the
    // face toward the void: 6 quads. Greedy merges the cavity walls? each
    // wall is a single 1×1 face (the cavity is one cell) → 6 more quads.
    expect(quadCount(geom)).toBe(12);
    expect(boundaryEdges(geom)).toBe(0);
  });

  it('chunk-boundary face culling: two chunks of a solid bar share no face between them', () => {
    // 64×1×1 bar at 1mm pitch → 2 chunks along x, each 32 wide
    const stock: Stock = {
      kind: 'box',
      sizeX: 64,
      sizeY: 1,
      sizeZ: 1,
      origin: { x: 'min', y: 'min', z: 'min' },
      axisMode: '3-axis',
      materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    expect(grid.chunkX).toBe(2);
    const c0 = greedyMeshChunk(grid, 0);
    const c1 = greedyMeshChunk(grid, 1);
    // each chunk owns its 32×1×1 cells: −x end cap (cell 0's low face),
    // 2 y-side quads, 2 z-side quads = 5; the internal face between cells
    // 31 and 32 is emitted by NEITHER chunk (chunk 0 skips its +x face —
    // m<0 at p===hi means the solid cell 31's border face is culled since
    // cell 32 is solid; chunk 1 symmetric). c1 keeps its own +x cap at 64.
    expect(quadCount(c0)).toBe(5);
    expect(quadCount(c1)).toBe(5);
    // verify: count quads with normal (±1,0,0)
    const xQuads = (g: ReturnType<typeof greedyMeshChunk>): number => {
      let n = 0;
      for (let q = 0; q < g.indices.length / 6; q++) {
        if (g.normals[q * 12] !== 0) n++;
      }
      return n;
    };
    expect(xQuads(c0)).toBe(1); // only the −x cap at 0
    expect(xQuads(c1)).toBe(1); // only the +x cap at 64
    // y and z faces: 2 each per chunk (1mm bar → single greedy quad per side)
    const axisQuads = (g: ReturnType<typeof greedyMeshChunk>, axis: 1 | 2): number => {
      let n = 0;
      for (let q = 0; q < g.indices.length / 6; q++) {
        if (g.normals[q * 12 + axis] !== 0) n++;
      }
      return n;
    };
    expect(axisQuads(c0, 1)).toBe(2);
    expect(axisQuads(c0, 2)).toBe(2);
  });

  it('a small cylinder grid meshes watertight (no boundary edges)', () => {
    const stock: Stock = {
      kind: 'cylinder',
      length: 6,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 2 },
      axisMode: '3-axis',
      materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 1);
    const geom = greedyMeshChunk(grid, 0);
    expect(quadCount(geom)).toBeGreaterThan(0);
    expect(boundaryEdges(geom)).toBe(0);
    // sanity: total triangles = 2 × quads
    expect(geom.indices.length).toBe(quadCount(geom) * 6);
  });

  it('an empty (fully carved) chunk yields empty geometry', () => {
    const grid = new VoxelGrid(boxStock(2), 1);
    grid.occ.fill(0);
    grid.columnTop.fill(-1);
    const geom = greedyMeshChunk(grid, 0);
    expect(geom.indices.length).toBe(0);
    expect(geom.positions.length).toBe(0);
    expect(geom.normals.length).toBe(0);
  });
});
