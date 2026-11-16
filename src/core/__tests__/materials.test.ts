import { describe, expect, it } from 'vitest';
import { MATERIALS, getMaterial, allMaterials, saveCustomMaterials, newCustomMaterialId, isCustomMaterialId } from '../materials';
import type { MaterialPreset, MaterialPreset as _MP } from '../materials';
import type { Tool } from '../types';

const toolTypes: Tool['type'][] = ['flat', 'ball', 'bull', 'vbit', 'drill', 'threadmill', 'corn'];

/** The customs store reads localStorage — stub it (node has none, and a
 * test must never see another test's leftovers). */
function stubStorage(store: Record<string, string> = {}) {
  const impl = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true });
  return () => { delete (globalThis as { localStorage?: unknown }).localStorage; };
}

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

describe('user-defined materials', () => {
  /** a full preset — the editor produces exactly this shape */
  const custom = (id: string, name: string): MaterialPreset => ({
    id,
    name,
    feedByTool: { flat: 700, bull: 700, ball: 800, vbit: 800, drill: 300, threadmill: 300, corn: 500, laser: 100 },
    stepDownByTool: { flat: 1, bull: 1, ball: 0.7, vbit: 0.4, drill: 3, threadmill: 0.2, corn: 0.4, laser: 0.5 },
    plungeFraction: 0.4,
  });

  it('customs list after the built-ins and resolve through getMaterial', () => {
    const restore = stubStorage();
    try {
      saveCustomMaterials([custom('user-my-brass', 'My brass')]);
      const all = allMaterials();
      expect(all.slice(0, MATERIALS.length).map((m) => m.id)).toEqual(MATERIALS.map((m) => m.id));
      expect(all).toHaveLength(MATERIALS.length + 1);
      expect(getMaterial('user-my-brass').name).toBe('My brass');
      // a second run re-reads storage (cache refreshed by save)
      expect(allMaterials()).toHaveLength(MATERIALS.length + 1);
    } finally {
      restore();
    }
  });

  it('saveCustomMaterials refuses to overwrite a built-in id', () => {
    const restore = stubStorage();
    try {
      const saved = saveCustomMaterials([custom('aluminum-6061', 'Fake aluminum')]);
      expect(saved).toHaveLength(0); // filtered out, built-ins immutable
      expect(getMaterial('aluminum-6061').name).toBe('Aluminum 6061');
    } finally {
      restore();
    }
  });

  it('newCustomMaterialId slugs, prefixes user-, and never collides', () => {
    const restore = stubStorage();
    try {
      const a = newCustomMaterialId('Brass 360! custom');
      expect(a).toBe('user-brass-360-custom');
      // dedup against stored customs
      saveCustomMaterials([custom(a, 'Brass 360! custom')]);
      expect(newCustomMaterialId('Brass 360! custom')).toBe('user-brass-360-custom-2');
      // built-in ids never collide either (they lack the user- prefix, but
      // the slug floor: a name that would slug to a built-in still prefixes)
      expect(newCustomMaterialId('Delrin (acetal)').startsWith('user-')).toBe(true);
      expect(isCustomMaterialId(a)).toBe(true);
      expect(isCustomMaterialId('delrin')).toBe(false);
    } finally {
      restore();
    }
  });

  it('corrupt storage degrades to built-ins only, never throws', () => {
    const restore = stubStorage({ 'simple.cam.materials.v1': '{not json' });
    try {
      expect(allMaterials()).toEqual(MATERIALS);
      expect(() => getMaterial('user-gone')).toThrow();
    } finally {
      restore();
    }
  });
});