import { describe, expect, it } from 'vitest';
import { faceCylinder, MAX_ROTARY_RPM, SAFE_CLEARANCE } from '../faceCylinder';
import type { FaceCylinderOp, Stock, Tool } from '../../core/types';
import { isSimultaneous } from '../../core/types';

const tool: Tool = {
  id: 't1',
  name: '6mm flat',
  type: 'flat',
  diameter: 6,
  spindleRpm: 18000,
};

const stock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 }, // Ø50 stock, axis at Z0
  materialId: 'aluminum-6061',
};

const op: FaceCylinderOp = {
  kind: 'faceCylinder',
  id: 'op1',
  toolId: 't1',
  targetDiameter: 40, // Ø40 target => 5mm radial depth
  xStart: 0,
  xEnd: 100,
  stepDown: 1,
  finishAllowance: 0.2, // rough to 4.8 => passes at 1,2,3,4 + finish at 5
  plungeFeed: 300,
  rotation: 'cw',
};

describe('faceCylinder', () => {
  const res = faceCylinder(op, stock, tool);

  it('schedules roughing passes plus one finishing pass', () => {
    expect(res.passes).toBe(5);
    expect(res.radialDepth).toBeCloseTo(5, 9);
    // 4 moves per pass: rapid to start, plunge, coordinated sweep, retract
    expect(res.moves.length).toBe(20);
  });

  it('plunges to the right Z per pass with helical (rotating) entry', () => {
    const plunges = res.moves.filter((m) => !m.rapid && m.words.z !== undefined && m.words.x === undefined);
    // surface at axisZ + r0 = 25; each pass steps 1mm radially below it
    expect(plunges.map((m) => m.words.z)).toEqual([24, 23, 22, 21, 20]);
    // G93 inverse time, A capped at the rotary limit over the 90° entry
    const entryMinutes = (90 / 360) / MAX_ROTARY_RPM;
    for (const p of plunges) {
      expect(p.words.a).toBeDefined();
      expect(p.feed).toBeCloseTo(1 / entryMinutes, 3);
    }
  });

  it('emits coordinated X+A sweeps in G93 form (feed = 1/passMinutes)', () => {
    const sweeps = res.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(sweeps.length).toBe(5);
    const revs = 100 / (0.8 * 6); // span / stepOver
    const passMinutes = revs / MAX_ROTARY_RPM;
    for (const s of sweeps) expect(s.feed).toBeCloseTo(1 / passMinutes, 4);
  });

  it('accumulates A continuously past 360 degrees, alternating sweep direction', () => {
    const sweeps = res.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    const perPass = (100 / 4.8) * 360 + 90; // 7500° sweep + 90° helical entry
    expect(sweeps[0].words.a).toBeCloseTo(perPass, 3);
    expect(sweeps[4].words.a).toBeCloseTo(5 * perPass, 3); // 37950
    expect(sweeps.map((s) => s.words.x)).toEqual([100, 0, 100, 0, 100]);
  });

  it('retracts to a safe Z above the surface between passes', () => {
    const retracts = res.moves.filter((m) => m.rapid && m.words.z !== undefined && m.words.x === undefined);
    expect(retracts.every((m) => m.words.z === 25 + SAFE_CLEARANCE)).toBe(true);
  });

  it('estimates rotation-rate-limited time honestly', () => {
    const passMinutes = 100 / 4.8 / MAX_ROTARY_RPM;
    const entryMinutes = (90 / 360) / MAX_ROTARY_RPM;
    expect(res.estimatedMinutes).toBeCloseTo(5 * (passMinutes + entryMinutes), 3);
  });

  it('rejects a target above stock diameter', () => {
    expect(() =>
      faceCylinder({ ...op, targetDiameter: 60 }, stock, tool),
    ).toThrowError(/not below stock radius/);
  });

  it('reverses A for ccw rotation', () => {
    const ccw = faceCylinder({ ...op, rotation: 'ccw' }, stock, tool);
    const sweeps = ccw.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(sweeps[0].words.a).toBeCloseTo(-(100 / 4.8) * 360 - 90, 3);
  });

  it('spiral pattern steps down in the cut instead of retracting', () => {
    const spiral = faceCylinder({ ...op, pattern: 'spiral' }, stock, tool);
    // zigzag: 4 moves per pass (rapid, approach, entry, sweep, retract... 4
    // cutting+rapid moves). spiral: 1 entry + per-pass (step-down + sweep),
    // no safe-Z retracts between passes, one retract at the very end.
    const safeRetracts = spiral.moves.filter(
      (m) => m.rapid && m.words.z === 25 + SAFE_CLEARANCE && m.words.x === undefined,
    );
    expect(safeRetracts.length).toBe(1); // only the final retract
    // no re-entry rapids after the first pass
    const entryRapids = spiral.moves.filter((m) => m.rapid && m.words.x !== undefined);
    expect(entryRapids.length).toBe(1); // the initial approach only
    // step-downs happen at the sweep ends: each carries Z + A, no X
    const stepDowns = spiral.moves.filter(
      (m) => !m.rapid && m.words.z !== undefined && m.words.a !== undefined && m.words.x === undefined,
    );
    expect(stepDowns).toHaveLength(5); // one per pass, same as zigzag entries
    // A accumulates continuously across the whole spiral
    const sweeps = spiral.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(sweeps[4].words.a).toBeCloseTo(5 * ((100 / 4.8) * 360 + 90), 3);
    // same cutting time: identical material removal, fewer rapids
    expect(spiral.estimatedMinutes).toBeCloseTo(res.estimatedMinutes, 6);
  });

  it('spiral respects the axial range', () => {
    const spiral = faceCylinder({ ...op, pattern: 'spiral', xStart: 10, xEnd: 90 }, stock, tool);
    const sweeps = spiral.moves.filter((m) => isSimultaneous(m) && !m.rapid && m.words.x !== undefined);
    expect(sweeps.map((s) => s.words.x)).toEqual([90, 10, 90, 10, 90]);
  });
});