/**
 * Carvera-dialect nc parser: G-code text -> Move[] IR.
 *
 * PLAN.md item 13 ("Simulate the POSTED g-code"): the machine executes the
 * nc text, not the generator's Move[] — everything the post does between IR
 * and text (G92.4 shrinks, short-way aliases, counter re-anchors) is real
 * machine behavior the sim must see. This parser reads that text back into
 * the Move[] IR so the simulator and the estimates consume what the machine
 * will actually execute.
 *
 * Dialect ground truth: docs/makera-dialect.md (the 22 mill-tested
 * MakeraStudio exports in examples/) plus our own post's emission
 * (src/post/carvera.ts and the golden files). Every accepted form below is
 * pinned by a test in src/post/__tests__/ncParser.test.ts.
 *
 * LOUD-FAILURE RULE: this parser feeds the simulator — silently dropping a
 * cut is the failure mode item 13 exists to prevent. Unknown G/M codes that
 * could produce motion throw; ambiguous lines (axis words with no motion
 * mode established) throw; a G93 feed line without F (the firmware halts on
 * it) throws; R-form arcs throw (the firmware never parses R as a radius —
 * a G2/G3 without I/J computes radius 0 and silently no-ops).
 *
 * G92.4 (all three real variants, docs/makera-dialect.md "Firmware
 * behavior") produces NO moves but DOES mutate the tracked A state:
 *   - `G92.4 A<deg> R<x>`  rotate to the mod-360 spoke, then counter = deg
 *                          (Studio's per-toolpath datum; R's value ignored)
 *   - `G92.4 A<deg>`       pure counter reset — no motion, no EEPROM
 *   - `G92.4 A0 S0`        shrink — whole turns subtracted while |A| > 360
 *                          (the firmware's strictly-greater loop, so an
 *                          exact ±360 pile lands AT ±360, not 0)
 *
 * Modality: coordinate words are absolute with modal carry (a `G1 X12`
 * with omitted Y/Z/A means the previously commanded values); F is modal in
 * both feed modes and resets across an explicit G93/G94 mode change (the
 * post re-emits F after every mode change, and the parse must see it).
 * Parsed Move.words stay SPARSE — exactly the words on the line — which is
 * the Move IR convention (the sim and moveDurations modal-carry themselves)
 * and what makes post→parse→post round-trip Move-for-Move.
 */

import type { AxisWords, FeedMode, Move } from '../core/types';

export interface ParsedOp {
  /** the toolpath number from the ;@MKR|TOOLPATH_START marker */
  number: number;
  /** the op name from the file header's ;@MKR|TOOLPATH line, when present */
  name?: string;
}

export interface ParsedNc {
  moves: Move[];
  ops: ParsedOp[];
  /**
   * The tracked work-coordinate A (degrees) after the last parsed line —
   * G92.4 datum sets, shrinks and re-anchors included. Extra to the
   * minimal contract; callers continuing a job (and the shrink tests) read
   * it directly.
   */
  finalA: number;
}

/**
 * The firmware's shrink model (Robot.cpp:796 via carvera.ts): subtracts
 * whole turns ONLY while |work-A| is strictly > 360 — an exact ±360 pile
 * lands AT ±360, not 0. Kept in exact lockstep with the post's shrinkA.
 */
function shrinkA(a: number): number {
  let v = a;
  while (Math.abs(v) > 360 + 1e-9) v -= Math.sign(v) * 360;
  return v;
}

/** G codes that select motion (0 rapid / 1 feed / 2-3 arc). */
const MOTION_G = new Set([0, 1, 2, 3]);

/** Non-motion G codes consumed silently. 4 = dwell (its TIME is not
 *  modeled — the Move IR has no dwell form); 17-19 plane selects; 21 mm;
 *  28 park; 90 absolute; 93/94 feed modes (handled with state). */
const PASS_G = new Set([4, 17, 18, 19, 21, 28, 90, 94, 93]);

/** M codes consumed without moves. 2/30 program end, 3 spindle/beam on,
 *  4-9 spindle/coolant/air-assist no-ops, 321/322 laser module on/off,
 *  323/324 laser test fire. */
const PASS_M = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 30, 321, 322, 323, 324]);

/** M400-family machine-setup codes (docs/makera-dialect.md "M-codes
 *  relevant to jobs"): probing/4th-axis calibration and overrides. None of
 *  them produce cutting motion. Sub-codes (M465.1, M469.4 …) match on the
 *  integer base. */
const SETUP_M = new Set([465, 469, 493, 495, 887, 959]);

/**
 * Tokenize an instruction into letter→number words, allowing repeated
 * letters (a G-code line may carry several G words: `G90 G21`, `G0 G90`).
 * Multiple G/M words are collected; axis-type words must be unique —
 * `G1 X1 X2` is a malformed line and a loud error, never a guess.
 * Anything that is not a word or whitespace is a loud error (a mangled
 * line must never parse as a partial move).
 */
function words(
  instruction: string,
  context: string,
): { single: Map<string, number>; g: number[]; m: number[] } {
  const single = new Map<string, number>();
  const g: number[] = [];
  const m: number[] = [];
  const re = /([A-Z])(-?(?:\d+\.?\d*|\.\d+))/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(instruction)) !== null) {
    const gap = instruction.slice(consumed, match.index);
    if (gap.trim() !== '') {
      throw new Error(`ncParser: unrecognized text "${gap.trim()}" — line: "${context}"`);
    }
    consumed = match.index + match[0].length;
    const letter = match[1];
    const value = parseFloat(match[2]);
    if (letter === 'G') {
      g.push(value);
    } else if (letter === 'M') {
      m.push(value);
    } else if (single.has(letter)) {
      throw new Error(`ncParser: duplicate ${letter} word — line: "${context}"`);
    } else {
      single.set(letter, value);
    }
  }
  const tail = instruction.slice(consumed);
  if (tail.trim() !== '') {
    throw new Error(`ncParser: unrecognized text "${tail.trim()}" — line: "${context}"`);
  }
  return { single, g, m };
}

function fieldValue(parts: string[], key: string): string | null {
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === key) return part.slice(eq + 1);
  }
  return null;
}

export function parseCarveraNc(text: string): ParsedNc {
  const moves: Move[] = [];
  const ops: ParsedOp[] = [];
  /** toolpath number → name, from the header's ;@MKR|TOOLPATH lines */
  const opNames = new Map<number, string>();

  // modal state — the machine's running picture
  const pos = { x: 0, y: 0, z: 0, a: 0 };
  /** the emitted A words' frame: the parser emits words as a CONTINUOUS
   * physical θ (counter word + aOffset) so consecutive parsed moves'
   * deltas are the rotation the machine physically travels. Every
   * NO-MOTION counter adjustment (G92.4 shrink / plain re-anchor / the
   * residue pin) drops whole turns or re-states the counter WITHOUT
   * moving the axis — the raw words jump by the same turns, and a naive
   * raw emission turns a zero-travel re-anchor into a phantom 360°
   * revolution between two adjacent parsed moves (her spiral_test+polish
   * report, 2026-11-23: ~125 polish stances swept phantom feed turns and
   * the sim ate the model's middle as un-flagged "circular swipes").
   * `pos.a` STAYS the raw counter (the ParsedNc.finalA contract); the
   * offset shifts only what the emitted words say. Header forms (G92.4
   * A<deg> R0, G10 L20) keep the raw frame — no offset change. */
  let aOffset = 0;
  let mode: FeedMode = 'G94';
  let modalFeed: number | null = null; // last F word (null = none yet)
  let modalMotion: number | null = null; // last G0/G1/G2/G3 (null = none yet)
  let toolNumber = 0;
  let spindleState: number | undefined; // the running S<rpm> M3 value
  let pendingSpindle: number | null = null; // an S M3 awaiting its first move
  /** True while a laser op is open (M321..M322): its S words are beam
   *  power fractions, not spindle RPM. */
  let laserMode = false;
  /** The open toolpath (from the TOOLPATH_START marker), with a flag: the
   *  contract is that only the op's FIRST move carries the op tag. */
  let currentOp: { number: number; name: string } | null = null;
  let opStamped = true; // no current op → nothing to stamp
  const fail: (why: string, raw: string, line?: string) => never = (why, raw, line) => {
    throw new Error(`ncParser: ${why} — line: "${line ?? raw}"`);
  };

  /** Stamps spindle/op metadata (stampOp's contract: the op's FIRST move
   *  carries the tag) and appends. */
  const emit = (move: Move) => {
    const op = currentOp;
    const opFirst = op !== null && !opStamped;
    if (pendingSpindle !== null) {
      move.spindleRpm = pendingSpindle;
      pendingSpindle = null;
    } else if (opFirst && spindleState !== undefined) {
      // the post suppresses `S M3` when the speed is unchanged — recover
      // the modal value so the parsed move still knows its spindle
      move.spindleRpm = spindleState;
    }
    if (op !== null && opFirst) {
      move.op = { number: op.number, name: op.name, toolNumber };
      opStamped = true;
    }
    // emit A in the CONTINUOUS PHYSICAL frame (see aOffset's doc): the
    // counter word mapped through the accumulated no-motion-adjustment
    // offset, so consecutive moves' deltas are real rotation
    if (move.words.a !== undefined && aOffset !== 0) {
      move.words = { ...move.words, a: move.words.a + aOffset };
    }
    moves.push(move);
  };

  const doMotion = (code: number, w: Map<string, number>, raw: string) => {
    for (const letter of w.keys()) {
      if ('XYZAFS'.includes(letter)) continue;
      if ((code === 2 || code === 3) && (letter === 'I' || letter === 'J')) continue;
      fail(`unsupported word "${letter}" on a motion line`, raw);
    }
    const axis: AxisWords = {};
    if (w.has('X')) axis.x = w.get('X')!;
    if (w.has('Y')) axis.y = w.get('Y')!;
    if (w.has('Z')) axis.z = w.get('Z')!;
    if (w.has('A')) axis.a = w.get('A')!;
    const hasAxis =
      axis.x !== undefined || axis.y !== undefined || axis.z !== undefined || axis.a !== undefined;
    const fWord = w.get('F');
    const sWord = w.get('S');

    if (code === 0) {
      // G0 never fires the beam and takes no F — an F word on a rapid only
      // updates the modal value
      if (fWord !== undefined) modalFeed = fWord;
      if (!hasAxis) return; // bare G0: modal set, nothing to emit
      const move: Move = { words: axis, feed: 0, rapid: true };
      if (sWord !== undefined) move.power = sWord;
      emit(move);
    } else if (code === 2 || code === 3) {
      if (mode === 'G93') {
        fail('arc during G93 — the Move IR has no inverse-time arc form', raw);
      }
      if (w.has('R')) {
        fail('R-form arc — the firmware never parses R as a radius (silent no-op)', raw);
      }
      if (!w.has('I') && !w.has('J')) {
        fail('arc without I/J — radius 0, the firmware silently drops it', raw);
      }
      if (axis.a !== undefined) {
        fail('A-coordinated arc — no IR representation (arcs are G94-only)', raw);
      }
      const move: Move = {
        words: axis,
        feed: fWord !== undefined ? fWord : (modalFeed ?? 0),
        arc: { i: w.get('I') ?? 0, j: w.get('J') ?? 0, cw: code === 2 },
      };
      if (sWord !== undefined) move.power = sWord;
      emit(move);
    } else {
      if (fWord !== undefined) {
        if (fWord < 0) fail('negative F word', raw);
        modalFeed = fWord;
      } else if (hasAxis && mode === 'G93') {
        // the hard community-firmware rule: while G93 is active every G1
        // line must carry F or the machine HALTS
        fail('G93 feed line without F — the firmware halts on it', raw);
      }
      const move: Move = {
        words: axis,
        feed: fWord !== undefined ? fWord : (modalFeed ?? 0),
      };
      if (sWord !== undefined) move.power = sWord;
      emit(move);
    }
    if (axis.x !== undefined) pos.x = axis.x;
    if (axis.y !== undefined) pos.y = axis.y;
    if (axis.z !== undefined) pos.z = axis.z;
    if (axis.a !== undefined) pos.a = axis.a;
  };

  const doG924 = (w: Map<string, number>, raw: string) => {
    for (const letter of w.keys()) {
      if (!'ARS'.includes(letter)) fail(`unsupported word "${letter}" on G92.4`, raw);
    }
    const aVal = w.get('A');
    if (aVal === undefined) fail('G92.4 without an A word', raw);
    const hasR = w.has('R');
    const hasS = w.has('S');
    if (hasR && hasS) fail('G92.4 with both R and S words', raw);
    const c = pos.a; // the counter BEFORE this adjustment
    if (hasS) {
      pos.a = shrinkA(c); // shrink: whole turns off the CURRENT counter
    } else {
      // R form (rotate to the mod-360 spoke, counter = deg) and the plain
      // counter reset land the same tracked work-coordinate A
      pos.a = aVal;
    }
    // the physical-frame offset (see aOffset's doc): every NO-MOTION
    // counter adjustment re-states what the unchanged physical position
    // is CALLED — shift the mapping by exactly the re-statement so the
    // words after it stay physically continuous. Physical θ of the
    // counter c was c + aOffset; the new counter must map to the same
    // θ. The R form physically rotates (header datum); the words continue
    // in the new frame — no offset change there.
    if (hasS) {
      aOffset += c - shrinkA(c);
    } else if (!hasR) {
      aOffset += c - aVal;
    }
  };

  /** `G10 L20 P0 A<deg>` — the prep header's angular-zero establishment:
   *  re-zeroes the work-coordinate system's A at the current physical
   *  spoke. No motion. */
  const doG10 = (w: Map<string, number>, raw: string) => {
    for (const letter of w.keys()) {
      if (!'LPA'.includes(letter)) fail(`unsupported word "${letter}" on G10`, raw);
    }
    const l = w.get('L');
    if (l === undefined) fail('G10 without an L word', raw);
    if (l !== 20) {
      fail(`unsupported G10 form (L${l} — only L20, the rotary datum set, is handled)`, raw);
    }
    const a = w.get('A');
    if (a === undefined) fail('G10 L20 without an A word', raw);
    pos.a = a; // the WCS re-zeroes A at the current physical spoke
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith(';')) {
      if (line.startsWith(';@MKR|')) {
        const parts = line.slice(';@MKR|'.length).split('|');
        const tag = parts[0];
        if (tag === 'TOOLPATH_START') {
          const numStr = fieldValue(parts, 'toolpath_number');
          if (numStr === null) fail('TOOLPATH_START without toolpath_number', line);
          const number = parseFloat(numStr);
          const name = opNames.get(number) ?? '';
          currentOp = { number, name };
          opStamped = false;
          ops.push({ number, name });
        } else if (tag === 'TOOLPATH') {
          const num = fieldValue(parts, 'number');
          const name = fieldValue(parts, 'name');
          if (num !== null && name !== null) opNames.set(parseFloat(num), name);
        }
        // TOOL / BEGIN / SCHEMA / MACHINE / MATERIAL / STOCK / ORIGIN /
        // CAM / UNIT / MAXFEEDRATE / TIME / END — metadata, consumed
      }
      continue;
    }

    // strip parens comments (the firmware is not close-paren aware), then
    // the inline ;-comment
    let instruction = line.replace(/\([^)]*\)/g, ' ');
    const openParen = instruction.indexOf('(');
    if (openParen >= 0) instruction = instruction.slice(0, openParen);
    const semi = instruction.indexOf(';');
    if (semi >= 0) instruction = instruction.slice(0, semi);
    instruction = instruction.trim().toUpperCase();
    if (!instruction) continue;

    const { single: w, g: gs, m: ms } = words(instruction, line);
    const hasT = w.has('T');
    const hasAxisAny = w.has('X') || w.has('Y') || w.has('Z') || w.has('A');
    let motionRan = false;

    if (gs.includes(92.4)) {
      if (gs.length > 1) fail('G92.4 combined with other G codes', line);
      doG924(w, line);
    } else {
      let g10Ran = false;
      for (const g of gs) {
        if (MOTION_G.has(g)) {
          modalMotion = g;
        } else if (g === 93) {
          mode = 'G93';
          modalFeed = null; // the post re-emits F after every mode change
        } else if (g === 94) {
          mode = 'G94';
          modalFeed = null;
        } else if (g === 20) {
          fail('G20 imperial units — the firmware hard-halts on it', line);
        } else if (g === 91) {
          fail('G91 incremental — not in the dialect; refusing rather than guessing', line);
        } else if (g === 10) {
          doG10(w, line);
          g10Ran = true;
        } else if (g === 28 && hasAxisAny) {
          fail('G28 with axis words (park-to-coordinate) is not handled', line);
        } else if (g === 4 && hasAxisAny) {
          fail('G4 with axis words (axis dwell) is not handled', line);
        } else if (PASS_G.has(g)) {
          // consume
        } else {
          fail(`unsupported G-code G${g}`, line);
        }
      }
      if (g10Ran) {
        // G10 L20 consumed the line's words (a datum set, no motion)
      } else {
        // a bare S word (no axis, no I/J) rides its M3, never motion
        const needsMotion =
          hasAxisAny || w.has('I') || w.has('J') || (w.has('S') && ms.length === 0);
        if (needsMotion) {
          if (modalMotion === null) {
            fail(
              'motion words with no G0/G1/G2/G3 on the line or any earlier one — ' +
                'the cut/rapid choice would be a guess',
              line,
            );
          }
          doMotion(modalMotion, w, line);
          motionRan = true;
        } else if (w.has('F')) {
          modalFeed = w.get('F')!; // a bare F line: modal update only
        }
      }
    }

    for (const m of ms) {
      if (m === 3) {
        const s = w.get('S');
        if (s !== undefined) {
          spindleState = s;
          pendingSpindle = s; // stamp the first move it precedes
        } else if (laserMode) {
          // a bare M3 in laser mode: the beam arm (post-fired after the
          // focus descent) — no new information
        }
      } else if (m === 321) {
        laserMode = true;
        spindleState = undefined; // laser ops carry no spindle
        pendingSpindle = null;
      } else if (m === 322) {
        laserMode = false;
      } else {
        // M400-family machine setup (probe/datum/calibration — M465.x,
        // M469.x, M493.x, M495, M887, M959): never cutting motion. An
        // EXPLICIT allowlist, not a blanket range — an unknown M999 must
        // throw, not vanish into "some setup code".
        const setupBase = Math.floor(m);
        if (!PASS_M.has(m) && !SETUP_M.has(setupBase)) {
          fail(`unsupported M-code M${m}`, line);
        }
      }
    }

    if (hasT) toolNumber = Math.floor(w.get('T')!);

    // a line that executed no motion must carry only setup words
    if (!motionRan && !gs.includes(92.4) && !gs.includes(10)) {
      for (const letter of w.keys()) {
        if (!'TSF'.includes(letter)) {
          fail(`unexpected word "${letter}" on a non-motion line`, line);
        }
      }
    }
  }

  return { moves, ops, finalA: pos.a };
}
