# MakeraStudio G-code dialect — verified from machined examples

Ground truth: `examples/*.nc` — 22 real MakeraStudio exports (3-axis `*_TOP`,
4-axis `*_MULT`, one laser job, one v1.0.0-header job), all cut successfully
on the user's mill. This doc records what the controller demonstrably accepts;
where it disagrees with earlier earlier working notes, these files win. Companion
to `docs/PLAN.md` § "Machine assumptions (verified)".

Corpus at a glance: 22 files, every one ends `M05` → `G28` → `M02`; every one
starts `G90 G21` after the `;@MKR|` block. **No G93, no G94, no G2/G3, no
M30 anywhere in any file.**

## File layout

All example files use **CRLF** line endings.

```
;@MKR|BEGIN
;@MKR|SCHEMA|v=1.0.0
;@MKR|MACHINE|id=Z1|name=Makera Z1
;@MKR|MATERIAL|id=1212221100035035|name3=Black Delrin Block - 35mm * 35mm / 100mm|name1=Plastic|name2=Delrin|uuid1=019bfadc-e599-73c8-9e22-fae941e95a46
;@MKR|STOCK|id=cuboid|length=18|width=18|height=20|diameter=50
;@MKR|ORIGIN|id=2|type_name=topCenter|x=0|y=0|z=10
;@MKR|CAM|id=MakeraStudio|name=MakeraStudio|v=0.1.2.0
;@MKR|UNIT|value=mm
;@MKR|MAXFEEDRATE|value=1200
;@MKR|TOOL|number=2|id=111011313825|name=3.175*25mm Flat End|type=Flat End|handlediameter=3.175|sticklength=0|shoulderlength=25|flutelength=25|diameter=3.175|tipdiameter=3.175|cornerradius=0|angle=0|halfAngle=0
;@MKR|TOOL|number=4|id=122111013890|name=3.175mm*90º Chamfer|type=V-Bit|...same fields...|angle=90|halfAngle=0
;@MKR|TIME|seconds=1514.08
;@MKR|TOOLPATH|number=1|tool_number=2|name=[T2]GHM9 Thread Outer
;@MKR|TOOLPATH|number=2|tool_number=2|name=[T2]Face Top
...one TOOLPATH line per op...
;@MKR|END
                                   ← one blank line
G90 G21
;@MKR|TOOLPATH_START|toolpath_number=1
                                   ← blank
; T2-3.175*25mm Flat End            ← blank, tool comment, blank
                                   ← blank
T2 M6
G0 X4.5 Y7.22                       ← XY positioning rapid
S10000 M3
G0 Z15                              ← safe retract
G0 Z3                               ← approach
G1 Z0 F300                          ← plunge
...G1/G0 body...
G0 Z15
M05
G28
M02
;(thumbnail_image_begin)
;iVBORw0KGgo...                     ← base64 PNG, long lines
;(thumbnail_image_end)
```

Notes on header fields:

- `MATERIAL`: library materials use `id=<n>`; user materials have empty `id=`
  plus a `uuid1=<uuid>` field.
- `STOCK`: `id=cylinder|length|width|height|diameter` or `id=cuboid|...` —
  cuboid rows still carry a junk `diameter=` (50 or 1), so the field is
  always present.
- `ORIGIN`: `id` is not a stable enum (0=topFrontLeft, 2=topCenter,
  11 *and* 13 both=leftCenter); `type_name` is the meaningful part.
- `TOOL` field order (all 13 fields, always present):
  `number, id, name, type, handlediameter, sticklength, shoulderlength,
  flutelength, diameter, tipdiameter, cornerradius, angle, halfAngle`.
  `type` values seen: `Flat End`, `Flat End(Metal)`, `V-Bit`, `Thread`.
  Laser files have **no TOOL lines at all**.
- `v=0.1.2.0` and `v=1.0.0` Studio versions both in the wild; the v1.0.0
  file (TopClamp.nc) omits `MAXFEEDRATE` and the `uuid1`/`id` material
  extras — parse leniently.
- `TIME|seconds=` is a float; laser job says `seconds=0`.
- `TOOLPATH|name` includes a `[T2]` tool prefix before the user op name.

## Toolpath transitions

- **First op of a tool** (spindle not yet running — file start):

  ```
  ;@MKR|TOOLPATH_START|toolpath_number=1

  ; T1-3.175*12mm Flat End(Metal)

  T1 M6
  [G0 Z13]            ← only in 4-axis files: lift before datum set
  G92.4 A0 R0         ← 4-axis only (see below)
  G0 X.. Y..          ← positioning
  S10000 M3
  G0 Z<safe>
  G0 Z<approach>
  G1 Z.. F<plunge>
  ```

- **New tool mid-file** (spindle running): previous op ends with its retract
  (`G0 Z15`), then the marker, then **`M5`** (short form), blank,
  `; Tn-<name>`, blank, `Tn M6`, continue as above.

- **Same-tool next op**: just the marker, then `S<rpm> M3` (re-fires M3 even
  to repeat the same speed is not done — only on speed change), then new
  positioning `G0`s. No `M5`, no `T M6`.

- Spindle line is exactly `S<rpm> M3` (S first, M3 second; rpm integer,
  seen 10000 and 12000).

- Footer, 4-axis files: retract, `G0 Y13` (park), `M05` (long form),
  `G28`, `M02`. Mid-file stops are `M5`, the final stop is `M05` — both
  spellings are emitted by Studio and both work. `G28` (home) always
  sits between the spindle stop and `M02`.

- Thumbnail block is optional-but-present in all 22 files; empty
  begin/end pair with nothing between appears in some.

## 4th axis (MULT files)

- **`G92.4 A<deg> R0`** — Studio's per-toolpath datum form, re-issued at the
  start of *every* 4-axis toolpath. Datum values seen: `A0 R0` (19×) and
  `A180 R0` (12×) — the 180 form is the flipped datum for ops machined on
  the opposite side of the stock (Stage2's "Flat Bot" ops mill a flat at
  fixed A=180 as ordinary 3-axis X/Y/Z). Firmware semantics of `G92.4` are
  fully decoded — see the firmware section below; `R`'s numeric value is
  ignored (its presence selects the rotate+set-datum branch), and the
  `S` form is a *different, also-real* command (shrink work-coordinate A).
- **A is never coordinated with a linear axis.** Zero lines in the corpus
  contain both an A word and an X/Y/Z word. Rotary moves are always
  single-axis blocks: `G0 A<deg>` (indexing, stays within 0–360) or
  `G1 A<deg> F<n>` (continuous rotation).
- **Continuous rotation accumulates**: A runs to `A7200` (20 revs),
  `A65160` (181 revs) as absolute values, no wrap, then `G92.4` re-zeros.
  Final rev lands on a computed fraction first (`G1 A65159.73`) then snaps
  (`G1 A65160`).
- **Helical cuts are stair-stepped**, not coordinated: thread turning
  alternates one-block-per-rev,
  `G1 X11.75 / G1 A59760 / G1 X11.7 / G1 A60120 …` — i.e. Studio
  approximates the helix as alternating X and A blocks. Finishing passes
  alternate `G1 A360 F240` with X cross-feed steps. This is presumably
  why G93 never appears in real output.
- Fixed-A machining (flat on a rotated cylinder): rotate, `G92.4 A180 R0`,
  then pure X/Y/Z 3-axis body — A stays put.
- Park position at op/file end: `G0 Z11`/`G0 Z13` retract, then `G0 Y13`.
- Approach quirk: `G0 Z11` is emitted twice in a row in Stage2 transitions
  (harmless duplication).
- Feed handling on A: plunge `G1 Z7.5 F300`, cut `G1 X16.39 F1000`, then
  subsequent lines rely on **modal F** (no F word) until it changes.
  Note the reverse of our current rule-of-thumb: Studio relies on modal
  F even across rotary moves.

## Laser job (laser_grid)

- No `TOOL` header entries; toolpaths carry `tool_number=0`.
- First toolpath after the marker: `M321` (laser module on), `G0 Z0`
  (focus height), `M3` — no S word on the M3 line.
- Cut lines carry power inline: `G1 X9.24 Y46.34 S1 F1000`; power is
  0–1 scale with decimals (`S0.35`, `S0.5`, …). Between vectors:
  `G1 S0`, then `G0 X.. Y..` rapid to the next start.
- End of file: `G1 S0`, `M05`, `M322` (module off), `M05`, `G28`, `M02`.

## Air assist (TopClamp.nc, v1.0.0 header)

- `M7` immediately after `T1 M6` (before positioning), `M9` at op end.
  Only file in the corpus using them.

## Number formatting

- Coordinates: **≤ 2 decimals, trailing zeros trimmed** (`X20` not
  `X20.00`, `A65159.73`). Negative zero occurs (`Z-0`).
- Word order in motion lines: `X Y Z` then `A`; F last (`… F1000`);
  laser adds S before F (`S1 F1000`).
- F: **integers only** across the whole corpus (100–3000; 100, 150, 200,
  240, 300, 500, 600, 800, 1000, 1500, 2000, 2500, 3000).
- S: integers for spindle; 0–1 with decimals for laser.
- `MAXFEEDRATE|value=1200` matches the machine's 1200 mm/min cap.
- 4-axis rotary emission path leaves a trailing space on its lines
  (`G1 A360 `, `G0 X19 `); the 3-axis path does not. Cosmetic only.

## Community Controller parsing (verified from source)

Read-only reference: `reference/community-controller` (GPL; facts only, no
code copied). The controller's preview parser is far more tolerant — and far
pickier in one spot — than the MakeraStudio header block suggests:

- **The only `;@MKR|` tag the controller reads is `TOOL`.** BEGIN/SCHEMA/
  MACHINE/MATERIAL/STOCK/ORIGIN/CAM/UNIT/MAXFEEDRATE/TIME/TOOLPATH/END and
  TOOLPATH_START markers are all silently ignored (MakeraStudioParser,
  `addons/tool_visualization/parsers/makera_studio.py:106-141`; base header
  scan `parsers/base.py:35-51`). The other tags exist for MakeraStudio's own
  preview, not the controller's.
- **TOOL lines must sit at the very top of the file**, before the first line
  that doesn't start with `%`/`(`/`#`/`;` (and within the first 5000 lines)
  — `parsers/base.py:8-12`. Our current bare-TOOL-line header position is
  fine; a block emitted *after* motion would be missed.
- `TOOL` fields the controller consumes: `number` (required — entry
  skipped without it), `id`, `name`, `type`, `handlediameter`→shank,
  `sticklength`/`shoulderlength` (fallback order), `flutelength`,
  `diameter`, `tipdiameter`, `cornerradius`, `angle` (÷2 to per-side),
  `halfAngle` (preferred). Everything but `number` is optional. It builds
  real 3D tool meshes from these (revolved profiles per type) and uses
  `name` in the legend and the M6 tool-change popup.
- **`type=` vocabulary** (case-insensitive): `flat end`, `ball nose`,
  `v-bit`, `engraving`, `bull nose`, `drill`, `thread`, `tapered ball nose`
  — unknown types fall back to a generic pointed mesh with a logged
  warning. Answers our open vocabulary question.
- **Segmentation is by tool number + M321, not TOOLPATH markers.**
  Tool-colored paths, legend, visibility filters, and playbar markers
  ("T1", "L" for laser via tool 8888, "P" probe, "3DP") all key off `T`
  numbers (`main.py:7903-7920`, `GcodeViewer.py:651`).
- **Inline `;` and `(...)` comments on motion lines are fine** — stripped
  before tokenizing (`CNC.py:382-386`). CRLF is normalized by Python text
  mode. Thumbnail block: ignored, but **every base64 line must keep its
  `;` prefix** — bare base64 would be parsed as axis words and corrupt the
  preview (`CNC.py:465-491`).
- **G93 is parsed but not honored in time estimates**: `feedmode` is stored
  but nothing reads it; F is always treated as mm/min
  (`CNC.py:537-538`, `GcodeViewer.py:1980-2017`). G93 files play fine but
  the ETA/legend durations will be wrong. G94 is unit-detected from the
  first G20/G21 in the first 1000 lines (default mm) and scales tool-mesh
  dimensions — so our `G21` matters, `;@MKR|UNIT` does not.
- **4-axis preview validated**: every XYZ point is rotated about the X
  axis by its A angle (`GcodeViewer.py:428-439`) — the controller wraps A
  paths around a virtual cylinder exactly like our cylinder-canvas
  transform; A ∥ X confirmed on the preview side too. `has_4axis` is set
  from any A word and disables leveling, anchors origin to rotary.
- **M6 is a machine-side hold**: the machine pauses with status "Tool",
  the controller pops a confirm dialog showing the tool `name` from our
  TOOL table, and `change` resumes. Resume-at-line rebuilds modal state by
  scanning backwards for G20/G21, G90/G91, M6(+T), `G1 F`, `M3 S`,
  M321/M322, WCS (`Controller.py:1075-1201`) — it warns if it can't find
  those, which is a good argument for keeping our modal words in the
  conventional places Studio puts them.
- Z1 profile (`config_z1.json:154-276`): work area 200×200 mm,
  X/Y max 1200 mm/min, Z max 600 mm/min, **A max 3600 °/min (= 10 RPM)** —
  matches MAXFEEDRATE=1200 in the example headers.

## Firmware behavior (verified from source)

Read-only reference: `reference/community-firmware` (GPL; facts only, no
code copied). Two versions matter:

- **master = v2.2.0c: Carvera (C1) and Carvera AIR only — no Z1 support.**
- **Dev / release/2.3.x = 2.3.0c-RC1: "Add support for Makera Z1 and Makera
  Z1 Pro"** (`MACHINE_FAMILY_Z1`, `config_z1.default`, `config_z1pro.default`).
  **We target Z1, so the Dev/2.3.x tree is the one to cite.** New in 2.3:
  M959/.1 analog spindle PWM map + auto-tune, M337/M338 LED bar, flex
  compensation v2, CAM probing helper macro, M887 (renamed from M888)
  homed-check override.

### G92.4 — three real variants (`Robot.cpp:776-833`)

- `G92.4 A<deg>` (no R/S): pure coordinate reset of A — no motion, no
  EEPROM write.
- `G92.4 A<deg> R<anything>` (R value ignored, presence only): physically
  rotates A to the mod-360 equivalent at the A max rate, waits for idle,
  sets work-coordinate A to `<deg>` (+ current WCS A offset), and persists
  WCS offsets 0–5 to EEPROM. This is Studio's per-toolpath datum command.
- `G92.4 A0 S0`: **shrink** — subtracts whole turns so work-coordinate A
  lands back in ±360 without motion. This is a real command (changelog
  v.version "Corrected the Shrink A command G92.4 A0 S0. Now … compresses
  work coordinates"), so our post's wrap line is *valid as a wrap* — it
  was never a misread of R0. It is **not** a datum-set, though, so it must
  not be used as the header/`A0`-datum line the way our post currently
  does.

### G93 inverse-time (`Robot.cpp:903-904, 1442-1458`)

- Implemented. **F mandatory on every G1/G2/G3 line** — missing or ≤0 F
  prints an error and halts the machine (G0 is exempt and internally
  forces G94 for the move). M2 resets inverse-time mode.
- Under G93 the **A-axis surface-speed compensation is disabled** (gated
  on `!inverse_time_mode`): A is fed as plain °/min with only the hard
  max-rate clamp. So G93 coordinated moves are accepted but feed
  semantics differ from G94 — our generators must already express feed
  as 1/min there (PLAN.md's rule) and cannot rely on surface-speed help.

### G94 radius-aware A compensation (`Robot.cpp:1849-1895`)

- G94, G1/G2/G3 only (G0 exempt): effective radius = √(Y_wcs² + Z_wcs²)
  computed live from the move target; radius ≤ 0.1 mm assumes radius 1.
  A-only moves interpret F as surface speed and scale the angular rate
  up (clamped to A max rate); A+linear moves scale the whole move to
  match commanded surface speed. This is the mechanism PLAN.md's
  "radius-aware G94 surface-speed compensation" refers to.

### Rotary limits

- C1 (`config.default:431`): A max rate 1800 °/min = **5 RPM**,
  acceleration 360 °/s². No sustained-vs-peak split exists in the
  firmware — one configured max rate. (PLAN.md's operational 6.6/12.5 RPM
  figures come from community guidance, not the config.)
- **Z1 (`config_z1.default`, Dev branch): A max rate 3600 °/min = 10 RPM**,
  X/Y max 1200 mm/min, Z max 600 mm/min — matching the controller's Z1
  profile. Z1 also defines an **epsilon axis** (5th axis, max rate 100,
  steps 888.9/deg? semantics unknown — likely B or ATC-related; open
  question) and A endstops.

### Program end, homing, and comments

- **M2 always accepted** (resets absolute mode, G94, spindle secs);
  **M30 is treated as M2 in grbl mode**, which this build defaults to —
  so our M30 happens to work, but M02 is the form real files prove.
- **No auto spindle stop at M2/M30** — the program ends with the spindle
  still on unless `M5` is emitted. Our post currently emits no M5 at
  all; the footer must gain one. Studio's `M05` is doing real work.
- **G28 = park, not homing**: rapid to clearance position (Z first, then
  X/Y, machine coords; A/B untouched). Homing is G28.2. The machine
  refuses to play files unless homed.
- **G20 hard-halts** ("Imperial Units are unsupported") — always emit G21.
- **Uppercase required**: lowercase-leading lines are treated as console
  commands and ignored by the G-code dispatcher. Inline `;` and `(`
  comments are stripped; `(` is not closed-paren aware. Bare word lines
  (`X.. Y.. F..`) auto-prefixed with the modal G1/G0 (pycam-style). CRLF
  tolerated. `;@MKR|` lines are just comments to the firmware.

### M-codes relevant to jobs

- M3 (refuses to run without a valid tool loaded; in laser mode it fires
  the laser), M5 spindle off. **M4, M7, M8, M9 are unimplemented no-ops**
  — which is why TopClamp.nc's M7/M9 machined fine, but don't rely on
  them for anything.
- M6 T<n>: **refuses while the spindle is running** (halts) — that's why
  Studio emits `M5` before each tool change. On manual machines it enters
  a `tool_waiting` state (controller pops the confirm dialog).
- Laser: M321 → laser mode (drops current tool, applies `G92.5 Z0` laser
  offset), M322 → back to CNC (`G92.1`), M323 test. Laser power is the
  modal S word on G1/G2/G3 only (G0 never fires), and the beam requires
  M3 while in laser mode — Studio's laser files emit that bare `M3`.
- Probing/4th-axis calibration: M465 (single-axis angle probe), M465.1
  (probe 4th-axis stock, needs Y+H), M465.2 (with offset, X/Y/R);
  M469.1/.2 anchors, M469.4 headstock, M469.5 A-axis Z height,
  M469.6 centerline self-calibration, M469.7 P1–P6 store values;
  M495 auto margin/probe with R flag for rotary jobs.

## Mismatches with our current post (`src/post/carvera.ts`)

Status 2026-10-21: rows 1–4, 6 and 9 are **fixed** (uncommitted working
tree) — `M05 G28 M02` footer, `G90 G21` header, `G92.4 A0 R0` datum with
the `S0` shrink kept for wrapping, Studio number formatting, and full
13-field TOOL lines. Row 5 is **deferred** until the IR carries op
boundaries (TODO in carvera.ts). Rows 7–8 are **deliberately kept**
(inline comments and LF endings are both verified harmless — see the
controller section).

| # | Ours | Real (corpus-verified) | Severity |
|---|------|------------------------|----------|
| 1 | `G92.4 A0 S0` (header + wrap) | `G92.4 A<deg> R0` datum; `A0 S0` = shrink | **wrong variant in the header**: `S0` is real but means "shrink work A", not set-datum — header should be plain `G92.4 A<n>` or the R-form; S-form is correct for the end-of-op wrap |
| 2 | `M30` footer, **no spindle stop** | `M05` → `G28` → `M02` | M30 happens to work (grbl-mode M2 alias) but M02 is the proven form; **real bug: we never stop the spindle** — firmware does not auto-stop at program end |
| 3 | `G21 G90 G94` | `G90 G21` (no G94 word at all) | cosmetic; G94 never appears in real output |
| 4 | bare `;@MKR|TOOL|…` partial fields | full 13-field TOOL line(s), top of file | matters: controller builds 3D tool meshes, legend names, and the M6 popup from TOOL lines; the rest of the BEGIN block is Studio-only but harmless to emit |
| 5 | no per-op markers | `;@MKR|TOOLPATH_START|…` + `; Tn-<name>` + `Tn M6` + `M5` between tools | low — controller ignores TOOLPATH markers and segments by tool number; emit anyway for Studio parity |
| 6 | 3-decimal coords, 4-decimal F | ≤2-decimal trimmed, integer F | cosmetic |
| 7 | trailing `; comment` on motion lines | none (only `; Tn-…` tool comments) | verified harmless — controller strips inline comments before tokenizing (`CNC.py:382-386`); keep or drop for Studio parity |
| 8 | LF endings | CRLF in all 22 files | cosmetic — controller normalizes newlines; Studio always writes CRLF |
| 9 | analysis note: "no `M5` string in the binary" | both `M5` (mid-file) and `M05` (final) emitted | comment in carvera.ts is factually wrong — correct it |

Firmware-verdict on the G93 design: **implemented and safe to use** —
coordinated XYZ+A blocks are accepted (no rejection anywhere in the
planner), F-per-line is enforced by a hard halt so our always-emit-F rule
is mandatory, and A surface-speed compensation is disabled in G93 so
generators must compute true 1/min feeds themselves. Two known costs: the
controller's ETA math misreads G93 F as mm/min, and real MakeraStudio
output never uses G93 (it stair-steps helices as alternating single-axis
blocks — worth keeping as a fallback emission mode).

## Open questions

- The Z1's **epsilon axis** (`config_z1.default`, 5th actuator, max rate
  100): what it drives (B-axis? ATC?) and whether it can appear in G-code
  as B words. No Z1 machine profile constants in the controller reference
  it beyond A.
- Sustained-vs-peak A RPM: the firmware has a single configured max rate
  (Z1: 3600 °/min = 10 RPM); PLAN.md's operational 6.6/12.5 RPM figures
  come from community guidance — confirm against the user's machine
  config before trusting either.