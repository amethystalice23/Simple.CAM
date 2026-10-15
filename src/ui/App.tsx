import { useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { faceCylinder } from '../cam/faceCylinder';
import { postCarvera } from '../post/carvera';
import { getMaterial } from '../core/materials';
import { originSpan } from '../core/types';
import type { FaceCylinderOp, Stock, Tool } from '../core/types';
import { StockPanel } from './StockPanel';
import { Viewport } from './Viewport';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };

const initialStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, crownZ: 0, effectiveRadius: 25 },
  materialId: 'aluminum-6061',
};

export function App() {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const [gcode, setGcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stock, setStock] = useState<Stock>(initialStock);
  const dropRef = useRef<HTMLDivElement>(null);

  // Demo job: face the stock cylinder 5mm down on the diameter. Parameters
  // follow the stock (axial extent) and material (plunge feed from preset).
  const op: FaceCylinderOp = useMemo(() => {
    const cyl = stock.kind === 'cylinder' ? stock : null;
    const material = getMaterial(stock.materialId);
    const [x0, x1] = cyl
      ? originSpan(cyl.xOrigin, cyl.length)
      : originSpan('min', 100);
    return {
      kind: 'faceCylinder',
      id: 'op1',
      toolId: 't1',
      targetDiameter: cyl ? Math.max(cyl.calibration.effectiveRadius * 2 - 5, 1) : 10,
      xStart: x0,
      xEnd: x1,
      stepDown: material.stepDownByTool.flat / 2,
      finishAllowance: 0.2,
      plungeFeed: Math.round(material.feedByTool.flat * material.plungeFraction),
      rotation: 'cw',
    };
  }, [stock]);

  const loadStl = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      setGeometry(new STLLoader().parse(buf));
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
          <Viewport geometry={geometry} stock={stock} />
          <div className="drop-hint">{geometry ? 'STL loaded' : 'drop an STL here (Phase 1: feature tracing)'}</div>
        </div>
        <aside>
          <StockPanel stock={stock} onChange={setStock} />
          <section>
            <h2>Operations</h2>
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
          {error && <p className="error">{error}</p>}
        </aside>
      </main>
    </div>
  );
}