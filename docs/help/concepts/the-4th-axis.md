---
title: The 4th axis
---
# The 4th axis

Three axes move the tool: X left-right, Y front-back, Z up-down. A
4th axis adds rotation — the [A axis](../glossary.md#a-axis), a
lathe-style spindle built into the bed. It spins the *stock*
instead of the tool.

*In 3D printing terms:* a print bed that rotates — except it can
turn mid-job, as many times as the job needs, and the software
knows the angle to a tenth of a degree.

## Why it's worth a whole axis

Round parts are the obvious case: a cylinder is awkward to reach
with three axes and natural on four. But rotation also buys
*indexing* — cut a face, turn 90°, cut the next, all in one setup.
Every extra setup is a fresh chance to lose alignment; one blank,
one datum, four or more faces.

## In simple.cam

The Stock tab's **Mode** setting is the switch: 3-axis or 4-axis.
It changes how the blank sits in the machine, and the ops list
follows — the rotary-only kinds (Index, Rotary face, Rotary chamfer,
Rotary groove, Rotary thread, Rotary contour, 4D contour, 4D
polish) stay greyed out in 3-axis mode. Their pages carry the amber
**requires 4th axis** tag.

## Frozen or spinning

Rotary work splits into two families:

- **Indexing.** The [Index](../glossary.md#indexing) op rotates the
  stock to an angle and freezes it there. Every op below it runs on
  that rotated face: a pocket, a profile, a drill, all cutting the
  side of the part as if it were the top. That's how four flat
  sides come out of one setup — or six, or any count.
- **Continuous.** The stock turns while the tool cuts: turning a
  diameter down ([Rotary face](../ops/rotary-face.md)), chamfering
  around a rim, threading — and full 4D moves, where all four axes
  run at once.

## The honest limits

- The A axis sustains about **6.6 RPM** — the community firmware's
  rotary limit. On long rotary cuts, revolutions dominate the time
  estimate. [Feeds and speeds](feeds-and-speeds.md) works through
  what that ceiling costs you.
- Any move coordinating A with X, Y or Z runs in [G93](../glossary.md#g93)
  inverse-time feed; A-only moves stay in ordinary mm/min.
  [G-code basics](gcode-basics.md) shows what that looks like in the
  exported file.
- The axis never unwinds. After continuous rotation the exported
  G-code re-zeroes the A datum instead of spinning back — shortest
  path, always.

## Where depth is measured

Flat work measures depths down from the stock's
[crown](../glossary.md#crown). Rotary work measures from the
stock's rotation center — calibrated on the Stock tab as **Axis Z**.
That story is on [Stock and origins](stock-and-origins.md).

## Where next

- Set the mode up: [The Stock tab](../the-app/stock-tab.md)
- A first rotary cut: [Rotary face](../ops/rotary-face.md)
