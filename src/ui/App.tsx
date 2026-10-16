import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { axialExtentX, detectFeatures } from '../cam/features';
import { indexedPointRotation, indexToAlignDirection } from '../cam/indexing';
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
import { planeExtent } from './featureOverlays';
import { ModelPanel } from './ModelPanel';
import {
  boxFromPlane,
  cylinderFromCircle,
  defaultBox,
  defaultCylinder,
} from './primitives';
import {
  datumAngleBefore,
  generateJobOp,
  newJobOp,
  prefillDepths,
  seedJobOpIds,
  type GeneratedOp,
} from './jobGeneration';
import { decodeStl, downloadJobFile, jobFingerprint, parseJobFile, saveJobFile } from './jobFile';
import { loadAutosave, saveAutosave } from './jobStorage';
import { stockTopZ } from './placement';
import { transformFn } from './featureOverlays';
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

  /** short descriptions by feature id, for op title snippets */
  const featureLabels = useMemo(() => {
    const map: Record<string, string> = {};
    if (!features) return map;
    for (const c of features.circles) {
      map[c.id] = `Ø${(c.radius * 2).toFixed(1)}${c.inner ? ' hole' : ''}`;
    }
    for (const e of features.edges) {
      map[e.id] = `L${Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z).toFixed(1)}`;
    }
    if (geometry) {
      for (let i = 0; i < features.planes.length; i++) {
        const ext = planeExtent(geometry, features, transform, i);
        map[features.planes[i].id] = ext ? `${ext.w.toFixed(1)}×${ext.h.toFixed(1)}` : 'face';
      }
    }
    return map;
  }, [features, geometry, transform]);

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

  /** machine-space position of a feature by id (A=0 frame), for depth
   * prefills and index-angle computation */
  const featureMachinePoint = (id: string): Vector3 | null => {
    if (!features) return null;
    const xf = transformFn(transform);
    const c = features.circles.find((x) => x.id === id);
    if (c) return xf(c.center);
    const p = features.planes.find((x) => x.id === id);
    if (p) return xf(p.point);
    return null;
  };

  /** a feature's height in an op's cutting frame: the datum established by
   * the latest Index op preceding it in the sequence */
  const featureDepthInFrame = (op: JobOp, p: Vector3): number => {
    const angle = datumAngleBefore(ops, op.id);
    if (stock.kind === 'cylinder' && angle !== 0) {
      return indexedPointRotation(angle, stock.calibration.axisZ)(p).z;
    }
    return p.z;
  };

  /** viewport feature clicks: edit the active op's selection, or the global
   * one (primitives / measuring) when no op is being edited. The first
   * feature into an op prefills its depth boxes. */
  const toggleSelect = (id: string) => {
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

  /** everything generation needs, in one memo (datumAngle varies per op) */
  const genCtx = useMemo(
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
    let datum = 0; // Index ops establish the datum for the ops after them
    for (const o of ops) {
      next[o.id] = generateJobOp(o, { ...genCtx, datumAngle: datum });
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
    const result = generateJobOp(op, { ...genCtx, datumAngle: datumAngleBefore(ops, id) });
    if (result.error) console.warn(`[simple.cam] op "${op.kind}" failed: ${result.error}`);
    const next = { ...generated, [id]: result };
    setGenerated(next);
    updateJobOutput(next);
    setShowPreview(true);
    setError(null);
  };

  const addOp = () => {
    const defaultTool = tools.find((t) => t.id === lastToolId) ?? tool;
    const op = newJobOp('pocket', defaultTool, stock.materialId);
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

  /** start/stop editing an op's feature selection (enables measure mode) */
  const toggleOpFeatures = (id: string | null) => {
    setEditingOpId(id);
    if (id !== null) setMeasureMode(true);
  };

  /** floor/rim switch re-prefills the depth boxes from the first feature */
  const changeSelectionIs = (op: JobOp, value: 'floor' | 'rim') => {
    let next: JobOp = { ...op, selectionIs: value } as JobOp;
    const p = op.featureIds.length > 0 ? featureMachinePoint(op.featureIds[0]) : null;
    if (p) next = prefillDepths(next, featureDepthInFrame(op, p), stockTopZ(stock));
    setOps((prev) => prev.map((o) => (o.id === op.id ? next : o)));
  };

  /** index the stock so the op's first selected feature faces the cutter:
   * a face's normal (or hole's axis) aligned with machine +Z */
  const indexToSelection = (op: JobOp) => {
    if (stock.kind !== 'cylinder' || op.kind !== 'index') return;
    const id = op.featureIds[0];
    if (!id || !features) return;
    const xf = transformFn(transform);
    let dir: Vector3 | null = null;
    const c = features.circles.find((x) => x.id === id);
    if (c) dir = xf(c.axis).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
    const pl = features.planes.find((x) => x.id === id);
    if (pl) dir = xf(pl.normal).sub(xf({ x: 0, y: 0, z: 0 })).normalize();
    const e = features.edges.find((x) => x.id === id);
    if (!dir && e) {
      // edges have no facing direction: fall back to their midpoint's radial
      const mid = xf(e.a).add(xf(e.b)).multiplyScalar(0.5);
      dir = mid.sub(new Vector3(0, 0, stock.calibration.axisZ)).normalize();
    }
    if (!dir) return;
    const angle = indexToAlignDirection(dir);
    setOps((prev) => prev.map((o) => (o.id === op.id ? { ...o, angle } : o)));
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
    setStock(job.stock);
    setPrimitives(job.primitives);
    setOps(job.ops);
    seedJobOpIds(job.ops);
    setGenerated({});
    setEditingOpId(null);
    setExpandedOpId(null);
    setSelection([]);
    setSelectedObjectId('model');
    setGcode(null);
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
    setSelectedObjectId('model');
    setGcode(null);
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
        <h1>simple.cam</h1>
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
          <button type="button" onClick={saveJob} disabled={!geometry && ops.length === 0}>
            Save job
          </button>
          <button type="button" onClick={() => openJobInputRef.current?.click()}>
            Open job…
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
            edgePickingEnabled={editingOpId === null}
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
                materialId={stock.materialId}
                featureLabels={featureLabels}
                onAddOp={addOp}
                onChangeOp={(op) => {
                  setOps((prev) => prev.map((o) => (o.id === op.id ? op : o)));
                  const before = ops.find((o) => o.id === op.id);
                  if (before && before.toolId !== op.toolId) setLastToolId(op.toolId);
                }}
                onSelectionIsChange={changeSelectionIs}
                onIndexToSelection={indexToSelection}
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