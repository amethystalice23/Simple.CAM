import type { AxisMode, Stock } from '../core/types';
import { rotaryCalibrationOf } from '../core/types';
import { MATERIALS } from '../core/materials';
import { NumberField, Segmented } from './fields';

interface Props {
  stock: Stock;
  onChange: (next: Stock) => void;
}

/** Variant-preserving patch: callers are narrowed to one Stock kind. */
function mergeStock<S extends Stock>(base: S, next: Partial<S>): S {
  return { ...base, ...next };
}

/** Mode (machine capability) is orthogonal to shape: a cylinder can sit in a
 * vise, a box can ride the rotary axis. */
const AXIS_MODES: readonly AxisMode[] = ['3-axis', '4-axis'];

export function StockPanel({ stock, onChange }: Props) {

  return (
    <section>
      <h2>Stock</h2>
      <div className="field">
        <span>Mode</span>
        <Segmented
          options={AXIS_MODES}
          value={stock.axisMode}
          onChange={(v) => onChange(mergeStock(stock, { axisMode: v }))}
        />
      </div>
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
                calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
                axisMode: stock.axisMode,
                materialId: stock.materialId,
              },
            )
          }
        >
          Cylinder
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
                axisMode: stock.axisMode,
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
            label={stock.axisMode === '3-axis' ? 'Height (mm)' : 'Length (mm)'}
            value={stock.length}
            min={1}
            onCommit={(v) => onChange(mergeStock(stock, { length: v }))}
          />
          <div className="field">
            <span>{stock.axisMode === '3-axis' ? 'Z0 along axis' : 'X0 along axis'}</span>
            <Segmented
              options={['min', 'mid', 'max']}
              value={stock.xOrigin}
              onChange={(v) => onChange(mergeStock(stock, { xOrigin: v }))}
            />
          </div>
          {stock.axisMode === '4-axis' && (
            <>
              <NumberField
                label="A origin (deg, probed)"
                value={stock.calibration.aOriginDeg}
                onCommit={(v) =>
                  onChange(mergeStock(stock, { calibration: { ...stock.calibration, aOriginDeg: v } }))
                }
              />
              <NumberField
                label="Axis Z (mm, machine)"
                value={stock.calibration.axisZ}
                step={0.1}
                onCommit={(v) => onChange(mergeStock(stock, { calibration: { ...stock.calibration, axisZ: v } }))}
              />
              <p className="hint">
                Axis Z is the stock-center datum: the Z1-probed 4th-axis motor-block offset (where
                Makera Studio puts Z0).
              </p>
            </>
          )}
          {stock.axisMode === '3-axis' && (
            <p className="hint">
              Stands vertical: axis ∥ Z, centered on X0/Y0. The crown (top face) the depth boxes
              measure from is set by the height and the Z0 position along it.
            </p>
          )}
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
          {stock.axisMode === '4-axis' && (
            <p className="hint">
              4-axis: the box rotates about Y=0 through its Z center — treated as
              Ø{(rotaryCalibrationOf(stock).effectiveRadius * 2).toFixed(1)} (the Y-Z diagonal;
              corners face off first, flats cut as air)
            </p>
          )}
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