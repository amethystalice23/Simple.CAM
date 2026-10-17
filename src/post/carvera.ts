/**
 * Carvera dialect post-processor: Move[] IR -> G-code text.
 *
 * Rules from the community firmware (docs/PLAN.md):
 *  - G93 (inverse time) for any move coordinating A with a linear axis;
 *    while G93 is active EVERY G1 line must carry F or the machine halts.
 *  - A accumulates past 360 for continuous rotation; emit `G92.4 A0` after
 *    an A-using sequence to wrap the axis back to 0-360.
 *  - G94 (mm/min) otherwise; M2/M30 restore G94.
 */

import type { FeedMode, Move, Tool } from '../core/types';
import { isSimultaneous } from '../core/types';

export interface PostOptions {
  /** emit G92.4 A0 after A-coordinating sequences (default true) */
  wrapA: boolean;
  /** emit the calibration-assumption header: 'comment' (default) | 'active' | 'none' */
  prepHeader: 'comment' | 'active' | 'none';
  jobName: string;
}

export interface PostInput {
  moves: Move[];
  tools: Tool[];
  options?: Partial<PostOptions>;
}

const fmt = (v: number, digits: number): string => {
  const s = v.toFixed(digits);
  return s === '-' + (0).toFixed(digits) ? (0).toFixed(digits) : s;
};

function toolComments(tools: Tool[]): string[] {
  // TODO(post): confirm the exact Makera Studio tool-comment format the
  // community controller parses (use the local notes on
  // reference/notes, or capture a real Makera export). Fusion-style
  // fallback below is readable by the controller per its viewer docs.
  return tools.map(
    (t, i) =>
      `; TOOL: T${i + 1} name="${t.name}" type=${t.type} diameter=${t.diameter.toFixed(3)}` +
      (t.tipDiameter !== undefined ? ` tip=${t.tipDiameter.toFixed(3)}` : '') +
      (t.vAngle !== undefined ? ` angle=${t.vAngle}deg` : '') +
      ` spindle=${t.spindleRpm}rpm`,
  );
}

function wordsLine(m: Move, withFeed: boolean): string {
  const w = m.words;
  const parts: string[] = [];
  if (w.x !== undefined) parts.push(`X${fmt(w.x, 3)}`);
  if (w.y !== undefined) parts.push(`Y${fmt(w.y, 3)}`);
  if (w.z !== undefined) parts.push(`Z${fmt(w.z, 3)}`);
  if (w.a !== undefined) parts.push(`A${fmt(w.a, 3)}`);
  if (withFeed) parts.push(`F${fmt(m.feed, 4)}`);
  return parts.join(' ');
}

export function postCarvera(input: PostInput): string {
  const opts: PostOptions = {
    wrapA: true,
    prepHeader: 'comment',
    jobName: 'job',
    ...input.options,
  };
  const lines: string[] = [];
  const active = (s: string) => (opts.prepHeader === 'active' ? s : `; ${s}`);

  // Pre-pass over the moves for rotary state, so the header can act on it:
  // anyA — any A word at all (even a pure-A index rapid): the job rides the
  // 4th axis and needs the prep-assumption header (an index-only job
  // depends on the angular zero and axis datum as much as a facing job).
  // usedA — anything that leaves A unwrapped: feed moves that turn A
  // (coordinated XYZ+A or the A-only rings of vertical facing) and
  // A-advancing positioning rapids (horizontal passes) — but NOT the pure-A
  // rapid of an Index op, which sets the datum on purpose.
  const anyA = input.moves.some((m) => m.words.a !== undefined);
  const usedA = input.moves.some((m) => {
    if (m.words.a === undefined) return false;
    const pureARapid =
      m.rapid && m.words.x === undefined && m.words.y === undefined && m.words.z === undefined;
    return !pureARapid;
  });

  // ---- header ----
  lines.push(`; simple.cam v0.0.1 — job "${opts.jobName}"`);
  lines.push(`; generated ${new Date().toISOString()}`);
  lines.push(...toolComments(input.tools));
  if (opts.prepHeader !== 'none' && anyA) {
    lines.push('; ---- prep assumptions (run in controller before this job) ----');
    lines.push(active('M465.1            ; 4th-axis stock leveling/twist via probe'));
    lines.push(active('G10 L20 P0 A0      ; establish angular zero'));
    lines.push(active('verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration'));
  }
  lines.push('G21 G90 G94');
  lines.push('G92.4 A0 S0');

  // ---- moves ----
  // holder object: TS narrowing of closure-mutated lets is unsound here
  const st: { mode: FeedMode; lastFeed: number } = { mode: 'G94', lastFeed: -1 };

  const setMode = (want: FeedMode) => {
    if (st.mode !== want) {
      lines.push(want);
      st.mode = want;
      st.lastFeed = -1; // F must be re-emitted after a mode change
    }
  };

  for (const m of input.moves) {
    const simultaneous = isSimultaneous(m);

    if (m.rapid) {
      lines.push(`G0 ${wordsLine(m, false)}${m.comment ? ` ; ${m.comment}` : ''}`);
      continue;
    }

    setMode(simultaneous ? 'G93' : 'G94');
    // In G93 the firmware REQUIRES F on every feed line — always emit it
    // there; in G94 emit on change for readability (harmless either way).
    const withFeed = st.mode === 'G93' || m.feed !== st.lastFeed;
    if (withFeed) st.lastFeed = m.feed;
    lines.push(`G1 ${wordsLine(m, withFeed)}${m.comment ? ` ; ${m.comment}` : ''}`);
  }

  // ---- footer ----
  if (st.mode === 'G93') lines.push('G94');
  if (opts.wrapA && usedA) lines.push('G92.4 A0 S0');
  lines.push('M30');

  return lines.join('\n') + '\n';
}