/**
 * Bitmap → relief geometry: a grey bitmap becomes a STOCK-FOOTPRINT
 * solid (box, or cylinder about the machine's 4th axis) with the image
 * carved into its surface — dark pixels cut DEEP, white stays at the
 * crown (`invert` flips that). From-scratch implementation; output is
 * a NON-INDEXED triangle soup (STLLoader convention — the app's feature
 * detection runs on non-indexed meshes), watertight manifold, position
 * + normal attributes only.
 *
 * Image → surface mapping (both shapes): image X runs with +x / around
 * θ; image Y is the v-down flip — image row 0 (TOP) lands at max y /
 * the +x end of the cylinder, matching the SVG artwork pipeline's
 * v_up = height − v.
 *
 * Sampling is BOX-AVERAGE: every lattice node averages the luma of the
 * whole image rectangle its cell covers (weighted pixel overlap, not
 * nearest-neighbour), so the mesh honors the source resolution without
 * fake interpolation (the lattice caps at the source pixel count).
 */

import * as THREE from 'three';
import type { GrayBitmap } from './bitmapImport';

/** ~0.5 mm default lattice pitch along each surface direction */
const DEFAULT_SPACING = 0.5;
/** hard cap per axis — a fine image never explodes the mesh */
const MAX_NODES = 256;

/**
 * Luma averaged over the image-space rect [u0,u1]×[v0,v1] (pixel
 * units), each pixel weighted by its overlap with the rect. `wrapU`
 * wraps the u lookup around the image width (a full-circumference
 * cylinder seam samples across the join); v clamps at the edges.
 * Empty rect → 255 (white: no relief).
 */
export function boxMeanGray(
  gray: GrayBitmap,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  wrapU = false,
): number {
  const W = gray.width;
  const H = gray.height;
  let sum = 0;
  let area = 0;
  const rowLo = Math.max(0, Math.floor(v0));
  const rowHi = Math.min(H, Math.ceil(v1));
  for (let py = rowLo; py < rowHi; py++) {
    const wy = Math.min(v1, py + 1) - Math.max(v0, py);
    if (wy <= 0) continue;
    const colLo = Math.floor(u0);
    const colHi = Math.ceil(u1);
    for (let c = colLo; c < colHi; c++) {
      const wx = Math.min(u1, c + 1) - Math.max(u0, c);
      if (wx <= 0) continue;
      const px = wrapU ? ((c % W) + W) % W : Math.min(W - 1, Math.max(0, c));
      sum += gray.data[py * W + px] * wx * wy;
      area += wx * wy;
    }
  }
  return area > 0 ? sum / area : 255;
}

/** darkness 0..1: default dark = deep; `invert` = bright = deep */
function darknessOf(luma: number, invert: boolean): number {
  return invert ? luma / 255 : 1 - luma / 255;
}

/** node cell bounds along one lattice axis: mid-edge inside, half-cells at the borders */
function cellBounds(axis: number[], i: number): [number, number] {
  const lo = i === 0 ? axis[0] : (axis[i - 1] + axis[i]) / 2;
  const hi = i === axis.length - 1 ? axis[axis.length - 1] : (axis[i] + axis[i + 1]) / 2;
  return [lo, hi];
}

const lattice = (n: number, span: number): number[] =>
  Array.from({ length: n }, (_, i) => -span / 2 + (i * span) / (n - 1));

export interface HeightmapBoxParams {
  /** relief face extent, mm (image X → +x) */
  spanX: number;
  /** relief face extent, mm (image top → +y) */
  spanY: number;
  /** stock thickness, mm — the box spans z ∈ [0, thickness] */
  thickness: number;
  /** carve depth below the crown at full darkness, mm */
  depth: number;
  /** true = bright pixels carve (a photo-negative); default dark carves */
  invert?: boolean;
  /** lattice pitch, mm (default 0.5) */
  sampleSpacing?: number;
}

/**
 * A box −spanX/2…+spanX/2 × −spanY/2…+spanY/2 × 0…thickness with the
 * relief carved into the TOP face: z = thickness − depth·darkness.
 */
export function heightmapBoxGeometry(
  gray: GrayBitmap,
  p: HeightmapBoxParams,
): THREE.BufferGeometry {
  const sp = p.sampleSpacing ?? DEFAULT_SPACING;
  const NX = Math.max(2, Math.min(Math.ceil(p.spanX / sp), gray.width, MAX_NODES));
  const NY = Math.max(2, Math.min(Math.ceil(p.spanY / sp), gray.height, MAX_NODES));
  const xs = lattice(NX, p.spanX);
  const ys = lattice(NY, p.spanY);
  const invert = p.invert ?? false;

  // per-node crown height: darkness = box-average of the node's cell rect
  const zTop = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    const [yLo, yHi] = cellBounds(ys, j);
    // v-down flip: y = +spanY/2 ↔ v = 0 (image top)
    const v0 = ((p.spanY / 2 - yHi) / p.spanY) * gray.height;
    const v1 = ((p.spanY / 2 - yLo) / p.spanY) * gray.height;
    for (let i = 0; i < NX; i++) {
      const [xLo, xHi] = cellBounds(xs, i);
      const u0 = ((xLo + p.spanX / 2) / p.spanX) * gray.width;
      const u1 = ((xHi + p.spanX / 2) / p.spanX) * gray.width;
      const d = darknessOf(boxMeanGray(gray, u0, u1, v0, v1), invert);
      zTop[j * NX + i] = p.thickness - p.depth * d;
    }
  }

  const pos: number[] = [];
  const vtx = (i: number, j: number): [number, number, number] => [xs[i], ys[j], zTop[j * NX + i]];
  const tri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

  // top face: two triangles per cell, CCW seen from +z
  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const a = vtx(i, j);
      const b = vtx(i + 1, j);
      const c = vtx(i + 1, j + 1);
      const d = vtx(i, j + 1);
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  // side walls: walk the top perimeter CCW-from-above, each directed
  // edge A→B drops a quad (A, botA, botB) + (A, botB, B) — outward normal
  const wall = (ai: number, aj: number, bi: number, bj: number) => {
    const a = vtx(ai, aj);
    const b = vtx(bi, bj);
    tri(a, [a[0], a[1], 0], [b[0], b[1], 0]);
    tri(a, [b[0], b[1], 0], b);
  };
  for (let i = 0; i < NX - 1; i++) wall(i, 0, i + 1, 0);
  for (let j = 0; j < NY - 1; j++) wall(NX - 1, j, NX - 1, j + 1);
  for (let i = NX - 1; i > 0; i--) wall(i, NY - 1, i - 1, NY - 1);
  for (let j = NY - 1; j > 0; j--) wall(0, j, 0, j - 1);
  // flat bottom at z = 0: fan about the center over the perimeter
  // lattice nodes, walked CCW-from-above but wound reversed → normal −z.
  // The fan's rim edges pair 1:1 with the walls' bottom edges (the walls
  // subdivide the perimeter at EVERY lattice node, so a 2-triangle quad
  // would leave its long edges unpaired) and radial edges pair between
  // adjacent fan triangles.
  const perim: [number, number, number][] = [];
  for (let i = 0; i < NX; i++) perim.push([xs[i], ys[0], 0]);
  for (let j = 1; j < NY; j++) perim.push([xs[NX - 1], ys[j], 0]);
  for (let i = NX - 2; i >= 0; i--) perim.push([xs[i], ys[NY - 1], 0]);
  for (let j = NY - 2; j >= 1; j--) perim.push([xs[0], ys[j], 0]);
  const cb: [number, number, number] = [
    (xs[0] + xs[NX - 1]) / 2,
    (ys[0] + ys[NY - 1]) / 2,
    0,
  ];
  for (let k = 0; k < perim.length; k++) tri(cb, perim[(k + 1) % perim.length], perim[k]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface HeightmapCylinderParams {
  /** stock radius, mm — the relief carves the OUTER surface */
  radius: number;
  /** stock length along the axis, mm (axis ∥ local x, −length/2…+length/2) */
  length: number;
  /** carve depth below the surface at full darkness, mm */
  depth: number;
  /** true = bright pixels carve; default dark carves */
  invert?: boolean;
  /** lattice pitch, mm along each of circumference and axis (default 0.5) */
  sampleSpacing?: number;
}

/**
 * A stock cylinder about the local X axis (the 4th-axis convention, the
 * primitiveGeometry precedent) with the relief carved RADially into the
 * outer surface: r(θ, axial) = radius − depth·darkness (dark = deep =
 * small radius). θ ∈ [−π, +π], θ = 0 at local +Z (the top of the wrap);
 * image width spans the FULL circumference and wraps at the seam; image
 * row 0 lands at the +length/2 end.
 *
 * Depth is clamped to 0.95·radius (negative depths clamp to 0) so the
 * surface radius never reaches the axis — the relief always leaves
 * 5% of the radius as a core.
 */
export function heightmapCylinderGeometry(
  gray: GrayBitmap,
  p: HeightmapCylinderParams,
): THREE.BufferGeometry {
  const sp = p.sampleSpacing ?? DEFAULT_SPACING;
  // defensive clamp: keep the carved surface off the axis
  const depth = Math.min(Math.max(p.depth, 0), p.radius * 0.95);
  const invert = p.invert ?? false;
  const Nth = Math.max(8, Math.min(Math.ceil((2 * Math.PI * p.radius) / sp), gray.width, MAX_NODES));
  const NA = Math.max(2, Math.min(Math.ceil(p.length / sp), gray.height, MAX_NODES));
  const xs = lattice(NA, p.length); // axial nodes; xs[0] = −length/2 (image BOTTOM row)
  const dTheta = (2 * Math.PI) / Nth;

  // surface radius per node: box-average over the node's cell, u WRAPPED
  const r = new Float64Array((Nth + 1) * NA);
  for (let j = 0; j < NA; j++) {
    const [xLo, xHi] = cellBounds(xs, j);
    // v-down flip: x = +length/2 ↔ v = 0 (image top row)
    const v0 = ((p.length / 2 - xHi) / p.length) * gray.height;
    const v1 = ((p.length / 2 - xLo) / p.length) * gray.height;
    for (let i = 0; i <= Nth; i++) {
      // u_i = (i/Nθ)·W; cell spans ± half a column, WRAPPED around the
      // seam so column 0 and column Nθ (same physical θ) average to the
      // same darkness — the duplicated seam closes without a crease
      const du = gray.width / Nth;
      const u0 = (i - 0.5) * du;
      const u1 = (i + 0.5) * du;
      const d = darknessOf(boxMeanGray(gray, u0, u1, v0, v1, true), invert);
      r[j * (Nth + 1) + i] = p.radius - depth * d;
    }
  }

  const pos: number[] = [];
  // sin(±π) is ±1.2e-16 in IEEE — force the seam columns' y to exact 0
  // so first and last θ columns share BITWISE positions and the mesh
  // closes watertight
  const vtx = (i: number, j: number): [number, number, number] => {
    const th = -Math.PI + i * dTheta;
    const rr = r[j * (Nth + 1) + i];
    const y = i === 0 || i === Nth ? 0 : rr * Math.sin(th);
    return [xs[j], y, rr * Math.cos(th)];
  };
  const tri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

  // outer displaced grid: two triangles per cell, outward normals
  for (let j = 0; j < NA - 1; j++) {
    for (let i = 0; i < Nth; i++) {
      const a = vtx(i, j);
      const b = vtx(i + 1, j);
      const c = vtx(i + 1, j + 1);
      const d = vtx(i, j + 1);
      tri(a, d, c);
      tri(a, c, b);
    }
  }
  // FLAT end disks: polygon fans sharing the grid's end-row ring
  // (bitwise-shared vertices → watertight). The ring rides the DISPLACED
  // end radius, which equals the full `radius` wherever the image ends
  // are white/undisplaced — the common relief-with-white-border case.
  const cap = (jEnd: number, outward: boolean) => {
    const center: [number, number, number] = [xs[jEnd], 0, 0];
    for (let i = 0; i < Nth; i++) {
      const a = vtx(i, jEnd);
      const b = vtx(i + 1, jEnd);
      if (outward) tri(center, b, a); // +x face: normal +x
      else tri(center, a, b); // −x face: normal −x
    }
  };
  cap(0, false);
  cap(NA - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
