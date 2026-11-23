import { describe, expect, it } from 'vitest';
import { vcarveFlat, type VCarveFlatOp } from '../vcarveFlat';
import type { Tool, Vec2 } from '../../core/types';

const vbit = (over: Partial<Tool> = {}): Tool => ({
  id: 't1',
  name: '90° engraving bit',
  type: 'vbit',
  diameter: 3.175,
  vAngle: 90,
  tipDiameter: 0,
  spindleRpm: 12000,
  ...over,
});

const op = (loops: Vec2[][], over: Partial<VCarveFlatOp> = {}): VCarveFlatOp => ({
  id: 'op1',
  toolId: 't1',
  loops,
  surfaceZ: 0,
  feed: 600,
  plungeFeed: 200,
  clearance: 5,
  ...over,
});

function circlePts(cx: number, cy: number, r: number, n = 96): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function rectPts(x0: number, y0: number, w: number, h: number): Vec2[] {
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ];
}

/** exact point-to-segment-set distance */
function exactDist(p: Vec2, segs: { a: Vec2; b: Vec2 }[]): number {
  let best = Infinity;
  for (const s of segs) {
    const vx = s.b.x - s.a.x;
    const vy = s.b.y - s.a.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (s.a.x + t * vx), p.y - (s.a.y + t * vy));
    if (d < best) best = d;
  }
  return best;
}

function loopSegs(loops: Vec2[][]): { a: Vec2; b: Vec2 }[] {
  const segs: { a: Vec2; b: Vec2 }[] = [];
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      segs.push({ a: loop[j], b: loop[i] });
    }
  }
  return segs;
}

function insideEvenOdd(p: Vec2, loops: Vec2[][]): boolean {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i];
      const b = loop[j];
      if ((a.y > p.y) !== (b.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (p.x < x) inside = !inside;
      }
    }
  }
  return inside;
}

/** modal-tracked cut segments from the move list (x/y/z all modal) */
function cutSegments(moves: { words: { x?: number; y?: number; z?: number }; feed: number; rapid?: boolean }[]): {
  x: number;
  y: number;
  z: number;
}[][] {
  const segs: { x: number; y: number; z: number }[][] = [];
  let cur = { x: 0, y: 0, z: 0 };
  for (const m of moves) {
    const nxt = {
      x: m.words.x !== undefined ? m.words.x : cur.x,
      y: m.words.y !== undefined ? m.words.y : cur.y,
      z: m.words.z !== undefined ? m.words.z : cur.z,
    };
    if (!m.rapid && m.feed > 0) {
      if (nxt.x !== cur.x || nxt.y !== cur.y || nxt.z !== cur.z) segs.push([cur, nxt]);
    }
    cur = nxt;
  }
  return segs;
}

/** the deepest cut any pass achieves at p: max over sampled tool tips of
 *  (tipDepth − horizontal distance)/tanα — the swept cone's envelope. */
function achievedDepth(
  p: Vec2,
  segs: { x: number; y: number; z: number }[][],
  surfaceZ: number,
  tanA: number,
): number {
  let best = 0;
  for (const [a, b] of segs) {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      const depth = surfaceZ - z;
      const cut = (depth - Math.hypot(p.x - x, p.y - y)) / tanA;
      if (cut > best) best = cut;
    }
  }
  return best;
}

describe('vcarveFlat generator', () => {
  it('fills a disc with a center plunge at the inscribed depth plus one backstop ring', () => {
    const res = vcarveFlat(op([circlePts(0, 0, 1)]), vbit());
    // the medial axis of a disc is its center: one plunge to depth r/tan45 = 1
    const plunges = res.moves
      .filter((m) => !m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z as number);
    expect(Math.min(...plunges)).toBeCloseTo(-1, 1);
    // backstop ring at the first ladder level: offset 0.6, depth 0.6
    expect(res.ringPasses).toBe(1);
    const ringComment = res.moves.find((m) => m.comment?.includes('ring'));
    expect(ringComment).toBeDefined();
    expect(res.corePasses).toBeGreaterThanOrEqual(1);
    expect(res.capped).toBe(false);
    expect(res.maxDepthCut).toBeCloseTo(1, 1);
    expect(res.estimatedMinutes).toBeGreaterThan(0);
  });

  it('carves a stroke along its centerline with crisp tapering ends', () => {
    const res = vcarveFlat(op([rectPts(-5, -1, 10, 2)]), vbit());
    expect(res.corePasses).toBeGreaterThanOrEqual(1);
    // collect the variable-depth groove pass: depths taper to ~0 at the ends
    const groove = res.moves.filter((m) => m.comment === 'v-carve groove pass');
    expect(groove.length).toBeGreaterThanOrEqual(1);
    const segs = cutSegments(res.moves);
    const tanA = 1; // 90° bit
    // the middle of the stroke is cut to the full halfwidth depth (1mm)
    const mid = achievedDepth({ x: 0, y: 0 }, segs, 0, tanA);
    expect(mid).toBeCloseTo(1, 1);
    // near the end edge midpoint the required depth drops toward 0 — crisp tip
    const nearEnd = exactDist({ x: -4.6, y: 0 }, loopSegs([rectPts(-5, -1, 10, 2)]));
    const endCut = achievedDepth({ x: -4.6, y: 0 }, segs, 0, tanA);
    expect(endCut).toBeLessThan(nearEnd + 0.15);
    expect(endCut).toBeGreaterThan(0); // the ridge ran out to the tip
  });

  it('never undercuts the outline (every tip inside its inscribed ball)', () => {
    for (const loops of [
      [rectPts(-5, -1, 10, 2)],
      [circlePts(0, 0, 5)],
      [circlePts(0, 0, 6), circlePts(0, 0, 2)], // annulus: the hole subtracts
    ]) {
      const res = vcarveFlat(op(loops), vbit());
      const segs = cutSegments(res.moves);
      const boundary = loopSegs(loops);
      for (const [a, b] of segs) {
        const len = Math.max(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 1e-9);
        const n = Math.max(1, Math.ceil(len / 0.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const depth = -(a.z + (b.z - a.z) * t); // surfaceZ = 0
          const r = exactDist({ x, y }, boundary);
          expect(depth).toBeLessThanOrEqual((r - 0) / 1 + 0.03); // 90° bit, rt = 0
        }
      }
    }
  });

  it('covers every interior sample to its dish depth', () => {
    for (const loops of [
      [rectPts(-5, -1, 10, 2)],
      [circlePts(0, 0, 5)],
      [circlePts(0, 0, 6), circlePts(0, 0, 2)],
    ]) {
      const res = vcarveFlat(op(loops), vbit());
      const segs = cutSegments(res.moves);
      const boundary = loopSegs(loops);
      let worst = 0;
      for (let x = -6; x <= 6; x += 0.25) {
        for (let y = -6; y <= 6; y += 0.25) {
          const p = { x, y };
          if (!insideEvenOdd(p, loops)) continue;
          const r = exactDist(p, boundary);
          if (r < 0.15) continue; // boundary band: below the raster's care
          // capped interiors ride the clearing washboard: the floor between
          // grooves stands up to CLEAR_AMPLITUDE above the cap (0.25mm)
          const required = r <= 1.5875 ? r : 1.5875 - 0.26;
          const got = achievedDepth(p, segs, 0, 1);
          if (required - got > worst) worst = required - got;
        }
      }
      expect(worst).toBeLessThanOrEqual(0.15);
    }
  });

  it('caps and clears wide shapes with dense rings at the cone height', () => {
    // Ø10 disc: needs depth 5, the 90° cone caps at 1.5875 → capped = true
    const res = vcarveFlat(op([circlePts(0, 0, 5)]), vbit());
    expect(res.capped).toBe(true);
    expect(res.maxDepthCut).toBeCloseTo(1.5875, 2);
    // dish rings up the ladder, then dense clearing rings all at the cap
    const depths = new Set<number>();
    for (const m of res.moves) {
      if (m.comment?.includes('ring')) {
        const d = Number(m.comment.match(/([\d.]+)mm deep/)?.[1]);
        if (!Number.isNaN(d)) depths.add(d);
      }
    }
    expect(depths.size).toBeGreaterThanOrEqual(4); // ladder + several clearing levels
    expect([...depths].some((d) => Math.abs(d - 1.5875) < 0.01)).toBe(true);
  });

  it('leaves thin strokes to the cores alone (no ring can offset there)', () => {
    const res = vcarveFlat(op([rectPts(-10, -0.15, 20, 0.3)]), vbit());
    expect(res.ringPasses).toBe(0);
    expect(res.corePasses).toBeGreaterThanOrEqual(1);
    expect(res.maxDepthCut).toBeLessThan(0.2); // halfwidth 0.15 at 45°
    expect(res.capped).toBe(false);
  });

  it('honors a flat tip: depth law shifts by rt', () => {
    // halfwidth 1, rt = 0.25: centerline depth = (1 − 0.25)/tan45 = 0.75
    const res = vcarveFlat(op([rectPts(-5, -1, 10, 2)]), vbit({ tipDiameter: 0.5 }));
    expect(res.maxDepthCut).toBeCloseTo(0.75, 1);
  });

  it('respects a user depth cap below the cone height', () => {
    const res = vcarveFlat(op([rectPts(-5, -1, 10, 2)], { maxDepth: 0.4 }), vbit());
    expect(res.maxDepthCut).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(res.capped).toBe(true);
  });

  it('refuses bad inputs with clear errors', () => {
    expect(() => vcarveFlat(op([]), vbit())).toThrow(/at least one closed filled shape/);
    expect(() => vcarveFlat(op([[{ x: 0, y: 0 }]]), vbit())).toThrow(/closed filled shape/);
    expect(() => vcarveFlat(op([rectPts(0, 0, 2, 2)]), { ...vbit(), type: 'flat' })).toThrow(/V-bit/);
    expect(() => vcarveFlat(op([rectPts(0, 0, 2, 2)]), vbit({ vAngle: undefined }))).toThrow(/tip angle/);
    expect(() => vcarveFlat(op([rectPts(0, 0, 2, 2)], { feed: 0 }), vbit())).toThrow(/feed/);
    expect(() => vcarveFlat(op([rectPts(0, 0, 2, 2)]), vbit({ tipDiameter: 3.175 }))).toThrow(/no cone flank/);
  });
});
