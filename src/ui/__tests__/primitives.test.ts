import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { identityTransform } from '../../core/types';
import type { CircleFeature, Stock } from '../../core/types';
import { detectFeatures } from '../../cam/features';
import {
  bitmapFromImport,
  boxFromPlane,
  cylinderFromCircle,
  defaultBox,
  defaultCylinder,
  nextPrimitiveId,
  resizePrimitive,
  revertPrimitive,
  scaleForSize,
  scaledDims,
  seedPrimitiveIds,
} from '../primitives';

const gray = (w: number, h: number): { width: number; height: number; data: Uint8Array } => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h).fill(128), // a flat mid-gray — never dithered at import
});

const boxStock: Extract<Stock, { kind: 'box' }> = {
  kind: 'box',
  sizeX: 40,
  sizeY: 20,
  sizeZ: 10,
  origin: { x: 'min', y: 'min', z: 'min' },
  axisMode: '3-axis',
  materialId: 'aluminum-6061',
};

const cylinderStock: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 100,
  xOrigin: 'min',
  calibration: { aOriginDeg: 0, axisZ: 0, effectiveRadius: 25 },
  axisMode: '4-axis',
  materialId: 'aluminum-6061',
};

describe('cylinderFromCircle', () => {
  const circle: CircleFeature = {
    kind: 'circle',
    id: 'c1',
    center: { x: 0, y: 0, z: 0 },
    axis: { x: 1, y: 0, z: 0 },
    radius: 10,
    inner: false,
  };

  it('shares the circle diameter and center, length from the axial span', () => {
    const prim = cylinderFromCircle(circle, identityTransform(), [0, 100]);
    expect(prim.kind).toBe('cylinder');
    if (prim.kind !== 'cylinder') return;
    expect(prim.diameter).toBeCloseTo(20);
    expect(prim.length).toBeCloseTo(100);
    expect(prim.transform.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('follows the model transform into machine space', () => {
    const t = { ...identityTransform(), position: { x: 5, y: 2, z: 1 } };
    const prim = cylinderFromCircle(circle, t, [10, 60]);
    if (prim.kind !== 'cylinder') return;
    expect(prim.transform.position).toEqual({ x: 5, y: 2, z: 1 });
    expect(prim.length).toBeCloseTo(50);
  });
});

describe('boxFromPlane', () => {
  it('matches a selected cube face and sits on it', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    expect(topIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), topIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    expect(box.size.x).toBeCloseTo(2);
    expect(box.size.y).toBeCloseTo(2);
    expect(box.size.z).toBeCloseTo(5); // default thickness
    expect(box.transform.position.z).toBeCloseTo(1 + 2.5); // face + half thickness
    expect(box.transform.rotationDeg.x).toBeCloseTo(0);
    expect(box.transform.rotationDeg.y).toBeCloseTo(0);
    expect(box.transform.rotationDeg.z).toBeCloseTo(0);
  });

  it('returns null for a plane index with no member triangles', () => {
    const geo = new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
    const f = detectFeatures(geo);
    expect(boxFromPlane(geo, f, identityTransform(), 999)).toBeNull();
  });

  it('sizes box local axes with machine axes — no X/Y swap (10×4 top face)', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const topIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.z - 1) < 1e-6 && Math.abs(p.point.z - 1) < 1e-6,
    );
    expect(topIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), topIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    expect(box.size.x).toBeCloseTo(10); // machine X extent
    expect(box.size.y).toBeCloseTo(4); // machine Y extent
    expect(box.size.z).toBeCloseTo(5);
    expect(box.transform.position.z).toBeCloseTo(3.5); // top face + half thickness
  });

  it('aligns the box basis with machine axes on X-normal faces', () => {
    const geo = new THREE.BoxGeometry(10, 4, 2).toNonIndexed();
    const f = detectFeatures(geo);
    const sideIdx = f.planes.findIndex(
      (p) => Math.abs(p.normal.x - 1) < 1e-6 && Math.abs(p.point.x - 5) < 1e-6,
    );
    expect(sideIdx).toBeGreaterThanOrEqual(0);
    const box = boxFromPlane(geo, f, identityTransform(), sideIdx);
    expect(box).not.toBeNull();
    if (!box || box.kind !== 'box') return;
    // local X spans machine Y (4), local Y spans machine Z (2)
    expect(box.size.x).toBeCloseTo(4);
    expect(box.size.y).toBeCloseTo(2);
    expect(box.transform.position.x).toBeCloseTo(5 + 2.5); // face + half thickness
    // the rotation must map local X→+Y, Y→+Z, Z→+X exactly
    const r = box.transform.rotationDeg;
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((r.x * Math.PI) / 180, (r.y * Math.PI) / 180, (r.z * Math.PI) / 180, 'XYZ'),
    );
    const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const lz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    expect(lx.x).toBeCloseTo(0, 5);
    expect(lx.y).toBeCloseTo(1, 5);
    expect(lz.x).toBeCloseTo(1, 5);
  });
});

describe('defaults', () => {
  it('cylinder defaults to stock size, centered', () => {
    const prim = defaultCylinder(cylinderStock);
    if (prim.kind !== 'cylinder') return;
    expect(prim.diameter).toBeCloseTo(50);
    expect(prim.length).toBeCloseTo(100);
    expect(prim.transform.position).toEqual({ x: 50, y: 0, z: 0 });
    expect(prim.original).toEqual({ diameter: 50, length: 100 });
  });

  it('box defaults to a tab on the stock top', () => {
    const prim = defaultBox(cylinderStock);
    if (prim.kind !== 'box') return;
    expect(prim.size).toEqual({ x: 10, y: 10, z: 5 });
    expect(prim.transform.position.z).toBeCloseTo(25 + 2.5); // stock top + half height
  });
});

describe('size editing', () => {
  it('edits one axis alone when uniform is off', () => {
    const dims = scaledDims({ x: 10, y: 4, z: 2 }, 'x', 12, false);
    expect(dims).toEqual({ x: 12, y: 4, z: 2 });
  });

  it('scales all axes by the edit ratio when uniform is on', () => {
    const dims = scaledDims({ x: 10, y: 4, z: 2 }, 'x', 20, true);
    expect(dims.x).toBeCloseTo(20);
    expect(dims.y).toBeCloseTo(8);
    expect(dims.z).toBeCloseTo(4);
  });

  it('derives model scale from an edited display size', () => {
    const native = { x: 10, y: 4, z: 2 };
    const displayed = { ...native };
    const scale = scaleForSize(native, displayed, 'x', 5, false);
    expect(scale.x).toBeCloseTo(0.5);
    expect(scale.y).toBeCloseTo(1);
    // uniform: halving X halves everything
    const uni = scaleForSize(native, displayed, 'x', 5, true);
    expect(uni).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('resizes and reverts primitives, keeping originals', () => {
    const box = defaultBox(cylinderStock);
    if (box.kind !== 'box') return;
    const grown = resizePrimitive(box, 'x', 20, true);
    if (grown.kind !== 'box') return;
    expect(grown.size.x).toBeCloseTo(20);
    expect(grown.size.y).toBeCloseTo(20); // uniform
    const reverted = revertPrimitive(grown, 'x');
    if (reverted.kind !== 'box') return;
    expect(reverted.size.x).toBeCloseTo(10);
    expect(reverted.size.y).toBeCloseTo(20); // only the edited axis reverts
    const cyl = defaultCylinder(cylinderStock);
    if (cyl.kind !== 'cylinder') return;
    const bigger = resizePrimitive(cyl, 'x', 100, false);
    if (bigger.kind !== 'cylinder') return;
    expect(bigger.diameter).toBeCloseTo(100);
    expect(bigger.length).toBeCloseTo(100); // untouched
    const restored = revertPrimitive(bigger, 'x');
    if (restored.kind !== 'cylinder') return;
    expect(restored.diameter).toBeCloseTo(50);
  });

  it('uniform revert restores every dimension', () => {
    const box = defaultBox(cylinderStock);
    if (box.kind !== 'box') return;
    const changed = resizePrimitive(resizePrimitive(box, 'x', 20, true), 'y', 8, false);
    const reverted = revertPrimitive(changed, 'x', true);
    if (reverted.kind !== 'box') return;
    expect(reverted.size).toEqual({ x: 10, y: 10, z: 5 });
  });
});
describe('seedPrimitiveIds', () => {
  it('seeds the id counter past loaded ids so a later add cannot collide', () => {
    const base = {
      kind: 'cylinder' as const,
      diameter: 20,
      length: 50,
      original: { diameter: 20, length: 50 },
      transform: identityTransform(),
    };
    seedPrimitiveIds([{ ...base, id: 'prim-41' }, { ...base, id: 'prim-7' }]);
    expect(nextPrimitiveId()).toBe('prim-42');
  });

  it('ignores non-numeric ids', () => {
    seedPrimitiveIds([
      { kind: 'box' as const, id: 'weird', size: { x: 1, y: 1, z: 1 }, original: { x: 1, y: 1, z: 1 }, transform: identityTransform() },
    ]);
    expect(/^prim-\d+$/.test(nextPrimitiveId())).toBe(true);
  });
});

// DITHERED-BITMAP artwork (SPEC 2026-11-23): the Confirm-path constructor —
// the RAW grayscale lands on the primitive (the wrapped kernel image is
// derived at generation, round 3).
describe('bitmapFromImport', () => {
  it("fits the image aspect inside a box stock's flat top extents", () => {
    const p = bitmapFromImport(gray(100, 200), boxStock, { name: 'photo.png' });
    if (p.kind !== 'bitmap') return;
    // extents 40 × 20, image aspect 0.5 → height-bound: 10 × 20
    expect(p.width).toBeCloseTo(10);
    expect(p.height).toBeCloseTo(20);
  });

  it('width-fits when the image is wide', () => {
    const p = bitmapFromImport(gray(400, 100), boxStock);
    if (p.kind !== 'bitmap') return;
    // aspect 4: width-bound at 40, height 10 (inside 20)
    expect(p.width).toBeCloseTo(40);
    expect(p.height).toBeCloseTo(10);
  });

  it('places the face at the stock center, Z on the crown', () => {
    const p = bitmapFromImport(gray(10, 10), boxStock);
    if (p.kind !== 'bitmap') return;
    expect(p.transform.position).toEqual({ x: 20, y: 10, z: 10 });
    expect(p.transform.rotationDeg).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.transform.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('keeps the grayscale raw and labels the row with the file name', () => {
    const g = gray(4, 4);
    const p = bitmapFromImport(g, boxStock, { name: 'photo.png' });
    if (p.kind !== 'bitmap') return;
    expect(p.gray).toBe(g); // NO dithering at import — the op applies the method
    expect(p.sourceName).toBe('photo.png');
    expect(p.id).toMatch(/^prim-\d+$/);
  });

  it('a standing cylinder fits inside its crown-circle square', () => {
    const standing: Extract<Stock, { kind: 'cylinder' }> = {
      ...cylinderStock,
      axisMode: '3-axis',
    };
    const p = bitmapFromImport(gray(100, 100), standing);
    if (p.kind !== 'bitmap') return;
    expect(p.width).toBeCloseTo(50); // Ø50 → bounding square 50 × 50
    expect(p.height).toBeCloseTo(50);
  });

  it('a 4-axis cylinder wraps: image width around, image height along X (round 3, transposed)', () => {
    // round 3 (2026-11-24): Alice's transposed mapping — the image's
    // WIDTH runs AROUND, its HEIGHT ALONG the tube. The face rect keeps
    // the kernel contract (width = the axial span, 100 long; height =
    // the arc around Ø50): the axial edge carries the image's height
    // (400 px over 100 mm) and the arc carries its width — 100 px over
    // 100 × (100/400) = 25 mm of arc
    const p = bitmapFromImport(gray(100, 400), cylinderStock);
    if (p.kind !== 'bitmap') return;
    expect(p.presentation).toBe('wrapped');
    expect(p.wrapDiameter).toBeCloseTo(50);
    expect(p.width).toBeCloseTo(100); // axial: the image's height
    expect(p.height).toBeCloseTo(25); // arc: the image's width
    // the wrapped face sits ON THE AXIS (the generator's on-axis check),
    // never on the crown
    expect(p.transform.position).toEqual({ x: 50, y: 0, z: 0 });
  });

  it('a wide image force-scales down past one turn (the >360° ruling, transposed fit)', () => {
    // the image's WIDTH runs the arc now: aspect W/H = 4 → the arc would
    // be 100 · 4 = 400 mm — over the 2πR = 157.08 circumference. One
    // uniform scale-down: 157.08/400 = 0.3927, face 39.27 (axial) ×
    // 157.08 (arc), and the confirming UI gets the applied scale.
    const seen: number[] = [];
    const p = bitmapFromImport(gray(400, 100), cylinderStock, { name: 'wide.png' }, (s) =>
      seen.push(s),
    );
    if (p.kind !== 'bitmap') return;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeCloseTo((2 * Math.PI * 25) / 400, 6);
    expect(p.width).toBeCloseTo(100 * seen[0], 6);
    expect(p.height).toBeCloseTo(2 * Math.PI * 25, 6);
  });

  it('a tall image under one turn reports no scale (the transposed default)', () => {
    // round 3: a TALL image (100 × 400) fits the default Ø50×100 stock —
    // arc 25 mm, axial 100 mm — exactly what force-scaled under the
    // round-2 mapping
    const seen: number[] = [];
    bitmapFromImport(gray(100, 400), cylinderStock, undefined, (s) => seen.push(s));
    expect(seen).toHaveLength(0);
  });
});
