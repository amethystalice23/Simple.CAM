import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { faceCylinder } from '../cam/faceCylinder';
import { axialExtentX, detectFeatures } from '../cam/features';
import { transformedPositions } from '../cam/slicing';
import { postCarvera } from '../post/carvera';
import { getMaterial } from '../core/materials';
import { identityTransform, originSpan } from '../core/types';
import type {
  FaceCylinderOp,
  ModelTransform,
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [primitives, setPrimitives] = useState<Primitive[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState('model');
  const [modelName, setModelName] = useState('Loaded model');
  const dropRef = useRef<HTMLDivElement>(null);

  // feature detection is model-space only: reruns on model load, not moves
  const features = useMemo(() => (geometry ? detectFeatures(geometry) : null), [geometry]);

  /** selection ids resolved to kind+index for viewport highlighting */
  const resolvedSelection: ResolvedSelection[] = useMemo(() => {
    if (!features) return [];
    const out: ResolvedSelection[] = [];
    for (const id of selection) {
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
  }, [selection, features]);

  const toggleSelect = (id: string) =>
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

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

  useEffect(() => {
    try {
      localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify({ v: 1, tools }));
    } catch {
      // storage unavailable — edits live for the session only
    }
  }, [tools]);

  const tool = tools.find((t) => t.id === toolId) ?? tools[0];

  // Demo job: face the stock cylinder 5mm down on the diameter. Parameters
  // follow the stock (axial extent), material (feeds/DOC), and selected tool.
  const op: FaceCylinderOp = useMemo(() => {
    const cyl = stock.kind === 'cylinder' ? stock : null;
    const material = getMaterial(stock.materialId);
    const [x0, x1] = cyl ? originSpan(cyl.xOrigin, cyl.length) : originSpan('min', 100);
    return {
      kind: 'faceCylinder',
      id: 'op1',
      toolId: tool.id,
      targetDiameter: cyl ? Math.max(cyl.calibration.effectiveRadius * 2 - 5, 1) : 10,
      xStart: x0,
      xEnd: x1,
      stepDown: material.stepDownByTool[tool.type] / 2,
      finishAllowance: 0.2,
      plungeFeed: Math.round(material.feedByTool[tool.type] * material.plungeFraction),
      rotation: 'cw',
    };
  }, [stock, tool]);

  const loadStl = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const geo = new STLLoader().parse(buf);
      setGeometry(geo);
      setModelName(file.name);
      setTransform(identityTransform()); // each model starts at its own origin
      setSelection([]); // ids belong to the old model
      setSelectedObjectId('model');
      setTab('model');
      setError(null);
    } catch (e) {
      setError(`could not parse STL: ${String(e)}`);
    }
  };

  const generate = () => {
    try {
      if (stock.kind !== 'cylinder') {
        throw new Error('the demo job faces a cylinder — switch the stock kind back');
      }
      const res = faceCylinder(op, stock, tool);
      const nc = postCarvera({ moves: res.moves, tools: [tool], options: { jobName: 'face-test' } });
      setGcode(
        `; ${res.passes} passes, ${res.radialDepth.toFixed(2)}mm radial, ` +
          `~${res.estimatedMinutes.toFixed(1)} min (A limited to 6.6 RPM)\n` +
          nc,
      );
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const download = () => {
    if (!gcode) return;
    const url = URL.createObjectURL(new Blob([gcode], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'face-test.nc';
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
            selectionMode={selectionMode}
            opSelection={resolvedSelection}
            primitives={primitives}
            onToggleSelect={toggleSelect}
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
              selectionMode={selectionMode}
              onSelectionModeChange={setSelectionMode}
              showFeatures={showFeatures}
              measureMode={measureMode}
              onShowFeaturesChange={setShowFeatures}
              onMeasureModeChange={setMeasureMode}
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
              <section>
                <h2>Operations</h2>
                <p>
                  tool: {tool.name} ({tool.type} Ø{tool.diameter})
                </p>
                {stock.kind === 'cylinder' ? (
                  <p>faceCylinder → Ø{op.targetDiameter.toFixed(1)}, X {op.xStart}…{op.xEnd}</p>
                ) : (
                  <p>box stock selected — cylinder demo op unavailable</p>
                )}
                <button onClick={generate}>Generate G-code</button>
              </section>
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