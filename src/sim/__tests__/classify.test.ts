import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '../grid';
import { buildToolSpec } from '../toolShape';
import { carvePoses, emptyStats, type CarveStats } from '../carve';
import type { Pose } from '../poses';
import type { Stock, Tool } from '../../core/types';

/**
 * Alice's 3-class classification (design call 2026-10-25): FINE removal
 * within the op's step-down of the standing surface, YELLOW GOUGE beyond
 * it (or any rapid removal), RED COLLISION for shank contact (no removal).
 * All fixtures are box stock, pitch 1. The standing surface follows the
 * pose's family: vertical columns (±Z tools) or the Y-line ends (±90°
 * indexed tools) — the 2026-10-26 two-waterline fix.
 */

const boxStock = (size = 10, pitch = 1): { stock: Stock; grid: VoxelGrid } => {
  const stock: Stock = {
    kind: 'box',
    sizeX: size,
    sizeY: size,
    sizeZ: size,
    origin: { x: 'min', y: 'min', z: 'min' },
    axisMode: '3-axis',
    materialId: 'test',
  };
  return { stock, grid: new VoxelGrid(stock, pitch) };
};

const flatTool: Tool = {
  id: 'f6',
  name: 'flat 6',
  type: 'flat',
  diameter: 6,
  fluteLength: 30,
  spindleRpm: 18000,
};

const pose = (p: Partial<Pose>): Pose => ({
  x: 5,
  y: 5,
  z: 5,
  ax: 0,
  ay: 0,
  az: -1,
  tool: 0,
  moveIndex: 0,
  rapid: false,
  ...p,
});

describe('3-class classification', () => {
  it('a fresh grid zeroes the ghost array', () => {
    const { grid } = boxStock();
    for (let idx = 0; idx < grid.ghost.length; idx++) expect(grid.ghost[idx]).toBe(0);
  });

  it('(a) plunge 4 deep with stepDown 1: top 2 cells fine, bottom 2 yellow', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // single feed pose, tip at z=6: carves k=6..9 (centers 6.5..9.5) in the
    // 32 lattice columns within ρ ≤ 3 of (5,5); standing top was k=9 (9.5)
    const poses = [pose({ z: 6, moveIndex: 0 })];
    const stepDown = new Float32Array([1]);
    const stats: CarveStats = emptyStats();
    carvePoses(grid, [spec], poses, stats, stepDown);

    expect(stats.removed).toBe(128); // 32 columns × k=6..9
    expect(stats.gougedVoxels).toBe(64); // k=7 (2.0) and k=6 (3.0) > 1
    // k=9 (0.0) and k=8 (1.0 ≤ 1): fine — no ghost
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 9)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 8)]).toBe(0);
    // k=7, k=6: yellow
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 7)]).toBe(1);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 6)]).toBe(1);
    // no shank contact (fluteLen 30 covers the plunge)
    expect(stats.collisions).toBe(0);
    expect(stats.firstCollisionMove).toBeNull();
    // rapid-gouge semantics untouched: a feed plunge is not a gouge move
    expect(stats.gouges).toBe(0);
  });

  it('(b) the same plunge with stepDown 5: everything fine, no ghosts', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const stats = emptyStats();
    carvePoses(grid, [spec], [pose({ z: 6, moveIndex: 0 })], stats, new Float32Array([5]));
    expect(stats.removed).toBe(128);
    expect(stats.gougedVoxels).toBe(0);
    for (let idx = 0; idx < grid.ghost.length; idx++) expect(grid.ghost[idx]).toBe(0);
    expect(stats.collisions).toBe(0);
  });

  it('(c) short flute (fluteLen 2) plunging 5 deep: shank band stays SOLID, red ghost, collision counted', () => {
    const { grid } = boxStock(10, 1);
    const stub: Tool = { ...flatTool, fluteLength: 2, overallLength: 20 };
    const spec = buildToolSpec(stub); // shaftDiameter absent → shankRadius = 3
    // tip at z=5: flute (zl ∈ [0,2]) carves k=5 (zl 0.5), k=6 (zl 1.5);
    // k=7 (zl 2.5), k=8 (3.5), k=9 (4.5) are in the shank band
    // (zl ≤ 20, ρ² ≤ 9) → contact, NOT removed
    const stats = emptyStats();
    carvePoses(grid, [spec], [pose({ z: 5, moveIndex: 3 })], stats, new Float32Array(10).fill(5));

    expect(stats.removed).toBe(64); // 32 columns × k=5..6
    // material NOT removed above the flute
    expect(grid.filled(5, 5, 7)).toBe(true);
    expect(grid.filled(5, 5, 8)).toBe(true);
    expect(grid.filled(5, 5, 9)).toBe(true);
    expect(grid.filled(5, 5, 6)).toBe(false); // flute band did carve
    expect(grid.filled(5, 5, 5)).toBe(false);
    // red ghost on every contact cell (incl. the k=9 surface cell)
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 7)]).toBe(2);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 8)]).toBe(2);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 9)]).toBe(2);
    // k=5,6 were flute-removed at depth 9.5−7.5 = 2.0 (k=5: 3.0)
    // ≤ stepDown 5 → fine
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 6)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 5)]).toBe(0);
    // one move → one collision
    expect(stats.collisions).toBe(1);
    expect(stats.firstCollisionMove).toBe(3);
    // the shank contact did not feed the rapid-gouge stat (feed pose)
    expect(stats.gouges).toBe(0);
    expect(stats.gougedVoxels).toBe(0);
  });

  it('(d) rapid through virgin stock: every removal is a yellow gouge, gouge move stats unchanged', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // rapid pose tip at z=8: flute (zl ≤ 30) removes k=8,9 in 32 columns
    const stats = emptyStats();
    carvePoses(grid, [spec], [pose({ z: 8, moveIndex: 7, rapid: true })], stats);
    expect(stats.removed).toBe(64); // 32 columns × k=8..9
    expect(stats.gougedVoxels).toBe(64); // ALL rapid removals are yellow
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 9)]).toBe(1);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 8)]).toBe(1);
    expect(stats.gouges).toBe(1);
    expect(stats.firstGougeMove).toBe(7);
  });

  it('(e) missing/zero stepDown defaults to one voxel pitch: a 1-cell skin is fine, deeper is yellow', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // no moveStepDown array at all → default pitch 1: identical split to (a)
    const s1 = emptyStats();
    carvePoses(grid, [spec], [pose({ z: 6, moveIndex: 0 })], s1);
    expect(s1.gougedVoxels).toBe(64);
    expect(s1.removed).toBe(128);

    // explicit 0 behaves the same (drill peckDepth 0 = unset)
    const g2 = boxStock(10, 1).grid;
    const s2 = emptyStats();
    carvePoses(g2, [spec], [pose({ z: 6, moveIndex: 0 })], s2, new Float32Array([0]));
    expect(s2.gougedVoxels).toBe(64);

    // and a SKIN of exactly one pitch is fine: tip at 8.4, flute ceiling at
    // 8.4 + 30 covers the whole column, but the only material cell whose
    // center sits within the tip's below-surface cut (center 9.5, depth
    // 9.5 − 8.4 = 1.1 > 1.0)... no — the plunge REMOVES every cell above
    // the tip too (zl up to 30): k=9 at depth 1.1 > 1 is yellow, and the
    // flute also strips k=8 (2.1)…, so a one-pitch skin needs the tip just
    // one pitch deep with NO cells above — probe k=9 only: removed depth
    // 1.0 exactly = tolerance → fine. Tip at z=8.5? center 9.5 depth 1.0
    // exactly; but the plunge also strips k=8 (2.0)... use a SHORT flute so
    // nothing stands above: tip 8.5, fluteLen 1 removes only k=9 (zl 0.5,
    // depth 1.0 = tol) → fine skin
    const skinSpec = buildToolSpec({ ...flatTool, fluteLength: 1 });
    const g3 = boxStock(10, 1).grid;
    const s3 = emptyStats();
    carvePoses(g3, [skinSpec], [pose({ z: 8.5, moveIndex: 0 })], s3, new Float32Array([0]));
    expect(s3.removed).toBe(64); // k=8 (zl 0, depth 1.0) + k=9 (depth 0.0)
    expect(s3.gougedVoxels).toBe(0); // depth exactly 1.0 = one-pitch skin
    // one pitch deeper with the same tool: k=8's depth becomes 2.0 > 1
    const g4 = boxStock(10, 1).grid;
    const s4 = emptyStats();
    carvePoses(g4, [skinSpec], [pose({ z: 7.5, moveIndex: 0 })], s4, new Float32Array([0]));
    expect(s4.removed).toBe(64); // k=8,9 (flute ceiling at 8.5)
    expect(s4.gougedVoxels).toBe(32); // k=8 (2.0) yellow, k=9 (1.0) fine
  });

  it('per-MOVE baseline: split plunges yellow only what their own move exceeded', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const stepDown = new Float32Array(10).fill(1);
    // move 0: tip z=8 — carves k=8 (depth 1.0 = tol, fine) and k=9 (0.0).
    // move 1: tip z=6 — baseline snapshot is the POST-move-0 surface
    // (top k=7): k=7 (0.0) fine, k=6 (1.0 = tol) fine... but the flute
    // also strips k=8's GHOST from move 0? No — k=8 is already void. The
    // move-1 cut of k=7 sits exactly at tol → 0 yellow; k=6 also at tol.
    const stats = emptyStats();
    carvePoses(
      grid,
      [spec],
      [pose({ z: 8, moveIndex: 0 }), pose({ z: 6.5, moveIndex: 1 })],
      stats,
      stepDown,
    );
    // move 1 (tip 6.5): carves k=7 (0.0) and k=6 (1.0 = tol) — both fine
    expect(stats.removed).toBe(128);
    expect(stats.gougedVoxels).toBe(0);

    // one full-pitch DEEPER in move 1 (tip 5.5) exceeds the tolerance on
    // the k=5 cell (2.0 > 1) — and only that cell
    const g1b = boxStock(10, 1).grid;
    const s1b = emptyStats();
    carvePoses(
      g1b,
      [spec],
      [pose({ z: 8, moveIndex: 0 }), pose({ z: 5.5, moveIndex: 1 })],
      s1b,
      stepDown,
    );
    expect(s1b.removed).toBe(160); // k=5..9
    expect(s1b.gougedVoxels).toBe(32); // k=5 only

    // the SAME final depth in ONE move (the raster-without-waterline case):
    // the baseline stays the virgin surface for BOTH poses — k=5,6,7
    // (depths 4,3,2 from the 9.5 top) yellow; k=8 (1.0 = tol) fine
    const g2 = boxStock(10, 1).grid;
    const s2 = emptyStats();
    carvePoses(g2, [spec], [pose({ z: 8, moveIndex: 0 }), pose({ z: 5.5, moveIndex: 0 })], s2, stepDown);
    expect(s2.removed).toBe(160);
    expect(s2.gougedVoxels).toBe(96);
  });

  it('red wins where both classes touch a column; ghosts survive further carving of the cell', () => {
    const { grid } = boxStock(10, 1);
    const stub = buildToolSpec({ ...flatTool, fluteLength: 2, overallLength: 20 });
    // pose 1: plunge so the shank touches k=7,8 → red
    const s = emptyStats();
    carvePoses(grid, [stub], [pose({ z: 5, moveIndex: 0 })], s, new Float32Array([5]));
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 7)]).toBe(2);
    // pose 2: a longer-flute tool re-plunges and removes k=7 — the cell
    // flips to yellow removal semantics (ghost 1), not a stale red
    const long = buildToolSpec(flatTool);
    const s2 = emptyStats();
    carvePoses(grid, [long], [pose({ z: 5, moveIndex: 1 })], s2, new Float32Array([5]));
    expect(grid.filled(5, 5, 7)).toBe(false);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 7)]).toBe(1);
  });

  it('baseline is per-grid (a reset grid re-snapshots, no stale carry-over)', () => {
    const first = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const stepDown = new Float32Array([1]);
    const s1 = emptyStats();
    carvePoses(first.grid, [spec], [pose({ z: 6, moveIndex: 0 })], s1, stepDown);
    expect(s1.gougedVoxels).toBe(64);
    // a fresh grid (the worker's reset path), SAME move index
    const second = boxStock(10, 1);
    const s2 = emptyStats();
    carvePoses(second.grid, [spec], [pose({ z: 6, moveIndex: 0 })], s2, stepDown);
    expect(s2.gougedVoxels).toBe(64); // not 0 from the stale baseline
  });

  it('a 90°-indexed tool (axis −Y) classifies against the Y standing surface, not the Z columns', () => {
    // Alice's 2026-10-26 report: two waterline contours with a 90° index
    // between — the second op's deliberate passes painted ALL yellow. The
    // per-column baseline measured the removed voxels against the wrong
    // family: after the index the op's "material above the cut" runs along
    // the stock's Y axis. A tool along −Y reads the Y-line TOP end (the
    // surface it approaches from +Y) — same split as the vertical plunge.
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // tip at y=6, flute up +Y: removes j=6..9 in the 32 (x,z) lines within
    // ρ ≤ 3 of (5,·,5); the standing surface along +Y was j=9 (9.5)
    const stats: CarveStats = emptyStats();
    carvePoses(
      grid,
      [spec],
      [pose({ x: 5, y: 6, z: 5, ax: 0, ay: -1, az: 0, moveIndex: 0 })],
      stats,
      new Float32Array([1]),
    );
    expect(stats.removed).toBe(128); // 32 lines × j=6..9
    expect(stats.gougedVoxels).toBe(64); // j=6 (3.0) and j=7 (2.0) > 1
    expect(grid.ghost[5 + grid.nx * (9 + grid.ny * 5)]).toBe(0); // j=9 fine
    expect(grid.ghost[5 + grid.nx * (8 + grid.ny * 5)]).toBe(0); // j=8 (1.0 = tol)
    expect(grid.ghost[5 + grid.nx * (7 + grid.ny * 5)]).toBe(1); // j=7 yellow
    expect(grid.ghost[5 + grid.nx * (6 + grid.ny * 5)]).toBe(1); // j=6 yellow
  });

  it('the mirrored index (−90/270: axis +Y) reads the Y-line BOTTOM end', () => {
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // axis +Y: the flute extends toward −Y; tip at y=3 removes j=0..2 in
    // the 32 lines. The approach is from −Y, so the baseline is the line's
    // BOTTOM end (j=0, center 0.5): j=0,1 fine, j=2 (2.0) yellow
    const stats: CarveStats = emptyStats();
    carvePoses(
      grid,
      [spec],
      [pose({ x: 5, y: 3, z: 5, ax: 0, ay: 1, az: 0, moveIndex: 0 })],
      stats,
      new Float32Array([1]),
    );
    expect(stats.removed).toBe(96); // 32 lines × j=0..2
    expect(stats.gougedVoxels).toBe(32); // j=2 only (2.0 > 1)
    expect(grid.ghost[5 + grid.nx * (0 + grid.ny * 5)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (1 + grid.ny * 5)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (2 + grid.ny * 5)]).toBe(1);
  });

  it('mixed families: a vertical op then a 90°-indexed op — each reads its own frame', () => {
    // the shape of her report: op 1 clears vertically; op 2 (indexed 90°)
    // makes its own within-step-down passes over material op 1 left below
    // its floor — fine in op 2's frame, all-yellow under the old vertical
    // baseline
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const stats: CarveStats = emptyStats();
    // op 1 (move 0, vertical): plunge tip z=6 at (5,5) with stepDown 5 —
    // clears k=6..9 clean (all fine)
    carvePoses(grid, [spec], [pose({ z: 6, moveIndex: 0 })], stats, new Float32Array([5]));
    expect(stats.gougedVoxels).toBe(0);
    // op 2 (move 1, indexed): tool along −Y takes one step-down of the +Y
    // surface — tip y=8, within stepDown 1 of the j=9 line tops → ALL FINE
    // (a tip at y=6 would be a genuine 3mm gouge even in the right frame)
    carvePoses(
      grid,
      [spec],
      [pose({ x: 5, y: 8, z: 5, ax: 0, ay: -1, az: 0, moveIndex: 1 })],
      stats,
      new Float32Array([1, 1]),
    );
    // the removed cells exist (op 1's plunge left j=8..9 at k ≤ 5 standing)
    expect(stats.removed).toBeGreaterThan(128);
    // and NOT ONE of op 2's removals painted yellow — the regression
    expect(stats.gougedVoxels).toBe(0);
  });

  it('a 180°-indexed tool (axis +Z) classifies against the column BOTTOM — the four-angle quadrant', () => {
    // Alice's 2026-10-26 four-angle follow-up: 0/90/270 clean, 180° painted
    // yellow on every surface it touched. At 180° the stock is upside down:
    // the tool approaches from BELOW, so the vertical family must read the
    // column's bottom end, not its top.
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    // axis +Z: the flute extends toward −Z; tip at z=3 removes k=0..2 in
    // the 32 columns. The approach is from −Z, so the baseline is the
    // column bottom (k=0, center 0.5): k=0,1 fine, k=2 (2.0) yellow
    const stats: CarveStats = emptyStats();
    carvePoses(
      grid,
      [spec],
      [pose({ x: 5, y: 5, z: 3, ax: 0, ay: 0, az: 1, moveIndex: 0 })],
      stats,
      new Float32Array([1]),
    );
    expect(stats.removed).toBe(96); // 32 columns × k=0..2
    expect(stats.gougedVoxels).toBe(32); // k=2 only (2.0 > 1)
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 0)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 1)]).toBe(0);
    expect(grid.ghost[5 + grid.nx * (5 + grid.ny * 2)]).toBe(1);
  });

  it('mixed: a downward op then a 180°-indexed op reading the underside it left', () => {
    // op 1 (move 0) plunges from the top with stepDown 5 — clears k=6..9;
    // op 2 (move 1, indexed 180°) takes one step-down of the UNDERSIDE
    // (k=0..1 stands) — fine in its frame; the old top-end baseline read
    // those cells 4mm "below" op 1's floor and painted them yellow
    const { grid } = boxStock(10, 1);
    const spec = buildToolSpec(flatTool);
    const stats: CarveStats = emptyStats();
    carvePoses(grid, [spec], [pose({ z: 6, moveIndex: 0 })], stats, new Float32Array([5]));
    expect(stats.gougedVoxels).toBe(0);
    // 180° tool, tip at z=2: flute toward −Z removes k=0..1 — within
    // stepDown 1 of the k=0 bottom → ALL FINE
    carvePoses(
      grid,
      [spec],
      [pose({ x: 5, y: 5, z: 2, ax: 0, ay: 0, az: 1, moveIndex: 1 })],
      stats,
      new Float32Array([5, 1]),
    );
    expect(stats.removed).toBeGreaterThan(128); // op 2 really removed cells
    expect(stats.gougedVoxels).toBe(0); // and none of them painted yellow
  });

  // ── continuous-rotary RADIAL family (committee #4 M2, Alice's
  // 2026-10-27 "ribbons at every cut depth" report on a spiral facing
  // job): a tool at an in-between angle approaches the stock RADIALLY,
  // so the honest depth measure is radial at the voxel's own angle
  // against the sweep's VALLEY floor — the old world-axis column read
  // the previous winding's cusp ridge as overburden and painted ~2,300
  // ribbon cells on her real job. Exact index angles stay byte-identical
  // (the plunge/skim/Y-line pins above); box stock keeps the old
  // approximation (no axisZ). ─────────────────────────────────────────
  const rotaryStock = (r: number, axisZ = 0): { stock: Stock; grid: VoxelGrid } => {
    const stock: Stock = {
      kind: 'cylinder',
      length: 40,
      xOrigin: 'min',
      calibration: { aOriginDeg: 0, axisZ, effectiveRadius: r },
      axisMode: '4-axis',
      materialId: 'test',
    };
    return { stock, grid: new VoxelGrid(stock, 0.5) };
  };
  /** the radial-approach pose: tool axis at angle θ in the Y-Z plane
   * (axis = (0, −sinθ, −cosθ) — poses.ts's convention at A=θ), tip at
   * radius rTip on the θ spoke */
  const radialPose = (thetaDeg: number, rTip: number, moveIndex: number): Pose => {
    const t = (thetaDeg * Math.PI) / 180;
    return pose({
      y: Math.sin(t) * rTip,
      z: rTip * Math.cos(t),
      ax: 0,
      ay: -Math.sin(t),
      az: -Math.cos(t),
      moveIndex,
    });
  };

  it('(f) rotary spiral sweep at θ=45°: a full-radius pass paints NO ribbons — depth is radial vs the valley floor', () => {
    const R = 10;
    const { grid } = rotaryStock(R);
    const spec = buildToolSpec(flatTool);
    const stats: CarveStats = emptyStats();
    // two moves, one 0.5mm radial level each (a 2-level "ladder"):
    // pass 1 skins 0.5 off the full standing radius, pass 2 another 0.5.
    // stepDown 1 covers each increment → every removal must be FINE.
    // The OLD world-axis column read at 45° measured depth along machine
    // Z against the column top — 0.5 radial reads ~0.7+ at the diagonal,
    // plus the ridge-vs-valley misread → ribbons (her report).
    const stepDown = new Float32Array([1, 1]);
    for (const [mi, rTip] of [0, 1].map((mi) => [mi, R - 0.5 - mi * 0.5] as const)) {
      carvePoses(
        grid,
        [spec],
        [radialPose(45, rTip, mi as number)],
        stats,
        stepDown,
      );
    }
    expect(stats.removed).toBeGreaterThan(0); // really carved both passes
    expect(stats.gougedVoxels).toBe(0); // and painted NOTHING — the fix
  });

  it('(g) a genuine rotary plunge through virgin stock at θ=45° paints the deep cells (radial family keeps recall)', () => {
    const R = 10;
    const { grid } = rotaryStock(R);
    const spec = buildToolSpec(flatTool);
    const stats: CarveStats = emptyStats();
    // one move, tip 5mm deep radially at a 45° spoke — stepDown 1 →
    // everything past ~1mm radial depth must paint, exactly like the
    // vertical plunge pin (a) paints below the column top
    carvePoses(
      grid,
      [spec],
      [radialPose(45, R - 5, 0)],
      stats,
      new Float32Array([1]),
    );
    expect(stats.removed).toBeGreaterThan(0);
    expect(stats.gougedVoxels).toBeGreaterThan(0); // the honest paint
    // and a NEAR-INDEX angle (θ=89.9°) still rides the Y-line family —
    // the 90°-indexed-ops path is byte-identical (≥0.999 gate)
    const { grid: g2 } = rotaryStock(R);
    const stats2: CarveStats = emptyStats();
    carvePoses(
      g2,
      [spec],
      [radialPose(89.9, R - 5, 0)],
      stats2,
      new Float32Array([1]),
    );
    expect(stats2.gougedVoxels).toBeGreaterThan(0); // still paints deep
  });

  it('(h) box-rotary stock keeps the world-axis approximation — radial mode needs an axisZ', () => {
    // box stock on a rotary job: no calibration → rotaryAxisZ NaN → the
    // in-between angles fall back to the vertical family (the old
    // approximation), never the radial branch
    const stock: Stock = {
      kind: 'box',
      sizeX: 40,
      sizeY: 20,
      sizeZ: 20,
      origin: { x: 'min', y: 'mid', z: 'mid' },
      axisMode: '4-axis',
      materialId: 'test',
    };
    const grid = new VoxelGrid(stock, 0.5);
    expect(Number.isFinite(grid.rotaryAxisZ)).toBe(false);
    const spec = buildToolSpec(flatTool);
    const stats: CarveStats = emptyStats();
    carvePoses(grid, [spec], [radialPose(45, 8, 0)], stats, new Float32Array([1]));
    expect(stats.removed).toBeGreaterThan(0);
    // the fallback read the machine-Z column top at 45° — deep cells still
    // paint (an approximation, but never a silent NaN path)
    expect(stats.gougedVoxels).toBeGreaterThan(0);
  });
});
