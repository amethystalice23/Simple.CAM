import { useState } from 'react';
import * as THREE from 'three';
import { rotateGray90 } from '../core/bitmapImport';
import { round2, rotaryCalibrationOf } from '../core/types';
import type { ModelTransform, Primitive, Stock, Vec3 } from '../core/types';
import { alignAxisToStock, alignToStock, dropToSurface, stockSpan } from './placement';
import { artworkSnapGeometry, bitmapSnapGeometry, flipGrayVertical, primitiveGeometry } from './featureSources';
import { NumInput } from './fields';
import { bitmapWrappedFit, resizePrimitive, revertPrimitive, scaleForSize } from './primitives';

interface Props {
  /** null when no STL is loaded — primitives still work (the whole point) */
  geometry: THREE.BufferGeometry | null;
  modelName: string;
  stock: Stock;
  transform: ModelTransform; // the loaded model's
  onTransformChange: (t: ModelTransform) => void;
  primitives: Primitive[];
  selectedObjectId: string | null; // 'model', a primitive id, or nothing
  onSelectObject: (id: string) => void;
  onPrimitiveChange: (p: Primitive) => void;
  /** remove one primitive by id (the row's ✕) */
  onDeletePrimitive: (id: string) => void;
  /** non-null when the mesh was too fine for full-res feature detection —
   * says picking runs on a simplified copy (display and cutting are
   * untouched) */
  detectionNote: string | null;
  onAddPrimitive: (kind: 'cylinder' | 'box') => void;
  /** the artwork ⇩ Ø pick: armed for the SELECTED artwork, next viewport
   * click on a circular feature becomes its wrap Ø */
  pickingWrapDiameter: boolean;
  onPickWrapDiameter: (primId: string) => void;
  measureMode: boolean;
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

/** object types, color-coded like the op kinds (2026-11-11): the dot on
 * each list row and the editor card's accent bar share --type-color */
type ObjKind = 'model' | 'cylinder' | 'box' | 'artwork';

/** the ⓘ affordance: explanatory text lives in a tooltip, never dropped
 * into a list or panel as a paragraph (Alice, 2026-11-11) */
function InfoTip({ text }: { text: string }) {
  return (
    <button type="button" className="info-tip" title={text}>
      ⓘ
    </button>
  );
}

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

export function ModelPanel(props: Props) {
  const { geometry, stock, transform, primitives, selectedObjectId } = props;
  // 'model' is only a valid selection when a model is loaded
  const isModel = selectedObjectId === 'model' && geometry !== null;
  const selectedPrimitive = isModel
    ? null
    : (primitives.find((p) => p.id === selectedObjectId) ?? null);
  const hasActive = isModel || selectedPrimitive !== null;
  const isArtwork = selectedPrimitive?.kind === 'artwork';
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
  // (unified builder — the same mesh the detector and viewport use).
  // Artwork's primitiveGeometry is empty (raycast transparency), so its
  // REAL line-work bounds stand in — primitiveGeometry's ±Infinity box
  // snapped to NaN and the artwork vanished.
  const withSnapGeometry = (fn: (geo: THREE.BufferGeometry) => ModelTransform) => {
    const shape = !isModel
      ? selectedPrimitive!.kind === 'artwork'
        ? artworkSnapGeometry(selectedPrimitive!)
        : selectedPrimitive!.kind === 'bitmap'
          ? bitmapSnapGeometry(selectedPrimitive!)
          : primitiveGeometry(selectedPrimitive!)
      : geometry!;
    const t = fn(shape);
    // snapped positions are auto-filled numbers — they read clean at 2dp
    setActive({
      ...t,
      position: { x: round2(t.position.x), y: round2(t.position.y), z: round2(t.position.z) },
    });
  };

  // model dims are only meaningful with a model
  let native: Vec3 | null = null;
  let displayed: Vec3 | null = null;
  if (geometry) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    native = { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };
    displayed = {
      x: native.x * transform.scale.x,
      y: native.y * transform.scale.y,
      z: native.z * transform.scale.z,
    };
  }

  // the selection's type + label — the editor card's identity
  const selKind: ObjKind = isModel
    ? 'model'
    : ((selectedPrimitive?.kind as ObjKind | undefined) ?? 'box');
  const artworkKind = (p: Extract<Primitive, { kind: 'artwork' }>): string =>
    p.sourceKind === 'svg' ? 'SVG Artwork' : p.sourceKind === 'dxf' ? 'DXF Artwork' : p.sourceKind === 'halftone' ? 'Halftone Artwork' : 'Artwork';
  /** the model's file type from its name's extension — the meta line's
   * first word ('loaded' told nobody anything) */
  const modelType = (() => {
    const m = /\.([a-z0-9]+)$/i.exec(props.modelName);
    return m ? m[1].toUpperCase() : 'STL';
  })();
  const selLabel = isModel
    ? props.modelName
    : selectedPrimitive &&
      (selectedPrimitive.kind === 'cylinder'
        ? `cylinder Ø${selectedPrimitive.diameter.toFixed(1)} × ${selectedPrimitive.length.toFixed(1)}`
        : selectedPrimitive.kind === 'artwork'
          ? `${artworkKind(selectedPrimitive)} · ${selectedPrimitive.paths.length} path(s)`
          : selectedPrimitive.kind === 'bitmap'
            ? `bitmap artwork · ${selectedPrimitive.width.toFixed(1)} × ${selectedPrimitive.height.toFixed(1)}mm`
            : `box ${selectedPrimitive.size.x.toFixed(1)} × ${selectedPrimitive.size.y.toFixed(1)} × ${selectedPrimitive.size.z.toFixed(1)}`);
  const rowLabel = (p: Primitive) =>
    p.kind === 'cylinder'
      ? `cylinder Ø${p.diameter.toFixed(1)} × ${p.length.toFixed(1)}`
      : p.kind === 'artwork'
        ? `${artworkKind(p)} · ${p.paths.length} path(s)`
        : p.kind === 'bitmap'
          ? `bitmap artwork · ${p.width.toFixed(1)} × ${p.height.toFixed(1)}mm`
          : `box ${p.size.x.toFixed(1)} × ${p.size.y.toFixed(1)} × ${p.size.z.toFixed(1)}`;
  /** the row's SECOND line: type + size, mirroring the model row's shape
   * (filename on top, file type + dims under) */
  const rowMeta = (p: Primitive) =>
    p.kind === 'artwork'
      ? `${(p.width * p.transform.scale.x).toFixed(1)} × ${(p.height * p.transform.scale.y).toFixed(1)} mm`
      : null;
  const rowName = (p: Primitive) =>
    p.kind === 'artwork' ? (p.sourceName ?? 'Artwork') : rowLabel(p);

  const setPosition = (axis: Axis, v: number) =>
    setActive({ ...active, position: { ...active.position, [axis]: v } });
  const setRotation = (axis: Axis, v: number) =>
    setActive({ ...active, rotationDeg: { ...active.rotationDeg, [axis]: v } });
  const bumpRot = (axis: Axis, delta: number) => {
    const n = (((active.rotationDeg[axis] + delta) % 360) + 360) % 360;
    setRotation(axis, n > 180 ? n - 360 : n);
  };
  // FLAT artwork W/H both drive this one uniform scale (no shear, ever);
  // scale 1 = the imported size, so revert is just 1/1/1
  const commitArtworkScale = (s: number) => {
    if (!(s > 0)) return;
    setActive({ ...active, scale: { x: s, y: s, z: s } });
  };
  const revertArtworkScale = () => setActive({ ...active, scale: { x: 1, y: 1, z: 1 } });

  // WRAPPED bitmap (round 3, 2026-11-24 — Alice: "if i rotate it rotates
  // the already wrapped tube, not the image on the tube"): rotation is
  // THE IMAGE'S — every rotation control rewrites the primitive's gray
  // before the around/axial mapping, never the strip's 3D transform. A
  // 90° step swaps which image axis runs around vs axial, so the
  // one-turn force-scale re-fits (bitmapWrappedFit on the rotated gray);
  // 180° flips the image end-for-end at unchanged dims.
  const wrappedBitmap =
    selectedPrimitive !== null &&
    selectedPrimitive.kind === 'bitmap' &&
    selectedPrimitive.presentation === 'wrapped';
  const rotateBitmapImage = (turns: number) => {
    if (!selectedPrimitive || selectedPrimitive.kind !== 'bitmap') return;
    let g = selectedPrimitive.gray;
    for (let n = ((turns % 4) + 4) % 4; n > 0; n--) g = rotateGray90(g);
    const fit = bitmapWrappedFit(g, props.stock); // re-run the force-scale
    props.onPrimitiveChange({
      ...selectedPrimitive,
      gray: g,
      width: fit.face.width,
      height: fit.face.height,
    });
  };
  // the ⇅ flip (round 4, 2026-11-24 — Alice: "you probably want a button
  // to flip it"): end-for-end along the image's rows, same stateless
  // gray-rewrite mechanism as the rotate buttons; aspect is untouched so
  // the face dims stand
  const flipBitmapImage = () => {
    if (!selectedPrimitive || selectedPrimitive.kind !== 'bitmap') return;
    props.onPrimitiveChange({
      ...selectedPrimitive,
      gray: flipGrayVertical(selectedPrimitive.gray),
    });
  };
  // Flipping flat↔wrapped (round 3, Alice's flip-repose ruling) re-poses
  // exactly as the import path would: centered on the stock, Z on the
  // rotation axis when wrapped / on the stock crown when flat — a flat
  // strip can never end up invisible inside the stock — and rotation
  // zeroes (the import pose; wrapped keeps it locked from here).
  const reposeOnPresentation = (presentation: 'flat' | 'wrapped'): ModelTransform => ({
    ...selectedPrimitive!.transform,
    rotationDeg: { x: 0, y: 0, z: 0 },
    position: {
      x: (stockSpan(props.stock, 'x')[0] + stockSpan(props.stock, 'x')[1]) / 2,
      y: (stockSpan(props.stock, 'y')[0] + stockSpan(props.stock, 'y')[1]) / 2,
      z:
        presentation === 'wrapped'
          ? rotaryCalibrationOf(props.stock).axisZ
          : stockSpan(props.stock, 'z')[1],
    },
  });

  return (
    <>
      <section>
        <div className="objects-head">
          <h2>Objects</h2>
          {/* the add buttons belong to the LIST they populate (2026-11-11) */}
          <div className="buttons">
            <button type="button" className="secondary" onClick={() => props.onAddPrimitive('cylinder')}>
              + Cylinder
            </button>
            <button type="button" className="secondary" onClick={() => props.onAddPrimitive('box')}>
              + Box
            </button>
          </div>
        </div>
        <div className="tool-list">
          {geometry && (
            <div className={`tool-row obj-model${isModel ? ' active' : ''}`}>
              <button
                type="button"
                className="tool-row-main"
                onClick={() => props.onSelectObject('model')}
              >
                <span className="tool-name">{props.modelName}</span>
                <span className="tool-meta">
                  {modelType} · {displayed!.x.toFixed(1)} × {displayed!.y.toFixed(1)} ×{' '}
                  {displayed!.z.toFixed(1)} mm
                </span>
              </button>
              {props.detectionNote && (
                <span className="tool-row-state">
                  <InfoTip text={props.detectionNote} />
                </span>
              )}
            </div>
          )}
          {primitives.map((p) => (
            <div
              key={p.id}
              className={`tool-row obj-${p.kind}${p.id === selectedObjectId ? ' active' : ''}`}
            >
              <button
                type="button"
                className="tool-row-main"
                onClick={() => props.onSelectObject(p.id)}
              >
                <span className="tool-name">{rowName(p)}</span>
                <span className="tool-meta">
                  {p.kind === 'artwork' ? `${rowLabel(p)} · ${rowMeta(p)}` : rowLabel(p)}
                </span>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Remove this primitive"
                onClick={() => props.onDeletePrimitive(p.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {!geometry && primitives.length === 0 && (
            <p className="hint">no model loaded — add a primitive above</p>
          )}
        </div>
        <label
          className="check"
          title="hover highlights · click selects (two = distance) · right-click clears"
        >
          <input
            type="checkbox"
            checked={props.measureMode}
            onChange={(e) => props.onMeasureModeChange(e.target.checked)}
          />
          <span>Measure mode</span>
        </label>
      </section>

      {hasActive && (
      <section className={`object-editor obj-${selKind}`}>
        <h2 className="panel-head">
          <span className="obj-dot big" />
          {selLabel}
          <span className="obj-editor-tag">editing</span>
        </h2>
        <p className="subhead">Size (mm)</p>
        {/* the uniform checkbox governs the model/cylinder/box resize
         *  fields — artwork sizing is uniform BY DESIGN (the wrapped
         *  invariant "the logo never shears", kept for flat W/H), so for
         *  artwork it is decoration: hidden. */}
        {!isArtwork && (
          <label className="check">
            <input type="checkbox" checked={uniform} onChange={(e) => setUniform(e.target.checked)} />
            <span>Scale all dimensions together</span>
          </label>
        )}
        {isModel ? (
          <>
            {AXES.map((a) => (
              <SizeField
                key={a}
                label={SIZE_LABELS[a]}
                value={displayed![a]}
                onCommit={(v) =>
                  props.onTransformChange({
                    ...transform,
                    scale: scaleForSize(native!, displayed!, a, v, uniform),
                  })
                }
                onRevert={() =>
                  props.onTransformChange({
                    ...transform,
                    scale: uniform
                      ? { x: 1, y: 1, z: 1 } // uniform mode reverts all three
                      : { ...transform.scale, [a]: 1 },
                  })
                }
              />
            ))}
            <InfoTip
              text={`scale ${transform.scale.x.toFixed(2)} / ${transform.scale.y.toFixed(2)} / ${transform.scale.z.toFixed(2)}`}
            />
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
                props.onPrimitiveChange(revertPrimitive(selectedPrimitive, 'x', uniform))
              }
            />
            <SizeField
              label="L"
              value={selectedPrimitive.length}
              onCommit={(v) =>
                props.onPrimitiveChange(resizePrimitive(selectedPrimitive, 'y', v, uniform))
              }
              onRevert={() =>
                props.onPrimitiveChange(revertPrimitive(selectedPrimitive, 'y', uniform))
              }
            />
          </>
        ) : selectedPrimitive && selectedPrimitive.kind === 'artwork' ? (
          <>
            <label className="field">
              <span>Presentation</span>
              <select
                value={selectedPrimitive.presentation}
                onChange={(e) =>
                  props.onPrimitiveChange({
                    ...selectedPrimitive,
                    presentation: e.target.value as 'flat' | 'wrapped',
                  })
                }
              >
                <option value="flat">flat</option>
                <option value="wrapped">wrapped</option>
              </select>
            </label>
            {selectedPrimitive.presentation === 'wrapped' ? (
              <>
                <div className="axis-row wide">
                  <span className="axis-label">Ø</span>
                  <NumInput
                    value={selectedPrimitive.wrapDiameter}
                    step={0.5}
                    onCommit={(v) =>
                      props.onPrimitiveChange({ ...selectedPrimitive, wrapDiameter: v })
                    }
                  />
                  {/* the ⇩ Ø pick — same affordance as the face ops': click
                   * a circular feature (the faced surface's rim, a turned
                   * Ø) and it becomes the artwork's cutting-surface Ø */}
                  <button
                    type="button"
                    className={`icon-btn${props.pickingWrapDiameter ? ' active' : ''}`}
                    title="Pick the Ø from a circular feature in the viewport"
                    onClick={() => props.onPickWrapDiameter(selectedPrimitive.id)}
                  >
                    ⇩
                  </button>
                </div>
                {props.pickingWrapDiameter && (
                  <p className="hint">
                    selecting artwork Ø — click a circular feature (the ⇩ again cancels)
                  </p>
                )}
                <div className="axis-row wide">
                  <span className="axis-label">wrap°</span>
                  <NumInput
                    value={selectedPrimitive.wrapAngle}
                    step={5}
                    onCommit={(v) =>
                      props.onPrimitiveChange({
                        ...selectedPrimitive,
                        wrapAngle: Math.max(1, Math.min(360, v)),
                      })
                    }
                  />
                  {/* quick-sets — the wrap angle IS the artwork's size
                   * around the cylinder; these cover the common spans */}
                  {([90, 180, 360] as const).map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      title={`Wrap ${deg}° around the cylinder`}
                      onClick={() =>
                        props.onPrimitiveChange({ ...selectedPrimitive, wrapAngle: deg })
                      }
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
                {/* the A-axis placement: rotation about the cylinder axis.
                 * Generation applies the same rotation before computing
                 * the cut angles, so the engrave lands exactly where the
                 * preview shows it. */}
                <div className="axis-row wide">
                  <span className="axis-label">spin°</span>
                  <NumInput
                    value={active.rotationDeg.x}
                    step={5}
                    onCommit={(v) => setRotation('x', v)}
                  />
                  <button type="button" onClick={() => bumpRot('x', -90)}>
                    −90°
                  </button>
                  <button type="button" onClick={() => bumpRot('x', 90)}>
                    +90°
                  </button>
                </div>
                <InfoTip
                  text={`wraps ${selectedPrimitive.wrapAngle.toFixed(0)}° of Ø${selectedPrimitive.wrapDiameter.toFixed(1)} — ${(
                    ((selectedPrimitive.wrapAngle / 360) *
                      Math.PI *
                      selectedPrimitive.wrapDiameter) /
                    Math.max(selectedPrimitive.width, 1e-9)
                  ).toFixed(2)} mm per artwork unit (the Ø is the artwork's own — point it at the faced surface, not the stock)`}
                />
                <InfoTip text="spin° is where the artwork sits around the cylinder — the X rotation below, surfaced here because it IS the A position; the seam check wants the artwork clear of ±180°" />
              </>
            ) : (
              <>
                {/* FLAT artwork sizing: W and H in mm, both driving the ONE
                 *  uniform scale (wrapped's "the logo never shears" invariant,
                 *  kept here — W/H are two views of the same scale, editable
                 *  from either side like the wrapped Ø/wrap° pair). At
                 *  scale 1 the artwork sits at its true CAD size (DXF
                 *  imports in mm; SVG user units read 1 mm/unit). */}
                <SizeField
                  label="W"
                  value={selectedPrimitive.width * active.scale.x}
                  onCommit={(v) => commitArtworkScale(v / Math.max(selectedPrimitive.width, 1e-9))}
                  onRevert={revertArtworkScale}
                />
                <SizeField
                  label="H"
                  value={selectedPrimitive.height * active.scale.y}
                  onCommit={(v) => commitArtworkScale(v / Math.max(selectedPrimitive.height, 1e-9))}
                  onRevert={revertArtworkScale}
                />
                <InfoTip
                  text={`scale ×${active.scale.x.toFixed(2)} — W/H drive the same uniform scale; ↺ reverts to the imported size`}
                />
              </>
            )}
          </>
        ) : selectedPrimitive && selectedPrimitive.kind === 'bitmap' ? (
          <>
            {/* BITMAP presentation (round 2, 2026-11-24): 3-axis keeps the
             *  flat strip; 4-axis (or the user's call) wraps the face onto
             *  the bitmap's own Ø — the artwork primitive's frame choice,
             *  same fields. W/H drive the ONE uniform scale like flat
             *  artwork; in wrapped mode H is the ARC around the Ø. */}
            <label className="field">
              <span>Presentation</span>
              <select
                value={selectedPrimitive.presentation ?? 'flat'}
                onChange={(e) => {
                  const presentation = e.target.value as 'flat' | 'wrapped';
                  props.onPrimitiveChange({
                    ...selectedPrimitive,
                    presentation,
                    // first wrap: the stock's effective Ø stands in (the
                    // artwork convention) until the ⇩-style pick exists
                    ...(presentation === 'wrapped' && !selectedPrimitive.wrapDiameter
                      ? {
                          wrapDiameter: Math.max(
                            1,
                            rotaryCalibrationOf(props.stock).effectiveRadius * 2,
                          ),
                        }
                      : {}),
                    // round 3: the flip re-poses as the import path would
                    transform: reposeOnPresentation(presentation),
                  });
                }}
              >
                <option value="flat">flat</option>
                <option value="wrapped">wrapped</option>
              </select>
            </label>
            {selectedPrimitive.presentation === 'wrapped' && (
              <div className="axis-row wide">
                <span className="axis-label">Ø</span>
                <NumInput
                  value={selectedPrimitive.wrapDiameter ?? 0}
                  step={0.5}
                  onCommit={(v) =>
                    props.onPrimitiveChange({
                      ...selectedPrimitive,
                      wrapDiameter: Math.max(0.5, v),
                    })
                  }
                />
              </div>
            )}
            <SizeField
              label="W"
              value={selectedPrimitive.width * active.scale.x}
              onCommit={(v) => commitArtworkScale(v / Math.max(selectedPrimitive.width, 1e-9))}
              onRevert={revertArtworkScale}
            />
            <SizeField
              label="H"
              value={selectedPrimitive.height * active.scale.y}
              onCommit={(v) => commitArtworkScale(v / Math.max(selectedPrimitive.height, 1e-9))}
              onRevert={revertArtworkScale}
            />
            <InfoTip
              text={`scale ×${active.scale.x.toFixed(2)} — the dithered raster burns this face${
                selectedPrimitive.presentation === 'wrapped'
                  ? ' around the Ø (H is the arc; one turn is the ceiling)'
                  : ''
              }; ↺ reverts to the imported size`}
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
              onRevert={() =>
                props.onPrimitiveChange(revertPrimitive(selectedPrimitive, a, uniform))
              }
            />
          ))
        ) : null}

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
        {wrappedBitmap ? (
          <>
            {/* ROUND 3 (rotation) + ROUND 4 (⇅ flip): a wrapped bitmap's
                orientation is THE IMAGE'S — the tube never turns. The
                transform fields read inert (locked); these buttons rewrite
                the primitive's gray — ±90° re-fits the face, the flip is
                end-for-end along the rows. */}
            <p className="hint">
              wrapped rotation and flip act on the image (the top of the
              image burns at the −X end, face up; the left edge stays the
              around-origin) — the tube itself never turns
            </p>
            {AXES.map((a) => (
              <div className="axis-row" key={`rot-${a}`}>
                <span className="axis-label">{a.toUpperCase()}</span>
                <NumInput value={active.rotationDeg[a]} step={15} onCommit={() => {}} disabled />
              </div>
            ))}
            <div className="buttons">
              <button
                type="button"
                title="Rotate the source image −90° — swaps which image axis runs around vs along the tube and re-fits the face"
                onClick={() => rotateBitmapImage(-1)}
              >
                ↺ image −90°
              </button>
              <button
                type="button"
                title="Rotate the source image +90° — swaps which image axis runs around vs along the tube and re-fits the face"
                onClick={() => rotateBitmapImage(1)}
              >
                ↻ image +90°
              </button>
              <button
                type="button"
                title="Flip the source image end-for-end along its rows (top for bottom) — for a source that lands upside down"
                onClick={flipBitmapImage}
              >
                ⇅ Flip
              </button>
            </div>
          </>
        ) : (
          AXES.map((a) => (
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
          ))
        )}
      </section>
      )}
    </>
  );
}