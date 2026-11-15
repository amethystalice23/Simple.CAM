---
title: Fields every operation shares
---
# Fields every operation shares

Most operations share a set of parameter fields. They mean the same
thing everywhere, so learn them once.

## Depths

- **Start depth** and **End depth** are measured down from the **top
  of the stock** (the crown), not from the model's surface. If your
  stock is 20 mm thick and you want a 3 mm-deep pocket, start 0, end
  3.
- **End depth is a floor**: the tool cuts down to it and stops. It is
  never "how much material to remove at each pass" — that's Step
  down, below.
- Many depth fields have a **⇩ pick button**: click it, then click a
  face or circle in the viewport, and the field fills with that
  feature's depth. Much faster than measuring by hand.
- On ops with a *Selection is the* toggle, the ⇩ floor pick anchors
  to either the **floor** (the bottom face of the region) or the
  **rim** (the top edge) depending on the setting.

## Allowances — leaving material for later

An **allowance** is material deliberately left behind so a later (or
finer) pass can remove it. Measured in mm:

- **Bottom allowance** — keeps a skin of material on the floor. The
  tool rides this much above the true floor.
- **Side allowance** — keeps a skin on the walls. On Profile it is
  *signed*: a negative value steps the tool further in, turning a
  boss down past its modeled diameter.
- **Finish allowance** — same idea on the rotary ops: what the
  finishing pass removes.

A **roughing** pass is like 3D-printer infill: fast, coarse, leaves
an allowance behind. A **finishing** pass is like the perimeter pass:
slow, thin cut, produces the final surface. In this app a roughing vs
finishing cut is often just the allowance choice — a big allowance
plus a finishing pass is a rough + finish strategy.

## Step down and Step over

- **Step down** (mm) — how deep each plunge removes, like layer
  height. A 9 mm pocket with Step down 3 cuts three levels of 3 mm.
  Big steps cut faster but load the tool harder.
- **Step over** (mm) — how far the tool shifts sideways between
  neighboring passes, like line width in a top layer. Around 40–50 %
  of the tool diameter is typical for flat end mills.

## Finishing pass only

A checkbox on every op with a depth ladder. Ticking it removes the
roughing levels: the op cuts only one thin finishing pass at its
final depth/contour, taking zero allowance. Use it as the second half
of a rough + finish strategy: duplicate the op, tick the box.

## Feeds and speeds (the ⚡ popup)

- **Feed** (mm/min) — how fast the tool moves while cutting.
- **Plunge** (mm/min) — how fast it pushes straight down into
  material. Always slower than feed.
- **Spindle** (rpm) — how fast the tool spins. Lasers show **Power
  (%)** instead.
- **Clearance** (mm) — how high the tool lifts when moving between
  cut areas without cutting.

Every box defaults to the selected tool's preset for the stock's
material (the header line shows the source) — override per op here.
The popup also grades the feed against the tool's chip load and
offers **Apply recommended feed** when it's off.

The app warns about implausible numbers but does not block them: the
**simulation** is the judge of intent, and only physically impossible
cuts are refused outright.

## Tabs (Profile, Slice pocket outside)

**Tabs** are hold-down bridges: the cut-out stays connected to the
stock by N small uncut bridges so it can't break loose and fly. After
the job, snap the part free and file the nubs. Count / height /
length defaults are 3 × 0.5 mm × 3 mm.

## Rotation (cw / ccw)

Rotary ops can turn the workpiece **cw** (clockwise) or **ccw**
(counter-clockwise). For most grooves either works; the difference
matters for tools with a cutting direction and for how chips clear.
If a rotary cut leaves a worse finish one way, try the other.

## The per-op row controls

Every op row in the Ops tab has, left to right:

- **⠿ grip** — drag to reorder the op in the cut sequence.
- **#N** — its position in the order.
- **kind select** — what the op is; changing it rebuilds the op with
  new defaults (features stay selected).
- **feature snippet** — what it's pointed at ("Ø4.0 hole +2 more");
  hover for the full list.
- **👁 / ⊘** — hide or show this op's toolpath in the preview (the
  exported g-code is unaffected).
- **⚠** — shown when generation failed; hover for the error.
- **↻** — recalculate just this op.
- **✕** — delete the op.

At the bottom of the panel: **+ Add toolpath** (appends a Pocket
with the last-used tool), **Recalculate** (regenerate everything), and
**Clear** (discard calculated toolpaths; your parameters stay).
