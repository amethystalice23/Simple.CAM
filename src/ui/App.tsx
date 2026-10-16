import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { axialExtentX, detectFeatures } from '../cam/features';
import { transformedPositions } from '../cam/slicing';
import { postCarvera } from '../post/carvera';
import { identityTransform } from '../core/types';
import type {
  JobOp,
  ModelTransform,
  Move,
  Primitive,
  Stock,
  Tool,
} from '../core/types';
import { MAKERA_TOOLS } from '../core/makeraTools.generated';
import { ModelPanel } from './ModelPanel';
import {
  boxFromPlane,
  cylinderFromCircle,
  defaultBox,
  defaultCylinder,
} from './primitives';
import {
  generateJobOp,
  newJobOp,
  type GeneratedOp,
  type GenContext,
} from './jobGeneration';
import { OpsPanel } from './OpsPanel';
import { StockPanel } from './StockPanel';
import { ToolPanel } from './ToolPanel';
import { Viewport, type ResolvedSelection } from './Viewport';

const initialStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
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
  return MAKERA_TOOLS;
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
  const [gcode, setGcode] = useState<string | null>(null);
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
  const [selectedObjectId, setSelectedObjectId] = useState('model');
  const [modelName, setModelName] = useState('Loaded model');
  const [previewMoves, setPreviewMoves] = useState<Move[] | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  /** the job: ordered operations, each with its own selection and params */
  const [ops, setOps] = useState<JobOp[]>([]);
  const [generated, setGenerated] = useState<Record<string, GeneratedOp>>({});
  const [editingOpId, setEditingOpId] = useState<string | null>(null);
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // feature detection is model-space only: reruns on model load, not moves
  const features = useMemo(() => (geometry ? detectFeatures(geometry) : null), [geometry]);

  /** the feature set the viewport highlights/measures: the op being edited,
   * or the global selection when no op is active */
  const activeFeatureIds = editingOpId
    ? (ops.find((o) => o.id === editingOpId)?.featureIds ?? [])
    : selection;
  const resolvedSelection: ResolvedSelection[] = useMemo(() => {
    if (!features) return [];
    const out: ResolvedSelection[] = [];
    for (const id of activeFeatureIds) {
      const ci = features.circles.findIndex((c) => c.id === id);
      if (ci >= 0) {
        out.push({ kind: 'circle', index: ci });
        continue;
      }
      const ei = features.edges.findIndex((e) => e.id === id);
      if (ei >= 0) {
        out.push({ kind: 'edge', index: ei });
        continue;
      }
      const pi = features.planes.findIndex((p) => p.id === id);
      if (pi >= 0) out.push({ kind: 'plane', index: pi });
    }
    return out;
  }, [activeFeatureIds, features]);

  /** viewport feature clicks: edit the active op's selection, or the global
   * one (primitives / measuring) when no op is being edited */
  const toggleSelect = (id: string) => {
    if (editingOpId) {
      setOps((prev) =>
        prev.map((o) =>
          o.id === editingOpId
            ? {
                ...o,
                featureIds: o.featureIds.includes(id)
                  ? o.featureIds.filter((x) => x !== id)
                  : [...o.featureIds, id],
              }
            : o,
        ),
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

  const deleteSelectedObject = () => {
    if (selectedObjectId === 'model') return;
    setPrimitives((prev) => prev.filter((p) => p.id !== selectedObjectId));
    setSelectedObjectId('model');
  };

  /** everything generation needs, in one memo */
  const genCtx: GenContext = useMemo(
    () => ({ stock, geometry, features, transform, tools }),
    [stock, geometry, features, transform, tools],
  );

  /** combined preview + gcode for the whole job, from per-op results */
  const updateJobOutput = (results: Record<string, GeneratedOp>) => {
    const allMoves = ops.flatMap((o) => results[o.id]?.moves ?? []);
    setPreviewMoves(allMoves.length > 0 ? allMoves : null);
    if (allMoves.length === 0) {
      setGcode(null);
      return;
    }
    const usedTools = [
      ...new Set(ops.filter((o) => (results[o.id]?.moves.length ?? 0) > 0).map((o) => o.toolId)),
    ]
      .map((id) => tools.find((t) => t.id === id))
      .filter((t): t is Tool => t !== undefined);
    const minutes = ops.reduce((sum, o) => sum + (results[o.id]?.minutes ?? 0), 0);
    const nc = postCarvera({ moves: allMoves, tools: usedTools, options: { jobName: 'job' } });
    setGcode(
      `; job: ${ops.length} op(s), ~${minutes.toFixed(1)} min cut time\n` + nc,
    );
  };

  const recalcAll = () => {
    const next: Record<string, GeneratedOp> = {};
    for (const o of ops) next[o.id] = generateJobOp(o, genCtx);
    setGenerated(next);
    updateJobOutput(next);
    setShowPreview(true); // recalculate turns the path display on
    setError(null);
  };

  const recalcOne = (id: string) => {
    const op = ops.find((o) => o.id === id);
    if (!op) return;
    const result = generateJobOp(op, genCtx);
    const next = { ...generated, [id]: result };
    setGenerated(next);
    updateJobOutput(next);
    setShowPreview(true);
    setError(null);
  };

  const addOp = () => {
    const op = newJobOp('pocket', tool.id);
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

  /** start/stop editing an op's feature selection (enables measure mode) */
  const toggleOpFeatures = (id: string | null) => {
    setEditingOpId(id);
    if (id !== null) setMeasureMode(true);
  };

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
      setGeometry(geo);
      setModelName(file.name);
      setTransform(identityTransform()); // each model starts at its own origin
      setSelection([]); // ids belong to the old model
      setOps((prev) => prev.map((o) => ({ ...o, featureIds: [] })));
      setGenerated({});
      setEditingOpId(null);
      setSelectedObjectId('model');
      setPreviewMoves(null);
      setGcode(null);
      setTab('model');
      setError(null);
    } catch (e) {
      setError(`could not parse STL: ${String(e)}`);
    }
  };

  const download = () => {
    if (!gcode) return;
    const url = URL.createObjectURL(new Blob([gcode], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'job.nc';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header>
        <h1>simple.cam</h1>
        <span className="tag">Carvera · demo job: face cylinder</span>
      </header>
      <main>
        <div
          ref={dropRef}
          className="viewport"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) void loadStl(f);
          }}
        >
          <Viewport
            geometry={geometry}
            stock={stock}
            transform={transform}
            features={features}
            showFeatures={showFeatures}
            measureMode={measureMode}
            opSelection={resolvedSelection}
            primitives={primitives}
            previewMoves={previewMoves}
            showPreview={showPreview}
            onToggleSelect={toggleSelect}
            onClearSelection={clearSelection}
          />
          <div className="drop-hint">{geometry ? 'STL loaded' : 'drop an STL here (Phase 1: feature tracing)'}</div>
        </div>
        <aside>
          <nav className="tabs">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={t === tab ? 'active' : ''}
                disabled={t === 'model' && !geometry}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          {tab === 'stock' && <StockPanel stock={stock} onChange={setStock} />}
          {tab === 'model' && geometry && (
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
              onDeleteObject={deleteSelectedObject}
              onAddPrimitive={addPrimitive}
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
              onSelect={setToolId}
              onChange={setTools}
              onRestorePresets={() => {
                setTools(MAKERA_TOOLS);
                setToolId(defaultToolId(MAKERA_TOOLS));
              }}
            />
          )}
          {tab === 'ops' && (
            <>
              <OpsPanel
                ops={ops}
                tools={tools}
                generated={generated}
                editingOpId={editingOpId}
                expandedOpId={expandedOpId}
                showPreview={showPreview}
                hasModel={!!geometry}
                stockKind={stock.kind}
                onAddOp={addOp}
                onChangeOp={(op) => setOps((prev) => prev.map((o) => (o.id === op.id ? op : o)))}
                onDeleteOp={(id) => {
                  setOps((prev) => prev.filter((o) => o.id !== id));
                  setGenerated((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                  if (editingOpId === id) setEditingOpId(null);
                  if (expandedOpId === id) setExpandedOpId(null);
                }}
                onReorder={reorderOps}
                onSelectFeatures={toggleOpFeatures}
                onRecalcOne={recalcOne}
                onRecalcAll={recalcAll}
                onToggleExpanded={(id) => setExpandedOpId(expandedOpId === id ? null : id)}
                onTogglePreview={setShowPreview}
              />
              {gcode && (
                <section>
                  <h2>G-code</h2>
                  <pre>{gcode.slice(0, 4000)}</pre>
                  <button onClick={download}>Download .nc</button>
                </section>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </aside>
      </main>
    </div>
  );
}