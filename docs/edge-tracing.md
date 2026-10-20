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

### The slice-pocket op (section plane + cut band)

Region source = the model's cross-section at ONE slice plane, not a
selection. `sliceDepth` (mm below the crown, default 2 — the viewport
handle drags it) picks where the section comes from: put it where the
body is clean, away from rounded/chamfered tops. The op then cuts the
`startDepth`…`endDepth` band (start defaults to the crown, floor via the
⇩ pick) using THAT section's shape — cut above and below the slice with
one region.

- **Region mode**: `'outside'` PROFILES around the section — the tool
  center rides the outline offset out by the tool radius (+ allowance as
  wall stock), the profile op's outside pass over the section shape; it
  never needs to fit between part and stock wall, so a snug stock can't
  reject the tool. `'inside'` pockets the section's interior (hollow
  parts, negative-space flutes).
- The region comes from `sliceAtZ` at the section plane only — never
  from the cut band; `droppedChains` surfaces in the summary.
- **Indexed operation**: under an Index datum the positions are rotated
  through `indexedPointRotation` BEFORE slicing, at machine Z — the same
  convention as every other indexed op (the part sits rotated; the
  machine-horizontal plane cuts the rotated body). Clearance uses the
  stock's rotated silhouette (a cylinder's is unchanged; a box's Y
  extent becomes its conservative half-diagonal envelope).
- No feature selection is needed for the region — the model is the
  input (the face-cylinder precedent). Honest limit: features that
  change inside the band keep the section's silhouette — a true
  per-level waterline and smooth draft walls stay Phase-3 arguments.

**The waste-stock toggle** (`clearToStock`, implemented 2026-10-20
after Alice's cross-part needed it): a per-op checkbox "clear excess
stock", on profile (side=outside) and slice pocket (regionMode=
outside). ON: the outline ring ALWAYS runs first — it may cross the
stock edge (settled: leaving the stock is fine, so a tight stock never
truncates the profile) — and then whatever waste remains INSIDE the
stock footprint is pocketed with step-over passes over the whole band
(region = stock − allowance-grown part), appended to the ring's moves;
a frame thinner than the tool leaves that waste standing and the
summary says so — an error is never the price of the toggle. OFF
(default): the outline ring only. One knob, shared by both ops — no
third region mode.

## 3. Markup and selection

- **Hover**: raycast → face → resolve to the feature owning that face
  (plane, circle-on-plane, edge via nearest-edge distance within a
  ~0.5 mm snap). Highlight the whole feature, not the triangle.
- **Measure mode is the single interaction mode** (no separate select
  mode): hover highlights transiently; a left click toggles the picked
  feature — nearest feature, else the face's plane group — into the
  selection, where it stays lit in light blue. Selected features carry
  their labels (Ø / L / plane), and exactly two selections report the
  center-to-center distance between them (circles: center; edges:
  midpoint; planes: group centroid — the OrcaSlicer convention) plus
  the angle when both are planes, with a dashed connector. Right-click
  clears the selection and with it the measurements. The feature ids in
  the selection are what operations store and what + Cylinder / + Box
  size from (first selected circle → cylinder, first selected plane →
  box). While an op's feature selection is active, straight lines are
  not pickable (they are not operation targets) — circles and faces
  only; lines stay selectable for measuring/primitives and return for
  the later line-following engrave op.
- **The Model tab is the object home**: an objects list at the top (loaded
  model + primitives) selects which object the placement and size controls
  edit; a Size section with per-dimension revert and a uniform-scale
  checkbox resizes the selected object (the loaded model via
  ModelTransform.scale); + Cylinder / + Box / Delete object and the
  Show features / Measure mode checkboxes sit at the bottom. Primitives
  carry their creation-time dimensions for the revert buttons.
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
- **Primitives are feature sources** (src/ui/featureSources.ts): each
  primitive's features come from detecting its local mesh
  (`primitiveGeometry`, 48 segments — below fitCircle's n≥9 the 8-segment
  snap mesh yields no circles), with ids namespaced `p:<primId>:` so they
  never collide with model ids. The Model tab works with no STL loaded,
  and pocket/profile/drill/chamfer resolve their selections across ALL
  sources (model + primitives), rejecting faces+holes mixed across sources
  and failing visibly on dangling ids (a resized primitive — moving it
  keeps ids stable, resizing does not). The plane-pick raycast covers the
  primitive meshes (non-indexed, aligned with the detection).
  The render pose is `primitivePose` — EXACTLY `transformFn(p.transform)`;
  the axis remap (cylinder ∥ local X) lives only inside
  `primitiveGeometry`, never in the Viewport (baking it in both places
  once put the mesh 90° out of sync with every overlay and pick).
  Caveats: a cylinder's curved side is NOT one plane — it yields sliver
  facet planes and vertical edges (adjacent facets differ 7.5° > the 0.5°
  plane tolerance). Face regions are the face's own border loops (a cap
  face gives its tessellated rim, e.g. a 48-gon on primitives — the
  crisper analytic circle is still there for rim-CIRCLE selections).

## 5. Slice-pocket UI: cut-plane overlay, ⇩ floor pick, plane handle

**The ⇩ pick modes** generalize beyond floors: the face-cylinder op
carries ⇩s on **Start X**, **End X** (the next click's feature X
position) and **Target Ø** (a circular feature's diameter) — defaults for
all three come from the stock size. The old "target primitive" select
is gone (it never worked well; the pick modes position a face on the
model faster). Banners per kind: "Selecting floor/target Ø/start X/
end X — click a feature in the viewport"; a non-circle click in Ø mode
stays waiting.

**Pick-aware highlighting**: while any pick is active the viewport
highlights ONLY pickable features (`pickAllows` in the Viewport) — edges
never flash (they carry no facing point, so they'd just steal clicks),
and the Ø pick shows circles alone, planes included in neither hover nor
click. Normal measure mode is unchanged.

**The face ghost**: while a face-cylinder panel is open the viewport
draws the INTENDED result — a translucent violet cylinder of the target
diameter spanning Start→End X about the stock axis (SLICE_COLOR, in the
machine-space overlay group; the faced result is rotationally symmetric
about the axis, so the datum view leaves it alone). It live-updates as
the ⇩ picks fill the fields.

**⇩ Floor pick (every depth-bearing op: pocket, profile, slice
pocket).** A small ⇩ icon button (an arrow pointing down at a floor
line; tooltip: "Set the cut floor from the selected face") beside the
depth boxes, enabled when exactly one plane or circle is selected in
measure mode. Click: *End depth* := crown − machine Z(feature point),
and the feature id is stored as `floorFeatureId`. The link is LIVE —
the feature's Z keeps driving the depth (move the model or primitive
and the floor follows, no re-measuring) — until the end-depth box is
hand-edited, which detaches it (the face-cylinder primitive-target
pattern: an explicit user edit wins). Tilted faces use the feature's
representative point, the same convention `selectionIs: floor` uses.
A provenance hint shows the source ("floor: face at z −3.20"); a
dangling id fails with the standard "no longer exist — reselect"
message. This decouples region definition from depth definition — one
selection no longer has to guess at both.

**Section-plane overlay (slice pocket only).** While the slice-pocket
op is expanded, the viewport draws, in a dedicated slice color (violet —
distinct from every existing overlay), two things: (a) the SECTION
PLANE — a translucent quad at machine Z `crown − sliceDepth` (machine
space, in a group OUTSIDE the datum group, so it stays machine-
horizontal while the part rotates) spanning the rotated part's XY
bounds — and (b) the contour outline at that plane (the `sliceAtZ`
loops of the datum-rotated positions, as a polyline, same color, full
opacity). It refreshes live:
slice-depth edits, the plane handle, and model moves all redraw it
(slicing is a single mesh pass; recomputed at most once per frame).

**View follows the datum.** While ANY op panel is open the part-relative
group (stock, model, overlays, preview) renders rotated to that op's
cutting frame — the index datum established above it, computed by
`datumAngleBefore` — pivoted about the stock axis (y=0, z=axisZ), the
exact rotation `indexedPointRotation` applies in generation. An open
INDEX op shows its OWN angle as already applied: editing the number
turns the live view. This is the precise inverse of the toolpath
preview's per-op un-rotation, so toolpaths land at their true machine
positions. No panel open → A0. The machine grid, axes, and navcube
never rotate.

**The A0 marker** (4-axis only): a small amber arrow hint at X=0 (with
the machine axes), rising from the stock axis toward the material that
faced the cutter at A0 — its length is the stock radius plus a little
clearance, so the tip peeks out of the stock ghost. It lives in the
rotating group, so it turns with the part — whatever the datum, it
shows where "A0 up" sits now, so a symmetric part never loses its
orientation.

**Plane handle.** A small grab ball on the section plane's near edge: drag
vertically to slide `sliceDepth` (the cut band is untouched). During the drag the orbit controls
disable, pointer Δy maps to ΔZ at the handle's depth (the same
px-per-mm the snap logic uses), the overlay and the Slice-depth box
follow live, and releasing commits. The drag state lives in a ref so
the mid-drag prop updates (the live box) never kill it — the effect
cleanup on prop changes must not touch it; only the unmount-only
cleanup does. One handle = the section plane; the floor stays a feature
pick, not a second handle.

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

// §5: the floor pick — a live feature reference driving end depth
export interface FloorPicked { floorFeatureId: string | null }
// on the depth-bearing JobOps (pocket / profile / slice pocket);
// detached (nulled) by a hand edit of the end-depth box

// §2 slice-pocket op: region = the model's Z cross-section
export interface SlicePocketJobOp {
  kind: 'slicePocket';
  regionMode: 'outside' | 'inside'; // stock − slice | slice interior
  startDepth: number; // mm below the crown (the slice Z)
  endDepth: number; // mm below the crown (floor: ⇩ pick or a box)
  allowance: number;
  stepDown: number;
  stepOver: number;
}
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
   when zoomed out. Circles and holes take precedence but snap TIGHTLY:
   CIRCLE_PRIORITY × the tolerance (0.55× since 2026-10-20, cut to a third
   of the old 1.65 at Alice's request — circles were stealing face clicks;
   ~5.5 px / 0.28 mm floors) and win outright over edges only inside that
   small radius; edges are the fallback.
2. **v1 features are straight lines and circles only** — no arcs, no
   regular polygons. Loops that fit neither stay unclassified polylines.
3. **Feature ids hash model-space geometry only**, so moving or rotating
   the model keeps ids — and therefore selections and op bindings —
   stable.
4. **Primitive↔operation binding is live**: operations store target ids
   and generation resolves them at run time, so editing a primitive or
   its placement re-generates the affected ops.