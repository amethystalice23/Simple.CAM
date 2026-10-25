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
    expect(res.levels).toEqual([-2, -4.5, -7]);
    for (let i = 0; i < res.levels.length; i++) {
      expect(res.levels[i]).toBeCloseTo(nominal[i] + 0.5, 10);
    }
    // descending; the stop note names the plane the ladder ended at
    for (let i = 1; i < res.levels.length; i++) {
      expect(res.levels[i]).toBeLessThan(res.levels[i - 1]);
    }
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings[0]).toContain('ladder stopped at z-9.50');
    expect(res.warnings[0]).toContain('profile op');
    // the deepest level's last corner orbit is shorter than the tool's own
    // Ø — a plunge-wiggle, not clearing; it is dropped and said so
    expect(res.warnings[1]).toContain('sliver pass(es) thinner than the tool dropped');
    expect(res.skippedLevels).toBe(0); // the stop is not a skip
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
    expect(res.warnings.some((w) => w.includes('ladder stopped at z-4.45'))).toBe(true);

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
    // and nothing is cut at/below the stopped level
    expect(cuts.every((p) => p.z > -4.45)).toBe(true);
  });
  it('pins the cut planes to the nominal ladder when allowance is 0', () => {
    // allowance 0 → the cut planes equal the nominal levels exactly, and the
    // ladder ends at the floor plane it WOULD have cut: there the section
    // IS the silhouette, so the remaining frame is moat-only
    const res = waterlineRough(opts({ allowance: 0 }));
    expect(res.levels).toEqual([-2.5, -5, -7.5]);
    const cuts = cutPoints(res.moves);
    expect(cuts.some((p) => p.z === -7.5)).toBe(true);
    expect(cuts.every((p) => p.z > -7.6)).toBe(true); // nothing cut at/below the floor
    expect(res.warnings.some((w) => w.includes('ladder stopped at z-10.00'))).toBe(true);
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
    expect(res.levels).toEqual([-2, -4.5, -7]);
    expect(res.levels[0]).toBeCloseTo(-2, 10); // −2.5 nominal + 0.5 allowance
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings.some((w) => w.includes('undercut'))).toBe(false);
    expect(res.warnings.some((w) => w.includes('ladder stopped'))).toBe(true); // the base level is moat-only

    const cuts = cutPoints(res.moves);
    // the silhouette half-width is the section at the deepest cut plane
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
    expect(res.levels).toEqual([-1.5]);
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-3.50');
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
    // ten column/dome levels (cut z 9.5 … 0.5), then the stop at the rim
    expect(res.levels).toEqual([9.5, 8.5, 7.5, 6.5, 5.5, 4.5, 3.5, 2.5, 1.5, 0.5]);
    expect(res.skippedLevels).toBe(0); // stopped levels are not skipped
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-0.50');
    // nothing is cut at/below the rim top (z 0) + allowance — no cut-out
    const cuts = cutPoints(res.moves);
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts.every((p) => p.z >= 0.5 - 1e-9)).toBe(true);
    // the moat above the stop is still cleared — the profile's clearance band
    expect(cuts.some((p) => p.z === 9.5)).toBe(true);
  });

  it('stops at the sphere’s equator — the overhang caveat case', () => {
    // A sphere resting on the floor: the lower half would still shape, but
    // the equator band is wider than everything below it, and its grown
    // section covers the silhouette — so the honest choice is to stop
    // there, not to keep milling under the equator's overhang (the band's
    // own undercut warning lives in the stopped levels and never fires).
    const positions = placed(new THREE.SphereGeometry(5, 32, 24).toNonIndexed(), 0, 0, -5);
    const res = waterlineRough(opts({ positions }));
    expect(res.levels).toEqual([-2]); // the pre-equator level only
    expect(res.skippedLevels).toBe(0);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain('ladder stopped at z-4.50');
    expect(cutPoints(res.moves).every((p) => p.z > -2.1)).toBe(true);
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
    expect(res.levels).toEqual([-2, -4, -6, -8]); // every level above the base cuts
    const undercuts = res.warnings.filter((w) => w.includes('undercut'));
    expect(undercuts).toHaveLength(1);
    // the flagged band is the waist: section ~r2.9 at z −2 over ~r1.1 at z −4
    expect(undercuts[0]).toContain('z-2.00');
    expect(undercuts[0]).toContain('z-4.00');
    // and the stop lands on the base, not before the undercut band
    expect(res.warnings.some((w) => w.includes('ladder stopped at z-10.00'))).toBe(true);
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
    expect(res.warnings).toHaveLength(2);
    expect(
      res.warnings.some((w) => w.includes('thinner than the tool') && w.includes('z-7.50')),
    ).toBe(true);
    expect(res.warnings.some((w) => w.includes('ladder stopped at z-10.00'))).toBe(true);
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
    expect(res.levels).toEqual([-2.5, -5, -7.5]);
    expect(res.skippedLevels).toBe(0);
    expect(res.droppedChains).toBe(0);
    expect(res.passes).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.includes('ladder stopped at z-10.00'))).toBe(true);

    // the deepest cut level's first pass follows the model section with
    // the tool-center at r(z) + toolR = 5.5 — its vertex count is a small
    // fraction of the 4096-vertex slice the contour came from (what
    // remains is ~60 DP survivors plus Clipper's round-join tessellation)
    const deepest = res.levels[res.levels.length - 1]; // z −7.5 → r = 4.5
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