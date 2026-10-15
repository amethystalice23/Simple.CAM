import { useState } from 'react';
import type { Tool } from '../core/types';
import { NumberField, TextField } from './fields';

interface Props {
  tools: Tool[];
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (tools: Tool[]) => void;
  onRestorePresets: () => void;
}

const TOOL_TYPES: Tool['type'][] = ['flat', 'ball', 'bull', 'vbit', 'drill', 'threadmill'];

/** Pick, edit, add, and delete tools in the library. */
export function ToolPanel({ tools, selectedId, onSelect, onChange, onRestorePresets }: Props) {
  const selected = tools.find((t) => t.id === selectedId) ?? tools[0];
  const [draft, setDraft] = useState<Tool | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Tool['type'] | 'all'>('all');

  const editing = draft ?? selected;
  const upd = (p: Partial<Tool>) => setDraft({ ...(draft ?? selected), ...p });

  const save = () => {
    if (!draft) return;
    if (isNew) {
      onChange([...tools, draft]);
      onSelect(draft.id);
    } else {
      onChange(tools.map((t) => (t.id === draft.id ? draft : t)));
    }
    setDraft(null);
    setIsNew(false);
  };

  const newTool = () => {
    setDraft({ id: `custom-${Date.now()}`, name: 'New tool', type: 'flat', diameter: 6, spindleRpm: 18000 });
    setIsNew(true);
  };

  const remove = () => {
    if (!selected || tools.length <= 1) return; // never leave the op without a tool
    onChange(tools.filter((t) => t.id !== selected.id));
  };

  const filtered = tools.filter(
    (t) =>
      (typeFilter === 'all' || t.type === typeFilter) &&
      (!search || `${t.name} ${t.type} ${t.diameter}`.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <section>
        <h2>Tool Library</h2>
        <label className="field">
          <span>Search</span>
          <input
            type="text"
            placeholder="name, type, Ø…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Bit type</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as Tool['type'] | 'all')}>
            <option value="all">All types</option>
            {TOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="tool-list">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tool-row${t.id === selectedId ? ' active' : ''}`}
              onClick={() => {
                onSelect(t.id);
                setDraft(null);
                setIsNew(false);
              }}
            >
              <span className="tool-name">{t.name}</span>
              <span className="tool-meta">
                {t.type} · Ø{t.diameter}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>{isNew ? 'New Tool' : 'Edit Tool'}</h2>
        <TextField label="Name" value={editing?.name ?? ''} onCommit={(v) => upd({ name: v })} />
        <label className="field">
          <span>Type</span>
          <select value={editing?.type} onChange={(e) => upd({ type: e.target.value as Tool['type'] })}>
            {TOOL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Diameter (mm)" value={editing?.diameter ?? 0} min={0.1} step={0.1} onCommit={(v) => upd({ diameter: v })} />
        {editing?.type === 'vbit' && (
          <>
            <NumberField label="Included angle (°)" value={editing.vAngle ?? 90} step={1} onCommit={(v) => upd({ vAngle: v })} />
            <NumberField label="Tip diameter (mm)" value={editing.tipDiameter ?? 0.1} min={0} step={0.05} onCommit={(v) => upd({ tipDiameter: v })} />
          </>
        )}
        {editing?.type === 'bull' && (
          <NumberField label="Corner radius (mm)" value={editing.cornerRadius ?? 0.5} min={0} step={0.1} onCommit={(v) => upd({ cornerRadius: v })} />
        )}
        {editing?.type === 'drill' && (
          <NumberField label="Point angle (°)" value={editing.drillPointAngle ?? 118} step={1} onCommit={(v) => upd({ drillPointAngle: v })} />
        )}
        {editing?.type === 'threadmill' && (
          <NumberField label="Pitch (mm)" value={editing.pitch ?? 0.5} min={0.05} step={0.05} onCommit={(v) => upd({ pitch: v })} />
        )}
        <NumberField label="Spindle RPM" value={editing?.spindleRpm ?? 18000} min={100} step={1000} onCommit={(v) => upd({ spindleRpm: v })} />
        <NumberField label="Flutes" value={editing?.flutes ?? 2} min={1} step={1} onCommit={(v) => upd({ flutes: v })} />
        <NumberField label="Flute length (mm)" value={editing?.fluteLength ?? 0} min={0} onCommit={(v) => upd({ fluteLength: v })} />
        <NumberField label="Overall length (mm)" value={editing?.overallLength ?? 0} min={0} onCommit={(v) => upd({ overallLength: v })} />
        <NumberField label="Shank Ø (mm)" value={editing?.shaftDiameter ?? 0} min={0} step={0.1} onCommit={(v) => upd({ shaftDiameter: v })} />
        <div className="buttons">
          <button type="button" disabled={!draft} onClick={save}>
            {isNew ? 'Add tool' : 'Save'}
          </button>
          <button type="button" onClick={newTool}>
            New
          </button>
          <button
            type="button"
            className="secondary"
            disabled={isNew || !selected || tools.length <= 1}
            onClick={remove}
          >
            Delete
          </button>
        </div>
        <div className="buttons">
          <button type="button" className="secondary" onClick={onRestorePresets}>
            Restore Makera presets
          </button>
          {draft && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setDraft(null);
                setIsNew(false);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </section>
    </>
  );
}