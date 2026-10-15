import * as THREE from 'three';
import { identityTransform } from '../core/types';
import type { ModelTransform, Stock } from '../core/types';
import { alignToStock, centerOnX, centerOnY, centerOnZ, dropToSurface } from './placement';
import { NumberField } from './fields';

interface Props {
  geometry: THREE.BufferGeometry;
  stock: Stock;
  transform: ModelTransform;
  onChange: (t: ModelTransform) => void;
}

/** Move/rotate the loaded model relative to the stock. */
export function ModelPanel({ geometry, stock, transform, onChange }: Props) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());

  const pos = transform.position;
  const rot = transform.rotationDeg;
  const setPosition = (axis: 'x' | 'y' | 'z', v: number) =>
    onChange({ ...transform, position: { ...pos, [axis]: v } });
  const setRotation = (axis: 'x' | 'y' | 'z', v: number) =>
    onChange({ ...transform, rotationDeg: { ...rot, [axis]: v } });

  return (
    <section>
      <h2>Model</h2>
      <p>
        size {size.x.toFixed(1)} × {size.y.toFixed(1)} × {size.z.toFixed(1)} mm (model coords)
      </p>
      <NumberField label="Position X (mm)" value={pos.x} step={0.5} onCommit={(v) => setPosition('x', v)} />
      <NumberField label="Position Y (mm)" value={pos.y} step={0.5} onCommit={(v) => setPosition('y', v)} />
      <NumberField label="Position Z (mm)" value={pos.z} step={0.5} onCommit={(v) => setPosition('z', v)} />
      <NumberField label="Rotate X (°)" value={rot.x} step={15} onCommit={(v) => setRotation('x', v)} />
      <NumberField label="Rotate Y (°)" value={rot.y} step={15} onCommit={(v) => setRotation('y', v)} />
      <NumberField label="Rotate Z (°)" value={rot.z} step={15} onCommit={(v) => setRotation('z', v)} />
      <div className="buttons">
        <button type="button" onClick={() => onChange(centerOnX(geometry, transform, stock))}>
          Center X
        </button>
        <button type="button" onClick={() => onChange(centerOnY(geometry, transform, stock))}>
          Center Y
        </button>
        <button type="button" onClick={() => onChange(centerOnZ(geometry, transform, stock))}>
          Center Z
        </button>
        <button type="button" onClick={() => onChange(dropToSurface(geometry, transform, stock))}>
          Drop to surface
        </button>
      </div>
      <div className="buttons">
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