import { useMemo, useRef, useState } from 'react';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { faceCylinder } from '../cam/faceCylinder';
import { postCarvera } from '../post/carvera';
import type { FaceCylinderOp, Stock, Tool } from '../core/types';
import { Viewport } from './Viewport';

const tool: Tool = { id: 't1', name: '6mm flat', type: 'flat', diameter: 6, spindleRpm: 18000 };

const stock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  calibration: { aOriginDeg: 0, crownZ: 0, effectiveRadius: 25 },
};

export function App() {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const [gcode, setGcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const op: FaceCylinderOp = useMemo(
    () => ({
      kind: 'faceCylinder',
      id: 'op1',
      toolId: 't1',
      targetDiameter: 40,
      xStart: 0,
      xEnd: 100,
      stepDown: 1,
      finishAllowance: 0.2,
      plungeFeed: 300,
      rotation: 'cw',
    }),
    [],
  );

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
        <span className="tag">Carvera · face cylinder Ø50 → Ø40 (demo job)</span>
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
          <Viewport geometry={geometry} cylinder={{ radius: 25, length: 100 }} />
          <div className="drop-hint">{geometry ? 'STL loaded' : 'drop an STL here (Phase 1: feature tracing)'}</div>
        </div>
        <aside>
          <section>
            <h2>Stock</h2>
            <p>
              cylinder Ø{stock.calibration.effectiveRadius * 2} × {stock.length} mm — 4th axis ∥ X,
              crown Z {stock.calibration.crownZ}
            </p>
          </section>
          <section>
            <h2>Operations</h2>
            <p>faceCylinder → Ø{op.targetDiameter}, X {op.xStart}…{op.xEnd}</p>
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