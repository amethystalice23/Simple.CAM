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
import { detectFeatures, type DetectedFeatures } from '../cam/features';
import type {
  CircleFeature,
  EdgeFeature,
  ModelTransform,
  PathFeature,
  PlaneFeature,
  Primitive,
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
 * cylinder axis along local X (matching the Viewport render). 48 segments
 * keeps rim circles fittable (the 8-segment snap mesh is below fitCircle's
 * n ≥ 9 threshold).
 */
export function primitiveGeometry(p: Primitive): THREE.BufferGeometry {
  if (p.kind === 'box') {
    return new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z);
  }
  if (p.kind === 'artwork') {
    // line work, not a solid: the Viewport draws the paths as lines
    // (artworkLocalPoints); an empty mesh keeps the raycast pipelines
    // (plane picks, the occlusion gate) from ever hitting it
    return new THREE.BufferGeometry();
  }
  const g = new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, p.length, 48);
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
      : p.kind === 'artwork'
        ? `artwork|${p.id}` // artwork sources build features directly — never cached
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
    paths: features.paths.map((f: PathFeature) => ({ ...f, id: ns(f.id) })),
    planeLoops: features.planeLoops,
    faceToPlane: features.faceToPlane,
  };
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
    })),
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

/** The id → {source, kind, index, feature} lookup shared by selection
 * resolution, labels, depth prefills, and generation. */
export interface ResolvedFeature {
  source: FeatureSource;
  kind: 'plane' | 'circle' | 'edge' | 'path';
  index: number;
  feature: PlaneFeature | CircleFeature | EdgeFeature | PathFeature;
}

export function resolveFeature(
  sources: FeatureSource[],
  id: string,
): ResolvedFeature | null {
  // namespaced ids locate their source by prefix; the stored feature ids
  // are the FULL ids (namespaced for primitives, bare for the model), so
  // compare verbatim — do not strip the prefix.
  const parsed = parseNamespacedId(id);
  const source = sources.find((s) => (parsed ? s.id === parsed.primId : s.id === 'model'));
  if (!source) return null;
  const pi = source.features.planes.findIndex((f) => f.id === id);
  if (pi >= 0) return { source, kind: 'plane', index: pi, feature: source.features.planes[pi] };
  const ci = source.features.circles.findIndex((f) => f.id === id);
  if (ci >= 0) return { source, kind: 'circle', index: ci, feature: source.features.circles[ci] };
  const ei = source.features.edges.findIndex((f) => f.id === id);
  if (ei >= 0) return { source, kind: 'edge', index: ei, feature: source.features.edges[ei] };
  const pa = source.features.paths.findIndex((f) => f.id === id);
  if (pa >= 0) return { source, kind: 'path', index: pa, feature: source.features.paths[pa] };
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