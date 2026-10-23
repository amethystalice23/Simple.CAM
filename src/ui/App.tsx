import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { axialExtentX, detectFeatures } from '../cam/features';
import { indexedPointRotation, indexToAlignDirection } from '../cam/indexing';
import { transformedPositions } from '../cam/slicing';
import { sampleSpiralMarks } from '../cam/spiralCarve';
import { threadDepth, threadFaceDiameter } from '../cam/thread';
import {
  identityTransform,
  isDepthBearingJobOp,
  rotaryCalibrationOf,
  round2,
  type FeaturePickKind,
} from '../core/types';
import type {
  CircleFeature,
  EdgeFeature,
  JobOp,
  ModelTransform,
  Move,
  PlaneFeature,
  Primitive,
  Stock,
  Tool,
} from '../core/types';
import { BUILT_IN_TOOLS } from '../core/builtInTools';
import { planeExtent, transformFn } from './featureOverlays';
import { opEdgeSource, resolveFeature, sourcesFor } from './featureSources';
import { ModelPanel } from './ModelPanel';
import {
  artworkFromSvg,
  boxFromPlane,
  cylinderFromCircle,
  defaultBox,
  defaultCylinder,
  seedPrimitiveIds,
} from './primitives';
import { parseSvgPaths } from '../core/vectorImport';
import {
  datumAngleBefore,
  generateJobOp,
  metricPitch,
  newJobOp,
  prefillDepths,
  seedJobOpIds,
  type GeneratedOp,
} from './jobGeneration';
import { decodeStl, downloadJobFile, JOB_FORMAT, jobFingerprint, normalizeJobOps, normalizeStock, parseJobFile, saveJobFile } from './jobFile';
import { loadAutosave, saveAutosave } from './jobStorage';
import { stockTopZ } from './placement';
import { AboutBox } from './AboutBox';
import { ExportDialog } from './ExportDialog';
import { OpsPanel } from './OpsPanel';
import { StockPanel } from './StockPanel';
import { ToolPanel } from './ToolPanel';
import { Viewport, type ResolvedSelection } from './Viewport';

const initialStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};

const TOOL_STORAGE_KEY = 'simple.cam.tool-library.v2'; // v2: corn bits split out of flat

function loadToolLibrary(): Tool[] {
  try {
    const raw = localStorage.getItem(TOOL_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { tools?: Tool[] }) : null;
    if (parsed?.tools && Array.isArray(parsed.tools) && parsed.tools.length > 0) return parsed.tools;
  } catch {
    // corrupt or unavailable storage — fall back to presets
  }
  return BUILT_IN_TOOLS;
}

/** Sensible default selection for the demo job: a Ø6 flat cutter. */
function defaultToolId(tools: Tool[]): string {
  return (tools.find((t) => t.type === 'flat' && t.diameter === 6) ?? tools[0]).id;
}

type Tab = 'stock' | 'model' | 'tools' | 'ops';

const TAB_LABELS: Record<Tab, string> = {
  stock: 'Stock',
  model: 'Model',
  tools: 'Tools',
  ops: 'Ops',
};

export function App() {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  /** the "Export g-code" dialog is open */
  const [showExport, setShowExport] = useState(false);
  /** the about box is open (click the product name in the header) */
  const [showAbout, setShowAbout] = useState(false);
  /** ops whose toolpath is hidden from the preview (the export dialog
   * selects the ops that go into the .nc separately) */
  const [hiddenOps, setHiddenOps] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [stock, setStock] = useState<Stock>(initialStock);
  const [transform, setTransform] = useState<ModelTransform>(identityTransform());
  const [tab, setTab] = useState<Tab>('stock');
  const [tools, setTools] = useState<Tool[]>(loadToolLibrary);
  const [toolId, setToolId] = useState<string>(() => defaultToolId(loadToolLibrary()));
  const [showFeatures, setShowFeatures] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [primitives, setPrimitives] = useState<Primitive[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>('model');
  const [modelName, setModelName] = useState('Loaded model');
  /** raw STL bytes of the loaded model, kept for job save (embedded in the file) */
  const [modelBytes, setModelBytes] = useState<Uint8Array | null>(null);
  const openJobInputRef = useRef<HTMLInputElement>(null);
  /** changes since the last save/new/restore — gates the New Job confirm */
  const [dirty, setDirty] = useState(false);
  const lastSavedRef = useRef<string | null>(null); // fingerprint baseline
  const restoredRef = useRef(false); // autosave waits for the mount restore
  const [previewMoves, setPreviewMoves] = useState<Move[] | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  /** the job: ordered operations, each with its own selection and params */
  const [ops, setOps] = useState<JobOp[]>([]);
  const [generated, setGenerated] = useState<Record<string, GeneratedOp>>({});
  const [editingOpId, setEditingOpId] = useState<string | null>(null);
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);
  /** the last tool selected in any op — default for new operations */
  const [lastToolId, setLastToolId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // feature detection is model-space only: reruns on model load, not moves
  const features = useMemo(() => (geometry ? detectFeatures(geometry) : null), [geometry]);
  /**
   * Model size as displayed — bounding box × per-axis model scale, same
   * computation and formatting as the Model tab's "loaded · X × Y × Z mm"
   * line, so the two never disagree.
   */
  const modelDims = useMemo(() => {
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    return new Vector3(
      (bb.max.x - bb.min.x) * transform.scale.x,
      (bb.max.y - bb.min.y) * transform.scale.y,
      (bb.max.z - bb.min.z) * transform.scale.z,
    );
  }, [geometry, transform]);

  /** every selectable-feature provider: the model plus one source per
   * primitive (its features detected in local space, ids namespaced
   * `p:<primId>:` so they never collide with model ids), plus the job's
   * own edge circles (`o:` ids — face-op step edges + stock end rims,
   * 4-axis only) for the cylinder chamfer op to anchor on */
  const sources = useMemo(() => {
    const s = sourcesFor(geometry, features, transform, primitives);
    const oe = opEdgeSource(ops, stock);
    return oe ? [...s, oe] : s;
  }, [geometry, features, transform, primitives, ops, stock]);

  /** short descriptions by feature id, for op title snippets */
  const featureLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const source of sources) {
      for (const c of source.features.circles) {
        map[c.id] = `Ø${(c.radius * 2).toFixed(1)}${c.inner ? ' hole' : ''}`;
      }
      for (const e of source.features.edges) {
        map[e.id] = `L${Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z).toFixed(1)}`;
      }
      for (let i = 0; i < source.features.planes.length; i++) {
        const ext = planeExtent(source.geometry, source.features, source.transform, i);
        map[source.features.planes[i].id] = ext ? `${ext.w.toFixed(1)}×${ext.h.toFixed(1)}` : 'face';
      }
    }
    return map;
  }, [sources]);

  /** the feature set the viewport highlights/measures: the op being edited,
   * or the global selection when no op is active */
  const activeFeatureIds = editingOpId
    ? (ops.find((o) => o.id === editingOpId)?.featureIds ?? [])
    : selection;
  const resolvedSelection: ResolvedSelection[] = useMemo(() => {
    const out: ResolvedSelection[] = [];
    for (const id of activeFeatureIds) {
      const r = resolveFeature(sources, id);
      if (r) out.push({ sourceId: r.source.id, kind: r.kind, index: r.index });
    }
    return out;
  }, [activeFeatureIds, sources]);

  /** machine-space position of a feature by id (A=0 frame), for depth
   * prefills and index-angle computation */
  const featureMachinePoint = (id: string): Vector3 | null => {
    const r = resolveFeature(sources, id);
    if (!r) return null;
    const xf = transformFn(r.source.transform);
    if (r.kind === 'circle') return xf((r.feature as CircleFeature).center);
    if (r.kind === 'plane') return xf((r.feature as PlaneFeature).point);
    return null;
  };

  /** a feature's height in an op's cutting frame: the datum established by
   * the latest Index op preceding it in the sequence */
  const featureDepthInFrame = (op: JobOp, p: Vector3): number => {
    const angle = datumAngleBefore(ops, op.id);
    if (stock.axisMode === '4-axis' && angle !== 0) {
      return indexedPointRotation(angle, rotaryCalibrationOf(stock).axisZ)(p).z;
    }
    return p.z;
  };

  /** viewport feature clicks: edit the active op's selection, or the global
   * one (primitives / measuring) when no op is being edited. The first
   * feature into an op prefills its depth boxes. */
  // ---- the one-shot feature picks (edge-tracing §5: the ⇩ modes) ----

  /** the active pick: the NEXT viewport click applies it to that op
   * (floors for the depth-bearing ops; Start/End X and target Ø for the
   * face cylinder) — one-shot, bannered in the panel. For 'wrapDiameter'
   * the id is an artwork PRIMITIVE's (the Model tab's ⇩ Ø pick). */
  const [featurePick, setFeaturePick] = useState<{ opId: string; kind: FeaturePickKind } | null>(
    null,
  );

  /** the artwork's ⇩ Ø pick arms for its primitive — same one-shot and
   * measure-mode behavior as the op picks */
  const toggleWrapDiameterPick = (primId: string) => {
    setFeaturePick((cur) =>
      cur?.opId === primId && cur.kind === 'wrapDiameter'
        ? null
        : { opId: primId, kind: 'wrapDiameter' },
    );
    setMeasureMode(true);
  };

  /** the ⇩ a ⇩ toggles its op's pick mode (measure mode on for the pick) */
  const toggleFeaturePick = (op: JobOp, kind: FeaturePickKind) => {
    const takesFacePicks =
      op.kind === 'faceCylinder' || op.kind === 'spiralCarve' || op.kind === 'thread';
    if (kind === 'floor') {
      if (!isDepthBearingJobOp(op)) return;
    } else if (kind === 'indexAngle') {
      if (op.kind !== 'index') return;
    } else if (!takesFacePicks) {
      return;
    }
    setFeaturePick((cur) =>
      cur?.opId === op.id && cur.kind === kind ? null : { opId: op.id, kind },
    );
    setMeasureMode(true);
  };

  /** a viewport click applies the active pick; unclickable features (an
   * edge, a non-circle for the Ø) keep the mode waiting */
  const applyFeaturePick = (
    pick: { opId: string; kind: FeaturePickKind },
    featureId: string,
  ) => {
    if (pick.kind === 'indexAngle') {
      // aim the Index op at the clicked feature — its facing direction
      // becomes the op's absolute A
      const angle = indexAngleToward(featureId);
      if (angle === null) return; // no facing direction — stay in the mode
      setOps((prev) =>
        prev.map((o) => (o.id === pick.opId && o.kind === 'index' ? { ...o, angle } : o)),
      );
      setFeaturePick(null);
      return;
    }
    if (pick.kind === 'wrapDiameter') {
      // the artwork's Ø pick: pick.opId is the artwork PRIMITIVE's id
      const r = resolveFeature(sources, featureId);
      if (!r || r.kind !== 'circle') return; // Ø comes off a circle only
      const diameter = round2((r.feature as CircleFeature).radius * 2);
      setPrimitives((prev) =>
        prev.map((p) =>
          p.kind === 'artwork' && p.id === pick.opId ? { ...p, wrapDiameter: diameter } : p,
        ),
      );
      setFeaturePick(null);
      return;
    }
    if (pick.kind === 'targetDiameter') {
      const r = resolveFeature(sources, featureId);
      if (!r || r.kind !== 'circle') return; // Ø comes off a circle only
      const diameter = round2((r.feature as CircleFeature).radius * 2);
      setOps((prev) =>
        prev.map((o) => {
          if (o.id !== pick.opId) return o;
          if (o.kind === 'faceCylinder') return { ...o, targetDiameter: diameter };
          if (o.kind === 'spiralCarve') return { ...o, surfaceDiameter: diameter };
          if (o.kind === 'thread') {
            return { ...o, nominalDiameter: diameter, pitch: metricPitch(diameter) ?? o.pitch };
          }
          return o;
        }),
      );
      setFeaturePick(null);
      return;
    }
    if (pick.kind === 'startX' || pick.kind === 'endX') {
      const p = featureMachinePoint(featureId);
      if (!p) return; // an edge carries no facing point — stay in the mode
      setOps((prev) =>
        prev.map((o) => {
          if (o.id !== pick.opId) return o;
          if (o.kind !== 'faceCylinder' && o.kind !== 'spiralCarve' && o.kind !== 'thread') {
            return o;
          }
          return pick.kind === 'startX'
            ? { ...o, xStart: round2(p.x) }
            : { ...o, xEnd: round2(p.x) };
        }),
      );
      setFeaturePick(null);
      return;
    }
    // 'floor': the feature's depth-in-frame drives end depth, live-linked
    const p = featureMachinePoint(featureId);
    if (!p) return;
    setOps((prev) =>
      prev.map((o) => {
        if (o.id !== pick.opId || !isDepthBearingJobOp(o)) return o;
        const endDepth = round2(
          Math.max(stockTopZ(stock) - featureDepthInFrame(o, p), 0.3),
        );
        return { ...o, endDepth, floorFeatureId: featureId } as JobOp;
      }),
    );
    setFeaturePick(null);
  };


  const toggleSelect = (id: string) => {
    if (featurePick) {
      applyFeaturePick(featurePick, id);
      return;
    }
    if (editingOpId) {
      const p = featureMachinePoint(id);
      const crown = stockTopZ(stock);
      setOps((prev) =>
        prev.map((o) => {
          if (o.id !== editingOpId) return o;
          const featureIds = o.featureIds.includes(id)
            ? o.featureIds.filter((x) => x !== id)
            : [...o.featureIds, id];
          let next = { ...o, featureIds } as JobOp;
          if (o.featureIds.length === 0 && p) {
            next = prefillDepths(next, featureDepthInFrame(o, p), crown);
          }
          return next;
        }),
      );
      return;
    }
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearSelection = () => {
    if (editingOpId) {
      setOps((prev) => prev.map((o) => (o.id === editingOpId ? { ...o, featureIds: [] } : o)));
      return;
    }
    setSelection([]);
  };

  /** Drop-an-SVG: parse the line work and create the artwork primitive,
   * stock-prefilled (docs/PLAN.md "Engrave + artwork import"). Text and
   * shapes are the editor's job — Inkscape "object to path" first. */
  const addArtworkFromFile = async (f: File) => {
    const text = await f.text();
    const art = parseSvgPaths(text);
    if (art.paths.length === 0) {
      window.alert(
        'no paths found in the SVG — convert text and shapes to paths in Inkscape first (Object → Path)',
      );
      return;
    }
    const p = artworkFromSvg(art, stock);
    setPrimitives((prev) => [...prev, p]);
    setSelectedObjectId(p.id);
  };

  /** Create a primitive, sized from the selection when it matches the kind. */
  const addPrimitive = (kind: 'cylinder' | 'box') => {
    let prim: Primitive | null = null;
    if (features && geometry) {
      if (kind === 'cylinder') {
        const circle = selection
          .map((id) => features.circles.find((c) => c.id === id))
          .find((c) => c !== undefined);
        if (circle) {
          const span = axialExtentX(transformedPositions(geometry, transform));
          prim = cylinderFromCircle(circle, transform, span);
        }
      } else {
        const idx = selection
          .map((id) => features.planes.findIndex((p) => p.id === id))
          .find((i) => i >= 0);
        if (idx !== undefined && idx >= 0) {
          prim = boxFromPlane(geometry, features, transform, idx);
        }
      }
    }
    if (!prim) prim = kind === 'cylinder' ? defaultCylinder(stock) : defaultBox(stock);
    const p = prim;
    setPrimitives((prev) => [...prev, p]);
    setSelectedObjectId(p.id);
  };

  /** remove one primitive (the object row's ✕); selection falls back to
   * the model if one is loaded, else another primitive */
  const deletePrimitive = (id: string) => {
    setPrimitives((prev) => prev.filter((p) => p.id !== id));
    setSelectedObjectId((cur) =>
      cur === id
        ? geometry
          ? 'model'
          : (primitives.find((p) => p.id !== id)?.id ?? null)
        : cur,
    );
  };

  /** everything generation needs, in one memo (datumAngle varies per op) */
  const genCtx = useMemo(
    () => ({ stock, geometry, features, transform, tools, primitives, sources }),
    [stock, geometry, features, transform, tools, primitives, sources],
  );

  /** the whole-job preview, from per-op results: it shows only ops not
   * hidden. (The .nc itself is built on demand by the export dialog —
   * the preview pipeline never posts g-code.) */
  const updateJobOutput = (
    results: Record<string, GeneratedOp>,
    hidden: ReadonlySet<string> = hiddenOps,
    /** the op list to flatten — defaults to the current ops; callers that
     * change ops in the same tick (delete) pass the next list explicitly */
    opList: JobOp[] = ops,
  ) => {
    const shownMoves = opList
      .filter((o) => !hidden.has(o.id))
      .flatMap((o) => results[o.id]?.moves ?? []);
    setPreviewMoves(shownMoves.length > 0 ? shownMoves : null);
  };

  /** the expanded slice-pocket op's section plane (edge-tracing §5):
   * machine Z from its SLICE depth (independent of the cut band), the
   * datum rotation for slicing the rotated part, and the drag-handle
   * commit back into the op */
  const slicePreview = useMemo(() => {
    const op = ops.find((o) => o.id === expandedOpId);
    if (!geometry || !op || op.kind !== 'slicePocket') return null;
    const crown = stockTopZ(stock);
    const angle = stock.axisMode === '4-axis' ? datumAngleBefore(ops, op.id) : 0;
    return {
      z: crown - op.sliceDepth,
      rotate:
        angle !== 0
          ? indexedPointRotation(angle, rotaryCalibrationOf(stock).axisZ)
          : null,
      onZChange: (z: number) =>
        setOps((prev) =>
          prev.map((o) =>
            o.id === op.id && o.kind === 'slicePocket'
              ? { ...o, sliceDepth: round2(Math.max(crown - z, 0)) }
              : o,
          ),
        ),
    };
  }, [ops, expandedOpId, geometry, stock]);

  /** the expanded rotary op's intended result (edge-tracing §5): the
   * violet ghost cylinder about the stock axis — a spiral carve adds its
   * groove helices as sampled marks, and tools come from the library */
  const facePreview = useMemo(() => {
    const op = ops.find((o) => o.id === expandedOpId);
    if (!op || stock.axisMode !== '4-axis') return null;
    const axisZ = rotaryCalibrationOf(stock).axisZ;
    if (op.kind === 'faceCylinder') {
      return {
        xStart: op.xStart,
        xEnd: op.xEnd,
        diameter: op.targetDiameter,
        axisZ,
        marks: null,
      };
    }
    if (op.kind === 'spiralCarve') {
      const t = tools.find((x) => x.id === op.toolId);
      return {
        xStart: op.xStart,
        xEnd: op.xEnd,
        diameter: op.surfaceDiameter,
        axisZ,
        marks: sampleSpiralMarks(
          {
            kind: 'spiralCarve',
            id: op.id,
            toolId: op.toolId,
            surfaceDiameter: op.surfaceDiameter,
            xStart: op.xStart,
            xEnd: op.xEnd,
            spiralAngle: op.spiralAngle,
            count: op.count,
            depth: op.depth,
            width: op.width,
            stepDown: op.stepDown,
            rotation: op.rotation,
            feed: 1,
            plungeFeed: 1,
          },
          rotaryCalibrationOf(stock),
          t?.diameter ?? 6,
          datumAngleBefore(ops, op.id),
        ),
      };
    }
    if (op.kind === 'thread') {
      const t = tools.find((x) => x.id === op.toolId);
      const vAngle = t?.type === 'vbit' ? (t.vAngle ?? 90) : 90;
      const faceDia = threadFaceDiameter(op.nominalDiameter, op.tolerance);
      const depth = threadDepth(op.pitch, vAngle, op.tolerance);
      // the groove helices: lead-based angle, mapped onto the sampler
      const lead = op.starts * op.pitch;
      const angle = (Math.atan(lead / (Math.PI * faceDia)) * 180) / Math.PI;
      return {
        xStart: op.xStart,
        xEnd: op.xEnd,
        diameter: faceDia,
        axisZ,
        marks: sampleSpiralMarks(
          {
            kind: 'spiralCarve',
            id: op.id,
            toolId: op.toolId,
            surfaceDiameter: faceDia,
            xStart: op.xStart,
            xEnd: op.xEnd,
            spiralAngle: angle,
            count: op.starts,
            depth,
            width: 0.1, // one line per start — the V profile is the tool's
            stepDown: op.stepDown,
            // the sampler speaks the spiral's convention; the thread's
            // handedness is swapped (cam/thread.ts), so invert to match
            rotation: op.rotation === 'cw' ? 'ccw' : 'cw',
            feed: 1,
            plungeFeed: 1,
          },
          rotaryCalibrationOf(stock),
          t?.diameter ?? 6,
          datumAngleBefore(ops, op.id),
        ),
      };
    }
    return null;
  }, [ops, expandedOpId, stock, tools]);

  /** the open op's cutting frame: the viewport shows the part rotated to
   * the index datum established above that op — A0 when nothing is open
   * (edge-tracing §5 "view follows the datum") */
  const viewDatum = useMemo(() => {
    if (stock.axisMode !== '4-axis' || expandedOpId === null) return null;
    const op = ops.find((o) => o.id === expandedOpId);
    if (!op) return null;
    // an OPEN INDEX op shows its own angle as already applied — editing
    // the number turns the live view; every other op shows the datum
    // established above it
    const angle = op.kind === 'index' ? op.angle : datumAngleBefore(ops, op.id);
    if (angle === 0) return null;
    return { angle, axisZ: rotaryCalibrationOf(stock).axisZ };
  }, [ops, expandedOpId, stock]);

  /** show/hide one op's toolpath — display only, the export dialog decides
   * what goes into the .nc */
  const toggleOpVisible = (id: string) => {
    const next = new Set(hiddenOps);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHiddenOps(next);
    if (generated) updateJobOutput(generated, next);
  };

  const recalcAll = () => {
    const next: Record<string, GeneratedOp> = {};
    let datum = 0; // Index ops establish the datum for the ops after them
    let a = 0; // the machine's accumulated A — ops continue from the last
    for (const o of ops) {
      next[o.id] = generateJobOp(o, { ...genCtx, datumAngle: datum, startA: a });
      a = next[o.id].finalA;
      if (o.kind === 'index') datum = o.angle;
    }
    for (const o of ops) {
      if (next[o.id].error) console.warn(`[simple.cam] op "${o.kind}" failed: ${next[o.id].error}`);
    }
    setGenerated(next);
    updateJobOutput(next);
    setShowPreview(true); // recalculate turns the path display on
    setError(null);
  };

  const recalcOne = (id: string) => {
    const op = ops.find((o) => o.id === id);
    if (!op) return;
    // continue from the nearest previously-generated op's A, so a lone
    // recalculation lands where the machine would actually be
    let startA = 0;
    for (let i = ops.findIndex((o) => o.id === id) - 1; i >= 0; i--) {
      const g = generated[ops[i].id];
      if (g) {
        startA = g.finalA;
        break;
      }
    }
    const result = generateJobOp(op, { ...genCtx, datumAngle: datumAngleBefore(ops, id), startA });
    if (result.error) console.warn(`[simple.cam] op "${op.kind}" failed: ${result.error}`);
    const next = { ...generated, [id]: result };
    setGenerated(next);
    updateJobOutput(next);
    setShowPreview(true);
    setError(null);
  };

  const addOp = () => {
    const defaultTool = tools.find((t) => t.id === lastToolId) ?? tool;
    const op = newJobOp('pocket', defaultTool, stock.materialId, stock);
    setLastToolId(defaultTool.id);
    setOps((prev) => [...prev, op]);
    setExpandedOpId(op.id);
  };

  const reorderOps = (dragId: string, targetId: string) => {
    setOps((prev) => {
      const drag = prev.find((o) => o.id === dragId);
      if (!drag) return prev;
      const rest = prev.filter((o) => o.id !== dragId);
      rest.splice(
        rest.findIndex((o) => o.id === targetId),
        0,
        drag,
      );
      return rest;
    });
  };

  /** thread op: insert a Face cylinder toolpath right before it, prefilled
   * to face the crest Ø (nominal − 2·tolerance) over the thread's X range —
   * its own tool, feeds, and step-over, fully editable as a normal op */
  const insertFacingOp = (op: JobOp) => {
    if (op.kind !== 'thread' || stock.axisMode !== '4-axis') return;
    const faceTool = tools.find((t) => t.type === 'flat') ?? tools[0];
    if (!faceTool) return;
    const base = newJobOp('faceCylinder', faceTool, stock.materialId, stock);
    const face = {
      ...base,
      targetDiameter: round2(op.nominalDiameter - 2 * op.tolerance),
      xStart: op.xStart,
      xEnd: op.xEnd,
      rotation: op.rotation,
    } as JobOp;
    setOps((prev) => {
      const idx = prev.findIndex((o) => o.id === op.id);
      const at = idx < 0 ? prev.length : idx;
      return [...prev.slice(0, at), face, ...prev.slice(at)];
    });
    setExpandedOpId(face.id); // open it for tool and feed tweaks
  };

  /** start/stop editing an op's feature selection (enables measure mode) */
  const toggleOpFeatures = (id: string | null) => {
    setEditingOpId(id);
    if (id !== null) {
      setMeasureMode(true);
      setFeaturePick(null); // one picking mode at a time
    }
  };

  /** floor/rim switch re-prefills the depth boxes from the first feature */
  const changeSelectionIs = (op: JobOp, value: 'floor' | 'rim') => {
    let next: JobOp = { ...op, selectionIs: value } as JobOp;
    const p = op.featureIds.length > 0 ? featureMachinePoint(op.featureIds[0]) : null;
    if (p) next = prefillDepths(next, featureDepthInFrame(op, p), stockTopZ(stock));
    setOps((prev) => prev.map((o) => (o.id === op.id ? next : o)));
  };

  /** the absolute A that brings a feature to face the cutter: a face's
   * normal (or hole's axis) aligned with machine +Z; edges fall back to
   * their midpoint's radial. Null when the feature carries no direction
   * (an artwork path) or is unresolvable. */
  const indexAngleToward = (featureId: string): number | null => {
    const r = resolveFeature(sources, featureId);
    if (!r) return null;
    const xf = transformFn(r.source.transform);
    let dir: Vector3 | null = null;
    if (r.kind === 'circle') {
      const c = r.feature as CircleFeature;
      dir = xf(c.axis).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
    } else if (r.kind === 'plane') {
      const pl = r.feature as PlaneFeature;
      dir = xf(pl.normal).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
    } else if (r.kind === 'edge') {
      // edges have no facing direction: fall back to their midpoint's radial
      const e = r.feature as EdgeFeature;
      const mid = xf(e.a).add(xf(e.b)).multiplyScalar(0.5);
      dir = mid.sub(new Vector3(0, 0, rotaryCalibrationOf(stock).axisZ)).normalize();
    } else {
      return null; // an artwork path carries no facing direction
    }
    return round2(indexToAlignDirection(dir));
  };

  /** the floor link stays live: model/primitive moves update every linked
   * op's end depth (guarded — identical values don't re-set state) */
  useEffect(() => {
    const crown = stockTopZ(stock);
    let changed = false;
    const next = ops.map((o) => {
      if (isDepthBearingJobOp(o) && o.floorFeatureId !== null) {
        const p = featureMachinePoint(o.floorFeatureId);
        if (p) {
          const endDepth = round2(Math.max(crown - featureDepthInFrame(o, p), 0.3));
          if (Math.abs(endDepth - o.endDepth) > 1e-9) {
            changed = true;
            return { ...o, endDepth } as JobOp;
          }
        }
      }
      return o;
    });
    if (changed) setOps(next);
  }, [ops, sources, stock]);

  useEffect(() => {
    try {
      localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify({ v: 1, tools }));
    } catch {
      // storage unavailable — edits live for the session only
    }
  }, [tools]);

  const tool = tools.find((t) => t.id === toolId) ?? tools[0];

  const loadStl = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const geo = new STLLoader().parse(buf);
      setModelBytes(new Uint8Array(buf));
      setGeometry(geo);
      setModelName(file.name);
      setTransform(identityTransform()); // each model starts at its own origin
      setSelection([]); // ids belong to the old model
      setOps((prev) => prev.map((o) => ({ ...o, featureIds: [] })));
      setGenerated({});
      setEditingOpId(null);
      setSelectedObjectId('model');
      setPreviewMoves(null);
      setTab('model');
      setError(null);
    } catch (e) {
      setError(`could not parse STL: ${String(e)}`);
    }
  };

  /** Save the whole working state as one self-contained .cam.json file. */
  const saveJob = () => {
    try {
      const file = saveJobFile({
        stock,
        transform,
        primitives,
        ops,
        tools,
        modelName,
        modelBytes,
      });
      const base = modelBytes ? modelName.replace(/\.stl$/i, '') : 'job';
      downloadJobFile(file, base || 'job');
      lastSavedRef.current = jobFingerprint(file);
      setDirty(false);
      setError(null);
    } catch (e) {
      setError(`could not save job: ${String(e)}`);
    }
  };

  /** Apply a parsed job: stock, model, placement, primitives, ops, tools.
   * The applied job becomes the "saved" baseline for dirty tracking. */
  const applyJob = (job: ReturnType<typeof parseJobFile>) => {
    // imported files normalize inside parseJobFile; the autosave restore
    // skips it, so normalize here — the one gate both load paths pass
    const ops = normalizeJobOps(job.ops);
    const stock = normalizeStock(job.stock);
    setStock(stock);
    setPrimitives(job.primitives);
    setOps(ops);
    seedJobOpIds(ops);
    seedPrimitiveIds(job.primitives);
    setGenerated({});
    setEditingOpId(null);
    setExpandedOpId(null);
    setSelection([]);
    setSelectedObjectId(job.model ? 'model' : (job.primitives[0]?.id ?? null));
    setPreviewMoves(null);
    if (job.model) {
      const bytes = decodeStl(job.model.stlBase64);
      setModelBytes(bytes);
      setGeometry(new STLLoader().parse(bytes.buffer as ArrayBuffer));
      setModelName(job.model.name);
    } else {
      setModelBytes(null);
      setGeometry(null);
      setModelName('Loaded model');
    }
    setTransform(job.transform ?? identityTransform());
    // merge tool records the library doesn't have yet, so ops stay valid
    if (job.tools.length > 0) {
      setTools((prev) => {
        const ids = new Set(prev.map((t) => t.id));
        return [...prev, ...job.tools.filter((t) => !ids.has(t.id))];
      });
    }
    lastSavedRef.current = jobFingerprint(job);
    setDirty(false);
  };

  /** Open a saved job file. */
  const openJob = async (file: File) => {
    try {
      applyJob(parseJobFile(await file.text()));
      setTab('ops');
      setError(null);
    } catch (e) {
      setError(`could not open job: ${String(e)}`);
    }
  };

  /**
   * Route a dropped file. A `.json` goes straight to the job parser, which
   * checks the format header (`simple.cam job`) and rejects anything else
   * with a clear error. Anything else gets its head sniffed for that same
   * header — a re-downloaded save is browser-deduplicated to
   * "foo.cam (1).json" or the user renames it, so the name can't be
   * trusted; the header identifies the file no matter what it's called.
   * Only when the sniff fails does the file reach the STL loader.
   */
  const routeDroppedFile = async (f: File): Promise<void> => {
    if (/\.svg$/i.test(f.name)) {
      void addArtworkFromFile(f);
      return;
    }
    if (/\.json$/i.test(f.name) || (await f.slice(0, 4096).text()).includes(JOB_FORMAT)) {
      void openJob(f);
      return;
    }
    void loadStl(f);
  };

  /** Start over, confirming when changes would be lost. */
  const newJob = () => {
    if (
      dirty &&
      !window.confirm('There are unsaved changes since the last save — start a new job anyway?')
    ) {
      return;
    }
    setStock(initialStock);
    setModelBytes(null);
    setGeometry(null);
    setModelName('Loaded model');
    setTransform(identityTransform());
    setPrimitives([]);
    setOps([]);
    setGenerated({});
    setEditingOpId(null);
    setExpandedOpId(null);
    setSelection([]);
    setSelectedObjectId(null); // no model, no primitives yet
    setPreviewMoves(null);
    lastSavedRef.current = jobFingerprint(
      saveJobFile({
        stock: initialStock,
        transform: identityTransform(),
        primitives: [],
        ops: [],
        tools: [],
        modelName: 'Loaded model',
        modelBytes: null,
      }),
    );
    setDirty(false);
    setError(null);
  };

  /** Restore the autosaved job once on mount (reload / browse away + back). */
  useEffect(() => {
    void (async () => {
      const job = await loadAutosave();
      if (job) {
        try {
          applyJob(job);
        } catch {
          // corrupt autosave — start fresh
        }
      }
      restoredRef.current = true;
      setDirty(false); // triggers the autosave effect now that restore is done
    })();
    // mount-only by design: restore runs once before any autosave
  }, []);

  /** Debounced autosave: persist every change, and mark the job dirty
   * when it drifts from the last saved baseline. */
  useEffect(() => {
    if (!restoredRef.current) return;
    const t = setTimeout(() => {
      const file = saveJobFile({
        stock,
        transform,
        primitives,
        ops,
        tools,
        modelName,
        modelBytes,
      });
      const fp = jobFingerprint(file);
      if (lastSavedRef.current === null) {
        lastSavedRef.current = fp; // first run establishes the baseline
      } else if (fp !== lastSavedRef.current) {
        setDirty(true);
      }
      void saveAutosave(file);
    }, 600);
    return () => clearTimeout(t);
  }, [stock, transform, primitives, ops, tools, modelName, modelBytes]);

  return (
    <div className="app">
      <header>
        <button
          type="button"
          className="brand"
          title="About Simple.CAM"
          onClick={() => setShowAbout(true)}
        >
          <span className="brand-name">
            Simple<span className="cam">.CAM</span>
          </span>
        </button>
        <span className="tag">Carvera · open CAM</span>
        <div className="header-actions">
          {dirty && (
            <span className="unsaved" title="Unsaved changes">
              ● unsaved
            </span>
          )}
          <button type="button" onClick={newJob}>
            New job
          </button>
          <button
            type="button"
            onClick={saveJob}
            disabled={!geometry && primitives.length === 0 && ops.length === 0}
          >
            Save job
          </button>
          <button type="button" onClick={() => openJobInputRef.current?.click()}>
            Open job…
          </button>
          <button type="button" onClick={() => setShowExport(true)}>
            Export g-code
          </button>
          <input
            ref={openJobInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ''; // allow re-opening the same file
              if (f) void openJob(f);
            }}
          />
        </div>
      </header>
      <main>
        <div
          ref={dropRef}
          className="viewport"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void routeDroppedFile(f);
          }}
        >
          <Viewport
            geometry={geometry}
            stock={stock}
            transform={transform}
            sources={sources}
            selectedObjectId={selectedObjectId}
            showFeatures={showFeatures}
            measureMode={measureMode}
            edgePickingEnabled={editingOpId === null}
            opSelection={resolvedSelection}
            primitives={primitives}
            previewMoves={previewMoves}
            showPreview={showPreview}
            slicePreview={slicePreview}
            viewDatum={viewDatum}
            pickKind={featurePick?.kind ?? null}
            facePreview={facePreview}
            onToggleSelect={toggleSelect}
            onClearSelection={clearSelection}
          />
          <div className="drop-hint">
            {geometry
              ? `STL loaded · ${modelDims!.x.toFixed(1)} × ${modelDims!.y.toFixed(1)} × ${modelDims!.z.toFixed(1)} mm`
              : 'drop an STL, an SVG (artwork), or a saved job here'}
          </div>
        </div>
        <aside>
          <nav className="tabs">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={t === tab ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          {tab === 'stock' && <StockPanel stock={stock} onChange={setStock} />}
          {tab === 'model' && (
            <ModelPanel
              geometry={geometry}
              modelName={modelName}
              stock={stock}
              transform={transform}
              onTransformChange={setTransform}
              primitives={primitives}
              selectedObjectId={selectedObjectId}
              onSelectObject={setSelectedObjectId}
              onPrimitiveChange={(p) =>
                setPrimitives((prev) => prev.map((x) => (x.id === p.id ? p : x)))
              }
              onDeletePrimitive={deletePrimitive}
              onAddPrimitive={addPrimitive}
              pickingWrapDiameter={
                featurePick?.kind === 'wrapDiameter' && featurePick.opId === selectedObjectId
              }
              onPickWrapDiameter={toggleWrapDiameterPick}
              showFeatures={showFeatures}
              measureMode={measureMode}
              onShowFeaturesChange={setShowFeatures}
              onMeasureModeChange={(v) => {
                setMeasureMode(v);
                if (!v) setEditingOpId(null); // leaving measure mode stops op editing
              }}
            />
          )}
          {tab === 'tools' && (
            <ToolPanel
              tools={tools}
              selectedId={tool.id}
              materialId={stock.materialId}
              onSelect={setToolId}
              onChange={setTools}
              onRestorePresets={() => {
                setTools(BUILT_IN_TOOLS);
                setToolId(defaultToolId(BUILT_IN_TOOLS));
              }}
            />
          )}
          {tab === 'ops' && (
            <OpsPanel
              ops={ops}
              tools={tools}
              generated={generated}
              editingOpId={editingOpId}
              expandedOpId={expandedOpId}
              showPreview={showPreview}
              hasModel={!!geometry}
              axisMode={stock.axisMode}
              stock={stock}
              materialId={stock.materialId}
              primitives={primitives}
              featureLabels={featureLabels}
              onAddOp={addOp}
              onChangeOp={(op) => {
                setOps((prev) => prev.map((o) => (o.id === op.id ? op : o)));
                const before = ops.find((o) => o.id === op.id);
                if (before && before.toolId !== op.toolId) setLastToolId(op.toolId);
              }}
              onSelectionIsChange={changeSelectionIs}
              picking={featurePick}
              onFeaturePick={toggleFeaturePick}
              onInsertFacingOp={insertFacingOp}
              onDeleteOp={(id) => {
                const nextOps = ops.filter((o) => o.id !== id);
                const nextGen = { ...generated };
                delete nextGen[id];
                const nextHidden = new Set(hiddenOps);
                nextHidden.delete(id);
                setOps(nextOps);
                setGenerated(nextGen);
                setHiddenOps(nextHidden);
                if (editingOpId === id) setEditingOpId(null);
                if (expandedOpId === id) setExpandedOpId(null);
                // drop the deleted op's preview NOW, not at the next recalc
                // (updateJobOutput defaults to the stale closure ops, so pass
                // the next list explicitly)
                updateJobOutput(nextGen, nextHidden, nextOps);
              }}
              onReorder={reorderOps}
              onSelectFeatures={toggleOpFeatures}
              onRecalcOne={recalcOne}
              onRecalcAll={recalcAll}
              onToggleExpanded={(id) => setExpandedOpId(expandedOpId === id ? null : id)}
              onTogglePreview={setShowPreview}
              hiddenOps={hiddenOps}
              onToggleVisible={toggleOpVisible}
            />
          )}
          {error && <p className="error">{error}</p>}
        </aside>
      </main>
      {showAbout && <AboutBox onClose={() => setShowAbout(false)} />}
      {showExport && (
        <ExportDialog
          ops={ops}
          tools={tools}
          generated={generated}
          stock={stock}
          modelName={geometry ? modelName : null}
          onRecalcOne={recalcOne}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}