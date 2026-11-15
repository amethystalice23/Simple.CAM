---
title: Tools and materials
---
# Tools and materials

Every cut pairs a spinning cutter with a material that behaves its own
way. simple.cam models both as data — the
[tool library](../the-app/tools-tab.md) holds the cutters you own, and the
stock's material picks the starting rates. This page is the background:
what each cutter is for, and why the same numbers can't suit aluminum and
acrylic.

*In 3D printing terms:* the cutter is your nozzle — its shape decides what
geometry you can make. The material is your filament — it decides the
settings that make the geometry come out clean.

## The cutter types

The Type dropdown in the [tool library](../reference/tool-library.md) knows
eight shapes. The type decides which extra fields the edit form shows and
which operations accept the tool — the strict pairings are noted below.

- **flat** — the general-purpose [end mill](../glossary.md#end-mill): a
  flat-tipped cylinder with [flutes](../glossary.md#flutes) down its side.
  It clears the bulk — [pockets](../ops/pocket.md), [profiles](../ops/profile.md),
  facing the stock top. It can also drill a straight bore when no drill
  fits. The workhorse; the [4th axis](the-4th-axis.md) finish also rides
  its side.
- **ball** — a [ball-nose](../glossary.md#ball-nose): a flat end mill whose
  tip is a hemisphere. It follows curves instead of stair-stepping them.
  That makes it the surfacing cutter — smooth fillets and U-channels, 3D
  relief passes, and the 4-axis finish where the glancing side does the
  work.
- **bull** — a flat end mill with the corners radiused (the Corner radius
  field). Between flat and ball: flat floors, softened corners.
- **vbit** — a cone, the [V-bit](../glossary.md#v-bit). The included angle
  and tip diameter set each depth's cut width — the line width follows
  the depth. Chamfers, [engraving](../glossary.md#engraving), and the
  rotary thread op (a 60° bit's cone IS the thread form).
- **drill** — pointed, cutting only at the tip. Drills run
  [peck drilling](../glossary.md#peck-drilling) — G83, a full retract
  between bites so deep holes don't pack with [swarf](../glossary.md#swarf).
  The preset drill feed is a plunge feed; the preset depth of cut is the
  peck increment.
- **threadmill** — a short band of teeth on an otherwise plain shaft. The
  Pitch field is the groove spacing; multi-tooth mills are locked to it.
  Only the Thread mill op takes one. It traces a spiral, one full circle
  per turn, cutting the thread profile to size.
- **corn** — a "corn cob" roughing bit, covered in teeth that clear chips
  fast. The shipped Makera library carries a full Corn (TiN) set. Where a
  flat is accepted a corn usually works too. The app mostly plans its
  paths like the flat beside it.
- **laser** — the Makera 5W module, a different animal: no chips at all.
  It fits the engrave operation only. Its Spindle RPM slot means beam
  **Power (%)**. Its Focus height is the standoff the head rides at. A
  pass burns one line at focus height — depth fields don't apply.

**Tip:** when you're unsure what a field means, [The tool
library](../reference/tool-library.md) defines every one of them.

## The material families

The [Stock tab](../the-app/stock-tab.md) offers five presets: **Aluminum
6061**, **Brass 360**, **Delrin (acetal)**, **Hardwood (maple/birch)**, and
**Acrylic (cast)**. Behind the five names sit three behavior families the
rate advisor actually works with:

- **metals** — aluminum, brass, copper
- **plastics** — Delrin and acrylic both read the plastic family
- **woods** — hardwood and softwood

A library tool can also carry its own per-material rate rows — the Makera
presets arrive with theirs, under Makera's names (Aluminum, Brass, Copper,
Hardwood, Softwood, Plastic). A matching row wins over the built-in table;
[Feeds and speeds](feeds-and-speeds.md) explains the whole chain.

## How the material changes the numbers

The built-in table, for a flat end mill, shows the spread:

| Material        | Cut feed (mm/min) | Depth of cut (mm) | Plunge |
| --------------- | ----------------- | ----------------- | ------ |
| Aluminum 6061   | 420               | 0.8               | ⅓ of feed |
| Brass 360       | 650               | 1.2               | ⅓ of feed |
| Delrin (acetal) | 900               | 2                 | ½ of feed |
| Hardwood        | 1400              | 2.5               | ½ of feed |
| Acrylic (cast)  | 800               | 1.2               | ⅓ of feed |

The pattern is the material science: what matters is how each material
forms a chip and where the cutting heat goes.

- **Metals** shear a solid curl off. [Chip load](../glossary.md#chip-load)
  has to stay high enough that the edge cuts rather than rubs — rubbing
  metal is how a tool heats itself dull. The depth ceiling is shallow:
  about half the cutter Ø. Brass cuts freer than aluminum, so its presets
  run faster feeds at deeper steps.
- **Plastics** don't hold a curl when hot. Push too gently and the tool
  rubs, melts the plastic locally, and leaves welded-on strings. Delrin
  shrugs heat off and likes an aggressive cut; acrylic is more brittle
  and caps shallower. Plastics and woods tolerate depths up to a full
  cutter Ø.
- **Woods** cut the fastest of the five — the preset feeds are the
  highest and the depths the deepest. The risks are tear-out along the
  grain and heat from a dulling bit, not melt.

You never type any of this: the ⚡ popup grades your rates against these
bands (and a too-low chip load is the one warning that costs tools or
parts). What you can change and how, see [Feeds and speeds](feeds-and-speeds.md).

## Finding your material's real numbers

The presets are starting points for a hobby-class
[spindle](../glossary.md#spindle) with Ø6 mm-class cutters — your
machine, tool, and exact stock have the last word. The **Calibration…**
button in the top bar cuts a coupon that finds the numbers your material
actually wants; see [Finding your material's real
numbers](feeds-and-speeds.md#finding-your-materials-real-numbers) in
Feeds and speeds.

## Where next

- The library itself: [The Tools tab](../the-app/tools-tab.md)
- Every tool field defined: [The tool library](../reference/tool-library.md)
- Reading and changing the rates: [Feeds and speeds](feeds-and-speeds.md)
- How the passes spend the depth and width:
  [Step-over and step-down](step-over-and-step-down.md)
- A first job tying it together: [Your first cut](../getting-started/your-first-cut.md)
