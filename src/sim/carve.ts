/**
 * The carve kernel (src/sim — pure core). Sweeps poses through the
 * VoxelGrid, removing voxels whose centers fall inside the pose's tool
 * solid, and CLASSIFIES every removal / contact (Alice's 3-class spec,
 * 2026-10-25):
 *
 *  1. FINE  — removed by the flute within the owning op's step-down of the
 *     local standing surface → nothing marked.
 *  2. YELLOW GOUGE — removed by the flute standing MORE than the step-down
 *     above the pose's cut level (a raster-without-waterline plunge through
 *     virgin stock paints yellow), OR any removal by a RAPID pose (bad
 *     clearance, per-voxel). Removed + ghost 1.
 *  3. RED COLLISION — the SHANK (above fluteLen, within shankRadius)
 *     contacts standing material: NOT removed (shanks don't cut), contact
 *     voxels get ghost 2, the MOVE is counted once in collisions.
 *
 * Per pose:
 *  - spec = specs[pose.tool]; null spec (laser / no tool) → the pose is
 *    skipped and its MOVE counted once in laserSkipped (poses subdivide,
 *    so counting per distinct moveIndex keeps the stat move-shaped like
 *    the protocol's SimResult.laserSkipped).
 *  - local frame: the tool's local +Z (up the shank) maps to −axis; since
 *    every ToolSpec solid is rotationally symmetric, the inside test needs
 *    only z_local = −q·axis and rhoSq = |q|² − z_local² per voxel
 *    (~15 flops/cell). An orthonormal frame (localX/Y/Z from the unit
 *    axis) is built only to rotate spec.bounds()'s 8 corners — extended to
 *    the shank (radius max, z to shankTop) — about the tip into the
 *    stock-frame AABB.
 *  - cut level: the pose's tip along its own axis, measured against the
 *    standing surface in the pose's OWN family and approach direction —
 *    vertical column top/bottom for a ±Z tool (3-axis, A=0/A=180), Y-line
 *    ends for a ±Y tool (±90° indexing; Alice's 2026-10-26 reports: the
 *    indexed ops' deliberate passes all painted yellow against the wrong
 *    family/end). In-between angles keep the vertical approximation.
 *    Per-MOVE baseline: the
 *    first pose of a move snapshots every column's standing top BEFORE that
 *    move carves — subdivided plunge poses must all compare against the
 *    same pre-move surface, or every pose after the first would skin its
 *    own cut as "fine" and Alice's raster diagnostic would read clean.
 *  - step-down tolerance: moveStepDown[moveIndex] (the owning op's
 *    stepDown; drill → peckDepth); 0/undefined → one voxel pitch (a finish
 *    pass may legitimately skin one cell).
 *  - air-skip per column (i,j): when the tool's lowest extent in that
 *    column sits above the column's top material cell center, the pose
 *    cannot touch it — skip without the per-voxel test.
 *  - flute scan k downward from min(AABB top, columnTop): occ=0 +
 *    ghost=yellow|none + removed++/gougedVoxels++; then a shank scan in the
 *    band above the flute: occupied cells inside shankInside → ghost=red
 *    (occ untouched), contact per MOVE counted once.
 *  - a RAPID pose that removed > 0 (pose-shaped) bumps gouges and pins
 *    firstGougeMove once (unchanged semantics).
 */

import type { VoxelGrid } from './grid';
import type { ToolSpec } from './toolShape';
import type { Pose } from './poses';

export interface CarveStats {
  removed: number;
  gouges: number;
  firstGougeMove: number | null;
  laserSkipped: number;
  /** voxels removed MORE than the op's step-down above the cut level (or
   *  by a rapid) — the yellow class */
  gougedVoxels: number;
  /** distinct moves whose shank contacted standing material — red class */
  collisions: number;
  /** first move with a shank contact */
  firstCollisionMove: number | null;
}

export function emptyStats(): CarveStats {
  return {
    removed: 0,
    gouges: 0,
    firstGougeMove: null,
    laserSkipped: 0,
    gougedVoxels: 0,
    collisions: 0,
    firstCollisionMove: null,
  };
}

/** the pre-move standing-surface baseline, per grid (WeakMap — a reset
 *  builds a fresh grid, which drops the stale baseline automatically).
 *  TWO FAMILIES, keyed by the pose's dominant tool axis (Alice's
 *  2026-10-26 two-waterline-with-90°-index report: the indexed op's
 *  "material above the cut" runs along the stock's Y axis, and the
 *  vertical-column baseline painted its every deliberate pass yellow):
 *   - VERTICAL (axis ≈ ±Z): per column (j·nx+i) the standing ends —
 *     grid.columnTop (max k, the normal downward tool) and
 *     grid.columnBottom (min k, a 180°-indexed op approaching from
 *     below — her four-angle follow-up: the 180° splash).
 *   - Y-LINES (axis ≈ ±Y, ±90° indexing): per line (i+nx·k) the standing
 *     ends — grid.columnTopY (max j, approach from +Y) and
 *     grid.columnBottomY (min j, approach from −Y).
 *  In-between angles (45°…) fall back to the vertical family — the same
 *  class of approximation as v1, now exact for the common 0/90 cases.
 *  Copy-on-write per family: entering a new move REFRESHES only the
 *  entries the previous move carved (journal — O(cells carved), vs
 *  snapshotting the arrays per move). Invariant: for every non-carved-
 *  this-move entry, baseline == the live grid array; at a transition the
 *  carved entries are re-copied from the live grid, which by then IS the
 *  new pre-move surface. `stamp`/`stampY` + the per-base `serial` mark
 *  entries already journaled this move (no duplicates; the serial is
 *  per-base so different grids never collide). */
const baselines = new WeakMap<
  VoxelGrid,
  {
    move: number;
    /** vertical family: pre-move column ends (j·nx+i → k) — top (max k,
     *  approach from +Z) and bottom (min k, approach from −Z: a 180°-indexed
     *  op approaches the stock from below) */
    top: Int32Array;
    bot: Int32Array;
    stamp: Int32Array;
    journal: number[];
    /** Y family: pre-move line ends (i+nx·k → j) */
    topY: Int32Array;
    botY: Int32Array;
    stampY: Int32Array;
    journalY: number[];
    /** RADIAL family caches (per MOVE — the baselines are per-move, so the
     *  derived per-column standing radius and its valley-window minimum are
     *  too): rs2 = the column's pre-move standing radius; stand = the
     *  window-min over ±flute radius in x. Without the cache the window
     *  rescans ±fluteR per REMOVED VOXEL — Ø-proportional, not
     *  pitch-proportional: 42 hypots × 1.6M removals ≈ 68M redundant
     *  hypots at 0.15mm voxels (Alice's >2× slowdown report, 2026-10-27) */
    rs2: Float32Array;
    rs2Stamp: Int32Array;
    stand: Float32Array;
    standStamp: Int32Array;
    serial: number;
  }
>();

export function carvePoses(
  grid: VoxelGrid,
  specs: (ToolSpec | null)[],
  poses: Pose[],
  stats: CarveStats,
  moveStepDown?: Float32Array,
): void {
  let lastSkippedMove = -1;
  for (const pose of poses) {
    const spec = specs[pose.tool] ?? null;
    if (spec === null) {
      if (pose.moveIndex !== lastSkippedMove) {
        stats.laserSkipped++;
        lastSkippedMove = pose.moveIndex;
      }
      continue;
    }
    carvePose(grid, spec, pose, stats, moveStepDown);
  }
}

function carvePose(
  grid: VoxelGrid,
  spec: ToolSpec,
  pose: Pose,
  stats: CarveStats,
  moveStepDown: Float32Array | undefined,
): void {
  const ax = pose.ax;
  const ay = pose.ay;
  const az = pose.az;
  // localZ (up the shank) in stock frame = −axis
  const lzX = -ax;
  const lzY = -ay;
  const lzZ = -az;
  // helper world axis least parallel to the tool axis → perpendicular base
  let hx = 1;
  let hy = 0;
  let hz = 0;
  if (Math.abs(ay) >= Math.abs(ax) && Math.abs(ay) >= Math.abs(az)) {
    hx = 0;
    hy = 0;
    hz = 1;
  } else if (Math.abs(az) >= Math.abs(ax) && Math.abs(az) >= Math.abs(ay)) {
    hx = 0;
    hy = 1;
    hz = 0;
  }
  // localX = normalize(helper − (helper·axis)·axis)
  const d = hx * ax + hy * ay + hz * az;
  let lxX = hx - d * ax;
  let lxY = hy - d * ay;
  let lxZ = hz - d * az;
  const lxLen = Math.hypot(lxX, lxY, lxZ);
  lxX /= lxLen;
  lxY /= lxLen;
  lxZ /= lxLen;
  // localY = axis × localX (unit, orthogonal by construction)
  const lyX = ay * lxZ - az * lxY;
  const lyY = az * lxX - ax * lxZ;
  const lyZ = ax * lxY - ay * lxX;

  // stock-frame AABB from the local bounds' 8 corners rotated about the
  // tip: the FLUTE box (spec.bounds), extended to the shank (max radius,
  // top at shankTop) so red-contact scanning covers the shaft
  const b = spec.bounds();
  const localCorners: [number, number, number][] = [
    [b[0], b[2], b[4]],
    [b[1], b[2], b[4]],
    [b[0], b[3], b[4]],
    [b[1], b[3], b[4]],
    [b[0], b[2], b[5]],
    [b[1], b[2], b[5]],
    [b[0], b[3], b[5]],
    [b[1], b[3], b[5]],
  ];
  if (spec.shankTop > b[5]) {
    const sr = spec.shankRadius;
    localCorners.push(
      [-sr, -sr, b[5]],
      [sr, -sr, b[5]],
      [-sr, sr, b[5]],
      [sr, sr, b[5]],
      [-sr, -sr, spec.shankTop],
      [sr, -sr, spec.shankTop],
      [-sr, sr, spec.shankTop],
      [sr, sr, spec.shankTop],
    );
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [px, py, pz] of localCorners) {
    const wx = pose.x + px * lxX + py * lyX + pz * lzX;
    const wy = pose.y + px * lxY + py * lyY + pz * lzY;
    const wz = pose.z + px * lxZ + py * lyZ + pz * lzZ;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }

  const [i0, j0, k0] = grid.worldToCell(minX, minY, minZ);
  const [i1r, j1r, k1r] = grid.worldToCell(maxX, maxY, maxZ);
  if (i1r < 0 || j1r < 0 || k1r < 0 || i0 > grid.nx - 1 || j0 > grid.ny - 1 || k0 > grid.nz - 1) {
    return;
  }
  const iStart = Math.max(0, i0);
  const jStart = Math.max(0, j0);
  const iEnd = Math.min(i1r, grid.nx - 1);
  const jEnd = Math.min(j1r, grid.ny - 1);
  const kEnd = Math.min(k1r, grid.nz - 1);

  // per-move baseline: the standing surfaces BEFORE this move carves (first
  // pose of the move), so subdivided poses all compare against the same
  // pre-move surface; moveStepDown[moveIndex] is the owning op's step-down.
  // Copy-on-write, per family — see the baselines doc: only entries the
  // previous move carved are refreshed here (from the live grid, which is
  // exactly the new pre-move surface), everything else still holds the
  // untouched tops.
  let base = baselines.get(grid);
  if (base === undefined) {
    base = {
      move: pose.moveIndex,
      top: new Int32Array(grid.columnTop),
      bot: new Int32Array(grid.columnBottom),
      stamp: new Int32Array(grid.nx * grid.ny).fill(-1),
      journal: [],
      topY: new Int32Array(grid.columnTopY),
      botY: new Int32Array(grid.columnBottomY),
      stampY: new Int32Array(grid.nx * grid.nz).fill(-1),
      journalY: [],
      rs2: new Float32Array(grid.nx * grid.ny),
      rs2Stamp: new Int32Array(grid.nx * grid.ny).fill(-1),
      stand: new Float32Array(grid.nx * grid.ny),
      standStamp: new Int32Array(grid.nx * grid.ny).fill(-1),
      serial: 0,
    };
    baselines.set(grid, base);
  } else if (base.move !== pose.moveIndex) {
    for (let e = 0; e < base.journal.length; e++) {
      const c = base.journal[e];
      base.top[c] = grid.columnTop[c];
      base.bot[c] = grid.columnBottom[c];
      // the radial family's derived caches invalidate with the column
      // baselines they were computed from — same journal, same move serial
      base.rs2Stamp[c] = -1;
      base.standStamp[c] = -1;
    }
    for (let e = 0; e < base.journalY.length; e++) {
      const l = base.journalY[e];
      base.topY[l] = grid.columnTopY[l];
      base.botY[l] = grid.columnBottomY[l];
    }
    base.move = pose.moveIndex;
    base.journal.length = 0;
    base.journalY.length = 0;
    base.serial++;
  }
  const baselineTop = base.top;
  const baselineBot = base.bot;
  const stamp = base.stamp;
  const stampVal = base.serial;
  const journal = base.journal;
  const baselineTopY = base.topY;
  const baselineBotY = base.botY;
  const stampY = base.stampY;
  const journalY = base.journalY;
  // radial-family caches (per-move — see the baselines doc): the column's
  // pre-move standing radius (rs2) and its valley-window minimum (stand)
  const rs2Arr = base.rs2;
  const rs2Stamp = base.rs2Stamp;
  const standArr = base.stand;
  const standStamp = base.standStamp;
  // the classification family. EXACT index angles keep the world-axis
  // formulas (byte-identical paths: 3-axis ops, the plunge/skim fixtures,
  // 0/180 vertical and ±90 Y-line indexed ops — committee #4's landing
  // rule). A CONTINUOUS-rotary pose (neither axis component near a world
  // axis) approaches the stock RADIALLY, so its honest depth measure is
  // radial (see the branch below); box-rotary stock has no axisZ and keeps
  // the old vertical approximation.
  const nearVert = Math.abs(az) >= 0.999;
  const nearHoriz = !nearVert && Math.abs(ay) >= 0.999;
  const radialMode = !nearVert && !nearHoriz && Number.isFinite(grid.rotaryAxisZ);
  const approachNegY = ay < 0; // axis −Y → the tool comes from +Y
  const approachPosZ = az < 0; // axis −Z → from +Z; axis +Z (180°) → from below
  const stepDownTol = moveStepDown && moveStepDown[pose.moveIndex] > 0 ? moveStepDown[pose.moveIndex] : grid.pitch;
  // radial-branch constants (unused outside radialMode)
  const AXIS_Z = grid.rotaryAxisZ;
  const flR = Math.max(Math.abs(b[0]), Math.abs(b[1])); // flute radius, spec bounds
  const radW = Math.ceil(flR / grid.pitch); // valley window half-width in cells

  const { occ, columnTop, ghost, nx, ny } = grid;
  let poseRemoved = 0;
  let poseGouged = 0;

  for (let j = jStart; j <= jEnd; j++) {
    const qy = grid.originY + (j + 0.5) * grid.pitch - pose.y;
    for (let i = iStart; i <= iEnd; i++) {
      const top = columnTop[j * nx + i];
      if (top < 0) continue; // empty column — nothing to carve
      const qx = grid.originX + (i + 0.5) * grid.pitch - pose.x;
      const topCenterZ = grid.originZ + (top + 0.5) * grid.pitch;
      if (minZ > topCenterZ) continue; // tool entirely above the material — air-skip
      // classification reference: the PRE-MOVE standing ends of this column
      const baseTop = baselineTop[j * nx + i];
      const baseTopZ = baseTop >= 0 ? grid.originZ + (baseTop + 0.5) * grid.pitch : -Infinity;
      const baseBot = baselineBot[j * nx + i];
      const baseBotZ = baseBot < grid.nz ? grid.originZ + (baseBot + 0.5) * grid.pitch : Infinity;
      // scan from the column top down to the AABB's low cell; the inside
      // test bounds both depth (flute) and radius per cell
      const kHi = Math.min(kEnd, top);
      const kLo = Math.max(0, k0);
      for (let k = kHi; k >= kLo; k--) {
        const idx = i + nx * (j + ny * k);
        if (occ[idx] === 0) continue;
        const qz = grid.originZ + (k + 0.5) * grid.pitch - pose.z;
        // z_local = height above the tip along the tool axis = −q·axis
        const zl = -(qx * ax + qy * ay + qz * az);
        if (zl < b[4] - 1e-9 || zl > b[5] + 1e-9) continue;
        const rhoSq = qx * qx + qy * qy + qz * qz - zl * zl;
        if (!spec.inside(zl, rhoSq)) continue;
        occ[idx] = 0;
        // 3-class: within the step-down of the standing surface → fine;
        // deeper (or a rapid's removal) → yellow gouge ghost. The standing
        // surface follows the pose's approach: EXACT index angles keep the
        // world-axis families (vertical columns / Y-lines — byte-identical
        // to v1: 3-axis ops, the plunge/skim fixtures, 0/180 and ±90 indexed
        // ops); continuous-rotary poses read the RADIAL surface.
        let gouged: boolean;
        if (pose.rapid) {
          gouged = true;
        } else if (!radialMode && !nearHoriz) {
          // vertical family: against the column TOP (a downward tool) or
          // the BOTTOM (a 180°-indexed op approaching from below)
          const voxelZ = grid.originZ + (k + 0.5) * grid.pitch;
          gouged = approachPosZ
            ? baseTopZ - voxelZ > stepDownTol
            : voxelZ - baseBotZ > stepDownTol;
        } else if (!radialMode) {
          // ±90° Y-line family: against the line end the tool approaches
          const line = i + nx * k;
          const endJ = approachNegY ? baselineTopY[line] : baselineBotY[line];
          const endY = grid.originY + (endJ + 0.5) * grid.pitch;
          const voxelY = grid.originY + (j + 0.5) * grid.pitch;
          gouged = approachNegY
            ? endY - voxelY > stepDownTol
            : voxelY - endY > stepDownTol;
        } else {
          // RADIAL family (committee #4 M2 — Alice's 2026-10-27 "ribbons at
          // every cut depth" report): a continuous-rotary pose cuts into the
          // standing CYLINDER radius field, so depth is radial at the
          // voxel's own angle — the pre-move standing radius of this column
          // (max ρ of its pre-move top/bottom cells, both already in the
          // baselines), minus the VALLEY floor of the sweep: window-min of
          // the standing radius along x over ±flute-radius (adjacent windings
          // of one sweep sit at the same φ offset in x; the intended flat is
          // the valley, not the previous winding's cusp ridge). The half-pitch
          // term is the center-sampling correction: a cell whose CENTER sits
          // within tol of the valley floor is a sampling artifact, not a
          // gouge. Box-rotary stock never reaches here (radialMode gates on
          // a finite axisZ). The standing radius and its window-min are
          // PER-(row,column) functions of the pre-move baselines only —
          // move-stable, so both ride the per-move caches (rs2/stand): the
          // window scan runs once per (row,column) per move, not per voxel
          // (Alice's 2026-10-27 >2× slowdown report: the window is
          // Ø-proportional, not pitch-proportional — 42 hypots × every
          // removal ≈ 68M redundant hypots at 0.15mm voxels).
          const wyV = grid.originY + (j + 0.5) * grid.pitch;
          const wzV = grid.originZ + (k + 0.5) * grid.pitch;
          const rhoV = Math.hypot(wyV, wzV - AXIS_Z);
          const rc = j * nx + i;
          let rStand: number;
          if (standStamp[rc] === stampVal) {
            rStand = standArr[rc];
          } else {
            let rTop = -1;
            if (baseTop >= 0) {
              rTop = Math.hypot(wyV, grid.originZ + (baseTop + 0.5) * grid.pitch - AXIS_Z);
            }
            let rBot = -1;
            if (baseBot < grid.nz) {
              rBot = Math.hypot(wyV, grid.originZ + (baseBot + 0.5) * grid.pitch - AXIS_Z);
            }
            rStand = Math.max(rTop, rBot);
            for (let di2 = -radW; di2 <= radW; di2++) {
              if (di2 === 0) continue;
              const i2 = i + di2;
              if (i2 < 0 || i2 >= nx) continue;
              const rc2 = j * nx + i2;
              let rs2: number;
              if (rs2Stamp[rc2] === stampVal) {
                rs2 = rs2Arr[rc2];
              } else {
                const bt2 = baselineTop[rc2];
                const bb2 = baselineBot[rc2];
                rs2 = -1;
                if (bt2 >= 0) {
                  rs2 = Math.hypot(wyV, grid.originZ + (bt2 + 0.5) * grid.pitch - AXIS_Z);
                }
                if (bb2 < grid.nz) {
                  const rb2 = Math.hypot(wyV, grid.originZ + (bb2 + 0.5) * grid.pitch - AXIS_Z);
                  if (rb2 > rs2) rs2 = rb2;
                }
                rs2Arr[rc2] = rs2;
                rs2Stamp[rc2] = stampVal;
              }
              if (rs2 >= 0 && rs2 < rStand) rStand = rs2;
            }
            standArr[rc] = rStand;
            standStamp[rc] = stampVal;
          }
          gouged = rStand < 0 || rStand - rhoV - grid.pitch * 0.5 > stepDownTol;
        }
        if (gouged) {
          ghost[idx] = 1;
          poseGouged++;
        }
        grid.onCarved(i, j, k);
        grid.markChunkDirty(i, j, k);
        // journal the column AND the Y-line for the next move's refresh
        // (dedup via the per-family stamps)
        const col = j * nx + i;
        if (stamp[col] !== stampVal) {
          stamp[col] = stampVal;
          journal.push(col);
        }
        const lineY = i + nx * k;
        if (stampY[lineY] !== stampVal) {
          stampY[lineY] = stampVal;
          journalY.push(lineY);
        }
        stats.removed++;
        poseRemoved++;
      }
    }
  }

  // shank contact scan: cells ABOVE the flute in the shank solid that still
  // hold material — marked red, NOT removed (shanks don't cut); the MOVE is
  // counted once as a collision
  if (spec.shankTop > b[5] && spec.shankRadius > 0) {
    let poseCollision = false;
    for (let j = jStart; j <= jEnd; j++) {
      const qy = grid.originY + (j + 0.5) * grid.pitch - pose.y;
      for (let i = iStart; i <= iEnd; i++) {
        const top = columnTop[j * nx + i];
        if (top < 0) continue;
        const qx = grid.originX + (i + 0.5) * grid.pitch - pose.x;
        const kHi = Math.min(kEnd, top);
        const kLo = Math.max(0, k0);
        for (let k = kHi; k >= kLo; k--) {
          const idx = i + nx * (j + ny * k);
          if (occ[idx] === 0 || ghost[idx] === 2) continue;
          const qz = grid.originZ + (k + 0.5) * grid.pitch - pose.z;
          const zl = -(qx * ax + qy * ay + qz * az);
          if (zl <= b[5] || zl > spec.shankTop) continue; // flute band already handled
          const rhoSq = qx * qx + qy * qy + qz * qz - zl * zl;
          if (!spec.shankInside(zl, rhoSq)) continue;
          ghost[idx] = 2; // still solid — red contact, no removal
          poseCollision = true;
        }
      }
    }
    if (poseCollision) {
      stats.collisions++;
      if (stats.firstCollisionMove === null) stats.firstCollisionMove = pose.moveIndex;
    }
  }

  if (poseRemoved > 0) {
    stats.gougedVoxels += poseGouged;
    if (pose.rapid) {
      stats.gouges++;
      if (stats.firstGougeMove === null) stats.firstGougeMove = pose.moveIndex;
    }
  }
}
