/**
 * Rotary relief carving (PLAN.md §"Phase C — 4-axis relief (rotary carve)"):
 * the raster core (relief.ts) in the unwrapped (x, θ) frame. The machine
 * never moves Y on a rotary cut — the part rotates under the tool — so the
 * dexel grid maps straight onto machine words: axial x → X, θ → A
 * (degrees, datum + θ, accumulated monotonically across levels so huge
 * wraps pile up for the post's G92.4 inter-op shrink), and the tool's Z
 * is simply axisZ + cut radius.
 *
 * A dexel map r(x, θ) = the OUTER surface radius per cell is built by
 * radial raycasts from OUTSIDE inward (origin at stock radius + 10, first
 * hit = the outer boundary — the raster's from-above trick, radialized;
 * DoubleSide so inverted-winding meshes still hit, the mesh-noise
 * honesty the waterline's CCW normalization provides). The map is
 * DILATED with the tool's kernel in the unwrapped frame — angular
 * offsets convert to arc length at the model's MINIMUM surface radius,
 * the conservative scale (the spec's safety margin: while tool ≪ stock
 * radius the unwrap distortion is small; erring wide leaves a hair more
 * for the finishing pass, never a gouge).
 *
 * ONE op roughs and finishes (Alice's design, Makera's ladder
 * semantics): a COMPLETE full-wrap sweep at each depth level — constant
 * cut radius, a cell machined iff its compensated surface + allowance
 * sits below the plane — before descending to the next, and the ladder
 * ends at the first level with NOTHING LEFT TO CUT (the plane reaches
 * the deepest compensated surface; below that is the finishing pass's
 * job). `finishingOnly` skips the ladder.
 *
 * Three path strategies per sweep:
 * - 'horizontal' (default): cut along X at the real feed (G94), rapid
 *   the A step between constant-θ rows, serpentine row direction;
 * - 'vertical': continuous A cutting at constant X — A-only feed moves
 *   run G94 at the surface feed capped by ROTARY_FEED_DEG_MIN (the
 *   cylChamfer contract); the FINISHING rings coordinate A with Z and
 *   run G93 inverse-time;
 * - 'spiralWrap': X advances continuously while A turns — one helix per
 *   sweep, G93 inverse-time from the spiralCarve formula (path length
 *   at the cutting radius over feed, floored by the rotary ceiling) —
 *   the strategy Makera does NOT have.
 *
 * Entry safety (the pinned convention): travels happen at the safe
 * radius FIRST, the descent is a pure Z rapid at the destination, and
 * no rapid ever combines Z with X/A words. Blocked cells (radial
 * shadows: material behind an air gap along the ray — reachable by
 * nothing this op does) are counted and REPORTED, never silent.
 *
 * Pure functions all the way down (grid in → Move[] out) so vitest
 * covers this without worker harnesses; the generation worker that
 * hosts it is a thin shell (PLAN.md architecture rules).
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { Move, Tool } from '../core/types';
import { MAX_ROTARY_RPM, ROTARY_FEED_DEG_MIN, shortestATo } from './faceCylinder';

export type RotaryStrategy = 'horizontal' | 'vertical' | 'spiralWrap';

export interface RotaryCarveOptions {
  /** machine-space xyz triples, non-indexed (transformedPositions output,
   *  datum-rotated by the caller when an Index op precedes) */
  positions: ArrayLike<number>;
  /** the stock in the cutting frame: axial span, radius, axis height */
  x0: number;
  x1: number;
  radius: number;
  axisZ: number;
  tool: Tool;
  /** radial ladder rung, mm */
  stepDown: number;
  /** axial row spacing, mm (the grid pitch is stepOver/2, the raster
   *  convention; θ resolution matches that pitch at the stock radius) */
  stepOver: number;
  /** stock left above the compensated surface for a finishing pass, mm
   *  (0 = cut to the surface); lifts the whole compensated map — both the
   *  ladder's stop rule and the finishing pass's target, the same
   *  both-axis semantics as the raster */
  allowance: number;
  /** skip the roughing ladder: the single surface pass only */
  finishingOnly?: boolean;
  strategy?: RotaryStrategy;
  /** A at θ=0 (the index op's absolute datum) */
  datumAngle: number;
  /** the machine's accumulated A when this op starts — the sweep phase
   *  positions from it by the shortest rotation, then advances
   *  monotonically (wraps accumulate; the post shrinks with G92.4) */
  startA?: number;
  /** surface cutting feed, mm/min (linear) — A-only moves convert it to
   *  deg/min at the cutting radius, capped by the rotary ceiling */
  feed: number;
  plungeFeed: number;
  /** rapid-travel lift above the stock radius, mm */
  safeClearance: number;
}

export interface RotaryCarveResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** human-readable, surfaced verbatim in the op panel */
  warnings: string[];
  stats: {
    /** roughing levels (0 when finishingOnly) */
    levels: number;
    /** full wraps swept (rough levels + the finishing pass) */
    wraps: number;
    /** cutting passes (rows / rings / helices) */
    rows: number;
    /** cells with material shadowed behind an air gap */
    blockedCells: number;
  };
}

/**
 * Radial word emission threshold, mm — surface steps smaller than this
 * ride the previous move (the post's 3-decimal rounding would swallow
 * them anyway); the same folding mercy relief.ts gives z and y.
 */
const R_EMIT_TOL = 0.005;

/** Minimum air gap between material bands for a shadow to count, mm —
 * coincident backside sheets of open shells merge below this. */
const BLOCKED_GAP_MM = 0.05;

/** Finish plunges deeper than this below the stock surface get the
 * "run the ladder first" warning, mm (the raster's DEEP_WARN_MM
 * semantics: a surface pass should never bury the tool when the rough
 * ran ahead of it). */
const DEEP_WARN_MM = 2;

/** Surface sampling: r(x, θ) per cell. Misses read +Infinity (air: no
 * material along the ray — the raster's "air above" convention,
 * radius-direction inverted). */
export function buildDexelMap(
  positions: ArrayLike<number>,
  xMin: number,
  pitchX: number,
  nx: number,
  nTheta: number,
  radius: number,
  axisZ: number,
): Float64Array {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  const radii = new Float64Array(nx * nTheta).fill(Infinity);
  const ray = new THREE.Ray();
  const dTheta = (2 * Math.PI) / nTheta;
  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    // from OUTSIDE inward: the first hit IS the outer boundary — the
    // from-above trick radialized (a ray from the axis would find the
    // inner wall of a tube and call it the surface)
    ray.direction.set(0, -sin, -cos);
    ray.origin.set(0, (radius + 10) * sin, axisZ + (radius + 10) * cos);
    for (let i = 0; i < nx; i++) {
      ray.origin.x = xMin + i * pitchX;
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
      if (hit) {
        const r = Math.hypot(hit.point.y, hit.point.z - axisZ);
        if (r < radii[j * nx + i]) radii[j * nx + i] = r;
      }
    }
  }
  geo.dispose();
  return radii;
}

/** Material bands per material cell, for the shadow report: raycastAll
 * from outside, hits sorted by distance, merged into bands — a cell is
 * BLOCKED when material sits behind an air gap wider than
 * BLOCKED_GAP_MM: the tool meets the outer band first and this op never
 * programs a dive past an air pocket. Only material cells are probed
 * (air cells have no shadow to cast). Perf note: one all-hits raycast
 * per material cell is several single raycasts' cost — the generation
 * worker's charter, honest v1. */
function countBlockedCells(
  positions: ArrayLike<number>,
  xMin: number,
  pitchX: number,
  nx: number,
  nTheta: number,
  radius: number,
  axisZ: number,
  radii: Float64Array,
): number {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  geo.boundsTree = bvh;
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;

  let blocked = 0;
  const dTheta = (2 * Math.PI) / nTheta;
  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const ox = (radius + 10) * sin;
    const oz = axisZ + (radius + 10) * cos;
    for (let i = 0; i < nx; i++) {
      if (!(radii[j * nx + i] < radius - 1e-9)) continue; // air: nothing shadowed
      raycaster.ray.origin.set(xMin + i * pitchX, ox, oz);
      raycaster.ray.direction.set(0, -sin, -cos);
      const hits = raycaster.intersectObject(mesh, false);
      if (hits.length < 2) continue;
      // hits alternate enter/exit on a closed manifold — pair them into
      // material bands ([h0,h1], [h2,h3], …); a gap BETWEEN pairs is real
      // air (the gap between a solid's entry and exit sheets is interior,
      // hitless and solid — a naive chain of raw gaps would call every
      // solid part blocked). Open shells can leave an odd tail: it counts
      // as its own zero-width band (honest approximation, documented).
      const ds = hits.map((h) => h.distance).sort((p, q) => p - q);
      let bands = 1;
      for (let k = 1; 2 * k < ds.length; k++) {
        if (ds[2 * k] - ds[2 * k - 1] > BLOCKED_GAP_MM) bands++;
      }
      if (bands >= 2) blocked++;
    }
  }
  geo.dispose();
  return blocked;
}

/** Dilate the raw dexel with the tool's kernel, unwrapped: the
 * compensated surface at a cell is the SMALLEST radius the tool tip can
 * hold without cutting material — max over kernel offsets of
 *   raw(x+dx, θ+dθ) + kernelR(dx, arc(dθ)):
 *  - flat (and bull/vbit/corn, approximated conservatively): disc,
 *    kernelR = 0 — the flat bottom cannot pass inside any surface point
 *    the disc covers
 *  - ball: hemisphere, kernelR = √(r²−d²) − r — the tip hangs inside a
 *    sample it touches off-center by exactly the ball's sagitta
 * (the radius-frame image of relief.ts's lifted-tip heightmap: the tip
 * sits ABOVE the touched surface's radius, the max kernel picks the
 * binding constraint). Air neighbors (raw +Infinity) contribute
 * nothing; cells whose whole kernel sees air stay +Infinity. Angular
 * offsets convert to arc length at `refRadius` — the model's minimum
 * surface radius, the conservative scale (a smaller circle means more
 * cells per arc millimeter, so the kernel errs wide — the spec's
 * unwrap-distortion safety margin, built into the scale). */
export function dilateRotary(
  raw: Float64Array,
  nx: number,
  nTheta: number,
  pitchX: number,
  refRadius: number,
  tool: Tool,
): Float64Array {
  const r = tool.diameter / 2;
  const ball = tool.type === 'ball';
  const arc = (refRadius * 2 * Math.PI) / nTheta;
  const kX = Math.ceil(r / pitchX);
  const kTheta = Math.ceil(r / arc);
  // −Infinity = no kernel contact yet (air); raw air is +Infinity and is
  // SKIPPED as a kernel source — two different sentinels, as in relief.ts
  const out = new Float64Array(nx * nTheta).fill(-Infinity);
  for (let j = 0; j < nTheta; j++) {
    for (let i = 0; i < nx; i++) {
      const s = raw[j * nx + i];
      if (s === Infinity) continue;
      for (let dj = -kTheta; dj <= kTheta; dj++) {
        const jj = ((j + dj) % nTheta + nTheta) % nTheta; // θ wraps
        for (let di = -kX; di <= kX; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= nx) continue;
          const d = Math.hypot(di * pitchX, dj * arc);
          if (d > r) continue;
          const tip = ball ? s + Math.sqrt(r * r - d * d) - r : s;
          const cell = jj * nx + ii;
          if (tip > out[cell]) out[cell] = tip;
        }
      }
    }
  }
  return out;
}

export function rotaryCarve(o: RotaryCarveOptions): RotaryCarveResult {
  const empty = {
    moves: [] as Move[],
    estimatedMinutes: 0,
    warnings: [],
    stats: { levels: 0, wraps: 0, rows: 0, blockedCells: 0 },
  };
  if (o.positions.length < 9) return empty;
  if (o.stepDown <= 0) throw new Error('stepDown must be positive');
  if (o.stepOver <= 0) throw new Error('stepOver must be positive');
  if (o.allowance < 0) throw new Error('allowance must not be negative');
  if (o.x1 <= o.x0) throw new Error('the stock span is empty');
  if (o.radius <= 0) throw new Error('the stock radius must be positive');
  if (o.feed <= 0 || o.plungeFeed <= 0) throw new Error('feeds must be positive');

  const strategy = o.strategy ?? 'horizontal';
  const toolR = o.tool.diameter / 2;
  const safeZ = o.axisZ + o.radius + o.safeClearance;

  // Grid: the model's axial extent grown by the tool radius (dilation
  // spreads the surface exactly that far) plus a pitch, clamped to the
  // stock span. θ always covers the full circle.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < o.positions.length; i += 3) {
    const x = o.positions[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  const pitchX = o.stepOver / 2;
  const pad = toolR + pitchX;
  const gx0 = Math.max(o.x0, minX - pad);
  const gx1 = Math.min(o.x1, maxX + pad);
  if (gx1 <= gx0) throw new Error('the model does not overlap the stock span');
  const nx = Math.floor((gx1 - gx0) / pitchX) + 1;
  const nTheta = Math.max(16, Math.round((2 * Math.PI * o.radius) / pitchX));
  const thetaStepDeg = 360 / nTheta;

  const raw = buildDexelMap(o.positions, gx0, pitchX, nx, nTheta, o.radius, o.axisZ);
  let refRadius = o.radius;
  for (let k = 0; k < raw.length; k++) {
    if (raw[k] < refRadius) refRadius = raw[k];
  }
  // floor the scale: a model reaching the axis (a cone's tip) would make
  // the arc per θ cell 0 and the kernel extent infinite — below the tool
  // radius the unwrap distortion is moot anyway (the tool cannot fit)
  refRadius = Math.max(refRadius, toolR, pitchX);
  const dilated = dilateRotary(raw, nx, nTheta, pitchX, refRadius, o.tool);
  const blockedCells = countBlockedCells(
    o.positions,
    gx0,
    pitchX,
    nx,
    nTheta,
    o.radius,
    o.axisZ,
    raw,
  );

  // the compensated map the whole op targets: dilation + allowance, the
  // raster's both-axis lift
  const comp = new Float64Array(nx * nTheta);
  let minComp = o.radius;
  for (let k = 0; k < comp.length; k++) {
    // −Infinity = the kernel saw no material anywhere (air) — nothing to
    // cut; +Infinity would poison the min
    comp[k] = dilated[k] === -Infinity ? Infinity : dilated[k] + o.allowance;
    if (comp[k] < minComp) minComp = comp[k];
  }

  // The roughing ladder (Makera semantics): full sweeps at R − k·stepDown
  // while the plane has material below it — the first plane at/below the
  // deepest compensated surface has nothing left to cut, and the
  // finishing pass owns everything below that.
  const levels: number[] = [];
  if (!o.finishingOnly) {
    for (let rL = o.radius - o.stepDown; rL > minComp + 1e-9; rL -= o.stepDown) {
      levels.push(rL);
    }
  }

  const moves: Move[] = [];
  const warnings: string[] = [];
  let minutes = 0;
  let wraps = 0;
  let rows = 0;

  // Accumulated machine A: phase-position once to the datum by the
  // shortest rotation, then advance monotonically forever (wraps pile
  // up; the post's inter-op G92.4 shrink keeps the counter small). `jc`
  // is the θ row cursor each wrap walks with — every sweep starts at
  // row 0 of the NEXT revolution, so the part never rotates backward.
  let a = (o.startA ?? 0) + shortestATo(o.datumAngle, o.startA ?? 0);
  let jc = 0;
  /** forward A walk onto θ row `jt` of the current revolution (never
   *  backward: (jt − jc) mod nTheta steps) */
  const adv = (jt: number) => {
    a += ((jt - jc + nTheta) % nTheta) * thetaStepDeg;
    jc = jt;
  };
  /** advance past row `jt` (to jt+1), for after a cut AT that row */
  const advPast = (jt: number) => {
    a += ((jt + 1 - jc + nTheta) % nTheta) * thetaStepDeg;
    jc = jt + 1 === nTheta ? 0 : jt + 1;
  };

  let z = safeZ; // the tool starts at whatever height the last op left;
  // the first travel is a pure A rotation at that height (the
  // entry-safety convention — never a diagonal descent)

  /** emit a pure-Z rapid (retract or descent) — never combined with
   *  X/A, the pinned rule */
  const zTo = (target: number) => {
    if (Math.abs(target - z) < 1e-9) return;
    moves.push({ words: { z: target }, feed: 0, rapid: true });
    z = target;
  };
  const retract = () => zTo(safeZ);

  /** plunge from the safe radius to a cut radius at the destination,
   *  charging the clearance lift + `band` mm of material at the plunge
   *  feed (a rough level's band is its rung; the finish's is the
   *  allowance the rough left — with no rough, the full depth, warned) */
  const plungeTo = (cutZ: number, band: number) => {
    retract();
    zTo(o.axisZ + o.radius + Math.min(0.5, Math.max(0, o.safeClearance)));
    moves.push({ words: { z: cutZ }, feed: o.plungeFeed });
    z = cutZ;
    minutes += (o.safeClearance + band) / o.plungeFeed;
  };

  /** cutting runs along X at constant θ (a row): [i0, i1] cell ranges.
   *  level null = the finishing pass (cut wherever material exists);
   *  a number = the rough plane (cut where the surface sits below it). */
  const rowRuns = (level: number | null, j: number): [number, number][] => {
    const runs: [number, number][] = [];
    for (let i = 0; i < nx; i++) {
      const c = comp[j * nx + i];
      const cut = level === null ? c < o.radius - 1e-9 : c < level - 1e-9;
      if (!cut) continue;
      const last = runs.length - 1;
      if (last >= 0 && runs[last][1] === i - 1) runs[last][1] = i;
      else runs.push([i, i]);
    }
    return runs;
  };

  /** cutting runs around θ at constant X (a ring): [j0, j1] cell ranges */
  const ringRuns = (level: number | null, i: number): [number, number][] => {
    const runs: [number, number][] = [];
    for (let j = 0; j < nTheta; j++) {
      const c = comp[j * nx + i];
      const cut = level === null ? c < o.radius - 1e-9 : c < level - 1e-9;
      if (!cut) continue;
      const last = runs.length - 1;
      if (last >= 0 && runs[last][1] === j - 1) runs[last][1] = j;
      else runs.push([j, j]);
    }
    return runs;
  };

  /** A-only feed rate at a cutting radius: the surface feed converted to
   *  deg/min, capped by the rotary ceiling (the cylChamfer contract) */
  const degPerMin = (r: number) =>
    Math.min((o.feed * 360) / (2 * Math.PI * r), ROTARY_FEED_DEG_MIN);

  // ------------------------------------------------------------ rough levels
  for (const rL of levels) {
    const cutZ = o.axisZ + rL;
    wraps++;
    if (strategy === 'horizontal') {
      for (let j = 0; j < nTheta; j++) {
        adv(j);
        const runs = rowRuns(rL, j);
        if (runs.length === 0) continue; // the walk still advances row by row
        rows++;
        const fwd = j % 2 === 0; // serpentine along X
        retract();
        moves.push({ words: { a }, feed: 0, rapid: true });
        for (const [r0, r1] of runs) {
          const i0 = fwd ? r0 : r1;
          const i1 = fwd ? r1 : r0;
          moves.push({ words: { x: gx0 + i0 * pitchX }, feed: 0, rapid: true });
          plungeTo(cutZ, o.stepDown);
          moves.push({ words: { x: gx0 + i1 * pitchX }, feed: o.feed });
          minutes += ((i1 - i0) * pitchX) / o.feed;
        }
        retract();
      }
    } else if (strategy === 'vertical') {
      for (let i = 0; i < nx; i++) {
        const runs = ringRuns(rL, i);
        if (runs.length === 0) continue;
        rows++;
        retract();
        moves.push({ words: { x: gx0 + i * pitchX }, feed: 0, rapid: true });
        for (const [j0, j1] of runs) {
          adv(j0);
          moves.push({ words: { a }, feed: 0, rapid: true });
          plungeTo(cutZ, o.stepDown);
          const sweep = (j1 - j0 + 1) * thetaStepDeg;
          advPast(j1);
          moves.push({ words: { a }, feed: degPerMin(rL) });
          minutes += sweep / degPerMin(rL);
          retract();
        }
      }
      adv(0); // close the wrap before the next level
    } else {
      // spiralWrap: one complete helix per level — X advances over the
      // grid span while A turns a full wrap (the complete sweep, Makera's
      // ladder in helix form; empty stretches ride in air, honest
      // minutes). G93 inverse-time from the spiralCarve formula: path
      // length at the cutting radius over the surface feed, floored by
      // the rotary ceiling's minutes per wrap.
      const span = (nx - 1) * pitchX;
      retract();
      moves.push({ words: { a }, feed: 0, rapid: true });
      moves.push({ words: { x: gx0 }, feed: 0, rapid: true });
      plungeTo(cutZ, o.stepDown);
      const passMinutes = Math.max(
        Math.hypot(2 * Math.PI * rL, span) / o.feed,
        1 / MAX_ROTARY_RPM,
      );
      a += 360;
      jc = 0;
      moves.push({
        words: { x: gx0 + span, a },
        feed: 1 / passMinutes,
        comment: `helix r${rL.toFixed(2)}`,
      });
      minutes += passMinutes;
      rows++;
    }
  }

  // ----------------------------------------------------------- the finish
  // The surface pass follows the compensated radius per cell (allowance
  // included — the panel zeroes it on the finishing-only tick, the
  // raster's semantics). Deep plunges below the stock surface mean no
  // rough ran: warned, like the raster's "run a waterline first".
  wraps++;
  let maxFinishPlunge = 0;

  if (strategy === 'horizontal') {
    let rowFlip = false;
    for (let j = 0; j < nTheta; j++) {
      adv(j);
      const runs = rowRuns(null, j);
      if (runs.length === 0) continue;
      rows++;
      const fwd = rowFlip;
      rowFlip = !rowFlip;
      retract();
      moves.push({ words: { a }, feed: 0, rapid: true });
      for (const [r0, r1] of runs) {
        const i0 = fwd ? r0 : r1;
        const i1 = fwd ? r1 : r0;
        const step = fwd ? 1 : -1;
        moves.push({ words: { x: gx0 + i0 * pitchX }, feed: 0, rapid: true });
        const rStart = comp[j * nx + i0];
        const plunge = o.radius - rStart;
        if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
        plungeTo(o.axisZ + rStart, o.allowance);
        let lastR = rStart;
        let px = gx0 + i0 * pitchX;
        for (let i = i0 + step; i !== i1 + step; i += step) {
          const c = comp[j * nx + i];
          if (Math.abs(c - lastR) > R_EMIT_TOL) {
            const x = gx0 + i * pitchX;
            moves.push({ words: { x, z: o.axisZ + c }, feed: o.feed });
            minutes += Math.hypot(x - px, c - lastR) / o.feed;
            px = x;
            lastR = c;
          }
        }
        const xe = gx0 + i1 * pitchX;
        if (Math.abs(xe - px) > 1e-9) {
          const c = comp[j * nx + i1];
          moves.push({ words: { x: xe, z: o.axisZ + c }, feed: o.feed });
          minutes += Math.hypot(xe - px, c - lastR) / o.feed;
        }
        retract();
      }
    }
  } else if (strategy === 'vertical') {
    for (let i = 0; i < nx; i++) {
      const runs = ringRuns(null, i);
      if (runs.length === 0) continue;
      rows++;
      retract();
      moves.push({ words: { x: gx0 + i * pitchX }, feed: 0, rapid: true });
      for (const [j0, j1] of runs) {
        adv(j0);
        moves.push({ words: { a }, feed: 0, rapid: true });
        const rStart = comp[j0 * nx + i];
        const plunge = o.radius - rStart;
        if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
        plungeTo(o.axisZ + rStart, o.allowance);
        let lastA = a;
        let lastR = rStart;
        for (let j = j0 + 1; j <= j1; j++) {
          const c = comp[j * nx + i];
          advPast(j - 1);
          if (Math.abs(c - lastR) > R_EMIT_TOL) {
            // A+Z coordinated → G93 inverse time (the post's rule)
            const arc = Math.abs(a - lastA) * (Math.PI / 180) * Math.max(c, lastR);
            const passMinutes = Math.max(
              Math.hypot(arc, c - lastR) / o.feed,
              Math.abs(a - lastA) / 360 / MAX_ROTARY_RPM,
            );
            moves.push({ words: { a, z: o.axisZ + c }, feed: 1 / passMinutes });
            minutes += passMinutes;
            lastA = a;
            lastR = c;
          }
        }
        // the tail: fold skipped the run's end — bring it up to row j1
        // (a sits there from the last in-loop advance; never past, the
        // next cell may not be a cut cell)
        if (lastA !== a || Math.abs(comp[j1 * nx + i] - lastR) > 1e-9) {
          const c = comp[j1 * nx + i];
          const arc = Math.abs(a - lastA) * (Math.PI / 180) * Math.max(c, lastR);
          const passMinutes = Math.max(
            Math.hypot(arc, c - lastR) / o.feed,
            Math.abs(a - lastA) / 360 / MAX_ROTARY_RPM,
          );
          moves.push({ words: { a, z: o.axisZ + c }, feed: 1 / passMinutes });
          minutes += passMinutes;
        }
        retract();
      }
    }
  } else {
    // spiralWrap finish: one helix over the surface — θ sweeps a full
    // wrap while X walks the grid span, sampled once per grid column, Z
    // following the compensated radius, G93 per folded segment. Leading
    // and trailing AIR samples are trimmed (the pad corners carry
    // +Infinity surfaces — plunging at one would emit a garbage Z);
    // interior air gaps ride along, the helix is continuous by design.
    /** nearest θ row for grid column i — the helix samples the whole
     *  surface once as X crosses it */
    const jj = (i: number) => Math.min(nTheta - 1, Math.round((i * (nTheta - 1)) / (nx - 1)));
    const compAt = (i: number) => comp[jj(i) * nx + i];
    let iFirst = 0;
    while (iFirst < nx - 1 && !(compAt(iFirst) < o.radius - 1e-9)) iFirst++;
    let iLast = nx - 1;
    while (iLast > iFirst && !(compAt(iLast) < o.radius - 1e-9)) iLast--;
    if (compAt(iFirst) < o.radius - 1e-9) {
      retract();
      adv(0);
      moves.push({ words: { a }, feed: 0, rapid: true });
      moves.push({ words: { x: gx0 + iFirst * pitchX }, feed: 0, rapid: true });
      const rStart = compAt(iFirst);
      const plunge = o.radius - rStart;
      if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
      plungeTo(o.axisZ + rStart, o.allowance);
      // θ from the helix's own start, so the wrap closes exactly over the
      // material span (air-trimmed at both ends)
      const nCols = iLast - iFirst;
      const thetaPerColDeg = nCols > 0 ? 360 / nCols : 360;
      let lastR = rStart;
      let px = gx0 + iFirst * pitchX;
      let lastA = a;
      for (let i = iFirst + 1; i <= iLast; i++) {
        const c = compAt(i);
        const x = gx0 + i * pitchX;
        a += thetaPerColDeg;
        if (Math.abs(c - lastR) > R_EMIT_TOL) {
          const arc = Math.abs(a - lastA) * (Math.PI / 180) * Math.max(c, lastR);
          const passMinutes = Math.max(
            Math.hypot(arc, x - px, c - lastR) / o.feed,
            Math.abs(a - lastA) / 360 / MAX_ROTARY_RPM,
          );
          moves.push({ words: { x, a, z: o.axisZ + c }, feed: 1 / passMinutes });
          minutes += passMinutes;
          px = x;
          lastA = a;
          lastR = c;
        }
      }
      jc = 0; // the wrap closed
      rows++;
    }
  }

  if (blockedCells > 0) {
    warnings.push(
      `${blockedCells} grid cell(s) have material behind an air gap along the ray — ` +
        'this op cuts the outer surface only; that material is unreachable (radial shadow)',
    );
  }
  if (maxFinishPlunge > DEEP_WARN_MM && !o.finishingOnly) {
    warnings.push(
      `the surface sits ${maxFinishPlunge.toFixed(1)}mm below the stock radius — ` +
        'run the roughing ladder first (this pass buried the tool deeper than it should)',
    );
  }
  if (o.finishingOnly && maxFinishPlunge > DEEP_WARN_MM) {
    warnings.push(
      `finishing pass only, but the surface sits ${maxFinishPlunge.toFixed(1)}mm below the ` +
        'stock radius — untick "finishing pass only" so the ladder clears the bulk first',
    );
  }

  return {
    moves,
    estimatedMinutes: minutes,
    warnings,
    stats: {
      levels: levels.length,
      wraps,
      rows,
      blockedCells,
    },
  };
}