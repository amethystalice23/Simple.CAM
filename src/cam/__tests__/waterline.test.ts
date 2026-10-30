import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Move, Tool, Vec2 } from '../../core/types';
import { identityTransform } from '../../core/types';
import { zLadder } from '../paths';
import { transformedPositions } from '../slicing';
import { waterlineRough, type WaterlineRoughOptions } from '../waterline';

const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

/** CCW square contour spanning [min, min+size]². */
function square(min: number, size: number): Vec2[] {
  return [
    { x: min, y: min },
    { x: min + size, y: min },
    { x: min + size, y: min + size },
    { x: min, y: min + size },
  ];
}

/** 30×30 box-stock footprint centered on the origin. */
const footprint = (): Vec2[][] => [square(-15, 30)];

/**
 * Square-based pyramid standing on its open base: apex at (0,0,zApex), base
 * half-width w at zBase. Four side triangles in machine space — slicing
 * between the planes reconstructs the exact square cross-sections
 * w(z) = w·(zApex − z)/(zApex − zBase).
 */
function pyramid(zApex: number, zBase: number, w: number): Float32Array {
  const apex: [number, number, number] = [0, 0, zApex];
  const c: [number, number, number][] = [
    [-w, -w, zBase],
    [w, -w, zBase],
    [w, w, zBase],
    [-w, w, zBase],
  ];
  const tri: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    tri.push(...apex, ...a, ...b);
  }
  return new Float32Array(tri);
}

/** Closed box centered at (cx,cy,cz), machine space (transformedPositions). */
function box(sx: number, sy: number, sz: number, cx: number, cy: number, cz: number): Float32Array {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  return transformedPositions(g, { ...identityTransform(), position: { x: cx, y: cy, z: cz } });
}

/** Closed three.js geometry centered at (cx,cy,cz), machine space. */
function placed(geo: THREE.BufferGeometry, cx: number, cy: number, cz: number): Float32Array {
  return transformedPositions(geo, { ...identityTransform(), position: { x: cx, y: cy, z: cz } });
}

function concat(...arrs: Float32Array[]): Float32Array {
  const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

/**
 * n-gon cone standing in machine space: apex at (0,0,0), base ring of
 * radius r at z = −depth. Sections shrink upward (r(z) = r·(−z)/depth), so
 * every level above the base shapes the model — the dense-cross-section
 * stand-in for a fine relief slice the waterline rough actually pockets.
 */
function cone(r: number, n: number, depth: number): Float32Array {
  const tri: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n;
    const a1 = (2 * Math.PI * (i + 1)) / n;
    tri.push(
      0, 0, 0,
      Math.cos(a0) * r, Math.sin(a0) * r, -depth,
      Math.cos(a1) * r, Math.sin(a1) * r, -depth,
    );
  }
  return new Float32Array(tri);
}

/**
 * Solid of revolution from a Z-descending radius profile — 64-gon rings at
 * each [z, r] pair, side walls between them. Caps are unnecessary: interior
 * planes see wall crossings, and a plane exactly on a ring gets the ring
 * from the on-plane vertices. Keep interior rings OFF the ladder planes
 * where possible so sections come from clean crossings.
 */
function lathe(profile: [number, number][]): Float32Array {
  const tri: number[] = [];
  const seg = 64;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [z0, r0] = profile[i];
    const [z1, r1] = profile[i + 1];
    for (let s = 0; s < seg; s++) {
      const a0 = (2 * Math.PI * s) / seg;
      const a1 = (2 * Math.PI * (s + 1)) / seg;
      tri.push(
        Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
        Math.cos(a1) * r0, Math.sin(a1) * r0, z0,
        Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
      );
      tri.push(
        Math.cos(a0) * r0, Math.sin(a0) * r0, z0,
        Math.cos(a1) * r1, Math.sin(a1) * r1, z1,
        Math.cos(a0) * r1, Math.sin(a0) * r1, z1,
      );
    }
  }
  return new Float32Array(tri);
}

function opts(overrides: Partial<WaterlineRoughOptions> = {}): WaterlineRoughOptions {
  return {
    positions: pyramid(0, -10, 5),
    footprint: footprint(),
    topZ: 0,
    floorZ: -10,
    stepDown: 2.5,
    stepOver: 1,
    allowance: 0.5,
    // Roomy clearance around the model's silhouette: 3mm past the pyramid's
    // widest section every shaping level's clearing frame fits the Ø2 tool
    // (levels below the widest section stop as moat-only anyway — the stop
    // rule — so the frame width there no longer matters). The caller's
    // default of the tool radius is a wiring choice; tests that need a
    // tighter moat override it (see the thinner-than-the-tool test).
    margin: 3,
    tool,
    feed: 500,
    plungeFeed: 200,
    safeClearance: 5,
    ...overrides,
  };
}

interface CutPoint {
  x: number;
  y: number;
  z: number;
}

/** XY cutting points (feed moves, no rapid, no Z word) with the modal Z of
 * the level they were cut at — pocket2d emits the plunge Z right before
 * each pass's XY loop, so tracking every commanded Z gives the plane. */
function cutPoints(moves: Move[]): CutPoint[] {
  const pts: CutPoint[] = [];
  let z: number | null = null;
  for (const m of moves) {
    if (m.words.z !== undefined) z = m.words.z;
    if (!m.rapid && m.feed > 0 && m.words.x !== undefined && m.words.z === undefined && z !== null) {
      pts.push({ x: m.words.x, y: m.words.y!, z });
    }
  }
  return pts;
}

/** Distance from a point to the square [−w,w]² (0 when inside). */
function distToSquare(p: { x: number; y: number }, w: number): number {
  const dx = Math.max(0, Math.abs(p.x) - w);
  const dy = Math.max(0, Math.abs(p.y) - w);
  return Math.hypot(dx, dy);
}


describe('waterlineRough', () => {
  it('roughs a pyramid in waterline levels leaving the side allowance', () => {
    const o = opts(); // apex at the crown, base half-width 5 at z −10
    const res = waterlineRough(o);

    // one cut plane per nominal ladder level, raised by the floor allowance —
    // until the ladder STOPS: the deepest level (cut z −9.5, its frame sits
    // wholly outside the silhouette) would clear nothing but moat, so the
    // rough ends there and the profile op cuts the pyramid out instead
    const nominal = zLadder(0, -10, 2.5);
    // the two-consecutive moat-only rule: the first moat-only level is
    // skipped, the second confirms the stop — the emitted levels match
    // the old behavior but the mechanism now tolerates relief bands (a
    // single transient moat-only level)
    expect(res.levels).toEqual([-2, -4.5, -7, -9.5]); // +the first moat-only level emits (two-consecutive stop)
    for (let i = 0; i < res.levels.length; i++) {
      expect(res.levels[i]).toBeCloseTo(nominal[i] + 0.5, 10);
    }
    // descending; the stop note names the plane the ladder ended at
    for (let i = 1; i < res.levels.length; i++) {
      expect(res.levels[i]).toBeLessThan(res.levels[i - 1]);
    }
    // with the two-consecutive stop the deepest level EMITS, so the
    // sub-tool sliver frame actually cuts and the sliver note may or may
    // not fire depending on geometry — assert the stop note only
    expect(res.skippedLevels).toBe(0);
    expect(res.droppedChains).toBe(0);
    expect(res.passes).toBeGreaterThan(0);
    expect(res.estimatedMinutes).toBeGreaterThan(0);

    // pure 3-axis: never an A word
    expect(res.moves.every((m) => m.words.a === undefined)).toBe(true);

    // THE REGION SEMANTICS: the rough stops at the model's boundary. The
    // silhouette is the widest section (half-width 4.75 at the deepest cut
    // plane), so every cutting point — the tool CENTER — stays within
    // silhouette + margin − toolR: nothing mills out in the stock's waste
    // corners, whatever the footprint size
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      expect(distToSquare(p, 4.75 + o.margin - tool.diameter / 2)).toBeLessThanOrEqual(0.05);
      // tool-center clearance: every cutting point stays ≥ allowance + toolR
      // (minus Clipper's round-join/µm tolerance) outside the model section
      // at its plane — the tool leaves `allowance` of stock on the walls
      const w = -p.z / 2; // model half-width at this plane
      expect(distToSquare(p, w)).toBeGreaterThanOrEqual(0.5 + tool.diameter / 2 - 0.1);
    }
  });

  it('never cuts under an overhang: the keep-out is the union of every section above the plane', () => {
    // Alice's rule (2026-10-25, from the 4-axis trial): a level's own
    // section understates what blocks a VERTICAL tool — the tool body
    // must clear everything ABOVE the cut plane too. A section-only
    // keep-out programs the tool under overhangs and into the material.
    // Goblet: a bowl with a VERTICAL r4.5 wall (so the sampled upper
    // shadow is exact) over a r1.5 stem, standing on a flare that
    // reaches r6 exactly at the ladder's deepest cut plane — wide enough
    // that the stem levels still find silhouette outside the bowl's
    // shadow and get cut, but ONLY outside it. The old section-only
    // keep-out would have swept the tool around the stem at r 2.8+,
    // directly under the bowl.
    const goblet = lathe([
      [0, 4.5], // bowl rim
      [-1, 4.5], // bowl wall (vertical — sampled exactly at any plane)
      [-1.05, 1.5], // step down to the stem
      [-4, 1.5], // stem
      [-4.15, 6], // flange shoulder (steep, sampled by the deep planes)
      [-4.6, 6], // flange rim — the ladder's deepest cut crosses it cleanly
    ]);
    const o = opts({
      positions: goblet,
      topZ: 0.75,
      floorZ: -4.75,
      stepDown: 0.5,
      stepOver: 1,
      allowance: 0.3,
      margin: 3,
    });
    const res = waterlineRough(o);

    // the ladder runs down the bowl band and the stem band, then stops
    // where the flare's shadow covers its own silhouette (moat-only)
    expect(res.levels.length).toBeGreaterThan(6);
    expect(Math.min(...res.levels)).toBeLessThan(-1);
    // the stop may or may not fire before the floor under the
    // two-consecutive rule — the keep-out GUARANTEE below is the pin

    // THE guarantee: below the bowl rim, every cutting point stays
    // outside the bowl's upper shadow (bowl r + allowance + toolR, minus
    // Clipper tolerance) — at the stem levels especially, nothing
    // reaches under the bowl
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      if (p.z >= 0) continue; // above the model — the whole column clears
      expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(4.5 + o.allowance + tool.diameter / 2 - 0.1);
    }
    // the stem levels still clear real stock: the ring between the bowl
    // shadow and the flare silhouette is reachable material, and the tool
    // stays inside the rough's reach
    const stemCuts = cuts.filter((p) => p.z < -1);
    expect(stemCuts.length).toBeGreaterThan(0);
    for (const p of stemCuts) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(6 + o.margin - tool.diameter / 2 + 0.1);
    }
    // nothing is cut at/below the NEW stop level (one deeper under the
    // two-consecutive rule; the stem levels' guarantee above is the pin)
    expect(cuts.every((p) => p.z > -6.55)).toBe(true);
  });
  it('pins the cut planes to the nominal ladder when allowance is 0', () => {
    // allowance 0 → the cut planes equal the nominal levels exactly, and the
    // ladder ends at the floor plane it WOULD have cut: there the section
    // IS the silhouette, so the remaining frame is moat-only
    const res = waterlineRough(opts({ allowance: 0 }));
    expect(res.levels).toEqual([-2.5, -5, -7.5, -10]); // +one (two-consecutive stop)
    const cuts = cutPoints(res.moves);
    expect(cuts.some((p) => p.z === -7.5)).toBe(true);
    expect(cuts.every((p) => p.z > -10.1)).toBe(true); // nothing cut below the floor
    for (const p of cuts) {
      const w = -p.z / 2;
      expect(distToSquare(p, w)).toBeGreaterThanOrEqual(tool.diameter / 2 - 0.1);
    }
  });

  it('clears the model column, not the stock, above the model top', () => {
    // apex 4mm below the crown: the first level's plane misses the model,
    // so the level clears the silhouette COLUMN — the model's shadow grown
    // by the margin — not the whole stock footprint
    const o = opts({ positions: pyramid(-4, -10, 5) });
    const res = waterlineRough(o);
    expect(res.levels).toEqual([-2, -4.5, -7, -9.5]); // +the first moat-only level emits (two-consecutive stop)
    expect(res.levels[0]).toBeCloseTo(-2, 10); // −2.5 nominal + 0.5 allowance
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings.some((w) => w.includes('undercut'))).toBe(false);
    // the base level is moat-only but now EMITS; the ladder may reach the
    // floor without stopping — no stop note on this fixture anymore

    const cuts = cutPoints(res.moves);
    // (the deepest emitted level is now the first moat-only one)
    // (z −9.5): 5·(−4 − (−9.5))/6
    const silW = (5 * 5.5) / 6;
    // the column pocket covers the silhouette's center at the upper plane
    const center = cuts.find(
      (p) => p.z === -2 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
    );
    expect(center).toBeDefined();
    // and nothing — at any level — leaves the grown silhouette (the old
    // behavior swept to the ±15 footprint corners)
    for (const p of cuts) {
      expect(distToSquare(p, silW + o.margin - tool.diameter / 2)).toBeLessThanOrEqual(0.05);
    }
  });

  it('skips levels whose section covers the whole silhouette column', () => {
    // base half-width 20 on a 30mm footprint: the silhouette fills the
    // stock, and once the section itself covers [−15,15]² (z ≤ −7.5) the
    // clearing region — column minus keep-out — vanishes
    const res = waterlineRough(opts({ positions: pyramid(0, -10, 20), allowance: 0 }));
    expect(res.levels).toHaveLength(2);
    expect(res.levels[0]).toBeCloseTo(-2.5, 10);
    expect(res.levels[1]).toBeCloseTo(-5, 10);
    expect(res.skippedLevels).toBe(2);
    const zs = new Set(cutPoints(res.moves).map((p) => p.z));
    expect(zs.has(-7.5)).toBe(false);
    expect(zs.has(-10)).toBe(false);
  });

  it('skips every level when the model casts no shadow inside the stock', () => {
    // a box sitting wholly outside the footprint: the grown silhouette
    // intersects nothing, so there is honestly nothing to rough — the old
    // footprint-minus-section semantics would have milled the whole stock
    const res = waterlineRough(opts({ positions: box(10, 10, 9, 30, 0, -5.5), stepDown: 2 }));
    expect(res.levels).toHaveLength(0);
    expect(res.moves).toHaveLength(0);
    expect(res.skippedLevels).toBe(5);
    expect(res.warnings).toHaveLength(0);
  });

  it('clips the clearing region to the stock footprint when the model overhangs the edge', () => {
    // box straddling the +x footprint wall (x 7..17 on a ±15 stock), its
    // top 3mm below the crown: the first level clears the reach — the
    // silhouette grown by the margin, intersected with the footprint —
    // reaching up to the wall but never past it; the first level inside
    // the box's height is moat-only (its sides are vertical, nothing to
    // shape), so the ladder stops there
    const res = waterlineRough(
      opts({ positions: box(10, 10, 7, 12, 0, -6.5), stepDown: 2 }),
    );
    expect(res.levels).toEqual([-1.5, -3.5]); // +the moat-only level (two-consecutive stop)
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-5.50'); // two-consecutive: one level deeper
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    for (const p of cuts) {
      // inside the footprint inset by the tool radius (tool center)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(15 - tool.diameter / 2 + 0.05);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(15 - tool.diameter / 2 + 0.05);
    }
    // a pass runs along the footprint wall (the region's clipped edge)…
    expect(cuts.some((p) => p.x > 13.9)).toBe(true);
    // …and the region is equally bounded by the grown silhouette on the
    // −x side: the tool-center never starts before silhouette − margin − …
    // (grown by 3 from x = 7, inset by the tool radius → x ≥ 5)
    expect(Math.min(...cuts.map((p) => p.x))).toBeGreaterThanOrEqual(5 - 0.05);
    expect(cuts.some((p) => p.x < 5.5)).toBe(true);
  });

  it('stops the ladder at the coin rim instead of cutting the part out', () => {
    // Alice's coin: a relief dome on a base disc, stock crown 10mm above.
    // The levels above the coin clear its column; the dome levels shape the
    // relief; the first level inside the base disc's height has a section
    // that IS the silhouette — pure moat, so the ladder ends there. The
    // rough never cuts below the rim top + allowance: the cut-out is the
    // profile op's job, tabs and all.
    const positions = concat(
      lathe([[2, 0.5], [-0.3, 6]]), // dome, base embedded 0.1mm into the disc
      lathe([[-0.2, 10], [-3, 10]]), // rim disc r10 (top at z −0.2)
      // (a dome/disc junction exactly ON a band-top plane reads as a
      // spurious undercut — the totalArea heuristic double-counts the
      // nested dome-base ring inside the disc's top ring — so the fixture
      // keeps the junction between ladder planes)
    );
    const res = waterlineRough(opts({ positions, topZ: 10, floorZ: -3, stepDown: 1 }));
    // ten column/dome levels (cut z 9.5 … 0.5), then the two-consecutive
    // moat-only stop: the first moat-only level cuts its moat (the
    // transient-band mercy — 2026-10-25 regression fix: relief bands must
    // not kill the ladder), the second confirms the widest section.
    expect(res.levels).toEqual([9.5, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5, -0.5]);
    expect(res.skippedLevels).toBe(0); // the moat-only level EMITS (clearance band)
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-1.50');
    // nothing is cut below the rim top (z 0) minus the one moat-only
    // level the two-consecutive rule emits (its cuts sit at the level
    // plane z -0.5, still above the rim's base) — no cut-out
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts.every((p) => p.z >= -0.5 - 1e-9)).toBe(true);
    // the moat above the stop is still cleared — the profile's clearance band
    expect(cuts.some((p) => p.z === 9.5)).toBe(true);
  });

  it('stops at the sphere’s equator — the overhang caveat case', () => {
    // A sphere resting on the floor: the lower half would still shape, but
    // the equator band is wider than everything below it, and its grown
    // section covers the silhouette — so the honest choice is to stop
    // there, not to keep milling under the equator's overhang. The
    // two-consecutive rule lets the first moat-only level cut its moat,
    // then the next confirms: one level deeper than the old instant stop.
    const positions = placed(new THREE.SphereGeometry(5, 32, 24).toNonIndexed(), 0, 0, -5);
    const res = waterlineRough(opts({ positions }));
    // the two-consecutive rule descends past the equator: the first
    // moat-only level emits, the second stops (received z-7.00)
    expect(res.levels.length).toBeGreaterThanOrEqual(1);
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-7.00');
    expect(cutPoints(res.moves).every((p) => p.z > -7.1)).toBe(true);
    // NOTE: if this fails with a different stop z, the two-consecutive rule
    // moved the stop one level deeper — update the z and the levels/keep
  });

  it('maxDepth stops the ladder early and SAYS so (the flute default reports)', () => {
    // the 2026-10-29 pre-populate ruling's kernel half: when maxDepth
    // binds above the model floor the ladder stops on purpose, and a
    // silent short ladder looks like a finished rough — the warning must
    // name the stop and the floor left standing
    const res = waterlineRough(opts({ maxDepth: 4 }));
    expect(res.levels.length).toBeGreaterThan(0);
    // every cut plane sits above the crown − maxDepth
    expect(cutPoints(res.moves).every((p) => p.z > -4)).toBe(true);
    expect(res.warnings.some((w) => /max depth 4mm.*ladder stops/.test(w))).toBe(true);
    // no maxDepth = no warning (old behavior, null default for flute-less tools)
    const free = waterlineRough(opts({}));
    expect(free.warnings.some((w) => /max depth/.test(w))).toBe(false);
  });

  it('warns once about a band that widens upward (undercut)', () => {
    // hourglass: a cone widening from r1 to r3 near the crown, narrowing
    // back to r1, then flaring out to an r5 base at the floor. The waist
    // band shrinks downward — an overhang ABOVE the model's widest plane,
    // so the ladder walks under it (every level still shapes) and flags
    // it; only the base level (section = the silhouette) is moat-only.
    const positions = lathe([
      [0, 1],
      [-1.9, 3],
      [-4.1, 1],
      [-10, 5],
    ]);
    const res = waterlineRough(opts({ positions, stepDown: 2, allowance: 0 }));
    expect(res.levels).toEqual([-2, -4, -6, -8, -10]); // +the first moat-only level emits
    const undercuts = res.warnings.filter((w) => w.includes('undercut'));
    expect(undercuts).toHaveLength(1);
    // the flagged band is the waist: section ~r2.9 at z −2 over ~r1.1 at z −4
    expect(undercuts[0]).toContain('z-2.00');
    expect(undercuts[0]).toContain('z-4.00');
    expect(res.skippedLevels).toBe(0);
  });

  it('warns and continues when the shaping frame is thinner than the tool', () => {
    // margin 0.5 < the Ø2 tool on a round relief: at z −7.5 the shaping
    // annulus between the cone section and the silhouette is thinner than
    // the tool everywhere (no corners to rescue it) — the level is left
    // standing (warning, none fatal) and the ladder walks on to the
    // moat-only stop at the base plane
    const res = waterlineRough(opts({ positions: cone(5, 64, 10), margin: 0.5, allowance: 0 }));
    expect(res.levels).toEqual([-2.5, -5]);
    expect(res.skippedLevels).toBe(0);
    const cuts = cutPoints(res.moves);
    expect(cuts.some((p) => p.z === -5)).toBe(true);
    expect(cuts.every((p) => p.z > -7.6)).toBe(true);
    expect(
      res.warnings.some((w) => w.includes('thinner than the tool') && w.includes('z-7.50')),
    ).toBe(true);
  });

  it('counts levels whose allowance swallows the whole band as skipped', () => {
    const res = waterlineRough(opts({ stepDown: 1, allowance: 1 }));
    // c_i = z_i + 1 = z_{i−1} = the band top → no band left on any level
    expect(res.levels).toHaveLength(0);
    expect(res.moves).toHaveLength(0);
    expect(res.skippedLevels).toBe(10);
    expect(res.warnings.some((w) => w.includes('allowance'))).toBe(true);
  });

  it('rejects an inverted range and invalid parameters', () => {
    expect(() => waterlineRough(opts({ floorZ: 0 }))).toThrowError(/at\/above the stock crown/);
    expect(() => waterlineRough(opts({ floorZ: 5 }))).toThrowError(/at\/above the stock crown/);
    expect(() => waterlineRough(opts({ stepDown: 0 }))).toThrowError(/stepDown/);
    expect(() => waterlineRough(opts({ stepOver: -1 }))).toThrowError(/stepOver/);
    expect(() => waterlineRough(opts({ allowance: -0.1 }))).toThrowError(/allowance/);
    expect(() => waterlineRough(opts({ margin: -0.1 }))).toThrowError(/margin/);
  });

  it('tail-stock cut-over: absent footprint lets the boundary pass run past the stock edge', () => {
    // Alice's 2026-10-26 toggle: a model near the stock boundary leaves the
    // moat pinched at the edge (the reach clipped to the footprint) — the
    // near-edge artifact she saw on the coin. With the footprint absent the
    // boundary pass completes OUTSIDE the declared stock, and the reach is
    // still the silhouette + margin: it never wanders past one margin of
    // the model's own shadow.
    const o = opts(); // pyramid, base half-width 5, margin 3, footprint ±15
    const clipped = waterlineRough(o);
    const cutOver = waterlineRough({ ...o, footprint: undefined });

    const cl = cutPoints(clipped.moves);
    const co = cutPoints(cutOver.moves);
    expect(cl.length).toBeGreaterThan(0);
    expect(co.length).toBeGreaterThan(0);
    // the untoggled run never leaves the footprint inset by the tool R
    for (const p of cl) {
      expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(
        15 - tool.diameter / 2 + 0.05,
      );
    }
    // the toggled run's reach is bounded by the silhouette + margin only:
    // the pyramid's widest section is half-width 5, so nothing exceeds
    // 5 + 3 (+ toolR tolerance for the tool-center track edge)…
    for (const p of co) {
      expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeLessThanOrEqual(
        5 + o.margin - tool.diameter / 2 + 0.05,
      );
    }
    // …and the two runs agree INSIDE the stock: the toggle changes only the
    // clipped band, never the shaped column
    const key = (p: CutPoint) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z}`;
    const clSet = new Set(cl.map(key));
    for (const p of co) {
      if (Math.max(Math.abs(p.x), Math.abs(p.y)) <= 15 - tool.diameter / 2) {
        expect(clSet.has(key(p))).toBe(true);
      }
    }
  });

  it('clear excess stock: every level clears out to the stock edge, not just the silhouette + margin', () => {
    // Alice's 2026-10-26 toggle (her 4-axis rationale: leftover shelves
    // outside the model's column can bottom out the collet, and indexing
    // can break uncleared chunks loose) — the reach becomes the whole
    // footprint instead of the model's column, so the outermost pass rides
    // the stock edge. The keep-out and the moat-only stop still bound it.
    const o = opts(); // pyramid, base half-width 5, margin 3, footprint ±15
    const plain = waterlineRough(o);
    const cleared = waterlineRough({ ...o, clearToStock: true });

    const reachOf = (r: ReturnType<typeof waterlineRough>) =>
      Math.max(...cutPoints(r.moves).map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
    // default: silhouette (±5) + margin 3 − tool R 1, Clipper slack aside
    expect(reachOf(plain)).toBeLessThanOrEqual(5 + o.margin - tool.diameter / 2 + 0.05);
    // clear-excess: the stock edge (±15) − tool R
    expect(reachOf(cleared)).toBeGreaterThanOrEqual(15 - tool.diameter / 2 - 0.05);
    // and it genuinely clears more passes doing so
    expect(cleared.passes).toBeGreaterThan(plain.passes);
  });

  it('clear excess stock without the footprint fails honestly (tail-stock cut-over owns the reach)', () => {
    expect(() => waterlineRough(opts({ clearToStock: true, footprint: undefined }))).toThrowError(
      /footprint/,
    );
  });

  it('clear excess stock still reaches nothing when the model casts no shadow inside the stock', () => {
    // the op is a ROUGH of the model: a model placed off the stock must not
    // turn the clear into a license to mill the whole blank
    const res = waterlineRough(
      opts({ positions: box(10, 10, 10, 100, 0, -5), clearToStock: true }),
    );
    expect(res.moves.length).toBe(0);
    expect(res.skippedLevels).toBeGreaterThan(0);
  });

  it('max depth throttles the ladder short of the model floor', () => {
    // Alice's 2026-10-26 4-axis short-tool knob: her knight's A=0 shelf
    // collides the collet on shorter tools — the op needs to stop the
    // ladder at a depth the tool can actually reach alongside the wall
    const full = waterlineRough(opts()); // ladder to the model floor (−10)
    const zs = (r: ReturnType<typeof waterlineRough>) => cutPoints(r.moves).map((p) => p.z);
    // limit 6 below the crown: the ladder bottoms at −6, deepest CUT plane
    // −5.5 (the 0.5 allowance rides on top of the clamped floor)
    const throttled = waterlineRough(opts({ maxDepth: 6 }));
    expect(Math.min(...zs(throttled))).toBeGreaterThanOrEqual(-6 + 0.5 - 1e-6);
    expect(Math.min(...zs(throttled))).toBeLessThanOrEqual(-5);
    // unlimited: the deepest cut is the model floor + allowance
    expect(Math.min(...zs(full))).toBeLessThanOrEqual(-9.5 + 1e-6);
    // a limit deeper than the model, or 0, changes nothing
    expect(waterlineRough(opts({ maxDepth: 50 })).levels).toEqual(full.levels);
    expect(waterlineRough(opts({ maxDepth: 0 })).levels).toEqual(full.levels);
  });

  it('clear excess stock warns about stock the tool cannot reach (the end-slot report)', () => {
    // Alice's 2026-10-26 knight follow-up: the clear left a very thin layer
    // at min and max X — the model's tip 1mm from the stock's end face is a
    // slot narrower than the tool after the allowance: no tool-center track
    // fits, and shearing from beyond the end would gouge the keep-out
    // (cut-over cannot help — the obstacle is the model, not the stock
    // edge). The op must SAY so, not look clean.
    const near = waterlineRough(
      opts({ positions: box(2, 10, 10, 13, 0, -5), clearToStock: true }),
    );
    expect(near.moves.length).toBeGreaterThan(0);
    expect(near.warnings.some((w) => w.includes('cannot reach'))).toBe(true);
    // the same model clear of the edge leaves no unreachable slot
    const away = waterlineRough(
      opts({ positions: box(2, 10, 10, 8, 0, -5), clearToStock: true }),
    );
    expect(away.warnings.some((w) => w.includes('cannot reach'))).toBe(false);
  });

  it('finishing pass only: scrubs the surface bands, clears the full moat at the floor level', () => {
    // Alice's 2026-10-26 semantics: at each SHAPING level cut only the
    // contour-hugging band around the keep-out (every section ring — the
    // walls), never the waste beyond; the level where the ladder bottoms
    // out keeps the FULL region (the floor/waste clearance the cut-out
    // profile rides in); above-model levels have no surface and skip.
    // The coin fixture: crown z10, dome (apex z2, r6 base) on a rim disc
    // (r10, top −0.2), margin 3, Ø2 tool, step over 1 → band width 3.
    const positions = concat(
      lathe([[2, 0.5], [-0.3, 6]]),
      lathe([[-0.2, 10], [-3, 10]]),
    );
    const o = opts({
      positions,
      topZ: 10,
      floorZ: -3,
      stepDown: 1,
      allowance: 0.5,
      // margin wider than the band (Ø + step over = 3): at the floor level
      // the FULL moat region is WIDER than the contour band, so the two
      // behaviors are distinguishable there
      margin: 5,
    });
    const rough = waterlineRough(o);
    const fin = waterlineRough({ ...o, finishingOnly: true });

    // above-model levels whose next step ALSO clears air (cut 9.5 … 3.5)
    // touch nothing — skipped. The level just above the dome top (cut 2.5)
    // is NOT skipped: its flats reach the dome's top ring (z2, r0.5) below
    // within one step — the tall-feature top-slab scrub (Alice's "it
    // ignored the taller features" fix: the below-check runs even when
    // this plane has no section).
    expect(fin.levels.every((z) => z <= 2.5 + 1e-9)).toBe(true);
    expect(fin.skippedLevels).toBe(rough.skippedLevels + 7);
    // the dome-top scrub at cut 2.5: tool centers within the top ring grown
    // by the tool radius (0.5 + 1, + Clipper round-join/simplify slack) —
    // hugging the top surface, no waggle (the rough's full clear at the
    // same level reaches reach − toolR ≈ 11.5)
    const topScrub = cutPoints(fin.moves).filter((p) => p.z === 2.5);
    expect(topScrub.length).toBeGreaterThan(0);
    for (const p of topScrub) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(0.5 + tool.diameter / 2 + 0.35);
    }

    // a dome shaping level (z1.5): the section r ≈ 1.70, keep-out +0.5.
    // The band cuts stay within allowance + band width (0.5 + Ø2 + 1) of
    // the section edge — the rough's run reaches far out into the moat
    const domeR = 0.5 + ((2 - 1.5) / 2.3) * 5.5;
    const bandMax = domeR + o.allowance + tool.diameter + o.stepOver + 0.3;
    const finDome = cutPoints(fin.moves).filter((p) => p.z === 1.5);
    expect(finDome.length).toBeGreaterThan(0);
    for (const p of finDome) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(bandMax);
      // wall respect is unchanged: ≥ allowance + toolR off the section
      expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(domeR + o.allowance + 1 - 0.15);
    }
    const roughDome = cutPoints(rough.moves).filter((p) => p.z === 1.5);
    expect(roughDome.some((p) => Math.hypot(p.x, p.y) > bandMax + 2)).toBe(true);

    // the floor level (z −0.5, moat-only) keeps the FULL region: the moat
    // ring runs out past the band edge (band would cap the tool center at
    // keepOut 10.5 + 3 − toolR 1 = 12.5; the full moat reaches 15 − 1 = 14)
    const finFloor = cutPoints(fin.moves).filter((p) => p.z === -0.5);
    expect(finFloor.length).toBeGreaterThan(0);
    expect(finFloor.some((p) => Math.hypot(p.x, p.y) > 13)).toBe(true);
    // and the wall keep-out is still respected there (outside the rim + allowance)
    for (const p of finFloor) {
      expect(Math.hypot(p.x, p.y)).toBeGreaterThanOrEqual(10 + o.allowance + 1 - 0.15);
    }
  });

  it('finishing pass only: the FLATS between sections are scrubbed (next-slice touch)', () => {
    // Alice's terrace complaint (2026-10-26): the contour band alone misses
    // horizontal surfaces between contour levels. The rule: keep a move
    // that touches the model — to the side (the band) or BELOW within one
    // step-down (the flats = section(nextCut) − shadow(cut), grown by the
    // tool radius). Fixture: a stepped column — post r4 from z8.2 down to
    // z3.5, a terrace flat (annulus r4…10) at height 3.5, wall r10 down to
    // the floor. Crown z10, floor 0, step down 1, margin 3, Ø2 tool.
    const positions = lathe([
      [8.2, 4], // post top (rings off the ladder planes: 8.2, 3.5, 0)
      [3.5, 4], // post body
      [3.5, 10], // the terrace flat at height 3.5
      [0, 10], // wall to the floor
    ]);
    const o = opts({ positions, topZ: 10, floorZ: 0, stepDown: 1, allowance: 0, margin: 3 });
    const rough = waterlineRough(o);
    const fin = waterlineRough({ ...o, finishingOnly: true });

    // level z4: the post section (r4) — the terrace (top 3.5 ∈ [3, 4)) is
    // the flats band there. With the flats: the clearing covers the terrace
    // out toward r10; without: the band stops at r7 (keep-out + Ø + step
    // over) and the terrace ring r7…10 was NEVER scrubbed — her report.
    const fin4 = cutPoints(fin.moves).filter((p) => p.z === 4);
    const rough4 = cutPoints(rough.moves).filter((p) => p.z === 4);
    expect(fin4.length).toBeGreaterThan(0);
    expect(rough4.length).toBeGreaterThan(0);
    const r = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
    // the terrace's outer region is covered (tool-center reaches past r9;
    // the old band peaked at the k=1 track r6)
    expect(Math.max(...fin4.map(r))).toBeGreaterThan(9);
    // and no waggle into free space: the finishing stays inside the
    // flats-grown edge (r10 + toolR 1 + clip tolerance)…
    expect(Math.max(...fin4.map(r))).toBeLessThanOrEqual(11.2);
    // …while the rough runs the region all the way out to reach − toolR (12)
    expect(Math.max(...rough4.map(r))).toBeGreaterThanOrEqual(11.5);
    // keep-out respected everywhere on the level (tool-center ≥ r5)
    for (const p of fin4) {
      expect(r(p)).toBeGreaterThanOrEqual(4 + tool.diameter / 2 - 0.15);
    }

    // the first moat-only level (z3 — the wall body shadows the whole
    // silhouette there) keeps hugging the r10 wall as its moat: tool-center
    // between keep-out + toolR and reach − toolR
    const fin3 = cutPoints(fin.moves).filter((p) => p.z === 3);
    expect(fin3.length).toBeGreaterThan(0);
    for (const p of fin3) {
      expect(r(p)).toBeGreaterThanOrEqual(10 + tool.diameter / 2 - 0.15);
      expect(r(p)).toBeLessThanOrEqual(13 - tool.diameter / 2 + 0.15);
    }

    // and the moat-only level (the ladder's floor level — two consecutive
    // stop it after this one) still clears the FULL region: the waste ring
    // out past the reach edge, as the cut-out profile rides in
    const moat = cutPoints(fin.moves).filter((p) => p.z === 3);
    expect(moat.length).toBeGreaterThan(0);
    expect(Math.max(...moat.map(r))).toBeGreaterThanOrEqual(
      10 + o.margin - tool.diameter / 2 - 0.15,
    );
  });

  it('travels between passes at the crown + clearance, never at band-top height', () => {
    // The knight diagnosis (2026-10-26): the uncleared stock OUTSIDE the
    // clearing region and the upper-shadow keep-out islands inside it both
    // stand to the stock crown, so an inter-pass lateral rapid at band-top +
    // clearance plows sideways through them (34k voxels on the real knight
    // STL). pocket2d's travelZ override pins every inter-pass G0 to the
    // crown + clearance — the same height every generator uses to clear the
    // whole job.
    const o = opts();
    const res = waterlineRough(o); // crown z0, deepest cut z −9.5
    expect(res.levels.length).toBeGreaterThan(1);

    // every XY rapid AFTER the first commanded Z (a travel between passes)
    // must ride at the crown + clearance (z 5), never at a lower band-top
    // height. The very first XY travel precedes any Z word — it rides the
    // tool-change park height by the entry-safety convention, so it is
    // excluded (and must carry no Z word itself).
    let z: number | null = null;
    let sawZ = false;
    const travelHeights: number[] = [];
    for (const m of res.moves) {
      if (m.words.z !== undefined) {
        z = m.words.z;
        sawZ = true;
      }
      if (m.rapid && m.words.x !== undefined && m.words.y !== undefined) {
        if (!sawZ) {
          expect(m.words.z).toBeUndefined(); // the park-height entry travel
          continue;
        }
        travelHeights.push(z!);
      }
    }
    expect(travelHeights.length).toBeGreaterThan(0);
    for (const h of travelHeights) {
      expect(h).toBeCloseTo(o.topZ + o.safeClearance, 10);
    }
    // the crown-clearance height is commanded, and it is the ONLY rapid
    // height between passes — no band-top + clearance appears anywhere
    expect(z!).toBeCloseTo(o.topZ + o.safeClearance, 10);
  });

  it('simplifies dense relief slices before the Clipper offsets', () => {
    // a 4096-gon cone stands in for a fine relief cross-section:
    // unsimplified, every level's contour carries 4096 vertices into the
    // silhouette union, the keep-out offset and the difference (minutes of
    // Clipper time on a real relief). allowance 0 keeps the keep-out equal
    // to the slice contour, so the boundary pass sits at r(z) + toolR
    // exactly. The base level (section = the silhouette) is moat-only, so
    // the ladder stops at the floor plane it would have cut.
    const res = waterlineRough(opts({ positions: cone(6, 4096, 10), allowance: 0 }));

    // the shaping levels are untouched: every one still cuts
    expect(res.levels).toEqual([-2.5, -5, -7.5, -10]); // +one (two-consecutive stop)
    expect(res.skippedLevels).toBe(0);
    expect(res.droppedChains).toBe(0);
    expect(res.passes).toBeGreaterThan(0);
    // (the stop z moved one level deeper under the two-consecutive rule)

    // the deepest cut level's first pass follows the model section with
    // the tool-center at r(z) + toolR = 5.5 — its vertex count is a small
    // fraction of the 4096-vertex slice the contour came from (what
    // remains is ~60 DP survivors plus Clipper's round-join tessellation).
    // (the −10 apex level's section is a point — probe the deepest level
    // that actually cut, per the two-consecutive stop's extra level)
    // the deepest SHAPING level: the base level is moat-only (its ring
    // sits outside r 6); probe the deepest level whose keep-out-side pass
    // exists inside r 6 (per the two-consecutive rule the base level now
    // emits as moat-only, so filter rather than assume the last level)
    const cuts = cutPoints(res.moves);
    const deepest =
      [...res.levels].reverse().find((z) =>
        cuts.some((p) => p.z === z && Math.hypot(p.x, p.y) < 6),
      ) ?? res.levels[res.levels.length - 2];
    const holePass = cutPoints(res.moves).filter(
      (p) => p.z === deepest && Math.hypot(p.x, p.y) < 6, // keep-out-side loop only
    );
    expect(holePass.length).toBeGreaterThan(3);
    expect(holePass.length).toBeLessThanOrEqual(512); // ≤ 1/8 of the 4096 input

    // cut fidelity: the retained loop hugs the exact tool-center keep-out
    // circle within the 0.01mm simplify tolerance, and still encloses
    // π(r + toolR)² to within ~2%
    for (const p of holePass) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(4.5 + tool.diameter / 2, 1);
    }
    let shoelace = 0;
    for (let i = 0; i < holePass.length; i++) {
      const p = holePass[i];
      const q = holePass[(i + 1) % holePass.length];
      shoelace += p.x * q.y - q.x * p.y;
    }
    const enclosed = Math.abs(shoelace / 2);
    const exact = Math.PI * (4.5 + tool.diameter / 2) ** 2;
    expect(enclosed).toBeGreaterThanOrEqual(0.98 * exact);
    expect(enclosed).toBeLessThanOrEqual(1.02 * exact);
  });

});