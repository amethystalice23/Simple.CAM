import { describe, expect, it } from 'vitest';
import type { Move } from '../../core/types';
import { postCarvera } from '../../post/carvera';
import {
  allIncluded,
  assignToolNumbers,
  buildExportFilename,
  clampToolNumber,
  condensedMinutes,
  countToolChanges,
  formatTimestamp,
  includeUnblocked,
  safeNamePart,
  sanitizeFilename,
  setToolNumber,
  stampOp,
  toggleAllIncluded,
} from '../exportDialog';

/** Minimal move fixture: fields the stamp must preserve. */
function mv(words: Move['words'] = { x: 0 }, extra: Partial<Move> = {}): Move {
  return { words, feed: 100, ...extra };
}

describe('assignToolNumbers', () => {
  it('groups ops by toolId and numbers tools 1, 2, 3… in first-use order', () => {
    // ops in job order using tools: flat6, drill3, flat6, vbit
    const nums = assignToolNumbers(['flat6', 'drill3', 'flat6', 'vbit']);
    expect(nums.get('flat6')).toBe(1);
    expect(nums.get('drill3')).toBe(2);
    expect(nums.get('vbit')).toBe(3);
    expect(nums.size).toBe(3);
  });

  it('returns an empty map for no checked ops', () => {
    expect(assignToolNumbers([]).size).toBe(0);
  });

  it('keeps numbers stable when ops are unchecked — they do not collapse', () => {
    // tool 1 was used by the now-unchecked ops; the rest must NOT renumber
    const prev = new Map([
      ['t1', 1],
      ['t2', 2],
      ['t3', 3],
    ]);
    const next = assignToolNumbers(['t2', 't3'], prev);
    expect(next.get('t2')).toBe(2);
    expect(next.get('t3')).toBe(3);
    // the unchecked tool keeps its number too (re-checking gets it back)
    expect(next.get('t1')).toBe(1);
  });

  it('fills the smallest unused integer for a newly checked tool', () => {
    const prev = new Map([
      ['a', 7], // user hand-edited this one
      ['b', 2],
    ]);
    const next = assignToolNumbers(['a', 'b', 'c'], prev);
    expect(next.get('a')).toBe(7);
    expect(next.get('b')).toBe(2);
    expect(next.get('c')).toBe(1); // the hole left by the edit
  });
});

describe('setToolNumber', () => {
  it('clamps edits to integers ≥ 1 and updates only that tool', () => {
    const prev = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(setToolNumber(prev, 'a', 0).get('a')).toBe(1);
    expect(setToolNumber(prev, 'a', 2.7).get('a')).toBe(3);
    expect(setToolNumber(prev, 'a', -5).get('a')).toBe(1);
    expect(setToolNumber(prev, 'a', Number.NaN).get('a')).toBe(1);
    const next = setToolNumber(prev, 'a', 9);
    expect(next.get('b')).toBe(2); // siblings untouched
    expect(prev.get('a')).toBe(1); // inputs never mutated
  });

  it('clampToolNumber rounds and floors at 1', () => {
    expect(clampToolNumber(1)).toBe(1);
    expect(clampToolNumber(2.4)).toBe(2);
    expect(clampToolNumber(2.5)).toBe(3);
    expect(clampToolNumber(-1)).toBe(1);
  });
});

describe('stampOp', () => {
  it('tags the first move with the op number, name, and tool number', () => {
    const first = mv({ x: 1 }, { spindleRpm: 12000 });
    const second = mv({ x: 2 });
    const out = stampOp([first, second], 2, 'Pocket', 3);
    expect(out[0].op).toEqual({ number: 2, name: 'Pocket', toolNumber: 3 });
    expect(out[0].spindleRpm).toBe(12000); // the generator's stamp survives
    expect(out[0]).not.toBe(first); // first move copied, never mutated
    expect(first.op).toBeUndefined();
    expect(out[1]).toBe(second); // the rest pass through untouched
  });

  it('replaces an existing op tag instead of stacking', () => {
    const first = mv({ x: 1 }, { op: { number: 9, name: 'old', toolNumber: 9 } });
    const out = stampOp([first], 1, 'Drill', 4);
    expect(out[0].op).toEqual({ number: 1, name: 'Drill', toolNumber: 4 });
  });

  it('returns an empty list for an op with no moves', () => {
    expect(stampOp([], 1, 'Pocket', 1)).toEqual([]);
  });

  it('drives the post to emit toolpath markers and T<n> M6 tool changes', () => {
    // the export dialog's exact pipeline: flatMap stamped ops in order,
    // tools + parallel controller numbers in first-use order. Each op's
    // first move carries its spindle speed, like the real generators.
    const cut = (x: number, z: number, spindleRpm?: number): Move => ({
      words: { x, z },
      feed: 100,
      ...(spindleRpm !== undefined ? { spindleRpm } : {}),
    });
    const moves = [
      ...stampOp([cut(0, 0, 18000), cut(10, -1)], 1, 'Pocket', 2),
      ...stampOp([cut(5, 0, 10000), cut(5, -2)], 2, 'Drill', 1),
    ];
    const tools = [
      { id: 'drill', name: 'Drill 3.5', type: 'drill' as const, diameter: 3.5, spindleRpm: 10000 },
      { id: 'flat', name: 'Flat 6', type: 'flat' as const, diameter: 6, spindleRpm: 18000 },
    ];
    const nc = postCarvera({ moves, tools, toolNumbers: [1, 2] });
    expect(nc).toContain(';@MKR|TOOLPATH_START|toolpath_number=1');
    expect(nc).toContain(';@MKR|TOOLPATH_START|toolpath_number=2');
    // op 1 cuts with T2, op 2 with T1 — both change blocks appear in order
    expect(nc).toContain('; T2-Flat 6');
    expect(nc).toContain('T2 M6');
    expect(nc).toContain('; T1-Drill 3.5');
    expect(nc).toContain('T1 M6');
    expect(nc.indexOf('T2 M6')).toBeLessThan(nc.indexOf('T1 M6'));
    expect(nc).toContain('M5'); // spindle stops between the two tools
  });
});

describe('formatTimestamp / safeNamePart', () => {
  it('formats local time as YYYYMMDDHHmmss', () => {
    expect(formatTimestamp(new Date(2026, 9, 21, 12, 34, 56))).toBe('20261021123456');
    expect(formatTimestamp(new Date(2026, 0, 3, 4, 5, 6))).toBe('20260103040506');
  });

  it('makes a label fragment file-name safe', () => {
    expect(safeNamePart('Pocket')).toBe('Pocket');
    expect(safeNamePart('Face cylinder (4-axis)')).toBe('Face-cylinder-4-axis');
    expect(safeNamePart('Ø10 hole')).toBe('10-hole');
  });
});

describe('condensedMinutes', () => {
  it('condenses to m under an hour and h+mm over it, never below 1m', () => {
    expect(condensedMinutes(0)).toBe('1m');
    expect(condensedMinutes(0.4)).toBe('1m');
    expect(condensedMinutes(42)).toBe('42m');
    expect(condensedMinutes(60)).toBe('1h0m');
    expect(condensedMinutes(83)).toBe('1h23m');
    expect(condensedMinutes(83.4)).toBe('1h23m');
    expect(condensedMinutes(1440)).toBe('24h0m');
  });
});

describe('buildExportFilename', () => {
  const NOW = new Date(2026, 9, 21, 12, 34, 56);

  it('builds <model>_<TOP>_<time>_<stamp>.nc for a 3-axis job with a model', () => {
    expect(
      buildExportFilename({ modelName: 'bracket.stl', minutes: 65, axisMode: '3-axis', now: NOW }),
    ).toBe('bracket_TOP_1h5m_20261021123456.nc');
  });

  it('uses MULT for 4-axis and job without a model', () => {
    expect(
      buildExportFilename({ modelName: null, minutes: 83, axisMode: '4-axis', now: NOW }),
    ).toBe('job_MULT_1h23m_20261021123456.nc');
  });

  it('spaces become dashes and only the LAST extension is stripped; inner dots survive', () => {
    expect(
      buildExportFilename({ modelName: 'mesh 1.stl', minutes: 2, axisMode: '3-axis', now: NOW }),
    ).toBe('mesh-1_TOP_2m_20261021123456.nc');
    expect(
      buildExportFilename({ modelName: 'v2.rev.stl', minutes: 2, axisMode: '3-axis', now: NOW }),
    ).toBe('v2.rev_TOP_2m_20261021123456.nc');
  });

  it('always produces a name sanitizeFilename accepts unchanged', () => {
    const name = buildExportFilename({
      modelName: 'weird (name).stl',
      minutes: 7.5,
      axisMode: '4-axis',
      now: NOW,
    });
    expect(sanitizeFilename(name)).toBe(name);
  });
});

describe('sanitizeFilename', () => {
  it('keeps [A-Za-z0-9._+-] and appends .nc when missing', () => {
    expect(sanitizeFilename('job.nc')).toBe('job.nc');
    expect(sanitizeFilename('my file')).toBe('myfile.nc');
    expect(sanitizeFilename('UPPER-lower_1.2+3')).toBe('UPPER-lower_1.2+3.nc');
    expect(sanitizeFilename('part.txt')).toBe('part.txt.nc');
  });

  it('strips path separators and other unsafe characters', () => {
    expect(sanitizeFilename('foo/bar.nc')).toBe('foobar.nc');
    expect(sanitizeFilename('x:\\y.nc')).toBe('xy.nc');
    expect(sanitizeFilename('weird?.nc<>')).toBe('weird.nc');
    expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd.nc');
  });

  it('normalizes the .nc suffix and never produces an empty name', () => {
    expect(sanitizeFilename('x.NC')).toBe('x.nc');
    expect(sanitizeFilename('.nc')).toBe('job.nc');
    expect(sanitizeFilename('')).toBe('job.nc');
    expect(sanitizeFilename('???')).toBe('job.nc');
  });
});
describe('includeUnblocked', () => {
  const ops = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('a blocked op that becomes exportable joins the export', () => {
    // 'b' was errored (checkbox disabled); recalc from the dialog succeeded
    const { checked, blocked } = includeUnblocked(
      new Set(['a']),
      new Set(['b', 'd']),
      ops,
      (id) => id !== 'd', // b is now exportable, d still not
    );
    expect([...checked].sort()).toEqual(['a', 'b']);
    expect([...blocked]).toEqual(['d']);
  });

  it('never touches an op the user actually chose', () => {
    // 'c' was exportable all along and the user unchecked it — stays out
    const { checked } = includeUnblocked(
      new Set(['a']),
      new Set(['b']),
      ops,
      () => true,
    );
    expect(checked.has('c')).toBe(false);
    expect([...checked].sort()).toEqual(['a', 'b']);
  });

  it('an error→ok round trip after the first success no longer auto-checks', () => {
    // 'b' unblocked once (user now owns the choice), errors again, then ok
    const first = includeUnblocked(new Set(), new Set(['b']), ops, () => true);
    const second = includeUnblocked(
      first.checked,
      first.blocked,
      ops,
      () => true,
    );
    expect(second.checked.has('b')).toBe(true); // still checked — user choice now
    // user unchecks it, then it errors and succeeds again — must stay out
    const unchecked = new Set(first.checked);
    unchecked.delete('b');
    const third = includeUnblocked(unchecked, second.blocked, ops, () => true);
    expect(third.checked.has('b')).toBe(false);
  });

  it('blocked ops that stay blocked change nothing', () => {
    const { checked, blocked } = includeUnblocked(
      new Set(['a']),
      new Set(['b']),
      ops,
      (id) => id === 'a',
    );
    expect([...checked]).toEqual(['a']);
    expect([...blocked]).toEqual(['b']);
  });
});

describe('allIncluded / toggleAllIncluded (select-all box)', () => {
  const exportable = ['a', 'b', 'c']; // 'd' is errored/empty — never tickable

  it('allIncluded is true only when every exportable op is checked', () => {
    expect(allIncluded(new Set(['a', 'b', 'c']), exportable)).toBe(true);
    expect(allIncluded(new Set(['a', 'b']), exportable)).toBe(false);
    expect(allIncluded(new Set(['a', 'b', 'c', 'd']), exportable)).toBe(true); // extras ignored
  });

  it('is false with nothing exportable (box renders unchecked and disabled)', () => {
    expect(allIncluded(new Set(), [])).toBe(false);
    expect(allIncluded(new Set(['a']), [])).toBe(false);
  });

  it('any excluded op → include every exportable op', () => {
    const next = toggleAllIncluded(new Set(['a']), exportable);
    expect([...next].sort()).toEqual(['a', 'b', 'c']);
  });

  it('nothing checked yet still counts as "excluded" → selects all', () => {
    const next = toggleAllIncluded(new Set(), exportable);
    expect([...next].sort()).toEqual(['a', 'b', 'c']);
  });

  it('all included → exclude everything', () => {
    const next = toggleAllIncluded(new Set(['a', 'b', 'c']), exportable);
    expect(next.size).toBe(0);
  });
});

describe('countToolChanges', () => {
  const nums = new Map([
    ['flat6', 1],
    ['vbit', 2],
    ['drill3', 3],
  ]);

  it('counts the initial load as a change, then one per switch', () => {
    expect(countToolChanges([{ toolId: 'flat6' }], nums)).toBe(1);
    // same tool throughout: just the one load
    expect(
      countToolChanges(
        [{ toolId: 'flat6' }, { toolId: 'flat6' }, { toolId: 'flat6' }],
        nums,
      ),
    ).toBe(1);
    // T1 T1 T2 T1: load, switch, switch back
    expect(
      countToolChanges(
        [{ toolId: 'flat6' }, { toolId: 'flat6' }, { toolId: 'vbit' }, { toolId: 'flat6' }],
        nums,
      ),
    ).toBe(3);
  });

  it('ops sharing a controller number do not prompt in between', () => {
    // two library tools the user numbered alike: no T M6 between them
    const aliased = new Map([
      ['flat6', 1],
      ['flat3', 1],
    ]);
    expect(countToolChanges([{ toolId: 'flat6' }, { toolId: 'flat3' }], aliased)).toBe(1);
  });

  it('is 0 with no ops and falls back to T1 for an unnumbered tool', () => {
    expect(countToolChanges([], nums)).toBe(0);
    expect(countToolChanges([{ toolId: 'unknown' }, { toolId: 'unknown' }], nums)).toBe(1);
  });
});
