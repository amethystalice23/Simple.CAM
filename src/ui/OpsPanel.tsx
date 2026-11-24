import { Fragment, useEffect, useState } from 'react';
import {
  isDepthBearingJobOp,
  rotaryCalibrationOf,
  type DepthBearingJobOp,
  type FeaturePickKind,
} from '../core/types';
import type { AxisMode, JobOp, OpRates, OriginEdge, Primitive, Stock, Tool } from '../core/types';
import { round2 } from '../core/types';
import { DITHER_METHODS, DEFAULT_DITHER_METHOD, type DitherMethod } from '../core/dither';
import type { GeneratedOp } from './jobGeneration';
import {
  advisedOpRates,
  defaultFaceStepOver,
  defaultStepDown,
  defaultStepOver,
  engraveFillStepOver,
  FIXTURE_POSES,
  IMPLICIT_FIXTURE_ID,
  FIXTURE_ORIGINS,
  metricPitch,
  newJobOp,
  OP_KINDS,
  POSE_LABELS,
  presetRates,
  toolPresetFor,
} from './jobGeneration';
import { fixtureOrigin } from './placement';
import { vbitConeHeight } from '../cam/vcarveFlat';
import { pickToolForKind, toolFitsKind } from './opSuggest';
import { panelToolNumbers } from './toolAssignment';
import { sectionLabel } from './opsSections';
import { OP_KIND_COLORS } from './opColors';
import { OP_HELP, opHelpLabel } from './opHelp';
import { ToolPicker } from './ToolPicker';
import { Segmented } from './fields';

/** the ⓘ affordance — help lives behind it, never as dropped paragraphs
 * (2026-11-11); the warn variant marks URGENT live constraints */
function InfoTip({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <button type="button" className={`info-tip${warn ? ' warn' : ''}`} title={text}>
      {warn ? '⚠' : 'ⓘ'}
    </button>
  );
}

/** the op's ⓘ popup: what this op does and what its knobs mean */
function OpHelpPopup({ kind, onClose }: { kind: JobOp['kind']; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay">
      <div className="modal op-help-modal" role="dialog" aria-modal="true" aria-label={`${opHelpLabel(kind)} — what it does`}>
        <h2>
          {opHelpLabel(kind)} — what it does
          <button type="button" className="icon-btn" title="Close (Esc)" onClick={onClose}>
            ✕
          </button>
        </h2>
        <p className="op-help-text">{OP_HELP[kind].what}</p>
        <ul className="op-help-points">
          {OP_HELP[kind].points.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
import { NumberField } from './fields';
import { SAFE_CLEARANCE } from '../cam/faceCylinder';
import { isMultiTooth } from '../cam/threadMill';
import { slotToolWidth } from '../cam/spiralCarve';
import { getMaterial } from '../core/materials';
import { cutAdvice, derivedTrochoidRates } from '../core/cutAdvisor';
import { AE_FACTOR, trochoidDepthLegs } from '../cam/adaptive';

interface Props {
  ops: JobOp[];
  tools: Tool[];
  generated: Record<string, GeneratedOp>;
  editingOpId: string | null;
  expandedOpId: string | null;
  hasModel: boolean;
  /** machine capability — gates the rotary ops (index, rotary face) */
  axisMode: AxisMode;
  /** the stock object — new ops derive their defaults from it */
  stock: Stock;
  /** stock material id, for tool-appropriate step defaults */
  materialId: string;
  /** user-added primitives (face ops can target a cylinder) */
  primitives: Primitive[];
  /** short feature description by id, for the title-bar snippet */
  featureLabels: Record<string, string>;
  /** add a toolpath at the END of one fixture section (its id — the implicit
   *  fixture 1's for the start setup). The panel's add rows pass the section
   *  they sit under; App splices before that section's next divider. */
  onAddOp: (sectionId: string) => void;
  /** arm the suggest-ops picker (docs/PLAN.md "Suggest ops", round 1) for
   *  one fixture section: the next viewport feature pick opens the
   *  knowledge popup instead of selecting, and the checked suggestions land
   *  at that section's end — App owns the state; the panel only arms and
   *  labels it */
  onSuggestOps: (sectionId: string) => void;
  /** the armed pick's TARGET SECTION id, null when idle — the section's own
   *  + Suggest button labels itself live */
  suggestArmed: string | null;
  onChangeOp: (op: JobOp) => void;
  /** floor/rim switch — re-prefills the depth boxes from the selection */
  onSelectionIsChange: (op: JobOp, value: 'floor' | 'rim') => void;
  /** the active one-shot "adjust to face" pick (edge-tracing §5): the
   * op's ⇩ is lit, the panel banners it, the next viewport click applies */
  picking: { opId: string; kind: FeaturePickKind } | null;
  onFeaturePick: (op: JobOp, kind: FeaturePickKind) => void;
  /** thread: insert a prefilled Rotary face op right before it */
  onInsertFacingOp: (op: JobOp) => void;
  /** thread mill: insert the prefilled prep op right before it (external =
   * a profile turning the boss, internal = a pocket opening the bore) */
  onInsertPrepOp: (op: JobOp) => void;
  /** ops whose toolpath is hidden from the preview (the g-code keeps them) */
  hiddenOps: ReadonlySet<string>;
  onToggleVisible: (id: string) => void;
  onDeleteOp: (id: string) => void;
  /** duplicate an op right below itself — the rough + finish pairing
   * (docs/TODO.md): kind, tool, features, and field values carried,
   * a fresh id; the copy lands expanded for immediate editing */
  onDuplicateOp: (id: string) => void;
  onReorder: (dragId: string, targetId: string) => void;
  onSelectFeatures: (id: string | null) => void;
  onRecalcOne: (id: string) => void;
  onRecalcAll: () => void;
  /** in-flight generation status ("Generating Waterline Contour…"), null
   *  when idle — recalculation is disabled while a pass runs */
  generating?: string | null;
  /** discard all calculated toolpaths (the Clear button — ops keep their
   *  parameters, the preview + export inputs empty until recalculated) */
  onClearToolpaths: () => void;
  onToggleExpanded: (id: string) => void;
  /** FIXTURE OPS (the spec's collapse): fixture-op ids whose group is
   *  collapsed — the divider row stays, the ops under it hide */
  collapsedGroups: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  /** preview OP FOCUS (the spec's per-op colours): hovering a row focuses
   *  its op's paths (every other op dims); null clears. App owns the
   *  state — the viewport consumes it. */
  onHoverOp: (id: string | null) => void;
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
      <InfoTip text="depths are below the stock top · start = end → single finishing pass · allowance = stock left for finishing" />
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
    return <InfoTip warn text="indexing needs 4-axis mode (Stock tab)" />;
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
      <InfoTip text="the stock freezes at this A — every op below runs in the rotated frame" />
    </>
  );
}

/** The fixture op's editor: pose + mode + origin. DUMMY — these
 * values are recorded and displayed, not yet applied to generation. */
function FixtureFields(props: {
  op: Extract<JobOp, { kind: 'fixture' }>;
  axisMode: AxisMode;
  /** the stock the job's frame 1 inherits from — shapes the origin
   * controls (Alice, 2026-11-19): the box gets the X/Y/Z grid, the
   * cylinder the single along-axis segmented control, both exactly as
   * the Stock page draws them, with an inherit-from-Stock reset. */
  stock: Stock;
  onChange: (op: JobOp) => void;
}) {
  const { op } = props;
  const upd = (patch: Partial<typeof op>) => props.onChange({ ...op, ...patch } as JobOp);
  const s = props.stock;
  // the op's origin, read through the STOCK's shape: a box job edits a
  // per-axis triple, a cylinder job the single along-axis edge — the same
  // shapes the Stock page edits. null (inherit) or a wrong-shape leftover
  // (a box save re-opened after a stock-kind flip) both fall back to the
  // Stock page's own edges in the display.
  const boxTriple =
    op.origin !== null && typeof op.origin === 'object' ? op.origin : null;
  const cylEdge: OriginEdge | null =
    typeof op.origin === 'string' ? op.origin : null;
  return (
    <>
      <label className="field">
        <span>Pose</span>
        <select value={op.pose} onChange={(e) => upd({ pose: e.target.value as typeof op.pose })}>
          {FIXTURE_POSES.map((p) => (
            <option key={p} value={p}>
              {POSE_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Machine mode after re-clamp</span>
        <select
          value={op.axisMode}
          onChange={(e) => upd({ axisMode: e.target.value as AxisMode })}
        >
          <option value="3-axis">3-axis</option>
          <option value="4-axis">4-axis</option>
        </select>
      </label>
      <div className="field">
        <span>Origin in stock</span>
        <div className="origin-grid">
          {s.kind === 'box' ? (
            /* the box: the Stock page's own X/Y/Z grid — one edge per axis.
             * While inherited (null) the three Segmented mirror the Stock
             * page's triple; the first edit freezes a full triple of its own. */
            (['x', 'y', 'z'] as const).map((axis) => (
              <div className="field" key={axis}>
                <span>{axis.toUpperCase()}</span>
                <Segmented
                  options={FIXTURE_ORIGINS}
                  value={(boxTriple ?? s.origin)[axis]}
                  onChange={(v) => upd({ origin: { ...(boxTriple ?? s.origin), [axis]: v } })}
                />
              </div>
            ))
          ) : (
            /* the cylinder: one along-axis edge, labeled as the Stock page
             * labels it for the mode this re-clamp ends in (op.axisMode —
             * a 4-axis cylinder stood up in a vice becomes a Z axis). While
             * inherited (null) the Segmented mirrors the RESOLVED default —
             * a 4→3 stand-up defaults Z0 to the TOP FACE (max, the
             * z-probeable surface); anything else inherits the stock's
             * X0 choice. */
            <div className="field">
              <span>{op.axisMode === '3-axis' ? 'Z0 along axis' : 'X0 along axis'}</span>
              <Segmented
                options={FIXTURE_ORIGINS}
                value={
                  cylEdge ??
                  fixtureOrigin(s, op.axisMode, null) as OriginEdge
                }
                onChange={(v) => upd({ origin: v })}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className={`icon-btn${op.origin === null ? ' active' : ''}`}
          title={
            op.origin === null
              ? s.kind === 'cylinder' && s.axisMode === '4-axis' && op.axisMode === '3-axis'
                ? 'Inherited: Z0 sits on the standing top face — the z-probeable surface (set an edge to override)'
                : 'Zero inherits the Stock page\'s origin — same as the implicit fixture 1'
              : 'Back to the inherited default'
          }
          onClick={() => upd({ origin: null })}
        >
          {op.origin === null ? 'Inherited' : 'Same as Stock'}
        </button>
      </div>
      <InfoTip warn text="DUMMY — this re-clamp is not applied to the toolpaths yet; it records the setup and frames the ops list" />
    </>
  );
}

/** The IMPLICIT fixture 1's header (Alice, 2026-11-19): every job starts in
 * a setup — machine mode + WCS origin inherited from the Stock page, nothing
 * stored, nothing to desync. Looks exactly like a real Fixture divider (it
 * IS the settings for the ops after it); the only difference is the expanded
 * body: "Inherited from Stock definition" instead of the editable selects.
 * Rendered at the TOP of the ops list once a real Fixture op exists, so
 * before that the list reads as one flat section as it always did. */
function ImplicitFixtureHeader(props: {
  stock: Stock;
  collapsed: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleCollapse: () => void;
}) {
  const s = props.stock;
  const originText =
    s.kind === 'box'
      ? `X ${s.origin.x} · Y ${s.origin.y} · Z ${s.origin.z}`
      : `X ${s.xOrigin} · axis Z0`;
  return (
    <div
      className="fixture-divider implicit"
      style={{ ['--kind-color' as string]: OP_KIND_COLORS.fixture }}
    >
      <div className="fixture-bar" onClick={props.onToggleExpanded}>
        <span className="fixture-icon" title="The job's starting setup — mode and origin come from the Stock page">⌁</span>
        <span className="fixture-label">Fixture 1</span>
        <span className="fixture-summary">
          {s.axisMode} · inherited from Stock definition ({originText})
        </span>
        <span className="fixture-count">start setup</span>
        <span className="op-title-gap" />
        <button
          type="button"
          className="icon-btn"
          title={props.collapsed ? 'Expand this fixture group' : 'Collapse this fixture group'}
          onClick={(e) => {
            e.stopPropagation(); // the bar's onClick would toggle AGAIN —
            // double-toggle = no change (the flaky-smoke lesson)
            props.onToggleCollapse();
          }}
        >
          {props.collapsed ? '▸' : '▾'}
        </button>
      </div>
      {props.expanded && (
        <div className="fixture-body">
          <p className="hint">Inherited from Stock definition</p>
        </div>
      )}
    </div>
  );
}

/** A real Fixture op's divider row: the frame boundary between groups.
 * Extracted from the map callback (the implicit fixture-1 header also
 * renders one inline, so the JSX reads once). */
function FixtureDivider(props: {
  op: Extract<JobOp, { kind: 'fixture' }>;
  gen: GeneratedOp | undefined;
  collapsed: boolean;
  count: number;
  expanded: boolean;
  /** the job's stock — shapes the fixture's origin controls (FixtureFields) */
  stock: Stock;
  onToggleExpanded: () => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onHover: (hovering: boolean) => void;
  onChange: (op: JobOp) => void;
}) {
  const { gen } = props;
  return (
    <div
      className="fixture-divider"
      style={{ ['--kind-color' as string]: OP_KIND_COLORS.fixture }}
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
    >
      <div className="fixture-bar" onClick={props.onToggleExpanded}>
        <span className="fixture-icon" title="Re-clamp — every op below runs in this frame">⌁</span>
        <span className="fixture-label">Fixture</span>
        <span className="fixture-summary">
          {gen?.error ? 'calculation failed' : (gen?.summary ?? 'not calculated yet')}
        </span>
        <span className="fixture-count">{props.count} ops below</span>
        <span className="op-title-gap" />
        <button
          type="button"
          className="icon-btn"
          title={props.collapsed ? 'Expand this fixture group' : 'Collapse this fixture group'}
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleCollapse();
          }}
        >
          {props.collapsed ? '▸' : '▾'}
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Delete operation"
          onClick={(e) => {
            e.stopPropagation();
            props.onDelete();
          }}
        >
          ✕
        </button>
      </div>
      {props.expanded && (
        <div className="fixture-body">
          <FixtureFields op={props.op} axisMode={props.op.axisMode} stock={props.stock} onChange={props.onChange} />
        </div>
      )}
    </div>
  );
}

/** The per-section add row (Alice, 2026-11-21): every fixture section ends
 * with its own toolpath buttons, so a new op can land in ANY section — the
 * pair sits exactly where the op will appear, right under the section's ops.
 * The suggest picker arms for this section; its suggestions land here too.
 * Hidden while the section is collapsed, like its ops. */
function SectionAddRow(props: {
  /** the section this row adds into (the implicit fixture 1's id for the
   *  start setup) */
  sectionId: string;
  /** "Fixture 2" style — button titles read it back */
  label: string;
  /** this section's suggest pick is armed — its button labels itself live */
  armed: boolean;
  onAddOp: (sectionId: string) => void;
  onSuggestOps: (sectionId: string) => void;
}) {
  return (
    <div className="section-add buttons">
      <button
        type="button"
        title={`New toolpath at the end of ${props.label} — it generates in this fixture's frame`}
        onClick={() => props.onAddOp(props.sectionId)}
      >
        + Add toolpath
      </button>
      <button
        type="button"
        className={`suggest-btn${props.armed ? ' armed' : ''}`}
        title={`Pick a feature in the viewport — the detector tells you what it measured and which operations could drive it; suggestions land in ${props.label}`}
        onClick={() => props.onSuggestOps(props.sectionId)}
      >
        {props.armed ? '◉ picking — click a feature' : '+ Suggest toolpath'}
      </button>
    </div>
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
  chamferDepth: 'Selecting chamfer depth — click the feature the chamfer must reach',
  drillDepth: 'Selecting drill depth — click the floor the drill must reach',
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
    return <InfoTip warn text="tool missing from the library — fix the Tool select first" />;
  }
  const defaults = presetRates(op.kind, tool, props.materialId);
  const rates = op.rates ?? {};
  const setRate = (patch: Partial<OpRates>) =>
    props.onChange({ ...op, rates: { ...rates, ...patch } });
  // where the numbers below come from: the tool's own Makera preset row for
  // the stock material, or the built-in fallback table
  const preset = toolPresetFor(tool, props.materialId);
  const materialName = getMaterial(props.materialId).name;
  // CHIP LOAD advice (PLAN.md gap #12): the one number that predicts
  // rubbing/melt vs snapped bits, against the corpus + coupon bands.
  // The op's step-down rides along when the kind carries one (the DOC
  // half of the engagement story).
  const opStepDown = 'stepDown' in op && typeof op.stepDown === 'number' ? op.stepDown : undefined;
  const advice = cutAdvice(tool, getMaterial(props.materialId), {
    feed: rates.feed ?? defaults.feed,
    spindleRpm: tool.type === 'laser' ? rates.spindleRpm : (rates.spindleRpm ?? defaults.spindleRpm),
  }, opStepDown);
  // ADAPTIVE ROUGHING (spec step 3): the DERIVED chip-thinning rates,
  // read-only — never a user field. Only the depth legs are checkable
  // here (the region's orbit count is generation-time knowledge), so the
  // line honestly says "if the region loops".
  const pocketTrochoid =
    op.kind === 'pocket' && !op.finishingOnly && opStepDown !== undefined && tool.type !== 'laser'
      ? (() => {
          const depth = op.endDepth - op.startDepth;
          const levels = Math.max(1, Math.ceil(depth / opStepDown));
          if (!trochoidDepthLegs(tool.diameter, depth, levels)) return null;
          return derivedTrochoidRates(tool, getMaterial(props.materialId), {
            ae: AE_FACTOR * tool.diameter,
            stepDown: opStepDown,
            feed: rates.feed ?? defaults.feed,
            spindleRpm: rates.spindleRpm ?? defaults.spindleRpm,
          });
        })()
      : null;
  const chipCls =
    advice.verdict === 'ok'
      ? 'hint'
      : advice.verdict === 'unknown'
        ? 'hint'
        : 'hint warn';
  return (
    <div className="op-rates">
      <InfoTip
        text={`defaults for ${materialName}${preset ? ` — tool’s Makera “${preset.material}” preset` : ' — simple.cam fallback table'} · edit only what this one op needs; an edited box overrides the default until reset`}
      />
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
      {/* chip-load advice UNDER the boxes (Alice, 2026-11-01): the verdict
       * reads against the numbers the user just saw edited, not before them.
       * The apply button joins the button row below it. Lasers get an
       * explanatory line rather than an unexplained absence — the rpm slot
       * is beam power there, so no chip load exists to advise on. */}
      {advice.verdict === 'unknown' && tool.type === 'laser' && (
        <InfoTip text="no chip-load advice for a laser — its “rpm” slot is beam power %" />
      )}
      {advice.verdict !== 'unknown' && (
        <p className={chipCls} title={advice.note}>
          {advice.verdict === 'ok' ? '✓ ' : '⚠ '}
          {advice.note}
        </p>
      )}
      {advice.docNote && <p className={chipCls}>⚠ {advice.docNote}</p>}
      {pocketTrochoid && (
        <p
          className="hint"
          title="constant-engagement roughing picks itself on deep bulk cuts — the rates below are derived, never fields"
        >
          ⚡ deep bulk cut — a region with room to loop runs adaptive roughing:
          step-down derives to {pocketTrochoid.stepDown}mm ({pocketTrochoid.scale.toFixed(1)}×
          chip-thinning at {pocketTrochoid.ae.toFixed(2)}mm engagement), feed to{' '}
          {pocketTrochoid.feed}mm/min
          {pocketTrochoid.stepClamp || pocketTrochoid.feedClamp
            ? ` — clamped by ${
                [pocketTrochoid.stepClamp === 'flute' ? 'flute length' : pocketTrochoid.stepClamp === 'material' ? 'the material preset' : '', pocketTrochoid.feedClamp ? 'the chip-load band' : '']
                  .filter(Boolean)
                  .join(' and ')
              }`
            : ''}
        </p>
      )}
      <div className="buttons">
        {(advice.verdict === 'low' || advice.verdict === 'high') &&
          advice.recommendedFeed !== null &&
          (rates.feed ?? defaults.feed) !== advice.recommendedFeed && (
            <button
              type="button"
              className="secondary"
              title={`Feed for a ${advice.targetChipLoad ?? ''} mm/tooth chip load at the current spindle speed`}
              onClick={() =>
                setRate({
                  feed: advice.recommendedFeed!,
                  ...(tool.type !== 'laser' && advice.recommendedFeed
                    ? { plungeFeed: Math.round((rates.plungeFeed ?? defaults.plungeFeed) * (advice.recommendedFeed / (rates.feed ?? defaults.feed))) }
                    : {}),
                })
              }
            >
              Apply recommended feed ({advice.recommendedFeed} mm/min)
            </button>
          )}
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
  /** thread: insert a prefilled Rotary face op right before it */
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
    case 'fixture':
      return (
        <FixtureFields op={op} axisMode={props.axisMode} stock={props.stock} onChange={props.onChange} />
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
            <span>cut past the stock edge</span>
          </label>
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
            <span>cut past the stock edge</span>
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
            <span>cut past the stock edge</span>
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
          <InfoTip text="the ladder ends at the model's own floor and at its widest section — whichever comes first (the max-depth box only throttles it for short tools) — so the stock below the part (its holder, in 4-axis mode) is never cleared, and the rough never cuts the part free: that is the profile op's job, tabs and all. The boundary margin (default: tool Ø + allowance + step over) keeps the moat two tool passes wide, so mesh noise on the model's wall cannot pinch the perimeter pass into plunge-per-sliver arcs" />
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
            <span>cut past the stock edge</span>
          </label>
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
        </>
      );
    case 'swarfFinish': {
      const isBall = props.tool?.type === 'ball';
      return (
        <>
          <NumberField
            label="Step over (mm)"
            value={op.stepOver}
            min={0.1}
            step={0.1}
            title="The contact grid's density: θ rows this much ARC apart at the stock radius, X cells at half that (the rotary grid contract — the finish matches the rough's grid cell-for-cell)"
            onCommit={(v) => upd({ stepOver: v } as Partial<JobOp>)}
          />
          {isBall && (
            <NumberField
              label="Glancing floor (n·z)"
              value={op.glancingFloor ?? 0.3}
              min={0.05}
              step={0.05}
              title="The ball's window floor: machine normal-z attitudes below it put the contact too near the ball's equator (shaft junction); normals flatter than the floor have no window at all (reported unreachable). Default 0.3"
              onCommit={(v) => upd({ glancingFloor: v } as Partial<JobOp>)}
            />
          )}
          <InfoTip text="honest time: a full-wrap patch is rotary-ceiling clamped (≥9s per revolution) — the long slow sweeps are the cut, not a bug. Multiple patches retract and re-approach between them; A only ever advances" />
        </>
      );
    }
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
          <NumberField label="Width (mm)" title="The slot a single pass of a Ø=this tool would leave — filled with your tool as parallel channels plus rounded-end passes. 0 = just follow the lines (the groove is the tool's own cut, V-bit knurling)" value={op.width} min={0} step={0.1} onCommit={(v) => upd({ width: v } as Partial<JobOp>)} />
          {props.tool && op.width > 0 && op.width < props.tool.diameter - 1e-9 && (
            <InfoTip
              warn
              text={`a ${round2(props.tool.diameter)}mm tool can't follow a ${round2(op.width)}mm line — the groove comes out ~${round2(props.tool.diameter)}mm wide. Set 0 if you mean to just follow the lines`}
            />
          )}
          {props.tool && op.width > Math.max(props.tool.diameter, slotToolWidth(props.tool, op.depth)) && (
            <InfoTip
              text={`filled as if one pass of a Ø${round2(op.width)} tool cut it: parallel channels spaced ≤ the tool's honest cut width (${round2(slotToolWidth(props.tool, op.depth))}mm at this depth${props.tool.type === 'flat' || props.tool.type === 'bull' ? '' : ' — ball/V tools keep their own wall profile'}), with rounded end passes`}
            />
          )}
          {op.width === 0 && (
            <InfoTip
              text={`width 0: just following the lines — ${
                props.tool?.type === 'vbit'
                  ? 'the groove width comes from the depth and the bit angle'
                  : `the groove is the tool's own ${round2(props.tool?.diameter ?? 0)}mm width`
              }`}
            />
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
              title="Insert a Rotary face toolpath right before this thread, prefilled to face the crest Ø — its own tool, feeds, and step-over"
            >
              Add facing toolpath
            </button>
          </div>
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
        </>
      );
    case 'drill':
      return (
        <>
          <div className="floor-row">
            <NumberField
              label="Depth (mm)"
              className="floor-depth"
              value={op.depth}
              min={0.1}
              onCommit={(v) => upd({ depth: v } as Partial<JobOp>)}
            />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'drillDepth' ? ' active' : ''}`}
              title="Pick the drill depth — the op's selected hole is the rim reference (select the hole first); depth = that rim minus the clicked feature's Z. With no hole selected yet, the first click just selects it"
              onClick={() => props.onFeaturePick(op, 'drillDepth')}
            >
              ⇩
            </button>
          </div>
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
            <span>cut past the stock edge</span>
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
        </>
      );
    case 'cylChamfer':
      return (
        <>
          <div className="floor-row">
            <NumberField
              label="Depth (mm)"
              className="floor-depth"
              title="V-bit: 0 = anchor exactly on the selected circle — the flank cuts up-and-out through whatever rises above it (a step wall, the root of an existing chamfer). Above 0 = the circle is the highest point — the tip slides below it and the chamfer opens outward (a rod end, a chamfer top). Ball-nose: 0 anchors on the circle and the upper hemisphere shears a fillet up-and-to-the-side; a depth plunges a U-shaped channel — depth = the ball's radius gives the full semicircle (width = tool Ø)"
              value={op.depth}
              min={0}
              step={0.1}
              onCommit={(v) => upd({ depth: Math.max(v, 0) } as Partial<JobOp>)}
            />
            <button
              type="button"
              className={`icon-btn${props.picking?.opId === op.id && props.picking.kind === 'chamferDepth' ? ' active' : ''}`}
              title="Pick the chamfer depth — click, then select the feature the chamfer must reach in the viewport; depth = the anchor circle's radius minus that feature's radius about the stock axis (pick the valley floor: the V-top anchor minus the valley Ø lands the tip exactly on it)"
              onClick={() => props.onFeaturePick(op, 'chamferDepth')}
            >
              ⇩
            </button>
          </div>
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
        </>
      );
    case 'engrave':
      return (
        <>
          {props.tool?.type === 'laser' ? (
            <InfoTip text="laser: a single pass at the tool's focus height — depth is ignored, power comes from the tool (or the ⚡ override) and lands as the S word on the cut lines; each line begins with a 0.3 mm lit lead-in so path starts don't burn light" />
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
          <label
            className="field"
            title="'Outlines only' traces the selected paths; 'Fill then outline' rasters the closed painted paths FIRST with the outlines traced on top; 'Fill only' rasters alone (the halftone dots) — scanlines along the machine's fast X, holes inside a filled loop stay untouched"
          >
            <span>Fill areas</span>
            <select
              value={op.fillMode ?? 'outlines'}
              onChange={(e) =>
                upd({ fillMode: e.target.value as 'outlines' | 'fill+outline' | 'fill' })
              }
            >
              <option value="outlines">Outlines only</option>
              <option value="fill+outline">Fill then outline</option>
              {/* Alice 2026-10-31: "i knew there was a reason we would want
                  the fill-only option for engraving, this would be it" —
                  the halftone dots; the raster runs FIRST, the outline last */}
              <option value="fill">Fill only</option>
            </select>
          </label>
          {(op.fillMode ?? 'outlines') !== 'outlines' && (
            <NumberField
              label="Fill step over (mm)"
              value={op.fillStepOver ?? 1.5}
              min={0.05}
              step={0.1}
              title="The fill raster's scanline spacing, mm on the surface — lines along the machine's fast X, stepping Y (flat) or around (wrapped). Defaults from the tool's tip width (re-derived on every tool change)"
              onCommit={(v) => upd({ fillStepOver: v })}
            />
          )}
          <InfoTip text="fill: the raster clears the selected closed painted regions — scanlines along the machine's fast X (axial on a wrapped logo), a hole inside a filled loop stays untouched (the ankh's counter), the same depth ladder per scanline, laser as ever a single pass. 'fill then outline' runs the raster FIRST with the outlines traced on top; 'fill only' skips them. Closed-but-unpainted paths (fill=none) outline only" />
        </>
      );
    case 'rasterEngrave': {
      // LASER RASTER ENGRAVE (SPEC 2026-11-23): the image dithers at
      // generate time from the RAW grayscale — no depth or step-down
      // fields here, the beam cuts no material
      const method = op.method ?? DEFAULT_DITHER_METHOD;
      return (
        <>
          <InfoTip text="laser raster: the whole artwork dithers to fire/skip pixels — no depth, no step-downs, one pass. Power comes from the tool (or the ⚡ override); every line moves at the same raster feed, even the beam-off travel" />
          <label
            className="field"
            title="How the grayscale turns into fire/skip pixels — an artistic choice, not a saved one: the artwork keeps its grays and the method applies here, so you can re-run any image with any material's favorite"
          >
            <span>Dither method</span>
            <select
              value={method}
              onChange={(e) => upd({ method: e.target.value as DitherMethod } as Partial<JobOp>)}
            >
              {DITHER_METHODS.map((m) => (
                <option key={m} value={m}>
                  {DITHER_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {method === 'halftone' && (
            <NumberField
              label="Screen cell (mm)"
              value={op.screenSpacing ?? 0.5}
              min={0.05}
              step={0.05}
              title="Halftone screen only — the cell size, mm. Each cell decides one dot from the pixels it covers; smaller cells keep more tone detail"
              onCommit={(v) => upd({ screenSpacing: Math.max(v, 0.05) } as Partial<JobOp>)}
            />
          )}
          <label
            className="field"
            title="Row spacing and pixel size, mm — 0.1 matches the machine's own Laser Image output. Too fine a pitch on a big face floods the file with millions of short moves"
          >
            <span>Pixel pitch (mm)</span>
            {/* the vcarve "auto" pattern: empty = the generator's default,
                a value forces it (a hand-edited pitch sticks) */}
            <input
              type="number"
              step={0.05}
              min={0.05}
              placeholder="0.1"
              value={op.pitch ?? ''}
              onChange={(e) => {
                const s = e.target.value;
                if (s === '') return upd({ pitch: undefined } as Partial<JobOp>);
                const v = parseFloat(s);
                if (Number.isFinite(v) && v >= 0.05) upd({ pitch: v } as Partial<JobOp>);
              }}
            />
          </label>
          <label
            className="field"
            title="Serpentine: every second row runs backwards, no travel between rows — fast. One-way: each return is a rapid — slower, and the honest option if you see drift on the turns"
          >
            <span>Sweep</span>
            <select
              value={op.sweep ?? 'serpentine'}
              onChange={(e) =>
                upd({ sweep: e.target.value as 'serpentine' | 'one-way' } as Partial<JobOp>)
              }
            >
              <option value="serpentine">Serpentine</option>
              <option value="one-way">One-way</option>
            </select>
          </label>
          <NumberField
            label="Interlace offset (mm)"
            value={op.interlace ?? 0}
            step={0.05}
            title="Signed mm applied to serpentine reverse rows only — the small position offset the beam's settling leaves on the turns. Calibrate with the Laser interlacing coupon: the sharpest patch's label is this value. A position fix only — it will NOT fix run-start fade-in (min power / lead-in are that lever)"
            onCommit={(v) => upd({ interlace: v } as Partial<JobOp>)}
          />
          <NumberField
            label="Lead-in (mm)"
            value={op.leadIn ?? 0}
            min={0}
            step={0.1}
            title="Lit travel before each fired run, mm — a buffer against the beam's power ramp-up. It burns pixels that were white, so every run's leading edge gains a small over-burn. 0 matches the machine's own output"
            onCommit={(v) => upd({ leadIn: Math.max(v, 0) } as Partial<JobOp>)}
          />
          <NumberField
            label="Min power (0–1)"
            value={op.minPower ?? 0}
            min={0}
            step={0.05}
            title="Floor on the fired power level — diodes barely lase below about 0.1–0.15, so the darkest fired pixel never drops under this"
            onCommit={(v) => upd({ minPower: Math.min(Math.max(v, 0), 1) } as Partial<JobOp>)}
          />
        </>
      );
    }
    case 'vcarveFlat':
      return (
        <>
          <NumberField
            label="Max depth (mm)"
            title="The depth cap: wide shapes fill a V groove that deepens toward the middle, but where the shape is wider than the bit's cone reaches, the groove stops at this depth and clears flat. Prefills from the bit's cone height — re-derives on a tool change until you edit it. The generator never cuts deeper than the bit's true cone, whatever this says"
            value={op.maxDepth}
            min={0.05}
            step={0.1}
            onCommit={(v) => upd({ maxDepth: Math.max(v, 0.05) } as Partial<JobOp>)}
          />
          <label
            className="field"
            title="Ring spacing, mm, when a wide shape clears flat at the cap (the flat floor between rings leaves a washboard — ridges like a washed board's slats — the default spacing keeps their height small). Empty = the default from the bit's angle; set a value to force finer or coarser rings"
          >
            <span>Clear stepover (mm)</span>
            <input
              type="number"
              step={0.1}
              min={0.05}
              placeholder="auto"
              value={op.clearStepOver ?? ''}
              onChange={(e) => {
                const s = e.target.value;
                if (s === '') return upd({ clearStepOver: undefined } as Partial<JobOp>);
                const v = parseFloat(s);
                if (Number.isFinite(v) && v > 0) upd({ clearStepOver: v } as Partial<JobOp>);
              }}
            />
          </label>
        </>
      );
  }
}

/** the dither method dropdown's plain names (the spec's list — the
 *  internal values stay the kernel's) */
const DITHER_LABELS: Record<DitherMethod, string> = {
  atkinson: 'Atkinson',
  'floyd-steinberg': 'Floyd–Steinberg',
  jarvis: 'Jarvis',
  stucki: 'Stucki',
  burkes: 'Burkes',
  sierra: 'Sierra',
  bayer8: 'Bayer 8×8',
  halftone: 'Halftone screen',
};

export function OpsPanel(props: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  /** the op whose feeds & speeds popup is open (one at a time) */
  const [ratesOpenId, setRatesOpenId] = useState<string | null>(null);
  /** the op whose ⓘ help popup is open (one at a time) */
  const [helpOpId, setHelpOpId] = useState<string | null>(null);
  // DRAG REORDERING CROSSES FIXTURE DIVIDERS (Alice, 2026-11-21 — the
  // per-section add rows landed the same day): dropping an op on a target in
  // another section re-homes it — it regenerates in that section's frame,
  // the same frame-aware presentation the generators already run. Fixture
  // ops themselves still never drag: their position IS the frame boundary.

  /** tool change re-derives the step defaults for the new cutter */
  const changeTool = (op: JobOp, toolId: string) => {
    const t = props.tools.find((x) => x.id === toolId);
    let next: JobOp = { ...op, toolId };
    if (t) {
      const stepDown = defaultStepDown(t, props.materialId);
      const stepOver = defaultStepOver(t);
      // chip-load gating on a tool change (same rule as newJobOp): the new
      // cutter's own default rates may sit outside the healthy band (a
      // preset-less tool), so prefill the ⚡ feed the way a fresh op would.
      // A HEALTHY default leaves any existing override alone — the user's
      // explicit ⚡ values never get silently rewritten under them.
      const advised = advisedOpRates(op.kind, t, props.materialId);
      const priorFeed = op.rates?.feed;
      const nextRates =
        advised && (priorFeed === undefined || advised.feed !== priorFeed)
          ? { ...op.rates, ...advised }
          : op.rates;
      if (advised) next = { ...next, rates: nextRates } as JobOp;
      // per-kind fields (types.ts is the source of truth): every kind with
      // a stepDown gets the new cutter's default, and every stepOver-bearing
      // kind re-derives it — a stale Ø-derived stepOver from the OLD tool is
      // the bug Alice caught 2026-10-25
      switch (op.kind) {
        case 'waterline':
        case 'contour4d':
          // the maxDepth default follows the new cutter's flute (the
          // 2026-29 pre-populate ruling — same class as stepOver: a
          // stale flute-derived ceiling from the OLD tool is wrong).
          // contour4d joined by her 2026-10-29 plank report: the kind
          // was missing from this switch, so a tool change re-derived
          // NOTHING and a longer-flute cutter kept the old tool's
          // shallow ceiling — the ladder stopped high and left a plank
          // of stock standing
          next = { ...next, stepDown, stepOver, maxDepth: t.fluteLength ?? null } as JobOp;
          break;
        case 'pocket':
        case 'slicePocket':
        case 'faceCylinder':
        case 'rotaryCarve':
          next = { ...next, stepDown, stepOver } as JobOp;
          break;
        case 'rasterContour':
        case 'swarfFinish':
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
          next = { ...next, stepDown } as JobOp;
          break;
        case 'engrave':
          // fillStepOver follows the new tool's TIP width like every step
          // field follows its Ø — the fill spacing rides the engraved line
          // width (tip Ø / kerf), not the shank-side diameter
          next = { ...next, stepDown, fillStepOver: engraveFillStepOver(t) } as JobOp;
          break;
        case 'vcarveFlat': {
          // the threadMill pitch-lock precedent (untouched prefills follow
          // the tool, hand edits stick): refresh the depth cap only when it
          // still equals the OLD bit's cone height — i.e. it is still the
          // prefill. A hand-set cap (or a dangling old tool id) stays.
          const vc = next as Extract<JobOp, { kind: 'vcarveFlat' }>;
          const oldTool = props.tools.find((x) => x.id === op.toolId);
          if (oldTool && vc.maxDepth === vbitConeHeight(oldTool)) {
            next = { ...vc, maxDepth: vbitConeHeight(t) } as JobOp;
          }
          break;
        }
        default:
          break; // drill/chamfer/index carry no step fields
      }
    }
    props.onChangeOp(next);
  };

  return (
    <section className="ops">
      {helpOpId && (
        <OpHelpPopup kind={props.ops.find((o) => o.id === helpOpId)!.kind} onClose={() => setHelpOpId(null)} />
      )}
      {props.ops.length === 0 && (
        <p className="hint">add a toolpath, then select features on the Model tab</p>
      )}
      <div>
        {(() => {
          // PANEL-SIDE TOOL NUMBERS (Alice, 2026-11-11): derived from the
          // ops list order — the export dialog prefills from the same rule,
          // so the T1 the panel shows IS the tool number the file carries.
          const toolNums = panelToolNumbers(props.ops);
          const inUse = [...toolNums.entries()]
            .map(([id, n]) => ({ tool: props.tools.find((t) => t.id === id), n }))
            .filter((e): e is { tool: Tool; n: number } => e.tool !== undefined)
            .sort((a, b) => a.n - b.n);
          const numOf = (id: string): number | null => toolNums.get(id) ?? null;
          // FIXTURE GROUPS: which fixture header owns each op (the latest
          // divider above it, or the IMPLICIT fixture 1 for everything
          // before the first real divider). Fixture 1 always exists — it
          // inherits mode + origin from the Stock page — but its header
          // only renders once a real Fixture op is present (until then the
          // list reads as one flat section, as it always did).
          let curGroup: string = IMPLICIT_FIXTURE_ID;
          const groupOf = new Map<string, string>();
          const fixtureGroupSizes = new Map<string, number>();
          for (const o of props.ops) {
            if (o.kind === 'fixture') {
              curGroup = o.id;
              groupOf.set(o.id, curGroup);
              fixtureGroupSizes.set(o.id, 0);
            } else {
              groupOf.set(o.id, curGroup);
              fixtureGroupSizes.set(curGroup, (fixtureGroupSizes.get(curGroup) ?? 0) + 1);
            }
          }
          const fixtureGroupId = (id: string): string => groupOf.get(id) ?? IMPLICIT_FIXTURE_ID;
          // THE PER-SECTION ADD ROW (Alice, 2026-11-21): every section ends
          // with its own + Add / + Suggest pair — the buttons sit exactly
          // where a new op will appear, so any fixture can grow, not just
          // the last. Hidden while the section is collapsed (its ops hide
          // too — expand to add).
          const addRow = (sectionId: string) =>
            props.collapsedGroups.has(sectionId) ? null : (
              <SectionAddRow
                key={`add:${sectionId}`}
                sectionId={sectionId}
                label={sectionLabel(props.ops, sectionId)}
                armed={props.suggestArmed === sectionId}
                onAddOp={props.onAddOp}
                onSuggestOps={props.onSuggestOps}
              />
            );
          // the LAST section (the whole stack's tail): last op's group, or
          // the last divider itself when a divider ends the list
          const lastOp = props.ops[props.ops.length - 1];
          const lastSection = lastOp
            ? lastOp.kind === 'fixture'
              ? lastOp.id
              : fixtureGroupId(lastOp.id)
            : IMPLICIT_FIXTURE_ID;
          // the implicit fixture-1 header renders at the TOP of the list
          // once a real Fixture op exists (or never, when none does — the
          // list reads flat, as it always did). It IS the settings for the
          // ops after it, so it leads the ladder (Alice, 2026-11-19).
          const hasRealFixture = props.ops.some((o) => o.kind === 'fixture');
          const implicitHeader = hasRealFixture ? (
            <ImplicitFixtureHeader
              key="implicit-fixture-1"
              stock={props.stock}
              collapsed={props.collapsedGroups.has(IMPLICIT_FIXTURE_ID)}
              expanded={props.expandedOpId === IMPLICIT_FIXTURE_ID}
              onToggleExpanded={() => props.onToggleExpanded(IMPLICIT_FIXTURE_ID)}
              onToggleCollapse={() => props.onToggleCollapse(IMPLICIT_FIXTURE_ID)}
            />
          ) : null;
          return (
            <Fragment>
              {implicitHeader}
              {props.ops.map((op, index) => {
          const gen = props.generated[op.id];
          const expanded = props.expandedOpId === op.id;
          const editing = props.editingOpId === op.id;
          const tnum = op.kind === 'index' || op.kind === 'fixture' ? null : numOf(op.toolId);
          const opGroupId = op.kind === 'fixture' ? null : fixtureGroupId(op.id);
          const collapsedGroup = opGroupId !== null && props.collapsedGroups.has(opGroupId);

          // FIXTURE DIVIDER ROW (the fixture-ops spec): a re-clamp reads as
          // a FRAME BOUNDARY, not another pass — full-width band, its own
          // class, and the ops under it collapse as one group.
          if (op.kind === 'fixture') {
            // the PREVIOUS section's add row: this divider closes that
            // section, so its buttons render just above the band (an empty
            // section's row sits right under its own divider)
            const above =
              index > 0
                ? props.ops[index - 1].kind === 'fixture'
                  ? props.ops[index - 1].id
                  : (groupOf.get(props.ops[index - 1].id) ?? IMPLICIT_FIXTURE_ID)
                : IMPLICIT_FIXTURE_ID;
            return (
              <Fragment key={op.id}>
                {addRow(above)}
                <FixtureDivider
                  key={op.id}
                  op={op}
                  gen={gen}
                  collapsed={props.collapsedGroups.has(op.id)}
                  count={fixtureGroupSizes.get(op.id) ?? 0}
                  expanded={expanded}
                  stock={props.stock}
                  onToggleExpanded={() => props.onToggleExpanded(op.id)}
                  onToggleCollapse={() => props.onToggleCollapse(op.id)}
                  onDelete={() => props.onDeleteOp(op.id)}
                  onHover={(h) => props.onHoverOp(h ? op.id : null)}
                  onChange={props.onChangeOp}
                />
              </Fragment>
            );
          }
          // A collapsible group hides the ops of this fixture group
          if (collapsedGroup) return null;
          return (
            <div
              key={op.id}
              className={`op-panel${dragId === op.id ? ' dragging' : ''}`}
              // the kind's accent color drives the row's left bar + kind text
              style={{ ['--kind-color' as string]: OP_KIND_COLORS[op.kind] }}
              // preview focus (the fixture-ops spec's per-op colours): the
              // hovered op's paths render full strength, every other op dims
              onMouseEnter={() => props.onHoverOp(op.id)}
              onMouseLeave={() => props.onHoverOp(null)}
            >
              <div
                className="op-title"
                draggable
                onDragStart={() => setDragId(op.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  // crosses fixture dividers too (Alice, 2026-11-21): the
                  // drop re-homes the dragged op into this op's section
                  if (dragId && dragId !== op.id) {
                    props.onReorder(dragId, op.id);
                  }
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => props.onToggleExpanded(op.id)}
              >
                <div className="op-line1">
                <span className="grip" title="Drag to reorder">
                  ⠿
                </span>
                <span className="op-seq">#{index + 1}</span>
                <select
                  className="op-kind"
                  value={op.kind}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const kind = e.target.value as JobOp['kind'];
                    let t = props.tools.find((x) => x.id === op.toolId);
                    // A gated kind must not inherit a tool of the wrong
                    // type (her 2026-11-23 report: switching an op to
                    // V-carve kept the flat endmill) — re-pick the
                    // library's fit, sharpest angled bit first for the
                    // V-bit kinds. No fit in the library keeps the tool:
                    // the generator's own message says what's missing.
                    if (t && !toolFitsKind(t, kind)) {
                      t = pickToolForKind(kind, props.tools) ?? t;
                    }
                    const next = t
                      ? newJobOp(kind, t, props.materialId, props.stock)
                      : null;
                    if (next) props.onChangeOp({ ...next, id: op.id, featureIds: op.featureIds });
                  }}
                >
                  {OP_KINDS.map((k, i) => [
                    // a disabled separator line at each section change
                    // (Alice, 2026-10-31): the palette reads as the FLAT
                    // section, then ORIENTATION (Index + Fixture — both
                    // frame-moving ops), then the 4-axis-only cutting ops.
                    // Native disabled-option styling grays it; it cannot
                    // be picked.
                    OP_KINDS[i - 1] &&
                    k.section &&
                    k.section !== OP_KINDS[i - 1].section ? (
                      <option key={`sep:${k.kind}`} disabled value="">
                        {k.section === 'orientation' ? '— Orientation —' : '— 4-axis only —'}
                      </option>
                    ) : null,
                    <option
                      key={k.kind}
                      value={k.kind}
                      // the rotary ops wait for 4-axis mode (Stock tab)
                      disabled={k.rotaryOnly && props.axisMode !== '4-axis'}
                    >
                      {k.label}
                    </option>,
                  ])}
                </select>
                <button
                  type="button"
                  className="icon-btn"
                  title={`What this op does — ${OP_HELP[op.kind].what}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHelpOpId(helpOpId === op.id ? null : op.id);
                  }}
                >
                  ⓘ
                </button>
                {gen?.error && <span className="op-status" title={gen.error}>⚠</span>}
                <span className="op-title-gap" />
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
                  title="Duplicate — a copy right below this op, carrying the tool, features, and every field value (the rough + finish pairing)"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDuplicateOp(op.id);
                  }}
                >
                  ⧉
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
                <div className="op-line2">
                  {tnum !== null && (
                    <span
                      className="tool-chip"
                      title={`Controller tool number T${tnum} — assigned by first use in the ops list; the export emits this number`}
                    >
                      T{tnum}
                    </span>
                  )}
                  <span
                    className={gen?.error ? 'op-summary err' : 'op-summary'}
                    title={gen?.error ?? gen?.summary ?? 'not calculated yet'}
                  >
                    {gen?.error ? 'calculation failed' : (gen?.summary ?? 'not calculated yet')}
                  </span>
                  <span className="op-snippet" title={selectionSnippet(op, props.featureLabels)}>
                    {selectionSnippet(op, props.featureLabels)}
                  </span>
                </div>
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
                        [
                          'pocket',
                          'profile',
                          'drill',
                          'chamfer',
                          'cylChamfer',
                          'engrave',
                          'rasterEngrave', // its one target: bitmap artwork features
                          'vcarveFlat',
                          'threadMill',
                        ].includes(op.kind) && (
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
                      <ToolPicker
                        tools={props.tools}
                        currentId={op.toolId}
                        inUse={inUse}
                        // SPEC 2026-11-23: the raster op accepts the laser
                        // module only — the pick list narrows for it (other
                        // kinds keep the full library, per the engrave
                        // precedent: the generator's gate is the truth)
                        allowedTypes={op.kind === 'rasterEngrave' ? ['laser'] : undefined}
                        onChange={(toolId) => changeTool(op, toolId)}
                      />
                    </label>
                  )}
                  {op.kind === 'rasterEngrave' && props.tools.find((t) => t.id === op.toolId)?.type !== 'laser' && (
                    <InfoTip
                      warn
                      text="raster engrave needs the laser module — pick the laser from the tool library"
                    />
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
                  <InfoTip
                    text={`needs a model — the geometry comes from the loaded STL`}
                    warn
                  />
                )}
                {!props.hasModel && props.primitives.length === 0 && op.kind !== 'faceCylinder' && op.kind !== 'slicePocket' && op.kind !== 'waterline' && op.kind !== 'rasterContour' && op.kind !== 'rotaryCarve' && (
                  <InfoTip
                    text="needs a model or a primitive to select from"
                    warn
                  />
                )}
                {(op.kind === 'faceCylinder' || op.kind === 'spiralCarve' || op.kind === 'thread' || op.kind === 'cylChamfer' || op.kind === 'rotaryCarve') && props.axisMode !== '4-axis' && (
                  <InfoTip
                    text="needs 4-axis mode (Stock tab)"
                    warn
                  />
                )}
                </div>
              )}
            </div>
          );
          })}
          {addRow(lastSection)}
        </Fragment>
      );
        })()}
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