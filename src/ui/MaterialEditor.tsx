/**
 * USER-DEFINED MATERIALS (docs/TODO.md, Alice 2026-11-15): the built-in
 * preset table is narrower than reality, and a user who calibrates the
 * perfect speeds for their exact material should save them — like custom
 * filament profiles in a slicer. The editor manages the custom list
 * (localStorage, src/core/materials.ts); picking a row here sets the
 * stock's material, the same id every rate lookup already resolves.
 */

import { useState } from 'react';
import { MATERIALS, allMaterials, isCustomPreset, newCustomMaterialId, saveCustomMaterials } from '../core/materials';
import type { MaterialPreset } from '../core/materials';
import { NumberField, TextField } from './fields';

/** The editable rates one material carries, per tool type. The rows the
 * editor shows mirror the preset shape generation reads — feed + DOC per
 * tool type, plunge as a fraction of feed (drills ignore it). */
const TOOL_ROWS: { key: keyof MaterialPreset['feedByTool']; label: string }[] = [
  { key: 'flat', label: 'Flat mill' },
  { key: 'ball', label: 'Ball' },
  { key: 'bull', label: 'Bull' },
  { key: 'vbit', label: 'V-bit' },
  { key: 'drill', label: 'Drill' },
  { key: 'threadmill', label: 'Thread mill' },
  { key: 'corn', label: 'Corn' },
  { key: 'laser', label: 'Laser' },
];

/** A fresh custom material: the Delrin row is a sensible starting point —
 * the shop's own calibrated numbers overwrite every box anyway. */
function blankCustom(name: string): MaterialPreset {
  const src = MATERIALS.find((m) => m.id === 'delrin')!;
  return {
    id: newCustomMaterialId(name),
    name,
    feedByTool: { ...src.feedByTool },
    stepDownByTool: { ...src.stepDownByTool },
    plungeFraction: src.plungeFraction,
  };
}

/** Clone a preset as a custom (a built-in copy is the fastest way to
 * "Aluminum but my machine's numbers"). */
function cloneAsCustom(m: MaterialPreset): MaterialPreset {
  return { ...blankCustom(m.name), id: newCustomMaterialId(m.name), name: `${m.name} (mine)`, feedByTool: { ...m.feedByTool }, stepDownByTool: { ...m.stepDownByTool }, plungeFraction: m.plungeFraction };
}

interface EditorProps {
  /** the stock's current material — picked rows highlight */
  selectedId: string;
  /** pick a row: set the stock material + close */
  onPick: (id: string) => void;
  onClose: () => void;
}

export function MaterialEditorDialog({ selectedId, onPick, onClose }: EditorProps) {
  const [drafts, setDrafts] = useState<MaterialPreset[]>(() => allMaterials().filter(isCustomPreset));
  const [editingId, setEditingId] = useState<string | null>(null);

  const persist = (next: MaterialPreset[]) => {
    setDrafts(next);
    saveCustomMaterials(next);
  };

  const customs = drafts;
  const editing = drafts.find((d) => d.id === editingId) ?? null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Materials">
      <div className="modal material-editor">
        <h2>
          Materials
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </h2>
        <p className="hint">
          The five built-ins stay fixed. Your materials live in this browser and show up
          in the Stock tab's Material list — pick one and every operation defaults from it.
        </p>
        <div className="material-list">
          <h3>Built-in</h3>
          {MATERIALS.map((m) => (
            <div key={m.id} className={`material-row${selectedId === m.id ? ' sel' : ''}`}>
              <span className="material-name">{m.name}</span>
              <button
                type="button"
                className="secondary icon-btn"
                title="Copy this material as a starting point for your own"
                onClick={() => persist([...customs, cloneAsCustom(m)])}
              >
                ⧉ copy
              </button>
            </div>
          ))}
          <h3>Yours</h3>
          {customs.length === 0 && (
            <p className="hint">none yet — copy a built-in or add one below</p>
          )}
          {customs.map((m) => (
            <div key={m.id} className={`material-row${selectedId === m.id ? ' sel' : ''}`}>
              <button type="button" className="material-name linklike" onClick={() => onPick(m.id)}>
                {m.name}
              </button>
              <button
                type="button"
                className="secondary"
                title="Edit this material's rates"
                onClick={() => setEditingId(editingId === m.id ? null : m.id)}
              >
                ✎ edit
              </button>
              <button
                type="button"
                className="secondary icon-btn"
                title="Delete this material — ops using it fall back to an error until repicked"
                onClick={() => persist(customs.filter((c) => c.id !== m.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="buttons">
          <button
            type="button"
            onClick={() => {
              const name = `My material ${customs.length + 1}`;
              const m = blankCustom(name);
              persist([...customs, m]);
              setEditingId(m.id);
            }}
          >
            + Add material
          </button>
        </div>
        {editing && (
          <div className="material-edit">
            <h3>{editing.name}</h3>
            <TextField
              label="Name"
              value={editing.name}
              onCommit={(v) => persist(customs.map((c) => (c.id === editing.id ? { ...c, name: v } : c)))}
            />
            <div className="origin-grid">
              {TOOL_ROWS.map(({ key, label }) => (
                <div className="field" key={key}>
                  <span>{label}</span>
                  <div className="floor-row">
                    <NumberField
                      label="feed mm/min"
                      value={editing.feedByTool[key]}
                      min={1}
                      onCommit={(v) =>
                        persist(
                          customs.map((c) =>
                            c.id === editing.id ? { ...c, feedByTool: { ...c.feedByTool, [key]: v } } : c,
                          ),
                        )
                      }
                    />
                    <NumberField
                      label="DOC mm"
                      value={editing.stepDownByTool[key]}
                      min={0.05}
                      step={0.1}
                      onCommit={(v) =>
                        persist(
                          customs.map((c) =>
                            c.id === editing.id ? { ...c, stepDownByTool: { ...c.stepDownByTool, [key]: v } } : c,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="floor-row">
              <NumberField
                label="Plunge feed as fraction of cut feed (0.05–1)"
                value={editing.plungeFraction}
                min={0.05}
                step={0.05}
                onCommit={(v) =>
                  persist(customs.map((c) => (c.id === editing.id ? { ...c, plungeFraction: v } : c)))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}