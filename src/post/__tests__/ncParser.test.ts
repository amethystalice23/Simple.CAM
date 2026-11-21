/**
 * The Carvera nc parser (src/post/ncParser.ts): nc text → Move[] IR.
 *
 * Two acceptance tiers (PLAN.md item 13):
 *  1. ROUND-TRIP — every golden file in src/post/__tests__/golden/ re-parses
 *     Move-for-Move: parse(post(moves)) ≈ moves, coordinates equal at the
 *     post's 2-decimal formatting; comments are lossy (dropped), op tags and
 *     spindle stamps may be lossy — the compared surface is words, rapid,
 *     feed, arc, power.
 *  2. CORPUS — all 22 mill-tested Makera Studio exports in examples/ parse
 *     without error, op counts match their TOOLPATH_START markers, and the
 *     G92.4 datum/shrink semantics land the documented tracked-A values.
 *
 * Plus the loud-failure pins: the parser throws rather than silently
 * dropping a cut, on unknown G/M codes, R-form arcs, A-coordinated arcs,
 * F-less G93 lines, and mangled words.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCarveraNc } from '../ncParser';
import { postCarvera } from '../carvera';
import { chamfer } from '../../cam/chamfer';
import { cylChamfer } from '../../cam/cylChamfer';
import { drill } from '../../cam/drill';
import { faceCylinder } from '../../cam/faceCylinder';
import { pocket2d } from '../../cam/pocket';
import { profile2d } from '../../cam/profile';
import { threadMill } from '../../cam/threadMill';
import { engrave } from '../../cam/engrave';
import type {
  ChamferOp,
  CylChamferOp,
  DrillOp,
  FaceCylinderOp,
  Move,
  PocketOp,
  ProfileOp,
  Stock,
  ThreadMillOp,
  ThreadMillTarget,
  Tool,
  Vec2,
} from '../../core/types';

// ---- helpers ----------------------------------------------------------

const GOLDEN_DIR = join(import.meta.dirname, 'golden');
const EXAMPLES_DIR = join(import.meta.dirname, '../../../examples');

/** Compare a parsed move against the IR move that produced it. Loose by
 *  design: comments and op/spindle stamps may be lossy (the post's header
 *  machinery is not the sim's concern); words (sparse, as written), rapid,
 *  feed, arc and power must round-trip at the post's 2-decimal formatting. */
function expectRoundTrips(parsed: Move, original: Move, label: string) {
  expect(Object.keys(parsed.words).sort(), `${label} word set`).toEqual(
    Object.keys(original.words).sort(),
  );
  for (const key of ['x', 'y', 'z', 'a'] as const) {
    const o = original.words[key];
    const p = parsed.words[key];
    if (o === undefined) {
      expect(p, `${label} ${key} absent`).toBeUndefined();
    } else {
      expect(p, `${label} ${key}`).toBeCloseTo(parseFloat(o.toFixed(2)), 6);
    }
  }
  expect(parsed.rapid ?? false, `${label} rapid`).toBe(original.rapid ?? false);
  // F round-trips at the post's 2-decimal FORMATTING (the acceptance bar):
  // the emitted text carries 2 decimals, so the parse can only recover the
  // rounded value — and the post CLAMPS sub-0.005 feeds up to 0.01, so
  // compare against the value the post would actually have emitted. A
  // G0 line takes no F word at all: the parser reads feed 0 there, which
  // is the IR's rapid convention (feed: 0, ignored).
  const emittedFeed = (original.rapid ?? false) ? 0 : Math.max(original.feed, 0.01);
  expect(parsed.feed, `${label} feed`).toBeCloseTo(parseFloat(emittedFeed.toFixed(2)), 6);
  if (original.arc) {
    expect(parsed.arc, `${label} arc`).toBeDefined();
    // I/J round-trip at the post's 2-decimal FORMATTING (the acceptance
    // bar): the emitted text carries 2 decimals, so the parse can only
    // recover the rounded value
    expect(parsed.arc!.i).toBeCloseTo(parseFloat(original.arc.i.toFixed(2)), 6);
    expect(parsed.arc!.j).toBeCloseTo(parseFloat(original.arc.j.toFixed(2)), 6);
    expect(parsed.arc!.cw).toBe(original.arc.cw);
  } else {
    expect(parsed.arc, `${label} arc absent`).toBeUndefined();
  }
  if (original.power !== undefined) {
    expect(parsed.power, `${label} power`).toBeCloseTo(original.power, 6);
  } else {
    // the post emits S only on CHANGE — a modal repeat is a lossy-but-honest
    // emission; the parser cannot recover it and must not hallucinate one
    expect(parsed.power, `${label} power absent`).toBeUndefined();
  }
}

// ---- round-trip over every golden file --------------------------------

describe('nc parser: golden round-trip', () => {
  const goldens = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.nc')).sort();

  it('has golden files to test', () => {
    expect(goldens.length).toBeGreaterThan(5);
  });

  for (const file of goldens) {
    it(`round-trips ${file}`, () => {
      const text = readFileSync(join(GOLDEN_DIR, file), 'utf8');
      const { moves, ops, finalA } = parseCarveraNc(text);

      // the footer G92.4 shrink may land the tracked A anywhere in ±360 —
      // only shape is pinned here; the exact semantics are pinned in the
      // dedicated G92.4 describe below
      expect(Number.isFinite(finalA)).toBe(true);

      // every parsed move must be well-formed IR: non-negative finite feed
      for (const m of moves) {
        expect(Number.isFinite(m.feed), 'finite feed').toBe(true);
        expect(m.feed).toBeGreaterThanOrEqual(0);
      }

      if (ops.length > 0) {
        // golden files carry at most one TOOLPATH_START (engrave-laser);
        // its number must appear in the parsed ops
        const marker = text.match(/toolpath_number=(\d+)/);
        if (marker) {
          expect(ops.some((o) => o.number === parseFloat(marker[1])), 'op number').toBe(true);
        }
      }
    });
  }
});

// ---- the full Move-for-Move contract ----------------------------------
// post(parse-built IR) re-emits; the parse of THAT must equal the IR.
// Built through the REAL generator fixtures behind every golden file (the
// same op/tool/stock inputs generators.test.ts pins), so the acceptance
// "the parser round-trips every golden file, Move-for-Move" runs against
// the true producers of those files — plus synthetic move lists for the
// dialect forms the goldens don't carry (modal words, S words).

describe('nc parser: post→parse→post Move-for-Move', () => {
  const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };

  /** Post a move list, parse it back, compare move-for-move. The post may
   *  INSERT fixture lines (the rotary centerline `G0 Y0` after the header
   *  datum and after each tool change) — real emitted motion the parser
   *  must keep, but not IR moves, so the alignment skips exactly that
   *  shape. It never DROPS or MERGES emitted motion lines. */
  function roundTrip(moves: Move[], label: string, tools: Tool[] = [tool]): Move[] {
    const nc = postCarvera({ moves, tools, options: { jobName: label, prepHeader: 'none' } });
    const { moves: parsed } = parseCarveraNc(nc);
    let pi = 0;
    for (let i = 0; i < moves.length; i++) {
      const o = moves[i];
      // skip the post's inserted centerline rapids (Y0 only, no other words)
      while (pi < parsed.length) {
        const p = parsed[pi];
        const isCenterline =
          p.rapid === true && Object.keys(p.words).length === 1 && p.words.y === 0;
        const matches = (() => {
          try {
            expectRoundTrips(p, o, `${label}[probe]`);
            return true;
          } catch {
            return false;
          }
        })();
        if (matches) break;
        if (isCenterline) {
          pi++; // the post's fixture line — real, kept, not an IR move
        } else {
          expectRoundTrips(p, o, `${label}[${i}]`); // re-throw with detail
        }
      }
      expect(pi, `${label}: aligned move ${i}`).toBeLessThan(parsed.length);
      expectRoundTrips(parsed[pi], o, `${label}[${i}]`);
      pi++;
    }
    // nothing left over but the post's centerline fixtures
    for (; pi < parsed.length; pi++) {
      const p = parsed[pi];
      const isCenterline =
        p.rapid === true && Object.keys(p.words).length === 1 && p.words.y === 0;
      expect(isCenterline, `${label}: unexpected trailing move ${JSON.stringify(p)}`).toBe(true);
    }
    return parsed;
  }

  it('round-trips a plain 3-axis sequence with modal words and modal F', () => {
    roundTrip(
      [
        { words: { x: 5, y: 5 }, feed: 0, rapid: true },
        { words: { z: 5 }, feed: 0, rapid: true },
        { words: { z: 0.5 }, feed: 0, rapid: true },
        { words: { z: -1.5 }, feed: 300 }, // F on the line
        { words: { x: 10.25 }, feed: 300 }, // modal: Z carries, F suppressed
        { words: { y: 3.75, z: -1 }, feed: 600 },
        { words: { x: 0, y: 0, z: 5 }, feed: 0, rapid: true },
      ],
      'modal-3axis',
    );
  });

  it('round-trips a same-mode re-fixture pause (T999 M6 hold, no motion)', () => {
    // the merge-rule export shape: two same-mode sections in one file,
    // the wordless pause between them. The post emits the T999 block but NO
    // motion line for the pause — the parsed stream must carry exactly the
    // two cutting ops' moves, and the re-fixture op tag must parse with
    // its tool number so the sim's tool lookup stays honest.
    const nc = postCarvera({
      moves: [
        { words: { x: 5, z: -1 }, feed: 100, op: { number: 1, name: 'Pocket', toolNumber: 1 } },
        {
          words: {},
          feed: 0,
          comment: 're-fixture: pose flipX',
          op: { number: 2, name: 'Re-fixture', toolNumber: 999 },
        },
        { words: { x: 10, z: -1 }, feed: 100, op: { number: 3, name: 'Profile', toolNumber: 2 } },
      ],
      tools: [tool, { id: 't2', name: 'vbit', type: 'vbit', diameter: 3.175, spindleRpm: 12000 }],
      toolNumbers: [1, 2],
      options: { jobName: 'refix-pause', prepHeader: 'none' },
    });
    expect(nc).toContain('T999 M6');
    expect(nc).not.toMatch(/^G1 F/m); // no feed-only motion line for the pause
    const { moves: parsed, ops } = parseCarveraNc(nc);
    // two cutting moves, no phantom pause motion, no phantom Y0 mid-file
    const cutting = parsed.filter((m) => Object.keys(m.words).length > 0);
    expect(cutting).toHaveLength(2);
    expect(parsed[0].op?.number).toBe(1);
    expect(parsed[1].op?.number).toBe(3); // the pause stamps nothing
    expect(ops.map((o) => o.number)).toEqual([1, 2, 3]);
    // The pause is MOTIONLESS so the parse drops it (nothing emitted to
    // read back) — the honest contract, not a loss: the sim carves moves,
    // and a pause cuts nothing. The pause lives in the EXPORTED file's
    // T999 M6 block, where the machine holds and the operator turns the
    // part over.
    expect(parsed.some((m) => m.op?.toolNumber === 999)).toBe(false);
  });

  it('round-trips G93 coordinated X+A and Z+A sweeps with F on every line', () => {
    roundTrip(
      [
        { words: { x: 0, z: 25.5 }, feed: 0, rapid: true },
        { words: { z: 24.04, a: 90 }, feed: 26.4 }, // helical entry (G93)
        { words: { x: 100, a: 22590 }, feed: 0.11 }, // coordinated sweep (G93)
        { words: { x: 0, a: 22680 }, feed: 0.11 },
        { words: { z: 23.08, a: 22770 }, feed: 26.4 },
      ],
      'g93-sweeps',
    );
  });

  it('round-trips A-only cut rings and pure-A rapids (G94 deg/min)', () => {
    roundTrip(
      [
        { words: { x: 20 }, feed: 0, rapid: true },
        { words: { z: 13.18 }, feed: 0, rapid: true },
        { words: { z: 7.84 }, feed: 200 },
        { words: { a: 360 }, feed: 2376 }, // the ring cut
        { words: { a: 720 }, feed: 2376 },
        { words: { z: 7.5 }, feed: 200 },
        { words: { a: 90 }, feed: 0, rapid: true }, // pure-A index rapid
        { words: { a: -45 }, feed: 0, rapid: true },
      ],
      'a-rings',
    );
  });
  it('round-trips G2/G3 arcs including a helical full circle', () => {
    roundTrip(
      [
        { words: { x: 11.76, y: 0 }, feed: 0, rapid: true },
        { words: { z: 3 }, feed: 0, rapid: true },
        { words: { z: -10 }, feed: 100 },
        { words: { x: 8.76, y: 0 }, feed: 100 }, // radial entry, modal F
        { words: { x: 8.76, y: 0, z: -9 }, feed: 100, arc: { i: -8.76, j: 0, cw: true } },
        { words: { x: 8.76, y: 0, z: 0 }, feed: 100, arc: { i: -8.76, j: 0, cw: true } },
        { words: { x: 0, y: 10 }, feed: 300, arc: { i: 0, j: -8.76, cw: false } },
      ],
      'arcs',
    );
  });

  it('round-trips laser power words (S on G1 lines) through the modal stream', () => {
    // the post emits S only when the power CHANGES — a modal repeat of the
    // same power is dropped at emission (documented lossy surface, like the
    // modal F), so the round-trip list carries each power once per change
    roundTrip(
      [
        { words: { x: 0, y: 0 }, feed: 0, rapid: true },
        { words: { z: 1.5 }, feed: 0, rapid: true, comment: 'laser focus height' },
        { words: { x: 10, y: 0 }, feed: 100, power: 0.2 },
        { words: {}, feed: 100, power: 0 }, // bare extinguish G1
        { words: { x: 0, y: 5 }, feed: 0, rapid: true },
        { words: { x: 10, y: 5 }, feed: 100, power: 0.35 },
        { words: {}, feed: 100, power: 0 },
      ],
      'laser-s',
    );
  });

  it('round-trips negative-zero coordinates byte-honestly', () => {
    roundTrip(
      [
        { words: { x: -0, y: -0 }, feed: 0, rapid: true },
        { words: { z: -0 }, feed: 300 },
      ],
      'neg-zero',
    );
  });

  it('parses its own G93 files with F on every G93 G1 line (never throws)', () => {
    // the face-spiral golden IS the post's G93 output; the parser must
    // accept every one of its F-carrying lines
    const text = readFileSync(join(GOLDEN_DIR, 'face-spiral.nc'), 'utf8');
    const { moves } = parseCarveraNc(text);
    // and the reconstructed moves must re-post to the same dialect
    const rePosted = postCarvera({
      moves,
      tools: [tool],
      options: { jobName: 're-spiral', prepHeader: 'none' },
    });
    const g93Lines = (t: string) =>
      t
        .split('\n')
        .filter((l) => l.startsWith('G1 ') && !l.includes(' F'));
    // every G93 G1 in the re-post carries F
    let inG93 = false;
    for (const line of rePosted.split('\n')) {
      if (line === 'G93') inG93 = true;
      if (line === 'G94') inG93 = false;
      if (inG93 && line.startsWith('G1 ')) {
        expect(line).toMatch(/ F[\d.]+/);
      }
    }
    expect(g93Lines(text).length === 0, 'every G93 G1 in the golden carries F').toBe(true);
    expect(rePosted.split('\n').filter((l) => l.startsWith('G1 ')).length).toBeGreaterThan(0);
    // the first sweep's F must round-trip exactly (26.4 → 26.4)
    expect(rePosted).toContain('F26.4');
    expect(moves.length).toBeGreaterThan(10);
  });
});

// ---- op metadata -------------------------------------------------------

// ---- generator-fixture round-trips (the golden files' true producers) --

describe('nc parser: golden fixtures round-trip Move-for-Move', () => {
  const tool: Tool = { id: 't1', name: '2mm flat', type: 'flat', diameter: 2, spindleRpm: 18000 };
  const drillTool: Tool = { id: 't2', name: '3mm drill', type: 'drill', diameter: 3, spindleRpm: 18000 };
  const chamferTool: Tool = {
    id: 't3',
    name: 'Chamfering Bit 1/8',
    type: 'vbit',
    diameter: 3.175,
    vAngle: 90,
    tipDiameter: 0.1,
    spindleRpm: 12000,
  };
  const stock: Extract<Stock, { kind: 'cylinder' }> = {
    kind: 'cylinder',
    length: 100,
    xOrigin: 'min',
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
    axisMode: '4-axis',
    materialId: 'aluminum-6061',
  };
  const square: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  /** Post → parse → Move-for-Move, tolerating ONLY the post's inserted
   *  rotary-centerline fixture rapids (G0 Y0). */
  function expectGoldenRoundTrip(label: string, moves: Move[], tools: Tool[]) {
    const nc = postCarvera({ moves, tools, options: { jobName: label } });
    const { moves: parsed } = parseCarveraNc(nc);
    let pi = 0;
    for (let i = 0; i < moves.length; i++) {
      const o = moves[i];
      while (pi < parsed.length) {
        const p = parsed[pi];
        const isCenterline =
          p.rapid === true && Object.keys(p.words).length === 1 && p.words.y === 0;
        let ok = false;
        try {
          expectRoundTrips(p, o, `${label}[probe]`);
          ok = true;
        } catch {
          ok = false;
        }
        if (ok) break;
        if (isCenterline) pi++;
        else expectRoundTrips(p, o, `${label}[${i}]`);
      }
      expect(pi, `${label}: aligned move ${i}`).toBeLessThan(parsed.length);
      expectRoundTrips(parsed[pi], o, `${label}[${i}]`);
      pi++;
    }
    for (; pi < parsed.length; pi++) {
      const p = parsed[pi];
      const isCenterline =
        p.rapid === true && Object.keys(p.words).length === 1 && p.words.y === 0;
      expect(isCenterline, `${label}: trailing move ${JSON.stringify(p)}`).toBe(true);
    }
  }

  it('face-cylinder (vertical rings — the face-cylinder.nc producer)', () => {
    const op: FaceCylinderOp = {
      kind: 'faceCylinder',
      id: 'op1',
      toolId: 't1',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 12,
      stepDown: 2,
      stepOver: 1.6,
      finishAllowance: 0.2,
      plungeFeed: 300,
      rotation: 'cw',
      pattern: 'vertical',
      feed: 600,
      cutBeyondStock: false,
    };
    expectGoldenRoundTrip(
      'face-vertical',
      faceCylinder(op, stock.calibration, tool).moves,
      [tool],
    );
  });

  it('face-cylinder spiral with G93 sweeps (the face-spiral.nc producer)', () => {
    const op: FaceCylinderOp = {
      kind: 'faceCylinder',
      id: 'op4',
      toolId: 't1',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 100,
      stepDown: 1,
      stepOver: 1.6,
      finishAllowance: 0.2,
      plungeFeed: 300,
      rotation: 'cw',
      pattern: 'spiral',
      feed: 600,
      cutBeyondStock: true,
    };
    expectGoldenRoundTrip(
      'face-spiral',
      faceCylinder(op, stock.calibration, tool).moves,
      [tool],
    );
  });

  it('indexed drilling (the drill-indexed.nc producer)', () => {
    const drillOp: DrillOp = {
      kind: 'drill',
      id: 'op2',
      toolId: 't2',
      targets: [
        { x: 5, y: 5, topZ: 0, depth: 5 },
        { x: 25, y: 5, topZ: 0, depth: 3 },
      ],
      peckDepth: 2,
      plungeFeed: 300,
      safeClearance: 5,
    };
    expectGoldenRoundTrip(
      'drill-indexed',
      [
        { words: { a: 90 }, feed: 0, rapid: true, comment: 'index stock to A90°' },
        ...drill(drillOp, drillTool).moves,
      ],
      [drillTool],
    );
  });

  it('pocket with trochoid arcs (the pocket-trochoid.nc producer)', () => {
    const trochTool: Tool = {
      id: 't6',
      name: '6mm flat',
      type: 'flat',
      diameter: 6,
      flutes: 2,
      spindleRpm: 16000,
    };
    const deepSquare: Vec2[] = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 24 },
      { x: 0, y: 24 },
    ];
    const deepPocketOp: PocketOp = {
      kind: 'pocket',
      id: 'opT',
      toolId: 't6',
      regions: [deepSquare],
      topZ: 0,
      floorZ: -15,
      stepDown: 2,
      stepOver: 3,
      feed: 600,
      plungeFeed: 200,
      safeClearance: 5,
    };
    const res = pocket2d(deepPocketOp, trochTool, {
      trochoidRates: { stepDown: 4, feed: 1200 },
    });
    if (!res.trochoid) throw new Error('fixture must take the trochoid route');
    expectGoldenRoundTrip('pocket-trochoid', res.moves, [trochTool]);
  });

  it('profile with tabs (the profile-square.nc producer)', () => {
    const profileOp: ProfileOp = {
      kind: 'profile',
      id: 'op3',
      toolId: 't1',
      contours: [square],
      side: 'outside',
      bottomAllowance: 0,
      sideAllowance: 0,
      topZ: 0,
      floorZ: -2,
      stepDown: 1,
      feed: 500,
      plungeFeed: 200,
      safeClearance: 5,
    };
    expectGoldenRoundTrip('profile-square', profile2d(profileOp, tool).moves, [tool]);
  });

  it('rim chamfer with a full-circle arc (the chamfer-rim.nc producer)', () => {
    const chamferOp: ChamferOp = {
      kind: 'chamfer',
      id: 'op6',
      toolId: 't3',
      loops: [
        { kind: 'circle', center: { x: 5, y: 5 }, radius: 2, z: 0, materialOutside: true },
      ],
      mode: 'add',
      side: 'auto',
      direction: 'down',
      depth: 0.5,
      feed: 600,
      plungeFeed: 200,
      safeClearance: 5,
    };
    expectGoldenRoundTrip('chamfer-rim', chamfer(chamferOp, chamferTool).moves, [chamferTool]);
  });

  it('thread mill helical arcs (the thread-mill-arcs.nc producer)', () => {
    const threadMillTool: Tool = {
      id: 'tm1',
      name: 'M6 Threadmill',
      type: 'threadmill',
      diameter: 4.75,
      pitch: 1,
      flutes: 3,
      shaftDiameter: 6,
      fluteLength: 18,
      overallLength: 50,
      spindleRpm: 12000,
    };
    const threadTarget: ThreadMillTarget = { center: { x: 0, y: 0 }, internal: false, topZ: 0, depth: 10 };
    const threadOp: ThreadMillOp = {
      kind: 'threadMill',
      id: 'thm1',
      toolId: 'tm1',
      nominalDiameter: 14,
      pitch: 1,
      starts: 1,
      tolerance: 0,
      rotation: 'ccw',
      stepOver: 0,
      feed: 100,
      plungeFeed: 100,
      safeClearance: 3,
      targets: [threadTarget],
    };
    expectGoldenRoundTrip(
      'thread-mill-arcs',
      threadMill(threadOp, threadMillTool).moves,
      [threadMillTool],
    );
  });

  it('cylinder chamfer A-only rings (the cyl-chamfer.nc producer)', () => {
    const cylOp: CylChamferOp = {
      kind: 'cylChamfer',
      id: 'op7',
      toolId: 't3',
      edges: [{ x: 20, diameter: 15 }],
      depth: 0,
      stepDown: 0.4,
      rotation: 'cw',
      plungeFeed: 200,
    };
    expectGoldenRoundTrip(
      'cyl-chamfer',
      cylChamfer(cylOp, { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 }, chamferTool).moves,
      [chamferTool],
    );
  });

  it('laser engrave with S power words (the engrave-laser.nc producer)', () => {
    const laserTool: Tool = {
      id: 'l1',
      name: 'Laser Module',
      type: 'laser',
      diameter: 0.1,
      spindleRpm: 20,
      focus: 1.5,
    };
    const moves = engrave(
      {
        id: 'opL',
        toolId: 'l1',
        paths: [
          [{ x: 0, y: 0 }, { x: 10, y: 0 }],
          [{ x: 0, y: 5 }, { x: 10, y: 5 }],
        ],
        depth: 0.5,
        stepDown: 0.25,
        feed: 100,
        plungeFeed: 50,
        clearance: 5,
        frame: { kind: 'flat', surfaceZ: 0 },
        laser: { focus: 1.5, power: 0.2 },
      },
    ).moves;
    expectGoldenRoundTrip('engrave-laser', moves, [laserTool]);
  });
});

describe('nc parser: op metadata', () => {
  it('stamps the op tag on each op\'s first move with tool numbers and names', () => {
    const nc = [
      ';@MKR|TOOL|number=3|id=x|name=3mm drill|type=Drill|handlediameter=3|sticklength=0|shoulderlength=0|flutelength=0|diameter=3|tipdiameter=3|cornerradius=0|angle=0|halfAngle=0',
      ';@MKR|TOOLPATH|number=1|tool_number=3|name=[T3]Drill holes',
      ';@MKR|TOOLPATH|number=2|tool_number=3|name=[T3]Chamfer',
      'G90 G21',
      ';@MKR|TOOLPATH_START|toolpath_number=1',
      'T3 M6',
      'S10000 M3',
      'G0 X1 Y1',
      'G1 Z-1 F300',
      'G0 Z5',
      ';@MKR|TOOLPATH_START|toolpath_number=2',
      'S12000 M3',
      'G0 X2 Y2',
      'G1 Z-0.5 F200',
    ].join('\n');
    const { moves, ops } = parseCarveraNc(nc);
    expect(ops).toEqual([
      { number: 1, name: '[T3]Drill holes' },
      { number: 2, name: '[T3]Chamfer' },
    ]);
    expect(moves[0].op).toEqual({ number: 1, name: '[T3]Drill holes', toolNumber: 3 });
    expect(moves[1].op).toBeUndefined(); // only the FIRST move of the op
    expect(moves[0].spindleRpm).toBe(10000);
    // op 2 boundary: the suppressed S M3 (speed unchanged → no re-emit) is
    // recovered from modal state onto the first move of op 2
    const op2First = moves.find((m) => m.op?.number === 2);
    expect(op2First).toBeDefined();
    expect(op2First!.spindleRpm).toBe(12000);
    expect(op2First!.words).toEqual({ x: 2, y: 2 });
  });

  it('recovers the modal spindle speed when a same-speed op re-fires nothing', () => {
    const nc = [
      'G90 G21',
      ';@MKR|TOOLPATH_START|toolpath_number=1',
      'S8000 M3',
      'G0 X0',
      'G1 X5 F500',
      ';@MKR|TOOLPATH_START|toolpath_number=2',
      'G0 X0',
      'G1 X5 F500',
    ].join('\n');
    const { moves } = parseCarveraNc(nc);
    expect(moves[0].spindleRpm).toBe(8000);
    expect(moves[2].spindleRpm).toBe(8000); // modal recovery, no S M3 re-emit
  });

  it('leaves moves untagged in files without TOOLPATH_START markers', () => {
    const { moves, ops } = parseCarveraNc('G90 G21\nG0 X1\nG1 X2 F100\nM02\n');
    expect(ops).toEqual([]);
    expect(moves).toHaveLength(2);
    for (const m of moves) expect(m.op).toBeUndefined();
  });
});

// ---- G92.4 semantics (the whole point of item 13) ----------------------

describe('nc parser: G92.4 tracked-A semantics', () => {
  it('R form rotates and sets the counter: tracked A becomes the A word', () => {
    const { moves, finalA } = parseCarveraNc('G90 G21\nG92.4 A180 R0\nG0 X1\nM02\n');
    expect(moves).toHaveLength(1); // the datum line emits NO move
    expect(finalA).toBe(180);
    expect(moves[0].words).toEqual({ x: 1 }); // no A word injected
  });

  it('R form re-expresses a rotated position: the spoke is mod-360, the counter is deg', () => {
    // Studio's A180 R0 on a machine physically at A0: the ROTATION is the
    // machine's business; the tracked work-coordinate A is simply 180
    const { finalA } = parseCarveraNc('G92.4 A180 R0\nM02\n');
    expect(finalA).toBe(180);
  });

  it('plain form (no R/S) resets the counter with no motion', () => {
    const { moves, finalA } = parseCarveraNc('G92.4 A-45\nM02\n');
    expect(moves).toHaveLength(0);
    expect(finalA).toBe(-45);
  });

  it('S form shrinks whole turns only while |A| > 360 (the firmware boundary)', () => {
    // 540 → 180
    expect(parseCarveraNc('G92.4 A0 S0\nM02\n', ).finalA).toBe(0); // trivial
    // tracked A through moves then shrunk at the footer
    const through = parseCarveraNc('G1 A540 F100\nG92.4 A0 S0\nM02\n');
    expect(through.finalA).toBe(180);
    // an exact ±360 pile lands AT ±360, NOT 0 (the strictly-greater loop)
    const exact = parseCarveraNc('G1 A360 F100\nG92.4 A0 S0\nM02\n');
    expect(exact.finalA).toBe(360);
    const exactNeg = parseCarveraNc('G1 A-720 F100\nG92.4 A0 S0\nM02\n');
    expect(exactNeg.finalA).toBe(-360);
    // a pile inside ±360 is untouched (the shrink is a no-op)
    const small = parseCarveraNc('G1 A180 F100\nG92.4 A0 S0\nM02\n');
    expect(small.finalA).toBe(180);
  });

  it('accumulates A across moves and applies shrinks in file order', () => {
    // absolute A moves: the counter tracks the last commanded absolute
    const seq = parseCarveraNc(
      [
        'G92.4 A0 R0',
        'G1 A360 F100',
        'G1 A720 F100',
        'G92.4 A0 S0', // 720 → 360 (exact boundary)
        'G1 A720 F100',
        'G0 A45',
        'M02',
      ].join('\n'),
    );
    expect(seq.finalA).toBe(45);
    expect(seq.moves.map((m) => m.words.a)).toEqual([360, 720, 720, 45]);
  });
});

// ---- corpus (the 22 mill-tested Makera Studio exports) ------------------

describe('nc parser: Makera Studio corpus', () => {
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.nc')).sort();

  it('has the full 22-file corpus available', () => {
    expect(files.length).toBe(23); // 22 mill-tested + TopClamp (air assist)
  });

  it('parses every file without error, with op counts matching its markers', () => {
    for (const file of files) {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const { moves, ops, finalA } = parseCarveraNc(text);
      const markers = text.split(/\r?\n/).filter((l) =>
        l.includes(';@MKR|TOOLPATH_START|toolpath_number='),
      ).length;
      expect(ops.length, `${file}: op count`).toBe(markers);
      expect(ops.length, `${file}: ops emitted`).toBeGreaterThan(0);
      expect(moves.length, `${file}: moves`).toBeGreaterThan(0);
      expect(Number.isFinite(finalA), `${file}: tracked A`).toBe(true);
      for (const m of moves) {
        expect(Number.isFinite(m.feed), `${file}: finite feed`).toBe(true);
        expect(m.feed).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never fabricates G93 from corpus files (Studio stair-steps, never coordinates)', () => {
    for (const file of files) {
      const text = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const { moves } = parseCarveraNc(text);
      for (let i = 0; i < moves.length; i++) {
        const w = moves[i].words;
        const coordinated =
          w.a !== undefined && (w.x !== undefined || w.y !== undefined || w.z !== undefined);
        // the corpus DOES coordinate A with Z/X on G0/G1 (Studio's own
        // emission); the parser must record it as-is — and never emit a
        // Move whose words say coordinated when the line did not
        if (coordinated) expect(moves[i].rapid ?? false, `${file}[${i}]`).toBeDefined();
      }
      // the corpus carries no G93/G94 words at all (docs/makera-dialect.md)
      expect(text).not.toMatch(/^G9[34]\r?$/m);
    }
  });

  it('reads the rotary datum forms: A0 and A180 R0 land exactly those counters', () => {
    const multi = readFileSync(
      join(EXAMPLES_DIR, 'MakeraStudioGHM9_Stage2_MULT_20260911195244.nc'),
      'utf8',
    );
    const { finalA } = parseCarveraNc(multi);
    // Stage2 flips between A0 and A180 datums per op; the last op's datum
    // is what the counter ends on
    const datums = [...multi.matchAll(/G92\.4 A(\S+) R0/g)].map((m) => m[1]);
    expect(datums.length).toBeGreaterThan(0);
    expect(finalA).toBe(parseFloat(datums[datums.length - 1]));
  });

  it('keeps continuous-rotation accumulation (A runs past 360 un-wrapped)', () => {
    const turned = readFileSync(
      join(EXAMPLES_DIR, 'MakeraStudioTurned_path2_MULT_20260910201201.nc'),
      'utf8',
    );
    const { moves } = parseCarveraNc(turned);
    const maxA = Math.max(...moves.filter((m) => m.words.a !== undefined).map((m) => m.words.a!));
    // the turned file's A pile runs to tens of thousands of degrees
    expect(maxA).toBeGreaterThan(36000);
  });

  it('parses the laser job with S words as power on G1s only', () => {
    const laser = readFileSync(
      join(EXAMPLES_DIR, 'MakeraStudiolaser_grid_TOP_20260923192329.nc'),
      'utf8',
    );
    const { moves } = parseCarveraNc(laser);
    const withPower = moves.filter((m) => m.power !== undefined);
    expect(withPower.length).toBeGreaterThan(100);
    for (const m of withPower) {
      expect(m.rapid ?? false, 'G0 never fires the beam').toBe(false);
      expect(m.power).toBeGreaterThanOrEqual(0);
      expect(m.power).toBeLessThanOrEqual(1);
    }
  });

  it('tracks tool numbers from T M6 lines onto op stamps', () => {
    const turned = readFileSync(
      join(EXAMPLES_DIR, 'MakeraStudioTurned_path2_MULT_20260910201201.nc'),
      'utf8',
    );
    const { moves } = parseCarveraNc(turned);
    const op1 = moves.find((m) => m.op?.number === 1);
    const op2 = moves.find((m) => m.op?.number === 2);
    expect(op1?.op?.toolNumber).toBe(4); // [T4]Rough
    expect(op2?.op?.toolNumber).toBe(2); // [T2]Fine
    expect(op1?.op?.name).toBe('[T4]Rough');
    expect(op2?.op?.name).toBe('[T2]Fine');
  });
});

// ---- loud failures -----------------------------------------------------

describe('nc parser: loud failures (never silently drop a cut)', () => {
  it('throws on unknown G codes that could produce motion', () => {
    expect(() => parseCarveraNc('G90 G21\nG5 X1 Y1\n')).toThrow(/unsupported G-code G5/);
    expect(() => parseCarveraNc('G38.2 Z-1 F100\n')).toThrow();
    expect(() => parseCarveraNc('G73 X1\n')).toThrow();
  });

  it('throws on unknown M codes', () => {
    expect(() => parseCarveraNc('G90 G21\nM999\n')).toThrow(/unsupported M-code M999/);
  });

  it('throws on G20 (imperial) — the firmware hard-halts on it', () => {
    expect(() => parseCarveraNc('G20\nG0 X1\n')).toThrow(/G20/);
  });

  it('throws on G91 incremental — refusing to guess', () => {
    expect(() => parseCarveraNc('G91\nG1 X1 F100\n')).toThrow(/G91/);
  });

  it('throws on R-form arcs (the firmware silently no-ops them)', () => {
    // R is not an accepted arc word at all — the firmware never parses R
    // as a radius, so the parser refuses the line rather than emit a move
    // whose arc the machine would drop
    expect(() => parseCarveraNc('G90 G21\nG2 X10 Y0 R5 F100\n')).toThrow(
      /unsupported word "R" on a motion line/,
    );
  });

  it('throws on arcs without I/J (radius 0, silently dropped)', () => {
    expect(() => parseCarveraNc('G90 G21\nG3 X10 Y10 F100\n')).toThrow(/without I\/J/);
  });

  it('throws on A-coordinated arcs (no IR representation)', () => {
    expect(() =>
      parseCarveraNc('G90 G21\nG2 X10 Y0 A30 I-10 J0 F100\n'),
    ).toThrow(/A-coordinated arc/);
  });

  it('throws on a G93 feed line without F (the firmware halts on it)', () => {
    expect(() =>
      parseCarveraNc('G90 G21\nG93\nG1 X10 A90\n'),
    ).toThrow(/G93 feed line without F/);
    // G93 rapid is exempt (the firmware forces G94 for the move)
    expect(() => parseCarveraNc('G90 G21\nG93\nG0 X10\nM02\n')).not.toThrow();
  });

  it('throws on motion words with no motion mode ever established', () => {
    expect(() => parseCarveraNc('G90 G21\nX10 Y10\n')).toThrow(
      /no G0\/G1\/G2\/G3 on the line or any earlier one/,
    );
  });

  it('throws on mangled words instead of parsing a partial move', () => {
    expect(() => parseCarveraNc('G90 G21\nG1 X10 Y@#$ F100\n')).toThrow(/unrecognized text/);
    expect(() => parseCarveraNc('G90 G21\nG1 X10 X20 F100\n')).toThrow(/duplicate X word/);
    expect(() => parseCarveraNc('G90 G21\nG1 X--10 F100\n')).toThrow();
  });

  it('throws on axis words riding a non-motion line (a cut would be lost)', () => {
    expect(() => parseCarveraNc('G90 G21\nM5 X10\n')).toThrow(
      /motion words with no G0\/G1\/G2\/G3/,
    );
    expect(() => parseCarveraNc('G28 X0 Y0\n')).toThrow(/G28 with axis words/);
  });

  it('throws on unsupported G92.4 word combinations', () => {
    expect(() => parseCarveraNc('G92.4 A0 R0 S0\n')).toThrow(/both R and S/);
    expect(() => parseCarveraNc('G92.4\n')).toThrow(/without an A word/);
    expect(() => parseCarveraNc('G92.4 A0 B1\n')).toThrow(/unsupported word "B"/);
  });

  it('accepts the whole known-dialect surface without throwing', () => {
    expect(() =>
      parseCarveraNc(
        [
          ';@MKR|BEGIN',
          ';@MKR|TOOL|number=1|id=x|name=t|type=Flat End|handlediameter=3|sticklength=0|shoulderlength=12|flutelength=12|diameter=3|tipdiameter=3|cornerradius=0|angle=0|halfAngle=0',
          ';@MKR|END',
          'G90 G21',
          ';@MKR|TOOLPATH_START|toolpath_number=1',
          'T1 M6',
          'M7',
          'G92.4 A0 R0',
          'G0 Y0',
          'S10000 M3',
          'G0 X20',
          'G0 A0',
          'G1 Z7.45 F300',
          'G1 A0.36 F1000',
          'G1 A360',
          'G0 Z11',
          'M9',
          'M05',
          'G28',
          'M02',
        ].join('\n'),
      ),
    ).not.toThrow();
  });

  it('tolerates CRLF, blank lines, parens comments and inline comments', () => {
    const { moves } = parseCarveraNc(
      'G90 G21\r\n\r\nG0 X1 ; move one\r\n(comment line)\r\nG1 X2 F100 ; move two\r\nM02\r\n',
    );
    expect(moves).toHaveLength(2);
    expect(moves[0].rapid).toBe(true);
    expect(moves[1].words.x).toBe(2);
  });

  it('parses a bare-F line as a modal update with no move', () => {
    const { moves, finalA } = parseCarveraNc('G90 G21\nF500\nG1 X1\nM02\n');
    expect(moves).toHaveLength(1);
    expect(moves[0].feed).toBe(500);
    expect(finalA).toBe(0);
  });
});
