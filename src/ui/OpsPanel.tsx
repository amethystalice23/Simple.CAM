import { useState } from 'react';
import {
  isDepthBearingJobOp,
  rotaryCalibrationOf,
  type DepthBearingJobOp,
  type FeaturePickKind,
} from '../core/types';
import type { AxisMode, JobOp, OpRates, Primitive, Stock, Tool } from '../core/types';
import { round2 } from '../core/types';
import type { GeneratedOp } from './jobGeneration';
import {
  defaultFaceStepOver,
  defaultStepDown,
  defaultStepOver,
  metricPitch,
  newJobOp,
  OP_KINDS,
  presetRates,
  toolPresetFor,
} from './jobGeneration';
import { groupToolsBySubtype, toolOptionLabel } from './toolNames';
import { NumberField } from './fields';
import { SAFE_CLEARANCE } from '../cam/faceCylinder';
import { isMultiTooth } from '../cam/threadMill';
import { getMaterial } from '../core/materials';

interface Props {
  ops: JobOp[];
  tools: Tool[];
  generated: Record<string, GeneratedOp>;
  editingOpId: string | null;
  expandedOpId: string | null;
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
  /** the active one-shot "adjust to face" pick (edge-tracing §5): the
   * op's ⇩ is lit, the panel banners it, the next viewport click applies */
  picking: { opId: string; kind: FeaturePickKind } | null;
  onFeaturePick: (op: JobOp, kind: FeaturePickKind) => void;
  /** thread: insert a prefilled Face cylinder op right before it */
  onInsertFacingOp: (op: JobOp) => void;
  /** thread mill: insert the prefilled prep op right before it (external =
   * a profile turning the boss, internal = a pocket opening the bore) */
  onInsertPrepOp: (op: JobOp) => void;
  /** ops whose toolpath is hidden from the preview (the g-code keeps them) */
  hiddenOps: ReadonlySet<string>;
  onToggleVisible: (id: string) => void;
  onDeleteOp: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onSelectFeatures: (id: string | null) => void;
  onRecalcOne: (id: string) => void;
  onRecalcAll: () => void;
  /** in-flight generation status ("Generating Waterline contour…"), null
   *  when idle — recalculation is disabled while a pass runs */
  generating?: string | null;
  /** discard all calculated toolpaths (the Clear button — ops keep their
   *  parameters, the preview + export inputs empty until recalculated) */
  onClearToolpaths: () => void;
  onToggleExpanded: (id: string) => void;
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
  /** the active one-shot pick — the floor ⇩ lights when it's this op's */
  picking: { opId: string; kind: FeaturePickKind } | null;
  onFeaturePick: (op: JobOp, kind: FeaturePickKind) => void;
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
          className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'floor' ? ' active' : ''}`}
          title="Pick the cut floor — click, then select a face or circle in the viewport; its Z drives the end depth until you edit the box"
          onClick={() => props.onFeaturePick(op, 'floor')}
        >
          ⇩
        </button>
      </div>
      {op.kind === 'profile' ? (
        <>
          <NumberField
            label="Bottom allowance (mm)"
            value={op.bottomAllowance}
            min={0}
            step={0.05}
            title="Roughing stock RAISED ON THE FLOOR — the cut floor lifts by it"
            onCommit={(v) => upd({ bottomAllowance: v })}
          />
          <NumberField
            label="Side allowance (mm)"
            value={op.sideAllowance}
            step={0.05}
            title="RADIAL stock outside the tool path — SIGNED: positive leaves wall stock for a finishing pass, negative steps the path INSIDE the contour (turns a boss down past its modeled Ø — the thread prep lands the crest at nominal − 2·tolerance)"
            onCommit={(v) => upd({ sideAllowance: v })}
          />
        </>
      ) : (
        <NumberField
          label="Allowance (mm)"
          value={op.allowance}
          min={0}
          step={0.05}
          onCommit={(v) => upd({ allowance: v })}
        />
      )}
      <p className="hint">
        depths are below the stock top · start = end → single finishing pass · allowance = stock
        left for finishing
        {op.floorFeatureId !== null &&
          ` · floor: ${props.floorLabel ?? 'linked feature'} (moves with the model)`}
      </p>
    </>
  );
}

/** The index op: absolute A, plus the ⇩ aim-at-a-feature pick. */
function IndexFields(props: {
  op: Extract<JobOp, { kind: 'index' }>;
  axisMode: AxisMode;
  picking: { opId: string; kind: FeaturePickKind } | null;
  onFeaturePick: (op: JobOp, kind: FeaturePickKind) => void;
  onChange: (op: JobOp) => void;
}) {
  const { op } = props;
  if (props.axisMode !== '4-axis') {
    return <p className="hint">indexing needs 4-axis mode (Stock tab)</p>;
  }
  return (
    <>
      {/* the angle box and its ⇩ pick share a line — the same placement
       * as every other take-it-from-a-feature button */}
      <div className="floor-row">
        <NumberField
          label="Index angle (°, absolute A)"
          className="floor-depth"
          value={op.angle}
          step={15}
          onCommit={(v) => props.onChange({ ...op, angle: v })}
        />
        <button
          type="button"
          className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'indexAngle' ? ' active' : ''}`}
          title="Pick the index angle — click, then select a face or hole in the viewport; its normal (or axis) aligns with Z"
          onClick={() => props.onFeaturePick(op, 'indexAngle')}
        >
          ⇩
        </button>
      </div>
      <p className="hint">
        the stock freezes at this A — every op below runs in the rotated frame
      </p>
    </>
  );
}

/** The one-shot pick-mode banners (edge-tracing §5) — the panel shows
 * the active one; clicking it (or its ⇩ again) cancels. */
const PICK_BANNERS: Record<FeaturePickKind, string> = {
  floor: 'Selecting floor — click a feature in the viewport',
  targetDiameter: 'Selecting target Ø — click a circular feature',
  startX: 'Selecting start X — click a feature in the viewport',
  endX: 'Selecting end X — click a feature in the viewport',
  // banners in the Model tab — the artwork's own ⇩ Ø pick
  wrapDiameter: 'Selecting artwork Ø — click a circular feature',
  indexAngle: 'Selecting index angle — click a face or hole in the viewport',
};

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
  // where the numbers below come from: the tool's own Makera preset row for
  // the stock material, or the built-in fallback table
  const preset = toolPresetFor(tool, props.materialId);
  const materialName = getMaterial(props.materialId).name;
  return (
    <div className="op-rates">
      <p className="hint">
        defaults for {materialName}
        {preset ? ` — tool’s Makera “${preset.material}” preset` : ' — simple.cam fallback table'}
      </p>
      <p className="hint">
        edit only what this one op needs; an edited box overrides the
        default until reset
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
      {tool?.type === 'laser' ? (
        // the ⚡ override on a laser op is beam power — the slot is shared
        <NumberField
          label="Power (%)"
          value={rates.spindleRpm ?? defaults.spindleRpm}
          min={1}
          step={5}
          onCommit={(v) => setRate({ spindleRpm: Math.min(100, Math.max(1, v)) })}
        />
      ) : (
        <NumberField
          label="Spindle (rpm)"
          value={rates.spindleRpm ?? defaults.spindleRpm}
          min={100}
          step={1000}
          onCommit={(v) => setRate({ spindleRpm: v })}
        />
      )}
      <NumberField
        label="Clearance (mm)"
        value={rates.clearance ?? SAFE_CLEARANCE}
        min={1}
        step={1}
        onCommit={(v) => setRate({ clearance: v })}
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

/**
 * Cut-out tabs (profile + slice-pocket outside, the ops that can free a
 * part): N bridges of uncut stock spanning the groove, holding the part
 * to the surrounding frame until it's snapped free. Auto-spaced around
 * the contour; deep levels cut spans around them. The waterline rough
 * needs none of this: its upper-shadow keep-out plus the widest-section
 * stop make it provably unable to sever a part.
 */
function TabsFields(props: {
  op: Extract<JobOp, { kind: 'profile' | 'slicePocket' }>;
  upd: (p: Partial<JobOp>) => void;
}) {
  const { op, upd } = props;
  const tabs = op.tabs;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={tabs !== null}
          onChange={(e) =>
            upd({
              tabs: e.target.checked ? { count: 3, height: 0.5, length: 3 } : null,
            } as Partial<JobOp>)
          }
        />
        <span>tabs — leave holding bridges across the cut</span>
      </label>
      {tabs !== null && (
        <>
          <NumberField
            label="Tab count"
            value={tabs.count}
            min={1}
            step={1}
            onCommit={(v) => upd({ tabs: { ...tabs, count: v } } as Partial<JobOp>)}
          />
          <NumberField
            label="Tab height (mm)"
            value={tabs.height}
            min={0.05}
            step={0.05}
            onCommit={(v) => upd({ tabs: { ...tabs, height: v } } as Partial<JobOp>)}
          />
          <NumberField
            label="Tab length (mm)"
            value={tabs.length}
            min={0.5}
            step={0.5}
            onCommit={(v) => upd({ tabs: { ...tabs, length: v } } as Partial<JobOp>)}
          />
        </>
      )}
    </>
  );
}

/**
 * The 'Finishing pass only' toggle (Alice, 2026-10-26): skip the step-down
 * ladder — go straight down and cut only the finishing pass at the final
 * depth, assuming the bulk is already cleared (a roughing op, or a previous
 * run). One consistent switch across every ladder op; the waterline's
 * semantics differ (scrub the surface, not the depth) and it passes its
 * own title. Checked also HIDES the meaningless step-down field (the
 * waterline keeps its — level density still matters there).
 *
 * `allowanceKey`: the op's roughing-allowance field, ZEROED when the box is
 * ticked ON (a finishing pass cuts to size — the allowance was roughing
 * stock for exactly the ladder being skipped; Alice, 2026-10-26). The user
 * can set it back afterwards; unticking restores nothing. The profile's
 * 2026-10-28 split carries TWO keys (bottom + side) — both zeroed.
 */
function FinishingOnlyCheck(props: {
  /** one of the ten ladder ops (structural — index/drill/chamfer never call this) */
  op: { finishingOnly?: boolean };
  upd: (p: Partial<JobOp>) => void;
  title?: string;
  /** the op's allowance field name(s), zeroed on tick-ON; absent = none */
  allowanceKey?: 'allowance' | 'finishAllowance' | 'bottomAllowance';
  /** the profile's split: the second (side) key zeroed with the first */
  secondAllowanceKey?: 'sideAllowance';
}) {
  return (
    <label
      className="check"
      title={
        props.title ??
        'Skip the roughing ladder — go straight down and cut only the finishing pass at the final depth. Assumes the bulk is already cleared (a roughing op, or a previous run)'
      }
    >
      <input
        type="checkbox"
        checked={props.op.finishingOnly ?? false}
        onChange={(e) => {
          const checked = e.target.checked;
          props.upd({
            finishingOnly: checked,
            ...(checked && props.allowanceKey ? { [props.allowanceKey]: 0 } : {}),
            ...(checked && props.secondAllowanceKey ? { [props.secondAllowanceKey]: 0 } : {}),
          } as Partial<JobOp>);
        }}
      />
      <span>finishing pass only</span>
    </label>
  );
}

/** The per-type parameter fields for an open op panel. */
function ParamFields(props: {
  op: JobOp;
  axisMode: AxisMode;
  /** the stock object — new ops derive their defaults from it */
  stock: Stock;
  primitives: Primitive[];
  /** the op's own tool (undefined if its id dangles after a library edit) */
  tool?: Tool;
  onChange: (op: JobOp) => void;
  onSelectionIsChange: (op: JobOp, value: 'floor' | 'rim') => void;
  /** one-shot feature picks (edge-tracing §5) — see DepthFields */
  picking: { opId: string; kind: FeaturePickKind } | null;
  onFeaturePick: (op: JobOp, kind: FeaturePickKind) => void;
  /** thread: insert a prefilled Face cylinder op right before it */
  onInsertFacingOp: (op: JobOp) => void;
  /** thread mill: insert the prefilled prep op right before it */
  onInsertPrepOp: (op: JobOp) => void;
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
          picking={props.picking}
          onFeaturePick={props.onFeaturePick}
          onChange={props.onChange}
        />
      );
    case 'faceCylinder':
      return (
        <>
          <div className="floor-row">
            <NumberField label="Start X (mm)" value={op.xStart} step={0.5} onCommit={(v) => upd({ xStart: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'startX' ? ' active' : ''}`}
              title="Pick start X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'startX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField label="End X (mm)" value={op.xEnd} step={0.5} onCommit={(v) => upd({ xEnd: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'endX' ? ' active' : ''}`}
              title="Pick end X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'endX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField label="Target Ø (mm)" value={op.targetDiameter} min={0.1} step={0.1} onCommit={(v) => upd({ targetDiameter: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'targetDiameter' ? ' active' : ''}`}
              title="Pick the target diameter from a circular feature — click, then select the circle"
              onClick={() => props.onFeaturePick(op, 'targetDiameter')}
            >
              ⇩
            </button>
          </div>
          <FinishingOnlyCheck op={op} upd={upd} allowanceKey="finishAllowance" />
          {!op.finishingOnly && (
            <>
              <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
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
            </>
          )}
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
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={op.cutBeyondStock ?? false}
              onChange={(e) => upd({ cutBeyondStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>allow tail stock cut-over</span>
          </label>
          <p className="hint">
            X range and target Ø default from the stock — narrow the X range to avoid vice jaws;
            target Ø starts at a 0.5mm skim, set it to your finished size. Step over defaults to
            0.5·tool Ø — the radius, a conservative radial engagement (shown until you set it) —
            and spaces rings, passes, or per-rev advance. Off (default): every level opens and
            closes with a full 360° edge ring — both end walls cut sharp and flush (a rotary
            pocket). On: the spiral may cut past the end faces.
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
            picking={props.picking}
            onFeaturePick={props.onFeaturePick}
            floorLabel={props.floorLabel}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={op.flatten}
              onChange={(e) => upd({ flatten: e.target.checked } as Partial<JobOp>)}
            />
            <span>flatten — cut across interior voids</span>
          </label>
          <FinishingOnlyCheck op={op} upd={upd} allowanceKey="allowance" />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <label
            className="check"
            title="On: the clearing deliberately steps up to one step-over past the selected outline (and the stock edge) — a clean transition past drop-offs at the border. Off: the cut stops at the selected outline."
          >
            <input
              type="checkbox"
              checked={op.cutBeyondStock ?? false}
              onChange={(e) => upd({ cutBeyondStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>step over the edge</span>
          </label>
        </>
      );
    case 'slicePocket':
      return (
        <>
          <NumberField
            label="Slice depth (mm)"
            value={op.sliceDepth}
            min={0}
            step={0.5}
            onCommit={(v) => upd({ sliceDepth: v } as Partial<JobOp>)}
          />
          <label className="field">
            <span>Region</span>
            <select
              value={op.regionMode}
              onChange={(e) => upd({ regionMode: e.target.value as 'outside' | 'inside' })}
            >
              <option value="outside">outside — profile around the section, leave it standing</option>
              <option value="inside">inside — pocket the section interior</option>
            </select>
          </label>
          {op.regionMode === 'outside' && (
            <label className="check">
              <input
                type="checkbox"
                checked={op.clearToStock}
                onChange={(e) => upd({ clearToStock: e.target.checked } as Partial<JobOp>)}
              />
              <span>clear excess stock</span>
            </label>
          )}
          {op.regionMode === 'outside' && <TabsFields op={op} upd={upd} />}
          <DepthFields
            op={op}
            onChange={props.onChange}
            onSelectionIsChange={props.onSelectionIsChange}
            picking={props.picking}
            onFeaturePick={props.onFeaturePick}
            floorLabel={props.floorLabel}
          />
          <FinishingOnlyCheck op={op} upd={upd} allowanceKey="allowance" />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <p className="hint">
            the region is the cross-section at the slice depth — put it where the body is
            clean, away from rounded or chamfered tops (the violet plane in the viewport
            drags). The cut runs start → end depth over that one shape; features that
            change inside the band keep their slice's silhouette
          </p>
        </>
      );
    case 'waterline':
      return (
        <>
          <NumberField label="Allowance (mm)" value={op.allowance} min={0} step={0.05} onCommit={(v) => upd({ allowance: v } as Partial<JobOp>)} />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <NumberField
            label="Boundary margin (mm)"
            // null = derived; show the Ø + allowance + step-over default so
            // the box is never empty (the facing step-over convention)
            value={op.margin ?? (props.tool ? props.tool.diameter + op.allowance + op.stepOver : 3)}
            min={0}
            step={0.1}
            onCommit={(v) => upd({ margin: v } as Partial<JobOp>)}
          />
          <label className="check" title="This allows the tool tip to pass outside of the defined stock's area">
            <input
              type="checkbox"
              checked={op.cutBeyondStock}
              onChange={(e) => upd({ cutBeyondStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>allow tail stock cut-over</span>
          </label>
          <label
            className="check"
            title="Clear all stock outside the model, right out to the stock edge, as each level descends — essential in 4-axis: leftover shelves can bottom out the collet or head, and indexing can break uncleared chunks loose"
          >
            <input
              type="checkbox"
              checked={op.clearToStock ?? false}
              onChange={(e) => upd({ clearToStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>clear excess stock</span>
          </label>
          <NumberField
            label="Max depth (mm)"
            // 0 = down to the model floor; the box reads clean when unlimited
            value={op.maxDepth ?? 0}
            min={0}
            step={0.5}
            title="Stops the ladder this deep below the crown — 0 = down to the model floor. Pre-filled from the tool's flute length (deeper than the flute, the shaft and collet ride into standing stock); override when you know the shape keeps the shaft clear — the simulation's red marks show where the collet would hit"
            onCommit={(v) => upd({ maxDepth: v > 0 ? v : null } as Partial<JobOp>)}
          />
          <FinishingOnlyCheck
            op={op}
            upd={upd}
            allowanceKey="allowance"
            title="Scrub only where the tool TOUCHES the model — the contour band around every section ring (walls, islands, interior contours) plus the flats exposed to the next slice (horizontal surfaces between levels, touched from below within one step-down); free space the rough already cleared is skipped. Waste is cleared only at the level where the ladder bottoms out (the floor, for the cut-out profile to ride in). A flat is scrubbed at the level plane above its surface — a sub-step-down skin can remain unless a plane lands on it (the raster, or a finer step-down, finishes it)"
          />
          <p className="hint">
            roughs the whole model in constant-Z waterline levels from the stock crown down to
            the model floor — or the max depth, if set. No selection needed; works in 4-axis
            indexed mode too (the op follows the datum rotation — run several with index
            rotations between them to rough around a part). Each level clears everything the
            tool can reach around the model's section, minus the union of every cross-section
            ABOVE the level's cut plane — overhangs are keep-out, nothing is ever programmed
            underneath them. Allowance is BOTH-axis roughing stock for a finishing op: every
            level's cut plane rises by it and its clearing region insets from the model contour.
            Follow with a finishing op (allowance 0)
          </p>
          <p className="hint detail">
            the ladder ends at the model's own floor and at its widest section — whichever
            comes first (the max-depth box only throttles it for short tools) — so the stock
            below the part (its holder, in 4-axis mode) is never cleared, and the rough never
            cuts the part free: that is the profile op's job, tabs and all. The boundary margin
            (default: tool Ø + allowance + step over) keeps the moat two tool passes wide, so
            mesh noise on the model's wall cannot pinch the perimeter pass into
            plunge-per-sliver arcs
          </p>
        </>
      );
    case 'contour4d':
      return (
        <>
          <NumberField label="Allowance (mm)" value={op.allowance} min={0} step={0.05} onCommit={(v) => upd({ allowance: v } as Partial<JobOp>)} />
          <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <NumberField
            label="Orientation step (°)"
            value={op.orientStep}
            min={5}
            step={5}
            title="The planner's candidate-ladder spacing: it evaluates every orientation this many degrees apart and picks the minimal set that covers the model. Denser ladders cost more planning time and may shave an orientation off the chosen set; 30° is the default"
            onCommit={(v) => upd({ orientStep: v } as Partial<JobOp>)}
          />
          <NumberField
            label="Max depth (mm)"
            value={op.maxDepth ?? 0}
            min={0}
            step={0.5}
            title="Per-orientation roughing depth limit below the crown — pre-filled from the tool's flute length, same as the waterline: deeper than the flute, the shaft and collet ride into standing stock. Override when you know the shape keeps the shaft clear — the simulation's red marks check the claim"
            onCommit={(v) => upd({ maxDepth: v > 0 ? v : null } as Partial<JobOp>)}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={op.clearToStock}
              onChange={(e) => upd({ clearToStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>clear excess stock</span>
          </label>
          <FinishingOnlyCheck
            op={op}
            upd={upd}
            allowanceKey="allowance"
            title="Per-orientation finishing scrub only — passed through to each chosen angle's rough"
          />
          <p className="hint">
            plans its own index angles: no hand-tuned orientation stacks. The planner maps which
            surface cells each candidate angle can clear, greedily picks the minimal set that
            covers the model, and emits a rough at every chosen angle — the chosen angles, the
            coverage, and the honest unreachable set (deep undercuts no angle reaches) all report
            in the summary. The roughing fields apply to each chosen angle's pass.
          </p>
        </>
      );
    case 'rasterContour':
      return (
        <>
          <NumberField label="Allowance (mm)" value={op.allowance} min={0} step={0.05} onCommit={(v) => upd({ allowance: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <FinishingOnlyCheck
            op={op}
            upd={upd}
            allowanceKey="allowance"
            title="The single surface pass, no flat roughing levels — replaces the old step-down-0 convention. Unchecked = rough in flat levels at the step-down first, then the finishing pass on the surface"
          />
          {!op.finishingOnly && (
            <NumberField
              label="Step down (mm)"
              value={op.stepDown ?? 0}
              min={0.1}
              step={0.1}
              onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)}
            />
          )}
          <NumberField
            label="Row angle (°)"
            value={op.angle ?? 0}
            step={5}
            onCommit={(v) => upd({ angle: v } as Partial<JobOp>)}
          />
          <label
            className="check"
            title="Clear all stock outside the model, right out to the stock edge — waste cells finish flat at the model's own floor (the same plane the waterline ladder bottoms at). Mind that this frees the part from the surrounding stock: the deliberate cut-out stays the profile op's job, tabs and all"
          >
            <input
              type="checkbox"
              checked={op.clearToStock ?? false}
              onChange={(e) => upd({ clearToStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>clear excess stock</span>
          </label>
          <label
            className="check"
            title="This allows the tool tip to pass outside of the defined stock's area"
          >
            <input
              type="checkbox"
              checked={op.cutBeyondStock ?? false}
              onChange={(e) => upd({ cutBeyondStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>allow tail stock cut-over</span>
          </label>
          <p className="hint">
            the paired SURFACE pass to the waterline contour: a heightmap of the model is taken by
            downward raycasts, dilated with the tool's kernel (flat disc / ball hemisphere) so every
            sweep clears to the tool-compensated surface, and cut in serpentine rows at this step
            over — cutting only where material sits above the surface (no air cutting). No
            selection, no depth boxes: the stock crown is the ceiling, the model's surface sets
            every z. Run it after a waterline contour with allowance (the rough): this op's
            allowance is the only rough-vs-finish knob — 0 cuts to the model surface. Assumes bulk
            stock is already cleared; warns when a plunge would run deeper than a surface pass
            should. Works in 4-axis indexed mode like the waterline op. Row angle 0 = rows run
            along X; 90 = along Y; any angle works, and a 0° + 90° pair gives the cross-hatch
            "both directions" finish
          </p>
        </>
      );
    case 'rotaryCarve':
      return (
        <>
          <NumberField label="Allowance (mm)" value={op.allowance} min={0} step={0.05} onCommit={(v) => upd({ allowance: v } as Partial<JobOp>)} />
          <NumberField label="Step over (mm)" value={op.stepOver} min={0.1} step={0.1} onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)} />
          <FinishingOnlyCheck
            op={op}
            upd={upd}
            allowanceKey="allowance"
            title="The single surface pass, no roughing ladder. Unchecked = the Makera-style ladder first: a complete full-wrap sweep at each depth level, descending until a level has nothing left to cut — then the finishing pass on the surface"
          />
          {!op.finishingOnly && (
            <NumberField
              label="Step down (mm)"
              value={op.stepDown}
              min={0.1}
              step={0.1}
              onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)}
            />
          )}
          <label className="field" title="How each sweep crosses the surface. Horizontal cuts along X at full feed and rapids the A step between rows; vertical cuts continuous A rings at constant X (rotary-ceiling limited); spiral wrap advances X continuously while A turns — the strategy Makera Studio does not have">
            <span>Strategy</span>
            <select
              value={op.strategy}
              onChange={(e) =>
                upd({ strategy: e.target.value as 'horizontal' | 'vertical' | 'spiralWrap' } as Partial<JobOp>)
              }
            >
              <option value="horizontal">horizontal — X passes, rapid A steps</option>
              <option value="vertical">vertical — continuous A rings</option>
              <option value="spiralWrap">spiral wrap — one helix per sweep</option>
            </select>
          </label>
          <p className="hint">
            the raster core in the unwrapped (x, θ) frame: a dexel map of the model's OUTER surface
            radius is taken by radial raycasts, dilated with the tool's kernel, and ONE op roughs and
            finishes — a complete full-wrap sweep at each depth level before descending the ladder,
            ending at the first level with nothing left to cut, then the finishing pass follows the
            compensated surface itself. No selection: the whole model on the stock's rotation axis is
            the target. A accumulates across wraps (the post keeps the counter small); material behind
            an air gap along a ray is reported, never left as a silent mystery. Cylinder stock, model on
            its axis, 4-axis mode
          </p>
        </>
      );
    case 'spiralCarve':
      return (
        <>
          <div className="floor-row">
            <NumberField label="Start X (mm)" value={op.xStart} step={0.5} onCommit={(v) => upd({ xStart: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'startX' ? ' active' : ''}`}
              title="Pick start X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'startX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField label="End X (mm)" value={op.xEnd} step={0.5} onCommit={(v) => upd({ xEnd: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'endX' ? ' active' : ''}`}
              title="Pick end X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'endX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField label="Surface Ø (mm)" title="The actual outer Ø of the surface being carved — blank = the stock surface; set it after a facing/turning pass so the tool starts at the real surface" value={op.surfaceDiameter} min={0.1} step={0.1} onCommit={(v) => upd({ surfaceDiameter: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'targetDiameter' ? ' active' : ''}`}
              title="Pick the surface Ø from a circular feature — click, then select the circle"
              onClick={() => props.onFeaturePick(op, 'targetDiameter')}
            >
              ⇩
            </button>
          </div>
          <NumberField label="Spiral angle (°)" value={op.spiralAngle} min={0.1} step={5} onCommit={(v) => upd({ spiralAngle: Math.min(Math.max(v, 0.1), 90) } as Partial<JobOp>)} />
          <NumberField
            label="Spin (°)"
            title="Starting A of strand 1, degrees — where strand 1 starts around the cylinder. Rotates the whole strand pattern (spacing is preserved) and stacks additively with the index datum; any value works, positioning is shortest-rotation. Default 0 = first strand at the datum"
            value={op.spin ?? 0}
            step={5}
            onCommit={(v) => upd({ spin: v } as Partial<JobOp>)}
          />
          <NumberField label="Strands (around 360°)" value={op.count} min={1} step={1} onCommit={(v) => upd({ count: Math.max(1, Math.round(v)) } as Partial<JobOp>)} />
          <NumberField label="Depth (mm)" value={op.depth} min={0.1} step={0.1} onCommit={(v) => upd({ depth: v } as Partial<JobOp>)} />
          <NumberField label="Width (mm)" title="0 = just follow the lines — no width fan, the groove is the tool's own cut (V-bit knurling)" value={op.width} min={0} step={0.1} onCommit={(v) => upd({ width: v } as Partial<JobOp>)} />
          {props.tool && op.width > 0 && op.width < props.tool.diameter - 1e-9 && (
            <p className="hint warn">
              a {round2(props.tool.diameter)}mm tool can't follow a {round2(op.width)}mm line —
              the groove comes out ~{round2(props.tool.diameter)}mm wide. Set 0 if you mean to
              just follow the lines
            </p>
          )}
          {op.width === 0 && (
            <p className="hint">
              width 0: just following the lines —{' '}
              {props.tool?.type === 'vbit'
                ? 'the groove width comes from the depth and the bit angle'
                : `the groove is the tool's own ${round2(props.tool?.diameter ?? 0)}mm width`}
            </p>
          )}
          <FinishingOnlyCheck op={op} upd={upd} />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' })}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
          <p className="hint">
            helical grooves about the stock axis — angle off the circumferential direction
            (90° = axial lines), strands evenly around 360° — spin is where strand 1
            starts around the cylinder — depth per step-down ladder whose
            levels retrace the same groove. Width wider than the tool Ø fans parallel passes;
            width 0 just follows the lines (the tool cuts its own width — knurling).
            Defaults from the stock; the ⇩ picks fill the area off the model
          </p>
        </>
      );
    case 'thread':
      return (
        <>
          <div className="floor-row">
            <NumberField label="Start X (mm)" value={op.xStart} step={0.5} onCommit={(v) => upd({ xStart: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'startX' ? ' active' : ''}`}
              title="Pick start X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'startX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField label="End X (mm)" value={op.xEnd} step={0.5} onCommit={(v) => upd({ xEnd: v } as Partial<JobOp>)} />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'endX' ? ' active' : ''}`}
              title="Pick end X from a feature — click, then select one in the viewport"
              onClick={() => props.onFeaturePick(op, 'endX')}
            >
              ⇩
            </button>
          </div>
          <div className="floor-row">
            <NumberField
              label="Nominal Ø (mm)"
              value={op.nominalDiameter}
              min={0.1}
              step={0.1}
              // editing the size fills the standard coarse pitch (M6 → 1.0)
              onCommit={(v) =>
                upd({ nominalDiameter: v, pitch: metricPitch(v) ?? op.pitch } as Partial<JobOp>)
              }
            />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'targetDiameter' ? ' active' : ''}`}
              title="Pick the nominal Ø from a circular feature — click, then select the circle"
              onClick={() => props.onFeaturePick(op, 'targetDiameter')}
            >
              ⇩
            </button>
          </div>
          <NumberField label="Pitch (mm)" value={op.pitch} min={0.1} step={0.25} onCommit={(v) => upd({ pitch: v } as Partial<JobOp>)} />
          <NumberField label="Starts" value={op.starts} min={1} step={1} onCommit={(v) => upd({ starts: Math.max(1, Math.round(v)) } as Partial<JobOp>)} />
          <NumberField label="Tolerance (mm)" value={op.tolerance} min={0} step={0.05} onCommit={(v) => upd({ tolerance: Math.max(v, 0) } as Partial<JobOp>)} />
          <FinishingOnlyCheck op={op} upd={upd} />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <NumberField
            // null = the stock surface; show the stock Ø until set
            label="Surface Ø (mm)"
            value={op.surfaceDiameter ?? rotaryCalibrationOf(props.stock).effectiveRadius * 2}
            min={0.1}
            step={0.1}
            title="The actual outer Ø of the part at the thread — grooves start at this surface. Not a depth: blank = the stock surface (the default); set it when a facing/turning pass has turned the diameter down, so the tool skips the empty air between stock and surface"
            onCommit={(v) => upd({ surfaceDiameter: v } as Partial<JobOp>)}
          />
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' })}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
          <div className="buttons">
            <button
              type="button"
              className="secondary"
              disabled={props.axisMode !== '4-axis'}
              onClick={() => props.onInsertFacingOp(op)}
              title="Insert a Face cylinder toolpath right before this thread, prefilled to face the crest Ø — its own tool, feeds, and step-over"
            >
              Add facing toolpath
            </button>
          </div>
          <p className="hint">
            external V-bit thread — groove depth derives from pitch, the bit's angle, and
            tolerance (crest Ø = nominal − 2·tolerance; grooves cut deeper by it). Editing
            the nominal Ø fills the standard coarse pitch (M6 → 1.0, M4 → 0.7…); override
            it freely. Fit is empirical — cut a test coupon before committing the part
          </p>
        </>
      );
    case 'threadMill':
      return (
        <>
          <label className="field">
            <span>Thread</span>
            <select
              value={op.internal ? 'internal' : 'external'}
              onChange={(e) => upd({ internal: e.target.value === 'internal' } as Partial<JobOp>)}
            >
              <option value="internal">internal (bore)</option>
              <option value="external">external (boss)</option>
            </select>
          </label>
          <div className="floor-row">
            <NumberField
              label="Nominal Ø (mm)"
              value={op.nominalDiameter}
              min={0.1}
              step={0.1}
              // editing the size fills the standard coarse pitch (M6 → 1.0)
              onCommit={(v) =>
                upd({ nominalDiameter: v, pitch: metricPitch(v) ?? op.pitch } as Partial<JobOp>)
              }
            />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'targetDiameter' ? ' active' : ''}`}
              title="Pick the nominal Ø from a circular feature — click, then select the circle"
              onClick={() => props.onFeaturePick(op, 'targetDiameter')}
            >
              ⇩
            </button>
          </div>
          <NumberField
            label="Pitch (mm)"
            value={op.pitch}
            min={0.1}
            step={0.05}
            // a multi-tooth thread mill LOCKS the pitch — its teeth sit at
            // one fixed pitch and must ride successive turns of the groove
            // (Alice, 2026-10-28); a 1-tooth mill cuts any pitch with its
            // single profile, the recorded pitch just the nominal default
            disabled={props.tool ? isMultiTooth(props.tool) : false}
            title={
              props.tool && isMultiTooth(props.tool)
                ? `Locked to the ${props.tool.name} — its ${(props.tool.flutes ?? 1)} teeth are pitched ${props.tool.pitch}mm apart and must ride successive turns of one groove`
                : 'Free pitch — a single-tooth mill cuts any pitch with its one profile (defaults to the tool record, else ISO coarse)'
            }
            onCommit={(v) => upd({ pitch: v } as Partial<JobOp>)}
          />
          <NumberField label="Starts" value={op.starts} min={1} step={1} onCommit={(v) => upd({ starts: Math.max(1, Math.round(v)) } as Partial<JobOp>)} />
          <NumberField label="Tolerance (mm)" value={op.tolerance} min={0} step={0.05} onCommit={(v) => upd({ tolerance: Math.max(v, 0) } as Partial<JobOp>)} />
          <NumberField
            label="Step over (mm)"
            value={op.stepOver}
            min={0}
            step={0.05}
            title="Radial depth per pass — 0 (default) cuts the full form in one pass, the Makera cycle; set ~0.2–0.3 for tougher materials to work the form down in even radial steps"
            onCommit={(v) => upd({ stepOver: Math.max(v, 0) } as Partial<JobOp>)}
          />
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' } as Partial<JobOp>)}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
          <NumberField label="Start depth (mm)" value={op.startDepth} min={0} step={0.1} onCommit={(v) => upd({ startDepth: Math.max(v, 0) } as Partial<JobOp>)} />
          <NumberField label="End depth (mm)" value={op.endDepth} min={0.1} step={0.1} onCommit={(v) => upd({ endDepth: v } as Partial<JobOp>)} />
          <div className="buttons">
            <button
              type="button"
              className="secondary"
              onClick={() => props.onInsertPrepOp(op)}
              title="Insert the prep toolpath right before this thread — external: a profile turning the boss to the major Ø (waste cleared to the stock wall); internal: a pocket opening the bore to the minor Ø. Its own tool and feeds, fully editable"
            >
              Add prep toolpath
            </button>
          </div>
          <p className="hint">
            single-profile thread mill, cut bottom-up in one helix per start (a full second
            spring pass, like Makera's own 14×1 example). The fit is radial: tolerance shifts
            the helix, the tool cuts its own full form. Step over 0 = the full form in one
            pass; set it to split the form into radial steps for tough materials. Internal
            retract picks itself — pull aside and lift when the cleared bore has room, follow
            the spiral out when it doesn't. Rotation names the thread like the 4-axis Thread
            op does (their 14ccw example is a ccw thread)
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
          {op.side === 'outside' && (
            <label className="check">
              <input
                type="checkbox"
                checked={op.clearToStock}
                onChange={(e) => upd({ clearToStock: e.target.checked } as Partial<JobOp>)}
              />
              <span>clear excess stock</span>
            </label>
          )}
          <DepthFields
            op={op}
            onChange={props.onChange}
            onSelectionIsChange={props.onSelectionIsChange}
            picking={props.picking}
            onFeaturePick={props.onFeaturePick}
            floorLabel={props.floorLabel}
          />
          {/* the 2026-10-28 split: BOTH profile allowances are roughing stock
           * for the skipped ladder — a finishing pass cuts to size */}
          <FinishingOnlyCheck op={op} upd={upd} allowanceKey="bottomAllowance" secondAllowanceKey="sideAllowance" />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <TabsFields op={op} upd={upd} />
          <label
            className="check"
            title="On: the wall pass may leave the declared stock so the loop stays intact where it runs out of material. Off: the pass clips to the stock edge — open spans at the border."
          >
            <input
              type="checkbox"
              checked={op.cutBeyondStock ?? false}
              onChange={(e) => upd({ cutBeyondStock: e.target.checked } as Partial<JobOp>)}
            />
            <span>keep the loop past the stock edge</span>
          </label>
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
    case 'cylChamfer':
      return (
        <>
          <NumberField
            label="Depth (mm)"
            title="0 = anchor exactly on the selected circle — the flank cuts up-and-out through whatever rises above it (a step wall, the root of an existing chamfer). Above 0 = the circle is the highest point — the tip slides below it and the chamfer opens outward (a rod end, a chamfer top)"
            value={op.depth}
            min={0}
            step={0.1}
            onCommit={(v) => upd({ depth: Math.max(v, 0) } as Partial<JobOp>)}
          />
          <FinishingOnlyCheck op={op} upd={upd} />
          {!op.finishingOnly && (
            <NumberField label="Step down (mm)" value={op.stepDown} min={0.1} step={0.1} onCommit={(v) => upd({ stepDown: v } as Partial<JobOp>)} />
          )}
          <label className="field">
            <span>Rotation</span>
            <select value={op.rotation} onChange={(e) => upd({ rotation: e.target.value as 'cw' | 'ccw' })}>
              <option value="cw">cw</option>
              <option value="ccw">ccw</option>
            </select>
          </label>
          <p className="hint">
            chamfers edge circles around the stock axis — one full A revolution at the circle's
            exact X, the V-bit flank through it, no side to pick (the cone cuts whichever side of
            X carries material). Depth 0 anchors on the circle and peels the wall above it level by
            level from the stock surface; a depth slides below the circle from an already-clear rim
            (width = depth × tan(half the bit angle), the chamfer angle = 90° − half-angle). Face
            cylinder ops publish their step edges at their target Ø, and the stock its end rims, as
            selectable green circles; a rod-end chamfer = the end rim + a depth
          </p>
        </>
      );
    case 'engrave':
      return (
        <>
          {props.tool?.type === 'laser' ? (
            <p className="hint">
              laser: a single pass at the tool's focus height — depth is ignored, power comes from
              the tool (or the ⚡ override) and lands as the S word on the cut lines
            </p>
          ) : (
            <>
              <NumberField
                label="Depth (mm)"
                value={op.depth}
                min={0.05}
                step={0.1}
                onCommit={(v) => upd({ depth: v })}
              />
              <FinishingOnlyCheck op={op} upd={upd} />
              {!op.finishingOnly && (
                <NumberField
                  label="Step down (mm)"
                  value={op.stepDown}
                  min={0.05}
                  step={0.1}
                  onCommit={(v) => upd({ stepDown: v })}
                />
              )}
            </>
          )}
          <p className="hint">
            follows the selected artwork paths at depth — no tool offset, the centerline IS the
            path. The frame comes from the artwork itself: flat artwork cuts in its plane, wrapped
            artwork cuts around its own Ø (point that at the faced surface — the Model tab). Drop
            an SVG on the viewport to add artwork; a V-bit or small flat bit is usual
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
      const stepOver = defaultStepOver(t);
      // per-kind fields (types.ts is the source of truth): every kind with
      // a stepDown gets the new cutter's default, and every stepOver-bearing
      // kind re-derives it — a stale Ø-derived stepOver from the OLD tool is
      // the bug Alice caught 2026-10-25
      switch (op.kind) {
        case 'waterline':
          // the maxDepth default follows the new cutter's flute (the
          // 2026-29 pre-populate ruling — same class as stepOver: a
          // stale flute-derived ceiling from the OLD tool is wrong)
          next = { ...next, stepDown, stepOver, maxDepth: t.fluteLength ?? null } as JobOp;
          break;
        case 'pocket':
        case 'slicePocket':
        case 'faceCylinder':
        case 'rotaryCarve':
          next = { ...next, stepDown, stepOver } as JobOp;
          break;
        case 'rasterContour':
          next = { ...next, stepOver } as JobOp;
          break;
        case 'threadMill': {
          // the pitch follows the tool (Alice, 2026-10-28: "as these
          // threadmill bits have fixed pitch you should set and disable
          // the pitch when one is selected"): a fixed-pitch mill locks it
          // (and the panel disables the box); a pitch-less kind (a
          // single-tooth mill) keeps it editable but still defaults —
          // to the ISO coarse pitch for the nominal Ø
          const tm = next as Extract<JobOp, { kind: 'threadMill' }>;
          next = {
            ...tm,
            pitch: t.pitch ?? metricPitch(tm.nominalDiameter) ?? tm.pitch,
          };
          break;
        }
        case 'profile':
        case 'cylChamfer':
        case 'spiralCarve':
        case 'thread':
        case 'engrave':
          next = { ...next, stepDown } as JobOp;
          break;
        default:
          break; // drill/chamfer/index carry no step fields
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
                    <option
                      key={k.kind}
                      value={k.kind}
                      // the rotary ops wait for 4-axis mode (Stock tab)
                      disabled={k.rotaryOnly && props.axisMode !== '4-axis'}
                    >
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
                  title={props.generating ?? 'Recalculate this toolpath'}
                  disabled={!!props.generating}
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
                  {/* index ops carry no tool and no feature selection —
                   * they show this row only while their ⇩ aim pick is
                   * armed, for the cancel banner */}
                  {(op.kind !== 'index' || props.picking?.opId === op.id) && (
                    <div className="buttons">
                      {props.picking?.opId === op.id ? (
                        /* the pick mode banners the whole row — the next
                         * viewport click applies it; clicking the banner
                         * cancels back to the normal panel */
                        <button
                          type="button"
                          onClick={() => props.onFeaturePick(op, props.picking!.kind)}
                          title="Click a feature in the viewport to apply the pick — click here to cancel"
                        >
                          {PICK_BANNERS[props.picking!.kind]}
                        </button>
                      ) : (
                        ['pocket', 'profile', 'drill', 'chamfer', 'cylChamfer', 'engrave', 'threadMill'].includes(op.kind) && (
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
                      {op.kind !== 'index' && (
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
                      )}
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
                  {op.kind !== 'index' && (
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
                  )}
                  <ParamFields
                    op={op}
                    axisMode={props.axisMode}
                    stock={props.stock}
                    primitives={props.primitives}
                    tool={props.tools.find((t) => t.id === op.toolId)}
                    onChange={props.onChangeOp}
                    onSelectionIsChange={props.onSelectionIsChange}
                    picking={props.picking}
                    onFeaturePick={props.onFeaturePick}
                    onInsertFacingOp={props.onInsertFacingOp}
                    onInsertPrepOp={props.onInsertPrepOp}
                    floorLabel={
                      isDepthBearingJobOp(op) && op.floorFeatureId !== null
                        ? (props.featureLabels[op.floorFeatureId] ?? null)
                        : null
                    }
                  />
                  {gen?.error && <p className="error">{gen.error}</p>}
                  {gen?.summary && <p className="hint">{gen.summary}</p>}
                  {!gen && <p className="hint">not calculated yet</p>}
                  {(op.kind === 'slicePocket' || op.kind === 'waterline' || op.kind === 'rasterContour' || op.kind === 'rotaryCarve') && !props.hasModel && (
                    <p className="hint">needs a model — the geometry comes from the loaded STL</p>
                  )}
                  {!props.hasModel && props.primitives.length === 0 && op.kind !== 'faceCylinder' && op.kind !== 'slicePocket' && op.kind !== 'waterline' && op.kind !== 'rasterContour' && op.kind !== 'rotaryCarve' && (
                    <p className="hint">needs a model or a primitive to select from</p>
                  )}
                  {(op.kind === 'faceCylinder' || op.kind === 'spiralCarve' || op.kind === 'thread' || op.kind === 'cylChamfer' || op.kind === 'rotaryCarve') && props.axisMode !== '4-axis' && (
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
          {props.generating && (
            <span className="hint generating" title="Heavy operations run in a background worker — the app stays responsive">
              {props.generating}
            </span>
          )}
          <button type="button" onClick={props.onRecalcAll} disabled={!!props.generating}>
            Recalculate
          </button>
          <button
            type="button"
            title="Discard all calculated toolpaths (the ops keep their parameters; nothing is exported until recalculated)"
            onClick={props.onClearToolpaths}
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}