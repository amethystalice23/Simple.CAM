---
title: G-code basics
---
# G-code basics

[G-code](../glossary.md#g-code) is the machine's instruction language
— the same language your printer's `.gcode` files speak. This page
covers what carries over, what a mill adds, and the two rotary quirks
in the file simple.cam exports. It teaches reading, not writing: the
app writes the file, and you regenerate it after any change.

## The file at a glance

The opening of a real export — a one-pocket job:

```
; simple.cam v0.0.1 — job "pocket-square"
G90 G21
G0 X9 Y1 ; level z-1.00 pass 1
G0 Z5
G0 Z0.5
G1 X1 Y1 Z0.31 F200 ; ramp entry — helical, 2 turns
```

- Lines starting with `;` are comments — the machine skips them, you
  shouldn't. They name the job, the tool, and each pass.
- A motion line is a list of **words**, a letter plus a number.
  `G1 X1 Y1 Z0.31 F200` says: feed move, land here, at this speed.
  Words come in a fixed order — X, Y, Z, then A, with F last.
- Coordinates carry at most two decimals, trailing zeros trimmed:
  `X20`, not `X20.00`.
- Every export ends the same way: `M05` stops the
  [spindle](../glossary.md#spindle), `G28` parks the head (up first,
  then across), `M02` ends the job.

## What you already know

- **G0 and G1.** A rapid travels without cutting; a G1 feeds through
  material. Same letters, same meaning — the
  [rapids](../glossary.md#rapids) are just faster here.
- **F is the [feed rate](../glossary.md#feed-rate)**, in mm/min. One
  difference: a printer's E word pushed filament; a mill has no E. The
  tool removes material by spinning, not extruding.
- **Modal state.** The machine remembers each setting until something
  changes it. `G90` (absolute coordinates) and `G21` (millimeters) are
  set once at the top and never repeated. F is modal too — in ordinary
  mode the file states it only when the speed changes.

## What a mill adds

**A spindle.** `S10000 M3` starts it at 10,000 RPM; `M5` stops it.
The speed comes from your [feeds and speeds](feeds-and-speeds.md)
setup, and the file restates it whenever it changes.

**Tool changes.** A change looks like this:

```
M5

; T2-6mm flat

T2 M6
```

The machine stops and waits; the controller shows which tool to load,
using the name from the file's tool header. The `T2` is a **controller
tool number** — derived from your ops list, shown as chips on op rows,
and overridable in the export dialog. See
[The Tools tab](../the-app/tools-tab.md#the-t-number-labels).

**A work origin.** Every coordinate counts from the job's zero point —
the [work origin](../glossary.md#work-origin) you set along with your
[stock](../glossary.md#stock), not from the machine's frame. Move the
stock and the same file cuts somewhere else — like re-leveling a bed
shifts a print. Setup lives in [Stock and origins](stock-and-origins.md).

## The rotary difference: G93 inverse-time feed

The first quirk, from a real 4-axis export:

```
G93
G1 Z24.04 A90 F26.4 ; helical entry 0.960mm radial
G1 X100 A22590 F0.11 ; rough to r=24.040
G1 Z23.08 A22680 F26.4 ; spiral step down 0.960mm radial
G1 X0 A180 F0.11 ; rough to r=23.080
```

Two oddities: A values way past 360, and F numbers that look nothing
like mm/min. Both are correct. The F oddity is
[G93](../glossary.md#g93) inverse-time feed. mm/min can't describe a
move where the [A axis](../glossary.md#a-axis) turns while X travels —
the right speed depends on the stock's diameter, which the F word
can't carry. So G93 redefines F: it means "finish this move in 1/F
minutes". F60 takes a minute; F240 takes 15 seconds. Higher F, faster
move.

The file switches to G93 whenever one line carries A together with X,
Y, or Z. Pure rotary and pure linear moves stay in `G94` — ordinary
mm/min.

While G93 is active, every G1 carries an F, even two lines in a row
with the same value. That's not clutter: the firmware halts the job if
a G93 feed line lacks F. The export repeats F on every G1 until G94
returns.

**Tip:** if a rotary job's quoted time in the controller looks absurd,
that's the estimate misreading G93 feeds as mm/min. The machine plays
the file correctly; only the estimate is wrong.

## The rotary difference: G92.4 and the A counter

The second quirk explains A past 360. Continuous rotary work spins
the stock through many revolutions. The file keeps counting absolute
degrees — A22590 is 62 full turns plus a bit. Counting that way keeps
each pass's angle exact; wrapping to 0–360 every turn would not.

The bookkeeping sits at the top and bottom of a 4-axis job. At the
top, before any cutting:

```
G90 G21
G92.4 A0 R0
G0 Y0
```

`G92.4 A0 R0` turns the stock to the angular [datum](../glossary.md#datum)
and calls that A0 — the zero every later A word measures from. (`G0
Y0` re-establishes the rotary centerline; the [4th axis](the-4th-axis.md)
page explains why.) At the bottom:

```
G94
; shrink work-coordinate A back to ±360 (was 540.00)
G92.4 A0 S0
```

`G92.4 A0 S0` subtracts whole turns from the counter without moving
the axis, so the next job starts near zero instead of unwinding
thousands of degrees. The comment above it says what it did.

**Caution:** treat these lines as machine arithmetic, not clutter.
Delete a datum line and the stock's angle is registered wrongly;
delete a shrink and the absolute A coordinates after it no longer mean
what they say. Either way, the next cut lands somewhere else.

## Where to go next

- Where the file comes from:
  [Your first cut](../getting-started/your-first-cut.md), step 6.
- A real op that runs G93: [Rotary face](../ops/rotary-face.md).
- Where the F and S numbers come from:
  [Feeds and speeds](feeds-and-speeds.md).
- The zero point coordinates count from:
  [Stock and origins](stock-and-origins.md).
