/**
 * Model placement: snapping a loaded model against the stock, in machine
 * coordinates. Pure geometry helpers — the viewport just renders the
 * transform, and later generators will consume the same ModelTransform to
 * slice the mesh at machine coordinates.
 */

import * as THREE from 'three';
import { originSpan } from '../core/types';
import type { ModelTransform, OriginEdge, Stock, Vec2, Vec3 } from '../core/types';

const D2R = Math.PI / 180;

function rotationMatrix(rotationDeg: Vec3): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      rotationDeg.x * D2R,
      rotationDeg.y * D2R,
      rotationDeg.z * D2R,
      'XYZ',
    ),
  );
}

/**
 * AABB of the geometry once the transform's scale and rotation are applied,
 * before translation — i.e. relative to the model's (scaled, rotated)
 * origin. Scaling the 8 bbox corners, rotating, and re-enclosing gives the
 * exact rotated AABB.
 */
export function rotatedBBox(geometry: THREE.BufferGeometry, transform: ModelTransform): THREE.Box3 {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  if (bb.isEmpty()) {
    // an empty mesh (artwork's raycast-transparent primitiveGeometry)
    // carries a ±Infinity box — a zero box at the origin instead, so
    // snapping can never write NaN/Inf into a transform position
    return new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
  }
  const m = rotationMatrix(transform.rotationDeg);
  const s = transform.scale;
  const out = new THREE.Box3();
  for (let i = 0; i < 8; i++) {
    const corner = new THREE.Vector3(
      (i & 1 ? bb.max.x : bb.min.x) * s.x,
      (i & 2 ? bb.max.y : bb.min.y) * s.y,
      (i & 4 ? bb.max.z : bb.min.z) * s.z,
    );
    out.expandByPoint(corner.applyMatrix4(m));
  }
  return out;
}

/**
 * Machine Z of the surface a model rests on: a box's top face, a 4-axis
 * cylinder's highest tangent (axis ∥ X, so the surface is axisZ + r), or
 * a 3-axis cylinder's top face — it stands vertical, so the crown is the
 * far end of its along-axis span.
 */
export function stockTopZ(stock: Stock): number {
  if (stock.kind === 'cylinder') {
    if (stock.axisMode === '3-axis') return originSpan(stock.xOrigin, stock.length)[1];
    return stock.calibration.axisZ + stock.calibration.effectiveRadius;
  }
  return originSpan(stock.origin.z, stock.sizeZ)[1];
}

/**
 * Machine-coordinate span of the stock along an axis. A 4-axis cylinder
 * lies along X (its Y span is the silhouette [−r, r] around the rotation
 * axis; its Z span is centered on the axis datum, axisZ ± r). A 3-axis
 * cylinder stands vertical: axis ∥ Z, centered on X0/Y0, its length is
 * the height and xOrigin places machine Z0 along it.
 */
export function stockSpan(stock: Stock, axis: 'x' | 'y' | 'z'): readonly [number, number] {
  if (stock.kind === 'cylinder') {
    const r = stock.calibration.effectiveRadius;
    if (stock.axisMode === '3-axis') {
      switch (axis) {
        case 'x':
        case 'y':
          return [-r, r];
        case 'z':
          return originSpan(stock.xOrigin, stock.length);
      }
    }
    switch (axis) {
      case 'x':
        return originSpan(stock.xOrigin, stock.length);
      case 'y':
        return [-r, r];
      case 'z':
        return [stock.calibration.axisZ - r, stock.calibration.axisZ + r];
    }
  }
  switch (axis) {
    case 'x':
      return originSpan(stock.origin.x, stock.sizeX);
    case 'y':
      return originSpan(stock.origin.y, stock.sizeY);
    case 'z':
      return originSpan(stock.origin.z, stock.sizeZ);
  }
}

/**
 * The stock's XY footprint as one closed CCW contour — the region the
 * waste-stock toggle clears around the model's cross-section. A standing
 * cylinder is a 64-gon circle at X0/Y0; a 4-axis cylinder's silhouette is
 * its length × diameter rectangle. `rotated` = the stock sits at a nonzero
 * index angle: a cylinder's silhouette is unchanged (rotation about its own
 * axis), a box's Y-extent becomes its conservative half-diagonal envelope
 * (rotation about X carries the Z extent into Y) — clearing slightly
 * outside the true silhouette, never inside it.
 */
export function stockFootprint(stock: Stock, rotated = false): Vec2[][] {
  if (stock.kind === 'box') {
    const [x0, x1] = stockSpan(stock, 'x');
    let y0: number;
    let y1: number;
    if (rotated) {
      const halfDiag = Math.hypot(stock.sizeY, stock.sizeZ) / 2;
      y0 = -halfDiag;
      y1 = halfDiag;
    } else {
      [y0, y1] = stockSpan(stock, 'y');
    }
    return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
  }
  const r = stock.calibration.effectiveRadius;
  if (stock.axisMode === '3-axis') {
    const pts: Vec2[] = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return [pts];
  }
  const [x0, x1] = stockSpan(stock, 'x');
  return [[{ x: x0, y: -r }, { x: x1, y: -r }, { x: x1, y: r }, { x: x0, y: r }]];
}

/**
 * Align the model's min/mid/max extent on one axis to the stock's min/mid/max
 * — e.g. edge 'max' on X puts the model's far edge flush with the stock's.
 * Rotation-aware: extents come from the rotated bounding box.
 */
export function alignAxisToStock(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
  axis: 'x' | 'y' | 'z',
  edge: OriginEdge,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform);
  const [s0, s1] = stockSpan(stock, axis);
  const target = edge === 'min' ? s0 : edge === 'max' ? s1 : (s0 + s1) / 2;
  const extent =
    edge === 'min' ? bb.min[axis] : edge === 'max' ? bb.max[axis] : (bb.min[axis] + bb.max[axis]) / 2;
  return { ...transform, position: { ...transform.position, [axis]: target - extent } };
}

/** Center the model on the stock's axial (X) center, keeping Y/Z and rotation. */
export const centerOnX = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'x', 'mid');

/** Center the model over the stock in Y (cylinder: over the rotation axis). */
export const centerOnY = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'y', 'mid');

/** Center the model on the stock's Z center (cylinder: on the rotation axis). */
export const centerOnZ = (
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform => alignAxisToStock(geometry, transform, stock, 'z', 'mid');

/** Rest the model on the stock surface (its lowest rotated point on top Z). */
export function dropToSurface(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  const bb = rotatedBBox(geometry, transform);
  return {
    ...transform,
    position: { ...transform.position, z: stockTopZ(stock) - bb.min.z },
  };
}

/**
 * Place the model's center on the stock's center, all axes. For 4th-axis
 * (cylinder) work this puts the model centered on the rotation axis, ready
 * for wrapped cuts; for box stock it centers the model in the blank.
 */
export function alignToStock(
  geometry: THREE.BufferGeometry,
  transform: ModelTransform,
  stock: Stock,
): ModelTransform {
  return centerOnZ(geometry, centerOnY(geometry, centerOnX(geometry, transform, stock), stock), stock);
}

// ---- fixture display frames (the fixture-ops spec, 2026-11-19) ----
//
// Every op displays in the frame its FIXTURE section declares. A fixture is
// a FRESH clamp of the pristine part — sections never compound (the part
// left the machine; it does not carry the last section's rotation). The
// mode re-places the part (a 4-axis cylinder stood up in a vice becomes a
// 3-axis standing cylinder — axis ∥ Z, centered X0/Y0, right end +X up
// top), then the pose turns it in place about the placed part's center.
// A fixture RESETS the index datums (datumAngleBefore's barrier: the A
// pile above a re-clamp is gone). These maps are pristine machine coords
// → the frame the op cuts in; GENERATION composes the same map since the
// kernel pose-plumbing leg (2026-11-21) — the moves a section emits are
// its own machine coords (the operator re-zeros the WCS at the re-clamp).

/**
 * The stock's center as a fixture places it, in a MODE and along an ORIGIN
 * edge: a 3-axis cylinder stands (axis ∥ Z, centered X0/Y0, the edge
 * placing machine Z0 along its height); a 4-axis one lies along X on the
 * rotation axis. A box never moves.
 */
function placedCenter(
  stock: Stock,
  mode: '3-axis' | '4-axis',
  origin: OriginEdge | null,
): THREE.Vector3 {
  // null = inherit the Stock page's origin for this mode's own placement
  const edge: OriginEdge =
    origin ?? (stock.kind === 'cylinder' ? stock.xOrigin : stock.origin.x);
  if (stock.kind === 'cylinder') {
    if (mode === '3-axis') {
      const [z0, z1] = originSpan(edge, stock.length);
      return new THREE.Vector3(0, 0, (z0 + z1) / 2);
    }
    const [x0, x1] = originSpan(edge, stock.length);
    return new THREE.Vector3((x0 + x1) / 2, 0, stock.calibration.axisZ);
  }
  const [x0, x1] = stockSpan(stock, 'x');
  const [y0, y1] = stockSpan(stock, 'y');
  const [z0, z1] = stockSpan(stock, 'z');
  return new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/**
 * The re-placement a mode flip carries: 4-axis → 3-axis stands a lying
 * cylinder up (its +X end rises to +Z); 3-axis → 4-axis lies it back down
 * the exact inverse way. A box or a same-mode fixture never moves — a box
 * only gains/loses the A axis; its placement is the placement. The
 * fixture's ORIGIN edge drives where the new mode's machine 0 sits along
 * the part (Z0 on the standing top face is the probed default — see
 * fixtureOrigin). Every re-clamp starts from the PRISTINE part, so `from`
 * is always the stock's placement; `to` is this fixture's own.
 */
export function modePlacementMatrix(
  stock: Stock,
  from: '3-axis' | '4-axis',
  to: '3-axis' | '4-axis',
  fromOrigin: OriginEdge | null,
  toOrigin: OriginEdge | null,
): THREE.Matrix4 | null {
  if (stock.kind !== 'cylinder' || from === to) return null;
  // the stand-up roll: −90° about machine +Y tips +X up to +Z (the RIGHT
  // end rises). Lying back down is the inverse (+90°).
  // placed(p) = c_to + R·(p − c_from).
  const rot = new THREE.Matrix4().makeRotationY(from === '4-axis' ? -Math.PI / 2 : Math.PI / 2);
  const cf = placedCenter(stock, from, fromOrigin);
  const ct = placedCenter(stock, to, toOrigin);
  return new THREE.Matrix4()
    .makeTranslation(ct.x, ct.y, ct.z)
    .multiply(rot)
    .multiply(new THREE.Matrix4().makeTranslation(-cf.x, -cf.y, -cf.z));
}

/**
 * The pose's display rotation: a half-turn about one MACHINE axis through
 * the part's center as the fixture's mode places it — a standing part
 * turns over about a horizontal axis; a lying one rolls about its length.
 * 'standVertical' is carried by the mode flip instead (never a pose here).
 */
export function poseMatrix(
  stock: Stock,
  mode: '3-axis' | '4-axis',
  origin: OriginEdge | null,
  pose: 'none' | 'flipX' | 'flipY' | 'standVertical' | 'endForEnd',
): THREE.Matrix4 | null {
  if (pose === 'none' || pose === 'standVertical') return null;
  const c = placedCenter(stock, mode, origin);
  const axis =
    pose === 'flipX' ? new THREE.Vector3(1, 0, 0) :
    pose === 'flipY' ? new THREE.Vector3(0, 1, 0) :
    new THREE.Vector3(0, 0, 1);
  const rot = new THREE.Matrix4().makeRotationAxis(axis, Math.PI);
  return new THREE.Matrix4()
    .makeTranslation(c.x, c.y, c.z)
    .multiply(rot)
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}

/**
 * The machine mode an op's section runs in: the latest fixture at-or-above
 * it re-declares it (mode + pose + fresh clamp); ops before any fixture
 * run in the stock's own mode. (The section's INDEX datums pivot about the
 * stock axis only while it is 4-axis — a 3-axis section has no A.)
 */
export function sectionMode(
  stock: Stock,
  ops: readonly { kind: string; id: string }[],
  opId: string | null,
): '3-axis' | '4-axis' {
  let mode: '3-axis' | '4-axis' = stock.axisMode;
  if (opId === null) return mode;
  for (const op of ops) {
    // the op's OWN fixture counts (the displayFrameFor rule): a FIXTURE op
    // runs in the mode IT declares. The id-match break sits BELOW the
    // fixture check — before this, a fixture op's own sectionMode read the
    // STOCK's mode, and the section-context cache (built from the fixture
    // op first) poisoned every op in its section with it — her bore pocket
    // clamped to the 4-axis lying footprint rectangle and cut half a disc.
    if (op.kind === 'fixture') {
      mode = (op as unknown as { axisMode: '3-axis' | '4-axis' }).axisMode;
    }
    if (op.id === opId) break;
  }
  return mode;
}

/**
 * The id of the FIXTURE op that owns an op's section — the latest fixture
 * at-or-above it (the op's own fixture counts, matching displayFrameFor),
 * null when the op runs in the stock's own placement (section 1).
 */
export function sectionFixtureId(
  ops: readonly { kind: string; id: string }[],
  opId: string | null,
): string | null {
  if (opId === null) return null;
  let fx: string | null = null;
  for (const op of ops) {
    if (op.kind === 'fixture') fx = op.id;
    if (op.id === opId) break;
  }
  return fx;
}

/**
 * The section's crown Z (generation-side, the kernel pose-plumbing leg):
 * the top of the stock AS the op's fixture places it. A 3-axis section
 * stands the cylinder — the crown is the standing top face per the
 * FIXTURE's resolved origin edge (not the Stock page's xOrigin); a box
 * fixture may re-zero Z (its z-edge); a lying (4-axis) cylinder keeps the
 * stock's own crown (a pose flip preserves the top — every pose is a
 * half-turn about the part center). null = the stock's own crown.
 */
export function sectionCrownZ(
  stock: Stock,
  ops: readonly { kind: string; id: string }[],
  opId: string | null,
): number | null {
  const fxId = sectionFixtureId(ops, opId);
  if (fxId === null) return null;
  const fx = ops.find((o) => o.id === fxId) as unknown as {
    axisMode: '3-axis' | '4-axis';
    origin: OriginEdge | { x: OriginEdge; y: OriginEdge; z: OriginEdge } | null | undefined;
  };
  const origin = fx.origin ?? null;
  if (stock.kind === 'cylinder') {
    if (fx.axisMode === '4-axis') return null; // lying crown = the stock's own
    const edge = fixtureOrigin(stock, '3-axis', origin) as OriginEdge;
    return originSpan(edge, stock.length)[1];
  }
  const triple = fixtureOrigin(stock, fx.axisMode, origin) as { x: OriginEdge; y: OriginEdge; z: OriginEdge };
  return originSpan(triple.z, stock.sizeZ)[1];
}

/**
 * The fixture's own ORIGIN edge for its section's placement: null (inherit
 * the Stock page's origin) resolves per mode — a 4-axis section inherits
 * the stock's X0 choice as-is, but a 3-axis section on a 4-axis stock
 * STANDS the part, and the natural 3-axis zero is the TOP FACE (Z0 on top
 * — the z-probeable surface; her ruling 2026-11-20: "you are likely to
 * want Z0 to be the top as thats something you can z-probe"). A box stock
 * keeps its triple; a 3-axis stock inherits as-is.
 */
export function fixtureOrigin(
  stock: Stock,
  sectionAxisMode: '3-axis' | '4-axis',
  origin: OriginEdge | { x: OriginEdge; y: OriginEdge; z: OriginEdge } | null,
): OriginEdge | { x: OriginEdge; y: OriginEdge; z: OriginEdge } {
  if (origin !== null) return origin;
  if (stock.kind === 'cylinder' && stock.axisMode === '4-axis' && sectionAxisMode === '3-axis') {
    return 'max'; // Z0 on the standing top face
  }
  if (stock.kind === 'cylinder') return stock.xOrigin;
  return stock.origin;
}

/**
 * The display frame one op renders in: its FIXTURE section's fresh clamp —
 * the mode re-placement then the pose, in that order (the pose turns the
 * placed part in place). Every re-clamp starts from the PRISTINE part (it
 * left the machine — sections never compound), so the placement's `from`
 * side is always the stock's own. The latest fixture at-or-above the op
 * owns the frame; the op's own fixture counts (opening a Fixture shows its
 * setup, like opening an Index shows its own angle). Ops before any
 * fixture render in the stock's placement. Returns null when that is
 * identity.
 */
export function displayFrameFor(
  stock: Stock,
  ops: readonly { kind: string; id: string }[],
  opId: string | null,
): THREE.Matrix4 | null {
  if (opId === null) return null;
  let frame: THREE.Matrix4 | null = null;
  for (const op of ops) {
    if (op.kind === 'fixture') {
      // a FRESH clamp of the pristine part: mode placement first (the
      // fixture's own origin driving the new mode's zero, defaulting per
      // fixtureOrigin — 4→3 stands with Z0 on top, the z-probeable face),
      // then the pose about the placed part's center
      const f = op as unknown as {
        kind: 'fixture';
        pose: 'none' | 'flipX' | 'flipY' | 'standVertical' | 'endForEnd';
        axisMode: '3-axis' | '4-axis';
        origin: OriginEdge | { x: OriginEdge; y: OriginEdge; z: OriginEdge } | null | undefined;
      };
      // a save from before the origin field (or a half-built op literal)
      // reads as inherit (null) — never as undefined noise
      const fOrigin = f.origin ?? null;
      // resolve the inherit default FIRST so the placement and the pose
      // agree (4→3 stands with Z0 on top, the z-probeable face)
      const afterOrigin = fixtureOrigin(stock, f.axisMode, fOrigin);
      const place = modePlacementMatrix(
        stock,
        stock.axisMode,
        f.axisMode,
        stock.kind === 'cylinder' ? stock.xOrigin : stock.origin.x,
        typeof afterOrigin === 'string' ? afterOrigin : afterOrigin.x,
      );
      // a box never re-places (modePlacementMatrix null), but its POSE
      // still applies — a box part turns over in a vise like any other
      const turn = poseMatrix(
        stock,
        f.axisMode,
        typeof afterOrigin === 'string' ? afterOrigin : null,
        f.pose ?? 'none',
      );
      frame =
        place && turn ? new THREE.Matrix4().multiplyMatrices(turn, place) :
        place ?? turn ?? null;
    }
    if (op.id === opId) break;
  }
  return frame;
}