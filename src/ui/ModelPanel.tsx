import * as THREE from 'three';
import { identityTransform } from '../core/types';
import type { ModelTransform, OriginEdge, Stock } from '../core/types';
import { alignAxisToStock, alignToStock, dropToSurface } from './placement';
import { NumInput } from './fields';

interface Props {
  geometry: THREE.BufferGeometry;
  stock: Stock;
  transform: ModelTransform;
  onChange: (t: ModelTransform) => void;
  showFeatures: boolean;
  measureMode: boolean;
  onShowFeaturesChange: (v: boolean) => void;
  onMeasureModeChange: (v: boolean) => void;
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

/** Button labels for min/mid/max edge alignment, per axis. */
const EDGE_LABELS: Record<Axis, Record<OriginEdge, string>> = {
  x: { min: 'Left', mid: 'Center', max: 'Right' },
  y: { min: 'Front', mid: 'Center', max: 'Back' },
  z: { min: 'Bottom', mid: 'Center', max: 'Top' },
};

/** Move/rotate the loaded model relative to the stock. */
export function ModelPanel({
  geometry,
  stock,
  transform,
  onChange,
  showFeatures,
  measureMode,
  onShowFeaturesChange,
  onMeasureModeChange,
}: Props) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());

  const pos = transform.position;
  const rot = transform.rotationDeg;
  const setPosition = (axis: Axis, v: number) =>
    onChange({ ...transform, position: { ...pos, [axis]: v } });
  const setRotation = (axis: Axis, v: number) =>
    onChange({ ...transform, rotationDeg: { ...rot, [axis]: v } });
  /** Nudge a rotation by ±90° and normalize into −180…180. */
  const bumpRot = (axis: Axis, delta: number) => {
    const n = (((rot[axis] + delta) % 360) + 360) % 360;
    setRotation(axis, n > 180 ? n - 360 : n);
  };

  return (
    <section>
      <h2>Model</h2>
      <p>
        size {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm (model coords)
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={showFeatures}
          onChange={(e) => onShowFeaturesChange(e.target.checked)}
        />
        <span>
          Show detected features
          <span className="legend">edges red · circles green · holes cyan</span>
        </span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={measureMode}
          onChange={(e) => onMeasureModeChange(e.target.checked)}
        />
        <span>
          Measure mode
          <span className="legend">hover snaps to the nearest feature</span>
        </span>
      </label>

      <p className="subhead">Position (mm)</p>
      {AXES.map((a) => (
        <div className="axis-row" key={a}>
          <span className="axis-label">{a.toUpperCase()}</span>
          <NumInput value={pos[a]} step={0.5} onCommit={(v) => setPosition(a, v)} />
          {(['min', 'mid', 'max'] as OriginEdge[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange(alignAxisToStock(geometry, transform, stock, a, e))}
            >
              {EDGE_LABELS[a][e]}
            </button>
          ))}
        </div>
      ))}

      <p className="subhead">Rotation (°)</p>
      {AXES.map((a) => (
        <div className="axis-row" key={`rot-${a}`}>
          <span className="axis-label">{a.toUpperCase()}</span>
          <NumInput value={rot[a]} step={15} onCommit={(v) => setRotation(a, v)} />
          <button type="button" onClick={() => bumpRot(a, -90)}>
            −90°
          </button>
          <button type="button" onClick={() => bumpRot(a, 90)}>
            +90°
          </button>
        </div>
      ))}

      <div className="buttons">
        <button type="button" onClick={() => onChange(dropToSurface(geometry, transform, stock))}>
          Drop to surface
        </button>
        <button type="button" onClick={() => onChange(alignToStock(geometry, transform, stock))}>
          Align to stock
        </button>
        <button type="button" className="secondary" onClick={() => onChange(identityTransform())}>
          Reset
        </button>
      </div>
    </section>
  );
}