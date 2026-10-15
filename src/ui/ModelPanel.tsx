import { useState } from 'react';
import * as THREE from 'three';
import type { ModelTransform, Primitive, Stock } from '../core/types';
import { alignAxisToStock, alignToStock, dropToSurface } from './placement';
import { NumInput } from './fields';
import { resizePrimitive, revertPrimitive, scaleForSize } from './primitives';

interface Props {
  geometry: THREE.BufferGeometry;
  modelName: string;
  stock: Stock;
  transform: ModelTransform; // the loaded model's
  onTransformChange: (t: ModelTransform) => void;
  primitives: Primitive[];
  selectedObjectId: string; // 'model' or a primitive id
  onSelectObject: (id: string) => void;
  onPrimitiveChange: (p: Primitive) => void;
  onDeleteObject: () => void;
  onAddPrimitive: (kind: 'cylinder' | 'box') => void;
  selectionMode: boolean;
  onSelectionModeChange: (v: boolean) => void;
  showFeatures: boolean;
  measureMode: boolean;
  onShowFeaturesChange: (v: boolean) => void;
  onMeasureModeChange: (v: boolean) => void;
}

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];

const EDGE_LABELS: Record<Axis, Record<'min' | 'mid' | 'max', string>> = {
  x: { min: 'Left', mid: 'Center', max: 'Right' },
  y: { min: 'Front', mid: 'Center', max: 'Back' },
  z: { min: 'Bottom', mid: 'Center', max: 'Top' },
};

const SIZE_LABELS: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' };

/** Label + editable number + per-field revert button. */
function SizeField(props: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  onRevert: () => void;
}) {
  return (
    <div className="axis-row">
      <span className="axis-label">{props.label}</span>
      <NumInput value={props.value} step={0.1} onCommit={props.onCommit} />
      <button
        type="button"
        className="mini"
        title="Revert to original size"
        onClick={props.onRevert}
      >
        ↺
      </button>
    </div>
  );
}

/** Snap extents for a primitive come from its own shape, not the model. */
function snapGeometry(p: Primitive): THREE.BufferGeometry {
  if (p.kind === 'box') return new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z);
  const g = new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, p.length, 8);
  g.rotateZ(Math.PI / 2); // axis ∥ machine X, like the rendered primitive
  return g;
}

export function ModelPanel(props: Props) {
  const { geometry, stock, transform, primitives, selectedObjectId } = props;
  const isModel = selectedObjectId === 'model';
  const selectedPrimitive = isModel
    ? null
    : (primitives.find((p) => p.id === selectedObjectId) ?? null);
  const [uniform, setUniform] = useState(false);

  // the active placement applies to whichever object is selected
  const active: ModelTransform = isModel
    ? transform
    : selectedPrimitive?.transform ?? transform;
  const setActive = (t: ModelTransform) => {
    if (isModel) props.onTransformChange(t);
    else if (selectedPrimitive) props.onPrimitiveChange({ ...selectedPrimitive, transform: t });
  };

  // extents for snapping: the model's geometry, or the primitive's shape
  const withSnapGeometry = (fn: (geo: THREE.BufferGeometry) => ModelTransform) =>
    setActive(fn(isModel ? geometry : snapGeometry(selectedPrimitive!)));

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const native = { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };
  const displayed = {
    x: native.x * transform.scale.x,
    y: native.y * transform.scale.y,
    z: native.z * transform.scale.z,
  };

  const setPosition = (axis: Axis, v: number) =>
    setActive({ ...active, position: { ...active.position, [axis]: v } });
  const setRotation = (axis: Axis, v: number) =>
    setActive({ ...active, rotationDeg: { ...active.rotationDeg, [axis]: v } });
  const bumpRot = (axis: Axis, delta: number) => {
    const n = (((active.rotationDeg[axis] + delta) % 360) + 360) % 360;
    setRotation(axis, n > 180 ? n - 360 : n);
  };

  return (
    <>
      <section>
        <h2>Objects</h2>
        <div className="tool-list">
          <button
            type="button"
            className={`tool-row${isModel ? ' active' : ''}`}
            onClick={() => props.onSelectObject('model')}
          >
            <span className="tool-name">{props.modelName}</span>
            <span className="tool-meta">
              loaded · {displayed.x.toFixed(1)} × {displayed.y.toFixed(1)} × {displayed.z.toFixed(1)} mm
            </span>
          </button>
          {primitives.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tool-row${p.id === selectedObjectId ? ' active' : ''}`}
              onClick={() => props.onSelectObject(p.id)}
            >
              <span className="tool-name">
                {p.kind === 'cylinder'
                  ? `cylinder Ø${p.diameter.toFixed(1)} × ${p.length.toFixed(1)}`
                  : `box ${p.size.x.toFixed(1)} × ${p.size.y.toFixed(1)} × ${p.size.z.toFixed(1)}`}
              </span>
              <span className="tool-meta">primitive</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Size (mm)</h2>
        <label className="check">
          <input type="checkbox" checked={uniform} onChange={(e) => setUniform(e.target.checked)} />
          <span>Scale all dimensions together</span>
        </label>
        {isModel ? (
          <>
            {AXES.map((a) => (
              <SizeField
                key={a}
                label={SIZE_LABELS[a]}
                value={displayed[a]}
                onCommit={(v) =>
                  props.onTransformChange({
                    ...transform,
                    scale: scaleForSize(native, displayed, a, v, uniform),
                  })
                }
                onRevert={() =>
                  props.onTransformChange({
                    ...transform,
                    scale: { ...transform.scale, [a]: 1 },
                  })
                }
              />
            ))}
            <p className="hint">
              scale {transform.scale.x.toFixed(2)} / {transform.scale.y.toFixed(2)} /{' '}
              {transform.scale.z.toFixed(2)}
            </p>
          </>
        ) : selectedPrimitive && selectedPrimitive.kind === 'cylinder' ? (
          <>
            <SizeField
              label="Ø"
              value={selectedPrimitive.diameter}
              onCommit={(v) =>
                props.onPrimitiveChange(resizePrimitive(selectedPrimitive, 'x', v, uniform))
              }
              onRevert={() =>
                props.onPrimitiveChange(revertPrimitive(selectedPrimitive, 'x'))
              }
            />
            <SizeField
              label="L"
              value={selectedPrimitive.length}
              onCommit={(v) =>
                props.onPrimitiveChange(resizePrimitive(selectedPrimitive, 'y', v, uniform))
              }
              onRevert={() =>
                props.onPrimitiveChange(revertPrimitive(selectedPrimitive, 'y'))
              }
            />
          </>
        ) : selectedPrimitive ? (
          AXES.map((a) => (
            <SizeField
              key={a}
              label={SIZE_LABELS[a]}
              value={selectedPrimitive.size[a]}
              onCommit={(v) =>
                props.onPrimitiveChange(resizePrimitive(selectedPrimitive, a, v, uniform))
              }
              onRevert={() => props.onPrimitiveChange(revertPrimitive(selectedPrimitive, a))}
            />
          ))
        ) : null}
      </section>

      <section>
        <p className="subhead">Position (mm)</p>
        {AXES.map((a) => (
          <div className="axis-row" key={a}>
            <span className="axis-label">{a.toUpperCase()}</span>
            <NumInput value={active.position[a]} step={0.5} onCommit={(v) => setPosition(a, v)} />
            {(['min', 'mid', 'max'] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => withSnapGeometry((geo) => alignAxisToStock(geo, active, stock, a, e))}
              >
                {EDGE_LABELS[a][e]}
              </button>
            ))}
          </div>
        ))}
        <div className="buttons">
          <button type="button" onClick={() => withSnapGeometry((geo) => dropToSurface(geo, active, stock))}>
            Drop to surface
          </button>
          <button type="button" onClick={() => withSnapGeometry((geo) => alignToStock(geo, active, stock))}>
            Align to stock
          </button>
        </div>

        <p className="subhead">Rotation (°)</p>
        {AXES.map((a) => (
          <div className="axis-row" key={`rot-${a}`}>
            <span className="axis-label">{a.toUpperCase()}</span>
            <NumInput value={active.rotationDeg[a]} step={15} onCommit={(v) => setRotation(a, v)} />
            <button type="button" onClick={() => bumpRot(a, -90)}>
              −90°
            </button>
            <button type="button" onClick={() => bumpRot(a, 90)}>
              +90°
            </button>
          </div>
        ))}
      </section>

      <section>
        <div className="buttons">
          <button type="button" onClick={() => props.onAddPrimitive('cylinder')}>
            + Cylinder
          </button>
          <button type="button" onClick={() => props.onAddPrimitive('box')}>
            + Box
          </button>
          <button
            type="button"
            className="secondary"
            disabled={isModel}
            onClick={props.onDeleteObject}
          >
            Delete object
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={props.selectionMode}
            onChange={(e) => props.onSelectionModeChange(e.target.checked)}
          />
          <span>
            Select features
            <span className="legend">click features in the viewport for operations</span>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={props.showFeatures}
            onChange={(e) => props.onShowFeaturesChange(e.target.checked)}
          />
          <span>
            Show detected features
            <span className="legend">edges red · circles green · holes cyan</span>
          </span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={props.measureMode}
            onChange={(e) => props.onMeasureModeChange(e.target.checked)}
          />
          <span>
            Measure mode
            <span className="legend">hover to snap; right-click to measure</span>
          </span>
        </label>
      </section>
    </>
  );
}