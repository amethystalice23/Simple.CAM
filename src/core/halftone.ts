/**
 * Classic AM (amplitude-modulated) monochrome halftone screen — dots
 * only — reimplemented from first principles as DESCRIBED (the
 * GIMP/GEGL newsprint plugin is GPL and must not be read or copied).
 *
 * A square lattice of `spacing`-mm cells, rotated by `angleDeg` about
 * the face center, covers the face rect; each cell's dark COVERAGE
 * (box-average of the image over the cell footprint) sizes a dot whose
 * AREA is proportional to coverage — the printing-correct curve: 50%
 * grey → a dot covering 50% of the cell. Cells below `minCoverage`
 * drop (no dot); solid black drives dots to the lattice-corner bound
 * (r = spacing/√2, neighbors meet exactly at the cell corners) so a
 * solid region prints SOLID, no corner stipple gaps.
 *
 * Output feeds the existing engrave-fill / laser pipeline unchanged:
 * one closed 24-gon per dot, meta { closed: true, filled: true },
 * paths in mm in the face frame x ∈ [0, faceWidth], y ∈ [0, faceHeight]
 * with image row 0 (TOP) at y = faceHeight (the heightmap v-down-flip
 * convention).
 */

import type { Vec2 } from './types';
import type { ImportedArtwork } from './vectorImport';
import type { GrayBitmap } from './bitmapImport';

/** midpoint-quadrature samples per cell axis (rotated-square box average) */
const SUBGRID = 8;
/** hard guard: a finer screen than this is a UI input error */
const MAX_DOTS = 20000;
/** dot radius where axially neighboring dots touch (c = π/4 ⇒ r = s/2) */
const TOUCH = Math.PI / 4;

export interface HalftoneParams {
  /** face width, mm — image X stretches onto it */
  faceWidth: number;
  /** face height, mm — image Y stretches onto it, row 0 at y = faceHeight */
  faceHeight: number;
  /** screen cell size, mm */
  spacing: number;
  /** screen angle, degrees, about the face center */
  angleDeg: number;
  /** coverage below which a cell emits no dot (default 0.04) */
  minCoverage?: number;
}

export function halftoneArtwork(gray: GrayBitmap, p: HalftoneParams): ImportedArtwork {
  const s = p.spacing;
  const floor = p.minCoverage ?? 0.04;
  const angle = (p.angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cx = p.faceWidth / 2;
  const cy = p.faceHeight / 2;

  if (gray.width === 0 || gray.height === 0) throw new Error('empty bitmap');

  // cheap pre-loop guard: the kept lattice lives inside the face + a
  // 1-cell margin, and a square lattice has density 1/s² under ANY
  // rotation — this product bounds the dot count without walking it
  const bound = (p.faceWidth / s + 4) * (p.faceHeight / s + 4);
  if (bound > MAX_DOTS) {
    throw new Error('dot spacing too fine for this image — increase it');
  }

  // lattice range covers the face at any angle (half-diagonal reach)
  const iMax = Math.ceil(Math.hypot(p.faceWidth, p.faceHeight) / 2 / s) + 1;
  const centers: Vec2[] = [];
  for (let j = -iMax; j <= iMax; j++) {
    for (let i = -iMax; i <= iMax; i++) {
      const lx = i * s;
      const ly = j * s;
      const x = cx + lx * cosA - ly * sinA;
      const y = cy + lx * sinA + ly * cosA;
      // keep centers in the face plus one cell of margin (edge dots
      // that partially overlap the face stay)
      if (x >= -s && x <= p.faceWidth + s && y >= -s && y <= p.faceHeight + s) {
        centers.push({ x, y });
      }
    }
  }

  /** dark fraction 0..1 of one rotated cell footprint: midpoint
   *  quadrature of the image over the cell's square in face space
   *  (exact for uniform cells; the rotated/scaled footprint makes a
   *  closed-form pixel-overlap box a polygon-clip job) */
  const coverage = (px: number, py: number): number => {
    let sum = 0;
    for (let bj = 0; bj < SUBGRID; bj++) {
      for (let bi = 0; bi < SUBGRID; bi++) {
        const a = -s / 2 + (s * (bi + 0.5)) / SUBGRID;
        const b = -s / 2 + (s * (bj + 0.5)) / SUBGRID;
        const fx = px + a * cosA - b * sinA;
        const fy = py + a * sinA + b * cosA;
        // face → image: plain stretch, v-down flip (row 0 at y = faceHeight)
        const u = (fx / p.faceWidth) * gray.width - 0.5;
        const v = (1 - fy / p.faceHeight) * gray.height - 0.5;
        const ix = Math.min(gray.width - 1, Math.max(0, Math.round(u)));
        const iy = Math.min(gray.height - 1, Math.max(0, Math.round(v)));
        sum += gray.data[iy * gray.width + ix];
      }
    }
    return 1 - sum / (SUBGRID * SUBGRID) / 255;
  };

  /**
   * Dot radius from coverage. Area-true curve r = s·√(c/π) up to the
   * axial touch point (c = π/4, r = s/2); above it a linear blend to
   * the lattice-corner bound r = s/√2 at c = 1 (chain-dot: neighbors
   * meet exactly at the cell corners, solid black prints solid). The
   * area-true curve alone tops out at 0.564·s and leaves corner
   * pinholes at full black — the two stated anchors (50% grey → 50%
   * area, 100% → corner-meeting) both hold on this curve.
   */
  const dotRadius = (c: number): number => {
    const rArea = s * Math.sqrt(c / Math.PI);
    if (rArea <= s / 2) return rArea;
    const t = Math.min(1, Math.max(0, (c - TOUCH) / (1 - TOUCH)));
    return s / 2 + (s / Math.SQRT2 - s / 2) * t;
  };

  const paths: Vec2[][] = [];
  const meta: { closed: boolean; filled: boolean }[] = [];
  for (const c of centers) {
    const cov = coverage(c.x, c.y);
    if (cov < floor) continue;
    const r = dotRadius(cov);
    const ring: Vec2[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (2 * Math.PI * k) / 24;
      ring.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    }
    paths.push(ring);
    meta.push({ closed: true, filled: true });
  }

  return { paths, meta, width: p.faceWidth, height: p.faceHeight };
}
