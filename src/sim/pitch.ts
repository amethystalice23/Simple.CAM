/**
 * Voxel-pitch derivation for the carve simulator (pure — shared by the
 * worker shell and the UI's pre-run display). The ladder's smallest rung
 * whose cell count fits the memory cap wins; the last rung is the
 * fallback for absurdly large stock.
 */

import type { Stock } from '../core/types';

const LADDER = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0];
const CAP = 16_000_000;

export function derivePitch(stock: Stock): number {
  for (const p of LADDER) {
    const nx = Math.ceil(stockSize(stock, 'x') / p);
    const ny = Math.ceil(stockSize(stock, 'y') / p);
    const nz = Math.ceil(stockSize(stock, 'z') / p);
    if (nx * ny * nz <= CAP) return p;
  }
  return LADDER[LADDER.length - 1];
}

/** the stock's world-space AABB size per axis (cylinder: axis along X in
 *  4-axis, along Z in 3-axis; the other axes are the Ø silhouette) */
function stockSize(stock: Stock, axis: 'x' | 'y' | 'z'): number {
  if (stock.kind === 'box') {
    return axis === 'x' ? stock.sizeX : axis === 'y' ? stock.sizeY : stock.sizeZ;
  }
  const d = stock.calibration.effectiveRadius * 2;
  if (stock.axisMode === '4-axis') return axis === 'x' ? stock.length : d;
  return axis === 'z' ? stock.length : d;
}
