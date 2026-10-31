/**
 * Laser marking for the carve simulator (src/sim — pure core, no three.js).
 * Alice's ruling (2026-10-31): a laser pose doesn't carve — it MARKS. The
 * voxels directly under the beam (the tool's tip diameter) blacken their
 * surface, so the trace shows WHERE the beam fired. Display-only: no
 * removal, no ablation/depth model — low power is unlikely to cut and
 * simulating whether it did is out of scope.
 *
 * MODAL POWER (the trap): Move.power is SPARSE — src/cam/engrave.ts's
 * engraveLaser stamps it on each path's FIRST cut and as bare { power: 0 }
 * extinguish-travels; every move between inherits the modal S. This state
 * tracks it exactly as the post would: move.power present → set, absent →
 * inherit. The beam fires on state > 0 and only on FEED poses (G0 never
 * fires the beam — the Move.power contract in src/core/types.ts), so the
 * extinguish-travels stay clean and a naive "mark moves that carry power"
 * dotted-first-segments bug can't happen.
 *
 * FOOTPRINT: the beam disc = (tipDiameter ?? diameter)/2 about the tip —
 * the same tip-width rule the engrave fill uses (engraveFillStepOver) —
 * in the plane perpendicular to the pose's tool axis. The TOPMOST standing
 * voxel of each footprint cell marks (the beam hits whatever surface is
 * there, per the standing grid — a terraced disc burns every terrace).
 * "Footprint cell" = the cell's projection onto the disc plane quantized
 * to the voxel pitch: for a flat ±Z beam that IS the grid column (so the
 * mark lands exactly on columnTop), and a wrapped rotary beam groups the
 * shell the same way. Nothing below the top voxels: marking, not drilling.
 *
 * RENDER: rides the ghost overlay as ghost 3 — a black mark on a
 * still-SOLID voxel (the mesher draws its void-exposed faces red-style,
 * polygon-offset over the surface). Red honesty (Alice's 2026-10-27
 * ruling): a red shank-contact voxel is never overpainted; a burned voxel
 * later carved by a mill drops its mark with the material that carried it.
 */

import type { VoxelGrid } from './grid';
import type { Move, Tool } from '../core/types';
import type { Pose } from './poses';
import type { CarveStats } from './carve';

/** the beam disc of a laser tool; null for every non-laser tool */
export interface LaserBeam {
  radius: number;
}

export function laserBeamOf(tool: Tool): LaserBeam | null {
  if (tool.type !== 'laser') return null;
  return { radius: (tool.tipDiameter ?? tool.diameter) / 2 };
}

export interface LaserState {
  /** modal S — inherited across moves, set when a move stamps power */
  power: number;
  /** last move counted into stats.laserMarked (poses subdivide; the stat
   *  stays move-shaped like the protocol's other counters) */
  lastMarkedMove: number;
}

export function createLaserState(): LaserState {
  return { power: 0, lastMarkedMove: -1 };
}

/** ghost value for a laser burn (grid.ts's ghost array: 0 none, 1 yellow,
 *  2 red, 3 burn) — mirrored by the mesher's GHOST_BLACK */
export const GHOST_BURN = 3;

/**
 * Process ONE pose of a laser tool's move stream: update the modal power
 * from the move's own word, then (beam on, feed pose) blacken the topmost
 * standing voxel of each footprint cell under the beam disc. The worker
 * calls this per pose in stream order — the modal inheritance IS
 * order-dependent by design.
 */
export function laserMarkPose(
  grid: VoxelGrid,
  beam: LaserBeam,
  move: Move,
  pose: Pose,
  state: LaserState,
  stats: CarveStats,
): void {
  // modal S: a stamped word sets it, an unworded move inherits it —
  // idempotent per pose (all of a move's poses see the same word)
  if (move.power !== undefined) state.power = move.power;
  if (state.power <= 0 || pose.rapid) return;

  const { ax, ay, az } = pose;
  // orthonormal disc frame (lx, ly) ⊥ axis — same construction as the
  // carve kernel's local frame (a unit axis needs only one helper vector)
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
  const d = hx * ax + hy * ay + hz * az;
  let lxX = hx - d * ax;
  let lxY = hy - d * ay;
  let lxZ = hz - d * az;
  const lxLen = Math.hypot(lxX, lxY, lxZ);
  lxX /= lxLen;
  lxY /= lxLen;
  lxZ /= lxLen;
  const lyX = ay * lxZ - az * lxY;
  const lyY = az * lxX - ax * lxZ;
  const lyZ = ax * lxY - ay * lxX;

  // half-pitch grace: cells are sampled at their CENTERS, so a footprint
  // test against the beam edge admits centers half a pitch outside it
  const half = grid.pitch * 0.5;
  const rEff = beam.radius + half;
  const rEffSq = rEff * rEff;
  // the topmost standing voxel of a footprint cell: at most one pitch of
  // beam-depth spread between neighbors in the same projection
  const layer = grid.pitch * 0.75;

  // scan AABB: the beam cylinder from the tip out along the axis to the
  // grid's far corner, inflated by rEff — thin for a narrow beam. The
  // segment starts BEHIND the tip by rEff + pitch: a grazing shell's top
  // standing centers can sit above the tip (a wrapped beam tangent to the
  // crown — the shoulder rises within the disc), and clipping the AABB at
  // the tip dropped exactly those cells (measured: crown-shoulder burns
  // landing one voxel low)
  const diag = Math.hypot(grid.nx, grid.ny, grid.nz) * grid.pitch;
  const back = rEff + grid.pitch;
  const sx = pose.x - ax * back;
  const sy = pose.y - ay * back;
  const sz = pose.z - az * back;
  const ex = pose.x + ax * diag;
  const ey = pose.y + ay * diag;
  const ez = pose.z + az * diag;
  const [i0r, j0r, k0r] = grid.worldToCell(
    Math.min(sx, ex) - rEff,
    Math.min(sy, ey) - rEff,
    Math.min(sz, ez) - rEff,
  );
  const [i1r, j1r, k1r] = grid.worldToCell(
    Math.max(sx, ex) + rEff,
    Math.max(sy, ey) + rEff,
    Math.max(sz, ez) + rEff,
  );
  if (i1r < 0 || j1r < 0 || k1r < 0 || i0r > grid.nx - 1 || j0r > grid.ny - 1 || k0r > grid.nz - 1) {
    return;
  }
  const i0 = Math.max(0, i0r);
  const j0 = Math.max(0, j0r);
  const k0 = Math.max(0, k0r);
  const i1 = Math.min(i1r, grid.nx - 1);
  const j1 = Math.min(j1r, grid.ny - 1);
  const k1 = Math.min(k1r, grid.nz - 1);

  const { occ, ghost, nx, ny } = grid;

  // candidate test + projection key (shared by both passes). zl = −q·axis
  // is the cell's height above the tip along the shank — beam hits sit at
  // or below the tip (zl ≤ 0); the projection key groups candidates by
  // where their centers land in the disc plane, quantized to the pitch
  // (offset so the small negative keys encode non-negative)
  const keyOf = (wx: number, wy: number, wz: number, out: { zl: number; key: number }): boolean => {
    const zl = -(wx * ax + wy * ay + wz * az);
    const rhoSq = wx * wx + wy * wy + wz * wz - zl * zl;
    if (rhoSq > rEffSq) return false;
    const pu = wx * lxX + wy * lxY + wz * lxZ;
    const pv = wx * lyX + wy * lyY + wz * lyZ;
    const ku = Math.floor(pu / grid.pitch) + 64;
    const kv = Math.floor(pv / grid.pitch) + 64;
    out.zl = zl;
    out.key = ku * 128 + kv;
    return true;
  };
  const cand = { zl: 0, key: 0 };

  // pass 1 — per footprint cell, the topmost standing voxel: the MAXIMUM
  // zl among occupied candidates sharing the projection key (for a flat
  // ±Z beam the key IS the grid column, so this is exactly columnTop)
  const topOfKey = new Map<number, number>();
  for (let k = k0; k <= k1; k++) {
    const wz = grid.originZ + (k + 0.5) * grid.pitch - pose.z;
    for (let j = j0; j <= j1; j++) {
      const wy = grid.originY + (j + 0.5) * grid.pitch - pose.y;
      for (let i = i0; i <= i1; i++) {
        if (occ[i + nx * (j + ny * k)] !== 1) continue;
        const wx = grid.originX + (i + 0.5) * grid.pitch - pose.x;
        if (!keyOf(wx, wy, wz, cand)) continue;
        const top = topOfKey.get(cand.key);
        if (top === undefined || cand.zl > top) topOfKey.set(cand.key, cand.zl);
      }
    }
  }
  if (topOfKey.size === 0) return; // beam over air — nothing to mark

  // pass 2 — blacken each footprint cell's top standing voxel(s) and
  // nothing below (marking, not drilling); red contact wins (red
  // honesty); the move is counted once however many poses subdivided it
  let marked = 0;
  for (let k = k0; k <= k1; k++) {
    const wz = grid.originZ + (k + 0.5) * grid.pitch - pose.z;
    for (let j = j0; j <= j1; j++) {
      const wy = grid.originY + (j + 0.5) * grid.pitch - pose.y;
      for (let i = i0; i <= i1; i++) {
        const idx = i + nx * (j + ny * k);
        if (occ[idx] !== 1 || ghost[idx] !== 0) continue;
        const wx = grid.originX + (i + 0.5) * grid.pitch - pose.x;
        if (!keyOf(wx, wy, wz, cand)) continue;
        const top = topOfKey.get(cand.key)!;
        if (cand.zl < top - layer) continue; // below the footprint cell's top
        ghost[idx] = GHOST_BURN;
        grid.markChunkDirty(i, j, k);
        marked++;
      }
    }
  }
  if (marked > 0 && pose.moveIndex !== state.lastMarkedMove) {
    stats.laserMarked++;
    state.lastMarkedMove = pose.moveIndex;
  }
}
