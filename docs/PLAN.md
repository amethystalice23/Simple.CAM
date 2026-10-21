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
| Flat pocket / profile / drill / engrave | 2.5D | Clipper2 offsets (see docs) over sliced depth intervals; drill from circle-feature detection |
| Slice pocket (3-axis) | 2.5D | one `sliceAtZ` cross-section at the op's slice plane → `'outside'` profiles around it (tool-center path offset out by tool Ø/2 + allowance) / `'inside'` pockets its interior, over the start→end band; floor via the ⇩ pick; violet section-plane overlay + drag handle (docs/edge-tracing.md §2, §5) |
| Flat chamfer (V-bit) | single-pass flank | two modes. **add**: the cone flank is placed through the selected circle or face outline (a face's border loop becomes the path; a loop that circle-matches a feature resolves to that analytic circle — selecting the hole rim or its face gives the same path) — a new chamfer through a sharp edge. **existing**: the model already has the chamfer — the bit rides the modelled face, and direction selects which end was clicked: **up** = the bottom edge, traced exactly (depth ignored — the bit cuts up and out from there); **down** = the top edge, the tip slides down-and-in by depth·tan(angle/2) along the modelled face, landing on the bottom edge when depth matches the model. User side option (inside/outside — geometry can't always tell) and depth along the wall |

Later (v2+): 3-axis custom roughing/finishing via opencamlib WASM
(drop-cutter/push-cutter). Parked: dexel 3D relief on cylinder.
Parked (noted 2026-10-20): a per-op **waste-stock toggle** — ON lets
paths run off the stock edge (clean exits on tight stocks; the slice
pocket's outside mode could clear to the stock wall when the frame fits
the tool), OFF clamps regions within the stock footprint
(docs/edge-tracing.md §2).

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

## Reference state retained in this repo

`reference/` — binary analysis of MakeraStudio from the
planning phase: evidence JSONs (xrefs, decompiles, string searches proving
there is no plugin API), the local analysis tooling (`tools/ghidra`) and
`env.sh` for running further queries. See `docs/analysis notes.md`.