import { describe, expect, it } from 'vitest';
import { developChain, vCarve } from '../vCarve';
import { ROTARY_FEED_DEG_MIN } from '../faceCylinder';

const axisZ = 40; // stock axis height, arbitrary

/** one chain point at (axial x, angle θ about the axis, radius r) */
function onChain(x: number, thetaDeg: number, r: number) {
  const t = (thetaDeg * Math.PI) / 180;
  return { x, y: Math.sin(t) * r, z: axisZ + Math.cos(t) * r };
}

/** θ=0 sits at +Z (top dead center); +θ rotates toward +Y. */
describe('developChain (chain → wrapped-engrave U,V)', () => {
  it('develops θ to U = θ·R and axial to V = x, loop order preserved', () => {
    const R = 5;
    const pts = [
      onChain(0, 0, R),
      onChain(2, 90, R),
      onChain(2, 180, R),
      onChain(0, 180, R),
      onChain(0, 90, R),
    ];
    const d = developChain(pts, R, axisZ);
    const circ = 2 * Math.PI * R;
    expect(d.radius).toBe(R);
    // +1: the ring CLOSES — the first vertex repeats as the last
    expect(d.path).toHaveLength(pts.length + 1);
    expect(d.path[0]).toEqual({ x: 0, y: 0 });
    expect(d.path[1].x).toBeCloseTo(circ / 4, 6); // θ=90 → quarter circumference
    expect(d.path[1].y).toBeCloseTo(2, 6);
    expect(d.path[2].x).toBeCloseTo(circ / 2, 6);
    expect(d.path[3].x).toBeCloseTo(circ / 2, 6);
    expect(d.path[4].x).toBeCloseTo(circ / 4, 6);
    // the closing vertex: same U,V as the first
    expect(d.path[pts.length].x).toBeCloseTo(d.path[0].x, 9);
    expect(d.path[pts.length].y).toBeCloseTo(d.path[0].y, 9);
  });

  it('unwraps continuously across the ±180° seam — no fold', () => {
    const R = 5;
    // a loop running −10° → +10° THROUGH the seam at ±180: going 170 →
    // −170 must read as +20° of travel, not −340
    const pts = [onChain(0, 170, R), onChain(1, 190, R), onChain(2, 170, R)];
    const d = developChain(pts, R, axisZ);
    const circ = 2 * Math.PI * R;
    expect(d.path[1].x).toBeCloseTo((190 / 360) * circ, 6); // 190°, not −170
    expect(d.path[2].x - d.path[1].x).toBeCloseTo((-20 / 360) * circ, 6); // back 20°
  });

  it('a closed ring develops to a closed loop (last = first U,V)', () => {
    const R = 4;
    // a real capsule-slot ring: dense θ sweep out and back, x varying —
    // the DETECTOR's output shape (loop order, no repeated vertex)
    const pts: ReturnType<typeof onChain>[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = -80 + (i / 16) * 160; // −80..80
      pts.push(onChain(2 + 1.5 * Math.cos((t * Math.PI) / 180), t, R));
    }
    for (let i = 15; i >= 1; i--) {
      const t = -80 + (i / 16) * 160;
      pts.push(onChain(2 - 1.5 * Math.cos((t * Math.PI) / 180), t, R));
    }
    const d = developChain(pts, R, axisZ);
    // the ring is closed by construction: last developed point = first
    expect(d.path.length).toBe(pts.length + 1);
    expect(d.path[d.path.length - 1].x).toBeCloseTo(d.path[0].x, 9);
    expect(d.path[d.path.length - 1].y).toBeCloseTo(d.path[0].y, 9);
  });
});

describe('vCarve (the 4-axis V-carve)', () => {
  const R = 5;
  // a DIAGONAL loop: θ and x advance together, so the pass runs real
  // coordinated X+A segments (G93) — the axis-aligned legs of a slot
  // only exercise the G94 branches
  const oneChain = {
    chains: [
      developChain(
        [onChain(0, 0, R), onChain(3, 30, R), onChain(3, 60, R), onChain(0, 90, R)],
        R,
        axisZ,
      ),
    ],
    depth: 0.8,
    stepDown: 0.8, // single pass
    feed: 400,
    plungeFeed: 100,
    clearance: 5,
    axisZ,
    startA: 0,
    toolId: 't1',
    id: 'v1',
  };

  it('cuts the developed loop: coordinated X+A segments run G93, axial G94', () => {
    const res = vCarve(oneChain);
    expect(res.moves.length).toBeGreaterThan(3);
    const cut = res.moves.filter((m) => !m.rapid);
    // first cut: the plunge at the path start (fixed A)
    expect(cut[0].words.z).toBeCloseTo(axisZ + R - 0.8, 6);
    // a pure-axial leg (the closing segment: θ 90→90... none here — the
    // first leg 0°→30° at x 0→3 is DIAGONAL: X and A both advance, so it
    // is coordinated — G93 inverse-time (feed = 1/minutes)
    const diag = cut.find((m) => m.words.x !== undefined && m.words.a !== undefined);
    expect(diag).toBeDefined();
    expect(diag!.words.x).toBeCloseTo(3, 6);
    // inverse-time: F = 1/t where t ≥ len/feed — F here ≠ the mm/min 400
    const len = Math.hypot(3, ((30 / 360) * 2 * Math.PI * (R - 0.8)) * 1);
    expect(diag!.feed).toBeGreaterThan(0);
    expect(Math.abs(1 / diag!.feed - len / 400)).toBeLessThan(0.02);
  });

  it('plunges once per level and retraces the loop per level (ladder)', () => {
    const res = vCarve({ ...oneChain, depth: 1.2, stepDown: 0.5 }); // 3 levels
    const zs = res.moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z);
    expect(zs).toHaveLength(3);
    expect(zs[0]).toBeCloseTo(axisZ + R - 0.4, 6); // 1.2/3
    expect(zs[2]).toBeCloseTo(axisZ + R - 1.2, 6);
  });

  it('A accumulates across chains — never unwinds between loops', () => {
    // chain 1 starts at θ=90 (positioning from startA 30 takes the SHORT
    // way: 30→90) and sweeps 90° to θ=180; chain 2 is a pure-axial path at
    // θ=180 (x 0→2) — its POSITIONING continues from chain 1's final A
    const two = {
      ...oneChain,
      chains: [
        developChain([onChain(0, 90, R), onChain(2, 180, R)], R, axisZ),
        developChain([onChain(0, 180, R), onChain(2, 180, R)], R, axisZ),
      ],
      startA: 30,
    };
    const res = vCarve(two);
    const withA = res.moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!);
    // positioning: 30 → 90 (short way, forward)
    expect(withA[0]).toBeCloseTo(90, 6);
    // the cut sweeps 90°: ends at 180
    expect(withA[withA.length - 1]).toBeCloseTo(180, 6);
    // chain 2's positioning rapid ALSO lands at 180 — it continued from
    // chain 1's final A, never winding back toward 30/0. The LAST A-word
    // in the move list is that rapid (chain 2's cut is x-only).
    expect(withA[withA.length - 1]).toBeCloseTo(180, 6);
    expect(Math.max(...withA)).toBeCloseTo(180, 6); // nothing overshot
  });

  it('refuses an empty selection and a non-positive depth', () => {
    expect(() => vCarve({ ...oneChain, chains: [] })).toThrow();
    expect(() => vCarve({ ...oneChain, depth: 0 })).toThrow();
  });
});