import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postCarvera } from '../carvera';
import { chamfer } from '../../cam/chamfer';
import { cylChamfer } from '../../cam/cylChamfer';
import { drill } from '../../cam/drill';
import { faceCylinder } from '../../cam/faceCylinder';
import { pocket2d } from '../../cam/pocket';
import { profile2d } from '../../cam/profile';
import { threadMill } from '../../cam/threadMill';
import { engrave } from '../../cam/engrave';
import { rasterEngrave } from '../../cam/rasterEngrave';
import type { GrayBitmap } from '../../core/bitmapImport';
import type { DitherMethod } from '../../core/dither';
import type { ChamferOp, CylChamferOp, DrillOp, PocketOp, ProfileOp, ThreadMillOp, ThreadMillTarget, Tool, Vec2 } from '../../core/types';

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

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const pocketOp: PocketOp = {
  kind: 'pocket',
  id: 'op1',
  toolId: 't1',
  regions: [square],
  topZ: 0,
  floorZ: -1,
  stepDown: 1,
  stepOver: 1,
  feed: 500,
  plungeFeed: 200,
  safeClearance: 5,
};

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

const stripDate = (s: string) => s.split('\n').filter((l) => !l.startsWith('; generated')).join('\n');

function checkGolden(name: string, gcode: string) {
  it(`matches the golden file for ${name} (regenerate deliberately with UPDATE_GOLDEN=1)`, () => {
    const goldenPath = join(import.meta.dirname, 'golden', name);
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(goldenPath, stripDate(gcode));
      return; // golden written; review the diff before committing
    }
    expect(existsSync(goldenPath), 'golden missing — run UPDATE_GOLDEN=1 npx vitest run once').toBe(true);
    expect(stripDate(gcode)).toBe(stripDate(readFileSync(goldenPath, 'utf8')));
  });
}

const laserTool: Tool = {
  id: 'l1',
  name: 'Laser Module',
  type: 'laser',
  diameter: 0.1, // spot
  spindleRpm: 20, // the power% slot (documented reuse)
  focus: 1.5,
};

// the mill-tested Makera sequence (examples/lengrave_TOP): M321, focus
// rapid, M3 (after the rapid), S per path start, S0 between paths and
// at the end, M05/M322 tails — no T M6, no TOOL header
const laserMoves = engrave({
  id: 'opL',
  toolId: 'l1',
  paths: [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    [{ x: 0, y: 5 }, { x: 10, y: 5 }],
  ],
  depth: 0.5, // ignored by the laser variant
  stepDown: 0.25,
  feed: 100, // Makera's own aluminum vector-engrave feed
  plungeFeed: 50,
  clearance: 5,
  frame: { kind: 'flat', surfaceZ: 0 },
  laser: { focus: 1.5, power: 0.2 }, // the example's S0.2
}).moves.map((m, i) =>
  i === 0 ? { ...m, op: { number: 1, name: 'Laser Vector', toolNumber: 1 } } : m,
);

describe('generator post goldens', () => {
  checkGolden(
    'engrave-laser.nc',
    postCarvera({
      moves: laserMoves,
      tools: [laserTool],
      options: { jobName: 'engrave-laser' },
    }),
  );

  // ---- LASER RASTER ENGRAVE goldens (docs/makera-dialect.md §"Laser
  // Image" — the measured Studio raster dialect): a dithered 1-bit
  // bitmap burned at CONSTANT power, rows along X at constant feed.
  // 12×8 px artwork: left half black, right half white, one isolated
  // 2px black island on image row 3 (columns 9–10) — row run lengths
  // vary (6 vs 2), the island row carries two runs, half the rows end
  // lit (odd serpentine rows → the pure-Y corner form) and half end
  // beam-off (→ the fold form). Luma 0=black, 255=white, row 0 = TOP.
  // 'bayer8' keeps the dither deterministic: solid black fires every
  // pixel, solid white fires none.
  const rasterBitmap: GrayBitmap = {
    width: 12,
    height: 8,
    data: new Uint8Array(
      Array.from({ length: 12 * 8 }, (_, p) => {
        const c = p % 12;
        const r = Math.floor(p / 12);
        return c < 6 || (r === 3 && (c === 9 || c === 10)) ? 0 : 255;
      }),
    ),
  };
  const rasterMoves = (
    sweep: 'serpentine' | 'one-way',
    method: DitherMethod = 'bayer8',
    screenSpacing?: number,
  ) =>
    rasterEngrave({
      toolId: 'l1',
      bitmap: rasterBitmap,
      face: { width: 12, height: 8 },
      origin: { x: 10, y: 20 },
      surfaceZ: 0,
      pitch: 1,
      feed: 1000,
      focus: 1.5,
      power: 0.3,
      method,
      screenSpacing,
      sweep,
    }).moves.map((m, i) =>
      i === 0 ? { ...m, op: { number: 1, name: 'Laser Raster', toolNumber: 1 } } : m,
    );

  const rasterSerpentineGcode = postCarvera({
    moves: rasterMoves('serpentine'),
    tools: [laserTool],
    options: { jobName: 'raster-engrave-serpentine' },
  });
  checkGolden('raster-engrave-serpentine.nc', rasterSerpentineGcode);

  // the QUALITY sweep: returns are G0 rapids above the work (deliberate
  // divergence from Studio's constant-feed returns), Y steps ride them,
  // every row traverses +X
  checkGolden(
    'raster-engrave-oneway.nc',
    postCarvera({
      moves: rasterMoves('one-way'),
      tools: [laserTool],
      options: { jobName: 'raster-engrave-oneway' },
    }),
  );

  // the halftone-threshold operator through the post: same artwork,
  // screenSpacing 2mm → dot-pattern rows instead of run fills
  checkGolden(
    'raster-engrave-halftone.nc',
    postCarvera({
      moves: rasterMoves('serpentine', 'halftone', 2),
      tools: [laserTool],
      options: { jobName: 'raster-engrave-halftone' },
    }),
  );

  // Z1 LINE LENGTH, asserted at the post's throw boundary (61) — the
  // firmware silently truncates > 63; raster lines are short (dialect
  // avg ~10 chars) so this is a tripwire, not a live risk
  it('raster-engrave-serpentine.nc: every instruction line fits the post buffer (max 61)', () => {
    for (const line of stripDate(rasterSerpentineGcode).split('\n')) {
      if (line.startsWith(';')) continue;
      const idx = line.indexOf(' ; ');
      const instruction = idx > 0 ? line.slice(0, idx) : line;
      expect(
        instruction.length,
        `overlong raster line (${instruction.length} chars): "${line}"`,
      ).toBeLessThanOrEqual(61);
    }
  });

  // S-WORD MODALITY: the S word rides run boundaries only — the count of
  // S-bearing lines must equal the number of power changes in the Move[]
  // (the post is modal between changes). Derived from the moves; never
  // hardcoded, so a generator retune cannot silently desync this check.
  it('raster-engrave-serpentine.nc: S-bearing lines exactly match the power changes in the moves', () => {
    const sLines = stripDate(rasterSerpentineGcode)
      .split('\n')
      .filter((l) => !l.startsWith(';') && /(^| )S\d/.test(l)).length;
    let expected = 0;
    let last: number | undefined;
    for (const m of rasterMoves('serpentine')) {
      if (m.power !== undefined && m.power !== last) {
        expected++;
        last = m.power;
      }
    }
    expect(expected).toBeGreaterThan(0);
    expect(sLines, `${sLines} S lines vs ${expected} power changes in the moves`).toBe(expected);
  });


  checkGolden(
    'pocket-square.nc',
    postCarvera({
      moves: pocket2d(pocketOp, tool).moves,
      tools: [tool],
      options: { jobName: 'pocket-square' },
    }),
  );

  // ADAPTIVE ROUGHING GOLDEN (spec step 3): the deep bulk pocket takes the
  // trochoid route — arc-dense emission (G2/G3 peels, I/J form), the derived
  // chip-thinning rates the job layer would pass (Ø6, ae 0.9: DOC 2→4, feed
  // 600→1200), and the entry discipline's helical ramps. Pins the post's
  // handling of a trochoidal job end to end.
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
    floorZ: -15, // 15 > 2·6 — deep bulk
    stepDown: 2,
    stepOver: 3,
    feed: 600,
    plungeFeed: 200,
    safeClearance: 5,
  };
  const deepRes = pocket2d(deepPocketOp, trochTool, {
    trochoidRates: { stepDown: 4, feed: 1200 },
  });
  if (!deepRes.trochoid) throw new Error('deep pocket fixture must take the trochoid route');
  checkGolden(
    'pocket-trochoid.nc',
    postCarvera({
      moves: deepRes.moves,
      tools: [trochTool],
      options: { jobName: 'pocket-trochoid' },
    }),
  );

  checkGolden(
    'drill-holes.nc',
    postCarvera({
      moves: drill(drillOp, drillTool).moves,
      tools: [drillTool],
      options: { jobName: 'drill-holes' },
    }),
  );

  checkGolden(
    'profile-square.nc',
    postCarvera({
      moves: profile2d(profileOp, tool).moves,
      tools: [tool],
      options: { jobName: 'profile-square' },
    }),
  );

  // indexed drill: one rapid A positioning move, then flat drilling
  const indexMove = {
    words: { a: 90 },
    feed: 0,
    rapid: true,
    comment: 'index stock to A90°',
  };
  checkGolden(
    'drill-indexed.nc',
    postCarvera({
      moves: [indexMove, ...drill(drillOp, drillTool).moves],
      tools: [drillTool],
      options: { jobName: 'drill-indexed' },
    }),
  );

  // spiral facing: step-downs in the cut, no safe-Z retracts between passes.
  // cutBeyondStock on = the raw spiral (this golden pins the OLD strategy's
  // emitted dialect; the squared-edge default is a face-strategy change,
  // pinned in faceCylinder.test.ts, and would churn this golden for no
  // dialect reason)
  const spiralFaceOp = {
    kind: 'faceCylinder',
    id: 'op4',
    toolId: 't1',
    targetDiameter: 40,
    xStart: 0,
    xEnd: 100,
    stepDown: 1,
    stepOver: 1.6, // 0.8·Ø — pins the pre-setting behavior of face-spiral.nc
    finishAllowance: 0.2,
    plungeFeed: 300,
    rotation: 'cw',
    pattern: 'spiral',
    feed: 600,
    cutBeyondStock: true,
  } as const;
  const faceStock = {
    kind: 'cylinder',
    length: 100,
    xOrigin: 'min',
    calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
    axisMode: '4-axis',
    materialId: 'aluminum-6061',
  } as const;
  checkGolden(
    'face-spiral.nc',
    postCarvera({
      moves: faceCylinder(spiralFaceOp, faceStock.calibration, tool).moves,
      tools: [tool],
      options: { jobName: 'face-spiral' },
    }),
  );

  // vertical facing: one straight plunge per level plus full-revolution
  // A-only cuts, which the post classifies G94 and runs at deg/min, with
  // in-cut X steps between rings. No cutBeyondStock: the ring positions
  // ride the TOOL-CENTER path bounds (inset by toolR — her "cutting too
  // far" report), so this golden pins the inset bounds honestly.
  const ringFaceOp = {
    kind: 'faceCylinder',
    id: 'op5',
    toolId: 't1',
    targetDiameter: 40,
    xStart: 0,
    xEnd: 12,
    stepDown: 2,
    stepOver: 1.6, // 0.8·Ø
    finishAllowance: 0.2,
    plungeFeed: 300,
    rotation: 'cw',
    pattern: 'vertical',
    feed: 600,
    cutBeyondStock: false, // explicit: the ring path IS the inset-bound path
  } as const;
  checkGolden(
    'face-vertical.nc',
    postCarvera({
      moves: faceCylinder(ringFaceOp, faceStock.calibration, tool).moves,
      tools: [tool],
      options: { jobName: 'face-cylinder' },
    }),
  );

  // two face ops back to back: the second CONTINUES from the first's final
  // A (cross-op threading). Before this, every op restarted at absolute 0 —
  // the machine unwound the entire accumulated pile between ops, winding
  // round and round. The golden pins the continuation.
  const faceA = faceCylinder(spiralFaceOp, faceStock.calibration, tool);
  const finalA = [...faceA.moves].reverse().find((m) => m.words.a !== undefined)!.words.a!;
  const faceB = faceCylinder(
    { ...spiralFaceOp, id: 'op4b' },
    faceStock.calibration,
    tool,
    finalA,
  );
  checkGolden(
    'face-pair.nc',
    postCarvera({
      moves: [...faceA.moves, ...faceB.moves],
      tools: [tool],
      options: { jobName: 'face-pair' },
    }),
  );

  // V-bit chamfer on one hole rim: auto side (material outside the loop →
  // tool rides inside it), tip 0.5mm below the anchor plane, one closed pass
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
  checkGolden(
    'chamfer-rim.nc',
    postCarvera({
      moves: chamfer(chamferOp, chamferTool).moves,
      tools: [chamferTool],
      options: { jobName: 'chamfer-rim' },
    }),
  );

  // THREAD MILLING — ARC FORM (2026-11-12): the M14×1 external cycle the
  // unit tests replay from the mill-tested record, now as whole-turn G2s
  // (left-hand = cw) with Z riding the arc word. Pins the thread-arc
  // dialect end-to-end through the post.
  {
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
    checkGolden(
      'thread-mill-arcs.nc',
      postCarvera({
        moves: threadMill(threadOp, threadMillTool).moves,
        tools: [threadMillTool],
        options: { jobName: 'thread-mill-arcs' },
      }),
    );
  }

  // the cylinder chamfer: A-only ring sweeps in G94 (deg/min) at one
  // fixed X, Z plunges per level — depth 0 ladders from the stock surface
  const cylOp: CylChamferOp = {
    kind: 'cylChamfer',
    id: 'op7',
    toolId: 't3',
    edges: [{ x: 20, diameter: 15 }],
    depth: 0, // anchor on the Ø15 circle, cut up-and-out
    stepDown: 0.4, // Ø16.35 stock → levels 7.775 then 7.5 exactly
    rotation: 'cw',
    plungeFeed: 200,
  };
  checkGolden(
    'cyl-chamfer.nc',
    postCarvera({
      moves: cylChamfer(cylOp, { aOriginDeg: 0, axisZ: 0, effectiveRadius: 8.175 }, chamferTool)
        .moves,
      tools: [chamferTool],
      options: { jobName: 'cyl-chamfer' },
    }),
  );

  // THE Z1 TRUNCATION GUARD (field report, 2026-11-05): the firmware
  // silently truncates instruction lines past its buffer — a lost
  // coordinate or a lost F mid-G93 means ruined jobs and broken bits.
  // Comments and TOOL headers are the controller's business (stripped
  // upstream; Makera's own output ships megabyte comments), but every
  // INSTRUCTION line in every golden must fit, forever.
  it('no golden instruction line exceeds the firmware line buffer', () => {
    const goldenDir = join(import.meta.dirname, 'golden');
    const files = readdirSync(goldenDir).filter((f) => f.endsWith('.nc'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const lines = readFileSync(join(goldenDir, f), 'utf8').split('\n');
      for (const line of lines) {
        // instruction lines only: G/M/T/S words, not ';' comments
        if (line.startsWith(';')) continue;
        // strip a trailing comment — the controller removes it upstream
        const idx = line.indexOf(' ; ');
        const instruction = idx > 0 ? line.slice(0, idx) : line;
        expect(
          instruction.length,
          `${f}: overlong instruction line (${instruction.length} chars): "${instruction}"`,
        ).toBeLessThanOrEqual(63);
      }
    }
  });
});