import { describe, expect, it } from 'vitest';
import { movesToPoses, moveDurations } from '../poses';
import type { Move, Stock } from '../../core/types';

const flatStock: Stock = {
  kind: 'box',
  sizeX: 100,
  sizeY: 50,
  sizeZ: 40,
  origin: { x: 'mid', y: 'mid', z: 'min' },
  axisMode: '3-axis',
  materialId: 'test',
};

const cylStock: Stock = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 20, effectiveRadius: 20 },
  axisMode: '4-axis',
  materialId: 'test',
};

const D2R = Math.PI / 180;

describe('movesToPoses — modal accumulation', () => {
  it('first move emits NO pose; later moves accumulate modal words', () => {
    const moves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 }, // positions only
      { words: { y: 10 }, feed: 100 }, // x/z modal → (10,10,5)
      { words: {}, feed: 100 }, // no motion → still one pose at (10,10,5)?
    ];
    const poses = movesToPoses(moves, flatStock, () => 0, 0.5);
    // move 1: positions, no pose. move 2: one linear step of 10mm ≥ 0.25 → subdivided
    const move1 = poses.filter((p) => p.moveIndex === 1);
    expect(poses.some((p) => p.moveIndex === 0)).toBe(false);
    expect(move1.length).toBeGreaterThan(1);
    // every subdivided pose of move 1 lerps x from 10, y 0→10, z 5
    expect(move1[0].x).toBeCloseTo(10);
    expect(move1[move1.length - 1].y).toBeCloseTo(10);
    expect(move1[move1.length - 1].z).toBeCloseTo(5);
    // move 2: zero motion → single degenerate pose (n=1) at the same spot
    const move2 = poses.filter((p) => p.moveIndex === 2);
    expect(move2.length).toBe(1);
    expect(move2[0].y).toBeCloseTo(10);
  });

  it('modal Z seeds at the HIGH PARK, not 0 — no phantom plunge sweep on the first rapid', () => {
    // probe-verified 2026-10-25: a job whose first move positions in XY
    // only (the entry-safety convention) and whose second move lifts Z
    // would, from a z=0 seed, fabricate a rapid sweep from mid-stock up
    // through the crown — a phantom gouge at move 1. The seed is the
    // tool-change park: startZ (default crown + clearance).
    const moves: Move[] = [
      { words: { x: 10, y: 0 }, feed: 0, rapid: true }, // positions in XY only
      { words: { z: 50 }, feed: 0, rapid: true }, // the lift — from the park
      { words: { z: 5, x: 10, y: 0 }, feed: 100 }, // descend at the destination
    ];
    const park = 45; // stockTopZ(box 40, z-min) = 40, + 5 clearance
    const poses = movesToPoses(moves, flatStock, () => 0, 0.5, park);
    expect(poses.some((p) => p.moveIndex === 0)).toBe(false);
    // move 1 (the lift): from the park UP — every sample rides at/above
    // the park, never through the stock below it
    const lift = poses.filter((p) => p.moveIndex === 1);
    expect(lift.length).toBeGreaterThan(0);
    for (const p of lift) expect(p.z).toBeGreaterThanOrEqual(park - 1e-9);
  });

  it('3-axis poses carry axis (0,0,−1) and identity mapping', () => {
    const poses = movesToPoses(
      [
        { words: { x: 1, y: 2, z: 3 }, feed: 100 },
        { words: { x: 2 }, feed: 100 },
      ],
      flatStock,
      () => 7,
      0.5,
    );
    const last = poses[poses.length - 1];
    expect(last.x).toBeCloseTo(2);
    expect(last.y).toBeCloseTo(2);
    expect(last.z).toBeCloseTo(3);
    expect(last.ax).toBe(0);
    expect(last.ay).toBe(0);
    expect(last.az).toBe(-1);
    expect(last.tool).toBe(7);
    expect(last.rapid).toBe(false);
  });

  it('rapid flag propagates; subdivision of rapids happens too', () => {
    const poses = movesToPoses(
      [
        { words: { x: 0, y: 0, z: 10 }, feed: 0 },
        { words: { x: 40 }, feed: 0, rapid: true },
      ],
      flatStock,
      () => 0,
      1,
    );
    const rp = poses.filter((p) => p.moveIndex === 1);
    expect(rp.length).toBe(80); // 40mm / 0.5mm steps
    expect(rp.every((p) => p.rapid)).toBe(true);
  });
});

describe('movesToPoses — 4-axis rotary mapping', () => {
  it('rotary move subdivides to ≤ chord step and maps exactly like toDisplay', () => {
    // facing-style move: pure A feed revolution 0 → 90° at fixed y=−25 (the
    // tool at radius 25), z = 20 (on the axis plane): 90° = 1.5708 rad;
    // chord step = (0.25/2)/20 = 0.00625 rad → n = ceil(1.5708/0.00625) = 252
    const moves: Move[] = [
      { words: { x: 5, y: -25, z: 20, a: 0 }, feed: 100 },
      { words: { a: 90 }, feed: 100 },
    ];
    const poses = movesToPoses(moves, cylStock, () => 0, 0.25);
    const rot = poses.filter((p) => p.moveIndex === 1);
    const nExpect = Math.ceil((90 * D2R) / ((0.125 / 20)));
    expect(rot.length).toBe(nExpect);
    // golden: the FINAL pose at θ = 90°: cos = 0 (≈6e-17), sin = 1
    // zrel = 20−20 = 0 → tipY = −25·0 + 0·1 = 0; tipZ = −(−25)·1 + 0 + 20 = 45
    const last = rot[rot.length - 1];
    expect(last.y).toBeCloseTo(0, 9);
    expect(last.z).toBeCloseTo(45, 9);
    // mid sample: poses are k = 1..n with t = k/n — probe its exact θ
    const idx = Math.floor(rot.length / 2);
    const mid = rot[idx];
    const t = (idx + 1) / rot.length;
    const thk = t * 90 * D2R;
    expect(mid.y).toBeCloseTo(-25 * Math.cos(thk), 9);
    expect(mid.z).toBeCloseTo(25 * Math.sin(thk) + 20, 9);
    // tool axis at 90°: (0, −sin90, −cos90) = (0, −1, 0)
    expect(last.ax).toBeCloseTo(0);
    expect(last.ay).toBeCloseTo(-1);
    expect(last.az).toBeCloseTo(0);
  });

  it('accumulated A past 360 keeps rotating (raw radians, never normalized)', () => {
    const moves: Move[] = [
      { words: { x: 5, y: -25, z: 20, a: 360 }, feed: 100 },
      { words: { a: 450 }, feed: 100 }, // ends at A=450 = 90° mod 360
    ];
    const poses = movesToPoses(moves, cylStock, () => 0, 1);
    const rot = poses.filter((p) => p.moveIndex === 1);
    const last = rot[rot.length - 1];
    expect(last.y).toBeCloseTo(0, 9);
    expect(last.z).toBeCloseTo(45, 9);
    expect(last.ay).toBeCloseTo(-1);
  });

  it('flat move after a pure-A rapid index is mapped in the SHIFTED frame', () => {
    const moves: Move[] = [
      { words: { x: 10, y: -25, z: 20, a: 0 }, feed: 100 },
      { words: { a: 90 }, feed: 0, rapid: true }, // index — no poses
      { words: { z: 15 }, feed: 50 }, // flat plunge in the indexed frame
    ];
    const poses = movesToPoses(moves, cylStock, () => 0, 2);
    expect(poses.some((p) => p.moveIndex === 1)).toBe(false); // index emits nothing
    const plunge = poses.filter((p) => p.moveIndex === 2);
    expect(plunge.length).toBeGreaterThan(0);
    const last = plunge[plunge.length - 1];
    // machine tip (10, −25, 15) at θ=90°: zrel = −5 → tipY = −25·0 + (−5)·1 = −5
    // tipZ = 25·1 + (−5)·0 + 20 = 45
    expect(last.x).toBeCloseTo(10);
    expect(last.y).toBeCloseTo(-5, 9);
    expect(last.z).toBeCloseTo(45, 9);
    // the tool axis is rotated too: (0, −1, 0) at 90°
    expect(last.ay).toBeCloseTo(-1);
    expect(last.az).toBeCloseTo(0);
  });

  it('A-only FEED move emits poses (a facing ring cuts)', () => {
    const moves: Move[] = [
      { words: { x: 5, y: -25, z: 20, a: 0 }, feed: 100 },
      { words: { a: 30 }, feed: 600 },
    ];
    const poses = movesToPoses(moves, cylStock, () => 0, 1);
    expect(poses.some((p) => p.moveIndex === 1)).toBe(true);
  });
});

describe('moveDurations', () => {
  it('G93 simultaneous move: feed = 1/minutes', () => {
    const t = moveDurations([
      { words: { x: 0, y: 0, z: 0, a: 0 }, feed: 1 },
      { words: { x: 10, a: 90 }, feed: 0.5 },
    ]);
    expect(t[0]).toBe(0);
    expect(t[1]).toBeCloseTo(2); // 1/0.5
  });

  it('G94 linear move: path length / feed', () => {
    const t = moveDurations([
      { words: { x: 0, y: 0, z: 0 }, feed: 1 },
      { words: { x: 6, y: 8 }, feed: 100 },
    ]);
    expect(t[1]).toBeCloseTo(0.1); // 10mm @ 100mm/min
  });

  it('full-circle arc: 2πr / feed — the zero chord must not time as zero', () => {
    // start==end around (0,0) at r=10 — the endpoint chord is 0, the
    // true path is 2π·10 ≈ 62.83mm (the chord-based duration was 0)
    const t = moveDurations([
      { words: { x: 10, y: 0, z: -1 }, feed: 100 },
      { words: { x: 10, y: 0, z: -1 }, feed: 100, arc: { i: -10, j: 0, cw: true } },
    ]);
    expect(t[1]).toBeCloseTo((2 * Math.PI * 10) / 100, 6);
  });

  it('partial arc: quadrant arc times as (π/2)·r / feed', () => {
    const t = moveDurations([
      { words: { x: 10, y: 0, z: -1 }, feed: 100 },
      { words: { x: 0, y: 10, z: -1 }, feed: 100, arc: { i: -10, j: 0, cw: false } },
    ]);
    expect(t[1]).toBeCloseTo((Math.PI / 2) * 10 / 100, 6);
  });

  it('A-only G94 feed move: |ΔA| deg/min (ROTARY_FEED_DEG_MIN pattern)', () => {
    const t = moveDurations([
      { words: { a: 0 }, feed: 1 },
      { words: { a: 360 }, feed: 360 * 6.6 },
    ]);
    expect(t[1]).toBeCloseTo(1 / 6.6);
  });

  it('rapid: per-axis max, X 1200 / Z 600 / A 3600 mm|deg per minute', () => {
    const t = moveDurations([
      { words: { x: 0, y: 0, z: 0, a: 0 }, feed: 0 },
      { words: { x: 10 }, feed: 0, rapid: true },
    ]);
    expect(t[1]).toBeCloseTo(10 / 1200);
    const t2 = moveDurations([
      { words: { z: 0, a: 0 }, feed: 0 },
      { words: { z: -6 }, feed: 0, rapid: true },
    ]);
    expect(t2[1]).toBeCloseTo(6 / 600);
    const t3 = moveDurations([
      { words: { a: 0 }, feed: 0 },
      { words: { a: 180 }, feed: 0, rapid: true },
    ]);
    expect(t3[1]).toBeCloseTo(180 / 3600);
  });

  it('zero-motion moves → 0 even with feed stamped', () => {
    const t = moveDurations([{ words: { x: 5 }, feed: 100 }, { words: { x: 5 }, feed: 100 }]);
    expect(t[1]).toBe(0);
  });
});

describe('movesToPoses — Move.arc tessellation (2026-11-12)', () => {
  it('FULL CIRCLE (start==end) yields a nonzero-length path, not zero samples', () => {
    // unmodified endpoint-to-endpoint code saw a zero-length move here —
    // the whole point of the arc branch
    const moves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 }, // positions at the circle's start
      { words: { x: 10, y: 0 }, feed: 100, arc: { i: -10, j: 0, cw: false } }, // full ccw circle r=10
    ];
    const poses = movesToPoses(moves, flatStock, () => 0, 0.5);
    const arc = poses.filter((p) => p.moveIndex === 1);
    expect(arc.length).toBeGreaterThan(1);
    // path length ≈ circumference
    let len = 0;
    let last = { x: 10, y: 0, z: 5 };
    for (const p of arc) {
      len += Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      last = p;
    }
    expect(len).toBeCloseTo(2 * Math.PI * 10, 0);
    // ends where it started
    expect(arc[arc.length - 1].x).toBeCloseTo(10);
    expect(arc[arc.length - 1].y).toBeCloseTo(0);
    // every sample sits on the circle about (0,0)
    for (const p of arc) expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 6);
  });

  it('QUARTER arc reaches the same endpoint as the linear equivalent', () => {
    // ccw 90°: start (10,0), center (0,0) → end (0,10)
    const arcMoves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 },
      { words: { x: 0, y: 10 }, feed: 100, arc: { i: -10, j: 0, cw: false } },
    ];
    const linMoves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 },
      { words: { x: 0, y: 10 }, feed: 100 },
    ];
    const arcPoses = movesToPoses(arcMoves, flatStock, () => 0, 0.5);
    const linPoses = movesToPoses(linMoves, flatStock, () => 0, 0.5);
    const arcEnd = arcPoses[arcPoses.length - 1];
    const linEnd = linPoses[linPoses.length - 1];
    expect(arcEnd.x).toBeCloseTo(linEnd.x, 9);
    expect(arcEnd.y).toBeCloseTo(linEnd.y, 9);
    expect(arcEnd.z).toBeCloseTo(linEnd.z, 9);
    // and the arc stays on its circle mid-flight while the line does not
    const arcMid = arcPoses.filter((p) => p.moveIndex === 1)[
      Math.floor(arcPoses.filter((p) => p.moveIndex === 1).length / 2)
    ];
    expect(Math.hypot(arcMid.x, arcMid.y)).toBeCloseTo(10, 6);
  });

  it('CW vs CCW take opposite semicircles between the same endpoints', () => {
    // start (10,0), end (−10,0), center (0,0): cw goes via (0,−10), ccw via (0,10)
    const mk = (cw: boolean): Move[] => [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 },
      { words: { x: -10, y: 0 }, feed: 100, arc: { i: -10, j: 0, cw } },
    ];
    const cwMid = movesToPoses(mk(true), flatStock, () => 0, 0.5).filter((p) => p.moveIndex === 1);
    const ccwMid = movesToPoses(mk(false), flatStock, () => 0, 0.5).filter((p) => p.moveIndex === 1);
    const cwHalf = cwMid[Math.floor(cwMid.length / 2)];
    const ccwHalf = ccwMid[Math.floor(ccwMid.length / 2)];
    expect(cwHalf.y).toBeLessThan(0);
    expect(ccwHalf.y).toBeGreaterThan(0);
  });

  it('helical Z interpolates linearly along the arc', () => {
    const moves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 },
      { words: { x: 0, y: 10, z: -5 }, feed: 100, arc: { i: -10, j: 0, cw: false } },
    ];
    const poses = movesToPoses(moves, flatStock, () => 0, 0.5);
    const arc = poses.filter((p) => p.moveIndex === 1);
    expect(arc.length).toBeGreaterThan(1);
    const n = arc.length;
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / n;
      expect(arc[k].z).toBeCloseTo(5 + (-5 - 5) * t, 9);
    }
  });

  it('arc moves are never rapid and carry tool + moveIndex like the linear path', () => {
    const moves: Move[] = [
      { words: { x: 10, y: 0, z: 5 }, feed: 100 },
      { words: { x: 0, y: 10 }, feed: 100, arc: { i: -10, j: 0, cw: false } },
    ];
    const poses = movesToPoses(moves, flatStock, () => 3, 0.5);
    for (const p of poses.filter((q) => q.moveIndex === 1)) {
      expect(p.rapid).toBe(false);
      expect(p.tool).toBe(3);
    }
  });
});
