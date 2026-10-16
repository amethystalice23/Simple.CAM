import { useState } from 'react';
import type { JobOp, Stock, Tool } from '../core/types';
import type { GeneratedOp } from './jobGeneration';
import { defaultStepDown, defaultStepOver, newJobOp, OP_KINDS } from './jobGeneration';
import { NumberField } from './fields';

interface Props {
  ops: JobOp[];
  tools: Tool[];
  generated: Record<string, GeneratedOp>;
  editingOpId: string | null;
  expandedOpId: string | null;
  showPreview: boolean;
  hasModel: boolean;
  stockKind: Stock['kind'];
  /** stock material id, for tool-appropriate step defaults */
  materialId: string;
  onAddOp: () => void;
  onChangeOp: (op: JobOp) => void;
  onDeleteOp: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onSelectFeatures: (id: string | null) => void;
  onRecalcOne: (id: string) => void;
  onRecalcAll: () => void;
  onToggleExpanded: (id: string) => void;
  onTogglePreview: (v: boolean) => void;
}

/** The per-type parameter fields for an open op panel. */
function ParamFields(props: { op: JobOp; onChange: (op: JobOp) => void }) {
  const { op, onChange } = props;
  const upd = (patch: Partial<JobOp>) => onChange({ ...op, ...patch } as JobOp);
  switch (op.kind) {
    case 'faceCylinder':
      return (
        <>
          <NumberField label="Target Ø (mm)" value={op.targetDiameter} min={0.1} step={0.1} onCommit={(v) => upd({ targetDiameter: v } as Partial<JobOp>)} />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Finish allowance (mm)" value={op.finishAllowance} min={0} step={0.05} onCommit={(v) => upd({ finishAllowance: v } as Partial<JobOp>)} />
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' })}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
        </>
      );
    case 'pocket':
      return (
        <>
          <label className="field">
            <span>Selection is the</span>
            <select
              value={op.selectionIs}
              onChange={(e) => upd({ selectionIs: e.target.value as 'floor' | 'top' })}
            >
              <option value="floor">floor — cut down TO it from the crown</option>
              <option value="top">top — cut down FROM it by depth</option>
            </select>
          </label>
          <NumberField
            label="Depth (when top)"
            value={op.depth}
            min={0.1}
            onCommit={(v) => upd({ depth: v } as Partial<JobOp>)}
          />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
        </>
      );
    case 'drill':
      return (
        <>
          <NumberField label="Depth (mm)" value={op.depth} min={0.1} onCommit={(v) => upd({ depth: v } as Partial<JobOp>)} />
          <NumberField label="Peck (mm)" value={op.peckDepth} min={0} onCommit={(v) => upd({ peckDepth: v } as Partial<JobOp>)} />
        </>
      );
    case 'profile':
      return (
        <>
          <label className="field">
            <span>Side</span>
            <select
              value={op.side}
              onChange={(e) => upd({ side: e.target.value as 'outside' | 'inside' | 'online' })}
            >
              <option value="outside">outside</option>
              <option value="inside">inside</option>
              <option value="online">on line</option>
            </select>
          </label>
          <label className="field">
            <span>Selection is the</span>
            <select
              value={op.selectionIs}
              onChange={(e) => upd({ selectionIs: e.target.value as 'floor' | 'top' })}
            >
              <option value="floor">floor — cut down TO it from the crown</option>
              <option value="top">top — cut down FROM it by depth</option>
            </select>
          </label>
          <NumberField
            label="Depth (when top)"
            value={op.depth}
            min={0.1}
            onCommit={(v) => upd({ depth: v } as Partial<JobOp>)}
          />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Allowance (mm)" value={op.allowance} min={0} step={0.05} onCommit={(v) => upd({ allowance: v } as Partial<JobOp>)} />
        </>
      );
  }
}

export function OpsPanel(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);

  /** tool change re-derives the step defaults for the new cutter */
  const changeTool = (op: JobOp, toolId: string) => {
    const t = props.tools.find((x) => x.id === toolId);
    let next: JobOp = { ...op, toolId };
    if (t) {
      const stepDown = defaultStepDown(t, props.materialId);
      if (op.kind === 'pocket') {
        next = { ...next, stepDown, stepOver: defaultStepOver(t) } as JobOp;
      } else if (op.kind === 'profile' || op.kind === 'faceCylinder') {
        next = { ...next, stepDown } as JobOp;
      }
    }
    props.onChangeOp(next);
  };

  return (
    <section>
      <div className="buttons">
        <button type="button" onClick={props.onAddOp}>
          + Add toolpath
        </button>
      </div>
      {props.ops.length === 0 && (
        <p className="hint">add a toolpath, then select features on the Model tab</p>
      )}
      <div>
        {props.ops.map((op) => {
          const gen = props.generated[op.id];
          const expanded = props.expandedOpId === op.id;
          const editing = props.editingOpId === op.id;
          return (
            <div
              key={op.id}
              className={`op-panel${dragId === op.id ? ' dragging' : ''}`}
            >
              <div
                className="op-title"
                draggable
                onDragStart={() => setDragId(op.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== op.id) props.onReorder(dragId, op.id);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => props.onToggleExpanded(op.id)}
              >
                <span className="grip" title="Drag to reorder">
                  ⠿
                </span>
                <select
                  className="op-kind"
                  value={op.kind}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const t = props.tools.find((x) => x.id === op.toolId);
                    const next = t
                      ? newJobOp(e.target.value as JobOp['kind'], t, props.materialId)
                      : null;
                    if (next) props.onChangeOp({ ...next, id: op.id, featureIds: op.featureIds });
                  }}
                >
                  {OP_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <span className="op-status">
                  {gen?.error ? '⚠' : gen ? '✓' : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Recalculate this toolpath"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRecalcOne(op.id);
                  }}
                >
                  ↻
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Delete operation"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDeleteOp(op.id);
                  }}
                >
                  ✕
                </button>
              </div>
              {expanded && (
                <div className="op-body">
                  {op.kind !== 'faceCylinder' && (
                    <div className="buttons">
                      <button
                        type="button"
                        className={editing ? '' : 'secondary'}
                        onClick={() => props.onSelectFeatures(editing ? null : op.id)}
                      >
                        {editing
                          ? `Selecting… click features in the viewport (${op.featureIds.length})`
                          : `Select features (${op.featureIds.length})`}
                      </button>
                    </div>
                  )}
                  <label className="field">
                    <span>Tool</span>
                    <select value={op.toolId} onChange={(e) => changeTool(op, e.target.value)}>
                      {props.tools.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.type} Ø{t.diameter})
                        </option>
                      ))}
                    </select>
                  </label>
                  <ParamFields op={op} onChange={props.onChangeOp} />
                  {gen?.error && <p className="error">{gen.error}</p>}
                  {gen?.summary && <p className="hint">{gen.summary}</p>}
                  {!gen && <p className="hint">not calculated yet</p>}
                  {!props.hasModel && op.kind !== 'faceCylinder' && (
                    <p className="hint">needs a loaded model</p>
                  )}
                  {op.kind === 'faceCylinder' && props.stockKind !== 'cylinder' && (
                    <p className="hint">needs cylinder stock</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {props.ops.length > 0 && (
        <div className="buttons">
          <button type="button" onClick={props.onRecalcAll}>
            Recalculate
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={props.showPreview}
              onChange={(e) => props.onTogglePreview(e.target.checked)}
            />
            <span>Display paths</span>
          </label>
        </div>
      )}
    </section>
  );
}