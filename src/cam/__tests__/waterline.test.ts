import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Move, Tool, Vec2 } from '../../core/types';
import { identityTransform } from '../../core/types';
import { simplifyContour, zLadder } from '../paths';
import { buildZIndex, sliceAtZ, transformedPositions } from '../slicing';
import { union } from '../clipper';
import { tabBridgesFor, waterlineRough, type WaterlineRoughOptions } from '../waterline';

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

/** Translate an xyz triple array by dx in X. */
function shiftX(a: Float32Array, dx: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 3) {
    out[i] = a[i] + dx;
    out[i + 1] = a[i + 1];
    out[i + 2] = a[i + 2];
  }
  return out;
}

/** Convex-quad containment (bridge boxes are 4-corner polygons). */
function inQuad(p: { x: number; y: number }, box: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = box[i];
    const b = box[(i + 1) % 4];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

/**
 * Cut distance travelled per pass (plunge → XY feeds → retract), for the
 * sliver regression: a pass shorter than the tool's own Ø spends more time
 * plunging than cutting.
 */
function passCutLengths(moves: Move[]): number[] {
  const lens: number[] = [];
  let cur: number | null = null;
  let prev: Vec2 | null = null;
  let at: Vec2 | null = null; // last XY the machine sits at
  for (const m of moves) {
    if (m.words.x !== undefined && m.words.y !== undefined) at = { x: m.words.x, y: m.words.y };
    if (m.rapid) {
      if (cur !== null) lens.push(cur);
      cur = null;
      prev = null;
      continue;
    }
    if (m.words.z !== undefined) {
      // the plunge starts a pass where the rapid just positioned
      if (cur === null) {
        cur = 0;
        prev = at;
      }
      continue;
    }
    if (prev) cur = (cur ?? 0) + Math.hypot(m.words.x! - prev.x, m.words.y! - prev.y);
    prev = { x: m.words.x!, y: m.words.y! };
  }
  if (cur !== null) lens.push(cur);
  return lens;
}

/**
 * Noisy tapered relief column for the sliver regression: the wall widens
 * downward (a rimless relief that legitimately roughs to the floor), with
 * a 61-lobe radius wobble whose phase decorrelates per ring (real fine
 * meshes differ chaotically plane-to-plane, not smoothly) — every ladder
 * plane's section differs from the silhouette envelope by tessellation
 * noise, the stand-in for a real high-res relief STL (Alice's coin:
 * ±0.05mm around a "smooth" wall, 1144 distinct vertex heights). At the
 * deepest cut plane the section IS the widest sliced section, so the
 * model-vs-envelope gap collapses to that noise alone.
 */
function noisyCone(topR: number, taper: number, amp: number, seg: number, rows: number): Float32Array {
  const tri: number[] = [];
  const z0 = -3.75;
  const z1 = 0;
  const ring = (i: number): [number, number][] => {
    const z = z0 + ((z1 - z0) * i) / rows;
    const pts: [number, number][] = [];
    for (let s = 0; s < seg; s++) {
      const a = (2 * Math.PI * s) / seg;
      pts.push([a, topR + taper * -z + amp * Math.sin(61 * a + 40 * i)]);
    }
    return pts;
  };
  for (let i = 0; i < rows; i++) {
    const za = z0 + ((z1 - z0) * i) / rows;
    const zb = z0 + ((z1 - z0) * (i + 1)) / rows;
    const A = ring(i);
    const B = ring(i + 1);
    for (let s = 0; s < seg; s++) {
      const s2 = (s + 1) % seg;
      tri.push(
        Math.cos(A[s][0]) * A[s][1], Math.sin(A[s][0]) * A[s][1], za,
        Math.cos(A[s2][0]) * A[s2][1], Math.sin(A[s2][0]) * A[s2][1], za,
        Math.cos(B[s2][0]) * B[s2][1], Math.sin(B[s2][0]) * B[s2][1], zb,
      );
      tri.push(
        Math.cos(A[s][0]) * A[s][1], Math.sin(A[s][0]) * A[s][1], za,
        Math.cos(B[s2][0]) * B[s2][1], Math.sin(B[s2][0]) * B[s2][1], zb,
        Math.cos(B[s][0]) * B[s][1], Math.sin(B[s][0]) * B[s][1], zb,
      );
    }
  }
  return new Float32Array(tri);
}

/** Rebuild the generator's silhouette the same way it does, from the same
 *  public pieces: slice every ladder plane, simplify, union. The tab-bridge
 *  oracle needs the exact contours the boxes sit on. */
function silhouetteOf(o: WaterlineRoughOptions): Vec2[][] {
  const nominal = zLadder(o.topZ, o.floorZ, o.stepDown);
  const idx = buildZIndex(o.positions);
  const planes: number[] = [];
  for (let i = 0; i < nominal.length; i++) {
    planes.push(nominal[i] + o.allowance, i === 0 ? o.topZ : nominal[i - 1]);
  }
  return union(
    planes.flatMap((z) =>
      sliceAtZ(o.positions, z, idx).contours.map((c) => simplifyContour(c, 0.01)),
    ),
  );
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

  it('drops the perimeter sliver arcs a noisy fine-mesh wall pinches out of the moat', () => {
    // Alice's coin regression (2026-10-25): a real relief STL's "smooth
    // circular wall" is a fine noisy tessellation, and where the moat is
    // exactly one tool pass wide (margin = Ø + allowance) its tool-center
    // track is only model-vs-silhouette NOISE wide — the offset shatters
    // into a ring of sub-tool arcs, plunge-cut-plunge all around the
    // perimeter. Those arcs are dropped (the stock they would take is
    // thinner than the tool) and one warning says so.
    //
    // The fixture: a slowly-tapering column whose wall wobbles ±0.15mm in
    // 61 lobes with the wobble phase decorrelating per ring (a real fine
    // mesh's sections differ chaotically plane-to-plane, not smoothly).
    // Small taper + small allowance put the deep levels inside the pinch
    // window: the model-vs-envelope gap swings from ~0 (pinch — sliver
    // arcs) past the allowance (so the moat-only stop still sees shaping
    // work and the level is cut).
    const positions = noisyCone(5, 0.1, 0.15, 360, 20);
    const base = {
      positions,
      footprint: footprint(),
      topZ: 0.25,
      floorZ: -3.75,
      stepDown: 0.5,
      stepOver: 1,
      allowance: 0.02,
      tool,
      feed: 500,
      plungeFeed: 200,
      safeClearance: 5,
    };

    // degenerate one-pass moat: the deep levels' perimeter track is
    // noise-width, so those levels cut nothing but dropped slivers
    const tight = waterlineRough({ ...base, margin: tool.diameter + 0.02 });
    expect(tight.levels.length).toBeGreaterThan(3); // the taper keeps the ladder alive
    const tightLens = passCutLengths(tight.moves);
    expect(tightLens.length).toBeGreaterThan(0);
    // THE guarantee: nothing shorter than the tool's own Ø is ever emitted
    expect(Math.min(...tightLens)).toBeGreaterThanOrEqual(tool.diameter - 1e-9);
    expect(tight.warnings.some((w) => w.includes('sliver pass(es) thinner than the tool dropped'))).toBe(true);
    // the upper levels' moat is wider than the noise — real ring passes
    expect(Math.max(...tightLens)).toBeGreaterThan(20);
    expect(tight.passes).toBeGreaterThan(0);

    // the derived default's extra step-over keeps the moat pass whole:
    // no slivers to drop, and the moat ring is one long pass
    const wide = waterlineRough({ ...base, margin: tool.diameter + 0.02 + 1 });
    const wideLens = passCutLengths(wide.moves);
    expect(Math.min(...wideLens)).toBeGreaterThanOrEqual(tool.diameter - 1e-9);
    expect(wide.warnings.some((w) => w.includes('sliver'))).toBe(false);
    expect(Math.max(...wideLens)).toBeGreaterThan(20); // the moat ring, unbroken
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
    expect(() => waterlineRough(opts({ tabs: { count: 0, height: 1, length: 1 } }))).toThrowError(/tab count/);
    expect(() => waterlineRough(opts({ tabs: { count: 2.5, height: 1, length: 1 } }))).toThrowError(/tab count/);
    expect(() => waterlineRough(opts({ tabs: { count: 2, height: 0, length: 1 } }))).toThrowError(/tab height/);
    expect(() => waterlineRough(opts({ tabs: { count: 2, height: 1, length: 0 } }))).toThrowError(/tab length/);
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

  it('leaves tab bridges standing where the rough would sever a rimless relief', () => {
    // Alice's rimless case: a dome descending into a TALL blank (floor well
    // below its base) — the levels below the base have empty sections, so
    // they clear the whole column, moat included, and the rough alone would
    // cut the part free; the bridges are what holds it for the profile op
    const tabs = { count: 3, height: 4, length: 4 };
    const o = opts({
      positions: lathe([[5, 0.5], [0, 8]]),
      topZ: 10,
      floorZ: -3,
      stepDown: 1,
      tabs,
    });
    const res = waterlineRough(o);
    expect(res.levels).toHaveLength(13); // roughs to the floor — no stop
    expect(res.warnings).toHaveLength(0); // 3 tabs fit the one contour cleanly
    const bridgeTop = o.floorZ + o.allowance + tabs.height; // z 1.5
    const boxes = tabBridgesFor(silhouetteOf(o), tabs, {
      allowance: o.allowance,
      margin: o.margin,
      toolR: tool.diameter / 2,
    }).boxes;
    expect(boxes).toHaveLength(3);
    const cuts = cutPoints(res.moves);
    // below the bridge top NO cutting move lands inside any bridge box…
    const below = cuts.filter((p) => p.z < bridgeTop - 1e-9);
    expect(below.length).toBeGreaterThan(0);
    for (const p of below) {
      expect(boxes.some((b) => inQuad(p, b))).toBe(false);
    }
    // …the deep moat still clears in the windows between them (the deepest
    // level, below the dome's base, is the severing one)
    expect(below.some((p) => p.z === -2.5)).toBe(true);
    // …and the levels at/above the bridge top cut through the box positions
    // unbroken
    const above = cuts.filter((p) => p.z >= bridgeTop - 1e-9);
    expect(above.some((p) => boxes.some((b) => inQuad(p, b)))).toBe(true);
  });

  it('pins the tab-height edges: short bridges still stand, over-tall ones do nothing', () => {
    const base = {
      positions: lathe([[5, 0.5], [0, 8]]),
      topZ: 10,
      floorZ: -3,
      stepDown: 1,
    };
    // height ≤ allowance is STILL a real bridge — the top sits `height`
    // above the rough's effective floor (the allowance skin), not the raw
    // floor: no clamping, no warning, the deepest level keeps clear of the
    // boxes
    const shortTabs = { count: 3, height: 0.3, length: 4 };
    const short = waterlineRough(opts({ ...base, tabs: shortTabs }));
    expect(short.levels).toHaveLength(13);
    expect(short.warnings).toHaveLength(0);
    // only the deepest level (cut z −2.5) sits below that bridge top (−2.2)
    const boxes = tabBridgesFor(silhouetteOf(opts(base)), shortTabs, {
      allowance: 0.5,
      margin: 3,
      toolR: tool.diameter / 2,
    }).boxes;
    const deep = cutPoints(short.moves).filter((p) => p.z === -2.5);
    expect(deep.length).toBeGreaterThan(0);
    for (const p of deep) {
      expect(boxes.some((b) => inQuad(p, b))).toBe(false);
    }
    // a tab reaching above the whole roughing band leaves nothing standing
    // anywhere — say so and cut like tabs were never asked for
    const tall = waterlineRough(opts({ ...base, tabs: { count: 3, height: 20, length: 4 } }));
    expect(tall.warnings).toEqual([
      'tab height reaches above the roughing band — no bridges left standing',
    ]);
    const plain = waterlineRough(opts(base));
    expect(tall.moves).toEqual(plain.moves);
    expect(tall.levels).toEqual(plain.levels);
  });

  it('distributes tabs across silhouette contours by perimeter share', () => {
    // two separated domes in one footprint, perimeters ~2π·4 and ~2π·2 →
    // count 3 splits 2 + 1 across them
    const positions = concat(
      shiftX(lathe([[5, 0.2], [2, 2], [1, 4]]), -8),
      shiftX(lathe([[5, 0.2], [2, 1.4], [1, 2]]), 8),
    );
    const tabs = { count: 3, height: 2, length: 2 };
    const o = opts({
      positions,
      topZ: 7,
      floorZ: -2,
      stepDown: 2,
      allowance: 0.2,
      tabs,
    });
    const res = waterlineRough(o);
    const sil = silhouetteOf(o);
    expect(sil).toHaveLength(2); // two disjoint outer rings
    const { boxes, notes } = tabBridgesFor(sil, tabs, {
      allowance: o.allowance,
      margin: o.margin,
      toolR: tool.diameter / 2,
    });
    expect(notes).toEqual([]);
    expect(boxes).toHaveLength(3);
    const centroidX = (b: Vec2[]): number => b.reduce((s, p) => s + p.x, 0) / b.length;
    expect(boxes.filter((b) => centroidX(b) < 0)).toHaveLength(2); // the wide dome
    expect(boxes.filter((b) => centroidX(b) > 0)).toHaveLength(1); // the narrow dome
    // the deepest level (below both bases — the severing one) pockets
    // around the bridges: cuts happen, none inside a box
    expect(res.levels).toContain(-0.8);
    const deep = cutPoints(res.moves).filter((p) => p.z === -0.8);
    expect(deep.length).toBeGreaterThan(0);
    for (const p of deep) {
      expect(boxes.some((b) => inQuad(p, b))).toBe(false);
    }
  });

  it('is identical without tabs (absent, undefined, and null)', () => {
    const base = opts({
      positions: lathe([[5, 0.5], [0, 8]]),
      topZ: 10,
      floorZ: -3,
      stepDown: 1,
    });
    const plain = waterlineRough(base);
    expect(waterlineRough({ ...base, tabs: undefined })).toEqual(plain);
    expect(waterlineRough({ ...base, tabs: null })).toEqual(plain);
    // and tabs genuinely suppress deep cutting: without them the deepest
    // levels' passes ride straight through the bridge footprints
    const tabs = { count: 3, height: 4, length: 4 };
    const tabbed = waterlineRough({ ...base, tabs });
    expect(plain.levels).toEqual(tabbed.levels); // tabs change WHERE, not WHETHER
    const boxes = tabBridgesFor(silhouetteOf(base), tabs, {
      allowance: base.allowance,
      margin: base.margin,
      toolR: tool.diameter / 2,
    }).boxes;
    const deepPlain = cutPoints(plain.moves).filter((p) => p.z < 1.5);
    expect(deepPlain.some((p) => boxes.some((b) => inQuad(p, b)))).toBe(true);
  });

  it('consumes no bridges when the moat-only stop ends the ladder first', () => {
    // the rimmed coin: the ladder stops at the rim, above the bridge top —
    // tabs were asked for but never engaged, so they say nothing at all
    const positions = concat(
      lathe([[2, 0.5], [-0.3, 6]]), // dome, base embedded into the disc
      lathe([[-0.2, 10], [-3, 10]]), // rim disc r10
    );
    const base = { positions, topZ: 10, floorZ: -3, stepDown: 1 };
    const tabbed = waterlineRough(opts({ ...base, tabs: { count: 3, height: 1, length: 4 } }));
    const plain = waterlineRough(opts(base));
    expect(plain.warnings).toHaveLength(1); // the rim stop note alone
    expect(tabbed.warnings).toEqual(plain.warnings); // zero notes from tabs
    expect(tabbed.moves).toEqual(plain.moves);
    expect(tabbed.levels).toEqual(plain.levels);
  });
});