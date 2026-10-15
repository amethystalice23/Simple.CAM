import { useState } from 'react';
import type { ModelTransform, Primitive, Stock } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
import { NumberField } from './fields';
import { transformFn } from './featureOverlays';

interface Props {
  stock: Stock;
  features: DetectedFeatures;
  transform: ModelTransform;
  selectionMode: boolean;
  onSelectionModeChange: (v: boolean) => void;
  selection: string[]; // feature ids
  onToggle: (id: string) => void;
  onClearSelection: () => void;
  primitives: Primitive[];
  selectedPrimitiveId: string | null;
  onSelectPrimitive: (id: string | null) => void;
  onAddPrimitive: (kind: 'cylinder' | 'box') => void;
  onChangePrimitive: (p: Primitive) => void;
  onDeletePrimitive: (id: string) => void;
}

type FeatureKind = 'plane' | 'circle' | 'edge';

/** One listable feature row: id, description, kind. */
interface Row {
  id: string;
  kind: FeatureKind;
  label: string;
  meta: string;
}

function buildRows(features: DetectedFeatures, transform: ModelTransform): Row[] {
  const xf = transformFn(transform);
  const v3 = (p: { x: number; y: number; z: number }) => {
    const v = xf(p);
    return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
  };
  const rows: Row[] = [];
  for (const c of features.circles) {
    rows.push({
      id: c.id,
      kind: 'circle',
      label: `Ø ${(c.radius * 2).toFixed(2)} mm${c.inner ? ' · hole' : ''}`,
      meta: `@ ${v3(c.center)}`,
    });
  }
  for (const e of features.edges) {
    const len = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z);
    rows.push({ id: e.id, kind: 'edge', label: `L ${len.toFixed(2)} mm`, meta: `@ ${v3(e.a)}` });
  }
  for (const p of features.planes) {
    rows.push({
      id: p.id,
      kind: 'plane',
      label: 'plane',
      meta: `n (${p.normal.x.toFixed(2)}, ${p.normal.y.toFixed(2)}, ${p.normal.z.toFixed(2)})`,
    });
  }
  return rows;
}

/** Edit form for a primitive (draft pattern like the tool editor). */
function PrimitiveForm(props: {
  primitive: Primitive;
  onChange: (p: Primitive) => void;
  onDelete: () => void;
}) {
  const p = props.primitive;
  const upd = (patch: Partial<Primitive>): Primitive => ({ ...p, ...patch } as Primitive);
  const t = p.transform;
  const setT = (pt: Partial<typeof t>) =>
    props.onChange(upd({ transform: { ...t, ...pt } } as Partial<Primitive>));
  return (
    <div className="primitive-form">
      {p.kind === 'cylinder' ? (
        <>
          <NumberField
            label="Diameter (mm)"
            value={p.diameter}
            min={0.1}
            step={0.1}
            onCommit={(v) => props.onChange(upd({ diameter: v } as Partial<Primitive>))}
          />
          <NumberField
            label="Length (mm)"
            value={p.length}
            min={0.1}
            onCommit={(v) => props.onChange(upd({ length: v } as Partial<Primitive>))}
          />
        </>
      ) : (
        <>
          <NumberField label="Size X (mm)" value={p.size.x} min={0.1} onCommit={(v) => props.onChange(upd({ size: { ...p.size, x: v } } as Partial<Primitive>))} />
          <NumberField label="Size Y (mm)" value={p.size.y} min={0.1} onCommit={(v) => props.onChange(upd({ size: { ...p.size, y: v } } as Partial<Primitive>))} />
          <NumberField label="Size Z (mm)" value={p.size.z} min={0.1} onCommit={(v) => props.onChange(upd({ size: { ...p.size, z: v } } as Partial<Primitive>))} />
          <NumberField label="Rotate X (°)" value={t.rotationDeg.x} step={15} onCommit={(v) => setT({ rotationDeg: { ...t.rotationDeg, x: v } })} />
          <NumberField label="Rotate Y (°)" value={t.rotationDeg.y} step={15} onCommit={(v) => setT({ rotationDeg: { ...t.rotationDeg, y: v } })} />
          <NumberField label="Rotate Z (°)" value={t.rotationDeg.z} step={15} onCommit={(v) => setT({ rotationDeg: { ...t.rotationDeg, z: v } })} />
        </>
      )}
      <NumberField label="Pos X (mm)" value={t.position.x} step={0.5} onCommit={(v) => setT({ position: { ...t.position, x: v } })} />
      <NumberField label="Pos Y (mm)" value={t.position.y} step={0.5} onCommit={(v) => setT({ position: { ...t.position, y: v } })} />
      <NumberField label="Pos Z (mm)" value={t.position.z} step={0.5} onCommit={(v) => setT({ position: { ...t.position, z: v } })} />
      <div className="buttons">
        <button type="button" className="secondary" onClick={props.onDelete}>
          Delete primitive
        </button>
      </div>
    </div>
  );
}

export function FeaturesPanel(props: Props) {
  const { features, transform, selection } = props;
  const [search, setSearch] = useState('');

  const rows = buildRows(features, transform);
  const q = search.toLowerCase();
  const visible = rows.filter((r) => !q || `${r.label} ${r.meta}`.toLowerCase().includes(q));
  const groups: { kind: FeatureKind; title: string }[] = [
    { kind: 'circle', title: `Circles & holes (${rows.filter((r) => r.kind === 'circle').length})` },
    { kind: 'edge', title: `Edges (${rows.filter((r) => r.kind === 'edge').length})` },
    { kind: 'plane', title: `Planes (${rows.filter((r) => r.kind === 'plane').length})` },
  ];

  const selectedPrimitive = props.primitives.find((p) => p.id === props.selectedPrimitiveId) ?? null;

  return (
    <>
      <section>
        <h2>Features</h2>
        <button
          type="button"
          className={props.selectionMode ? 'active' : 'secondary'}
          onClick={() => props.onSelectionModeChange(!props.selectionMode)}
        >
          {props.selectionMode ? 'Selecting: click features in the viewport' : 'Select features'}
        </button>
        <label className="field">
          <span>Search</span>
          <input
            type="text"
            placeholder="Ø, L, plane…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="tool-list">
          {groups.map((g) => {
            const gRows = visible.filter((r) => r.kind === g.kind);
            if (gRows.length === 0) return null;
            return (
              <div key={g.kind} className="tool-subgroup">
                <div className="group-subheader">{g.title}</div>
                {gRows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`tool-row${selection.includes(r.id) ? ' selected' : ''}`}
                    onClick={() => props.onToggle(r.id)}
                  >
                    <span className="tool-name">{r.label}</span>
                    <span className="tool-meta">{r.meta}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="buttons">
          <span className="hint">{selection.length} selected</span>
          {selection.length > 0 && (
            <button type="button" className="secondary" onClick={props.onClearSelection}>
              Clear
            </button>
          )}
        </div>
      </section>

      <section>
        <h2>Primitives</h2>
        <p className="hint">
          sized from the selection when possible: circle → cylinder (same Ø + center), plane → box
          (matching face)
        </p>
        <div className="buttons">
          <button type="button" onClick={() => props.onAddPrimitive('cylinder')}>
            + Cylinder
          </button>
          <button type="button" onClick={() => props.onAddPrimitive('box')}>
            + Box
          </button>
        </div>
        {props.primitives.length > 0 && (
          <div className="tool-list">
            {props.primitives.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tool-row${p.id === props.selectedPrimitiveId ? ' active' : ''}`}
                onClick={() => props.onSelectPrimitive(p.id === props.selectedPrimitiveId ? null : p.id)}
              >
                <span className="tool-name">
                  {p.kind === 'cylinder'
                    ? `cylinder Ø${p.diameter.toFixed(1)} × ${p.length.toFixed(1)}`
                    : `box ${p.size.x.toFixed(1)} × ${p.size.y.toFixed(1)} × ${p.size.z.toFixed(1)}`}
                </span>
                <span className="tool-meta">
                  @ ({p.transform.position.x.toFixed(1)}, {p.transform.position.y.toFixed(1)},{' '}
                  {p.transform.position.z.toFixed(1)})
                </span>
              </button>
            ))}
          </div>
        )}
        {selectedPrimitive && (
          <PrimitiveForm
            primitive={selectedPrimitive}
            onChange={props.onChangePrimitive}
            onDelete={() => props.onDeletePrimitive(selectedPrimitive.id)}
          />
        )}
      </section>
    </>
  );
}