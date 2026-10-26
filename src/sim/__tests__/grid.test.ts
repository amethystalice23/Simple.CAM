import { describe, expect, it } from 'vitest';
import { VoxelGrid, CHUNK_SIZE } from '../grid';
import type { Stock } from '../../core/types';

const boxStock = (axisMode: '3-axis' | '4-axis' = '3-axis'): Stock => ({
  kind: 'box',
  sizeX: 10,
  sizeY: 10,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'min' },
  axisMode,
  materialId: 'test',
});

describe('VoxelGrid', () => {
  it('fills a 10×10×10 box at 1mm pitch with exactly 1000 cells', () => {
    const g = new VoxelGrid(boxStock(), 1);
    expect(g.nx).toBe(10);
    expect(g.ny).toBe(10);
    expect(g.nz).toBe(10);
    expect(g.occ.length).toBe(1000);
    let filled = 0;
    for (let k = 0; k < 10; k++)
      for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) if (g.filled(i, j, k)) filled++;
    expect(filled).toBe(1000);
  });

  it('uses ceil for fractional extents and rejects non-positive pitch', () => {
    const g = new VoxelGrid(boxStock(), 0.4);
    expect(g.nx).toBe(25);
    expect(g.pitch).toBe(0.4);
    expect(() => new VoxelGrid(boxStock(), 0)).toThrow();
    expect(() => new VoxelGrid(boxStock(), -1)).toThrow();
  });

  it('cylinder 4-axis: cells inside the YZ circle filled, outside empty', () => {
    // 4-axis cylinder Ø20 along X, 0..20, axisZ = 10
    const stock: Stock = {
      kind: 'cylinder',
      length: 20,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 10, effectiveRadius: 10 },
      axisMode: '4-axis',
      materialId: 'test',
    };
    const g = new VoxelGrid(stock, 1);
    expect(g.nx).toBe(20);
    // grid spans y −10..10, z 0..20; cell centers at j+0.5−10 etc.
    // axis-adjacent cell (10, 0, 10): wy = −9.5, wz = 10.5: (−9.5)² + 0.5² = 90.5 ≤ 100
    expect(g.filled(10, 0, 10)).toBe(true);
    // true corner (10, 19, 19): wy = 9.5, wz = 19.5: 90.25 + 90.25 > 100 — empty
    expect(g.filled(10, 19, 19)).toBe(false);
    // center column top: wy = 0.5 → 0.25 + (k+0.5−10)² ≤ 100 → k ≤ 19.48 → k = 19
    expect(g.columnTop[10 * g.nx + 10]).toBe(19);
    // exact centered-disc lattice count at 0.5mm offsets (computed)
    let count = 0;
    for (let j = 0; j < 20; j++)
      for (let k = 0; k < 20; k++) {
        const wy = j + 0.5 - 10;
        const wz = k + 0.5 - 10;
        if (wy * wy + wz * wz <= 100) count++;
      }
    expect(count).toBe(316);
    let total = 0;
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 20; k++) if (g.filled(i, j, k)) total++;
    expect(total).toBe(316 * 20);
  });

  it('cylinder 3-axis: axis along Z, circle in XY about origin', () => {
    const stock: Stock = {
      kind: 'cylinder',
      length: 6,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 2 },
      axisMode: '3-axis',
      materialId: 'test',
    };
    const g = new VoxelGrid(stock, 1);
    expect(g.nx).toBe(4);
    expect(g.ny).toBe(4);
    expect(g.nz).toBe(6);
    // cell centers at ±1.5: (1.5² + 1.5²) = 4.5 > 4 — corners empty
    expect(g.filled(0, 0, 3)).toBe(false);
    // axial centers at (±0.5, ±1.5): 0.25 + 2.25 = 2.5 ≤ 4 — filled
    expect(g.filled(0, 1, 3)).toBe(true);
    expect(g.filled(3, 2, 0)).toBe(true);
    // every column has material: tops all k = 5
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++)
        if (g.filled(i, j, 0)) expect(g.columnTop[j * g.nx + i]).toBe(5);
  });

  it('columnTop: carving a side pocket lowers only the carved columns', () => {
    const g = new VoxelGrid(boxStock(), 1);
    // pocket: clear k = 5..9 in column (3, 3) and (3, 4), keep k ≤ 4
    for (const j of [3, 4]) {
      for (let k = 5; k < 10; k++) {
        g.set(3, j, k, 0);
        g.onCarved(3, j, k);
      }
    }
    expect(g.columnTop[3 * g.nx + 3]).toBe(4);
    expect(g.columnTop[4 * g.nx + 3]).toBe(4);
    // untouched columns keep their tops
    expect(g.columnTop[5 * g.nx + 5]).toBe(9);
    // carving through the floor too → column empty, top −1
    for (let k = 0; k < 10; k++) {
      g.set(7, 7, k, 0);
      g.onCarved(7, 7, k);
    }
    expect(g.columnTop[7 * g.nx + 7]).toBe(-1);
  });

  it('world/cell conversions round-trip through cell centers', () => {
    const g = new VoxelGrid(boxStock(), 0.5);
    const [ci, cj, ck] = g.worldToCell(3.24, 7.9, 0.1);
    expect([ci, cj, ck]).toEqual([6, 15, 0]);
    const [wx, wy, wz] = g.worldFromCell(6, 15, 0);
    expect([wx, wy, wz]).toEqual([3.25, 7.75, 0.25]);
  });

  it('chunks: 10×10×10 at 32³ is one dirty-markable chunk; boundary marking lands in the right chunk', () => {
    const g = new VoxelGrid(boxStock(), 1);
    expect(g.chunkX).toBe(1);
    expect(g.chunkY).toBe(1);
    expect(g.chunkZ).toBe(1);
    expect(g.chunkIdAt(0, 0, 0)).toBe(0);
    expect(g.chunkIdAt(9, 9, 9)).toBe(0);
    g.markChunkDirty(5, 5, 5);
    expect(g.dirtyChunkIds()).toEqual([0]);

    // a 70-cell-wide grid → 3 chunks per axis
    const big = new VoxelGrid(
      { kind: 'box', sizeX: 70, sizeY: 10, sizeZ: 10, origin: { x: 'min', y: 'min', z: 'min' }, axisMode: '3-axis', materialId: 't' },
      1,
    );
    expect(big.chunkX).toBe(3);
    expect(big.chunkY).toBe(1);
    expect(big.chunkZ).toBe(1);
    expect(big.chunkIdAt(0, 0, 0)).toBe(0);
    expect(big.chunkIdAt(CHUNK_SIZE, 0, 0)).toBe(1);
    expect(big.chunkIdAt(CHUNK_SIZE * 2, 0, 0)).toBe(2);
    expect(big.chunkIdAt(31, 0, 0)).toBe(0);
    expect(big.chunkIdAt(32, 0, 0)).toBe(1);
    big.markChunkDirty(33, 5, 5);
    expect(big.dirtyChunkIds()).toEqual([1]);
    big.clearChunkDirty(1);
    expect(big.dirtyChunkIds()).toEqual([]);

    // chunkBounds ranges
    const [bx0, by0, bz0, bx1, by1, bz1] = big.chunkBounds(1);
    expect([bx0, by0, bz0, bx1, by1, bz1]).toEqual([32, 0, 0, 64, 10, 10]);
  });
});
