import { describe, expect, it } from 'vitest';
import { simStepDownFor } from '../stepDown';
import type { JobOp } from '../../core/types';

/** minimal literals, narrowed per kind */
const op = (o: Partial<JobOp> & { kind: JobOp['kind'] }): JobOp =>
  ({ id: 'o', toolId: 't', featureIds: [], ...o }) as JobOp;

describe('simStepDownFor — the classifier’s per-op intended DOC', () => {
  it('drill: the peck increment', () => {
    expect(simStepDownFor(op({ kind: 'drill', depth: 5, peckDepth: 2 }))).toBe(2);
    expect(simStepDownFor(op({ kind: 'drill', depth: 5, peckDepth: 0 }))).toBe(0); // one plunge
  });

  it('threadMill: the FULL thread length — one axial pass by tool design', () => {
    // her 2026-10-28 report: a yellow wall at any step over, because the
    // moves were read against the 0.61mm form depth
    expect(simStepDownFor(op({ kind: 'threadMill', startDepth: 0, endDepth: 9.7 } as never))).toBe(
      9.7,
    );
    expect(simStepDownFor(op({ kind: 'threadMill', startDepth: 4, endDepth: 6 } as never))).toBe(2);
  });

  it('chamfer: the flank reach — the cone IS the intended cut (her 2026-10-28 report)', () => {
    // "a whole bunch of yellow warnings around the chamfer loops" — the
    // flank voxels read against the grid-pitch fallback painted every
    // honest dress yellow; the cone’s own geometry is the intended DOC
    expect(simStepDownFor(op({ kind: 'chamfer', mode: 'add', side: 'auto', direction: 'down', depth: 0.7 }))).toBe(0.7);
    expect(simStepDownFor(op({ kind: 'chamfer', mode: 'existing', side: 'inside', direction: 'up', depth: 0.5 }))).toBe(0.5);
  });

  it('the ladder ops carry their own stepDown; 0/absent → the kernel’s pitch fallback', () => {
    expect(simStepDownFor(op({ kind: 'pocket', stepDown: 1 } as never))).toBe(1);
    expect(simStepDownFor(op({ kind: 'pocket' } as never))).toBe(0);
    // index cuts nothing; finishingOnly never changes the DOC rule
    expect(simStepDownFor(op({ kind: 'index' }))).toBe(0);
  });
});