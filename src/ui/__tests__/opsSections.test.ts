import { describe, expect, it } from 'vitest';
import { sectionEndIndex, sectionLabel, type SectionalOp } from '../opsSections';
import { IMPLICIT_FIXTURE_ID } from '../jobGeneration';

/** The ops list's fixture-section walks (the per-section add rows, Alice,
 *  2026-11-21): the panel renders its + Add row above `sectionEndIndex`, and
 *  App splices a new op there — these pins keep the two agreeing. */

describe('opsSections', () => {
  const op = (id: string): SectionalOp => ({ id, kind: 'pocket' });
  const fix = (id: string): SectionalOp => ({ id, kind: 'fixture' });

  describe('sectionLabel', () => {
    it('the implicit section is Fixture 1; real dividers count after it', () => {
      const ops = [op('a'), fix('d1'), op('b'), fix('d2'), op('c')];
      expect(sectionLabel(ops, IMPLICIT_FIXTURE_ID)).toBe('Fixture 1');
      expect(sectionLabel(ops, 'd1')).toBe('Fixture 2');
      expect(sectionLabel(ops, 'd2')).toBe('Fixture 3');
    });

    it('an empty list (or an unknown id) reads as the implicit Fixture 1', () => {
      expect(sectionLabel([], 'nope')).toBe('Fixture 1');
    });
  });

  describe('sectionEndIndex', () => {
    it('the implicit section ends at the first divider', () => {
      const ops = [op('a'), op('b'), fix('d1'), op('c')];
      expect(sectionEndIndex(ops, IMPLICIT_FIXTURE_ID)).toBe(2);
    });

    it('a mid-list section ends at the NEXT divider', () => {
      const ops = [op('a'), fix('d1'), op('b'), op('c'), fix('d2'), op('e')];
      expect(sectionEndIndex(ops, 'd1')).toBe(4);
    });

    it('the last section runs to the list end', () => {
      const ops = [op('a'), fix('d1'), op('b')];
      expect(sectionEndIndex(ops, 'd1')).toBe(3);
      expect(sectionEndIndex(ops, IMPLICIT_FIXTURE_ID)).toBe(1);
    });

    it('consecutive dividers: an empty section ends right above its own divider', () => {
      const ops = [fix('d0'), fix('d1'), op('b')];
      expect(sectionEndIndex(ops, 'd0')).toBe(1);
    });

    it('an empty list: every section ends at 0', () => {
      expect(sectionEndIndex([], IMPLICIT_FIXTURE_ID)).toBe(0);
    });
  });
});