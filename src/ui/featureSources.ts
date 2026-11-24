/**
 * Feature sources: every selectable-feature provider is one of these —
 * the loaded model (bare feature ids) or a user-added primitive (ids
 * namespaced `p:<primId>:<featureId>`). A primitive's features come from
 * running the detector over its LOCAL mesh (`primitiveGeometry`), so the
 * existing transform seams (transformFn over `source.transform`) land them
 * in machine space and ops resolve them exactly like model features.
 *
 * Id stability: moving a primitive changes only its transform — the local
 * detection and its ids are untouched, so op selections survive moves.
 * Resizing changes the local geometry and therefore the ids; ops holding
 * the old ids fail visibly ("no longer exist — reselect").
 */

import * as THREE from 'three';
import { detectFeatures, type DetectedFeatures, type DetectAxis } from '../cam/features';
import { segmentsForRadius } from './meshSegments';
import {
  identityTransform,
  originSpan,
  rotaryCalibrationOf,
} from '../core/types';

/**
 * The stock rotation axis in MODEL space (the chain detector's frame).
 * Model space is the geometry's coordinate system BEFORE the model transform.
 * 4-axis only — a 3-axis job has no rotation axis, so no chains.
 *
 * Machine +X is the axis direction — inverse-rotate into local, then divide by
 * scale. A point on the machine axis line (0, 0, axisZ) inverse-maps the same
 * way: subtract position, inverse-rotate, divide per-axis by scale.
 */
export function stockAxisInModelSpace(
  stock: Stock,
  transform: ModelTransform,
): DetectAxis | undefined {
  if (stock.axisMode !== '4-axis') return undefined;
  const cal = rotaryCalibrationOf(stock);
  const rot = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      (transform.rotationDeg.x * Math.PI) / 180,
      (transform.rotationDeg.y * Math.PI) / 180,
      (transform.rotationDeg.z * Math.PI) / 180,
      'XYZ',
    ),
  );
  const inv = rot.clone().invert();
  // machine +X is the axis direction — inverse-rotate into local
  const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(inv);
  // a point on the machine axis line: (0, 0, axisZ). Its local image:
  // subtract position, inverse-rotate, divide scale
  const p = new THREE.Vector3(0, 0, cal.axisZ)
    .sub(new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z))
    .applyQuaternion(inv);
  const axis = {
    point: { x: p.x / transform.scale.x, y: p.y / transform.scale.y, z: p.z / transform.scale.z },
    dir: { x: dir.x / transform.scale.x, y: dir.y / transform.scale.y, z: dir.z / transform.scale.z },
  };
  // normalize the direction (the detector measures distances from it)
  const dl = Math.hypot(axis.dir.x, axis.dir.y, axis.dir.z) || 1;
  axis.dir = { x: axis.dir.x / dl, y: axis.dir.y / dl, z: axis.dir.z / dl };
  return axis;
}
import type {
  BitmapFeature,
  CircleFeature,
  EdgeFeature,
  JobOp,
  ModelTransform,
  PathFeature,
  PlaneFeature,
  Primitive,
  RadialChainFeature,
  ThreadFeature,
  Stock,
  Vec3,
} from '../core/types';

export interface FeatureSource {
  /** 'model' for the loaded STL; the primitive id for primitives */
  id: string;
  /** local-space mesh — plane footprints and raycast picking read it */
  geometry: THREE.BufferGeometry;
  /** features in LOCAL space, ids namespaced for primitives, bare for the model */
  features: DetectedFeatures;
  /** local → machine transform (the model's ModelTransform / p.transform) */
  transform: ModelTransform;
  /** ARTWORK sources only: the frame their paths cut in. Absent for
   * meshes — an engrave op selecting non-artwork features fails. The
   * wrapped frame names the artwork's own Ø (the cutting surface). */
  artworkFrame?: { kind: 'flat' } | { kind: 'wrapped'; diameter: number };
}

/**
 * The single primitive-mesh builder: local space, centered at the origin,
 * cylinder axis along local X (matching the Viewport render). Segments
 * are sagitta-scaled with the radius (meshSegments.ts) — small cylinders
 * keep the 48 floor that keeps rim circles fittable (the 8-segment snap
 * mesh is below fitCircle's n ≥ 9 threshold); big ones refine.
 */
export function primitiveGeometry(p: Primitive): THREE.BufferGeometry {
  if (p.kind === 'box') {
    return new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z);
  }
  if (p.kind === 'artwork' || p.kind === 'bitmap' || p.kind === 'text') {
    // line work / raster artwork, not solids: the Viewport draws the
    // paths (artworkLocalPoints) or the textured face plane (bitmap);
    // an empty mesh keeps the raycast pipelines (plane picks, the
    // occlusion gate) from ever hitting it
    return new THREE.BufferGeometry();
  }
  const g = new THREE.CylinderGeometry(
    p.diameter / 2,
    p.diameter / 2,
    p.length,
    segmentsForRadius(p.diameter / 2),
  );
  g.rotateZ(Math.PI / 2); // geometry Y axis → local/machine X
  return g;
}

/**
 * Artwork's REAL local extents for the placement snap math (ModelPanel's
 * align/drop buttons): primitiveGeometry is deliberately empty for
 * artwork, and an empty mesh's bounding box is ±Infinity — snapped
 * through alignAxisToStock/dropToSurface it produced NaN/Inf positions
 * (the artwork vanished and its X box rendered blank). Same
 * artworkLocalPoints the Viewport draws, so "Center" centers the logo.
 */
export function artworkSnapGeometry(
  p: Extract<Primitive, { kind: 'artwork' }>,
): THREE.BufferGeometry {
  const pts = artworkLocalPoints(p).flat();
  if (pts.length === 0) pts.push({ x: 0, y: 0, z: 0 }); // no paths yet: snap about the origin
  return new THREE.BufferGeometry().setFromPoints(
    pts.map((q) => new THREE.Vector3(q.x, q.y, q.z)),
  );
}

/**
 * The WRAPPED bitmap's local bend (round 2, 2026-11-24; round 3 the same
 * day — Alice's transposed-mapping ruling; round 4 — her field verdict
 * "you have wrapped it face down": the AXIAL leg flipped so the default
 * wraps FACE UP): the face rect bends onto the bitmap's OWN cylinder
 * (`wrapDiameter`), axis ∥ local X (the wrapped-artwork primitive
 * convention), the arc window centered at local angle 0 (the +Z top).
 * Face width = the AXIAL span along local X — the image's HEIGHT runs
 * along the tube (image TOP toward −X, face-up); face height = the ARC
 * LENGTH around — the image's WIDTH runs the arc, ascending toward +Y —
 * the A direction (atan2(y, z) sense everywhere the rotary math runs).
 * ORIENTATION (the recorded default): the image's LEFT edge sits at the
 * LOW-ARC end (s = −h/2, the around-origin) — image left→right =
 * ascending A, unchanged by round 4 (she reported upside-down, not
 * mirrored). Rotation/flip is the IMAGE's (the Model tab's rotate/flip
 * buttons rewrite p.gray; the strip's 3D transform never rotates in
 * wrapped mode). Callers pass (x, s) in face mm: x ∈ [−w/2, w/2] axial,
 * s ∈ [−h/2, h/2] arc. Flat display (Viewport's PlaneGeometry) is the
 * degenerate r → ∞.
 */
export function bitmapWrappedLocalPoint(
  wrapDiameter: number,
  x: number,
  s: number,
): { x: number; y: number; z: number } {
  const r = wrapDiameter / 2;
  const th = s / r; // arc mm → radians, ascending with A
  return { x, y: r * Math.sin(th), z: r * Math.cos(th) };
}

/**
 * The source image AS THE KERNEL CONSUMES IT for a wrapped face (round 3;
 * round 4, 2026-11-24 — Alice's "wrapped face down" field verdict flipped
 * the axial leg face-up): the kernel's contract is face {width: AXIAL,
 * height: ARC} with a bitmap whose columns run axial (grid col 0 at the
 * small-X edge — runStart k·px from x0mm) and whose rows run the arc
 * BURNED BOTTOM-FIRST from the around-origin (machine row j reads grid
 * row ny−1−j). Under the face-up mapping — image WIDTH around, image
 * HEIGHT along X, image LEFT edge at the around-origin, image TOP toward
 * −X — that bitmap is kernel pixel (col c, row r) = image(col W−1−r,
 * row c): the transpose with a vertical flip, i.e. a 90° CCW turn of the
 * source. Spot-check: kernel row ny−1 (burned first, at the around-
 * origin) = image column 0 — the LEFT edge ✓ (unchanged by round 4);
 * kernel col 0 (small X) = image row 0 — the TOP at −X ✓ face-up. Never
 * touches the primitive — the stored image stays raw.
 */
export function bitmapKernelGray(
  gray: { width: number; height: number; data: Uint8Array },
): { width: number; height: number; data: Uint8Array } {
  const { width: w, height: h, data } = gray;
  const out = new Uint8Array(w * h);
  for (let c = 0; c < h; c++) {
    for (let r = 0; r < w; r++) {
      // kernel (col c, row r) = image(col W−1−r, row c)
      out[r * h + c] = data[c * w + (w - 1 - r)];
    }
  }
  return { width: h, height: w, data: out };
}

/**
 * FLIP the image end-for-end along its rows (round 4, 2026-11-24 — the
 * Model tab's "⇅ Flip": the escape for an upside-down source under the
 * face-up wrap default; stateless and cumulative like the rotate
 * buttons). Aspect and dims are untouched — only the row order flips.
 */
export function flipGrayVertical(
  gray: { width: number; height: number; data: Uint8Array },
): { width: number; height: number; data: Uint8Array } {
  const { width: w, height: h, data } = gray;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      out[r * w + c] = data[(h - 1 - r) * w + c];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Snap geometry for a BITMAP artwork (SPEC 2026-11-23): the face rect in
 * the centered local frame — a plane at z=0 spanning width × height
 * (the Viewport's textured face). primitiveGeometry is empty by design
 * (raycast transparency), so like artwork its real bounds stand in.
 * WRAPPED: the face bends onto its own cylinder — sample the four edges
 * through bitmapWrappedLocalPoint so the bounding box the align/drop
 * buttons snap with reads the curved body, not a phantom flat rect.
 */
export function bitmapSnapGeometry(p: Extract<Primitive, { kind: 'bitmap' }>): THREE.BufferGeometry {
  const w = p.width / 2;
  const h = p.height / 2;
  if (p.presentation !== 'wrapped' || !(p.wrapDiameter && p.wrapDiameter > 0)) {
    return new THREE.BufferGeometry().setFromPoints(
      [
        { x: -w, y: -h, z: 0 },
        { x: w, y: -h, z: 0 },
        { x: w, y: h, z: 0 },
        { x: -w, y: h, z: 0 },
      ].map((q) => new THREE.Vector3(q.x, q.y, q.z)),
    );
  }
  // the four edges, densified enough for an honest bbox: vertical (arc)
  // edges in 2 mm steps (wraps most of a turn on small stock), the axial
  // edges straight so endpoints carry them
  const pts: { x: number; y: number; z: number }[] = [];
  const arcSteps = Math.max(2, Math.ceil(p.height / 2));
  const xs = [-w, w];
  for (const x of xs) {
    for (let i = 0; i <= arcSteps; i++) {
      pts.push(bitmapWrappedLocalPoint(p.wrapDiameter!, x, -h + (p.height * i) / arcSteps));
    }
  }
  for (const end of [-h, h]) {
    pts.push(bitmapWrappedLocalPoint(p.wrapDiameter!, -w, end));
    pts.push(bitmapWrappedLocalPoint(p.wrapDiameter!, w, end));
  }
  return new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q.x, q.y, q.z)));
}

/** Pose for a primitive's render mesh: EXACTLY its ModelTransform. The
 * local geometry already carries the axis remap (cylinder ∥ local X), so
 * baking any extra rotation into the mesh puts it 90° out of sync with the
 * overlays, the plane footprints, and the raycast faceIndex → faceToPlane
 * mapping. The Viewport composes no rotations by hand — it uses this. */
export function primitivePose(p: Primitive): {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
} {
  const t = p.transform;
  return {
    position: new THREE.Vector3(t.position.x, t.position.y, t.position.z),
    quaternion: new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (t.rotationDeg.x * Math.PI) / 180,
        (t.rotationDeg.y * Math.PI) / 180,
        (t.rotationDeg.z * Math.PI) / 180,
        'XYZ',
      ),
    ),
    scale: new THREE.Vector3(t.scale.x, t.scale.y, t.scale.z),
  };
}

/** Detection is keyed by shape only — moving a primitive must not redetect. */
const detectionCache = new Map<string, DetectedFeatures>();

function primitiveDetection(p: Primitive): DetectedFeatures {
  const key =
    p.kind === 'box'
      ? `box|${p.size.x}|${p.size.y}|${p.size.z}`
      : p.kind === 'artwork' || p.kind === 'bitmap' || p.kind === 'text'
        ? `artwork|${p.id}` // artwork/bitmap/text sources build features directly — never cached
        : `cylinder|${p.diameter}|${p.length}`;
  let features = detectionCache.get(key);
  if (!features) {
    features = detectFeatures(primitiveGeometry(p).toNonIndexed());
    detectionCache.set(key, features);
  }
  return features;
}

/** Clone a detection with every feature id prefixed — the overlay and
 * resolver machinery are index-keyed and compare `selection.includes
 * (f.id)`, so namespacing at construction keeps them untouched. */
function namespaceIds(features: DetectedFeatures, primId: string): DetectedFeatures {
  const ns = (id: string) => `p:${primId}:${id}`;
  return {
    planes: features.planes.map((f: PlaneFeature) => ({ ...f, id: ns(f.id) })),
    circles: features.circles.map((f: CircleFeature) => ({ ...f, id: ns(f.id) })),
    edges: features.edges.map((f: EdgeFeature) => ({ ...f, id: ns(f.id) })),
    radialChains: features.radialChains.map((f: RadialChainFeature) => ({ ...f, id: ns(f.id) })),
    threads: features.threads,
    paths: features.paths.map((f: PathFeature) => ({ ...f, id: ns(f.id) })),
    planeLoops: features.planeLoops,
    faceToPlane: features.faceToPlane,
  };
}

/**
 * The namespaced TOP-face plane feature id of a BOX primitive — the face
 * a generated calibration cell's pocket op targets. The materializer
 * builds the op before the primitive ever renders, so it must predict
 * the id the source will publish: same cached detection, same
 * `p:<primId>:<featureId>` namespacing. The plane normal is unnormalized
 * (Newell), so compare its direction. Null when detection finds no +Z
 * face (never expected for a box).
 */
export function boxTopFaceId(p: Extract<Primitive, { kind: 'box' }>): string | null {
  const feats = primitiveDetection(p);
  const top = feats.planes.find((f) => {
    const m = Math.hypot(f.normal.x, f.normal.y, f.normal.z);
    return m > 1e-9 && f.normal.z / m > 0.9;
  });
  return top ? `p:${p.id}:${top.id}` : null;
}

/**
 * Artwork → local-space 3D polylines. FLAT: the document plane at z=0,
 * centered (u −w/2 right, v UP — SVG's v-down flipped), and the standard
 * ModelTransform then places it like any other primitive. WRAPPED: bent
 * onto the artwork's OWN cylinder, axis ∥ local X (the primitive
 * convention), the wrap centered at local angle 0 (the +Z "top"); the
 * bend is baked into local geometry because no rigid transform can
 * express it. The scale is UNIFORM in both directions — mm/unit derives
 * from the wrap angle (arc(width) = wrapAngle), so the logo never
 * shears and shrinking the Ø never rescales the angular picture.
 */
export function artworkLocalPoints(p: Extract<Primitive, { kind: 'artwork' }>): Vec3[][] {
  const flipV = (v: number) => p.height - v; // SVG's v-down → up
  if (p.presentation === 'flat') {
    return p.paths.map((path) =>
      path.map((q) => ({ x: q.x - p.width / 2, y: flipV(q.y) - p.height / 2, z: 0 })),
    );
  }
  const r = p.wrapDiameter / 2;
  const mmPerUnit =
    ((p.wrapAngle / 360) * Math.PI * p.wrapDiameter) / Math.max(p.width, 1e-9);
  const rad = (p.wrapAngle * Math.PI) / 180;
  return p.paths.map((path) =>
    path.map((q) => {
      const th = (q.x / p.width - 0.5) * rad; // centered on local angle 0
      const x = (flipV(q.y) - p.height / 2) * mmPerUnit;
      return { x, y: r * Math.sin(th), z: r * Math.cos(th) };
    }),
  );
}

/** Artwork features: each path is one selectable feature, ids namespaced
 * like every primitive's. No detection runs — line work has no planes
 * or circles, so the features are constructed directly. */
function artworkFeatures(p: Extract<Primitive, { kind: 'artwork' }>): DetectedFeatures {
  const pts = artworkLocalPoints(p);
  return {
    planes: [],
    circles: [],
    edges: [],
    paths: pts.map((points, i): PathFeature => ({
      kind: 'path',
      id: `p:${p.id}:path:${i}`,
      points,
      ...(p.pathMeta?.[i]?.closed === undefined && p.pathMeta?.[i]?.filled === undefined
        ? {}
        : { closed: p.pathMeta?.[i]?.closed, filled: p.pathMeta?.[i]?.filled }),
    })),
    radialChains: [],
      threads: [],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  };
}

/**
 * TEXT primitive → local-space 3D polylines (2026-11-24). The stored paths
 * are ALREADY centered mm, y-up (layoutTextPaths) — flat is a pure copy.
 * WRAPPED: bent onto the text's OWN cylinder (`wrapDiameter`), axis ∥
 * local X (the wrapped-artwork primitive convention), the bend centered at
 * local angle 0 (the +Z top), arc mm = layout mm (no scale — the paths are
 * mm, the wrap is a pure bend at any Ø). ORIENTATION follows the
 * field-verified wrapped-bitmap convention (round 4): the text's LEFT edge
 * at the low-arc end (left→right = ascending A — Alice's hardware check:
 * upside-down, never mirrored) and the cap TOP toward −X (face up).
 */
export function textLocalPoints(p: Extract<Primitive, { kind: 'text' }>): Vec3[][] {
  if (p.presentation !== 'wrapped' || !(p.wrapDiameter > 0)) {
    return p.paths.map((path) => path.map((q) => ({ x: q.x, y: q.y, z: 0 })));
  }
  const r = p.wrapDiameter / 2;
  return p.paths.map((path) =>
    path.map((q) => {
      const th = q.x / r; // arc mm → radians, ascending with A
      return { x: -q.y, y: r * Math.sin(th), z: r * Math.cos(th) };
    }),
  );
}

/** TEXT features: each layout stroke one selectable path feature — the
 *  artwork plumbing (no detection runs; lettering has no planes). */
function textFeatures(p: Extract<Primitive, { kind: 'text' }>): DetectedFeatures {
  const pts = textLocalPoints(p);
  return {
    planes: [],
    circles: [],
    edges: [],
    paths: pts.map((points, i): PathFeature => ({
      kind: 'path',
      id: `p:${p.id}:path:${i}`,
      points,
    })),
    radialChains: [],
    threads: [],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  };
}

/** The TEXT primitive's real local extents for the placement snap math —
 *  the artworkSnapGeometry lesson (primitiveGeometry is empty for line
 *  work, and an empty mesh's bbox snaps to NaN). */
export function textSnapGeometry(p: Extract<Primitive, { kind: 'text' }>): THREE.BufferGeometry {
  const pts = textLocalPoints(p).flat();
  if (pts.length === 0) pts.push({ x: 0, y: 0, z: 0 });
  return new THREE.BufferGeometry().setFromPoints(
    pts.map((q) => new THREE.Vector3(q.x, q.y, q.z)),
  );
}

/** Bitmap artwork: the WHOLE artwork is one feature (SPEC 2026-11-23) —
 *  never exploded into paths, nothing inside it selectable. The face
 *  rect is centered on the primitive origin (the artwork convention). */
function bitmapFeatures(p: Extract<Primitive, { kind: 'bitmap' }>): DetectedFeatures {
  return {
    planes: [],
    circles: [],
    edges: [],
    paths: [],
    bitmaps: [
      {
        kind: 'bitmap',
        id: `p:${p.id}:bitmap:0`,
        width: p.width,
        height: p.height,
      },
    ],
    radialChains: [],
    threads: [],
    faceToPlane: new Int32Array(0),
    planeLoops: [],
  };
}

/** All feature sources for the current job: the model first (when loaded),
 * then one per primitive. Order is stable — selection resolution and
 * labels iterate it. */
export function sourcesFor(
  geometry: THREE.BufferGeometry | null,
  modelFeatures: DetectedFeatures | null,
  modelTransform: ModelTransform,
  primitives: Primitive[],
): FeatureSource[] {
  const sources: FeatureSource[] = [];
  if (geometry && modelFeatures) {
    sources.push({ id: 'model', geometry, features: modelFeatures, transform: modelTransform });
  }
  for (const p of primitives) {
    if (p.kind === 'artwork') {
      sources.push({
        id: p.id,
        geometry: new THREE.BufferGeometry(),
        features: artworkFeatures(p),
        transform: p.transform,
        artworkFrame:
          p.presentation === 'wrapped'
            ? { kind: 'wrapped', diameter: p.wrapDiameter }
            : { kind: 'flat' },
      });
      continue;
    }
    if (p.kind === 'text') {
      // typed lettering (2026-11-24): strokes as per-path features, the
      // artwork frame plumbing — the engrave op targets them unchanged
      sources.push({
        id: p.id,
        geometry: new THREE.BufferGeometry(),
        features: textFeatures(p),
        transform: p.transform,
        artworkFrame:
          p.presentation === 'wrapped'
            ? { kind: 'wrapped', diameter: p.wrapDiameter }
            : { kind: 'flat' },
      });
      continue;
    }
    if (p.kind === 'bitmap') {
      // a raster artwork source: FLAT frame by default (the spec-deferred
      // flat strip above the crown); WRAPPED presentation bends onto the
      // bitmap's own Ø and the raster op coordinates A. Empty mesh (the
      // Viewport draws the textured face — plane or curved strip).
      sources.push({
        id: p.id,
        geometry: new THREE.BufferGeometry(),
        features: bitmapFeatures(p),
        transform: p.transform,
        artworkFrame:
          p.presentation === 'wrapped'
            ? { kind: 'wrapped', diameter: p.wrapDiameter ?? 0 }
            : { kind: 'flat' },
      });
      continue;
    }
    sources.push({
      id: p.id,
      geometry: primitiveGeometry(p).toNonIndexed(),
      features: namespaceIds(primitiveDetection(p), p.id),
      transform: p.transform,
    });
  }
  return sources;
}

/** `p:<primId>:<featureId>` → its parts; bare ids belong to the model. */
export function parseNamespacedId(id: string): { primId: string; featureId: string } | null {
  const m = /^p:([^:]+):(.+)$/.exec(id);
  return m ? { primId: m[1], featureId: m[2] } : null;
}

/**
 * SELECTION GRANULARITY (docs/PLAN.md "Laser raster engrave", SPEC
 * 2026-11-23 piece 1): halftone-source vector artwork stops being
 * per-path selectable — clicking any dot selects the WHOLE artwork. The
 * raster/cut pipeline reads the picture as one piece, so per-dot picking
 * has no value and twenty-thousand-path selections only break things.
 * A `p:<primId>:path:<n>` id whose primitive came from the halftone
 * screener expands to ALL of that source's path ids; non-halftone
 * artwork (SVG/DXF drops) keeps per-path selection, and every other id
 * passes through alone.
 */
export function expandHalftonePaths(
  primitives: Primitive[],
  sources: FeatureSource[],
  id: string,
): string[] {
  const parsed = parseNamespacedId(id);
  if (!parsed || !/^path:\d+$/.test(parsed.featureId)) return [id];
  const prim = primitives.find((p) => p.id === parsed.primId);
  if (!prim || prim.kind !== 'artwork' || prim.sourceKind !== 'halftone') return [id];
  const source = sources.find((s) => s.id === parsed.primId);
  if (!source) return [id];
  return source.features.paths.map((f) => f.id);
}

/** The op-edge source id — `o:`-prefixed feature ids route here. */
export const OP_EDGE_SOURCE_ID = 'op-edges';

/**
 * Features published by the JOB itself, not any mesh (edge-tracing §6):
 * every face cylinder op's two step-edge circles at its OWN target Ø —
 * the one-circle rule, deliberately not the adjoining diameter, because
 * the cylinder-chamfer anchors on the faced circle and cuts up-and-out
 * through whatever rises from it — plus the stock's end rims at the raw
 * Ø, so an unfaced rod end anchors the same way. Local space IS machine
 * space (identity transform): the circles are declared geometry computed
 * from op fields, so they follow op edits live, and deleting the op
 * dangles its ids — the standard visible "reselect" failure, like a
 * resized primitive.
 */
export function opEdgeSource(ops: JobOp[], stock: Stock): FeatureSource | null {
  if (stock.axisMode !== '4-axis') return null;
  const cal = rotaryCalibrationOf(stock);
  const [x0, x1] =
    stock.kind === 'cylinder'
      ? originSpan(stock.xOrigin, stock.length)
      : originSpan(stock.origin.x, stock.sizeX);
  const circle = (id: string, x: number, diameter: number): CircleFeature => ({
    kind: 'circle',
    id,
    center: { x, y: 0, z: cal.axisZ },
    axis: { x: 1, y: 0, z: 0 },
    radius: diameter / 2,
    inner: false, // a boss outline: material inside the loop
  });
  const circles: CircleFeature[] = [
    circle('o:stock:start', x0, cal.effectiveRadius * 2),
    circle('o:stock:end', x1, cal.effectiveRadius * 2),
  ];
  for (const op of ops) {
    if (op.kind !== 'faceCylinder') continue;
    circles.push(circle(`o:face:${op.id}:start`, op.xStart, op.targetDiameter));
    circles.push(circle(`o:face:${op.id}:end`, op.xEnd, op.targetDiameter));
  }
  return {
    id: OP_EDGE_SOURCE_ID,
    // declared geometry, no mesh: the raycast pipelines never hit it
    // (the artwork precedent)
    geometry: new THREE.BufferGeometry(),
    features: {
      planes: [],
      circles,
      edges: [],
      radialChains: [],
      threads: [],
      paths: [],
      faceToPlane: new Int32Array(0),
      planeLoops: [],
    },
    transform: identityTransform(),
  };
}

/** The id → {source, kind, index, feature} lookup shared by selection
 * resolution, labels, depth prefills, and generation. */
export interface ResolvedFeature {
  source: FeatureSource;
  kind: 'plane' | 'circle' | 'edge' | 'path' | 'radialChain' | 'thread' | 'bitmap';
  index: number;
  feature:
    | PlaneFeature
    | CircleFeature
    | EdgeFeature
    | PathFeature
    | RadialChainFeature
    | ThreadFeature
    | BitmapFeature;
}

export function resolveFeature(
  sources: FeatureSource[],
  id: string,
): ResolvedFeature | null {
  // namespaced ids locate their source by prefix; the stored feature ids
  // are the FULL ids (namespaced for primitives, bare for the model), so
  // compare verbatim — do not strip the prefix. `o:` ids are job-published
  // circles (opEdgeSource) — one shared source, not one per op.
  const parsed = typeof id === 'string' ? parseNamespacedId(id) : null;
  const source = parsed
    ? sources.find((s) => s.id === parsed.primId)
    : typeof id === 'string' && id.startsWith('o:')
      ? sources.find((s) => s.id === OP_EDGE_SOURCE_ID)
      : sources.find((s) => s.id === 'model');
  if (!source) return null;
  const pi = source.features.planes.findIndex((f) => f.id === id);
  if (pi >= 0) return { source, kind: 'plane', index: pi, feature: source.features.planes[pi] };
  const ci = source.features.circles.findIndex((f) => f.id === id);
  if (ci >= 0) return { source, kind: 'circle', index: ci, feature: source.features.circles[ci] };
  const ei = source.features.edges.findIndex((f) => f.id === id);
  if (ei >= 0) return { source, kind: 'edge', index: ei, feature: source.features.edges[ei] };
  const pa = source.features.paths.findIndex((f) => f.id === id);
  if (pa >= 0) return { source, kind: 'path', index: pa, feature: source.features.paths[pa] };
  const ri = source.features.radialChains.findIndex((f) => f.id === id);
  if (ri >= 0) return { source, kind: 'radialChain', index: ri, feature: source.features.radialChains[ri] };
  const ti = source.features.threads.findIndex((f) => f.id === id);
  if (ti >= 0) return { source, kind: 'thread', index: ti, feature: source.features.threads[ti] };
  const bi = (source.features.bitmaps ?? []).findIndex((f) => f.id === id);
  if (bi >= 0) return { source, kind: 'bitmap', index: bi, feature: source.features.bitmaps![bi] };
  return null;
}

/** Partition a selection by source for per-source generation. Ids that
 * resolve nowhere are reported by `unmatchedIds` — callers fail with a
 * reselect message instead of silently dropping them. */
export function splitSelection(
  sources: FeatureSource[],
  ids: string[],
): { source: FeatureSource; ids: string[] }[] {
  const bySource = new Map<string, string[]>();
  for (const id of ids) {
    const r = resolveFeature(sources, id);
    if (!r) continue;
    const list = bySource.get(r.source.id) ?? [];
    list.push(id);
    bySource.set(r.source.id, list);
  }
  return sources.filter((s) => bySource.has(s.id)).map((s) => ({ source: s, ids: bySource.get(s.id)! }));
}

/** Which ids resolve nowhere (resized/deleted primitive, gone model). */
export function unmatchedIds(sources: FeatureSource[], ids: string[]): string[] {
  return ids.filter((id) => resolveFeature(sources, id) === null);
}