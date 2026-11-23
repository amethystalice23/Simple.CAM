/**
 * Flat V-carve — fill closed FILLED artwork with a variable-depth V-bit
 * groove (the lettering op; PLAN.md "true V-carving", Alice 2026-11-21:
 * "V-carve fills lettering out to vector outlines at variable depth",
 * scope ruled with her 2026-11-23: cap + clear with the same bit).
 *
 * THE DEPTH LAW (PLAN §S10, Ma/Bae/Choi 2012): at a medial-axis point
 * whose maximal inscribed circle has radius r, the tool tip sits at
 * depth (r − rt)/tanα below the surface; the swept cone flanks fill
 * the shape out to its outline exactly — depth tapering to zero at the
 * edges, crisp corners where r → 0. The toolpath therefore follows the
 * shape's MEDIAL AXIS (skeleton), NOT its outline: an outline pass can
 * never produce the V cross-section (the tip would gouge below the
 * final surface at the very edge that must stay at depth 0).
 *
 * EXTRACTION — a distance field, not computational geometry:
 *  1. Rasterize the even-odd region (the engraveFill fill rule) and run
 *     an exact Euclidean distance transform (Meijster) — r(p) per cell.
 *  2. A cell is SKELETAL iff no 8-neighbor's inscribed ball CONTAINS
 *     its own: ∀q: r(q) < r(p) + |pq|. That is the discrete medial
 *     axis in ball-containment form — and unlike local-max tests it
 *     KEEPS monotonic ridges (a tapering serif's bisector, where r
 *     grows along the ridge: the up-hill neighbor gains less than the
 *     step, so it cannot contain the ball). Slope cells fail exactly
 *     (|∇r| = 1 there: the up-hill neighbor gains the full step, so it
 *     contains the ball). Every non-skeletal cell's ball is inside some
 *     skeletal ball — coverage follows.
 *  3. Skeletal cells chain into polylines (8-connected, direction-
 *     preserving walk); tip ends run out naturally where r < one cell —
 *     crisp corners with no special-case extension code.
 *  4. Emission depth is the EXACT point-to-segment distance at each
 *     chain vertex (spatial-bucket segment index), not the quantized
 *     field — the grid only FINDS the ridge; the depth is honest to the
 *     artwork geometry, so every emitted ball is truly inscribed and
 *     nothing undercuts the outline.
 *
 * THE CAP (her ruling: clear with the same bit): where r·tanα exceeds
 * the usable cone height, depth clamps at `cap` (default: the cone
 * height — beyond it the shank-side would sweep). Capped interiors are
 * cleared by offset RING passes at constant depth `cap`, spaced by the
 * washboard law (stepover 0.5·tanα keeps the between-groove floor
 * within 0.25mm; a V-bit cannot make a truly flat floor — the pass
 * lines always score it). Uncapped shapes get a COARSE ring ladder
 * (0.4mm steps) as a coverage backstop — thin lettering offsets vanish
 * at the first ring level and pays for cores alone, so fine lettering
 * stays fast.
 *
 * SAFETY: every pass — ring or core — rides a ball inscribed in the
 * region (rings: the clipper offset distance is a lower bound on the
 * true distance; cores: the exact distance), so no pass can cut below
 * the intended dish. Branch crossings are legal at one depth (the sim
 * carries a vcarveFlat mode).
 */

import type { AxisWords, Move, Tool, Vec2 } from '../core/types';
import { offsetInward } from './clipper';
import { APPROACH_CLEARANCE, rotateToNearest } from './paths';

/** target raster cell, mm — depth accuracy scales with it */
const CELL_TARGET = 0.05;
/** hard cap on grid cells per axis (memory bound; coarse logos coarsen) */
const MAX_CELLS = 4000;
/** uncapped ring-ladder step, mm (coverage backstop; cores carry precision) */
const RING_LEVEL = 0.4;
/** washboard amplitude tolerated in capped clearing, mm */
const CLEAR_AMPLITUDE = 0.25;

export interface VCarveFlatOp {
  id: string;
  toolId: string;
  /** closed FILLED loops, machine XY, even-odd regions (holes subtract) */
  loops: Vec2[][];
  /** machine Z of the artwork's surface plane */
  surfaceZ: number;
  /** XY cut feed, mm/min (G94) */
  feed: number;
  /** straight-plunge feed, mm/min */
  plungeFeed: number;
  /** rapid clearance above the surface, mm */
  clearance: number;
  /** depth cap, mm; default (and hard ceiling) = the cone's usable height */
  maxDepth?: number;
  /** capped-clearing ring stepover, mm; default from the washboard law */
  clearStepOver?: number;
}

export interface VCarveFlatResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** medial-axis passes emitted (the groove network) */
  corePasses: number;
  /** ring passes emitted (backstop + capped clearing) */
  ringPasses: number;
  /** deepest emitted cut, mm */
  maxDepthCut: number;
  /** true when the shape is locally wider than the bit can reach */
  capped: boolean;
}

/** One cut pass: a polyline in XY with a per-vertex depth (mm below surface). */
interface Pass {
  pts: Vec2[];
  depth: number[];
  closed: boolean;
}

/** Even-odd nesting depth of a point against a loop, by ray cast. */
function insideLoop(p: Vec2, loop: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i];
    const b = loop[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** A point strictly inside `loop` (a longest-edge midpoint nudged toward
 *  the local interior), for nesting tests. null when degenerate. */
function interiorPoint(loop: Vec2[]): Vec2 | null {
  let bi = 0;
  let bl = -1;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > bl) {
      bl = l;
      bi = i;
    }
  }
  if (bl <= 0) return null;
  const a = loop[bi];
  const b = loop[(bi + 1) % loop.length];
  const prev = loop[(bi - 1 + loop.length) % loop.length];
  const next = loop[(bi + 2) % loop.length];
  const ux = (b.x - a.x) / bl;
  const uy = (b.y - a.y) / bl;
  // inward normal: toward the average of the neighboring vertices
  const cx = (prev.x + next.x) / 2;
  const cy = (prev.y + next.y) / 2;
  let nx = -uy;
  let ny = ux;
  if ((cx - a.x) * nx + (cy - a.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  for (const t of [0.2, 0.5, 0.8]) {
    const p = { x: (a.x + b.x) / 2 + (ux * (t - 0.5)) * bl + nx * 1e-3, y: (a.y + b.y) / 2 + (uy * (t - 0.5)) * bl + ny * 1e-3 };
    if (insideLoop(p, loop)) return p;
  }
  return null;
}

function signedArea2(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s;
}

/** Orient the even-odd loop set for clipper (outer CCW, holes CW) — the
 *  artwork's authoring orientation is arbitrary. Returns null-safe: loops
 *  whose interior point can't be found are dropped (degenerate slivers). */
function normalizeRegion(loops: Vec2[][]): Vec2[][] {
  const out: Vec2[][] = [];
  for (let i = 0; i < loops.length; i++) {
    const loop = loops[i];
    if (loop.length < 3) continue;
    const p = interiorPoint(loop);
    if (!p) continue;
    let depth = 0;
    for (let j = 0; j < loops.length; j++) {
      if (j !== i && insideLoop(p, loops[j])) depth++;
    }
    const ccw = signedArea2(loop) >= 0;
    const wantCcw = depth % 2 === 0; // even nesting = outer
    out.push(wantCcw === ccw ? loop : [...loop].reverse());
  }
  return out;
}

/** Exact Euclidean distance transform (Meijster/Felzenszwalb two-phase)
 *  over the inside mask. Returns per-cell distance in CELLS to the nearest
 *  outside cell. The grid is padded with outside cells on every side, so
 *  every column and row contains at least one. */
function edt(mask: Uint8Array, nx: number, ny: number): Float64Array {
  const INF = 1 << 24;
  // phase 1: vertical squared distances per column
  const g = new Int32Array(nx * ny);
  for (let x = 0; x < nx; x++) {
    let d = INF;
    for (let y = 0; y < ny; y++) {
      const i = y * nx + x;
      if (!mask[i]) d = 0;
      else if (d < INF) d++;
      g[i] = d === INF ? INF : d * d;
    }
    d = INF;
    for (let y = ny - 1; y >= 0; y--) {
      const i = y * nx + x;
      if (!mask[i]) d = 0;
      else if (d < INF) d++;
      const v = d === INF ? INF : d * d;
      if (v < g[i]) g[i] = v;
    }
  }
  // phase 2: parabola lower envelope per row (Felzenszwalb–Huttenlocher)
  const dt = new Float64Array(nx * ny);
  const sites = new Int32Array(nx);
  const bounds = new Float64Array(nx + 1);
  for (let y = 0; y < ny; y++) {
    const row = y * nx;
    const gr = (i: number) => g[row + i];
    let k = 0;
    sites[0] = 0;
    bounds[0] = -Infinity;
    bounds[1] = Infinity;
    for (let q = 1; q < nx; q++) {
      let s1 = (q * q - sites[k] * sites[k] + gr(q) - gr(sites[k])) / (2 * (q - sites[k]));
      while (s1 <= bounds[k]) {
        k--;
        s1 = (q * q - sites[k] * sites[k] + gr(q) - gr(sites[k])) / (2 * (q - sites[k]));
      }
      k++;
      sites[k] = q;
      bounds[k] = s1;
      bounds[k + 1] = Infinity;
    }
    let j = 0;
    for (let q = 0; q < nx; q++) {
      while (bounds[j + 1] < q) j++;
      dt[row + q] = Math.sqrt((q - sites[j]) * (q - sites[j]) + gr(sites[j]));
    }
  }
  return dt;
}

/** Spatial bucket index over the region's SEGMENTS for exact point
 *  distances (the emission depth is honest, not grid-quantized). */
class SegmentIndex {
  private readonly bucket = 2; // mm
  private readonly dim: number;
  private readonly cells: number[][];

  constructor(private readonly segs: { a: Vec2; b: Vec2 }[], private readonly lo: Vec2, hi: Vec2) {
    this.dim = Math.ceil(Math.max(hi.x - lo.x, hi.y - lo.y) / this.bucket) + 1;
    this.cells = Array.from({ length: this.dim * this.dim }, () => []);
    segs.forEach((s, i) => {
      const x0 = Math.floor((Math.min(s.a.x, s.b.x) - lo.x) / this.bucket);
      const x1 = Math.floor((Math.max(s.a.x, s.b.x) - lo.x) / this.bucket);
      const y0 = Math.floor((Math.min(s.a.y, s.b.y) - lo.y) / this.bucket);
      const y1 = Math.floor((Math.max(s.a.y, s.b.y) - lo.y) / this.bucket);
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const bx0 = Math.max(0, Math.min(this.dim - 1, bx));
          const by0 = Math.max(0, Math.min(this.dim - 1, by));
          this.cells[by0 * this.dim + bx0].push(i);
        }
      }
    });
  }

  /** exact distance from p to the nearest segment (the full minimum over
   *  the local buckets — NEVER an early return: a far bucket processed
   *  first could hand back a non-minimal value, and an overestimated
   *  inscribed radius is an overcut). */
  distance(p: Vec2, bound: number): number {
    const r = Math.max(1, Math.ceil(bound / this.bucket));
    const cx = Math.floor((p.x - this.lo.x) / this.bucket);
    const cy = Math.floor((p.y - this.lo.y) / this.bucket);
    let best = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const bx = cx + dx;
        const by = cy + dy;
        if (bx < 0 || by < 0 || bx >= this.dim || by >= this.dim) continue;
        for (const si of this.cells[by * this.dim + bx]) {
          const s = this.segs[si];
          const vx = s.b.x - s.a.x;
          const vy = s.b.y - s.a.y;
          const wx = p.x - s.a.x;
          const wy = p.y - s.a.y;
          const len2 = vx * vx + vy * vy;
          let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(p.x - (s.a.x + t * vx), p.y - (s.a.y + t * vy));
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

/** Rasterize even-odd: per grid row, sorted crossings → inside spans. */
function rasterize(loops: Vec2[][], x0: number, y0: number, cell: number, nx: number, ny: number): Uint8Array {
  const mask = new Uint8Array(nx * ny);
  const xs: number[] = [];
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * cell;
    xs.length = 0;
    for (const loop of loops) {
      for (let i = 0, k = loop.length - 1; i < loop.length; k = i++) {
        const a = loop[k];
        const b = loop[i];
        if ((a.y <= y) !== (b.y <= y)) {
          xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    const row = j * nx;
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const xa = xs[m];
      const xb = xs[m + 1];
      // cell centers strictly inside the span: x0 + (i+0.5)·cell ∈ (xa, xb)
      const iA = Math.max(0, Math.ceil((xa - x0) / cell - 0.5 + 1e-9));
      const iB = Math.min(nx - 1, Math.floor((xb - x0) / cell - 0.5 - 1e-9));
      for (let i = iA; i <= iB; i++) mask[row + i] = 1;
    }
  }
  return mask;
}

/** The 8-neighborhood in (di, dj, step-length) form. */
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * The ball-dominance medial axis: cell p is SKELETAL iff no 8-neighbor q
 * has a ball that CONTAINS p's — r(q) < r(p) + |pq|, strictly. Slope
 * cells die (the up-gradient neighbor gains the full step, equality
 * contains); monotonic ridges survive (the up-ridge neighbor gains
 * sinγ·step < step). Values in CELLS.
 */
function ridgeMask(mask: Uint8Array, dt: Float64Array, nx: number, ny: number): Uint8Array {
  const ridge = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (!mask[i] || dt[i] < 1) continue;
      let skeletal = true;
      for (const [dx, dy, step] of NEIGHBORS) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue; // outside = r 0, never dominates
        const j = qy * nx + qx;
        if (dt[j] >= dt[i] + step) {
          skeletal = false;
          break;
        }
      }
      if (skeletal) ridge[i] = 1;
    }
  }
  return ridge;
}

/** Chain ridge cells into polylines: 8-connected walk preferring the
 *  continuation of the incoming direction; bidirectional so a walk that
 *  starts mid-ridge extends both ways. Returns index chains. */
function chainRidge(ridge: Uint8Array, nx: number, ny: number): number[][] {
  const used = new Uint8Array(ridge.length);
  const at = (x: number, y: number) => y * nx + x;
  const chains: number[][] = [];
  const walk = (start: number, reverse: boolean): number[] => {
    const chain: number[] = [];
    let cur = start;
    let pdx = 0;
    let pdy = 0;
    for (;;) {
      used[cur] = 1;
      chain.push(cur);
      const x = cur % nx;
      const y = (cur - x) / nx;
      let best = -1;
      let bestScore = -Infinity;
      for (const [dx, dy] of NEIGHBORS) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= nx || qy >= ny) continue;
        const j = at(qx, qy);
        if (!ridge[j] || used[j]) continue;
        // continuation preference, then diagonal-free straightness
        const len = dx === 0 || dy === 0 ? 1 : Math.SQRT2;
        const score = (pdx * dx + pdy * dy) / len + (len === 1 ? 0.01 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = j;
        }
      }
      if (best < 0) break;
      const bx = best % nx;
      const by = (best - bx) / nx;
      pdx = bx - x;
      pdy = by - y;
      cur = best;
    }
    if (reverse) chain.reverse();
    return chain;
  };
  for (let i = 0; i < ridge.length; i++) {
    if (!ridge[i] || used[i]) continue;
    const forward = walk(i, false);
    // if the start had other unvisited neighbors, walk the other way too
    const x = i % nx;
    const y = (i - x) / nx;
    const hasOther = NEIGHBORS.some(([dx, dy]) => {
      const qx = x + dx;
      const qy = y + dy;
      return qx >= 0 && qy >= 0 && qx < nx && qy < ny && ridge[at(qx, qy)] === 1 && !used[at(qx, qy)];
    });
    if (hasOther) {
      const back = walk(i, true); // reverses onto the start cell again
      back.push(...forward.slice(1)); // forward[0] is the same start cell
      chains.push(back);
    } else {
      chains.push(forward);
    }
  }
  return chains;
}

/** Greedy chord decimation: keep a vertex when it leaves the running chord
 *  by > 0.01mm in XY or > 0.005mm in depth. Endpoints always kept. */
interface PathPoint {
  x: number;
  y: number;
  depth: number;
}

function decimateChain(pts: PathPoint[]): PathPoint[] {
  if (pts.length <= 2) return pts;
  const out: PathPoint[] = [pts[0]];
  let a = 0;
  for (let i = 2; i < pts.length; i++) {
    let ok = true;
    const pa = pts[a];
    const pi = pts[i];
    const vx = pi.x - pa.x;
    const vy = pi.y - pa.y;
    const len = Math.hypot(vx, vy) || 1;
    for (let k = a + 1; k < i; k++) {
      const pk = pts[k];
      // perpendicular XY distance to the chord
      const perp = Math.abs((pk.x - pa.x) * vy - (pk.y - pa.y) * vx) / len;
      if (perp > 0.01) {
        ok = false;
        break;
      }
      const t = len > 0 ? ((pk.x - pa.x) * vx + (pk.y - pa.y) * vy) / (len * len) : 0;
      if (Math.abs(pk.depth - (pa.depth + t * (pi.depth - pa.depth))) > 0.005) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      out.push(pts[i - 1]);
      a = i - 1;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A V-bit's usable cone height, mm — (Ø/2 − tipØ/2)/tan(vAngle/2), the
 *  deepest the flank cuts before the shank-side would sweep. 0 for a
 *  degenerate or non-V tool (panels re-prefill the cap from it). */
export function vbitConeHeight(tool: Tool): number {
  if (tool.type !== 'vbit' || tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
    return 0;
  }
  const rt = (tool.tipDiameter ?? 0) / 2;
  const w = tool.diameter / 2 - rt;
  if (w <= 0) return 0;
  return w / Math.tan(((tool.vAngle / 2) * Math.PI) / 180);
}

export function vcarveFlat(op: VCarveFlatOp, tool: Tool): VCarveFlatResult {
  const loops = op.loops.filter((l) => l.length >= 3);
  if (loops.length === 0) {
    throw new Error('v-carve needs at least one closed filled shape — pick painted paths from the artwork');
  }
  if (op.feed <= 0) throw new Error('v-carve feed must be positive');
  if (op.plungeFeed <= 0) throw new Error('v-carve plunge feed must be positive');
  if (tool.type !== 'vbit') {
    throw new Error('v-carve needs a V-bit — pick an engraving bit from the library');
  }
  if (tool.vAngle === undefined || tool.vAngle <= 0 || tool.vAngle >= 180) {
    throw new Error('v-carve tool needs a sane included tip angle (0–180°)');
  }
  const alpha = ((tool.vAngle / 2) * Math.PI) / 180;
  const tanA = Math.tan(alpha);
  const rt = (tool.tipDiameter ?? 0) / 2;
  const coneW = tool.diameter / 2 - rt;
  if (coneWidthGuardInvalid(tool)) {
    throw new Error(`the Ø${tool.diameter} bit's tip is its full diameter — no cone flank to carve with`);
  }
  // the cone's usable height is the hard ceiling: below the shank-side only
  const coneHeight = coneW / tanA;
  const cap = Math.max(0, Math.min(op.maxDepth ?? coneHeight, coneHeight));
  const capReach = rt + cap * tanA; // horizontal flank reach at the cap
  // capped-clearing ring stepover: the washboard law (floor within
  // CLEAR_AMPLITUDE between grooves) bounded by what still overlaps
  // capped-clearing ring stepover: the washboard law (floor within
  // CLEAR_AMPLITUDE between grooves) bounded by what still overlaps —
  // unless the op overrides it (the panel's Clear stepover knob)
  const clearStep =
    op.clearStepOver && op.clearStepOver > 0
      ? op.clearStepOver
      : Math.max(0.05, Math.min(2 * CLEAR_AMPLITUDE * tanA, 1.8 * capReach));

  const region = normalizeRegion(loops);
  if (region.length === 0) {
    throw new Error('v-carve found no area in the selected shapes — they are degenerate');
  }

  // raster grid: bbox + pad (pad guarantees outside cells on every edge)
  let loX = Infinity;
  let loY = Infinity;
  let hiX = -Infinity;
  let hiY = -Infinity;
  for (const loop of region) {
    for (const p of loop) {
      if (p.x < loX) loX = p.x;
      if (p.y < loY) loY = p.y;
      if (p.x > hiX) hiX = p.x;
      if (p.y > hiY) hiY = p.y;
    }
  }
  const pad = Math.max(2 * CELL_TARGET, capReach) + 0.5;
  loX -= pad;
  loY -= pad;
  hiX += pad;
  hiY += pad;
  const cell = Math.max(CELL_TARGET, Math.max(hiX - loX, hiY - loY) / MAX_CELLS);
  const nx = Math.max(2, Math.ceil((hiX - loX) / cell));
  const ny = Math.max(2, Math.ceil((hiY - loY) / cell));
  const mask = rasterize(region, loX, loY, cell, nx, ny);
  if (!mask.some((v) => v === 1)) {
    throw new Error('v-carve found no area in the selected shapes — thinner than the raster');
  }
  const dt = edt(mask, nx, ny);

  // exact segment distances for honest emission depths
  const segs: { a: Vec2; b: Vec2 }[] = [];
  for (const loop of region) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      segs.push({ a: loop[j], b: loop[i] });
    }
  }
  const segIndex = new SegmentIndex(segs, { x: loX, y: loY }, { x: hiX, y: hiY });

  // CORE PASSES — chain the skeletal cells, read exact depths
  const ridge = ridgeMask(mask, dt, nx, ny);
  const cores: Pass[] = [];
  let capped = false;
  let deepest = 0;
  for (const chain of chainRidge(ridge, nx, ny)) {
    const pts: PathPoint[] = [];
    for (let ci = 0; ci < chain.length; ci++) {
      const cellIdx = chain[ci];
      const cx = cellIdx % nx;
      const cy = (cellIdx - cx) / nx;
      let x = loX + (cx + 0.5) * cell;
      let y = loY + (cy + 0.5) * cell;
      const bound = dt[cellIdx] * cell + 2 * cell;
      // REPROJECT onto the true ridge: the raster only locates it to half a
      // cell — an off-center groove would run ~cell/tanα shallow and leave a
      // hairline ridge along every stroke. The ridge is the LOCAL MAX of the
      // distance along the chain's perpendicular: sample ±1 cell and keep
      // the farthest-from-the-wall position.
      if (chain.length > 1) {
        const prevIdx = chain[Math.max(0, ci - 1)];
        const nextIdx = chain[Math.min(chain.length - 1, ci + 1)];
        const px = prevIdx % nx;
        const py = (prevIdx - px) / nx;
        const qx = nextIdx % nx;
        const qy = (nextIdx - qx) / nx;
        const ux = qx - px;
        const uy = qy - py;
        const ul = Math.hypot(ux, uy);
        if (ul > 0) {
          const nxp = -uy / ul;
          const nyp = ux / ul;
          let bestR = -1;
          let bestT = 0;
          for (let t = -cell; t <= cell + 1e-9; t += cell / 3) {
            const rr = segIndex.distance({ x: x + nxp * t, y: y + nyp * t }, bound + cell);
            if (rr > bestR) {
              bestR = rr;
              bestT = t;
            }
          }
          x += nxp * bestT;
          y += nyp * bestT;
        }
      }
      const exact = segIndex.distance({ x, y }, bound);
      const r =
        exact < Infinity
          ? exact
          : Math.max(0, dt[cellIdx] * cell - (cell * Math.SQRT2) / 2);
      let depth = (r - rt) / tanA;
      if (r - rt > cap * tanA) {
        depth = cap;
        capped = true;
      }
      if (depth <= 0.005) continue;
      const last = pts[pts.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) < 1e-6) continue; // plateau dedupe
      pts.push({ x, y, depth });
      if (depth > deepest) deepest = depth;
    }
    if (pts.length === 0) continue;
    const simp = decimateChain(pts);
    if (simp.some((p) => p.depth > 0.005)) {
      cores.push({ pts: simp.map((p) => ({ x: p.x, y: p.y })), depth: simp.map((p) => p.depth), closed: false });
    }
  }

  // RING PASSES — coarse ladder below the cap (coverage backstop), dense
  // clearing above it (the capped interiors, her same-bit ruling)
  const rings: Pass[] = [];
  {
    let d = 1.5 * RING_LEVEL;
    let level = 0;
    for (;;) {
      if (level > 20000) break; // pathological guard, never reached in practice
      const off = offsetInward(region, d);
      if (off.length === 0) break;
      const depth = Math.min(Math.max(0, (d - rt)) / tanA, cap);
      if (d - rt > cap * tanA) capped = true;
      if (depth > 0.005) {
        for (const loop of off) {
          rings.push({ pts: loop, depth: loop.map(() => depth), closed: true });
          if (depth > deepest) deepest = depth;
        }
      }
      // the ladder lands EXACTLY on capReach before switching to clearing
      // spacing — the transition ring's flank then touches the dish exactly
      // (a jump past it would leave an under-cut annulus between the last
      // dish ring and the cap)
      d += d < capReach ? Math.min(RING_LEVEL, capReach - d) : clearStep;
      level++;
    }
  }

  // EMIT: rings shallow→deep (they come out that way), then the groove
  // network deepest-first (deterministic order: depth desc, then y, x)
  const moves: Move[] = [];
  let minutes = 0;
  let cur: Vec2 | null = null;
  const safeZ = op.surfaceZ + op.clearance;

  const emit = (pass: Pass, note: string): void => {
    let pts = pass.pts;
    let depths = pass.depth;
    if (pass.closed) {
      pts = rotateToNearest(pts, cur);
      // the ring is closed — the cut list ends back at the start point
    } else if (
      cur &&
      Math.hypot(pts[pts.length - 1].x - cur.x, pts[pts.length - 1].y - cur.y) <
        Math.hypot(pts[0].x - cur.x, pts[0].y - cur.y)
    ) {
      pts = [...pts].reverse();
      depths = [...depths].reverse();
    }
    const startZ = op.surfaceZ - depths[0];
    moves.push({ words: { x: pts[0].x, y: pts[0].y }, feed: 0, rapid: true, comment: note });
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    moves.push({ words: { z: startZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
    moves.push({
      words: { z: startZ },
      feed: op.plungeFeed,
      comment: `plunge to ${startZ.toFixed(2)}`,
    });
    minutes += APPROACH_CLEARANCE / op.plungeFeed;
    let prev = { x: pts[0].x, y: pts[0].y, z: startZ };
    let lastZ = startZ;
    const last = pass.closed ? pts.length : pts.length - 1;
    for (let i = 1; i <= last; i++) {
      const k = pass.closed ? i % pts.length : i;
      const z = op.surfaceZ - depths[k];
      const w: AxisWords = { x: pts[k].x, y: pts[k].y };
      if (Math.abs(z - lastZ) > 1e-9) w.z = z;
      moves.push({ words: w, feed: op.feed });
      minutes += Math.hypot(pts[k].x - prev.x, pts[k].y - prev.y, z - prev.z) / op.feed;
      prev = { x: pts[k].x, y: pts[k].y, z };
      lastZ = z;
    }
    moves.push({ words: { z: safeZ }, feed: 0, rapid: true });
    cur = pts[0];
  };

  for (const r of rings) {
    emit(r, `v-carve ring pass, ${(r.depth[0] ?? 0).toFixed(2)}mm deep`);
  }
  const ordered = cores
    .map((c, i) => ({ c, i, max: Math.max(...c.depth) }))
    .sort((a, b) => b.max - a.max || a.i - b.i)
    .map((e) => e.c);
  for (const c of ordered) {
    emit(c, 'v-carve groove pass');
  }

  if (moves.length === 0) {
    throw new Error('v-carve found nothing to cut — the shapes are thinner than the tool tip');
  }
  return {
    moves,
    estimatedMinutes: minutes,
    corePasses: cores.length,
    ringPasses: rings.length,
    maxDepthCut: deepest,
    capped,
  };
}

/** true when the bit's flat tip is its full diameter (no cone flank at all) */
function coneWidthGuardInvalid(tool: Tool): boolean {
  return tool.diameter / 2 - (tool.tipDiameter ?? 0) / 2 <= 1e-9;
}

