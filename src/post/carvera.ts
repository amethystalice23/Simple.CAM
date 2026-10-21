/**
 * Carvera dialect post-processor: Move[] IR -> G-code text.
 *
 * Rules from the community firmware (docs/PLAN.md and docs/makera-dialect.md):
 *  - G93 (inverse time) for any move coordinating A with a linear axis;
 *    while G93 is active EVERY G1 line must carry F or the machine halts.
 *  - A accumulates past 360 for continuous rotation; emit `G92.4 A0 S0` after
 *    an A-using sequence to shrink the axis back to ±360.
 *  - G94 (mm/min) otherwise; M02 restores G94.
 *  - Header datum for 4th axis jobs uses `G92.4 A<deg> R0` to physically rotate
 *    and set the work-datum.
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
  toolNumbers?: number[];
  options?: Partial<PostOptions>;
}

const fmt = (v: number, digits: number): string => {
  // MakeraStudio formatting: ≤ 2 decimals, trailing zeros trimmed.
  // Negative zero is preserved (e.g., Z-0).
  const s = v.toFixed(digits);
  const trimmed = s.replace(/(\.\d*?[1-9])0+$/g, '$1').replace(/\.0+$/, '');
  return trimmed === '-0' ? '-0' : trimmed === '0' ? '0' : trimmed;
};

function toolComments(tools: Tool[], toolNumbers?: number[]): string[] {
  // Community Controller builds 3D tool meshes and M6 popups from 13 fields.
  // Order: number, id, name, type, handlediameter, sticklength, shoulderlength,
  // flutelength, diameter, tipdiameter, cornerradius, angle, halfAngle.
  return tools.map((t, i) => {
    const typeMap: Record<Tool['type'], string> = {
      flat: 'Flat End',
      ball: 'Ball Nose',
      bull: 'Bull Nose',
      vbit: 'V-Bit',
      drill: 'Drill',
      threadmill: 'Thread',
      corn: 'V-Bit', // Chamfer-style cutter
    };

    const parts = [
      `;@MKR|TOOL|number=${toolNumbers?.[i] ?? i + 1}`,
      `id=${t.id}`,
      `name=${t.name}`,
      `type=${typeMap[t.type]}`,
      `handlediameter=${fmt(t.shaftDiameter ?? t.diameter, 2)}`,
      `sticklength=0`,
      `shoulderlength=${fmt(t.fluteLength ?? 0, 2)}`,
      `flutelength=${fmt(t.fluteLength ?? 0, 2)}`,
      `diameter=${fmt(t.diameter, 2)}`,
      `tipdiameter=${fmt(t.tipDiameter ?? t.diameter, 2)}`,
      `cornerradius=${fmt(t.cornerRadius ?? 0, 2)}`,
      `angle=${fmt(t.vAngle ?? 0, 2)}`,
      `halfAngle=${fmt((t.vAngle ?? 0) / 2, 2)}`,
    ];
    return parts.join('|');
  });
}

function wordsLine(m: Move, withFeed: boolean): string {
  const w = m.words;
  const parts: string[] = [];
  if (w.x !== undefined) parts.push(`X${fmt(w.x, 2)}`);
  if (w.y !== undefined) parts.push(`Y${fmt(w.y, 2)}`);
  if (w.z !== undefined) parts.push(`Z${fmt(w.z, 2)}`);
  if (w.a !== undefined) parts.push(`A${fmt(w.a, 2)}`);
  if (withFeed) parts.push(`F${fmt(m.feed, 2)}`);
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
  lines.push(...toolComments(input.tools, input.toolNumbers));
  if (opts.prepHeader !== 'none' && anyA) {
    lines.push('; ---- prep assumptions (run in controller before this job) ----');
    lines.push(active('M465.1            ; 4th-axis stock leveling/twist via probe'));
    lines.push(active('G10 L20 P0 A0      ; establish angular zero'));
    lines.push(active('verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration'));
  }
  // TODO: Emit ;@MKR|TOOLPATH_START markers and per-op boundaries when IR supports them.
  lines.push('G90 G21');
  if (anyA) {
    lines.push('G92.4 A0 R0');
  }

  // ---- moves ----
  // holder object: TS narrowing of closure-mutated lets is unsound here
  const st: { mode: FeedMode; lastFeed: number; lastSpindle: number; lastOp?: Move['op'] } = {
    mode: 'G94',
    lastFeed: -1,
    lastSpindle: -1,
  };

  const setMode = (want: FeedMode) => {
    if (st.mode !== want) {
      lines.push(want);
      st.mode = want;
      st.lastFeed = -1; // F must be re-emitted after a mode change
    }
  };

  for (const m of input.moves) {
    // Handle toolpath transition markers and tool changes
    if (m.op) {
      const prevOp = st.lastOp;
      if (!prevOp || m.op.number !== prevOp.number) {
        // Op boundary
        lines.push(`;@MKR|TOOLPATH_START|toolpath_number=${m.op.number}`);
        lines.push('');

        // Tool change?
        const prevToolNum = prevOp?.toolNumber;
        const currentToolNum = m.op.toolNumber;

        if (!prevToolNum || currentToolNum !== prevToolNum) {
          // New tool. Spindle check for M5.
          if (st.lastSpindle !== -1) {
            lines.push('M5');
            lines.push('');
          }

          // Tool comment and T M6 block
          // Tool name is the one whose controller tool number matches m.op.toolNumber
          const toolIdx = input.tools.findIndex((_, i) => (input.toolNumbers?.[i] ?? i + 1) === currentToolNum);
          const toolName = toolIdx !== -1 ? input.tools[toolIdx].name : `T${currentToolNum}`;

          lines.push(`; T${currentToolNum}-${toolName}`);
          lines.push('');
          lines.push(`T${currentToolNum} M6`);
          lines.push('');

          // Reset spindle state to force S M3 re-emission even if RPM is unchanged
          st.lastSpindle = -1;
        }

        // m.op.name is reserved for future BEGIN..END header block
        st.lastOp = m.op;
      }
    }

    // spindle (re)start at the op boundary — Makera's own start syntax
    // `S<rpm> M3`, verified against their emitted programs (examples/).
    if (m.spindleRpm !== undefined && m.spindleRpm !== st.lastSpindle) {
      lines.push(`S${m.spindleRpm} M3`);
      st.lastSpindle = m.spindleRpm;
    }

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
  if (opts.wrapA && usedA) {
    lines.push('; shrink work-coordinate A back to ±360');
    lines.push('G92.4 A0 S0');
  }
  lines.push('M05');
  lines.push('G28');
  lines.push('M02');

  return lines.join('\n') + '\n';
}