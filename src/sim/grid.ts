/**
 * Voxel occupancy grid over the stock-frame AABB (src/sim — pure core, no
 * three.js, vitest-node clean). The MATERIAL frame: the un-rotated stock at
 * A=0 — for 3-axis jobs it IS machine space. All cell indices are
 * [i,j,k] = [x,y,z] cell coords; world/cell conversions use cell CENTERS.
 *
 * Chunks are 32³; `chunkDirty` flags drive the per-chunk remeshing (the
 * worker shells each dirty chunk through greedyMeshChunk and clears the
 * flag afterwards).
 */

import type { Stock } from '../core/types';
import { originSpan } from '../core/types';

export const CHUNK_SIZE = 32;

export class VoxelGrid {
  /** cell counts along machine X/Y/Z */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** voxel edge length, mm */
  readonly pitch: number;
  /** machine coords of the min corner of cell [0,0,0] (the AABB low corner) */
  readonly originX: number;
  readonly originY: number;
  readonly originZ: number;
  /** occupancy, index = i + nx*(j + ny*k); 1 = material */
  readonly occ: Uint8Array;
  /** ghost classification, same indexing as occ: 0 none, 1 yellow
   *  (wrongly removed), 2 red (shank contact — still solid). A fresh
   *  VoxelGrid zeroes it; reset = a fresh grid, so it never carries over. */
  readonly ghost: Uint8Array;
  /** per column (i + nx*j): highest filled k, −1 when the column is empty —
   *  maintained lazily by onCarved */
  readonly columnTop: Int32Array;
  /** per column (i + nx*j): lowest filled k, nz when empty — the standing
   *  surface a tool approaching from BELOW sees (a 180°-indexed op: the
   *  stock is upside down, the tool comes from −Z) */
  readonly columnBottom: Int32Array;
  /** per Y-LINE (i + nx*k): highest filled j, −1 empty — the standing
   *  surface a tool approaching along −Y sees (a 90°-indexed op: its
   *  "material above the cut" runs along the stock's Y axis, not Z);
   *  maintained lazily by onCarved like columnTop */
  readonly columnTopY: Int32Array;
  /** per Y-LINE (i + nx*k): lowest filled j, ny when empty — the standing
   *  surface a tool approaching along +Y sees (−90°/270° indexing) */
  readonly columnBottomY: Int32Array;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly chunkZ: number;
  /** index = chunkIdAt; 1 = needs remeshing */
  readonly chunkDirty: Uint8Array;
  /** machine Z of the rotary stock's center (the rotation axis), for the
   *  radial depth classification of continuous-4-axis poses — NaN when the
   *  stock has no rotary calibration (3-axis cylinder stock without one) */
  readonly rotaryAxisZ: number;
  /** the stock's effective surface radius (cylinder cal; NaN for box) —
   *  the radial classifier's un-carved reference surface */
  readonly rotaryRadius: number;
  /** the stock's true axial span (x in 4-axis) — the mark's arcs off the
   *  stock read open sky, never the surface radius */
  readonly stockSpanX0: number;
  readonly stockSpanX1: number;

  constructor(stock: Stock, pitch: number) {
    if (!(pitch > 0) || !Number.isFinite(pitch)) {
      throw new Error(`voxel pitch must be a positive finite number, got ${pitch}`);
    }
    this.pitch = pitch;
    // 4-axis gate: a 3-axis STANDING cylinder has an axisZ too, but its
    // rotation axis is vertical (Z), not machine X — routing its poses to
    // the radial family would measure depth about the wrong axis. Only
    // 4-axis cylinder stock rides the radial classifier.
    this.rotaryAxisZ =
      stock.kind === 'cylinder' && stock.calibration && stock.axisMode === '4-axis'
        ? stock.calibration.axisZ
        : NaN;
    this.rotaryRadius =
      stock.kind === 'cylinder' && stock.calibration && stock.axisMode === '4-axis'
        ? stock.calibration.effectiveRadius
        : NaN;
    const sx = spanOf(stock, 'x');
    this.stockSpanX0 = sx[0];
    this.stockSpanX1 = sx[1];
    const sy = spanOf(stock, 'y');
    const sz = spanOf(stock, 'z');
    this.originX = sx[0];
    this.originY = sy[0];
    this.originZ = sz[0];
    this.nx = Math.max(1, Math.ceil((sx[1] - sx[0]) / pitch));
    this.ny = Math.max(1, Math.ceil((sy[1] - sy[0]) / pitch));
    this.nz = Math.max(1, Math.ceil((sz[1] - sz[0]) / pitch));

    const n = this.nx * this.ny * this.nz;
    this.occ = new Uint8Array(n);
    this.ghost = new Uint8Array(n);
    if (stock.kind === 'box') {
      this.occ.fill(1);
    } else {
      this.fillCylinder(stock);
    }

    // TRUE-SPAN CLIP (Alice's 2026-10-26 endcap report): the cell grid pads
    // the stock's AABB up to whole cells, and at pitches that do not divide
    // the stock evenly (her 0.3/0.45 over the 100mm bar) the last cells'
    // centers sit PAST the real end — filled as phantom stock by the loops
    // above (the cylinder fill never tests x; the box fill takes the whole
    // grid) and unreachable by every tool (paths stay inside the stock),
    // they rendered as a fabricated endcap standing proud of the end face
    // while the divisor pitches stayed honest. Zero every cell whose CENTER
    // lies outside the stock's true span: what renders is what can be cut.
    for (let k = 0; k < this.nz; k++) {
      const cz = sz[0] + (k + 0.5) * pitch;
      const inZ = cz >= sz[0] && cz < sz[1];
      for (let j = 0; j < this.ny; j++) {
        const cy = sy[0] + (j + 0.5) * pitch;
        const inY = cy >= sy[0] && cy < sy[1];
        for (let i = 0; i < this.nx; i++) {
          if (!inZ || !inY) {
            this.occ[this.idx(i, j, k)] = 0;
            continue;
          }
          const cx = sx[0] + (i + 0.5) * pitch;
          if (!(cx >= sx[0] && cx < sx[1])) {
            this.occ[this.idx(i, j, k)] = 0;
          }
        }
      }
    }

    this.columnTop = new Int32Array(this.nx * this.ny);
    this.columnBottom = new Int32Array(this.nx * this.ny);
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        let top = -1;
        let bot = this.nz;
        for (let k = this.nz - 1; k >= 0; k--) {
          if (this.occ[this.idx(i, j, k)] === 1) {
            if (top < 0) top = k;
            bot = k;
          }
        }
        this.columnTop[j * this.nx + i] = top;
        this.columnBottom[j * this.nx + i] = bot;
      }
    }
    // the Y-line ends: per (i, k) the max and min filled j — one descending
    // scan finds both
    this.columnTopY = new Int32Array(this.nx * this.nz);
    this.columnBottomY = new Int32Array(this.nx * this.nz);
    for (let k = 0; k < this.nz; k++) {
      for (let i = 0; i < this.nx; i++) {
        let top = -1;
        let bot = this.ny;
        for (let j = this.ny - 1; j >= 0; j--) {
          if (this.occ[this.idx(i, j, k)] === 1) {
            if (top < 0) top = j;
            bot = j;
          }
        }
        this.columnTopY[this.nx * k + i] = top;
        this.columnBottomY[this.nx * k + i] = bot;
      }
    }

    this.chunkX = Math.ceil(this.nx / CHUNK_SIZE);
    this.chunkY = Math.ceil(this.ny / CHUNK_SIZE);
    this.chunkZ = Math.ceil(this.nz / CHUNK_SIZE);
    this.chunkDirty = new Uint8Array(this.chunkX * this.chunkY * this.chunkZ);
  }

  /** filled(i,j,k): true = material; out-of-grid cells read as empty */
  filled(i: number, j: number, k: number): boolean {
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return false;
    return this.occ[this.idx(i, j, k)] === 1;
  }

  /** set occupancy (0 or 1); does NOT touch columnTop — pair with onCarved */
  set(i: number, j: number, k: number, v: 0 | 1): void {
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return;
    this.occ[this.idx(i, j, k)] = v;
  }

  /**
   * Carve hook: call once per REMOVED voxel after set(i,j,k,0). Lazily
   * lowers columnTop by scanning down from k (only when k was the top), and
   * maintains the Y-line ends the same way (only when the removed cell was
   * the end).
   */
  onCarved(i: number, j: number, k: number): void {
    const col = j * this.nx + i;
    let top = this.columnTop[col];
    if (k >= top) {
      while (top >= 0 && !this.filled(i, j, top)) top--;
      this.columnTop[col] = top;
    }
    let bot = this.columnBottom[col];
    if (k <= bot) {
      while (bot < this.nz && !this.filled(i, j, bot)) bot++;
      this.columnBottom[col] = bot;
    }
    const line = this.nx * k + i;
    let ty = this.columnTopY[line];
    if (j >= ty) {
      while (ty >= 0 && !this.filled(i, ty, k)) ty--;
      this.columnTopY[line] = ty;
    }
    let by = this.columnBottomY[line];
    if (j <= by) {
      while (by < this.ny && !this.filled(i, by, k)) by++;
      this.columnBottomY[line] = by;
    }
  }

  /** cell coords (floored, unclamped) for a world point */
  worldToCell(x: number, y: number, z: number): [number, number, number] {
    return [
      Math.floor((x - this.originX) / this.pitch),
      Math.floor((y - this.originY) / this.pitch),
      Math.floor((z - this.originZ) / this.pitch),
    ];
  }

  /** world coords of a cell's CENTER */
  worldFromCell(i: number, j: number, k: number): [number, number, number] {
    return [
      this.originX + (i + 0.5) * this.pitch,
      this.originY + (j + 0.5) * this.pitch,
      this.originZ + (k + 0.5) * this.pitch,
    ];
  }

  /** id = cx + cy*chunkX + cz*chunkX*chunkY (matches protocol's ChunkMesh.id) */
  chunkIdAt(i: number, j: number, k: number): number {
    const cx = Math.floor(i / CHUNK_SIZE);
    const cy = Math.floor(j / CHUNK_SIZE);
    const cz = Math.floor(k / CHUNK_SIZE);
    return cx + cy * this.chunkX + cz * this.chunkX * this.chunkY;
  }

  /** cell range [x0,y0,z0, x1,y1,z1) covered by a chunk (max side exclusive) */
  chunkBounds(id: number): [number, number, number, number, number, number] {
    const cx = id % this.chunkX;
    const cy = Math.floor(id / this.chunkX) % this.chunkY;
    const cz = Math.floor(id / (this.chunkX * this.chunkY));
    return [
      cx * CHUNK_SIZE,
      cy * CHUNK_SIZE,
      cz * CHUNK_SIZE,
      Math.min((cx + 1) * CHUNK_SIZE, this.nx),
      Math.min((cy + 1) * CHUNK_SIZE, this.ny),
      Math.min((cz + 1) * CHUNK_SIZE, this.nz),
    ];
  }

  markChunkDirty(i: number, j: number, k: number): void {
    this.chunkDirty[this.chunkIdAt(i, j, k)] = 1;
  }

  /** ids of all dirty chunks */
  dirtyChunkIds(): number[] {
    const out: number[] = [];
    for (let id = 0; id < this.chunkDirty.length; id++) {
      if (this.chunkDirty[id] === 1) out.push(id);
    }
    return out;
  }

  clearChunkDirty(id: number): void {
    this.chunkDirty[id] = 0;
  }

  private idx(i: number, j: number, k: number): number {
    return i + this.nx * (j + this.ny * k);
  }

  /**
   * cylinder stock: 4-axis lies along machine X (circle in YZ about the
   * axis datum); 3-axis stands vertical (circle in XY about X0/Y0). Cells
   * count as material when their CENTER is inside the radius.
   */
  private fillCylinder(stock: Extract<Stock, { kind: 'cylinder' }>): void {
    const r = stock.calibration.effectiveRadius;
    const rSq = r * r;
    let cy: number;
    let cz: number;
    let alongX: boolean;
    if (stock.axisMode === '4-axis') {
      alongX = true;
      cy = (spanOf(stock, 'y')[0] + spanOf(stock, 'y')[1]) / 2;
      cz = stock.calibration.axisZ;
    } else {
      alongX = false;
      cy = 0;
      cz = 0;
    }
    for (let k = 0; k < this.nz; k++) {
      const wz = this.originZ + (k + 0.5) * this.pitch;
      for (let j = 0; j < this.ny; j++) {
        const wy = this.originY + (j + 0.5) * this.pitch;
        const aSq = (wy - cy) * (wy - cy) + (wz - cz) * (wz - cz);
        for (let i = 0; i < this.nx; i++) {
          let inside: boolean;
          if (alongX) {
            inside = aSq <= rSq;
          } else {
            const wx = this.originX + (i + 0.5) * this.pitch;
            inside = (wx * wx + wy * wy) <= rSq;
          }
          if (inside) this.occ[this.idx(i, j, k)] = 1;
        }
      }
    }
  }
}

/** stockSpan without importing from the UI layer (src/ui/placement.ts mirror) */
function spanOf(stock: Stock, axis: 'x' | 'y' | 'z'): readonly [number, number] {
  if (stock.kind === 'cylinder') {
    const r = stock.calibration.effectiveRadius;
    if (stock.axisMode === '3-axis') {
      switch (axis) {
        case 'x':
        case 'y':
          return [-r, r];
        case 'z':
          return originSpan(stock.xOrigin, stock.length);
      }
    }
    switch (axis) {
      case 'x':
        return originSpan(stock.xOrigin, stock.length);
      case 'y':
        return [-r, r];
      case 'z':
        return [stock.calibration.axisZ - r, stock.calibration.axisZ + r];
    }
  }
  switch (axis) {
    case 'x':
      return originSpan(stock.origin.x, stock.sizeX);
    case 'y':
      return originSpan(stock.origin.y, stock.sizeY);
    case 'z':
      return originSpan(stock.origin.z, stock.sizeZ);
  }
}
