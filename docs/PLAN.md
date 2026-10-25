# simple.cam — Open-source CAM for the Carvera

A free, open-source CAM application: load STL/STEP → trace/select features →
build operations → export G-code → hand off to the Carvera Community
Controller for machine comms, preview, and macros.

**Not in scope** (ever): machine control, guided workflows, firmware
functionality. The controller (GPL-2, Python/Kivy) is a separate program; we
exchange files and conventions with it, never code.

## Machine assumptions (verified)

- 4th axis is parallel to X: cylinder axis = X, circumference = A, cutter in Z.
- Community firmware: G93 inverse-time feed (modeled on LinuxCNC, intended for
  simultaneous XYZ+A); **every G1 line must carry F while G93 is active**
  (firmware halts otherwise); A-axis surface-speed compensation is disabled
  under G93. `G92.4 A<deg> R<any>` = rotate A to its mod-360 equivalent and
  set the work-A datum (R's value is ignored); `G92.4 A0 S0` = shrink
  work-coordinate A back into ±360 — that's the wrap command, and both forms
  are verified in firmware source and machined examples (see
  docs/makera-dialect.md and examples/); A-axis is
  rotation-rate limited (firmware config max: C1 1800°/min ≈ 5 RPM, Z1
  3600°/min = 10 RPM; the older 6.6/12.5 RPM figures are community
  operational guidance); G94 surface-speed compensation is radius-aware
  (radius = √(Y²+Z²) of the move target, G94/G1-3 only).
- Probe-based 4th-axis calibration lives in the controller/firmware
  (M465.1 stock leveling/twist, M469.4/.5/.6 center offsets). We *consume*
  the outcome: a job's stock carries A-origin, axis Z, effective radius.
- The controller's G-code viewer parses tool definitions from Makera Studio /
  Fusion 360 / FreeCAD post comments — our post emits that comment format so
  files preview correctly there.

## Architecture

Web app: TypeScript + React + three.js + WASM kernels, Vite build, vitest
tests. Optionally wrapped in Tauri for a desktop build later.

```
Import (STL three.js loader; STEP via occt-import-js later)
   → Mesh library (three.js render, decimation for viewport)
   → Placement (ModelTransform: position/rotate vs stock, snap-to-stock)
   → Feature detection + primitives (edge/loop/hole picker and user-added
     shapes — see docs/edge-tracing.md; primitives are FEATURE SOURCES:
     their local-mesh features carry `p:<primId>:` ids and are selectable
     in ops exactly like model features, and the Model tab works with no
     STL loaded)
   → Operations (ordered list: type + features + tool + params)
   → Toolpath gen (parametric wrapped generators + Clipper2 2.5D + opencamlib WASM for 3-axis)
   → Preview (Move[] IR → viewport polylines — see below)
   → Post-processor (Carvera dialect, pluggable)
   → .nc handoff (community controller)
```

### Toolpath preview

Verify paths on screen before they go near the machine. Rendered directly
from the **Move[] IR** (before the post — never by re-parsing emitted G-code):
modal axis accumulation over the move list, feed moves and rapids as
distinctly colored polylines, with the stock and placed model visible under
them. The preview draws in the **display frame** (the stock/model as shown
at A=0), so paths appear over the features they cut: rotary moves (A-word)
map back about the stock axis, and flat moves following an Index op
un-rotate by that op's datum — the G-code itself is untouched machine
coordinates. Pure-A Index moves draw nothing (the stock rotates, not the
tool) and only establish the datum for what follows. Optional later: an
animated cutter marker scrubbing the path, and feed-rate/depth shading.
No external library — three.js GCodeLoader and Kiri:Moto's viewer exist as
prior art, but the IR is a strictly better input and the wrapped-rotary
mapping is our own transform.

### The cylinder canvas (core 4-axis abstraction)

Unwrap the stock surface: **U = θ·r** (mm along circumference), **V = axial
position (machine X)**, cutting depth → Z. All wrapped operations are 2D path
math in (U,V) plus one wrap transform:

```
A = U / r · 360°  (accumulated continuously, >360° allowed; G92.4 after op)
X = V
Z = axisZ + stockRadius − radialDepth  (Z0 = stock center: the Z1-probed
                                       4th-axis motor-block datum, where
                                       Makera Studio places Z0)
```

No dexel engine, no 3D-on-cylinder kernel in v1.

## Operations (v1 spec)

| Op | Type | Generator |
|---|---|---|
| Face cylinder to diameter ("4D lathe") | parametric | Z stepped per depth level to `stockRadius − D/2`; roughing stepdown + finishing pass; user-set step-over (default 0.5·tool Ø — the radius, conservative radial engagement) shared by all patterns. Three cut patterns: **vertical** — rings, a full A revolution at each X (X steps in the cut between rings; A-only cuts in G94 at the ~6.6 RPM limit, deg/min); **horizontal** — indexed passes, a full X sweep at each A (A steps by the step-over arc at the cut radius; X zigzags, G94 mm/min); **spiral** — one continuous A+X helix per depth level, G93 with F = 1/pass-minutes. In-app time estimate (RPM-limited) |
| Indexed pocket/profile/drill | 2.5D | A frozen at index angle → ordinary flat op in rotated frame (reuses flat engine) |
| Thread (90° V-bit, IMPLEMENTED 2026-10-20) | parametric helix | `thread.ts`: per pass `G1 X… A…` constant Z, A advances `(span/lead)·360°` (lead = starts×pitch); Z depth-steps between passes re-entering at identical absolute A phase (levels retrace — sweeps alternate, A returns along the helix); multi-start = 360/starts phase offsets following the index datum; spring pass per start; external only. Depth derives from pitch + the tool's tip angle + tolerance (grooves half a pitch wide at crest; crest Ø = nominal − 2·tolerance); the panel's "Add facing toolpath" INSERTS a prefilled Face cylinder op before the thread (crest Ø, the thread's X range and rotation — its own tool/feeds/step-over); editing the nominal Ø prefills the standard ISO coarse pitch (metricPitch: M4→0.7, M6→1.0…). Fit is EMPIRICAL (risk 3) — the tolerance knob tunes it on a coupon |
| Spiral carve (wrapped groove, STARTED 2026-10-20) | parametric | `spiralCarve.ts`: multi-start helices about the stock axis at a user angle off circumferential (90° = axial); depth ladder retraces the same groove per level (sweeps alternate, A returns along the helix); width > tool Ø fans parallel passes; X+A sweeps G93 from the rotary limit; strand phases follow the index datum; setup ghost + groove marks in the viewport (docs/edge-tracing.md §5). Archimedean/straight/cross-hatch still to come |
| Flat pocket / profile / drill / engrave | 2.5D | Clipper2 offsets (see docs) over sliced depth intervals; drill from circle-feature detection. Profile (and slice-pocket outside) carry **TABS** (2026-10-25, Alice's cut-out workflow): N auto-spaced hold-down bridges (count/height/length, defaults 3 × 0.5mm × 3mm) — deep levels cut spans between them, shallow levels cut through; arc-length placement never straddles the loop seam. Waterline carries the same tabs as keep-out bridge boxes (rimless reliefs) |
| Slice pocket (3-axis) | 2.5D | one `sliceAtZ` cross-section at the op's slice plane → `'outside'` profiles around it (tool-center path offset out by tool Ø/2 + allowance) / `'inside'` pockets its interior, over the start→end band; floor via the ⇩ pick; violet section-plane overlay + drag handle (docs/edge-tracing.md §2, §5) |
| Flat chamfer (V-bit) | single-pass flank | two modes. **add**: the cone flank is placed through the selected circle or face outline (a face's border loop becomes the path; a loop that circle-matches a feature resolves to that analytic circle — selecting the hole rim or its face gives the same path) — a new chamfer through a sharp edge. **existing**: the model already has the chamfer — the bit rides the modelled face, and direction selects which end was clicked: **up** = the bottom edge, traced exactly (depth ignored — the bit cuts up and out from there); **down** = the top edge, the tip slides down-and-in by depth·tan(angle/2) along the modelled face, landing on the bottom edge when depth matches the model. User side option (inside/outside — geometry can't always tell) and depth along the wall |
| Cylinder chamfer (4-axis, 2026-10-23) | rotary ring pass | `cylChamfer.ts`: the degenerate face-cylinder vertical ring — one full A revolution per level at the selected edge circle's exact X, V-bit tip at Ø/2 − depth. The DEPTH is the only direction: 0 anchors on the circle and cuts up-and-out through whatever rises above it (ladder from the stock surface — the adjoining Ø is deliberately unknown, the one-circle rule; spec + edge sources in edge-tracing §6), >0 slides below the circle from an already-clear rim. Edges are A-coaxial circles: face-cylinder ops publish their step edges at their own target Ø (`o:` ids), the stock its end rims, model circles on turned parts too; A-only sweeps G94 at the rotary deg/min |
| Engrave (artwork line work, SPEC 2026-10-22) | path-following | `engrave.ts`: follow selected artwork paths at depth, no tool offset (see the full spec below) |
| Test pattern (calibration coupon, 2026-10-24) | dialog → materialized ops | The top-bar **Calibration…** dialog (BambuStudio's name) generates a cutting-calibration coupon over the whole stock: two parameters (spindle speed / feed / step down / step over) linspaced min→max across a cell grid, everything else held at the tool's material preset so it never confounds the read. `src/cam/testPattern.ts` is the pure planner — cell counts from stock size + tool Ø capped at 10 divisions per axis (larger stock GROWS the cells/grooves to fill, never multiplies past 10×10; strands keep their tighter useful cap of 6, the leftover circumference becoming groove-width budget), value ladders, warnings; the dialog shows its legend + warnings live, then `materializeTestPattern` emits ORDINARY OPS: rotary (cylinder, 4-axis) a face op + one spiral carve op per cell (60° helix, grouping-outer, strand 1 tailed); flat (box) one thin box primitive per cell (the visible outline plate; its top face the pocket region) + one pocket op per cell, row-outer, with the perimeter border slightly wider than the inter-cell gap and cell 1/1 grown into it at the TOP-LEFT corner — rows number top to bottom, columns left to right, and the oversized corner marks the grid origin (the flat analogue of the ranked tails). The materialized ops ARE the record — each cell an op row with rates in the ⚡ popup, minutes in the estimate, saved in the job file; regenerate = delete + Generate again. Coupon lessons encoded: whole-bar face pass first (runout + stress skin, the v4 confound); RPM belongs on the grouping axis (spindle settles slower than the machine repositions — warned, never silently swapped); feeds above the rotary ceiling alias (warned; the G93 timing still clamps the cut); step-down = groove depth on rotary (single full-depth pass), pass depth on flat; step-over = groove width on rotary, clearing spacing on flat; the −X ends of every groove align while the +X ends stagger — strand 1 longest, shortening strand by strand (0.5mm-class steps sized to keep ≥1mm wall to the next grouping), so every groove self-identifies with no clockwise convention (which is viewpoint-dependent) |

Later (v2+): 3-axis custom roughing/finishing via opencamlib WASM
(drop-cutter/push-cutter). Parked: dexel 3D relief on cylinder.
Parked (noted 2026-10-20): a per-op **waste-stock toggle** — ON lets
paths run off the stock edge (clean exits on tight stocks; the slice
pocket's outside mode could clear to the stock wall when the frame fits
the tool), OFF clamps regions within the stock footprint
(docs/edge-tracing.md §2).

### Engrave + artwork import (spec, 2026-10-22)

Logo/drawing work from imported vectors — the one deferred Phase-1 op.

**Artwork is a primitive.** SVG (Inkscape, "object to path" first — NO text
engine in-app, fonts are the editor's job) or DXF, parsed by hand-rolled
from-spec parsers (license policy: no GPL/AGPL vector libraries). Curves
flatten to polylines at import (chord tolerance ~0.05mm), giving the app
one canonical form: **paths**. Each path is a selectable feature
(`p:<primId>:path:<i>`), so selection, snapping, and the occlusion gate
come free from the existing machinery.

**One op: Engrave** — follow selected line work at depth, no tool offset
(the centerline IS the path; that's what makes it engraving rather than
profiling). Depth ladder like the spiral ops (levels retrace, sweeps
alternate). Filled logo areas are NOT a new op: Pocket on the artwork's
closed loops (a small region-resolver hookup, deferred until a filled
logo actually shows up — outline tracing is the scope). Chamfer on a
closed artwork loop = beveled outline.

**Two frames, one generator core** — walk the flattened segments, emit
moves through a pluggable frame mapper:

- **flat** (a drawing in a wooden plane): (U,V) → (X,Y), plain G94 at
  the cut feed. Placement uses the existing primitive transform.
- **wrapped** (a logo on a cylinder): the cylinder canvas made concrete —
  (U,V) = (mm around, mm axial) → (A, X), θ = U/R. The wrap is a
  MAPPING onto the stock, not a transform of the artwork: the target Ø
  defaults to the stock surface (`surfaceDiameter` convention — set it
  after a facing pass; the ⇩ pick reads it off circle features,
  including partial rims). Scale is one number — mm of surface per
  artwork unit — with a live coverage readout (wraps
  `U_extent/(π·Ø)·360°`), editable from either side. The angular
  origin follows the index datum; A continuity threads across ops.

**Wrapped segment timing (the real math).** Per segment with surface
length L and angular advance ΔA:

    time (min) = max( L / feed,  (ΔA/360) / MAX_ROTARY_RPM )
    G93 F = 1 / time            (F on every G1 line — post rules)

The binding constraint wins per segment: pure-circumferential moves cap
at `MAX_ROTARY_RPM × π·Ø` mm/min of surface speed (Ø16 ≈ 330 mm/min —
the measured spiral-groove regime; acetal fluff → ⚡ spindle override),
axial moves run the full feed, diagonals in between. A-only segments
run G94 at ROTARY_FEED_DEG_MIN; ΔA=0 segments G94 at the cut feed.
The op summary states the effective surface speed honestly
("rotary-limited: ~330 mm/min on the surface").

Phasing: (1) SVG import + artwork primitive + flat engrave + tests,
(2) wrapped engrave, (3) DXF import + pocket-region hookup for fills.
STATUS 2026-10-22: the full phase-1/2 core has landed —
`src/core/vectorImport.ts` (SVG parser), `src/cam/engrave.ts` (generator,
both frames, segment timing), the artwork PRIMITIVE (drop an SVG on the
viewport: stock-prefilled, flat/wrapped flip in the Model tab, own wrap
Ø with the angle-invariant scale + mm/unit readout), path FEATURES
through the shared overlay/snap/occlusion pipeline (amber, hoverable
during op editing), and the Engrave OP (panel, generation, rotary-
limited summary). Preview of engrave moves rides the general toolpath
preview. Remaining: DXF import, pocket-region hookup for fills, and a
browser eyeball of the wrapped artwork before first metal.

### Stock: shape vs mode

Stock has two orthogonal properties: **shape** (cylinder or box — pure
geometry: placement spans, mesh, crown) and **mode** ('3-axis' or '4-axis' —
machine capability). A cylinder can sit in a vise (3-axis); a box can ride
the rotary axis (4-axis). The rotary ops (index, face cylinder) gate on mode,
never on shape. Cylinder orientation follows mode: horizontal along X on the
rotary axis (4-axis), standing vertical — axis ∥ Z, centered on X0/Y0, its
length is the height and xOrigin places machine Z0 along it (3-axis); the
crown is the top face, and the rotary calibration fields are unused.

### Stock calibration model (4-axis)

Every 4-axis stock carries: A-origin (probed angular zero), axis Z (machine Z
of the stock center — the Z1 probe on the 4th-axis motor block with known
offsets; the same origin Makera Studio places), effective radius, optional
center offsets. Cylinders store their probed calibration; a **box derives
its rotary geometry instead** (never stored, so it cannot desync with size
edits): axis Z = the Z-span center, effective radius = half the Y-Z
diagonal (`hypot(sizeY, sizeZ)/2`). The box-on-rotary rule: treat it as a
cylinder of Ø = hypot(Y, Z) — the corners are the max radius, the flats sit
inside, so facing turns the corners off first and early-depth passes cut air
over the flats (conservative, never gouges). Rotations throughout the app are
about machine Y=0, so a 4-axis box is mounted Y-centered on the axis. The
stock surface is at axisZ + effectiveRadius. Source:
controller probe routines. The post emits a (commented or active) prep header
(M465.1 / establish A0 / verify axis datum) documenting what the job assumes,
gated on the job actually using A.

### Tool library (early Phase 1)

Tools are first-class user data, not per-operation settings. The initial
library is imported from Makera's public profiles repo
(MakeraInc/CarveraProfiles, Fusion `.tools` archives) by
`scripts/import-makera-tools.mjs` into `src/core/makeraTools.generated.ts`
(124 tools: ball/flat endmills, drills, engraving V-bits, thread mills).
Users add/modify/delete tools in the Tools panel; the user library persists
in browser storage. Feeds/speeds defaults come from material presets × tool
type, not from the tool record.

### 3D relief carving — heightmap & dexel (SPEC 2026-10-24, build in a later session)

"Select a whole object, recreate it as accurately as the machine can reach."
The spec below was thrashed out with Alice 2026-10-24 (with a Gemini plan
cross-checked; its convergent core validated the approach, its `G1 X Z A`
G-code template was REJECTED — see the machine-facts block). Decisions
settled by Alice: **waterline first** (cheap stepping stone); **roughing
and finishing are SEPARATE OPS** following the existing methodology
(one op: flat endmill + allowance, roughs fast; a second op: zero
allowance, ball or V-bit, finishes — she noted V-bit jobs run very long
from the tip size); **tools: flat + ball first, V-bit later**.

**The unifying insight.** The spindle never tilts: the tool always cuts
from straight down. Rotation sweeps that through exactly one ring of
approach directions — which is *precisely* what the unwrapped (x, θ)
heightmap samples. So the heightmap is not an approximation of "true"
4-axis carving — on THIS machine it is the complete representation.
Radial shadow (material at larger radius on the same radial ray) is
unreachable at every rotation; the machine agrees with the map. The
residual hard 20% is collision validation (shank/holder vs. rotated
features), phase D.

**Phase A — Waterline rough (3D, 3-axis)** — cheapest, mostly existing
machinery: loop `sliceAtZ` + `pocket2d` (inside mode) over Z levels from
the stock crown down to the model floor; each level pockets that slice's
cross-section over its band. **BOTH-axis allowance (the Carvera
omission, twice-flagged by Alice)**: floor allowance raises each level's
floor; side allowance insets every level's contours from the MODEL
contour by one constant radial stock (never from the previous level —
no inherited taper). Flat endmill default; stock-footprint clip; feeds
from material presets; composes before a finishing op.
**IMPLEMENTED 2026-10-25** — `waterlineRough` (src/cam/waterline.ts) +
the `waterline` op (no selection, no depth boxes: crown → model floor,
clamped at the stock bottom). Correction to the sketch above: each level
CLEARs `stockFootprint − section(cutPlane)` — the section's interior is
the part being KEPT, never pocketed; an empty section (level above the
model top) clears the whole layer. Allowance raises every level's cut
plane and grows the section as keep-out. Warnings, never silence:
undercut bands (3-axis cannot reach under overhangs), levels skipped
(section covers the footprint / allowance ≥ stepDown / frame thinner
than the tool — left standing), dropped chains, model above crown or
below stock bottom. Phase B raster finish is the follow-up op.
**Fine-mesh support (2026-10-25, from Alice's 12MB relief-coin session):**
waterline slice contours simplify at 0.01mm before the Clipper offsets —
and the pocketing regions too (the real bench culprit: 235k-tri coin,
50 levels went 19.6s → 1.1s; sliceAtZ gained an optional Z-span triangle
index, `buildZIndex`, exact-equal results pinned); feature detection caps
at 100k triangles (decimated vertex-clustered copy for picking only —
display and cutting stay full-res) and never emits sub-0.1mm features
(edge-tracing §1 "size floor"). Generation itself is still synchronous —
the Phase B Web Worker is the cure if Recalculate on fine meshes stays
painful. The rough stops at the MODEL'S SILHOUETTE + a boundary margin
(default tool Ø + allowance + step over — the moat is two tool passes
wide, so its tool-center track keeps a step-over of width even at the
widest-section level; Ø + allowance alone is exactly one pass wide and a
fine mesh's ±0.05mm wall noise pinches that track into a ring of
sub-tool arcs — plunge-cut-plunge around the perimeter, the 2026-10-25
coin session) — for the cut-out profile to ride in; the earlier
footprint semantics milled all waste around a small part. Pocket passes
shorter than the tool's own Ø are DROPPED as sliver noise (pocket2d's
optional `minLoopPerimeter`; the stock they would take is thinner than
the tool — left standing for finishing, warned once per run), and
waterline slice contours are normalized CCW at the single consumption
point: a mesh with inverted facet windings slices to CW contours, which
the keep-out offset would otherwise SHRINK — the rough would eat its own
allowance and gouge the model. The default step-down floors at 0.5mm so
it never self-skips against the 0.2mm allowance default, and the ladder
ENDS at
the first moat-only level (widest section — a rimmed coin stops at its
rim, honestly noted; the cut-out below is the profile op's job). A
RIMLESS relief (surface descending to the stock floor) legitimately
roughs to the floor and would sever the part: waterline therefore also
carries TABS — keep-out bridge boxes at silhouette arc positions
(count/height/length, defaults 3 × 0.5mm × 3mm; height measured above
the roughing floor `floor+allowance`), subtracted from every level below
the bridge top, never influencing the stop check.

**Phase B — Raster finish (3D, 3-axis)** — new pure core
`src/cam/relief.ts`: (1) dense surface heightmap via BVH raycasts
(**three-mesh-bvh, MIT — add when this phase starts**; per-cell
`raycastFirst` is the v1 path, triangle-splatting only if profiling
demands); (2) per-tool compensation = grayscale DILATION of the
heightmap with the tool's kernel (ball → hemisphere, flat → disc; no
per-sample closest-point queries); grid pitch ≈ stepover/2; (3) cut only
where the dilated surface sits below the stock crown (no air cutting);
(4) serpentine passes, stepover from a scallop-height target
(s ≈ √(8·r·h)); (5) `Move[]` IR out, G94, entry-safety convention
(travel at height, descend at destination); preview + estimate pick it
up as ordinary moves.

**Phase C — 4-axis relief** — the same core in the unwrapped (x, θ)
frame: dexel r(x,θ) = surface radius per cell (rays outward from the
rotation axis; BVH-accelerated), same dilation (unwrap distortion is
small while tool ≪ stock radius — carry a small safety margin until cuts
say otherwise), stock = the bar (cut below stock radius only). Three
path strategies, all through the existing spiral-family emission:
- **horizontal** (default): cut along X at real feed, rapid the A step —
  time spent in fast linear motion;
- **vertical**: continuous A cutting — every coordinated move runs G93
  and clamps at the ~6.6 RPM rotary ceiling (one full wrap ≈ 9s floor);
- **spiral wrap**: X advancing continuously while A turns — the strategy
  Makera does NOT have, and our G93 machinery already cuts it.
Blocked-cell reporting: cells the dexel cannot reach (radial shadow,
normal ∥ X) are REPORTED ("these cells are unreachable: …"), never left
as silent mystery material. Cylinder stock + on-axis model only.

**Phase D (later, exactness)** — machine-frame gouge + shank/holder
collision validation per pose (three-mesh-bvh `closestPointToGeometry`
against a ball+shank+holder tool mesh); classifies blocked cells
(shadow / collision / normal-parallel-to-X). Prototype torture part: a
sphere offset from the rotation axis (star-shaped cells, a genuine
radial shadow, shaft-clearance grazing — all in one STL).

**Architecture rules for all phases:** the heavy core is PURE
functions (grid in → Move[] out) so vitest covers it without worker
harnesses; the Web Worker is a thin shell streaming progress + preview
points (the dexel grid is this app's first genuinely heavy computation
— ~300k raycasts on a fine grid). Generators emit Move[] IR only —
NEVER G-code strings; G93 inverse-time with F on every line for any
A+linear move, A accumulates with G92.4 wrapping, cutting feeds clamp
at the rotary ceiling — all pinned facts, all owned by the post.
License: three-mesh-bvh MIT ✓; **kiri-moto MIT ✓ (verified 2026-10-24 —
a browser-native CAM engine we are ALLOWED to read: point the cam-kernel
agent at its slicing/offset/gouge patterns)**; OpenCAMLib stays parked
(LGPL WASM port is a project in itself; nothing above needs it).
Honest limits on the box: 3-axis recreates only the reachable surface
(no undercuts, period); 4-axis heals most overhangs but not
normal-∥-X surfaces nor concavities narrower than the tool; fine-pitch
4-axis relief at the rotary ceiling is SLOW — surface an honest time
estimate before anyone commits a 3-hour bar.

**Open for the build session:** 4-axis roughing strategy (face the
cylinder + finish directly into round stock, vs. an unwrapped-frame
waterline rough); adaptive Δz levels; slope-split finishing; how the
long-running worker integrates with the recalc/preview pipeline.

## License policy (hard rule)

Project license: MIT. Code may be taken only from MIT/BSL/Apache/LGPL
components kept as separate swappable modules. **Never paste code** from
AGPL (PrusaSlicer/OrcaSlicer Measure.cpp — algorithm only) or GPL
(jscut, Blender CAM, PyCAM, community controller). CI license scan once
deps grow.

Key deps: three.js (MIT), Kiri:Moto/grid-apps (MIT, donor), opencamlib
(LGPL-2.1, WASM via npm @opencamlib/opencamlib), occt-import-js (LGPL-2.1,
STEP), clipper-lib (BSL — the pure-JS Clipper port, used synchronously
behind the swappable wrapper src/cam/clipper.ts; a Clipper2 WASM can
replace it there without touching generators), manifold (Apache-2.0,
later).

## Phases

| Phase | Deliverable | Acceptance | Est. (part-time) |
|---|---|---|---|
| 0 | Repo, viewer, post skeleton, facing generator | `npm test` green; drag an STL; face a virtual Ø50→Ø40 cylinder emits valid G93 gcode | done in scaffold |
| 1 | Stock setup, model placement, tool library, flat 2.5D ops + indexed 4-axis + edge/hole tracing + slice-pocket, toolpath preview | cut a sign job and an indexed pocket job on real hardware | ~2–3 months |
| 2 | Cylinder canvas: facing, threads, wrapped grooves | cut a V-bit thread that mates with a nut; face a cylinder to ±0.05 mm (facing done in the scaffold; spiral carve AND threads landed 2026-10-20 — the acceptance cut now has its ops) | +4–6 weeks |
| 3 | 3-axis custom (opencamlib) | 3D part roughed+finished | ~6–10 weeks, may slip to v2 |

Golden-file tests pin the post-processor output for every op against the
[community G-code reference](https://carvera-community.gitbook.io/docs/firmware/supported-commands/gcodes).

## Risks (top 5)

1. G93 correctness — every-line F, mode tracking, degrees-in-planner: golden
   tests before any machine run.
2. A RPM ceiling makes rotary ops slow — honest time estimates in UI.
3. Thread fit is empirical (V-bit depth) — ship a test-coupon generator.
4. Axis-Z / radius calibration accuracy drives everything — guided touch-off.
5. Firmware dialect drift — thin post, golden files, track community docs.

## Reference state kept OUT of this repo

`reference/` is gitignored and stays local: checkouts of the community
controller/firmware/profiles (for reference only — their licenses do not
permit redistribution here) and the planning-phase analysis notes.
Published ground truth for the dialect lives in `examples/` (mill-tested
MakeraStudio exports) and `docs/makera-dialect.md`.