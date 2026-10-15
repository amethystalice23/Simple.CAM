import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { faceCylinder } from '../cam/faceCylinder';
import { detectFeatures } from '../cam/features';
import { postCarvera } from '../post/carvera';
import { getMaterial } from '../core/materials';
import { identityTransform, originSpan } from '../core/types';
import type { FaceCylinderOp, ModelTransform, Stock, Tool } from '../core/types';
import { MAKERA_TOOLS } from '../core/makeraTools.generated';
import { ModelPanel } from './ModelPanel';
import { StockPanel } from './StockPanel';
import { ToolPanel } from './ToolPanel';
import { Viewport } from './Viewport';

const initialStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, crownZ: 0, effectiveRadius: 25 },
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

const TAB_LABELS: Record<Tab, string> = { stock: 'Stock', model: 'Model', tools: 'Tools', ops: 'Ops' };

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
  const dropRef = useRef<HTMLDivElement>(null);

  // feature detection is model-space only: reruns on model load, not moves
  const features = useMemo(() => (geometry ? detectFeatures(geometry) : null), [geometry]);

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
      setTransform(identityTransform()); // each model starts at its own origin
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
              stock={stock}
              transform={transform}
              onChange={setTransform}
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