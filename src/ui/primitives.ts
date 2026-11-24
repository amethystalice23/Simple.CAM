/**
 * Primitive creation helpers (docs/edge-tracing.md §4): roughing volumes and
 * tabs. Defaults come from the stock; a feature selection sizes them smartly
 * — a selected circle spawns a cylinder of the same diameter and center, a
 * selected rectangular face spawns a box with one face matching its extent.
 */

import * as THREE from 'three';
import { rotaryCalibrationOf, type CircleFeature, type ModelTransform, type Primitive, type Stock, type Vec3 } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
import { stockSpan } from './placement';
import { planeExtent, transformFn } from './featureOverlays';
import type { ImportedArtwork } from '../core/vectorImport';

let counter = 0;
export function nextPrimitiveId(): string {
  return `prim-${++counter}`;
}

/** Loaded jobs carry their own primitive ids — seed the counter above them
 * so a later "+ Cylinder" can never collide (same pattern as seedJobOpIds). */
export function seedPrimitiveIds(primitives: Primitive[]): void {
  for (const p of primitives) {
    const n = Number(p.id.replace(/^prim-/, ''));
    if (Number.isFinite(n) && n > counter) counter = n;
  }
}

/** Identity rotation/scale, positioned — the common primitive transform. */
export const unitTransform = (position: { x: number; y: number; z: number }): ModelTransform => ({
  position,
  rotationDeg: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

/** New displayed dims after editing one field; uniform mode scales all. */
export function scaledDims(
  current: Vec3,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Vec3 {
  if (!uniform) return { ...current, [axis]: value };
  const ratio = value / (current[axis] || 1);
  return { x: current.x * ratio, y: current.y * ratio, z: current.z * ratio };
}

/** Model scale implied by an edited display size (native size × scale). */
export function scaleForSize(
  nativeSize: Vec3,
  displayed: Vec3,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Vec3 {
  const dims = scaledDims(displayed, axis, value, uniform);
  return {
    x: nativeSize.x > 1e-9 ? dims.x / nativeSize.x : 1,
    y: nativeSize.y > 1e-9 ? dims.y / nativeSize.y : 1,
    z: nativeSize.z > 1e-9 ? dims.z / nativeSize.z : 1,
  };
}

/** Resize a primitive field; uniform mode scales all its dimensions. */
export function resizePrimitive(
  p: Primitive,
  axis: 'x' | 'y' | 'z',
  value: number,
  uniform: boolean,
): Primitive {
  if (p.kind === 'artwork') return p; // line work: no box dimensions to resize
  if (p.kind === 'bitmap') return p; // raster artwork: the W/H fields drive scale
  if (p.kind === 'text') return p; // lettering: size derives from the layout
  if (p.kind === 'cylinder') {
    const dims = scaledDims({ x: p.diameter, y: p.length, z: 0 }, axis, value, uniform);
    return { ...p, diameter: dims.x, length: dims.y };
  }
  return { ...p, size: scaledDims(p.size, axis, value, uniform) };
}

/** Revert a primitive dimension to its creation value; uniform reverts all. */
export function revertPrimitive(p: Primitive, axis: 'x' | 'y' | 'z', uniform = false): Primitive {
  if (p.kind === 'artwork') return p; // line work: nothing to revert
  if (p.kind === 'bitmap') return p; // raster artwork: nothing to revert
  if (p.kind === 'text') return p; // lettering: nothing to revert
  if (p.kind === 'cylinder') {
    if (uniform) return { ...p, diameter: p.original.diameter, length: p.original.length };
    return axis === 'x' ? { ...p, diameter: p.original.diameter } : { ...p, length: p.original.length };
  }
  if (uniform) return { ...p, size: { ...p.original } };
  return { ...p, size: { ...p.size, [axis]: p.original[axis] } };
}

/** Roughing cylinder sharing a selected circle's diameter and center (axis ∥ X). */
export function cylinderFromCircle(
  circle: CircleFeature,
  modelTransform: ModelTransform,
  axialSpan: readonly [number, number],
): Primitive {
  const xf = transformFn(modelTransform);
  const c = xf(circle.center);
  const diameter = circle.radius * 2;
  const length = Math.max(1, axialSpan[1] - axialSpan[0]);
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter,
    length,
    original: { diameter, length },
    transform: unitTransform({ x: c.x, y: c.y, z: c.z }),
  };
}

/**
 * Box with one face matching the selected plane's in-plane extent, sitting
 * on that face (thickness along the face normal). Returns null if the plane
 * has no member triangles.
 */
export function boxFromPlane(
  geometry: THREE.BufferGeometry,
  features: DetectedFeatures,
  modelTransform: ModelTransform,
  planeIndex: number,
  thickness = 5,
): Primitive | null {
  const ext = planeExtent(geometry, features, modelTransform, planeIndex);
  if (!ext) return null;
  const { u, v, n, w, h } = ext;
  // the box sits ON the face: half its thickness out along the normal
  const center = ext.center.clone().add(n.clone().multiplyScalar(thickness / 2));
  // full basis rotation (local X→u, Y→v, Z→n): the shortest-arc quaternion
  // alone twists around n and misaligns the face for X-normal planes
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const size = { x: w, y: h, z: thickness };
  return {
    kind: 'box',
    id: nextPrimitiveId(),
    size,
    original: { ...size },
    transform: {
      position: { x: center.x, y: center.y, z: center.z },
      rotationDeg: {
        x: (e.x * 180) / Math.PI,
        y: (e.y * 180) / Math.PI,
        z: (e.z * 180) / Math.PI,
      },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

/** Default roughing cylinder: stock-sized, centered on the stock. */
export function defaultCylinder(stock: Stock): Primitive {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const [z0, z1] = stockSpan(stock, 'z');
  const diameter =
    stock.kind === 'cylinder'
      ? stock.calibration.effectiveRadius * 2
      : Math.min(y1 - y0, z1 - z0);
  const d = Math.max(1, diameter);
  const len = Math.max(1, x1 - x0);
  return {
    kind: 'cylinder',
    id: nextPrimitiveId(),
    diameter: d,
    length: len,
    original: { diameter: d, length: len },
    transform: unitTransform({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }),
  };
}

/**
 * Artwork from a dropped SVG/DXF (both importers emit the same
 * ImportedArtwork), PRE-FILLED from the stock (the primary-job
 * convenience — engraving IS the job), then independent (docs/PLAN.md
 * "Engrave + artwork import"): 4-axis wraps onto the stock cylinder at
 * its effective Ø with a 1mm-per-unit scale (clamped to one turn);
 * 3-axis lands flat on the stock crown. The wrapped angular picture
 * survives later Ø edits — the wrap angle is the invariant, mm/unit
 * derives.
 */
export function artworkFromImport(
  art: ImportedArtwork,
  stock: Stock,
  /** the file it came from — the objects list labels the row with it */
  source?: { name: string; kind: 'svg' | 'dxf' | 'halftone' },
): Primitive {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const [z0, z1] = stockSpan(stock, 'z');
  const diameter =
    stock.kind === 'cylinder'
      ? stock.calibration.effectiveRadius * 2
      : Math.hypot(y1 - y0, z1 - z0); // box-on-rotary: the Y-Z diagonal
  const d = Math.max(1, diameter);
  const width = Math.max(art.width, 1e-6);
  const rotary = stock.axisMode === '4-axis';
  return {
    kind: 'artwork',
    id: nextPrimitiveId(),
    sourceName: source?.name,
    sourceKind: source?.kind,
    paths: art.paths,
    pathMeta: art.meta,
    width: art.width || 1,
    height: art.height || 1,
    presentation: rotary ? 'wrapped' : 'flat',
    wrapDiameter: d,
    // scale 1 mm per artwork unit, clamped to a single turn
    wrapAngle: Math.max(1, Math.min(360, (width / (Math.PI * d)) * 360)),
    transform: unitTransform({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      z: rotary ? (z0 + z1) / 2 : z1, // wrapped: the axis; flat: the crown
    }),
  };
}

/**
 * DITHERED-BITMAP artwork primitive (docs/PLAN.md "Laser raster engrave",
 * SPEC 2026-11-23): the dropped image's RAW grayscale on one primitive —
 * dithering is material-dependent intent, so the method applies at the
 * rasterEngrave op, never at import. Mirror of artworkFromImport's frame
 * choice: 3-axis lands FLAT (the face dims fit the image's aspect inside
 * the flat top extents, transform at the stock center, Z on the crown);
 * 4-axis lands WRAPPED (round 2, 2026-11-24; round 3 the same day —
 * Alice's field ruling — the IMAGE WIDTH runs AROUND, its HEIGHT ALONG
 * the tube; the face rect keeps the kernel contract width=axial,
 * height=arc, see bitmapWrappedFit) with the transform centered on the
 * ROTATION AXIS; the >360° ruling force-scales a one-turn-plus fit. The
 * primitive keeps the RAW image — the wrapped generation path transposes
 * it (bitmapKernelGray), the import never does.
 */

/** The flat top extents the bitmap face fits inside, mm: the stock's own
 * X/Y span — a box's footprint, a standing cylinder's crown-circle square,
 * a 4-axis cylinder's axial length × Ø strip (the flat region above the
 * crown). stockSpan already encodes each shape's geometry. */
export function bitmapFaceExtents(stock: Stock): { w: number; h: number } {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  return { w: Math.max(x1 - x0, 1e-6), h: Math.max(y1 - y0, 1e-6) };
}

/** The bitmap face dims: the image's aspect fitted inside the flat extents
 * (the bitmap stretches onto the face, so fitting the aspect keeps pixels
 * square). Shared by the import dialogue's readout and the Confirm path —
 * one face per (image, stock). 4-AXIS STOCK: the face WRAPS (round 2) —
 * width is the axial span, height the arc around — so the wrapped fit
 * (bitmapWrappedFit) owns this branch, force-scaled under one turn. */
export function bitmapFaceDims(
  gray: { width: number; height: number },
  stock: Stock,
): { width: number; height: number } {
  if (stock.axisMode === '4-axis') return bitmapWrappedFit(gray, stock).face;
  const ext = bitmapFaceExtents(stock);
  const aspect = Math.max(gray.width, 1) / Math.max(gray.height, 1);
  let width = ext.w;
  let height = width / aspect;
  if (height > ext.h) {
    height = ext.h;
    width = height * aspect;
  }
  return { width, height };
}

/**
 * The WRAPPED face fit (round 3, 2026-11-24 — Alice's field ruling on the
 * round-2 mapping: "it is a portrait format image but the vertical axis
 * wraps and horizontal is along the x axis"): the IMAGE WIDTH runs AROUND
 * the tube and the IMAGE HEIGHT runs ALONG it. The face rect keeps the
 * kernel contract (width = the AXIAL span, the stock's X extent; height =
 * the ARC length): the axial edge fits the image's HEIGHT, the arc edge
 * the image's WIDTH, so aspect here is arc/axial = grayW/grayH. ORIENTATION
 * (the default within the mapping; round 4 — Alice's field verdict "you
 * have wrapped it face down" — flipped the axial leg): the image's LEFT
 * edge sits at the around-origin (left→right = ascending A, unchanged) and
 * the image's TOP toward −X — the default wraps FACE UP; the Model tab's
 * image-rotate/flip buttons are the escape for any residual orientation.
 * The >360° ruling (Alice, 2026-11-24: "no need to permit greater
 * than 360° wrapping, force a scale down if the dropped artwork would
 * exceed that"): an arc longer than the circumference 2πR takes ONE
 * uniform scale-down (aspect preserved) that lands it exactly one turn —
 * `scale` carries what was applied (1 = untouched). bitmapFromImport is
 * the single choke point that reports it (the drop toast); the dialogue's
 * readout calls this too so it shows the face that will actually land.
 */
export function bitmapWrappedFit(
  gray: { width: number; height: number },
  stock: Stock,
): { face: { width: number; height: number }; scale: number } {
  const r = rotaryCalibrationOf(stock).effectiveRadius;
  const circ = 2 * Math.PI * r;
  const ext = bitmapFaceExtents(stock);
  const arcPerAxial = Math.max(gray.width, 1) / Math.max(gray.height, 1);
  let width = ext.w; // the axial edge — carries the image's HEIGHT
  let height = width * arcPerAxial; // the arc edge — carries the image's WIDTH
  let scale = 1;
  if (height > circ) {
    scale = circ / height;
    width *= scale;
    height = circ;
  }
  return { face: { width, height }, scale };
}

/** The Confirm-path constructor: mirror of artworkFromImport's flat branch
 *  for a grayscale source. 4-AXIS STOCK: the face WRAPS (round 2, 2026-
 *  11-24) — presentation 'wrapped', the bitmap's own Ø from the stock's
 *  effective radius, transform centered on the ROTATION AXIS (the
 *  wrapped-artwork convention; the on-axis generation check needs it),
 *  and the >360° ruling's forced scale-down applies here — THE single
 *  choke point every dropped bitmap passes; `onScaleDown` reports the
 *  applied scale so the confirming UI surfaces the drop toast. */
export function bitmapFromImport(
  gray: { width: number; height: number; data: Uint8Array },
  stock: Stock,
  /** the file it came from — the objects list labels the row with it */
  source?: { name: string },
  /** fired when the wrapped fit exceeded one turn and was force-scaled —
   *  carries the applied uniform scale (e.g. 0.42) */
  onScaleDown?: (scale: number) => void,
): Extract<Primitive, { kind: 'bitmap' }> {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const crown = stockSpan(stock, 'z')[1];
  const cal = rotaryCalibrationOf(stock);
  const rotary = stock.axisMode === '4-axis';
  const wrapD = Math.max(1, cal.effectiveRadius * 2);
  let face: { width: number; height: number };
  if (rotary) {
    const fit = bitmapWrappedFit(gray, stock);
    face = fit.face;
    if (fit.scale < 1) onScaleDown?.(fit.scale);
  } else {
    face = bitmapFaceDims(gray, stock);
  }
  return {
    kind: 'bitmap',
    id: nextPrimitiveId(),
    sourceName: source?.name,
    gray,
    width: face.width,
    height: face.height,
    ...(rotary ? { presentation: 'wrapped' as const, wrapDiameter: wrapD } : {}),
    transform: unitTransform({
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      // wrapped: the rotation axis (the on-axis generation check expects
      // it); flat: the crown
      z: rotary ? cal.axisZ : crown,
    }),
  };
}

/** Default tab: 10×10×5 box sitting on the stock top, centered. */
export function defaultBox(stock: Stock): Primitive {
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const top = stockSpan(stock, 'z')[1];
  return {
    kind: 'box',
    id: nextPrimitiveId(),
    size: { x: 10, y: 10, z: 5 },
    original: { x: 10, y: 10, z: 5 },
    transform: unitTransform({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: top + 2.5 }),
  };
}