---
title: The tool library
---
# The tool library

Tools are saved library data, not per-operation settings: enter each
real cutter you own once, with its measurements, and every operation
reuses it. The library ships with the Makera tool presets built in.

## The list

- **Search** filters by name, type, or diameter; the **Bit type** and
  **Shank Ø** dropdowns narrow it further.
- **Add Tool** starts a draft tool (a Ø6 flat end mill at 18000 rpm).
- **Import CSV… / Export CSV…** move the whole library through the
  same CSV format a Fusion 360 tool-library export produces — if you
  already have a Fusion library, import it rather than retyping.
- **Restore Makera presets** replaces the library with the built-in
  presets.

## The edit form

- **Type** — flat, ball, bull (corner-radius), vbit, drill,
  threadmill, corn (a "corn cob" roughing end mill), laser. The type
  decides which extra fields appear and which operations accept the
  tool.
- **Diameter** — the cutting diameter. For a V-bit, the widest part
  of the cone that ever enters the material.
- Per-type: **Included angle + Tip diameter** (V-bit), **Corner
  radius** (bull), **Point angle** (drill), **Pitch** (thread mill —
  the groove spacing it cuts; multi-tooth mills are locked to it),
  **Focus height** (laser).
- **Spindle RPM** (or **Power %** for a laser) — the default speed;
  each op can override it in its ⚡ popup.
- **Flutes**, **Flute length**, **Overall length**, **Shank Ø** —
  the measurements the app needs to check depth limits and keep the
  non-cutting shank out of your material. Don't guess these; wrong
  numbers make the simulator lie to you.

The **🔧 button** opens the per-material rates table: for every
material, the spindle speed, feed, plunge, ramp, depth of cut, and
chip load figures the presets produce, with the active column
highlighted — useful to see where a number in the ⚡ popup came from.

## Feeds and speeds for beginners

- **Spindle speed** (rpm) is how fast the bit spins. Small bits spin
  faster; the presets know this.
- **Feed** (mm/min) is how fast the bit moves through the material.
  Too fast dulls and snaps bits; too slow rubs instead of cutting and
  also heats the bit. The presets are a sane starting point.
- **Chip load** (mm per tooth) is the thickness of the curl each
  cutting edge takes per revolution — the ⚡ popup grades your feed
  against it and will recommend one when you're off.
- When in doubt: run the [Calibration…](../concepts/feeds-and-speeds.md#finding-your-materials-real-numbers)
  coupon, which cuts a grid of test cells varying two parameters so
  the machine tells you what your material actually wants.
