/**
 * 3-axis thread milling — helical interpolation in machine XYZ with a
 * single-profile thread mill: no A, G94 throughout (PLAN.md ops table,
 * SPEC 2026-10-28). Internal AND external threads from one op type.
 *
 * Mill-tested ground truth: examples/MakeraStudioGHM9_Stage3_TOP…
 * `[T6]14ccw thread` — external M14×1 CCW cut with a Ø4.75 M6-form mill.
 * Their proven EXTERNAL cycle, reproduced here: approach outside the boss
 * at Rc + clearance → plunge beside the boss to the thread's BOTTOM
 * (plunge-fed through the face band — never rapid that leg) → RADIAL
 * feed in to Rc (no arc lead-in — the entry notch IS the bottom groove)
 * → ASCENDING helix, ~0.15mm chords, at the cut feed → straight rapid
 * up at the top (nothing stands above an external thread) → THE WHOLE
 * CYCLE RUNS TWICE (their spring pass = a full second identical pass).
 *
 * Path radius (tool TIPS land on the groove bottom):
 *  - external: tips at the ISO minor d3 → Rc = d3/2 + toolR − tolerance,
 *    d3 = nominal − 1.2268·pitch (ISO 724 external minor, root-arc-
 *    truncated — pins their X8.76 path to 3 decimals)
 *  - internal: tips at the major → Rc = nominal/2 + tolerance − toolR
 * Tolerance loosens the fit in both modes (deeper grooves), never the
 * thread depth — fit is radial with a full-form tool.
 *
 * INTERNAL cycle (no example exists — Alice's ruled design, 2026-10-28):
 * approach at the bore CENTER (the prep pocket cleared it — rapiding
 * inside is the documented contract), plunge to the thread bottom, radial
 * OUT to Rc, ascend. Retract per target from the aside room
 * (boreR − toolR): roomy → radial in to the center at feed (the exit
 * notch) then a straight lift; tight → FOLLOW THE SPIRAL OUT — keep the
 * helix going past the mouth until the form is clear of the face, needing
 * no radial room (a straight lift while engaged drags the tooth through
 * the threads; bore-sized Makera mills with ~10µm of room always exit
 * this way).
 *
 * Multi-start: lead = starts × pitch; start k enters at bottomZ + k·pitch
 * (groove k is groove 0 shifted up one pitch), each an ascending helix of
 * the same depth. Hand: left-hand ascends CW viewed from above (angle
 * decreasing — their "ccw" M14, pinned by the same file); right-hand
 * ascends CCW.
 */

import type { Move, ThreadMillOp, ThreadMillTarget, Tool, Vec2 } from '../core/types';
import { APPROACH_CLEARANCE } from './paths';

/** ISO 724 EXTERNAL minor factor: d3 = nominal − 1.2268·pitch
 * (root-arc-truncated; ground truth: M14×1 → their X8.76 path). */
export const D3_FACTOR = 1.2268;
/** ISO internal minor factor: d1 = nominal − 1.0825·pitch (the prep bore). */
export const D1_FACTOR = 1.0825;
/** Internal retract decision threshold, mm of aside room (boreR − toolR):
 * at least this much and the tool steps aside and lifts; less and it
 * follows the spiral out. */
export const ASIDE_MARGIN = 0.2;

/** Chord target per helix segment, mm (their file: 1°/segment at R8.76). */
const CHORD_MM = 0.15;
const SEGS_MIN = 64;
const SEGS_MAX = 512;

export interface ThreadMillResult {
  moves: Move[];
  /** full thread passes incl. the spring pass (one per target per cycle) */
  passes: number;
  /** cutting time estimate, minutes (excludes rapids) */
  estimatedMinutes: number;
  /** path radius of the FIRST target, mm — surfaced for the summary */
  pathRadius: number;
  /** per-target retract decisions + fit facts for the op summary */
  notes: string[];
}

/** ISO 724 external minor diameter, mm. */
export function externalMinorDiameter(nominalDiameter: number, pitch: number): number {
  return nominalDiameter - D3_FACTOR * pitch;
}

/** ISO internal minor diameter, mm — the prep bore the op recommends. */
export function internalMinorDiameter(nominalDiameter: number, pitch: number): number {
  return nominalDiameter - D1_FACTOR * pitch;
}

/** Tool-center path radius: external (tips at d3) / internal (tips at the major). */
export function pathRadius(
  nominalDiameter: number,
  pitch: number,
  toolR: number,
  tolerance: number,
  internal: boolean,
): number {
  return internal
    ? nominalDiameter / 2 + tolerance - toolR
    : externalMinorDiameter(nominalDiameter, pitch) / 2 + toolR - tolerance;
}

/** Helix segments per revolution for a 0.15mm chord, clamped 64–512. */
export function segmentsPerRevolution(rc: number): number {
  return Math.min(SEGS_MAX, Math.max(SEGS_MIN, Math.ceil((2 * Math.PI * rc) / CHORD_MM)));
}

export function threadMill(op: ThreadMillOp, tool: Tool): ThreadMillResult {
  if (op.targets.length === 0) throw new Error('thread milling needs at least one target');
  if (tool.type !== 'threadmill') {
    throw new Error('thread milling needs a thread mill — pick one from the tool library');
  }
  if (!(tool.diameter > 0)) throw new Error('the thread mill has no cutting diameter set');
  if (tool.pitch === undefined) {
    throw new Error(
      `the ${tool.name} has no pitch set — a thread mill is a single-profile tool; set its pitch in the library`,
    );
  }
  if (Math.abs(tool.pitch - op.pitch) > 1e-9) {
    throw new Error(
      `the ${tool.name} mills a ${tool.pitch}mm pitch — this op wants ${op.pitch}mm; ` +
        'pick the matching thread mill',
    );
  }
  if (!(op.pitch > 0)) throw new Error('pitch must be positive');
  if (!Number.isInteger(op.starts) || op.starts < 1) {
    throw new Error('starts must be a whole number ≥ 1');
  }
  if (op.tolerance < 0) throw new Error('tolerance must be ≥ 0');
  for (const t of op.targets) {
    if (!(t.depth > 0)) throw new Error('each target needs a positive thread depth');
  }
  if (!(op.feed > 0)) throw new Error('feed must be positive');
  if (!(op.plungeFeed > 0)) throw new Error('plunge feed must be positive');
  if (!(op.safeClearance > 0)) throw new Error('safe clearance must be positive');

  const toolR = tool.diameter / 2;
  const lead = op.starts * op.pitch;
  const dir = op.hand === 'left' ? -1 : 1; // left ascends CW from above (their ccw M14)
  // travel clearance between targets: the highest mouth + clearance
  const travelZ = Math.max(...op.targets.map((t) => t.topZ)) + op.safeClearance;

  const moves: Move[] = [];
  let minutes = 0;
  let passes = 0;
  const notes: string[] = [];
  let firstRc: number | null = null;

  op.targets.forEach((target: ThreadMillTarget, ti: number) => {
    const boreR = target.internal
      ? target.boreRadius && target.boreRadius > 0
        ? target.boreRadius
        : internalMinorDiameter(op.nominalDiameter, op.pitch) / 2
      : 0;

    if (target.internal) {
      if (toolR >= boreR) {
        throw new Error(
          `the Ø${tool.diameter} mill does not fit the Ø${(boreR * 2).toFixed(2)} bore — ` +
            'prep a larger bore or a slimmer mill',
        );
      }
      // the shank must reach the thread bottom when it oversizes the bore:
      // depth within the flute, minus one pitch of form room at the mouth
      const shank = tool.shaftDiameter ?? tool.diameter;
      const flute = tool.fluteLength ?? Infinity;
      if (shank > boreR * 2 && target.depth > flute - op.pitch) {
        throw new Error(
          `the Ø${shank} shank cannot enter the Ø${(boreR * 2).toFixed(2)} bore deeper than the ` +
            `${tool.fluteLength}mm flute — this thread is ${target.depth}mm; use a longer mill`,
        );
      }
    }

    const Rc = pathRadius(op.nominalDiameter, op.pitch, toolR, op.tolerance, target.internal);
    if (firstRc === null) {
      firstRc = Rc;
      notes.push(
        `path radius Rc ${Rc.toFixed(3)}mm — tips land on the groove bottom ` +
          `(${target.internal ? `internal, at the Ø${op.nominalDiameter} major` : `external, at the d3 minor Ø${externalMinorDiameter(op.nominalDiameter, op.pitch).toFixed(3)}`})`,
      );
    }
    const segs = segmentsPerRevolution(Rc);
    const bottomZ = target.topZ - target.depth;
    const asideRoom = boreR - toolR; // 0 external — irrelevant there
    // tight fit: less than a margin of aside room → follow the spiral out
    const spiralExit = target.internal && asideRoom < ASIDE_MARGIN;
    if (target.internal) {
      notes.push(
        spiralExit
          ? `Ø${(boreR * 2).toFixed(2)} bore → spiral exit — only ~${asideRoom.toFixed(3)}mm of aside room; ` +
              'a straight lift while engaged would drag the tooth through the threads (Alice, 2026-10-28)'
          : `Ø${(boreR * 2).toFixed(2)} bore → aside retract (${asideRoom.toFixed(2)}mm of room)`,
      );
    } else {
      notes.push(`Ø${op.nominalDiameter} boss → lifts straight off — nothing stands above an external thread`);
    }

    const at = (r: number, a: number): Vec2 => ({
      x: target.center.x + r * Math.cos(a),
      y: target.center.y + r * Math.sin(a),
    });
    const approach = at(Rc + op.safeClearance, 0); // external: outside the boss at angle 0
    const grooveStart = at(Rc, 0);
    const topSafeZ = target.topZ + op.safeClearance;

    if (ti > 0) {
      // between targets: lift to the travel clearance first, the next
      // approach's rapid then travels XY at height (axis-separate)
      moves.push({ words: { z: travelZ }, feed: 0, rapid: true, comment: 'travel clearance' });
    }

    // THE WHOLE CYCLE RUNS TWICE — the spring is a full second pass
    for (let cycle = 0; cycle < 2; cycle++) {
      const spring = cycle === 1;
      // approach: internal at the bore center, external outside the boss;
      // XY at the current height, then descend to the target's safe Z
      const approachPt = target.internal ? target.center : approach;
      moves.push({
        words: { x: approachPt.x, y: approachPt.y },
        feed: 0,
        rapid: true,
        comment: spring ? 'spring pass' : target.internal ? 'approach at the bore center' : 'approach',
      });
      moves.push({ words: { z: topSafeZ }, feed: 0, rapid: true });

      for (let k = 0; k < op.starts; k++) {
        const startZ = bottomZ + k * op.pitch; // groove k = groove 0 shifted up one pitch
        const endZ = startZ + target.depth;
        const lastStart = k === op.starts - 1;

        if (target.internal) {
          // the prep pocket cleared the bore — rapid inside it, feed the
          // last sliver to the groove bottom
          moves.push({ words: { z: startZ + APPROACH_CLEARANCE }, feed: 0, rapid: true });
          moves.push({
            words: { z: startZ },
            feed: op.plungeFeed,
            comment: 'plunge to the thread bottom',
          });
          minutes += APPROACH_CLEARANCE / op.plungeFeed;
        } else {
          // beside the boss the tips may graze the face annulus — the
          // mill-tested file plunge-feeds the whole leg; never rapid it
          moves.push({
            words: { z: startZ },
            feed: op.plungeFeed,
            comment: 'plunge to the thread bottom',
          });
          minutes += (topSafeZ - startZ) / op.plungeFeed;
        }

        // RADIAL ENTRY — no arc lead-in; the notch this cuts IS the bottom
        moves.push({
          words: { x: grooveStart.x, y: grooveStart.y },
          feed: op.feed,
          comment: 'radial entry',
        });
        minutes += (target.internal ? Rc : op.safeClearance) / op.feed;

        // ASCENDING HELIX: revs = depth/lead (fractional ends exactly at
        // the top), lead/rev — left-hand ascends CW from above, right CCW
        const revs = target.depth / lead;
        const n = Math.max(1, Math.round(revs * segs));
        let prev = grooveStart;
        let prevZ = startZ;
        for (let i = 1; i <= n; i++) {
          const frac = i / n;
          const a = dir * 2 * Math.PI * revs * frac;
          const z = startZ + target.depth * frac;
          const p = at(Rc, a);
          moves.push({ words: { x: p.x, y: p.y, z }, feed: op.feed });
          minutes += Math.hypot(p.x - prev.x, p.y - prev.y, z - prevZ) / op.feed;
          prev = p;
          prevZ = z;
        }

        if (target.internal) {
          if (spiralExit) {
            // FOLLOW THE SPIRAL OUT: keep the same hand/ascend past the
            // mouth until the form is clear — tip pitch + 0.5mm above the
            // face (one groove height + margin), ≤ 1 extra revolution
            const extraRevs = Math.min(1, (op.pitch + 0.5) / lead);
            const en = Math.max(1, Math.round(extraRevs * segs));
            for (let j = 1; j <= en; j++) {
              const frac = j / en;
              const a = dir * 2 * Math.PI * (revs + extraRevs * frac);
              const z = endZ + extraRevs * lead * frac;
              const p = at(Rc, a);
              moves.push({ words: { x: p.x, y: p.y, z }, feed: op.feed });
              minutes += Math.hypot(p.x - prev.x, p.y - prev.y, z - prevZ) / op.feed;
              prev = p;
              prevZ = z;
            }
            // in air above the face at the Rc orbit — straight lift is safe
            const exitZ = endZ + extraRevs * lead;
            moves.push({ words: { z: Math.max(topSafeZ, exitZ) }, feed: 0, rapid: true });
            if (!lastStart) {
              // next start re-enters from the center
              moves.push({
                words: { x: target.center.x, y: target.center.y },
                feed: 0,
                rapid: true,
                comment: `re-entering for start ${k + 2}/${op.starts}`,
              });
            }
          } else {
            // aside retract: radial in to the center at feed (crossing the
            // top groove — the exit notch), then a straight lift
            moves.push({
              words: { x: target.center.x, y: target.center.y },
              feed: op.feed,
              comment: lastStart ? 'aside retract' : 'step aside for the next start',
            });
            minutes += Rc / op.feed;
            moves.push({ words: { z: topSafeZ }, feed: 0, rapid: true });
          }
        } else {
          // external: nothing stands above the thread — straight lift,
          // then back out to the approach point for the next start/cycle
          moves.push({ words: { z: topSafeZ }, feed: 0, rapid: true });
          if (!lastStart) {
            moves.push({
              words: { x: approach.x, y: approach.y },
              feed: 0,
              rapid: true,
              comment: `re-entering for start ${k + 2}/${op.starts}`,
            });
          }
        }
      }
      passes++; // one full thread pass over every start, spring included
    }
  });

  return { moves, passes, estimatedMinutes: minutes, pathRadius: firstRc ?? 0, notes };
}
