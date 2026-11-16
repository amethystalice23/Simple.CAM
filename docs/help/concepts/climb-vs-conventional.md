---
title: Climb vs conventional
---
# Climb vs conventional

A spinning cutter meets the material it removes at one spot, once per
revolution. Which way the tool travels through that spot — with the
rotation or against it — decides how each tooth's slice starts. That
choice has a name: [climb milling](../glossary.md#climb-milling) or
conventional milling. simple.cam always cuts climb, and there's no
setting to change it. This page explains why there's no knob.

## The two directions

**Climb milling**: each tooth bites in at full thickness and the slice
thins out as the tooth sweeps through. The tooth shears a chip off
cleanly and leaves.

**Conventional milling**: the reverse. The tooth lands at zero
thickness, rubs for a moment, then the bite builds until the tooth
exits. A machinist's rule for telling them apart on a pass: climb is
the direction where the material sits on the **left** of the travel.
That's the rule simple.cam's generators follow too.

There's no 3D-printing analogy for this one — a printed layer doesn't
care which way the nozzle crosses it. In milling the direction is a
real physical choice, and the cut keeps the record.

## Why it matters

- **Finish.** A climb cut shears the wall cleanly. A conventional cut
  starts by rubbing, and the rubbed skin it leaves reads as a dull or
  torn surface, especially in aluminum.
- **Tool heat.** That zero-thickness rub doesn't cut — it grinds.
  Friction heats the tool's edge instead of loading a [chip](../glossary.md#chip-load)
  that carries heat away. The same "too thin per bite" trouble the
  [feeds and speeds](feeds-and-speeds.md) page warns about, caused by
  direction instead of feed.
- **Backlash.** This one is background, not a simple.cam behavior.
  Climb pulls the tool forward into the cut; conventional pushes the
  work away. On a machine with slack in its screws, that pull can
  lurch the tool into the work. It's why some old hobby advice says
  "run conventional on a loose machine".

## What simple.cam does

Every pass that travels around a wall climbs:

- **[Pocket](../ops/pocket.md)** — every offset pass is reversed at
  generation so the material always sits on the left, on outer walls
  and around islands alike, at every depth level.
- **[Profile](../ops/profile.md)** — an **outside** pass already
  travels the climb way; an **inside** pass is reversed to match.
  Both sides climb.
- The [adaptive clearing](../glossary.md#adaptive-clearing) loops a
  deep pocket can switch to are oriented the same way.

## Where the idea doesn't apply

Not every pass travels around a wall, so not every pass has a climb
side:

- **[Drilling](../glossary.md#plunge)** cuts straight down. There's no
  side direction at all.
- **Thread milling** is steered by the thread itself — the handedness
  you pick (cw or ccw) sets the rotation.
- **Back-and-forth raster passes** — Rotary carve's rows, Rotary
  face's sweeps, the raster contour finish that follows the model's
  surface after a waterline rough, engraving fill. These serpentines
  alternate direction row by row to skip wasted rapids, so the rows
  alternate which flank does the cutting. Cutting every row the same
  way would mean lifting out and re-entering at each row end — the
  generators don't. See [Step over and step down](step-over-and-step-down.md)
  for how the rows are spaced.

## Why there's no knob

Other CAM packages offer climb/conventional as a dropdown per
operation. simple.cam's target machine is a modern stiff-frame desktop
CNC, where climb's full-thickness bite shears cleaner and
conventional's rub is pure loss — the reasoning is baked into the
generators, not left to you. It's the same stance as the clearing
strategy: the machine makes the sensible choice. The Pocket page says
it plainly — the strategy picks itself, the same way climb does.

If you're chasing a better wall finish, the levers that exist are
elsewhere: a [finishing pass](../glossary.md#finishing-pass) with an
[allowance](allowances.md) left for it, a fresh tool, and
healthy [feeds and speeds](feeds-and-speeds.md).
