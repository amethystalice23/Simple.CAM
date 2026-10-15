import { useEffect, useState } from 'react';
import type { OriginEdge, Stock } from '../core/types';
import { MATERIALS } from '../core/materials';

interface Props {
  stock: Stock;
  onChange: (next: Stock) => void;
}

/** Variant-preserving patch: callers are narrowed to one Stock kind. */
function mergeStock<S extends Stock>(base: S, next: Partial<S>): S {
  return { ...base, ...next };
}

/** Labeled numeric field; commits only when the text parses to `min` or above. */
function NumberField(props: { label: string; value: number; min?: number; step?: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(props.value));
  // keep the field in sync when the value is changed elsewhere (e.g. kind switch)
  useEffect(() => setText(String(props.value)), [props.value]);
  const commit = (s: string) => {
    setText(s);
    const v = parseFloat(s);
    if (Number.isFinite(v) && (props.min === undefined || v >= props.min)) props.onCommit(v);
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        step={props.step ?? 1}
        value={text}
        onChange={(e) => commit(e.target.value)}
      />
    </label>
  );
}

function Segmented(props: { options: readonly OriginEdge[]; value: OriginEdge; onChange: (v: OriginEdge) => void }) {
  return (
    <div className="segmented">
      {props.options.map((o) => (
        <button
          key={o}
          type="button"
          className={o === props.value ? 'active' : ''}
          onClick={() => props.onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function StockPanel({ stock, onChange }: Props) {

  return (
    <section>
      <h2>Stock</h2>
      <div className="segmented wide">
        <button
          type="button"
          className={stock.kind === 'cylinder' ? 'active' : ''}
          onClick={() =>
            onChange(
              stock.kind === 'cylinder' ? stock : {
                kind: 'cylinder',
                length: 100,
                xOrigin: 'min',
                calibration: { aOriginDeg: 0, crownZ: 0, effectiveRadius: 25 },
                materialId: stock.materialId,
              },
            )
          }
        >
          Cylinder (4th axis)
        </button>
        <button
          type="button"
          className={stock.kind === 'box' ? 'active' : ''}
          onClick={() =>
            onChange(
              stock.kind === 'box' ? stock : {
                kind: 'box',
                sizeX: 100,
                sizeY: 100,
                sizeZ: 20,
                origin: { x: 'min', y: 'min', z: 'max' },
                materialId: stock.materialId,
              },
            )
          }
        >
          Box
        </button>
      </div>

      {stock.kind === 'cylinder' ? (
        <>
          <NumberField
            label="Diameter (mm)"
            value={stock.calibration.effectiveRadius * 2}
            min={1}
            step={0.1}
            onCommit={(v) =>
              onChange(mergeStock(stock, { calibration: { ...stock.calibration, effectiveRadius: v / 2 } }))
            }
          />
          <NumberField
            label="Length (mm)"
            value={stock.length}
            min={1}
            onCommit={(v) => onChange(mergeStock(stock, { length: v }))}
          />
          <div className="field">
            <span>X0 along axis</span>
            <Segmented
              options={['min', 'mid', 'max']}
              value={stock.xOrigin}
              onChange={(v) => onChange(mergeStock(stock, { xOrigin: v }))}
            />
          </div>
          <NumberField
            label="A origin (deg, probed)"
            value={stock.calibration.aOriginDeg}
            onCommit={(v) =>
              onChange(mergeStock(stock, { calibration: { ...stock.calibration, aOriginDeg: v } }))
            }
          />
          <NumberField
            label="Crown Z (mm, machine)"
            value={stock.calibration.crownZ}
            step={0.1}
            onCommit={(v) => onChange(mergeStock(stock, { calibration: { ...stock.calibration, crownZ: v } }))}
          />
        </>
      ) : (
        <>
          <NumberField label="X (mm)" value={stock.sizeX} min={1} onCommit={(v) => onChange(mergeStock(stock, { sizeX: v }))} />
          <NumberField label="Y (mm)" value={stock.sizeY} min={1} onCommit={(v) => onChange(mergeStock(stock, { sizeY: v }))} />
          <NumberField label="Z (mm)" value={stock.sizeZ} min={1} onCommit={(v) => onChange(mergeStock(stock, { sizeZ: v }))} />
          <div className="field">
            <span>Origin in stock</span>
            <div className="origin-grid">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <div className="field" key={axis}>
                  <span>{axis.toUpperCase()}</span>
                  <Segmented
                    options={['min', 'mid', 'max']}
                    value={stock.origin[axis]}
                    onChange={(v) => onChange(mergeStock(stock, { origin: { ...stock.origin, [axis]: v } }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <label className="field">
        <span>Material</span>
        <select value={stock.materialId} onChange={(e) => onChange({ ...stock, materialId: e.target.value })}>
          {MATERIALS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}