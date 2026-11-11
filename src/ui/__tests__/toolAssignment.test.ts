import { describe, expect, it } from 'vitest';
import type { JobOp } from '../../core/types';
import { panelToolNumbers } from '../toolAssignment';

/** minimal op fixture: kind + toolId is all the rule reads */
function op(kind: JobOp['kind'], toolId: string, id = `op-${toolId}-${kind}`): JobOp {
  return { id, kind, toolId } as JobOp;
}

describe('panelToolNumbers', () => {
  it('numbers distinct tools 1, 2, 3… in first-use order down the ops list', () => {
    const nums = panelToolNumbers([op('pocket', 'flat6'), op('drill', 'drill3'), op('profile', 'flat6')]);
    expect(nums.get('flat6')).toBe(1);
    expect(nums.get('drill3')).toBe(2);
    expect(nums.size).toBe(2);
  });

  it('renumbers by list order when op 1 is deleted (Alice: always renumber)', () => {
    const before = panelToolNumbers([op('pocket', 'a'), op('drill', 'b'), op('chamfer', 'c')]);
    expect([...before.values()]).toEqual([1, 2, 3]);
    const after = panelToolNumbers([op('drill', 'b'), op('chamfer', 'c')]);
    expect(after.get('b')).toBe(1);
    expect(after.get('c')).toBe(2);
  });

  it('skips index ops — they carry no tool and take no number', () => {
    const nums = panelToolNumbers([op('index', ''), op('faceCylinder', 'flat6')]);
    expect(nums.size).toBe(1);
    expect(nums.get('flat6')).toBe(1);
  });

  it('derives from toolIds alone — no stored state, a re-saved job re-derives identically', () => {
    const ops = [op('spiralCarve', 'vbit'), op('engrave', 'laser'), op('spiralCarve', 'vbit')];
    expect([...panelToolNumbers(ops).entries()]).toEqual([
      ['vbit', 1],
      ['laser', 2],
    ]);
  });
});
