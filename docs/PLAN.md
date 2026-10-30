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
| Thread mill (3-axis, SPEC 2026-10-28) | helical interpolation | `threadMill.ts`: internal AND external threads with a single-profile thread mill — helix in machine XYZ, no A, G94 throughout. MILL-TESTED GROUND TRUTH: examples/MakeraStudioGHM9_Stage3_TOP_20261003132726.nc `[T6]14ccw thread` — her GHM9 part, an external M14×1 CCW cut with a Ø4.75 M6-form mill. Their proven EXTERNAL cycle, copied verbatim: approach outside the boss at Rc + clearance → plunge beside the boss to the thread's BOTTOM (staged feeds, F1000 bulk / F100 near material) → RADIAL feed in to Rc (no arc lead-in — the entry notch IS the bottom groove) → ASCENDING helix, one pitch per revolution, ~1°/segment (chord 0.15mm) at the cut feed → straight rapid up at the top (nothing stands above) → THE WHOLE CYCLE RUNS TWICE (their spring pass = a full second thread pass). Path radius pinned: 8.76 = d3/2 + toolR with d3 = ISO 724 EXTERNAL minor (nominal − 1.2268·p, root-arc-truncated — matches to 3 decimals, deliberate); INTERNAL mirrors with tips at the major: Rc = nominal/2 − toolR + tolerance, external Rc = d3/2 + toolR − tolerance; prep sizes ISO-true (bore at d1 = nominal − 1.0825·p, boss at nominal). Hand convention verified by the same file: "ccw" = left-hand = helix CW-viewed-from-above ASCENDING (z decreases with CCW rotation) ⇒ right-hand = CW-descending, as derived. ANTI-PATTERN, pinned by regression test (Alice's report, 2026-10-28 — "at some point the makera output did something silly and plunged to start subsequent cuts without allowance for the thread already there and gouged the thread face; they fixed this in later versions"): the 09-11 example cut a RADIAL LADDER (helix levels at 9.44 → 9.1 → 8.76) and re-plunged between levels AT THE CUT RADIUS — a vertical feed descent straight through the thread it had just cut; the fixed 10-03 cycle re-approaches from outside the crest first. Our cycle inherits the fix: every Z-descending move (spring pass, each multi-start, each target) starts from clear space — the approach point outside the crest (external) or the bore center (internal) — asserted over the whole move list by the descent test. INTERNAL cycle (no example exists — mirrored): approach at the bore CENTER, plunge inside the prep-cleared bore to the thread bottom, radial out to Rc, ascend; retract per Alice 2026-10-28 ("move aside… as long as there is hole diameter to do so, because we would have had a preceding pocket operation to clear it; if the tolerances are getting tight, follow the spiral back out"): aside — radial in to the bore center + straight lift — when the cleared bore leaves room (boreR − toolR ≥ margin; a sloppier prep or a slimmer tool — her Ø4.75 in an M14 bore has 4mm of room), else FOLLOW THE SPIRAL OUT: keep the helix going fraction of a lap past the mouth until the form is clear of the face, needing NO radial room (a straight lift while engaged drags the tooth through the thread teeth — the tight case; the bore-sized Makera mills with ~10µm aside room always exit this way). Multi-start = starts helices offset one pitch, lead = starts×pitch descending per rev; segments = 0.15mm chord target (floor 64, cap 512/rev); tool pitch validated strictly against thread pitch — and the panel SETS AND LOCKS the pitch from the tool while a fixed-pitch mill is selected (Alice, 2026-10-28: "as these threadmill bits have fixed pitch"; a pitch-less kind keeps it editable, defaulting to the ISO coarse on tool change). The thread perception is named cw/ccw like the rotary Thread op (Alice: "dont use right-hand/left-hand as the other thread tool uses cw/ccw, so be consistant" — 'ccw' = left-hand, the 14ccw example). RADIAL LADDER (Alice: "for tougher materials you might need to do this in multiple passes"): a Step over field (0.05mm increments) — 0 = the full form in ONE radial pass (the Makera cycle), > 0 splits the radial span into even levels, each a full bottom-up thread at its own radius, deepest last, the spring repeating the final level; the sim classifies thread removals against the ladder's step (or the full form depth) so a correct thread paints fine. The PREP insert's allowance is FORCED ≥ 0 (her first prep computed nominalR − bossR = −0.01 from a boss a hair over nominal and the profile errored: "dont warn that it must be >= 0, force it to be" — profile2d clamps, not throws). TOOL MODEL (Alice, 2026-10-28, twice-corrected — final form shop-checked against global.makera.com/en-gb/products/thread-milling-bit-6mm-shank): thread mills come in three kinds — 1-tooth, 3-tooth, and full-thread (the last is internal-only tapping, not in the Makera set). The Makera 1/3-tooth mills: a 2mm TOOTHED BAND (LCF) at the tip, then a long thin CUTTING LENGTH — the taper before the shank (18mm on the M6, 24 on the M8; shop overrides in the import) — then the SHANK (Ø6 on the M6/M8, 1/8″ on M1–M5; SFDM was RIGHT all along, the 3.175 "neck" clamp was the wrong reading of "long neck"), OAL 38/50. fluteLength carries the CUTTING LENGTH, so the full-depth helix keeps the shank clear: EXTERNAL — the shank crosses the crest radially unconditionally (Rc − shankR < crestR always), so a thread deeper than the cutting length throws (the shank would sweep the stock beside the thread); INTERNAL — the thread is capped at cutting − one pitch when the shank misses the bore. The OVERALL LENGTH caps the thread below the collet margin (OAL − 15mm). `flutes` = the TOOTH count ("there are no flutes, the teeth appear in only one spot on the circumference"): a 3-tooth is HARD-LOCKED to its pitch (teeth must ride successive turns of one groove), a 1-tooth cuts ANY pitch; records with no count read locked. The SIM classifies a thread's removals against the FULL THREAD LENGTH (one axial pass by tool design — her report: "wether i set step over of 0 or 0.1mm gives a wall of yellow"; the radial ladder never changes axial engagement), and models the tool with the cutting length as the flute — the 2mm-band record put the Ø6 shank 2mm above the tip, inside the stock beside every full-depth thread. The prep insert runs 1mm past the thread floor (form clearance below the last turn). PROFILE ALLOWANCE SPLIT (Alice, 2026-10-28 night): "allowance i dont want to change as it is height as well as width, which would mean unseen consequences" — the profile's single allowance becomes **Bottom allowance** (floor stock, forced ≥ 0) + **Side allowance** (RADIAL, SIGNED — negative steps the tool-center path INSIDE the contour, turning a boss down past its modeled Ø); a diameter field was rejected ("not only circular features"), offset-on-top-of-allowance as confusing. normalizeJobOps migrates old saves (single allowance → both). The THREAD PREP INSERT prefills `sideAllowance = (nominal − 2·tolerance)/2 − bossR` — the ISO-fit crest target, BOTH ends from the THREAD (nominal + tolerance), the start from the resolved boss: "the feature on the thread might not be the same as the thread diameter set" — so the neck rides the reduced crest at zero clearance and the red streamers stop (the internal pocket prep analogously: allowance = boreR − d1R, clamped ≥ 0 — a pocket cannot grow its region). Her job now generates clean end-to-end. DEPTH SEMANTICS CONFIRMED (Alice, 2026-10-28 night): the boxes anchor at the STOCK CROWN like every op, and that is what she wants — "i genuinely wanted thread from the very top of the stock to 9mm down… i moved up 1mm from [the datum] to allow for the runout that the facing op would give us". The SELECTED FACE IS JUST A DATUM: on a model that already carries the finished thread form, the right-Ø feature may sit at the base of a modelled outward chamfer where thread meets body — start 0 from the crown is the legitimate setup (the prefill fills Ø/pitch/side; the depths are hers). Her production workflow for the GHM9 adapter: thread end in the 4th-axis vice → rotary-mill the flats half → re-fixture vertical in 3-axis → mill the outer thread (this op) + pocket the through hole. THREAD END TREATMENT (her ruling, 2026-10-28 night — answering the transition question): EXTERNAL threads NEVER fade — the leading end (screwed into something) is threaded FULL FORM until it falls off the face, then a CHAMFER BIT dresses the face, 'possibly combined with an end mill to clear some of it down to the inner radius' (root-Ø relief so the chamfer has room); 'it is sadly impossible to inset the thread so that it slowly disappears… and give a tapered start' — the best extra is 'mill some of the peaks off with an endmill afterwards' (crest-dressing). The trailing end at a shoulder: EITHER pre-cut a chamfer/undercut down to the thread's minor Ø in advance (the last turn runs out into it), OR thread down until it butts the wider piece (a partial last turn). FADE-OUT / FORM RUNOUT IS AN INTERNAL-ONLY FEATURE — only inside threads can fade, harmlessly into the bore wall where nothing must engage; PARKED until an internal job wants it. Makera's own Stage3 flow confirms the recipe: the 14ccw thread is followed by [T4] chamfer ops (Inside/Outside). No generator feature needed — the external treatment composes from the existing chamfer/profile ops. Flute check internal: depth ≤ fluteLength when the shank oversizes the bore (loud error). The panel's "Add prep toolpath" INSERTS a prefilled op before the thread (Alice 2026-10-28; Makera's own prep on the same part was a flat-endmill contour around the boss): external → a PROFILE turning the boss to the major Ø (side outside, clear-to-stock, allowance = nominalR − bossR, negative to turn down); internal → a POCKET opening the bore to d1 (allowance = boreR − d1/2); nominal-Ø edit prefills the ISO coarse pitch like the rotary op |
| Spiral carve (wrapped groove, STARTED 2026-10-20) | parametric | `spiralCarve.ts`: multi-start helices about the stock axis at a user angle off circumferential (90° = axial); depth ladder retraces the same groove per level (sweeps alternate, A returns along the helix); width > tool Ø fans parallel passes; X+A sweeps G93 from the rotary limit; strand phases follow the index datum; setup ghost + groove marks in the viewport (docs/edge-tracing.md §5). Archimedean/straight/cross-hatch still to come |
| Flat pocket / profile / drill / engrave | 2.5D | Clipper2 offsets (see docs) over sliced depth intervals; drill from circle-feature detection. Profile (and slice-pocket outside) carry **TABS** (2026-10-25, Alice's cut-out workflow): N auto-spaced hold-down bridges (count/height/length, defaults 3 × 0.5mm × 3mm) — deep levels cut spans between them, shallow levels cut through; arc-length placement never straddles the loop seam. The waterline rough needs none: its upper-shadow keep-out plus the widest-section stop make it provably unable to free a part (2026-10-25, tabs removed). Pocket and Profile ops carry a **cut-over toggle** (2026-10-28), with split semantics settled by Alice the same day: pocket ON = a **deliberate step-over perimeter around the defined area** — the cut REGION grows by one step-over before the tool-radius inset, so the swept cut extends exactly one step-over past the selected outline (clean past boundary drop-offs — her flat-on-the-barrel: clear past the horizon so the transition to the curve is crisp, no rim skin; "if you permitted the step-over, you already vouched nothing of value sits within it") and the stock clamp dilates the same way; OFF = the cut stops at the selected outline and clamps to the stock. Profile — a single-cut op — keeps ON as **permission**: the loop stays intact even where it runs out of stock to cut through, OFF clips the wall pass to open spans at the stock edge. |
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

**"Finishing pass only" (2026-10-26, Alice's call — the rough/finish split
is the user's artistic choice per op, never implicit in the op kind):** one
checkbox on every op with a depth/radial ladder — Pocket, Profile, Slice
pocket, Face cylinder, Spiral carve, Thread, Engrave, Cylinder chamfer,
Raster contour, Waterline. Checked = skip the ladder and cut only the
finishing pass at the final depth, assuming the bulk is already cleared (a
roughing op or a previous run); the Step-down field hides while checked
(the explicit version of the old start = end trick). Ticking the box ON
also ZEROES the op's allowance (the ops that carry one — pocket/profile/
slice-pocket/waterline/raster's allowance, face-cylinder's finish
allowance): a finishing pass cuts to size, and the allowance was roughing
stock for exactly the ladder being skipped; the user can set it back
afterwards, and unticking restores nothing (Alice's 2026-10-26 call).
Per-op mechanics:
pocket/profile/slice-pocket collapse zLadder to one floor level;
face-cylinder gets a real generator option (its rough-level fallback would
otherwise force two passes); spiral/thread/engrave/cyl-chamfer collapse
their depth ladders via a full-span step-down (thread keeps its spring
pass). The **waterline's semantics differ** (Alice's design): scrub only
where the tool TOUCHES THE MODEL — per shaping level the clearing region
is the contour band around the keep-out (every section ring: walls,
islands, interior contours; width tool Ø + step over) UNION the FLATS:
`section(nextCut) − shadow(cut)` grown by the tool radius — the
horizontal surfaces exposed between this slice and the next, touched from
below within one step-down. Everything else is free space the rough
already cleared — no waggle. The BELOW-CHECK RUNS FIRST (Alice's
"it ignored the taller features" fix, 2026-10-26): a level whose cut
plane has no section — including the level just above the model top,
where the tall features' top surfaces sit within a step below — still
scrubs the top slab through its flats; a level is skipped only when it
touches NOTHING (side empty AND below empty). The level where the ladder
bottoms out (moat-only / the floor) keeps the FULL region, the waste
clearance the cut-out profile rides in; the step-down stays visible
(wall-finish level density); the stop rule and warnings run on the full
region exactly as in roughing mode. The allowance-skip (`cut ≥ bandTop`)
is a ROUGHING concept, suppressed in finishing mode — the step-down is
pure rung density and the allowance a raise-plus-offset, "entirely
unrelated" (Alice); a finishing level with no band scrubs AT its cut plane
(pocket2d topZ clamps to the cut). Physics
honesty: a flat is scrubbed at the level plane ABOVE its surface (a
constant-Z pass cannot ride an arbitrary height), so a sub-step-down
skin can remain on it unless a plane lands exactly on the surface — the
raster (or a finer step-down) finishes it. The **raster's old "step down 0 =
single surface pass" convention is REPLACED** by the checkbox: old saves
with stepDown 0/absent migrate to checked (jobFile normalizeJobOps), new
raster ops default to checked with the preset step-down carried for the
unchecked ladder. Excluded: Drill (pecking is chip clearance, not
rough/finish), Chamfer (already single-pass), Index.

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

**Phase A — Waterline contour (3D; 'rough' vs 'final pass' is the user's allowance choice)** — cheapest, mostly existing
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
rim, honestly noted; the cut-out below is the profile op's job). UPPER-SHADOW
keep-out (Alice's rule, 2026-10-25, from the 4-axis trial): each level
clears `reach − union(every section at/above the cut plane)`, so
overhangs are keep-out a vertical tool must respect — a section-only
keep-out programmed the tool under overhangs and into the material
(the old "rimless relief severs the part" scenario was exactly that
lie: clearing under a dome it could not reach). Consequence: the upper
shadow at the deepest cut plane IS the whole silhouette, so that level
is always moat-only and the moat-only stop is structural — the rough
can provably never free a part, and the waterline TABS built for the
severing scenario were removed 2026-10-25 (profile/slice-pocket tabs
stay). The upper shadow is sampled at the ladder's planes; up-widening
steeper than the allowance inside one unsampled gap can still exceed
it — the undercut warning plus the preview are the guard there. 4-axis
INDEXED mode is allowed (Alice's call, 2026-10-25, over the initial
hard gate): the datum rotation maps the part into the cutting frame
and the ladder self-limits — bounded by the model's own floor in that
orientation (never the stock bottom; the holder below the part stays)
and by the moat-only stop at the widest section (a vertical-sided part
stops at its top: a constant cross-section is one full-depth profile
pass, not N waterline levels). Multiple waterline ops with index
rotations between them compose — each bounded by its own orientation's
geometry, and the rough can never free the part. Continuous/multi-
orientation rotary roughing remains future work.
**Travel height (2026-10-26, the knight diagnosis):** inter-pass rapids
travel at the STOCK CROWN + clearance, never at band-top + clearance —
the uncleared stock outside the clearing region and the upper-shadow
keep-out islands inside it both stand to the crown, so a lateral rapid
at band-top height plows sideways through them (Alice's real 4-axis
knight: 34,427 gouged voxels, worst single move 14k — after the fix, 3,
all sub-0.2mm³ approach-graze noise). pocket2d gained `travelZ` for this
(PocketOp field, default unchanged for every other caller); pinned by a
waterline test. **Approach plane (2026-10-26, the sim yellow-streak fix):**
pocket2d's per-loop approach rapid descends to APPROACH_CLEARANCE above the
STANDING material — `max(levelZ, previous level's cut) + 0.5`, topZ + 0.5 at
the first level — never `levelZ + 0.5`: a step-down taller than the 0.5mm
clearance (her coin: 0.8) had every loop-start rapid plowing the band, which
the carve sim painted as a yellow streak at each contour's starting plunge
(16 rapid moves, 1898 voxels → 0 after the fix; pinned by a pocket test).
**Tail-stock cut-over (2026-10-26, Alice's toggle):**
the waterline panel carries "allow tail stock cut-over" — skips the
footprint clip on the clearing reach so the boundary pass may run
OUTSIDE the declared stock instead of pinching off at its edge (the
coin's near-boundary artifacts; tooltip: "This allows the tool tip to
pass outside of the defined stock's area"). Off (default) keeps the
tool inside; the unclipped reach is still silhouette + margin, so the
rough never wanders past one margin of the model's own shadow.
**Clear excess stock (2026-10-26, Alice's 4-axis ask):** `clearToStock`
on the waterline panel makes every level's reach the whole stock
FOOTPRINT (footprint − keep-out) instead of the silhouette + margin —
the waste is cleared right out to the stock edge as the ladder
descends, so no shelf of uncleared stock survives outside the model's
column (her rationale: in 4-axis a leftover shelf can bottom out the
collet/head, and indexing can break uncleared chunks loose). The
keep-out, the moat-only stop, and the never-sever guarantee are
untouched; the option wins over tail-stock cut-over (the clear NEEDS
the footprint), and a model casting no shadow inside the stock still
roughs nothing — never a license to mill the whole blank.
Probe follow-up (her knight, same day): "left a very thin layer at
min and max X" — the model's X tips sit 0.9mm from the stock's end
faces (0.7 after the allowance): a slot NO tool fits, and shearing it
from beyond the end would gouge the keep-out — cut-over cannot help,
the obstacle is the model (the surrounding lanes ARE swept clean).
The honest fix is a warning, computed per clear-excess level as the
morphological OPENING of the region by the tool (erode toolR, regrow
toolR = exactly the disc-swept area): region − opening over 1mm²
warns "stock the tool cannot reach — a gap narrower than the tool
(e.g. between the model and the stock end); left standing". **Max depth
(2026-10-26, the 4-axis short-tool throttle):** `maxDepth` mm below the
crown stops the ladder ahead of the model floor — her knight's A=0
shelf collides the collet on shorter tools, and the sim's red marks had
no op knob to prevent; limit each orientation's op to the depth its
tool can reach alongside the wall (null/0 = to the floor, old saves
byte-identical). The waterline panel's info block is split: a short
operational hint + the long-winded detail demoted to an italic, dimmer
`.hint.detail` (Alice's wording: "too much verbiage — the debug section
can stay, but italicize it or give it a subtly different colour").

**Phase B — Raster contour (3D; the paired surface pass — 'finish' is an allowance choice)** — new pure core
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
**IMPLEMENTED 2026-10-25** — `rasterContour` (src/cam/relief.ts) + the
`rasterContour` op (allowance + step over — rough-vs-finish is the
allowance choice, exactly like the waterline contour; grid pitch
stepOver/2 derived at generation, serpentine rows at the step over).
The dilation semantics settled by testing: the compensated surface at a
cell is the highest TOOL TIP touching the model with the tool CENTER
there (max over kernel offsets; ball kernel z = √(r²−d²) − r — the
ball's equator grazing a point hangs its tip r below it, which is
CORRECT and why a relief needs its floor: the stock-bottom clamp is the
honest floor around an open-shell model). Flat/bull/vbit/corn all ride
the flat disc (conservative — a vbit's cone sits inside its Ø disc).
Entry-safety convention per segment: travel at safe Z, descend at the
destination, feed the approach stretch. Deep-plunge warning (deeper than
2mm below the crown → "run a waterline contour first") — this op assumes
the rough ran; the allowance lifts the whole compensated surface, so a
waterline at allowance X followed by a raster at allowance X nets the
model surface exactly. 4-axis indexed like the waterline op (the datum
rotation maps the part into the cutting frame). **Row angle (Alice's
2026-10-25 call): `angle` degrees, default 0 = rows along X — arbitrary
angles (negatives fine); 90 = Y rows, and a 0°+90° op pair gives the
cross-hatch "both directions" finish. A GRID-FRAME rotation, not a mesh
rotation: a Z-rotation commutes with the downward raycasts, so the same
BVH is sampled on a rotated grid and machine coords emitted at the
edges — angle 0 reproduces the unrotated grid byte-identically, and the
isotropic dilation kernel is untouched. The Phase C rotational op
composes from these same directions.** CLEAR EXCESS STOCK + TAIL-STOCK
CUT-OVER (Alice's 2026-10-26 ask — both waterline options carried to
the raster): `clearToStock` turns footprint cells whose compensated
surface is AIR into WASTE — they clear flat at `clearFloorZ` (the
caller passes the MODEL's own floor, max(modelMinZ, stockBottom) — the
same plane the waterline ladder bottoms at), so the pass finishes the
whole stock out to the edge; model-adjacent cells keep the DILATED
surface, which is what makes the raster the right tool for the
waterline's unmachinable end slots — the kernel's dilation clears
them exactly as deep as the disc can reach without gouging, no region
math at all. `cutBeyondStock` grows the waste domain by tool Ø/2 + a
pitch so row CENTERS may cross the stock edge (clean exits); without
it the centers stay inside the footprint. Both optional: absent =
byte-identical to before. Not yet: the Phase C
unwrapped (x,θ) frame; the Web Worker hosting (generation is
synchronous — the ~300k-raycast fine-grid case is the worker's charter);
scallop-height step-over derivation (a plain mm knob for now).

**Phase C — 4-axis relief (rotary carve)** — the same core in the unwrapped
(x, θ) frame: dexel r(x,θ) = surface radius per cell (rays outward from
the rotation axis; BVH-accelerated), same dilation (unwrap distortion is
small while tool ≪ stock radius — carry a small safety margin until cuts
say otherwise), stock = the bar (cut below stock radius only). **ONE op
does roughing AND finishing** (Alice's call, 2026-10-26): the ladder
semantics are Makera Studio's — a COMPLETE full-wrap sweep at each depth
level (constant cut radius, skipping cells whose model surface rises
above the plane) before descending to the next, and the ladder ends at
the first level with NOTHING LEFT TO CUT (the cut radius reaches the
dilated surface everywhere — below it is the finishing pass's job, so a
deep part legitimately takes multiple full wraps). `finishingOnly` = the
same toggle the other ten ladder ops carry: skip the ladder, cut only
the final surface pass. Three path strategies per sweep, all through the
existing spiral-family emission:
- **horizontal** (default): cut along X at real feed, rapid the A step —
  time spent in fast linear motion;
- **vertical**: continuous A cutting — every coordinated move runs G93
  and clamps at the ~6.6 RPM rotary ceiling (one full wrap ≈ 9s floor);
- **spiral wrap**: X advancing continuously while A turns — the strategy
  Makera does NOT have, and our G93 machinery already cuts it.
  **2026-10-28 BUILT (Alice, un-parking it: "really what i expected was a
  result very similar to vertical except each vertical twisted very
  slightly to the side to form a spiral"): MULTI-COIL — lead = stepOver
  per REVOLUTION, each revolution sweeping the full circle across a
  one-step-over band of columns, the coils tiling the axial span the way
  vertical's rings do; θ indexed to the sampling grid (one grid row per
  sample, X advancing stepOver/nTheta per row, both snapped). Rough runs
  FOLD: X and A advance linearly together, so ONE G93 move per run IS the
  coil (machine-interpolated); the finish emits every grid sample (the
  chord lesson). Runs skip standing stock with crown transitions (comp ≥
  level means the plane sits INSIDE material — riding would be a plow);
  A only ever advances. Her Knight job: 14.2k moves, the full 0.6mm
  carve 0 yellow / 0 red. The v1 single-revolution "draped string" never
  touched most of the model — gone.**
Blocked-cell reporting: cells the dexel cannot reach (radial shadow,
normal ∥ X) are REPORTED ("these cells are unreachable: …"), never left
as silent mystery material. Cylinder stock + on-axis model only.
Generation runs in the app's SECOND Web Worker use — the genWorker
(relief batch, 2026-10-26) already hosts the heavy kinds; rotary carve
joins HEAVY_GEN_KINDS (its ~300k outward raycasts are exactly the
worker's charter).
**2026-10-26 field-report fixes (Alice's first run): (1) the
blocked-cell detector originally used THREE.Raycaster.intersectObject,
which IGNORES the boundsTree and walks every triangle per ray — 3-4
MINUTES on the coin (both strategies; it runs before any strategy).
Fix: MeshBVH.raycast (all hits, the same accelerated path as
raycastFirst) → 0.4s, the raster's cost class. (2) The sweeps
originally cut EVERY grid line (pitch = stepOver/2) — a 1.6mm step over
cut at 0.8mm, double the passes. Fix: pass strides (rowStride/ringStride
= round(stepOver/pitch), arc at the stock radius), the raster's stride
convention. Also: horizontal/vertical are renamed "Rotary contour" in
the UI (Alice's call — they ARE the raster on an unwrapped shape).
SECOND ROUND (same day, her knight run — "contours faintly similar but
not the same, a Z bulge for the head that also bulges sideways"):
(3) the dilation's angular offsets originally converted to arc at the
model's MIN surface radius — on the knight (core near the axis, head at
15-22mm) that smeared the tool kernel ~10× too far around the
circumference, lifting the path sideways around every feature and even
painting PHANTOM cut cells into air near the axis. Fix: PER-SOURCE arc
conversion (each sample rides its own circumference — physically
exact), scan window bounded at the stock radius. (4) The sweeps
retracted to the CROWN between every ring (Alice: "read the height you
are moving to on the next ring — up then across, across then down").
Fix: skim transitions (goCut): lift only to the tallest thing the rapid
legs cross (rotate leg at the old column, traverse leg at the new row,
scanned over the compensated map with air reading as standing stock) +
0.5mm; the plunge charge is now the honest emitted descent. Crown is
entry/exit only. Pinned by tests: the skim bound + the per-source
angular reach. THIRD ROUND (same day, her knight sim run): (5) the
"complete sweep" was implemented as PARTIAL bands hugging the part
(runs of cells with comp < plane) — waste stock (air cells: no model
within the tool's reach) was NEVER cleared, leaving "lots of leftover
stock close to the outer edge" that the finish's flanks then rubbed
into walls of yellow. Fix: COMPLETE Makera passes — the grid spans the
FULL stock axial span and WASTE cells target the WASTE FLOOR = the
model's deepest compensated point (the raster's clearFloorZ =
model-floor analog), cleared by every plane (layers from the CROWN
DOWN) and flat at the floor by the finish. Default on — the op's
charter is "rough + finish the whole bar". (6) The transition legs
originally read the compensated TARGET as the standing height — cells
were credited as clear BEFORE the planes cut them, so skims could clip
the rough's own leftover ledges. Fix: phase-aware standingR (what the
rough has ACTUALLY planed so far; finishingOnly reads targets — the
documented "bulk already cleared ahead" assumption, deep-plunge
warned). (7) The yellow gouge ghost α115 → α26 (~10%, Alice's ask — a
wash, not a wall). FOURTH ROUND (same day, her knight sim): (8) THE
STRIDED θ SWEEP WAS THE "ENTIRE SHELL OF YELLOW" — rowStride=2 left the
intermediate angular rows UN-PLANED at full height, and the tool's own
Ø shaved that skin at FULL DEPTH in one pass (33% of all removals
painted yellow; the x:0 return traverses gouged 530mm³ each). Fix:
nTheta = 2π·radius/stepOver (arc-spaced) and EVERY row cut — a
"row" is an angular position of the PART, not a spatial neighbor; the
only honest θ stride is 1. X-column ring stride stays (a genuine
linear step-over). (9) advPast's %nTheta ERASED the full-circle
advance (jt+1≡jc mod nTheta → 0 steps) — every full-wrap vertical ring
emitted G1 a:0 and cut a POINT ("peculiar spikes"). Fix: raw forward
steps, +nTheta only when negative. (10) skimClearance 0.5 → 1mm.
Post-fix knight sim: gouge-rapids 0 (both), yellow 33% → 7% (plunge
approach overshoot only), red 0-429 (fat-shank contacts, honest).**

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
waterline rough); adaptive clearing (trochoidal — a named contour type to add, with raster contour/waterline contour the family so far); adaptive Δz levels; slope-split finishing; how the
long-running worker integrates with the recalc/preview pipeline.

### True optimized 4D carve (SKETCH 2026-10-28 — the v2 headliner, conversation opened by Alice, to be picked up another day)

Her ask, verbatim: "a true optimised 4d carve, something that gives the
same kind of quality result as 4 way waterline did, but strategically
plans a minimal set of cuts and moves to achieve the same, to plan to
touch every facet of the model its physically possible to reach with 4
axis of motion."

**Why the current ops cannot get there:** waterline/raster/spiral are
all SINGLE-ORIENTATION passes — one fixed frame per op, a silhouette
column cleared from one direction. Multi-orientation work today is
hand-stacked Index ops, each clearing a whole column again including
what the last orientation already cleared, with a full crown-height
retract-and-re-enter between them.

**The core insight: it is a SET-COVER problem, not a path problem.**

1. REACHABILITY MAP — for every (cell, orientation) pair: can a tool
   at that A legally touch that cell without gouging first? Radial
   raycasts per cell per candidate orientation + the shadow map for
   the buried material (the dexel machinery the rotary carve already
   has, re-run over an orientation ladder instead of one A).
2. GREEDY ORIENTATION COVER — repeatedly pick the orientation reaching
   the most currently-uncovered cells, clear that band, re-mark,
   continue until no new cells are reachable. On her knight: the head
   wants ~3 orientations, the body ~2; most candidate orientations
   cover nearly the same cells as the last, and greedy skips them —
   ~3 chosen orientations instead of a hand-tuned 6.
3. MINIMAL-REGION CLEARING per orientation — the move-count saver:
   once B is known to need only cells A missed (the overlap band, the
   under-head flank), do not re-run A's whole ladder at B — clear only
   the DELTA region, skipping levels whose cells are already below the
   plane from A's work. This is the carve kernel's existing per-cell
   "standing material" bookkeeping (standingR), made CROSS-ORIENTATION
   persistent instead of per-op.

**Honest structure of the deliverable:** an op that plans the whole
part (no user-chosen orientations), emits per-orientation band ops as
one move list, and reports the coverage + the unreachable set (the
blocked-cell honesty the rotary carve already has). The roughing
question and finishing question stay separable: cover orientations
first (rough to allowance), then the surface pass per orientation.

**PREREQUISITE STAGES (in order — Alice asked these be noted):**

- **P0 — gen-worker hosting of the rotary generation.** Reachability
  sampling is O(cells × orientations) — a 300k-raycast × 8-orientation
  pass is minutes-class work, and generation is currently SYNCHRONOUS
  on the main thread. The relief batch's genWorker protocol (already
  hosting the heavy kinds) is the charter; rotary generation joins
  HEAVY_GEN_KINDS first. This unblocks interactive use of everything
  below.
- **P1 — cross-orientation standing-material state.** The carve
  kernel's per-cell standing radius (standingR) is per-op today; the
  roughing predicate and the skim/transition planner need it shared
  across a multi-orientation sequence. Pure-core data-structure change
  (grid in, grid out), vitest-covered, no worker semantics touched.
- **P2 — the reachability map as a pure module.** (cell, orientation)
  → reachable/buried/blocked, on the existing dexel + shadowMap
  primitives. Prototype on her knight STL before generalizing: it
  carries a genuine radial shadow (the offset head), an
  axis-parallel flank, and a flat — the torture shapes the Phase D
  sphere was specced for. Validate the map against the existing
  simulator: a cell marked reachable must carve clean at that A.
- **P3 — then the planner:** greedy cover + delta-region clearing
  emitting Move[] per orientation band, reusing the rotary carve's
  entry-safety conventions (pure-Z plunges, skim transitions, A
  monotonic within a band), with per-orientation time estimates
  honestly summed.

**Also parked nearby, unchanged:** Phase D per-pose collision
validation (ball+shank+holder vs rotated model) composes AFTER the
planner exists — validating a hand-stacked op sequence does not need
it, but validating a planned one wants it as the safety net.

**Carve simulator (2026-10-25, landed) — the app's FIRST Web Worker.**
Top-bar "Simulate…" → src/sim worker carves the generated Move[] out of
a voxel stock and the viewport swaps the translucent stock for the
carved chunks, ghosting the model for comparison (Alice's design call;
plan approved same day). Architecture: Cartesian occupancy grid
(Uint8) in the MATERIAL frame (the un-rotated stock at A=0 — the same
frame movesToSegments maps previews into; 4-axis rotates the TOOL POSE
per sample, never the grid), per-pose tool-kernel stamping with
air-skip (columnTop cache: skip columns whose material top is below
the tool's lowest extent) and free GOUGE DETECTION (a rapid that
removes voxels = bad clearance — surfaced as count + first move), 32³
greedy-meshed chunks transferred to the client on dirty. Core modules
pure + vitest-covered (grid/toolShape/poses/carve/mesher/pitch — zero
three.js); carveWorker.ts is the thin shell (cooperative ~8ms slices,
self-driving to the armed target, time-agnostic move-index protocol —
v2 playback = a client clock over the same messages, moveDurations
already pure+tested). KEY LESSON (probe-verified): the pose stream's
modal Z must seed at the TOOL-CHANGE PARK (stockTopZ + clearance, passed
via setup.startZ) — a z=0 seed fabricates a phantom plunge sweep on the
first rapid and phantom-gouges (the coin's "31 gouges at move 1" was
exactly this; after the fix: zero). **3-CLASS CUTTING (2026-10-26,
Alice's spec, superseding v1's rapid-gouge-only detection):** every
removal/contact is classified per voxel — FINE (flute removal within the
owning op's step-down of the pre-move standing surface: unmarked), YELLOW
GOUGE (removed deeper than the step-down, or by any RAPID — "removed,
just not intentionally"), RED COLLISION (shank contact on standing
material: not removed, move counted once). Per-move step-down threads The per-op intended DOC (simStepDownFor, src/sim/stepDown.ts): drill → peckDepth; threadMill → the FULL THREAD LENGTH (one axial pass by tool design); **chamfer → op.depth, the flank reach** — the cone engages its full geometry by design (dressing an edge IS a full-flank cut, no ladder), so reading it against the grid-pitch fallback painted every honest flank voxel yellow (her 2026-10-28 report: "a whole bunch of yellow warnings around the chamfer loops"; both her chamfers went 3374/356 yellow → 0 with the rule); deeper-than-own-geometry removals (a genuine plow) still warn, and rapid removals always do.
from the owning op (App.simStepDown; drill → peckDepth; 0 = one pitch).
The shank solid uses the tool's REAL fields — `shaftDiameter` (default
cutter Ø), `fluteLength`, `overallLength` (default +30) — so red contact
is the actual holder-vs-stock clearance, not a phantom fat shank; and
the shank is BANDS, not one cylinder (Alice's 2026-10-26 T-slot
groundwork: "a head wider than the shaft") — the optional
`headDiameter`/`headLength` fields carry an undercutting head directly
above the flute with the slimmer shaft continuing above it, no tool
type sets them yet; `shankRadius`/`shankTop` span the whole profile so
the kernel's pose AABB covers the head.
**The standing surface follows the pose's FAMILY (2026-10-26, her
two-waterline + 90°-index report: the second op's deliberate passes
painted ALL yellow):** a tool lying along ±Y (a ±90°-indexed op) reads
the Y-LINE ends (grid.columnTopY / columnBottomY, maintained like
columnTop) instead of the vertical columns — its "material above the
cut" runs along the stock's Y axis. Exact for 0/±90; in-between angles
keep the vertical approximation (documented). Probe-proven on the
knight: indexed op 2 went from all-yellow to 1.6k sub-voxel slivers out
of 2.1M removals. Her four-angle follow-up caught the last quadrant:
at **180° the stock is upside down — the tool approaches from BELOW**,
so the vertical family reads the column BOTTOM (grid.columnBottom,
maintained like the rest); the four-angle knight replay is clean at
every angle (A0 2607 / A90 1161 / A180 1093 / A270 138 sliver-class
yellow of 8.19M removals, probe-knight-2ops.ts — which also threads
the index DATUM per op; an earlier draft generated every waterline in
the A0 frame). SIM_BUILD bumped per change (now b6-quadrants) — the
worker build stamp in the Simulate progress line proves which copy is
live (the "still opaque" yellow was a stale dev-server worker serving
the old RGB-stride mesh to the new itemSize-4 attribute: alpha read the
next vertex's R=255 → solid).
**Chunk-stream batching + incremental mesh rebuild (2026-10-26, her
coupon#3 report: "simulation won't run"):** the sim is NOT model-gated —
the Simulate… button gates on previewMoves (recalculated toolpaths), so
a freshly opened job greys it until Recalculate. The real failure was
performance on the coupon's derived 0.1mm pitch (13.4M-cell grid,
576 chunks): the Viewport effect disposed+rebuilt EVERY chunk mesh on
EVERY per-chunk worker message (576 geometries × thousands of
messages), and the worker posted one transferable-heavy message per
dirty chunk per 8ms slice. Fixes: (1) Viewport keeps a built-map (chunk
id → message object) and skips same-reference chunks — rebuilds only
what changed; (2) the worker batches remeshed chunks ~32/message and
gives the flush its own SLICE_MS budget per slice — checked PER CHUNK
(the v1 between-batches check still let a ~130ms mesh burst outspend
every 8ms carve slice; the browser run caught what the headless
kernel pass missed); leftovers stay dirty for later slices, `done`
waits for the drain; (3) the initial full-stock post goes out ~64
chunks per message. Measured: the coupon#3 sim 0.1mm run completes in
36.5s end-to-end (kernel baseline 12s). SIM_BUILD b8-flush-budget.
**Display-pace correction (same day, her "certain layers get left solid
until the end of this op" report):** the flush budget was WRONG — the
carve dirties chunks far faster than a bounded flush clears them
(~2 chunks per 8ms slice vs dozens dirtied), so the backlog aged
upper-layer chunks solid on screen the whole run, catching up only at
the end-of-run drain. The released beta.7's unbudgeted flush always
kept pace (the crawl was the per-chunk posts + the Viewport's
all-meshes-per-message rebuild, both fixed by batching + the
built-map). The flush is UNBUDGETED again — every slice clears all
its dirt, batched; the worker still yields between slices for control
messages. SIM_BUILD b9-flush-unbudgeted.
**TRUE-SPAN CLIP (her four-way endcap report, same day):** the endcap
at the +X end appears at pitches 0.3/0.45 but not 0.25/0.4/0.5 over
the 100mm bar — exactly the non-divisor pitches, where the padded
grid's last X-cells center PAST the end face and were filled as
phantom stock (the cylinder fill never tests x; the box fill takes
the whole grid). Unreachable by every tool (paths stay inside the
stock), the whole last column rendered standing proud of the end —
a full disc-face endcap, ~600-900mm³ fabricated vs ~38mm³ honest end
slot at divisor pitches (probe-knight-endcap.ts pitch sweep). Fix:
VoxelGrid zeroes every cell whose CENTER lies outside the stock's
true span — what renders is what can be cut; the straddling-but-inside
cells render flush within the bar. Grid-test pinned on cylinder AND
box (all axes).
The ghost overlay meshes per-vertex RGBA — yellow TRANSLUCENT (~0.45 —
the voxel is gone, the cube is a ghost), red strong (~0.9 — still-solid
contact); three.js consumes the 4-component color attribute directly.
v1 deliberately excludes: playback transport, scrub-back, laser burn
modeling (skipped + noted). Real-coin bench: 12.6k moves → 1.58M voxels in ~3s
at 0.25mm pitch (400×200×200 grid).

## Cleared-space lead-in — the 4D contour's entry spec (2026-10-30, literature-checked)

The day's measurements, then the pause: Alice ruled we stop guessing and
check industry/academic practice first. The survey (Fusion/HSM rest
machining, FreeCAD PR #27908 — the only open-source rest implementation,
Pal's ReSt computation, Petrzelka's 4-axis roughing) VALIDATES the stage-C
stock model wholesale — an in-process stock model driving rest machining
is exactly what every serious CAM system ships. The naive-combination
problems we hit (plows at trimmed-band entries, non-monotonic response
to partial fixes, thin-sliver left-overs) are the SAME problems FreeCAD
hit and solved in their rest-machining rewrite, and their landed answers
become our spec:

1. **CLEARED-SPACE LEAD-IN (the yellow-streak fix).** A pass entry
   never plunges at the engagement point. The pocket places each entry
   in provably CLEARED space adjacent to the orbit start — swept bands,
   the same thing stampBand records (and pocket2d already tracks
   per-level as `clearedBands`) — then FEEDS to the orbit start at the
   cut level. Implementation shape: entry candidate = a point whose
   tool disc sits inside the current level's cleared bands (own level
   first, previous levels' bands via the waterline's stamp state at
   trimmed bands); route = feed move at depth from candidate to orbit
   start, engaging the wall with the peripheral edge (Alice's
   2026-10-30 intent: the cutting edge, not the tip). Falls back to
   today's raised-approach when no cleared point exists on an orbit.
   This REPLACES the failed scalar `entryClear` (asked the coarse
   standing max) and the width-sweep over-cut (measured non-monotonic:
   0.2mm growth made yellow WORSE — 87 vs 64 — partial engagement
   creates new thin slivers, exactly the structure industry avoids).
2. **THIN-STREAMER HONESTY (the left-overs).** Rest material thinner
   than a threshold (Fusion's "Ignore Stock Less Than" analog) is NOT
   roughed: left standing for the finishing pass, warned once per run
   like the existing gap-narrower-than-tool class. No dummy islands,
   no sliver-chasing with the roughing tool.
3. **KEEP-DOWN CHAINING (the hop census's 975 plunge cycles)** —
   deferred to after 1+2; FreeCAD's merged-rest-region/extension-
   distance pattern is the prior art. The trimmed orientations are
   6% chained today (measured, probe-hop-census).

Safety invariants unchanged: the keep-out is never crossed, no
straight plunge through material, hooks-absent emission byte-identical,
bookkeeping fails toward extra cutting.

## Tool-shape accuracy (Alice's ruling, 2026-10-30)

Roughing treats a ball/bull endmill as a full-Ø flat disc — the
interchangeable roughing convention (exact for flats; conservative for
round profiles: never gouges, leaves the rest for finishing). But at
allowance = 0 the waterline does NOT exploit the ball's shape: vertical
walls are still exact (a ball touches a vertical wall at its equator),
while slopes and floors keep a skin where the sphere recedes inside the
flat's cylinder. The shape-aware kernels live in `relief.ts` (flat disc
/ ball hemisphere, pinned by tests) — the raster-contour family, not the
waterline's 2.5D section model. When the 4D contour grows its
per-orientation finishing pass, it must be raster-style with the
ball-aware kernel in the rotated frame, inheriting relief's hemispherical
compensation. FOR USER-FACING DOCS when they are written: call out which
methods give the highest-accuracy finish — the ball-kernel raster ops —
and note that section-based ladders (waterline family) cut ball tools
as full-diameter discs.

## Candidate future features (gap analysis, 2026-10-28)

Nightcap survey of the six CAM systems that officially target the
Carvera 4th axis (Makera Studio, Fusion 360, Carveco, VCarve/Aspire,
Kiri:Moto, SolidCAM; EstlCAM has no 4-axis) against our current
feature set. Where we already lead: simultaneous 4-axis breadth
(rotaryCarve + spiralWrap multi-coil — Makera Studio lacks that
strategy), the voxel sim with gouge/shank classification + playback,
and the golden-pinned post. The gaps are almost all 3-axis-side.
Ranked by usefulness × popularity, one-line justification each,
with Alice's same-day verdicts (numbering kept stable — her notes
reference these numbers):

1. **Trochoidal/adaptive clearing** — constant-engagement roughing
   that lets small desktop machines cut deep without snapping bits;
   the most-asked-for roughing feature in hobby CAM (Fusion's
   flagship strategy). Already discussed; Phase-3 territory.
2. **True V-carving** — variable-depth V-bit cut that fills lettering
   out to its vector outline with crisp corners; the feature that
   built Vectric's business. ALICE: possibly related to her idea of
   permitting chamfers DEEPER than the bit's cutting face via
   multiple depth passes — same V-bit-geometry exploitation, but a
   different op (chamfer rides a modelled edge; V-carve follows
   vector outlines at variable depth). Design together when taken up.
3. **DXF import** — 2D CAD lingua franca, every competitor has it.
   ALICE: cheap. (Already phase 3 of the engrave spec; no DXF code
   exists yet.)
4. **Ramp/helical entry + arc lead-ins** — never plunge an end mill
   straight down; cheapest tool-life and finish win in CAM.
   ALICE: cheap. (Already noted as a future refinement.)
5. **STEP import (occt-import-js)** — face-driven ops and the format
   every professional model arrives in. ALICE: cheap. (Already
   planned "later".)
6. **Two-sided / flip machining** — through-features and full-3D
   parts via flip + re-registration; very popular on desktop CNCs.
   ALICE: not in her plans as a setup system, but achievable as a
   "generate pins" op + "flip work" op pair.
7. **Image → relief (greyscale heightmap)** — photo-to-carve, both
   Makera Studio and Carveco have it; pairs naturally with the
   raster engine. ALICE (2026-10-28): import pops a bumpmap dialogue
   (map greyscale to a chosen height, etc.); the result is an
   ordinary model object that ALL standard contouring ops then work
   on — no new ops, no separate workflow (unlike Studio), ops list
   stays uncluttered.
8. **Rest machining** — small tool cleans only what the big one
   missed. ALICE: our allowance + finishingOnly knobs already cover
   the workflow manually; bundling risks a vastly more complex UI
   for minimal gain. Deferred.
9. **Swarf/flank milling (4-axis)** — cut walls with the tool's side
   in a continuous A+X move; the classic tapered-column/flute op,
   natural small sibling of the 4D-carve engine. ALICE: cheap.
10. **Dogbones/corner relief** — round bits can't cut square internal
    corners, so parts don't seat; every box-making user hits it.
    ALICE: cheap.
11. **Fixture/clamp modeling & avoidance** — tell the CAM where the
    vise jaws sit and keep rapids clear; the most common real-world
    crash our sim can't warn about today. (No verdict yet.)
12. **Chipload-based feeds/speeds** — ALICE: not a wizard; rather an
    auto-warning on op settings (step-down etc.) plus auto-suggest
    best speeds/settings when a tool is selected, for the novice —
    smarter presets, not new UI.

Deliberately not pursued: coolant codes, canned drill cycles, G54+
work offsets, controller-side probing — Carvera hardware + Community
Controller make them near-irrelevant.

Remaining Makera-Studio parity gaps (the raison d'être is parity then
some): DXF + STEP import (they have both), image import/trace-to-
vector, PCB/Gerber workflow, laser-image dot matrix. Every other op
on their list has a counterpart here.

Laser-image design note (ALICE, 2026-10-28): halftoning is the
approach — her proven trick for making Studio's laser-image
engraving less terrible on a machine with little/no greyscale
ability (Inkscape's "newspaper" filter shows the method space:
round/screen/line/dots-per-inch etc.). Halftone output is vector
artwork, so laser-image could ride the EXISTING artwork → engrave
(beam power) pipeline — same no-new-ops philosophy as the heightmap
above, on both flat and wrapped frames.

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