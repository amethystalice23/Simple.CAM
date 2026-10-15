import { describe, expect, it } from 'vitest';
import { MATERIALS, getMaterial } from '../materials';
import type { Tool } from '../types';

const toolTypes: Tool['type'][] = ['flat', 'ball', 'bull', 'vbit', 'drill', 'threadmill'];

describe('material presets', () => {
  it('has unique ids', () => {
    const ids = MATERIALS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every tool type with positive feed and depth of cut', () => {
    for (const m of MATERIALS) {
      for (const t of toolTypes) {
        expect(m.feedByTool[t], `${m.id} feed for ${t}`).toBeGreaterThan(0);
        expect(m.stepDownByTool[t], `${m.id} step-down for ${t}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps plunge feeds as a sane fraction of cut feeds', () => {
    for (const m of MATERIALS) {
      expect(m.plungeFraction).toBeGreaterThan(0);
      expect(m.plungeFraction).toBeLessThanOrEqual(1);
    }
  });

  it('looks up presets by id and rejects unknown ids', () => {
    expect(getMaterial('aluminum-6061').name).toBe('Aluminum 6061');
    expect(() => getMaterial('unobtanium')).toThrow();
  });
});