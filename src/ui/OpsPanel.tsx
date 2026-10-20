import { useState } from 'react';
import { isDepthBearingJobOp, type DepthBearingJobOp } from '../core/types';
import type { AxisMode, JobOp, OpRates, Primitive, Stock, Tool } from '../core/types';
import type { GeneratedOp } from './jobGeneration';
import {
  defaultFaceStepOver,
  defaultStepDown,
  defaultStepOver,
  newJobOp,
  OP_KINDS,
  presetRates,
} from './jobGeneration';
import { groupToolsBySubtype, toolOptionLabel } from './toolNames';
import { NumberField } from './fields';

interface Props {
  ops: JobOp[];
  tools: Tool[];
  generated: Record<string, GeneratedOp>;
  editingOpId: string | null;
  expandedOpId: string | null;
  showPreview: boolean;
  hasModel: boolean;
  /** machine capability — gates the rotary ops (index, face cylinder) */
  axisMode: AxisMode;
  /** the stock object — new ops derive their defaults from it */
  stock: Stock;
  /** stock material id, for tool-appropriate step defaults */
  materialId: string;
  /** user-added primitives (face ops can target a cylinder) */
  primitives: Primitive[];
  /** short feature description by id, for the title-bar snippet */
  featureLabels: Record<string, string>;
  onAddOp: () => void;
  onChangeOp: (op: JobOp) => void;
  /** floor/rim switch — re-prefills the depth boxes from the selection */
  onSelectionIsChange: (op: JobOp, value: 'floor' | 'rim') => void;
  /** compute the index angle that brings the op's selection to face the cutter */
  onIndexToSelection: (op: JobOp) => void;
  /** ⇩ floor pick (edge-tracing §5): the op in floor-picking mode (its ⇩
   * is lit, the panel banners it, the next viewport click sets the floor) */
  floorPickingOpId: string | null;
  onFloorPick: (op: JobOp) => void;
  /** ops whose toolpath is hidden from the preview (the g-code keeps them) */
  hiddenOps: ReadonlySet<string>;
  onToggleVisible: (id: string) => void;
  onDeleteOp: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onSelectFeatures: (id: string | null) => void;
  onRecalcOne: (id: string) => void;
  onRecalcAll: () => void;
  onToggleExpanded: (id: string) => void;
  onTogglePreview: (v: boolean) => void;
}

/** "Ø4.0 hole · 10×4 +2 more" style snippet of an op's selected features. */
function selectionSnippet(op: JobOp, labels: Record<string, string>): string {
  const texts = op.featureIds.map((id) => labels[id]).filter((t): t is string => !!t);
  if (texts.length === 0) return op.kind === 'faceCylinder' ? 'stock facing' : 'no features';
  const shown = texts.slice(0, 2).join(' · ');
  return texts.length > 2 ? `${shown} +${texts.length - 2} more` : shown;
}

/** The floor/rim selector with the depth boxes it prefiles. */
/** The floor/rim selector with the depth boxes it prefiles (slice pockets
 * reuse everything but the selector — they select no features). The ⇩
 * pick (edge-tracing §5) links a selected plane/circle as the floor: it
 * drives end depth live until the box is hand-edited, which detaches it. */
function DepthFields(props: {
  op: DepthBearingJobOp;
  onChange: (op: JobOp) => void;
  onSelectionIsChange: (op: JobOp, value: 'floor' | 'rim') => void;
  /** this op is in floor-picking mode — the ⇩ is lit */
  floorPicking: boolean;
  onFloorPick: (op: JobOp) => void;
  /** the linked floor feature's short label, for the provenance hint */
  floorLabel: string | null;
}) {
  const { op } = props;
  const upd = (patch: Partial<typeof op>) =>
    props.onChange({ ...op, ...patch } as JobOp);
  return (
    <>
      {'selectionIs' in op && (
        <label className="field">
          <span>Selection is the</span>
          <select
            value={op.selectionIs}
            onChange={(e) => props.onSelectionIsChange(op, e.target.value as 'floor' | 'rim')}
          >
            <option value="floor">floor — end depth from the feature</option>
            <option value="rim">rim — start depth from the feature</option>
          </select>
        </label>
      )}
      <NumberField
        label="Start depth (mm)"
        value={op.startDepth}
        min={0}
        onCommit={(v) => upd({ startDepth: v })}
      />
      {/* end depth + the ⇩ floor pick share a line — the box shrinks a
       * little to make room for the button */}
      <div className="floor-row">
        <NumberField
          label="End depth (mm)"
          className="floor-depth"
          value={op.endDepth}
          min={0.1}
          // a hand edit detaches the ⇩ floor link — the number wins
          onCommit={(v) => upd({ endDepth: v, floorFeatureId: null })}
        />
        <button
          type="button"
          className={`icon-btn${props.floorPicking ? ' active' : ''}`}
          title="Pick the cut floor — click, then select a face or circle in the viewport; its Z drives the end depth until you edit the box"
          onClick={() => props.onFloorPick(op)}
        >
          ⇩
        </button>
      </div>
      <NumberField
        label="Allowance (mm)"
        value={op.allowance}
        min={0}
        step={0.05}
        onCommit={(v) => upd({ allowance: v })}
      />
      <p className="hint">
        depths are below the stock top · start = end → single finishing pass · allowance = stock
        left for finishing
        {op.floorFeatureId !== null &&
          ` · floor: ${props.floorLabel ?? 'linked feature'} (moves with the model)`}
      </p>
    </>
  );
}

/** The index op: absolute A, plus align-the-selection convenience. */
function IndexFields(props: {
  op: Extract<JobOp, { kind: 'index' }>;
  axisMode: AxisMode;
  onIndexToSelection: (op: JobOp) => void;
  onChange: (op: JobOp) => void;
}) {
  const { op } = props;
  if (props.axisMode !== '4-axis') {
    return <p className="hint">indexing needs 4-axis mode (Stock tab)</p>;
  }
  return (
    <>
      <NumberField
        label="Index angle (°, absolute A)"
        value={op.angle}
        step={15}
        onCommit={(v) => props.onChange({ ...op, angle: v })}
      />
      <div className="buttons">
        <button
          type="button"
          disabled={op.featureIds.length === 0}
          onClick={() => props.onIndexToSelection(op)}
          title="Index so the selected face's normal (or hole's axis) aligns with Z"
        >
          Index to selection
        </button>
      </div>
      <p className="hint">
        the stock freezes at this A — every op below runs in the rotated frame
      </p>
    </>
  );
}

/** Cutting-rate overrides for one op — the optional popup behind the ⚡
 * button. The boxes show the effective values (an override, else the tool +
 * stock-material presets, i.e. the Tools-tab values); editing a box sets
 * that override, "Use tool defaults" clears them all. */
function RatesPopup(props: {
  op: JobOp;
  tool?: Tool;
  materialId: string;
  onChange: (op: JobOp) => void;
}) {
  const { op, tool } = props;
  if (!tool) {
    return <p className="hint">tool missing from the library — fix the Tool select first</p>;
  }
  const defaults = presetRates(op.kind, tool, props.materialId);
  const rates = op.rates ?? {};
  const setRate = (patch: Partial<OpRates>) =>
    props.onChange({ ...op, rates: { ...rates, ...patch } });
  return (
    <div className="op-rates">
      <p className="hint">
        defaults come from the tool + stock material presets — edit only what this one op
        needs; an edited box overrides the tool default until reset
      </p>
      <NumberField
        label="Feed (mm/min)"
        value={rates.feed ?? defaults.feed}
        min={1}
        step={10}
        onCommit={(v) => setRate({ feed: v })}
      />
      <NumberField
        label="Plunge (mm/min)"
        value={rates.plungeFeed ?? defaults.plungeFeed}
        min={1}
        step={10}
        onCommit={(v) => setRate({ plungeFeed: v })}
      />
      <NumberField
        label="Spindle (rpm)"
        value={rates.spindleRpm ?? defaults.spindleRpm}
        min={100}
        step={1000}
        onCommit={(v) => setRate({ spindleRpm: v })}
      />
      <div className="buttons">
        <button
          type="button"
          className="secondary"
          disabled={!op.rates}
          onClick={() => props.onChange({ ...op, rates: undefined })}
        >
          Use tool defaults
        </button>
      </div>
    </div>
  );
}

/** The per-type parameter fields for an open op panel. */
function ParamFields(props: {
  op: JobOp;
  axisMode: AxisMode;
  primitives: Primitive[];
  /** the op's own tool (undefined if its id dangles after a library edit) */
  tool?: Tool;
  onChange: (op: JobOp) => void;
  onSelectionIsChange: (op: JobOp, value: 'floor' | 'rim') => void;
  onIndexToSelection: (op: JobOp) => void;
  /** ⇩ floor pick (edge-tracing §5) — see DepthFields */
  floorPickingOpId: string | null;
  onFloorPick: (op: JobOp) => void;
  floorLabel: string | null;
}) {
  const { op, onChange } = props;
  const upd = (patch: Partial<JobOp>) => onChange({ ...op, ...patch } as JobOp);
  switch (op.kind) {
    case 'index':
      return (
        <IndexFields
          op={op}
          axisMode={props.axisMode}
          onIndexToSelection={props.onIndexToSelection}
          onChange={props.onChange}
        />
      );
    case 'faceCylinder':
      return (
        <>
          <label className="field">
            <span>Target primitive</span>
            <select
              value={op.primitiveId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                const prim = props.primitives.find(
                    (p): p is Extract<Primitive, { kind: 'cylinder' }> => p.id === id && p.kind === 'cylinder',
                  );
                if (prim) {
                  // the primitive drives extent and diameter; fields follow it
                  props.onChange({
                    ...op,
                    primitiveId: id,
                    xStart: prim.transform.position.x - prim.length / 2,
                    xEnd: prim.transform.position.x + prim.length / 2,
                    targetDiameter: prim.diameter,
                  } as JobOp);
                } else {
                  props.onChange({ ...op, primitiveId: id } as JobOp);
                }
              }}
            >
              <option value="">none — use the X range below</option>
              {props.primitives
                .filter((p): p is Extract<Primitive, { kind: 'cylinder' }> => p.kind === 'cylinder')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    cylinder Ø{p.diameter.toFixed(1)} × {p.length.toFixed(1)}
                  </option>
                ))}
            </select>
          </label>
          <NumberField label="Start X (mm)" value={op.xStart} step={0.5} onCommit={(v) => upd({ xStart: v } as Partial<JobOp>)} />
          <NumberField label="End X (mm)" value={op.xEnd} step={0.5} onCommit={(v) => upd({ xEnd: v } as Partial<JobOp>)} />
          <NumberField label="Target Ø (mm)" value={op.targetDiameter} min={0.1} step={0.1} onCommit={(v) => upd({ targetDiameter: v } as Partial<JobOp>)} />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField
            label="Step over (mm)"
            // null = derived; show the 0.5·tool Ø default (a 6mm flat's 3.0
            // when the tool id dangles) so the box is never empty
            value={op.stepOver ?? (props.tool ? defaultFaceStepOver(props.tool) : 3.0)}
            min={0.1}
            step={0.1}
            onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)}
          />
          <NumberField label="Finish allowance (mm)" value={op.finishAllowance} min={0} step={0.05} onCommit={(v) => upd({ finishAllowance: v } as Partial<JobOp>)} />
          <label className="field">
            <span>Pattern</span>
            <select value={op.pattern} onChange={(e) => upd({ pattern: e.target.value as 'vertical' | 'horizontal' | 'spiral' })}>
              <option value="vertical">vertical — full A rotation, then step X</option>
              <option value="horizontal">horizontal — full X pass, then step A</option>
              <option value="spiral">spiral — continuous helical cut</option>
            </select>
          </label>
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' })}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
          <p className="hint">
            X range and target Ø default from the stock — narrow the X range to avoid vice jaws;
            target Ø starts at a 0.5mm skim, set it to your finished size. Step over defaults to
            0.5·tool Ø — the radius, a conservative radial engagement (shown until you set it) —
            and spaces rings, passes, or per-rev advance
          </p>
        </>
      );
    case 'pocket':
      return (
        <>
          <DepthFields
            op={op}
            onChange={props.onChange}
            onSelectionIsChange={props.onSelectionIsChange}
            floorPicking={props.floorPickingOpId === op.id}
            onFloorPick={props.onFloorPick}
            floorLabel={props.floorLabel}
          />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
        </>
      );
    case 'slicePocket':
      return (
        <>
          <label className="field">
            <span>Region</span>
            <select
              value={op.regionMode}
              onChange={(e) => upd({ regionMode: e.target.value as 'outside' | 'inside' })}
            >
              <option value="outside">outside — clear around the slice, leave the cross-section</option>
              <option value="inside">inside — clear the slice interior</option>
            </select>
          </label>
          <DepthFields
            op={op}
            onChange={props.onChange}
            onSelectionIsChange={props.onSelectionIsChange}
            floorPicking={props.floorPickingOpId === op.id}
            onFloorPick={props.onFloorPick}
            floorLabel={props.floorLabel}
          />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <p className="hint">
            the region is the model's cross-section, re-sliced at every level — start = end
            cuts one simple pocket, a step-down walks a waterline through the band (features
            that curve inside a level come out stepped)
          </p>
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
          <DepthFields
            op={op}
            onChange={props.onChange}
            onSelectionIsChange={props.onSelectionIsChange}
            floorPicking={props.floorPickingOpId === op.id}
            onFloorPick={props.onFloorPick}
            floorLabel={props.floorLabel}
          />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
        </>
      );
    case 'chamfer':
      return (
        <>
          <label className="field">
            <span>Mode</span>
            <select value={op.mode} onChange={(e) => upd({ mode: e.target.value as 'add' | 'existing' })}>
              <option value="add">add — chamfer through the selected edge</option>
              <option value="existing">existing — ride the modelled chamfer face</option>
            </select>
          </label>
          <label className="field">
            <span>Side</span>
            <select
              value={op.side}
              onChange={(e) => upd({ side: e.target.value as 'auto' | 'inside' | 'outside' })}
            >
              <option value="auto">auto — from the feature geometry</option>
              <option value="inside">inside — tool inside the loop</option>
              <option value="outside">outside — tool outside the loop</option>
            </select>
          </label>
          <label className="field">
            <span>Direction</span>
            <select
              value={op.direction}
              onChange={(e) => upd({ direction: e.target.value as 'down' | 'up' })}
            >
              {op.mode === 'add' ? (
                <>
                  <option value="down">down — wall below the edge</option>
                  <option value="up">up — wall above the edge</option>
                </>
              ) : (
                <>
                  <option value="up">up — selected the bottom edge: traced exactly, depth ignored</option>
                  <option value="down">down — selected the top edge: down-and-in by depth</option>
                </>
              )}
            </select>
          </label>
          <NumberField
            label="Chamfer depth (mm)"
            value={op.depth}
            min={0.05}
            step={0.1}
            onCommit={(v) => upd({ depth: v })}
          />
          <p className="hint">
            add cuts a new chamfer through the selected edge (direction = which way the wall
            extends); existing rides a chamfer already in the model — direction selects which end
            you clicked: the bottom edge (up) traces that circle exactly, the top edge (down)
            traces down-and-in by depth. Select circles, or a face to chamfer its outline; width
            follows the bit's angle
          </p>
        </>
      );
  }
}

export function OpsPanel(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  /** the op whose feeds & speeds popup is open (one at a time) */
  const [ratesOpenId, setRatesOpenId] = useState<string | null>(null);

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
    <section className="ops">
      <div className="buttons">
        <button type="button" onClick={props.onAddOp}>
          + Add toolpath
        </button>
      </div>
      {props.ops.length === 0 && (
        <p className="hint">add a toolpath, then select features on the Model tab</p>
      )}
      <div>
        {props.ops.map((op, index) => {
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
                <span className="op-seq">#{index + 1}</span>
                <select
                  className="op-kind"
                  value={op.kind}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const t = props.tools.find((x) => x.id === op.toolId);
                    const next = t
                      ? newJobOp(e.target.value as JobOp['kind'], t, props.materialId, props.stock)
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
                <span className="op-snippet" title={selectionSnippet(op, props.featureLabels)}>
                  {selectionSnippet(op, props.featureLabels)}
                </span>
                <button
                  type="button"
                  className={`icon-btn${props.hiddenOps.has(op.id) ? ' dim' : ''}`}
                  title={
                    props.hiddenOps.has(op.id)
                      ? 'Toolpath hidden — click to show it'
                      : 'Hide this toolpath (the g-code still includes it)'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onToggleVisible(op.id);
                  }}
                >
                  {props.hiddenOps.has(op.id) ? '⊘' : '👁'}
                </button>
                {gen?.error && <span className="op-status" title={gen.error}>⚠</span>}
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
                  {op.kind !== 'index' && (
                    <div className="buttons">
                      {props.floorPickingOpId === op.id ? (
                        /* the floor-picking mode banners the whole row — the
                         * next viewport click is the floor; clicking the
                         * banner cancels back to the normal panel */
                        <button
                          type="button"
                          onClick={() => props.onFloorPick(op)}
                          title="Click a face or circle in the viewport to set this op's floor — click here to cancel"
                        >
                          Selecting floor — click a feature in the viewport
                        </button>
                      ) : (
                        ['pocket', 'profile', 'drill', 'chamfer'].includes(op.kind) && (
                          <button
                            type="button"
                            className={editing ? '' : 'secondary'}
                            onClick={() => props.onSelectFeatures(editing ? null : op.id)}
                          >
                            {editing
                              ? `Selecting… click features in the viewport (${op.featureIds.length})`
                              : `Select features (${op.featureIds.length})`}
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        className={`icon-btn rates-btn${op.rates ? ' has-rates' : ''}${
                          ratesOpenId === op.id ? ' active' : ''
                        }`}
                        title="Feeds & speeds for this operation — defaults from the Tools tab"
                        onClick={() => setRatesOpenId(ratesOpenId === op.id ? null : op.id)}
                      >
                        ⚡
                      </button>
                    </div>
                  )}
                  {ratesOpenId === op.id && op.kind !== 'index' && (
                    <RatesPopup
                      op={op}
                      tool={props.tools.find((t) => t.id === op.toolId)}
                      materialId={props.materialId}
                      onChange={props.onChangeOp}
                    />
                  )}
                  <label className="field">
                    <span>Tool</span>
                    <select value={op.toolId} onChange={(e) => changeTool(op, e.target.value)}>
                      {groupToolsBySubtype(props.tools).map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.tools.map((t) => (
                            <option key={t.id} value={t.id}>
                              {toolOptionLabel(t)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <ParamFields
                    op={op}
                    axisMode={props.axisMode}
                    primitives={props.primitives}
                    tool={props.tools.find((t) => t.id === op.toolId)}
                    onChange={props.onChangeOp}
                    onSelectionIsChange={props.onSelectionIsChange}
                    onIndexToSelection={props.onIndexToSelection}
                    floorPickingOpId={props.floorPickingOpId}
                    onFloorPick={props.onFloorPick}
                    floorLabel={
                      isDepthBearingJobOp(op) && op.floorFeatureId !== null
                        ? (props.featureLabels[op.floorFeatureId] ?? null)
                        : null
                    }
                  />
                  {gen?.error && <p className="error">{gen.error}</p>}
                  {gen?.summary && <p className="hint">{gen.summary}</p>}
                  {!gen && <p className="hint">not calculated yet</p>}
                  {op.kind === 'slicePocket' && !props.hasModel && (
                    <p className="hint">needs a model — the slice comes from the loaded STL</p>
                  )}
                  {!props.hasModel && props.primitives.length === 0 && op.kind !== 'faceCylinder' && op.kind !== 'slicePocket' && (
                    <p className="hint">needs a model or a primitive to select from</p>
                  )}
                  {op.kind === 'faceCylinder' && props.axisMode !== '4-axis' && (
                    <p className="hint">needs 4-axis mode (Stock tab)</p>
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