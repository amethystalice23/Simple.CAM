import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { ghostMeshChunk, greedyMeshChunk } from '../mesher';
import { buildToolSpec } from '../toolShape';
import { carvePoses, emptyStats } from '../carve';
import type { Pose } from '../poses';
import type { Stock, Tool } from '../../core/types';

const boxGrid = (size = 8, pitch = 1): VoxelGrid => {
  const stock: Stock = {
    kind: 'box',
    sizeX: size,
    sizeY: size,
    sizeZ: size,
    origin: { x: 'min', y: 'min', z: 'min' },
    axisMode: '3-axis',
    materialId: 'test',
  };
  return new VoxelGrid(stock, pitch);
};

const pose = (p: Partial<Pose>): Pose => ({
  x: 4,
  y: 4,
  z: 4,
  ax: 0,
  ay: 0,
  az: -1,
  tool: 0,
  moveIndex: 0,
  rapid: false,
  ...p,
});

const flatTool: Tool = {
  id: 'f',
  name: 'flat 6',
  type: 'flat',
  diameter: 6,
  fluteLength: 30,
  spindleRpm: 18000,
};

describe('ghostMeshChunk (classification overlay)', () => {
  it('an unmarked grid yields empty ghost geometry', () => {
    const grid = boxGrid();
    const g = ghostMeshChunk(grid, 0);
    expect(g.indices.length).toBe(0);
    expect(g.positions.length).toBe(0);
    expect(g.colors.length).toBe(0);
  });

  it('yellow ghosts mesh as free cubes with the yellow rgb; red as exposed faces of solid cells', () => {
    const grid = boxGrid();
    // one removed cell (yellow ghost, void) + one SOLID surface cell at the
    // stock top (red ghost — a buried interior contact has no exposed
    // faces and correctly draws nothing)
    const solid = 3 + grid.nx * (3 + grid.ny * 7); // top layer (k=7 of 8)
    const voided = 3 + grid.nx * (3 + grid.ny * 5);
    grid.occ[voided] = 0;
    grid.ghost[voided] = 1;
    grid.ghost[solid] = 2;

    const g = ghostMeshChunk(grid, 0);
    expect(g.indices.length).toBeGreaterThan(0);
    // every vertex carries an RGBA color; exactly two appear. The yellow is
    // TRANSLUCENT (Alice, 2026-10-26: those voxels were removed, just not
    // intentionally — the cube is a ghost) and the red stays strong
    const seen = new Set<string>();
    for (let v = 0; v < g.colors.length; v += 4) {
      seen.add(`${g.colors[v]},${g.colors[v + 1]},${g.colors[v + 2]},${g.colors[v + 3]}`);
    }
    expect(seen.has('255,200,0,26')).toBe(true); // barely-there yellow wash (Alice 2026-10-26: 10%)
    expect(seen.has('255,32,32,230')).toBe(true); // strong red
    expect(seen.size).toBe(2);
    const vertCount = g.positions.length / 3;
    // the yellow cube is fully floating (void all around): 6 faces = 24 verts
    let yellowVerts = 0;
    for (let v = 0; v < vertCount; v++) {
      if (g.colors[v * 4] === 255 && g.colors[v * 4 + 1] === 200) yellowVerts++;
    }
    expect(yellowVerts).toBe(24);
    // the surface red cell exposes only its +Z face (5 neighbors solid):
    // 1 quad = 4 red verts, all at the top plane z = originZ + 8
    let redVerts = 0;
    for (let v = 0; v < vertCount; v++) {
      if (g.colors[v * 4] === 255 && g.colors[v * 4 + 1] === 32) {
        redVerts++;
        expect(g.positions[v * 3 + 2]).toBeCloseTo(grid.originZ + 8, 6);
      }
    }
    expect(redVerts).toBe(4);
    // indices are a clean quad soup: every index < vertex count
    for (let ii = 0; ii < g.indices.length; ii++) expect(g.indices[ii]).toBeLessThan(vertCount);
  });

  it('worker-shaped end-to-end: carve (a gouge + a shank hit) and mesh every chunk — ghosts land in chunk 0', () => {
    const grid = boxGrid(10, 1);
    // ONE short-flute pose, tip at z=4 (6 deep into virgin stock, no
    // prior op): flute carves k=4..5; cells above the flute (zl 2..20,
    // ρ ≤ 3) stay solid as red shank contacts
    const stub = buildToolSpec({ ...flatTool, fluteLength: 2, overallLength: 20 });
    const s = emptyStats();
    carvePoses(grid, [stub], [pose({ z: 4, moveIndex: 0 })], s, new Float32Array(10).fill(5));
    expect(s.removed).toBeGreaterThan(0);
    expect(s.gougedVoxels).toBe(0); // within stepDown 5 → all fine
    expect(s.collisions).toBe(1);

    // the whole grid is one chunk (10³ < 32³): mesh solid + ghost; ghost
    // geometry exists (yellow at minimum), and red surface contacts (the
    // k=9 crown cells the shank touched) show as exposed red faces
    expect(grid.chunkX * grid.chunkY * grid.chunkZ).toBe(1);
    const solid = greedyMeshChunk(grid, 0);
    expect(solid.indices.length).toBeGreaterThan(0);
    const ghost = ghostMeshChunk(grid, 0);
    expect(ghost.indices.length).toBeGreaterThan(0);
    let yellow = 0;
    let red = 0;
    for (let v = 0; v < ghost.colors.length; v += 4) {
      if (ghost.colors[v + 1] === 200) yellow++;
      else if (ghost.colors[v + 1] === 32) red++;
    }
    expect(yellow).toBe(0); // the pose was within its step-down
    // the crown cell (5,5,9) is a red shank contact that stays solid, and
    // as the top layer it is void-exposed — its faces must appear
    const crownIdx = 5 + grid.nx * (5 + grid.ny * 9);
    expect(grid.occ[crownIdx]).toBe(1);
    expect(grid.ghost[crownIdx]).toBe(2);
    expect(red).toBeGreaterThan(0);
  });
});

describe('ghost face winding (Alice\'s 2026-10-28 normals report)', () => {
  it('every ghost quad\'s triangles wind CCW OUTWARD — cross((c10−c00),(c01−c00)) = the normal, all 6 dirs', () => {
    // the ±Y corner rows were wound CW (inverted): the ghost material culls
    // backfaces (FrontSide default), so those faces vanished and the cubes
    // showed their insides — "stripes"/holes seen from one side only.
    const grid = boxGrid(1); // a single cell
    grid.ghost[0] = 1; // yellow
    grid.set(0, 0, 0, 0); // removed (void) — free-standing cube draws all 6
    const g = ghostMeshChunk(grid, 0);
    expect(g.indices.length / 6).toBe(6); // one quad per direction
    for (let q = 0; q < g.indices.length / 6; q++) {
      const n = [g.normals[q * 12], g.normals[q * 12 + 1], g.normals[q * 12 + 2]];
      const c = [0, 1, 2, 3].map((s) => [
        g.positions[q * 12 + s * 3],
        g.positions[q * 12 + s * 3 + 1],
        g.positions[q * 12 + s * 3 + 2],
      ]);
      const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const crs = (a: number[], b: number[]) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      // both triangles: (v1−v0)×(v2−v0) along the normal
      for (const tri of [[0, 1, 2], [0, 2, 3]]) {
        const u = sub(c[tri[1]], c[tri[0]]);
        const v = sub(c[tri[2]], c[tri[0]]);
        const m = crs(u, v);
        const dot = m[0] * n[0] + m[1] * n[1] + m[2] * n[2];
        expect(dot).toBeGreaterThan(0.5); // same direction, unit-length edges
      }
    }
  });
});
