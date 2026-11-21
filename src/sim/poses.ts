/**
 * Move[] → carved pose stream (src/sim — pure core, no three.js).
 *
 * Mirrors src/ui/toolpathPreview.ts's modal accumulation EXACTLY: axis
 * words are absolute, a missing word = unchanged modal value; the first
 * move only positions (no pose — the machine's true start is unknown, the
 * no-phantom-segment rule); a pure-A RAPID (an Index op) emits nothing but
 * shifts θ for everything after it; A-only FEED moves cut (a vertical
 * facing ring) and emit poses.
 *
 * Poses are STOCK-frame (the un-rotated material at A=0 — VoxelGrid's
 * frame): for 4-axis, each sample at accumulated A = θ maps like
 * toolpathPreview's toDisplay — tipY = y·cosθ + zrel·sinθ, tipZ =
 * −y·sinθ + zrel·cosθ + axisZ — and the tool axis becomes machine −Z
 * rotated the same way: (0, −sinθ, −cosθ). θ stays the raw accumulated
 * value in radians (never normalized; trig is periodic). 3-axis is
 * identity with axis (0, 0, −1).
 *
 * A move emitted in a RE-CLAMPED (fixture) section carries its section's
 * own WCS: `moveFrame[mi]` (the section frame's INVERSE, one shared array
 * per section) maps it back into the stock-frame grid first, and a frame
 * change between neighbours is the re-clamp boundary — the A pile
 * restarts and no sweep crosses it (the kernel pose-plumbing leg).
 *
 * Subdivision bounds every swept voxel kernel step: linear samples at ≤
 * pitch/2 mm AND rotary chord steps at Δθ ≤ (pitch/2)/rSurface radians
 * (rSurface = effectiveRadius; at r = 20mm, pitch 0.25 that is ~0.36° per
 * step). Rapids subdivide too — a rapid can gouge, and detection needs the
 * sweep.
 */

import type { Move, Stock } from '../core/types';
import { isSimultaneous, rotaryCalibrationOf } from '../core/types';
export interface Pose {
  /** stock-frame tip position, mm */
  x: number;
  y: number;
  z: number;
  /** stock-frame tool axis, unit (points the way the tool cuts: −Z at A=0) */
  ax: number;
  ay: number;
  az: number;
  /** index into the tool table (the caller's toolOf mapping) */
  tool: number;
  /** index of the Move this sample came from */
  moveIndex: number;
  rapid: boolean;
}

/** the tool-change macro's park height assumption: crown + clearance
 *  (SAFE_CLEARANCE's 5mm, src/cam/faceCylinder.ts — a named constant so
 *  the two stay visibly linked). Exported: the UI passes
 *  stockTopZ + this so the first rapid never dips inside the crown. */
export const SIM_PARK_CLEARANCE = 5;

/**
 * Apply one inverse section-frame matrix (16 column-major elements —
 * THREE.Matrix4.toArray order) to a point / vector. Pure math: poses.ts
 * stays three.js-free.
 */
function framePt(
  f: readonly number[],
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    f[0] * x + f[4] * y + f[8] * z + f[12],
    f[1] * x + f[5] * y + f[9] * z + f[13],
    f[2] * x + f[6] * y + f[10] * z + f[14],
  ];
}

/** The same frame's rotation part only — for direction vectors. */
function frameVec(
  f: readonly number[],
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    f[0] * x + f[4] * y + f[8] * z,
    f[1] * x + f[5] * y + f[9] * z,
    f[2] * x + f[6] * y + f[10] * z,
  ];
}

export function movesToPoses(
  moves: Move[],
  stock: Stock,
  toolOf: (mi: number) => number,
  pitch: number,
  /** machine Z at job start (stockTopZ + park clearance — the tool-change
   *  macro's park). Default derives a sane value from the calibration so
   *  tests can omit it; production passes stockTopZ(stock). */
  startZ: number = rotaryCalibrationOf(stock).axisZ + rotaryCalibrationOf(stock).effectiveRadius + SIM_PARK_CLEARANCE,
  /**
   * Per move: the INVERSE of the move's fixture-section frame (16
   * column-major elements), null = the stock's own placement (fixture 1).
   * A re-clamped section emits its moves in its own WCS; the grid carves
   * the fixture-1 material, so each pose maps back through the inverse
   * (the kernel pose-plumbing leg, mirroring toolpathPreview). ONE SHARED
   * ARRAY PER SECTION: a reference change between neighbours is the
   * re-clamp boundary — the A pile restarts and no sweep crosses it.
   */
  moveFrame?: (readonly number[] | null)[],
): Pose[] {
  const rotary = stock.axisMode === '4-axis';
  const axisZ = rotary ? rotaryCalibrationOf(stock).axisZ : 0;
  const rSurface = rotary ? rotaryCalibrationOf(stock).effectiveRadius : 1;

  const maxStep = pitch / 2;
  const maxDTheta = maxStep / rSurface; // radians

  // Modal start: x/y at the machine origin, Z at the HIGH PARK (startZ —
  // the machine begins at the tool-change macro's park, and every
  // generator's first motion carries no Z until it positions and descends
  // at the destination per the entry-safety convention). Seeding Z at 0
  // would fabricate a sweep from mid-stock up through the crown on the
  // very first rapid and phantom-gouge (probe-verified 2026-10-25: the
  // move-1 "gouge" on the coin was exactly this).
  const pos = { x: 0, y: 0, z: startZ, a: 0 };
  const poses: Pose[] = [];
  let prevM: { x: number; y: number; z: number; a: number } | null = null;

  // one push, both sample paths: machine-space (mx,my,mz,ma) → stock-frame
  // pose (the rotary un-rotation is the toolpathPreview toDisplay rule)
  const pushPose = (
    mx: number,
    my: number,
    mz: number,
    ma: number,
    tool: number,
    mi: number,
    rapid: boolean,
  ) => {
    const f = moveFrame ? (moveFrame[mi] ?? null) : null;
    if (rotary) {
      const th = (ma * Math.PI) / 180;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      // machine → material: the section's INVERSE frame FIRST (a re-clamp
      // emits its moves in its own WCS), then the A un-rotation — both for
      // the tip point and the tool axis (the spindle stays −Z in the
      // section's machine frame; the material sees it as F⁻¹ of that)
      const [px, py, pz] = f ? framePt(f, mx, my, mz) : [mx, my, mz];
      const [ax0, ay0, az0] = f ? frameVec(f, 0, 0, -1) : [0, 0, -1];
      const zrel = pz - axisZ;
      const ay = ay0 * cos + az0 * sin;
      const az = -ay0 * sin + az0 * cos;
      poses.push({
        x: px,
        y: py * cos + zrel * sin,
        z: -py * sin + zrel * cos + axisZ,
        ax: ax0,
        ay,
        az,
        tool,
        moveIndex: mi,
        rapid,
      });
    } else {
      if (f) {
        const [px, py, pz] = framePt(f, mx, my, mz);
        const [ax, ay, az] = frameVec(f, 0, 0, -1);
        poses.push({ x: px, y: py, z: pz, ax, ay, az, tool, moveIndex: mi, rapid });
      } else {
        poses.push({ x: mx, y: my, z: mz, ax: 0, ay: 0, az: -1, tool, moveIndex: mi, rapid });
      }
    }
  };

  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi];
    pos.x = m.words.x ?? pos.x;
    pos.y = m.words.y ?? pos.y;
    pos.z = m.words.z ?? pos.z;
    pos.a = m.words.a ?? pos.a;

    // a RE-CLAMP boundary (the move's section changed): the A pile
    // restarts at the section's own words, and no sweep crosses the
    // fixture — the tool went to park and the part physically moved
    if (moveFrame && mi > 0 && (moveFrame[mi] ?? null) !== (moveFrame[mi - 1] ?? null)) {
      pos.a = m.words.a ?? 0;
      prevM = { ...pos };
      continue;
    }

    // pure-A RAPID (an Index op): the stock rotates, the tool moves
    // nowhere and cuts nothing — no pose, but the datum shifts
    const aOnly =
      m.words.a !== undefined &&
      m.words.x === undefined &&
      m.words.y === undefined &&
      m.words.z === undefined;
    if (aOnly && m.rapid) {
      prevM = { ...pos };
      continue;
    }

    if (prevM !== null) {
      const tool = toolOf(mi);
      const rapid = !!m.rapid;
      if (m.arc) {
        // Move.arc (2026-11-12): XY-plane arc, I/J center offset from the
        // START point, endpoint = (pos.x,pos.y), helical Z rides along.
        // Sweep: shortest signed travel for start≠end, ±2π for the exact
        // start==end full circle (the sim never relies on the firmware's
        // full-circle detection — the Move.arc doc rule). Sample count is
        // arc-arc-length driven (|sweep|·r / maxStep), floored by the
        // linear nLin so a helix's Z still subdivides at the pitch bound.
        const cx = prevM.x + m.arc.i;
        const cy = prevM.y + m.arc.j;
        const r = Math.hypot(prevM.x - cx, prevM.y - cy);
        const startA = Math.atan2(prevM.y - cy, prevM.x - cx);
        const endA = Math.atan2(pos.y - cy, pos.x - cx);
        const closed = Math.hypot(pos.x - prevM.x, pos.y - prevM.y) < 1e-9;
        const dir = m.arc.cw ? -1 : 1;
        let sweep = closed ? dir * 2 * Math.PI : shortestSweep(startA, endA, dir);
        const nArc = r > 0 ? Math.ceil((Math.abs(sweep) * r) / maxStep) : 0;
        const dxz = Math.hypot(pos.x - prevM.x, pos.y - prevM.y, pos.z - prevM.z);
        const nLin = Math.ceil(dxz / maxStep);
        const n = Math.max(1, nArc, nLin);
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const ang = startA + sweep * t;
          const mx = cx + r * Math.cos(ang);
          const my = cy + r * Math.sin(ang);
          const mz = prevM.z + (pos.z - prevM.z) * t;
          const ma = prevM.a + (pos.a - prevM.a) * t;
          pushPose(mx, my, mz, ma, tool, mi, rapid);
        }
      } else {
        const dx = pos.x - prevM.x;
        const dy = pos.y - prevM.y;
        const dz = pos.z - prevM.z;
        const dTheta = rotary ? ((pos.a - prevM.a) * Math.PI) / 180 : 0;
        const nLin = Math.ceil(Math.hypot(dx, dy, dz) / maxStep);
        const nRot = rotary ? Math.ceil(Math.abs(dTheta) / maxDTheta) : 0;
        const n = Math.max(1, nLin, nRot);
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          const mx = prevM.x + dx * t;
          const my = prevM.y + dy * t;
          const mz = prevM.z + dz * t;
          const ma = prevM.a + (pos.a - prevM.a) * t;
          pushPose(mx, my, mz, ma, tool, mi, rapid);
        }
      }
    }
    prevM = { ...pos };
  }

  return poses;
}

/**
 * Signed angular travel from a to b in direction `dir` (−1 cw / +1 ccw),
 * wrapped to the shortest travel in that direction: ccw → (b−a mod 2π),
 * cw → −((a−b) mod 2π). Result magnitude < 2π — the ±2π FULL CIRCLE is
 * the caller's closed-endpoint special case, never this helper's.
 */
function shortestSweep(a: number, b: number, dir: number): number {
  const TAU = 2 * Math.PI;
  if (dir > 0) return (((b - a) % TAU) + TAU) % TAU;
  return -((((a - b) % TAU) + TAU) % TAU);
}

/**
 * Per-move duration, minutes — for the time-agnostic worker's progress and
 * any v2 playback clock. Feed unit follows the G93/G94 rule on Move:
 *  - G93 (isSimultaneous): feed = 1/minutes → duration = 1/feed
 *  - G94 with linear motion: 3D path length / feed (mm/min)
 *  - A-only G94 (rotary feed moves, e.g. cylChamfer's ROTARY_FEED_DEG_MIN
 *    sweeps): |ΔA| / feed (deg/min)
 *  - rapids: max(|Δx|/1200, |Δy|/1200, |Δz|/600, |ΔA|/3600) minutes
 * Zero-motion moves → 0.
 */
export function moveDurations(moves: Move[]): number[] {
  const pos = { x: 0, y: 0, z: 0, a: 0 };
  const out: number[] = [];
  for (const m of moves) {
    const w = m.words;
    const nx = w.x ?? pos.x;
    const ny = w.y ?? pos.y;
    const nz = w.z ?? pos.z;
    const na = w.a ?? pos.a;
    const dx = nx - pos.x;
    const dy = ny - pos.y;
    const dz = nz - pos.z;
    const da = na - pos.a;

    let t = 0;
    if (m.arc) {
      // ARC DURATION (2026-11-12): the endpoint chord of a full-circle
      // arc is ZERO — chord-based timing would zip a circular orbit
      // through the sim instantly. Time the true path: the arc length
      // (|sweep|·r) hypotenused with any helical Z, over the G94 feed.
      const r = Math.hypot(m.arc.i, m.arc.j);
      const cx = pos.x + m.arc.i;
      const cy = pos.y + m.arc.j;
      const a0 = Math.atan2(-m.arc.j, -m.arc.i); // start, center-relative
      const a1 = Math.atan2(ny - cy, nx - cx); // end, center-relative
      let sweep = m.arc.cw ? a0 - a1 : a1 - a0;
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); // [0, 2π)
      if (sweep < 1e-9) sweep = 2 * Math.PI; // coincident XY endpoints = the IR's full-circle form
      t = m.feed > 0 ? Math.hypot(sweep * r, dz) / m.feed : 0;
    } else if (dx === 0 && dy === 0 && dz === 0 && da === 0) {
      t = 0; // zero-motion moves cost nothing, even when feed is stamped
    } else if (m.rapid) {
      t = Math.max(Math.abs(dx) / 1200, Math.abs(dy) / 1200, Math.abs(dz) / 600, Math.abs(da) / 3600);
    } else if (isSimultaneous(m)) {
      t = m.feed > 0 ? 1 / m.feed : 0;
    } else if (dx !== 0 || dy !== 0 || dz !== 0) {
      t = m.feed > 0 ? Math.hypot(dx, dy, dz) / m.feed : 0;
    } else if (da !== 0) {
      t = m.feed > 0 ? Math.abs(da) / m.feed : 0;
    }
    out.push(t);
    pos.x = nx;
    pos.y = ny;
    pos.z = nz;
    pos.a = na;
  }
  return out;
}
