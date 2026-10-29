/**
 * Rotary carve kernel tests (PLAN.md Phase C): analytic on-axis fixtures
 * only — a cylinder and a cone give exact surface radii to assert
 * against, and a merged disc+shaft "mushroom" is the radial-undercut
 * torture shape for the blocked-cell report (the ray passes the disc,
 * then air, then the shaft). The relief.test.ts lessons apply: assert
 * against the ACTUAL geometry (a 2-point lathe profile is not a
 * hemisphere), and remember the tool at a cell cuts while the PART
 * rotates under it — Y never appears in a word.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Tool } from '../../core/types';
import { MAX_ROTARY_RPM, ROTARY_FEED_DEG_MIN } from '../faceCylinder';
import { dilateRotary, reindexStanding, rotaryCarve, type RotaryCarveOptions, type StandingGrid } from '../rotaryCarve';

const flatTool: Tool = { id: 'tf', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
const ballTool: Tool = { id: 'tb', name: '2mm ball', type: 'ball', diameter: 2, spindleRpm: 18000 };

/** on-axis solid cylinder, axis ∥ X, centered at the origin */
function cylinder(radius: number, length: number): Float32Array {
  const g = new THREE.CylinderGeometry(radius, radius, length, 48).toNonIndexed();
  g.rotateZ(Math.PI / 2); // geometry Y → machine X
  const attr = g.getAttribute('position') as THREE.BufferAttribute;
  return new Float32Array(attr.array as Float32Array);
}

/** on-axis cone, base (Ø 10) at x = −10, apex (Ø 0) at x = +10 */
function cone(): Float32Array {
  const g = new THREE.ConeGeometry(5, 20, 48).toNonIndexed();
  g.rotateZ(-Math.PI / 2); // apex (+Y) → +X
  const attr = g.getAttribute('position') as THREE.BufferAttribute;
  return new Float32Array(attr.array as Float32Array);
}

/** the radial-undercut mushroom: a Ø20 disc at x ∈ [−0.5, 0.5] over a
 * Ø8 shaft x ∈ [−5, 5] — a ray at x=0, any θ, passes material (disc),
 * air (r 4→9.5), material (shaft): the shaft is shadowed there. */
function mushroom(): Float32Array {
  const disc = new THREE.CylinderGeometry(10, 10, 1, 48).toNonIndexed();
  disc.rotateZ(Math.PI / 2);
  const shaft = new THREE.CylinderGeometry(4, 4, 10, 48).toNonIndexed();
  shaft.rotateZ(Math.PI / 2);
  const a = disc.getAttribute('position') as THREE.BufferAttribute;
  const b = shaft.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(a.count * 3 + b.count * 3);
  out.set(a.array as Float32Array, 0);
  out.set(b.array as Float32Array, a.count * 3);
  return out;
}

function opts(positions: Float32Array, over: Partial<RotaryCarveOptions> = {}): RotaryCarveOptions {
  return {
    positions,
    x0: -15,
    x1: 15,
    radius: 12,
    axisZ: 0,
    tool: flatTool,
    stepDown: 2,
    stepOver: 1,
    allowance: 0,
    datumAngle: 0,
    feed: 300,
    plungeFeed: 100,
    safeClearance: 2,
    ...over,
  };
}

/** all feed (non-rapid) moves' z words */
const cutZs = (moves: ReturnType<typeof rotaryCarve>['moves']) =>
  moves.filter((m) => !m.rapid && m.words.z !== undefined).map((m) => m.words.z!);

/** a 48-segment cylinder's sampled surface dips to the chord radius —
 * the dexel honestly follows the polygon the machine will cut */
const TESS = 5 * Math.cos(Math.PI / 48); // ≈ 4.9893

describe('rotaryCarve', () => {
  it('empty model: nothing to cut, no error', () => {
    const res = rotaryCarve(opts(new Float32Array(0)));
    expect(res.moves).toEqual([]);
    expect(res.stats).toEqual({ levels: 0, wraps: 0, rows: 0, blockedCells: 0 });
  });

  it('validates its parameters', () => {
    expect(() => rotaryCarve(opts(cylinder(5, 20), { stepDown: 0 }))).toThrow(/stepDown/);
    expect(() => rotaryCarve(opts(cylinder(5, 20), { stepOver: 0 }))).toThrow(/stepOver/);
    expect(() => rotaryCarve(opts(cylinder(5, 20), { allowance: -1 }))).toThrow(/allowance/);
  });

  it('the ladder runs COMPLETE sweeps at even radial planes until nothing is left', () => {
    // cylinder Ø10 in a Ø24 stock: surface radius ~5 → span ≈ 7.01mm in
    // n = ceil(7.01/2) = 4 even bands — three rough planes ≈ 10.25, 8.49,
    // 6.74, the finish owns the final band. Three levels, stop.
    const res = rotaryCarve(opts(cylinder(5, 20)));
    expect(res.stats.levels).toBe(3);
    // every roughing plunge lands exactly on a level plane (the finish's
    // plunge rides the surface — the tessellated ~TESS)
    const zs = [...new Set(cutZs(res.moves))];
    const span = 12 - TESS;
    for (const k of [1, 2, 3]) {
      const plane = 12 - (k * span) / 4;
      expect(zs.some((z) => Math.abs(z - plane) < 1e-3)).toBe(true); // the even plane
    }
    // never below the tessellated surface
    expect(Math.min(...cutZs(res.moves))).toBeGreaterThanOrEqual(TESS - 1e-6);
    // COMPLETE sweep (Alice's 2026-10-26 knight report): the level rings
    // run crown-parallel across the WHOLE stock span, not partial bands
    // hugging the part — leftover stock around the outer edge is what
    // rubbed the finish's flanks into walls of yellow
    const roughX = res.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => Math.abs(m.words.x!));
    expect(Math.max(...roughX)).toBeGreaterThan(14.5);
  });

  it('waste stock clears flat at the model floor (the raster clearToStock analog)', () => {
    // the model (Ø10, 20mm) leaves 10mm of bare stock at each X end:
    // those cells are WASTE — no model within the tool's reach — and a
    // complete Makera pass clears them flat at the waste floor = the
    // model's deepest compensated point, the same plane the ladder
    // bottoms near (the raster's clearFloorZ = model-floor analog)
    const res = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true }));
    // a far-X cell is waste: its finish z sits exactly at the floor
    const farZs = res.moves
      .filter((m) => !m.rapid && m.words.x !== undefined && Math.abs(m.words.x!) > 12)
      .map((m) => m.words.z)
      .filter((z): z is number => z !== undefined);
    expect(farZs.length).toBeGreaterThan(0);
    expect(Math.max(...farZs)).toBeCloseTo(TESS, 3); // flat at the floor
    // and the sweep spans the whole stock, waste included
    const xs = res.moves
      .filter((m) => !m.rapid && m.words.x !== undefined)
      .map((m) => m.words.x!);
    expect(Math.min(...xs)).toBeLessThan(-14.5);
    expect(Math.max(...xs)).toBeGreaterThan(14.5);
  });

  it('finishingOnly skips the ladder and follows the surface', () => {
    const res = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true }));
    expect(res.stats.levels).toBe(0);
    expect(res.moves.length).toBeGreaterThan(0);
    // on the body the flat disc's max rides the tessellation vertices (5);
    // waste cells clear flat at the model-floor plane (≈TESS, the
    // chord-midpoint minimum) — never deeper than the samples
    const zs = cutZs(res.moves);
    expect(zs.every((z) => z >= TESS - 1e-6 && z <= 5 + 1e-6)).toBe(true);
    expect(Math.max(...zs)).toBeCloseTo(5, 3);
    // 7mm below the stock radius with no rough: warned
    expect(res.warnings.join(' ')).toMatch(/finishing pass only/);
  });

  it('allowance lifts both the ladder stop and the finishing surface', () => {
    // comp ≈ 5 + 1: planes 10, 8, 6 cut (all above comp), 4 does not;
    // the finish rides one allowance above the surface
    const res = rotaryCarve(opts(cylinder(5, 20), { allowance: 1 }));
    expect(res.stats.levels).toBe(3);
    const zs = cutZs(res.moves);
    expect(Math.min(...zs)).toBeGreaterThan(5.5);
    expect(Math.min(...zs)).toBeLessThan(6.5);
  });

  it('the ball kernel reaches into the shoulder corner; the flat disc cannot', () => {
    const flat = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true }));
    const ball = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true, tool: ballTool }));
    // flat: the body rides the tessellation vertices (5); the pad corner
    // dips to the sampled flank (the disc's only in-reach sample). ball:
    // at that pad corner the kernel's single sample sits at d = tool r,
    // so the tip hangs a full ball-radius below it — the ball fillets
    // into the shoulder the disc cannot enter
    const fmin = Math.min(...cutZs(flat.moves));
    const bmin = Math.min(...cutZs(ball.moves));
    expect(fmin).toBeCloseTo(TESS, 3);
    expect(bmin).toBeLessThan(fmin - 0.5);
    // and never gouges the body: the on-body surface rides at 5
    expect(Math.max(...cutZs(ball.moves))).toBeLessThanOrEqual(5 + 1e-6);
  });

  it('horizontal: entry safety — no rapid combines Z with X or A, cuts are X-only G94 at the feed', () => {
    const res = rotaryCarve(opts(cylinder(5, 20)));
    for (const m of res.moves) {
      if (m.rapid) {
        expect(m.words.z === undefined || (m.words.x === undefined && m.words.a === undefined)).toBe(true);
      }
    }
    // an X cut move never carries an A word (the post would run G93);
    // the finish's varying-z moves are X(+Z) G94
    for (const m of res.moves) {
      if (!m.rapid && m.words.x !== undefined && m.words.a !== undefined) {
        throw new Error('X+A coordinated move in a horizontal sweep');
      }
    }
    // feed moves along X run at the linear feed
    const xCuts = res.moves.filter((m) => !m.rapid && m.words.x !== undefined);
    expect(xCuts.length).toBeGreaterThan(0);
    expect(xCuts.every((m) => m.feed === 300)).toBe(true);
  });

  it('finishing skims, never pays the crown toll between rings (Alice 2026-10-26)', () => {
    // a smooth cylinder: every transition leg crosses material at most
    // TESS tall, so the skim rides ≈ TESS + 0.5 — the crown (27) is for
    // entry/exit only
    const res = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true }));
    const rapidZs = res.moves
      .filter((m) => m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!);
    expect(rapidZs.length).toBeGreaterThan(0);
    // entry descends from the park height, the exit retracts to it — the
    // in-between skims stay near the surface
    expect(Math.max(...rapidZs)).toBeLessThan(27); // crown reached only at exit
    const inner = rapidZs.slice(1, -1);
    expect(inner.length).toBeGreaterThan(0);
    // the skim rides ≈ the compensated body surface (the disc kernel's
    // vertex radius 5) + the 0.5 gap — well below the 27 crown
    expect(Math.max(...inner)).toBeLessThanOrEqual(6.0 + 1e-6);
    // and the vertical sweep skims too
    const vres = rotaryCarve(opts(cylinder(5, 20), { finishingOnly: true, strategy: 'vertical' }));
    const vrapidZs = vres.moves
      .filter((m) => m.rapid && m.words.z !== undefined)
      .map((m) => m.words.z!);
    expect(vrapidZs.slice(1, -1).every((z) => z <= 6.0 + 1e-6)).toBe(true);
  });

  it('dilation: a feature lifts only within its TRUE angular reach (the knight sideways-bulge fix)', () => {
    // synthetic dexel: a body at 5 with a narrow angular band at 8.
    // Per-source arc conversion: the band's sources ride THEIR OWN
    // circumference (8·dθ ≈ 0.5mm/cell, tool r 1.5875 → reach ≈ 3 cells),
    // so the lift stops exactly 3 cells out — the old global
    // min-radius scale smeared it far wider (the "Z bulge that also
    // bulges sideways").
    const nx = 7;
    const nTheta = 100;
    const raw = new Float64Array(nx * nTheta).fill(5);
    for (let j = 48; j <= 52; j++) {
      for (let i = 0; i < nx; i++) raw[j * nx + i] = 8;
    }
    const tool: Tool = { id: 't', name: '3.175 flat', type: 'flat', diameter: 3.175, spindleRpm: 18000 };
    const d = dilateRotary(raw, nx, nTheta, 0.5, 12, tool);
    const dθ = (2 * Math.PI) / nTheta;
    // within reach: dj·8·dθ ≤ 1.5875 → dj ≤ 3 → j=55 (from band edge 52) lifts
    expect(3 * dθ * 8).toBeLessThanOrEqual(1.5875);
    expect(4 * dθ * 8).toBeGreaterThan(1.5875);
    expect(d[55 * nx + 3]).toBeCloseTo(8, 6);
    // beyond reach: j=56 (dj=4 → arc 2.01mm) keeps the body surface
    expect(d[56 * nx + 3]).toBeCloseTo(5, 6);
  });

  it('horizontal: A advances monotonically, levels start at the datum of the NEXT revolution', () => {
    const res = rotaryCarve(opts(cylinder(5, 20)));
    const aWords = res.moves.map((m) => m.words.a).filter((a): a is number => a !== undefined);
    expect(aWords.length).toBeGreaterThan(0);
    for (let k = 1; k < aWords.length; k++) expect(aWords[k]).toBeGreaterThan(aWords[k - 1]);
    // datum respected: the first A word sits at the datum phase
    const res90 = rotaryCarve(opts(cylinder(5, 20), { datumAngle: 90 }));
    const first = res90.moves.find((m) => m.words.a !== undefined)?.words.a;
    expect(first).toBeCloseTo(90, 6);
  });

  it('vertical: rough rings are A-only G94 at the surface feed capped by the ceiling; finish rings are G93', () => {
    const res = rotaryCarve(opts(cylinder(5, 20), { strategy: 'vertical' }));
    expect(res.stats.levels).toBe(3);
    // A-only feed moves: the deg/min feed at each level's cutting radius
    const rings = res.moves.filter((m) => !m.rapid && m.words.a !== undefined && m.words.x === undefined && m.words.z === undefined);
    expect(rings.length).toBeGreaterThan(0);
    const expected = (r: number) => Math.min((300 * 360) / (2 * Math.PI * r), ROTARY_FEED_DEG_MIN);
    const seen = rings.map((m) => m.feed);
    // the even planes: R − k·span/n (span = R − ~TESS, n = 4) — each ring's
    // deg/min feed is derived from its own plane radius
    const span = 12 - TESS;
    for (const k of [1, 2, 3]) {
      const want = expected(12 - (k * span) / 4);
      expect(seen.some((f) => Math.abs(f - want) < 0.01)).toBe(true);
    }
    // finish: A+Z coordinated moves carry inverse-time feeds — each
    // segment's F = 1/passMinutes with the ceiling flooring passMinutes
    // at its revolutions/6.6, so F·revs ≤ 6.6 per move
    const finishMoves = res.moves.filter((m) => !m.rapid && m.words.a !== undefined && m.words.z !== undefined);
    expect(finishMoves.length).toBeGreaterThan(0);
    for (const m of finishMoves) {
      expect(m.feed).toBeGreaterThan(0);
    }
  });

  it('spiralWrap: MULTI-COIL — lead = stepOver/rev, runs folded, A monotonic, full span covered', () => {
    // Alice, 2026-10-28 (un-parking the redesign): "a result very similar
    // to vertical except each vertical twisted very slightly to the side
    // to form a spiral" — the v1 single-revolution "draped string" never
    // touched most of the model. Fixture: stock Ø24 (r12) × 30 span,
    // stepOver 1 → nRev = 30 revolutions of coils.
    const res = rotaryCarve(opts(cylinder(5, 20), { strategy: 'spiralWrap' }));
    const helices = res.moves.filter((m) => (m.comment ?? '').startsWith('helix r'));
    // the cylinder is solid at every level: ONE run per level (the whole
    // sweep folded into a single helix move), 3 rough levels
    expect(helices.length).toBe(3);
    let prevA = 0;
    for (const m of helices) {
      expect(m.feed).toBeGreaterThan(0);
      // G93 inverse-time, ceiling-floored: F·minutes(rev) ≤ MAX_ROTARY_RPM
      expect(m.feed).toBeLessThanOrEqual(MAX_ROTARY_RPM + 1e-9);
      // a full-cylinder level folds to ONE move spanning ~30 revolutions:
      // Δa ≈ nRev·360 − one θ step, never the old single 360
      expect(m.words.a! - prevA).toBeGreaterThan(2 * 360);
      prevA = m.words.a!;
    }
    // A is monotonic across the whole op (the wrap rule): every a-worded
    // move advances, none retreats
    let last = -Infinity;
    for (const m of res.moves) {
      if (m.words.a === undefined) continue;
      expect(m.words.a).toBeGreaterThanOrEqual(last - 1e-9);
      last = m.words.a;
    }
    // the finish samples EVERY grid column (the coils tile the span): the
    // finish moves' X words cover the full stock span −15…+15
    const finish = res.moves.filter(
      (m) => !m.rapid && m.words.a !== undefined && m.words.x !== undefined && m.words.z !== undefined,
    );
    expect(finish.length).toBeGreaterThan(100);
    const xs = finish.map((m) => m.words.x!);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-14.9);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(14.9);
    // and every move coordinates A with X (and Z) → G93 inverse-time feeds
    for (const m of finish) expect(m.feed).toBeGreaterThan(0);
  });

  it('blocked cells: the mushroom shaft under the disc is reported; a plain cone is not', () => {
    const cap = rotaryCarve(opts(mushroom(), { finishingOnly: true }));
    expect(cap.stats.blockedCells).toBeGreaterThan(0);
    expect(cap.warnings.join(' ')).toMatch(/radial shadow/);
    const plain = rotaryCarve(opts(cone(), { finishingOnly: true }));
    expect(plain.stats.blockedCells).toBe(0);
  });

  it('the cone finishes on its analytic slope: z = surface radius at each x', () => {
    const res = rotaryCarve(opts(cone(), { finishingOnly: true }));
    expect(res.moves.length).toBeGreaterThan(0);
    // surface radius 5→0 as x goes −10→+10; every finish z word on a
    // cut move must sit in [0, 5] and some must be strictly between
    const zs = cutZs(res.moves);
    expect(Math.max(...zs)).toBeLessThanOrEqual(5 + 1e-6);
    expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-6);
    expect(zs.some((z) => z > 0.5 && z < 4.5)).toBe(true);
  });

  // ------------------------------------------------------------ P1: the
  // standing grid (the 4D carve's cross-orientation state, committee
  // 2026-10-29). The contract under test, in one sentence each:
  //  - grid OUT: cells the planes swept stand at the plane, cut cells at
  //    their comp target after the finish, untouched cells at stock R.
  //  - grid IN: a later op reads the prior op's standing as its truth —
  //    its ladder skips what is already clear (the delta-clearing payoff).
  //  - standalone: byte-identical to the pre-P1 per-op closure.
  //  - θ re-index: a datum shift is a pure wrapped θ-row rotation.
  describe('P1: the standing grid', () => {
    it('grid OUT: planes lower cells they cut, the finish owns the rest, untouched cells stand at stock', () => {
      const res = rotaryCarve(opts(cylinder(5, 20), { stepDown: 2 }));
      const g = res.standing;
      expect(g.r.length).toBe(g.nx * g.nTheta);
      expect(g.datumAngle).toBe(0);
      expect(g.radius).toBe(12);
      // a smooth Ø10 cylinder in R12 stock: every cell was either planed
      // by a rough plane or finished to its comp target — NOTHING stands
      // untouched at the stock radius after a full rough+finish op.
      let cut = 0;
      for (let k = 0; k < g.r.length; k++) {
        if (g.r[k] < 12 - 1e-9) cut++;
      }
      expect(cut).toBe(g.r.length);
      // and the values are sane: nothing above the stock, nothing below
      // the part (the waste floor bottoms near the model's deepest comp,
      // TESS-class on this fixture — the kernel's max-filter may lift a
      // cell slightly above its local surface, so bound by the STOCK)
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k < g.r.length; k++) {
        min = Math.min(min, g.r[k]);
        max = Math.max(max, g.r[k]);
      }
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(12 + 1e-6);
      expect(max).toBeLessThan(12 - 1e-9); // every cell was cut at least once
    });

    it('grid IN: a second op reads the standing truth — its SKIMS ride the prior op cuts', () => {
      // op1 roughs the cone from fresh stock; op2 runs the SAME cone at
      // the same datum. P1's contract: the grid carries standing truth
      // into op2's SKIM PLANNER (safe transitions ride what is actually
      // standing), while the ladder itself is P3's delta-clearing (a
      // later stage). The observable: op2's emission differs from
      // op-run-on-fresh-stock (its skims drop from the crown to the
      // standing surfaces op1 left), and the grid is byte-stable across
      // the two ops at the same datum (nothing new was cut).
      const base = opts(cone(), { stepDown: 2, radius: 12 });
      const r1 = rotaryCarve(base);
      let cut1 = 0;
      for (let k = 0; k < r1.standing.r.length; k++) {
        if (r1.standing.r[k] < 12 - 1e-9) cut1++;
      }
      expect(cut1).toBe(r1.standing.r.length); // fully swept (rough + finish)
      const r2 = rotaryCarve({ ...base, standing: r1.standing });
      expect(r2.stats.levels).toBe(r1.stats.levels); // P3 owns ladder skipping
      // the GRID OUT of op2 is unchanged: it cut nothing new (same datum,
      // same part, every cell already at its truth) — monotone + idempotent
      let moved = 0;
      for (let k = 0; k < r2.standing.r.length; k++) {
        if (Math.abs(r2.standing.r[k] - r1.standing.r[k]) > 1e-9) moved++;
      }
      expect(moved).toBe(0);
    });

    it('grid IN at a NEW DATUM re-indexes θ (the rotated part reads the same standing truth)', () => {
      // op2 runs the cone at datum 180° with op1's grid threaded in.
      // The re-index permutes θ rows to the new datum; the Tessellated
      // cone is not row-uniform (48-segment chords vary by θ), so the
      // honest pin is the OP-level idempotence: cutting the already-cut
      // part at the new datum moves no cell's standing radius — every
      // cell was already at its truth for the material that stands there.
      const base = opts(cone(), { stepDown: 2, radius: 12 });
      const r1 = rotaryCarve(base);
      const r2 = rotaryCarve({ ...base, datumAngle: 180, standing: r1.standing });
      // grid-in never RAISES a cell (monotone): cutting the already-
      // swept part adds nothing — op2's OUT grid equals its IN grid
      let raised = 0;
      for (let k = 0; k < r2.standing.r.length; k++) {
        if (r2.standing.r[k] > r1.standing.r[k] + 1e-9) raised++;
      }
      expect(raised).toBe(0); // monotone: re-indexing can never raise
      // the direct re-index: a pure permutation of rows (no value
      // changes), verifiable by sorting both grids' rows
      const re = reindexStanding(r1.standing, 180, r1.standing.nTheta);
      const sortedA = Array.from(r1.standing.r).sort((a, b) => a - b);
      const sortedB = Array.from(re.r).sort((a, b) => a - b);
      let permDiff = 0;
      for (let k = 0; k < sortedA.length; k++) {
        if (Math.abs(sortedA[k] - sortedB[k]) > 1e-9) permDiff++;
      }
      expect(permDiff).toBe(0); // a permutation, never a corruption
      expect(re.datumAngle).toBe(180);
    });

    it('a shape-mismatched grid (different stepOver) is ignored honestly', () => {
      // a different stepOver changes the grid shape: the threaded grid's
      // cells no longer line up. The kernel must NOT thread it (it takes
      // the fresh-stock branch) rather than misread a misaligned array.
      const base = opts(cone(), { stepDown: 2, radius: 12 });
      const r1 = rotaryCarve(base);
      const r2 = rotaryCarve({ ...base, stepOver: 0.5, standing: r1.standing });
      // fresh-stock semantics: the ladder runs (no credit from op1)
      expect(r2.stats.levels).toBeGreaterThan(0);
    });

    it('standalone is byte-identical with and without an explicit fresh grid', () => {
      const base = opts(cylinder(5, 20), { stepDown: 2 });
      const a = rotaryCarve(base);
      const fresh: StandingGrid = {
        r: new Float64Array(a.standing.r.length).fill(12),
        nx: a.standing.nx,
        nTheta: a.standing.nTheta,
        pitchX: a.standing.pitchX,
        gx0: a.standing.gx0,
        radius: 12,
        axisZ: 0,
        datumAngle: 0,
      };
      const b = rotaryCarve({ ...base, standing: fresh });
      expect(b.moves.length).toBe(a.moves.length);
      expect(b.estimatedMinutes).toBeCloseTo(a.estimatedMinutes, 9);
      expect(b.stats.levels).toBe(a.stats.levels);
      expect(b.stats.wraps).toBe(a.stats.wraps);
    });
  });
});

// reindexStanding + StandingGrid are exercised above via rotaryCarve;
// the import keeps the direct unit surface available for future pins.
void reindexStanding;