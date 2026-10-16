import { describe, expect, it } from 'vitest';
import { MAKERA_TOOLS } from '../makeraTools.generated';
import type { Tool } from '../types';

describe('imported Makera tool library', () => {
  it('imports a substantial library', () => {
    expect(MAKERA_TOOLS.length).toBeGreaterThanOrEqual(120);
  });

  it('has unique ids and well-formed entries', () => {
    const ids = new Set<string>();
    for (const t of MAKERA_TOOLS) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.diameter).toBeGreaterThan(0);
      expect(t.spindleRpm).toBeGreaterThan(0);
    }
  });

  it('maps Fusion categories onto our tool types', () => {
    const types = new Set(MAKERA_TOOLS.map((t) => t.type));
    for (const expected of ['ball', 'flat', 'drill', 'vbit', 'threadmill', 'corn'] as const) {
      expect(types.has(expected), `no ${expected} imported`).toBe(true);
    }
    expect(types.has('bull')).toBe(false); // Makera ships no corner-radius bits
  });

  it('gives vbits an included angle and tip diameter', () => {
    const vbits = MAKERA_TOOLS.filter((t) => t.type === 'vbit');
    expect(vbits.length).toBeGreaterThan(0);
    for (const t of vbits) {
      expect(t.vAngle).toBeGreaterThan(0);
      expect(t.tipDiameter).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives drills a point angle and threadmills a pitch', () => {
    for (const t of MAKERA_TOOLS) {
      if (t.type === 'drill') expect(t.drillPointAngle).toBeGreaterThan(0);
      if (t.type === 'threadmill') expect(t.pitch).toBeGreaterThan(0);
    }
  });

  it('keeps every entry assignable to the core Tool model', () => {
    for (const t of MAKERA_TOOLS) {
      const tool: Tool = t;
      expect(tool).toBeDefined();
    }
  });

  it('assigns every tool a listing sub-type', () => {
    for (const t of MAKERA_TOOLS) {
      expect(t.subtype?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('imports Makera per-material cutting presets where present', () => {
    const withPresets = MAKERA_TOOLS.filter((t) => t.presets);
    expect(withPresets.length).toBeGreaterThan(50);
    for (const t of withPresets) {
      for (const p of t.presets!) {
        expect(p.feed).toBeGreaterThan(0);
        expect(p.plungeFeed).toBeGreaterThan(0);
        expect(p.stepDown).toBeGreaterThanOrEqual(0);
      }
    }
  });
});