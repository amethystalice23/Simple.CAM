# Edge tracing, feature detection, and primitives

How simple.cam finds geometry worth machining on a placed model, lets the
user select it, and augments the model with primitive shapes that operations
can target. Feeds the 2.5D generators (PLAN.md Phase 1) and the wrapped
generators (Phase 2).

## License boundary (hard rule)

The reference capability is the PrusaSlicer/OrcaSlicer/BambuStudio
measuring tool (`libslic3r/Measure.cpp`, AGPL-3.0). We match its
*capabilities* — points, edges, circles/holes, planes, cylinders — from
first principles and published algorithm descriptions only. Never read,
paste, or translate its code into this repo (see PLAN.md license policy).
The algorithm summaries below are ours, written to be implementable
without consulting the reference.

## Architecture: two sources of operation geometry

Operations do not consume raw meshes; they consume **OperationTargets**:

```
placed mesh ──detect──▶ Features   (planes, circles/holes, edges, sliced loops)
user        ──add─────▶ Primitives (cylinder, box, 2D profile)
                       └──▶ both: machine-space geometry an op can machine
```

- **Features** are detected, immutable facts about the placed model. They
  get stable ids (hash of type + rounded parameters + vertex sample) so an
  operation survives a model reload as long as the geometry does not
  change. One feature may feed several operations.
- **Primitives** are user-added shapes (3D: cylinder ∥ X, box; 2D: rect,
  circle, polygon at a Z level). They reuse the placement vocabulary
  (ModelTransform + the snap/align helpers in `src/ui/placement.ts`).

Motivating case: a round part with detail features. Add a **cylinder
primitive** sized from the model's measured extent (see "auto-sizing"),
then run the facing generator against it as an initial roughing/lathe
pass — the detail features are ignored until a finishing op consumes them.

## 1. Mesh feature detection (measure-tool equivalent)

Input: the placed model as a triangle soup (three.js BufferGeometry,
non-indexed). Work in machine coordinates, after ModelTransform.

### Face grouping into planes

- Compute face normals.
- Flood-fill: start from an unvisited face, queue neighbors (shared edge)
  whose normal is within an angle tolerance (default ~0.5°, adjustable)
  of the seed's plane. Assign each face a plane id; keep each plane's
  vertex set.
- Robustness: skip degenerate (zero-area) faces; treat non-manifold edges
  (3+ faces) as group boundaries.

### Border loops

- For each plane, walk boundary edges (an edge whose two adjacent faces
  belong to different planes, or only one face) around the plane using
  half-edge next-around-vertex traversal with guards against broken
  meshes; collect closed border loops.

### Circle, regular-polygon, and arc recognition

For each border loop, project vertices onto the plane (quaternion aligning
the plane normal to +Z), then in 2D:

- **Circle**: RANSAC fit (3-point circle, inlier distance tolerance
  ~0.01–0.05 mm); accept if fit error below tolerance AND the loop has
  >8 segments of roughly equal length. Output: center, radius, axis
  (= plane normal).
- **Regular polygon**: 4–8 equal-length segments with equal turn angles
  → report as polygon with center/inradius (useful for hex pockets).
- **Arcs**: runs of ≥5 vertices with identical turn angle (tolerance
  ~0.01 rad), equal segment lengths within the run, subtending >90°,
  RANSAC fit error in tolerance → circular arc feature.
- Everything else stays a plain polyline loop.

### Edges and points

- An edge shared by two *different* planes is an intersection-edge
  candidate: merge collinear adjacent segments into a single straight
  edge feature; arcs recognized as above.
- Point features: edge endpoints and circle centers (centers matter for
  drill ops — see below).

### Hole detection (for drills and pockets)

A circle feature whose plane normal is ∥ machine Z (within tolerance) and
which bounds material *inside* it (the mesh has faces below the circle's
plane) is a **hole**: candidate drill target (center + diameter) and/or
pocket boundary.

### Sharp-junction circles (chamfer roots)

A chamfer's root circle — the true wall/bore diameter — lies between two
multi-plane surface bands (chamfer + wall), so no single plane's border
loop contains it and the plane path above can never see it. A second path
detects these: mesh edges whose adjacent face normals deviate by more
than 30° (so smooth tessellation joins are excluded) are stitched into
loops — taking the straightest continuation at junctions — and closed
loops are circle-fitted like plane borders. Duplicates of plane-path
circles are merged geometrically (center/radius/axis, sign-insensitive).
The hole test for junction circles votes on the radial component of the
adjacent surface normals: surfaces facing back toward the circle's axis
mean material outside the loop (a bore).

### Bounding measurements (for auto-sizing primitives)

v1 deliberately skips full cylindrical-surface fitting. We provide the
measurements primitives need:

- **Bounding radius about the stock axis**: max over model vertices of
  `√(y² + z²)` in machine coords (optionally per X-window, e.g. the
  model's X span or a user-picked range) → cylinder primitive sizing.
- **Axial extent**: min/max X of the model.
These feed "auto-size" suggestions, not the feature list itself.

## 2. Z-slicing for 2.5D operations

Independent of plane detection: intersect the placed mesh with a plane
Z = const and stitch closed contours for Clipper2.

- Per triangle, compute the crossing segment (0/1/2 vertices strictly on
  each side; vertices exactly on the plane are attributed by a consistent
  side rule with an epsilon).
- Stitch segments into loops by endpoint matching (tolerance ~1e-9
  relative, or exact via quantized coordinates).
- Classify loops into polygons by winding: outer boundary CCW, holes CW
  (Clipper2 convention). Non-closed chains (open meshes) are dropped with
  a warning surfaced in the UI.
- Output per level: `Slice { z: number; contours: Vec2[][] }`.
- Depth levels come from the operations (step-down ladders); slicing is
  on demand and cached by (model id, transform hash, z).

## 3. Markup and selection

- **Hover**: raycast → face → resolve to the feature owning that face
  (plane, circle-on-plane, edge via nearest-edge distance within a
  ~0.5 mm snap). Highlight the whole feature, not the triangle.
- **Click**: toggles the feature into the selection set; the feature id
  is what operations store.
- **Manual measuring (measure mode, right-click)**: picks the nearest
  feature, or — when nothing is near — the plane group owning the face
  under the cursor (highlighted over its member triangles). A second
  pick reports the center-to-center distance between the two (circles:
  center; edges: midpoint; planes: group centroid — the OrcaSlicer
  convention), plus the angle between two plane normals when both picks
  are planes. Subsequent picks replace the second item; right-clicking
  empty space clears both. Selections are highlighted persistently with
  a dashed center-to-center connector.
- **Features tab** (fifth sidebar tab): list of detected features grouped
  by kind (Planes / Circles & holes / Edges), search by dimension, the
  current selection, and measurements shown next to each feature (Ø for
  circles, length for edges, normal for planes).
- Operation dialogs reference feature ids (Phase 1 step 4 builds this UI);
  a feature consumed by an op shows a badge in the list.

## 4. Primitives

Types for v1:

| Primitive | Parameters | Ops it feeds |
|---|---|---|
| Cylinder (axis ∥ X) | position (uses ModelTransform), length, diameter | faceCylinder/roughing (target diameter), wrapped ops |
| Box | size, position | roughing limits, stock-region ops |
| 2D rect / circle / polygon | plane Z, shape params | pocket/drill/engrave target areas |

- Placement reuses ModelTransform and the same snap buttons
  (`alignAxisToStock`) — a primitive is placed like a model.
- **Auto-sizing from the selection**: adding a cylinder with a circle
  selected creates it at the same diameter and center (axis ∥ X, length
  from the model's axial extent); adding a box with a plane selected
  creates it with one face matching that face's in-plane extent, sitting
  on the face (thickness along its normal). Without a matching selection
  the primitives default from the stock (stock-sized cylinder; a 10×10×5
  tab on the stock top) and are sized afterwards.
- Selection mode is a toggle on the Features tab: while on, viewport
  left-clicks toggle features/faces into the operation selection set
  (stable ids); rows in the tab's feature list do the same.
- Primitives are first-class scene objects: rendered in the viewport
  (distinct color from the model), listed under the Features tab, and
  deletable.

## Data model (src/core/types.ts additions)

```ts
export interface PlaneFeature   { kind: 'plane';  id: string; point: Vec3; normal: Vec3 }
export interface CircleFeature  { kind: 'circle'; id: string; center: Vec3; axis: Vec3; radius: number }
export interface EdgeFeature    { kind: 'edge';   id: string; a: Vec3; b: Vec3 }   // straight; arcs later
export interface HoleFeature    { kind: 'hole';   id: string; center: Vec3; diameter: number }
export type Feature = PlaneFeature | CircleFeature | EdgeFeature | HoleFeature;

export type Primitive =
  | { kind: 'cylinder'; id: string; length: number; diameter: number; transform: ModelTransform }
  | { kind: 'box'; id: string; size: Vec3; transform: ModelTransform }
  | { kind: 'rect' | 'circle2d' | 'polygon2d'; id: string; z: number; /* shape params */ };

export type OperationTarget = { featureId: string } | { primitiveId: string };
```

Implementation layout: detection math in `src/cam/features.ts` and
`src/cam/slicing.ts` (kernel side, pure three.js, fully unit-tested);
selection state and panels in `src/ui`.

## Test plan

- Fixtures: unit cube, tessellated cylinder, plate-with-round-hole,
  L-shaped extrusion — each with expected plane/circle/edge counts and
  parameters.
- Slicing goldens: known polygons at given Z levels, including hole
  winding order and a level passing exactly through a coplanar face.
- Degenerate cases: open mesh (dropped loops, warning), duplicate
  vertices, vertex exactly on the slice plane, non-manifold edge.
- Detection tolerances: circle fit error just inside/outside tolerance.

## Decisions (2026-10-15)

1. **Hover snap is zoom-dependent**: a screen-space radius with a ~0.5 mm
   floor, so precision holds when zoomed in but the picker stays usable
   when zoomed out. Circles and holes are key dimensions and take
   precedence: they snap within 2.5× the tolerance (25 px / 1.25 mm
   floors) and win outright over edges inside that radius; edges are the
   fallback.
2. **v1 features are straight lines and circles only** — no arcs, no
   regular polygons. Loops that fit neither stay unclassified polylines.
3. **Feature ids hash model-space geometry only**, so moving or rotating
   the model keeps ids — and therefore selections and op bindings —
   stable.
4. **Primitive↔operation binding is live**: operations store target ids
   and generation resolves them at run time, so editing a primitive or
   its placement re-generates the affected ops.