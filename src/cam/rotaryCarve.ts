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
 * - 'spiralWrap': MULTI-COIL helix (Alice, 2026-10-28: "a result very
 *   similar to vertical except each vertical twisted very slightly to
 *   the side to form a spiral") — lead = stepOver per REVOLUTION, each
 *   revolution sweeping the full circle across a one-step-over band of
 *   columns, so the coils tile the axial span the way vertical's rings
 *   do; the v1 single-revolution helix never touched most of the model.
 *   Rough runs fold into ONE G93 move each (X and A advance linearly
 *   together — the machine's own interpolation IS the coil); the finish
 *   emits every grid sample (the chord lesson). G93 throughout.
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
  /**
   * CROSS-ORIENTATION STANDING MATERIAL (P1 of the 4D carve, PLAN.md
   * "True optimized 4D carve"): the standing grid from the PREVIOUS
   * rotaryCarve op, as the recalculation pass threads it — grid in,
   * grid out (the result carries this op's grid). STOCK-RADIUS space
   * (the committee's unanimous 2026-10-29 verdict, 3 members on
   * measured evidence): physical truth survives tool/allowance/
   * orientation changes, while a compensated store both lies to the
   * skim planner (clips 65.6% of a second op's transitions) and cannot
   * be un-dilated (comp − standing is a variable offset, not a
   * constant). Omitted = fresh stock (today's standalone behavior,
   * byte-identical — pinned by probe maxdiff 0 against the old
   * closure). Monotone: cuts only ever LOWER a cell. Re-indexed to
   * this op's datum internally when an Index op intervened.
   */
  standing?: StandingGrid;
}

export interface StandingGrid {
  /** physical stock radius still standing per cell, θ-major: cell (i,j)
   *  at index j·nx + i — STOCK-RADIUS space (the P1 contract) */
  r: Float64Array;
  nx: number;
  nTheta: number;
  /** the grid's X pitch (gx0 + i·pitchX), mm */
  pitchX: number;
  /** grid X origin, mm */
  gx0: number;
  /** stock radius / axis height the grid was minted against */
  radius: number;
  axisZ: number;
  /** the datumAngle the grid's θ=0 row corresponds to (the datum of the
   *  op that minted it). An op at a different datum RE-INDEXES the grid
   *  (θ rows shift by Δdatum/θstep, wrapped) — a rotation of the part
   *  under a fixed grid, probe-verified a pure re-index (max err 7e-15). */
  datumAngle: number;
}

/** Re-index a standing grid to a new datum: θ rows shift by the wrapped
 *  row shift Δdatum/θstepDeg. The grid is (x,θ) in the STOCK's material
 *  frame; rotating the part by Δ carries each cell's standing radius to
 *  the row Δ rows earlier (the material at new-θ row j stood at old row
 *  j + shift). Monotone structure preserved (values just move). */
export function reindexStanding(grid: StandingGrid, datumAngle: number, nTheta: number): StandingGrid {
  const dThetaDeg = 360 / nTheta;
  let shift = Math.round((grid.datumAngle - datumAngle) / dThetaDeg);
  shift = ((shift % nTheta) + nTheta) % nTheta;
  if (shift === 0) return grid;
  const r = new Float64Array(grid.r.length);
  for (let j = 0; j < grid.nTheta; j++) {
    const src = (j + shift) % grid.nTheta;
    r.set(grid.r.subarray(src * grid.nx, (src + 1) * grid.nx), j * grid.nx);
  }
  return { ...grid, r, nTheta, datumAngle };
}

export interface RotaryCarveResult {
  moves: Move[];
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** human-readable, surfaced verbatim in the op panel */
  warnings: string[];
  /**
   * The standing grid OUT (the P1 cross-op contract): the physical
   * radius still standing per cell after this op — its `standing`
   * input (or a fresh grid) updated by every plane swept and the
   * finishing pass, at THIS op's datum. Thread into the next
   * rotaryCarve op's options.
   */
  standing: StandingGrid;
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

/** Material bands per dexel cell, for the shadow map: ALL radial hits
 *  along the ray paired enter/exit — a cell is SHADOWED when material sits
 *  behind an air gap wider than BLOCKED_GAP_MM (band ≥ 2). Shadowed
 *  material is unreachable by anything this op does (the tool meets the
 *  outer band first; a cut past an air pocket is never programmed), so it
 *  is KEPT: runs never sweep across shadow cells and the rough predicate
 *  never cuts them — Alice's 2026-10-27 knight report: the vertical rings
 *  swept long θ arcs straight through the head's shadowed core at the
 *  plane, ~58.5k model voxels removed from material no tool can reach.
 *  Only material cells are probed (air casts no shadow). */
export function shadowMap(
  positions: ArrayLike<number>,
  xMin: number,
  pitchX: number,
  nx: number,
  nTheta: number,
  radius: number,
  axisZ: number,
  radii: Float64Array,
): Uint8Array {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
  const bvh = new MeshBVH(geo, { targetLeafSize: 1 });

  const shadowed = new Uint8Array(nx * nTheta);
  const dTheta = (2 * Math.PI) / nTheta;
  const ray = new THREE.Ray();
  for (let j = 0; j < nTheta; j++) {
    const theta = j * dTheta;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    // from OUTSIDE inward, the same launch point as the dexel map — a
    // shadowed cell's hidden material sits strictly between two surface
    // hits the dexel map cannot see
    ray.direction.set(0, -sin, -cos);
    ray.origin.set(0, (radius + 10) * sin, axisZ + (radius + 10) * cos);
    for (let i = 0; i < nx; i++) {
      if (!(radii[j * nx + i] < radius - 1e-9)) continue; // air: nothing shadowed
      ray.origin.x = xMin + i * pitchX;
      const hits = bvh.raycast(ray, THREE.DoubleSide);
      if (hits.length < 2) continue;
      // hits alternate enter/exit on a closed manifold — pair them into
      // material bands ([h0,h1], [h2,h3], …); a gap BETWEEN pairs is real
      // air (the gap between a solid's entry and exit sheets is interior,
      // hitless and solid — a naive chain of raw gaps would call every
      // solid part shadowed). Open shells can leave an odd tail: it counts
      // as its own zero-width band (honest approximation, documented).
      const ds = hits.map((h) => h.distance).sort((p, q) => p - q);
      let bands = 1;
      for (let k = 1; 2 * k < ds.length; k++) {
        if (ds[2 * k] - ds[2 * k - 1] > BLOCKED_GAP_MM) bands++;
      }
      if (bands >= 2) shadowed[j * nx + i] = 1;
    }
  }
  geo.dispose();
  return shadowed;
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
 * nothing; cells whose whole kernel sees air stay +Infinity.
 *
 * ARC SCALE, per SOURCE cell (2026-10-26 knight field report — the
 * sideways-bulge fix): the angular offset dθ converts to arc length at
 * the SOURCE SAMPLE'S OWN radius s, not one global constant. A single
 * global scale (the model's min radius) smeared the kernel ~10× too
 * far around the circumference wherever the surface sat wide of the
 * floor (the knight's core runs near the axis while the head rides at
 * 15-22mm — the head's features bulged sideways into neighboring θ).
 * Per-source conversion is also the physically exact form: the tool
 * touches the surface AT the sample, so the local circumference is the
 * one that matters. The scan window is bounded using `refRadius` (the
 * STOCK radius — the widest circumference needs the most θ neighbors);
 * each source then filters by its own, tighter distance. */
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
  const dThetaRad = (2 * Math.PI) / nTheta;
  const kX = Math.ceil(r / pitchX);
  // the widest arc per cell (at the stock radius) sets the window; each
  // source then filters by its own, tighter distance
  const arcMax = (refRadius * 2 * Math.PI) / nTheta;
  const kTheta = Math.ceil(r / arcMax) + 1;
  // −Infinity = no kernel contact yet (air); raw air is +Infinity and is
  // SKIPPED as a kernel source — two different sentinels, as in relief.ts
  const out = new Float64Array(nx * nTheta).fill(-Infinity);
  for (let j = 0; j < nTheta; j++) {
    for (let i = 0; i < nx; i++) {
      const s = raw[j * nx + i];
      if (s === Infinity) continue;
      // THIS sample's arc scale: the circumference the tool actually
      // rides when it touches the surface here
      const arc = s * dThetaRad;
      const djMax = arc > 0 ? Math.min(kTheta, Math.ceil(r / arc)) : kTheta;
      for (let dj = -djMax; dj <= djMax; dj++) {
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
    standing: { r: new Float64Array(0), nx: 0, nTheta: 0, pitchX: 0, gx0: 0, radius: 0, axisZ: 0, datumAngle: 0 },
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
  const safeZ = o.axisZ + o.radius + o.safeClearance;

  // Grid: the FULL stock axial span — the sweep is a COMPLETE Makera
  // pass (Alice's 2026-10-26 knight report: partial bands hugging the
  // part left "lots of leftover stock close to the outer edge" standing
  // around the model, which the finish's flanks then rubbed into walls
  // of yellow). θ always covers the full circle.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < o.positions.length; i += 3) {
    const x = o.positions[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  if (maxX <= o.x0 || minX >= o.x1) {
    throw new Error('the model does not overlap the stock span');
  }
  const pitchX = o.stepOver / 2;
  const gx0 = o.x0;
  const gx1 = o.x1;
  const nx = Math.floor((gx1 - gx0) / pitchX) + 1;
  // The θ grid: rows spaced `stepOver` of ARC at the stock radius, EVERY
  // row cut (Alice's 2026-10-26 third-round report — "an entire shell of
  // yellow"): a strided θ sweep (every 2nd row) leaves the intermediate
  // angular rows un-planed at full height, and the tool's own Ø then
  // shaves that skin at FULL DEPTH in one pass — a gouge the length of
  // the sweep, all of it yellow. In the rotary frame a "row" is an
  // angular position of the PART, not a spatial neighbor: the only
  // honest stride is 1. Step-over spacing (arc ≤ stepOver, tool Ø
  // covers the shaving between rows at ≤ the plane's depth) comes from
  // nTheta, not from skipping rows.
  const nTheta = Math.max(24, Math.round((2 * Math.PI * o.radius) / o.stepOver));
  const thetaStepDeg = 360 / nTheta;

  const raw = buildDexelMap(o.positions, gx0, pitchX, nx, nTheta, o.radius, o.axisZ);
  // the dilation's scan-window bound: the STOCK radius (the widest
  // circumference any sample can ride — per-source arc conversion below
  // does the real work; this only caps the neighbor scan). The old
  // min-surface-radius scale was the 2026-10-26 sideways-bulge bug.
  const dilated = dilateRotary(raw, nx, nTheta, pitchX, o.radius, o.tool);
  // SHADOW MAP (2026-10-27): cells whose ray shows material behind an air
  // gap — unreachable by anything this op programs (the tool meets the
  // outer band first). Runs must never sweep across one and the rough
  // predicate never cuts one; the blocked-cell count below is its sum.
  const shadow = shadowMap(
    o.positions,
    gx0,
    pitchX,
    nx,
    nTheta,
    o.radius,
    o.axisZ,
    raw,
  );
  let blockedCells = 0;
  for (let k = 0; k < shadow.length; k++) blockedCells += shadow[k];

  // the compensated map the whole op targets: dilation + allowance, the
  // raster's both-axis lift. WASTE cells (air — no model within the
  // tool's reach) target the WASTE FLOOR = the model's deepest
  // compensated point, the same plane the ladder bottoms near (the
  // raster's clearFloorZ = model-floor analog): a complete Makera sweep
  // clears every bit of stock that is not the part, in layers from the
  // CROWN DOWN — the partial bands that hugging the part left standing
  // rinds around the outer edge are gone.
  const comp = new Float64Array(nx * nTheta);
  let wasteFloor = o.radius;
  for (let k = 0; k < comp.length; k++) {
    if (dilated[k] !== -Infinity && dilated[k] + o.allowance < wasteFloor) {
      wasteFloor = dilated[k] + o.allowance;
    }
  }
  for (let k = 0; k < comp.length; k++) {
    // −Infinity = air = WASTE: not nothing-to-cut — stock that clears
    // flat to the floor alongside the part
    comp[k] = dilated[k] === -Infinity ? wasteFloor : dilated[k] + o.allowance;
  }
  const minComp = wasteFloor;

  // The roughing ladder (Makera semantics): full sweeps at R − k·span/n
  // where span = radius − minComp and n = ceil(span/stepDown).
  // Every rough plane is evenly distributed to avoid thin chips in POM.
  // The first plane at/below the deepest compensated surface has
  // nothing left to cut, and the finishing pass owns everything below that.
  const span = o.radius - minComp;
  const levels: number[] = [];
  if (!o.finishingOnly && span > 0) {
    const n = Math.ceil(span / o.stepDown);
    for (let k = 1; k < n; k++) {
      levels.push(o.radius - (k * span) / n);
    }
  }

  // THE STANDING GRID (P1): the PHYSICAL stock radius still standing per
  // cell — the caller's threaded grid when the op sequence shares one
  // (the 4D carve), else fresh stock; re-indexed to THIS op's datum if
  // an Index op intervened (a rotation of the part under a fixed grid
  // is a pure θ-row shift, reindexStanding). STOCK-RADIUS space (the
  // unanimous 2026-10-29 committee verdict: physical truth survives
  // tool/allowance/orientation changes; a compensated store cannot be
  // un-dilated and lies to the skim planner). Semantics-preserving
  // freeze of the old per-op closure (member-2 probe, maxdiff 0): a
  // fresh grid = stock radius everywhere the ladder hasn't reached,
  // EXCEPT finishingOnly standalone — no ladder, the documented
  // "bulk already cleared ahead" assumption (the raster's), warned by
  // the deep-plunge note — where cells stand at their comp targets.
  // `cutTo` below records exactly the planes swept, GUARDED by the cut
  // predicate (a plane removes material only where the sweep's
  // `comp < level` held — the closure's rule; unguarded, a finishing-only
  // op would pay crown tolls between rings, the test pins it).
  const standing: StandingGrid =
    o.standing && o.standing.nx === nx
      ? o.standing.nTheta === nTheta && o.standing.pitchX === pitchX && o.standing.gx0 === gx0
        ? reindexStanding(o.standing, o.datumAngle, nTheta)
        : o.standing // a shape change (different stepOver/stock): treat as
      :              // fresh stock below — the grid's cells no longer line up
    {
      r: levels.length === 0 ? Float64Array.from(comp) : new Float64Array(nx * nTheta).fill(o.radius),
      nx,
      nTheta,
      pitchX,
      gx0,
      radius: o.radius,
      axisZ: o.axisZ,
      datumAngle: o.datumAngle,
    };
  if (standing.r.length !== nx * nTheta) {
    throw new Error(
      'standing grid must be nx × nTheta (thread the grid from the prior op of the same stock)',
    );
  }
  /** record a plane swept: material below it is GONE, monotone — only
   *  where the sweep's cut predicate held at this level */
  const cutTo = (level: number) => {
    for (let k = 0; k < standing.r.length; k++) {
      if (comp[k] < level - 1e-9 && standing.r[k] > level) standing.r[k] = level;
    }
  };

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
  /** forward A walk onto θ row `jt` of the current revolution — never
   *  backward, and NEVER modulo-erased: a walk onto row nTheta−1 from
   *  row 0 is (nTheta−1) steps, but a walk PAST row nTheta−1 (advPast,
   *  closing a full ring) is nTheta steps — the % nTheta form erased
   *  exactly that case, and every full-circle ring emitted a
   *  zero-degree A move (2026-10-26 "vertical spikes": rings cut
   *  points, not circles) */
  const fwdSteps = (to: number) => {
    let steps = to - jc;
    if (steps < 0) steps += nTheta;
    return steps;
  };
  const adv = (jt: number) => {
    a += fwdSteps(jt) * thetaStepDeg;
    jc = jt;
  };
  /** advance past row `jt` (to jt+1), for after a cut AT that row —
   *  jt+1 === nTheta wraps the cursor to 0 while ADDING the full
   *  remaining step count (a closed ring advanced a whole wrap) */
  const advPast = (jt: number) => {
    const to = jt + 1 === nTheta ? 0 : jt + 1;
    let steps = to - jc;
    if (steps <= 0) steps += nTheta; // closing the wrap adds the full circle
    a += steps * thetaStepDeg;
    jc = to;
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

  /** the clearance plane the transitions skim at: the highest Z the
   *  rapid legs will cross (the rotate leg's arc + the traverse leg's
   *  start), plus a small approach gap. Alice's 2026-10-26 rule: a
   *  finishing pass never needs the whole crown lift between rings —
   *  go up-then-across when the next cut sits higher, across-then-down
   *  when it sits lower; the planar cross-sections the rapid rides over
   *  are what actually bound the safe height, not the crown. */
  const skimClearance = 1;

  /** plunge straight from the current height to a cut radius at the
   *  destination, charging the emitted descent at the plunge feed. The
   *  caller must already have lifted the tool to a height that clears
   *  the rapid legs (goCut below does that). */
  const plungeFromTo = (fromZ: number, cutZ: number) => {
    moves.push({ words: { z: cutZ }, feed: o.plungeFeed });
    minutes += Math.max(0, fromZ - cutZ) / o.plungeFeed;
    z = cutZ;
  };

  /** Standing stock radius at a cell — NOT the compensated target: what
   *  the tool would actually hit passing over the cell NOW. Reads the
   *  P1 standing GRID (physical radius per cell, cross-op persistent
   *  when the caller threads it) — the FREEZE of the old per-op ladder
   *  reconstruction (committee 2026-10-29, probe maxdiff 0: the closure
   *  always tracked plane heights, and `cutTo` records exactly the
   *  planes swept, so the numbers are identical standalone). The old
   *  comp-based read was the 2026-10-26 skim bug: it credited cells as
   *  clear BEFORE the planes cut them, so transitions could clip the
   *  rough's own leftover ledges. `phase` survives in the signature
   *  only (spanMaxR/arcMaxR/goCut pass it); grid state replaced it.
   *  finishingOnly: no ladder of its own — the documented "bulk already
   *  cleared ahead" assumption (the raster's), warned by the deep-
   *  plunge note; a THREADED grid carries the truth from the prior op,
   *  the standalone assumption reads cells at stock radius. */
  const standingR = (i: number, j: number, _phase: number) => standing.r[j * nx + i];
  /** tallest standing height over an X span at one θ row (a traverse leg) */
  const spanMaxR = (ia: number, ib: number, j: number, phase: number) => {
    let m = -Infinity;
    for (let i = Math.min(ia, ib); i <= Math.max(ia, ib); i++) {
      const c = standingR(i, j, phase);
      if (c > m) m = c;
    }
    return m;
  };
  /** tallest standing height over a θ arc at one X column (a rotate
   *  leg), walking forward from ja to jb inclusive (the cursor's
   *  direction — the arc the A rapid actually sweeps) */
  const arcMaxR = (ja: number, jb: number, i: number, phase: number) => {
    let m = -Infinity;
    const steps = (jb - ja + nTheta) % nTheta;
    for (let s = 0; s <= steps; s++) {
      const c = standingR(i, (ja + s) % nTheta, phase);
      if (c > m) m = c;
    }
    return m;
  };

  /** the tool's current X grid column (−1 = not yet positioned — the op
   *  entry rides the tool-change park height, the crown, from the last
   *  op's exit) */
  let col = -1;

  /** Alice's 2026-10-26 skim transition (replaces the full crown
   *  retract between every ring): read the height the next cut sits at;
   *  lift (pure Z) ONLY to the tallest thing the rapid legs cross —
   *  the rotate leg at the old column, the traverse leg at the new row
   *  — plus a small gap; up-then-across when the next cut sits higher,
   *  across-then-down when it sits lower. `phase` = levels completed:
   *  the legs cross what the rough has ACTUALLY cleared so far, and
   *  when nothing has (the op entry) the crown is the truth. */
  const goCut = (
    toJ: number | null,
    toI: number,
    targetR: number,
    phase: number,
  ) => {
    const rotLeg = col < 0 || toJ === null ? -Infinity : arcMaxR(jc, toJ, col, phase);
    const travLeg =
      col < 0 ? -Infinity : spanMaxR(col, toI, toJ === null ? jc : toJ, phase);
    const skimZ =
      o.axisZ +
      Math.max(
        rotLeg,
        travLeg,
        targetR,
        col < 0 || (phase <= 0 && levels.length > 0) ? o.radius : -Infinity,
      ) +
      skimClearance;
    if (z < skimZ) zTo(skimZ); // up first — never below the legs
    if (toJ !== null) {
      adv(toJ);
      moves.push({ words: { a }, feed: 0, rapid: true });
    }
    if (col !== toI) {
      moves.push({ words: { x: gx0 + toI * pitchX }, feed: 0, rapid: true });
    }
    plungeFromTo(z, o.axisZ + targetR);
    col = toI;
  };

  /** cutting runs along X at constant θ (a row): [i0, i1] cell ranges.
   *  level null = the finishing pass (cut wherever material exists);
   *  a number = the rough plane (cut where the surface sits below it).
   *  SHADOW cells are REPORTED, never excluded (the 2026-10-27 committee
   *  verdict): a shadowed cell's own OUTER band (raw) is reachable — the
   *  unreachable material is the hidden core behind the air gap, and the
   *  cut predicate comp < level already guarantees the plane never dips
   *  below raw (comp ≥ raw everywhere the flute reaches, per-source
   *  dilation), so exclusion deletes only legitimate cuts and strands
   *  stock (the knight hole core + head flanks). */
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

  /** cutting runs around θ at constant X (a ring): [j0, j1] cell ranges —
   *  the rowRuns predicate, radialized */
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

  // Pass stride: the θ grid itself is already spaced `stepOver` of arc
  // (nTheta above), so horizontal sweeps cut EVERY row — a θ stride is
  // the 2026-10-26 "entire shell of yellow" bug: a strided sweep leaves
  // the intermediate angular rows un-planed at full height, and the
  // tool's own Ø then shaves that skin at FULL DEPTH in one pass. The
  // X columns (vertical rings) are a LINEAR axis — the stride there is
  // a genuine step-over (tool Ø covers between rings).
  const arcPerCell = (2 * Math.PI * o.radius) / nTheta;
  const ringStride = Math.max(1, Math.round(o.stepOver / arcPerCell));

  /** the θ row indices a horizontal sweep cuts: every row around the
   *  full wrap — a complete Makera sweep (Alice's semantics) */
  const thetaRows = () => {
    const out: number[] = [];
    for (let j = 0; j < nTheta; j++) out.push(j);
    return out;
  };

  /** the X column indices a vertical sweep cuts: every `ringStride`-th
   *  column across the grid span */
  const xCols = () => {
    const out: number[] = [];
    for (let i = 0; i < nx; i += ringStride) out.push(i);
    return out;
  };

  /** A-only feed rate at a cutting radius: the surface feed converted to
   *  deg/min, capped by the rotary ceiling (the cylChamfer contract) */
  const degPerMin = (r: number) =>
    Math.min((o.feed * 360) / (2 * Math.PI * r), ROTARY_FEED_DEG_MIN);

  // ------------------------------------------------- spiralWrap shared core
  // MULTI-COIL (Alice, 2026-10-28 — un-parking the 2026-10-26 redesign:
  // "what i expected was a result very similar to vertical except each
  // vertical twisted very slightly to the side to form a spiral"): the
  // helix lead is stepOver per REVOLUTION, so each revolution sweeps the
  // full circle across a one-step-over band of columns and the coils tile
  // the axial span the way vertical's rings do. The v1 single-revolution
  // helix ("a quiet, steeply angled curve… like string draped over it")
  // crossed every θ row exactly once — it never touched most of the model.
  // Sampling: one θ row per sample, X advancing stepOver/nTheta per row,
  // both snapped to the grid (θ indexed to the sampling grid, the parked
  // spec); a sample cuts on vertical's own ring predicate at its column.
  const spiral = strategy === 'spiralWrap';
  const nRev = spiral ? Math.max(1, Math.ceil(((nx - 1) * pitchX) / o.stepOver)) : 0;
  const totalSamples = nRev * nTheta;
  /** grid column of sample s (X = gx0 + col·pitchX) */
  const sampleCol = spiral
    ? (s: number) => Math.min(nx - 1, Math.round((s * o.stepOver) / (nTheta * pitchX)))
    : () => 0;
  /** maximal runs of consecutive samples with material below `level`
   *  (null = the finishing predicate, comp < stock radius) — the same
   *  predicate as vertical's ringRuns, walked along the helix */
  const spiralRuns = spiral
    ? (level: number | null): [number, number][] => {
        const runs: [number, number][] = [];
        for (let s = 0; s < totalSamples; s++) {
          const c = comp[(s % nTheta) * nx + sampleCol(s)];
          const cut = level === null ? c < o.radius - 1e-9 : c < level - 1e-9;
          if (!cut) continue;
          const last = runs.length - 1;
          if (last >= 0 && runs[last][1] === s - 1) runs[last][1] = s;
          else runs.push([s, s]);
        }
        return runs;
      }
    : () => [];
  /** entry to a run: crown retract → A forward to the run's row → X over
   *  → plunge. Crown-based transitions (the parked note): runs SKIP
   *  standing stock — comp ≥ level means the plane sits INSIDE material
   *  there, so the helix never rides the plane across a gap (a ride would
   *  be a sideways plow); A only ever advances (the wrap rule). */
  const enterSpiralRun = spiral
    ? (s: number, targetR: number) => {
        retract();
        adv(s % nTheta);
        moves.push({ words: { a }, feed: 0, rapid: true });
        const i = sampleCol(s);
        moves.push({ words: { x: gx0 + i * pitchX }, feed: 0, rapid: true });
        plungeFromTo(z, o.axisZ + targetR);
        col = i;
      }
    : () => {};

  // ------------------------------------------------------------ rough levels
  levels.forEach((rL, levelIndex) => {
    wraps++;
    if (strategy === 'horizontal') {
      for (const j of thetaRows()) {
        const runs = rowRuns(rL, j);
        if (runs.length === 0) continue; // the walk still advances row by row
        rows++;
        const fwd = j % 2 === 0; // serpentine along X
        let first = true;
        for (const [r0, r1] of runs) {
          const i0 = fwd ? r0 : r1;
          const i1 = fwd ? r1 : r0;
          goCut(first ? j : null, i0, rL, levelIndex);
          first = false;
          moves.push({ words: { x: gx0 + i1 * pitchX }, feed: o.feed });
          minutes += ((i1 - i0) * pitchX) / o.feed;
        }
      }
    } else if (strategy === 'vertical') {
      for (const i of xCols()) {
        const runs = ringRuns(rL, i);
        if (runs.length === 0) continue;
        rows++;
        for (const [j0, j1] of runs) {
          goCut(j0, i, rL, levelIndex);
          const sweep = (j1 - j0 + 1) * thetaStepDeg;
          advPast(j1);
          moves.push({ words: { a }, feed: degPerMin(rL) });
          minutes += sweep / degPerMin(rL);
        }
      }
    } else {
      // spiralWrap rough: the multi-coil helix at the plane, runs folded —
      // X and A both advance linearly along a run, so ONE G93 move per run
      // (modal Z at the plane) IS the helix segment: the machine's own
      // linear interpolation traces the coil. The run may span many
      // revolutions (a full cylinder level is a single run, the whole
      // axial sweep); air stretches broke the runs and were skipped by
      // the crown transitions above.
      for (const [s0, s1] of spiralRuns(rL)) {
        rows++;
        enterSpiralRun(s0, rL);
        if (s1 > s0) {
          const x0 = gx0 + sampleCol(s0) * pitchX;
          const x1 = gx0 + sampleCol(s1) * pitchX;
          const da = (s1 - s0) * thetaStepDeg;
          const arc = (da * Math.PI * rL) / 180;
          const passMinutes = Math.max(
            Math.hypot(x1 - x0, arc) / o.feed,
            (s1 - s0) * (thetaStepDeg / 360) / MAX_ROTARY_RPM,
          );
          a += da;
          jc = s1 % nTheta;
          moves.push({
            words: { x: x1, a },
            feed: 1 / passMinutes,
            comment: `helix r${rL.toFixed(2)}`,
          });
          minutes += passMinutes;
          col = sampleCol(s1);
        }
      }
    }
    // the plane swept the FULL grid width (a complete Makera pass —
    // every strategy sweeps whole rows/rings/coils): material below it
    // is gone, in every cell the plane sat above. Records the P1 grid.
    cutTo(rL);
  });

  // ----------------------------------------------------------- the finish
  // The surface pass follows the compensated radius per cell (allowance
  // included — the panel zeroes it on the finishing-only tick, the
  // raster's semantics). Deep plunges below the stock surface mean no
  // rough ran: warned, like the raster's "run a waterline first".
  wraps++;
  let maxFinishPlunge = 0;

  if (strategy === 'horizontal') {
    let rowFlip = false;
    for (const j of thetaRows()) {
      const runs = rowRuns(null, j);
      if (runs.length === 0) continue;
      rows++;
      const fwd = rowFlip;
      rowFlip = !rowFlip;
      let first = true;
      for (const [r0, r1] of runs) {
        const i0 = fwd ? r0 : r1;
        const i1 = fwd ? r1 : r0;
        const step = fwd ? 1 : -1;
        const rStart = comp[j * nx + i0];
        const plunge = o.radius - rStart;
        if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
        goCut(first ? j : null, i0, rStart, levels.length);
        first = false;
        let px = gx0 + i0 * pitchX;
        let lastC = rStart;
        // FULL POLYLINE — one vertex per cell (2026-10-27 knight report:
        // R_EMIT_TOL folding kept vertices >0.005 apart, and the straight
        // CHORD between two kept vertices dove through material wherever
        // comp dipped between them — worst knight move rode a 20mm Z dive
        // over 1.6mm of X as a cut; the polyline through every cell stays
        // above the surface, a chord cuts the corner). The count is small
        // (runs are ≤nx cells) and F is modal on G1, so every cell emits.
        for (let i = i0 + step; i !== i1 + step; i += step) {
          const c = comp[j * nx + i];
          const x = gx0 + i * pitchX;
          moves.push({ words: { x, z: o.axisZ + c }, feed: o.feed });
          minutes += Math.hypot(x - px, c - lastC) / o.feed;
          px = x;
          lastC = c;
        }
      }
    }
  } else if (strategy === 'vertical') {
    for (const i of xCols()) {
      const runs = ringRuns(null, i);
      if (runs.length === 0) continue;
      rows++;
      for (const [j0, j1] of runs) {
        const rStart = comp[j0 * nx + i];
        const plunge = o.radius - rStart;
        if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
        goCut(j0, i, rStart, levels.length);
        let lastA = a;
        let lastR = rStart;
        // FULL POLYLINE, radialized — one vertex per θ cell (the same
        // 2026-10-27 chord bug: R_EMIT_TOL folding's chord dove through
        // flank material wherever comp dipped between kept vertices).
        // A+Z coordinated → G93 inverse time (the post's rule), every
        // cell emitted, tail move included by the loop itself.
        for (let j = j0 + 1; j <= j1; j++) {
          const c = comp[j * nx + i];
          advPast(j - 1);
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
        // the loop already emitted the run's end (j1) — nothing to tail
      }
    }
  } else {
    // spiralWrap finish — MULTI-COIL: the helix follows the compensated
    // surface per grid sample (X, A, Z coordinated → G93 inverse time, the
    // post's rule; EVERY cell emits — the 2026-10-27 chord lesson: a folded
    // chord between vertices dives through flank material). Runs skip
    // standing stock with crown transitions; a run may span revolutions.
    for (const [s0, s1] of spiralRuns(null)) {
      rows++;
      const i0 = sampleCol(s0);
      const rStart = comp[(s0 % nTheta) * nx + i0];
      const plunge = o.radius - rStart;
      if (plunge > maxFinishPlunge) maxFinishPlunge = plunge;
      enterSpiralRun(s0, rStart);
      let lastA = a;
      let lastR = rStart;
      let px = gx0 + i0 * pitchX;
      for (let s = s0 + 1; s <= s1; s++) {
        const j = s % nTheta;
        const i = sampleCol(s);
        const c = comp[j * nx + i];
        const x = gx0 + i * pitchX;
        adv(j); // one θ row per sample — A advances thetaStep, monotonic
        const arc = Math.abs(a - lastA) * (Math.PI / 180) * Math.max(c, lastR);
        const passMinutes = Math.max(
          Math.hypot(arc, x - px, c - lastR) / o.feed,
          Math.abs(a - lastA) / 360 / MAX_ROTARY_RPM,
        );
        moves.push({ words: { x, a, z: o.axisZ + c }, feed: 1 / passMinutes });
        minutes += passMinutes;
        lastA = a;
        lastR = c;
        px = x;
      }
      col = sampleCol(s1);
    }
  }

  // leave the tool at the crown — the next op's entry ride and the
  // export footer both expect a safe exit height
  retract();

  // the finish owns everything below the last rough plane: material
  // remains ONLY where the compensated surface says it does, so the
  // grid takes the tool-tip target per cut cell (its true standing
  // radius after the pass). Air cells keep their waste-floor plane
  // from the ladder — the finish's polyline never visits them.
  if (!o.finishingOnly || levels.length > 0) {
    for (let j = 0; j < nTheta; j++) {
      for (let i = 0; i < nx; i++) {
        const c = comp[j * nx + i];
        if (c < standing.r[j * nx + i]) standing.r[j * nx + i] = c;
      }
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
    standing,
    stats: {
      levels: levels.length,
      wraps,
      rows,
      blockedCells,
    },
  };
}