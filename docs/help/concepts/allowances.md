---
title: Allowances
---
# Allowances

An [allowance](../glossary.md#allowance) is material you deliberately
leave behind so a later, finer pass can remove it. The [roughing pass](../glossary.md#roughing-pass)
cuts fast and stops one skin short of final size. The [finishing pass](../glossary.md#finishing-pass)
then skims that skin off in a thin cut and leaves the surface you
wanted.

**3D-printing analogy:** roughing is the infill, finishing is the
perimeter. The infill runs fast and doesn't care how it looks; the
perimeter runs slow and defines every visible surface. An allowance is
the skin between the two — except here you choose its thickness, in
millimeters.

## Why not cut to size in one pass?

A heavy cut loads the tool: it flexes, the stock vibrates, and the
surface keeps the record of every one of those events. A roughing pass
accepts that — it wants big bites and speed. A finishing pass takes a
thin bite at a careful feed, so the tool stays stiff and the surface
comes out true. One pass can't be both.

Get the allowance wrong and the pairing fails in either direction:

- **No allowance on the rough** — the rough's tool marks, and the
  ripples its vibration leaves, are your final surface. There's
  nothing left for the finish to clean up.
- **Too much allowance** — the "finishing" pass now takes a heavy cut.
  It flexes and vibrates like a rough, at finishing feeds. Slow and
  rough is the worst of both.

## Rough + finish: two ops, not a switch

simple.cam has no rough/finish toggle on a single op. Rough versus
finish is mostly your allowance choice, and the pairing is two ops:

1. **Op one — the rough.** Set an allowance. 0.2 mm is the default
   wherever a roughing op carries one.
2. **Op two — the finish.** Add a second op of the same kind with
   **+ Add toolpath**, point it at the same features, and tick
   **[finishing pass only](../reference/fields.md#finishing-pass-only)**.

There's no duplicate button — you add the second op yourself and
re-point it at the same features. Ticking **finishing pass only**
removes the roughing levels and zeroes the allowance box: one thin
pass at final size, with the bulk already gone. The finishing op must
sit *after* the rough in the op list — drag rows by the ⠿ grip if it
isn't ([the Ops tab](../the-app/ops-tab.md)).

**Caution:** the zero sticks. Tick **finishing pass only**, untick it
later, and the allowance box still reads 0. Set it again, or your
"rough" will cut straight to size.

## The allowance fields

Every op that can leave stock has a field for it, named for where the
skin sits. Shared semantics live in [Fields every operation shares](../reference/fields.md#allowances--leaving-material-for-later);
the per-op reality:

| Op | Field | Default | The skin |
| --- | --- | --- | --- |
| [Pocket](../ops/pocket.md) | Allowance | 0 mm | walls and floor |
| Slice pocket | Allowance | 0 mm | walls; the floor too in inside mode |
| [Profile](../ops/profile.md) | Side allowance | 0 mm | walls — signed |
| [Profile](../ops/profile.md) | Bottom allowance | 0 mm | floor |
| [Face cylinder](../ops/rotary-face.md) | Finish allowance | 0.2 mm | the cylinder surface |
| Waterline, 4D contour, Rotary carve | Allowance | 0.2 mm | all around the model |
| Raster contour | Allowance | 0 mm | the model surface |

The [Profile](../ops/profile.md) split exists because a wall and a
floor want different numbers. **Side allowance** is signed: positive
leaves wall stock for the finishing pass; negative steps the tool path
inside the contour, cutting a raised shape below its modeled size —
that's how the thread-prep inserts hit an exact fit. **Bottom
allowance** lifts the cut floor and can't go negative: a negative
floor would cut below the depth you declared.

On [Face cylinder](../ops/rotary-face.md) the finish allowance works
radially: the roughing levels stop an allowance-thick skin short of
the target Ø, and the finishing pass takes exactly that skin to size.
Negative values are refused.

## Zero-allowance finishing

Set the allowance to 0 and the op cuts to size in one pass. That's the
default on Pocket, Profile, Slice pocket, and Raster contour — use it
when the surface is hidden, or a second pass buys nothing.

One op at allowance 0 still cuts every depth level at final size.
**Finishing pass only** instead skips those levels and cuts one pass
at the floor — but it assumes a rough already cleared the bulk. On
deep cuts, an un-ticked op at allowance 0 is the slow, tool-loading
way to learn that. The [4D swarf finish](the-4th-axis.md)
carries no allowance at all: it's a pure finish that assumes a rough
ran ahead of it.

## Where next

- [Step over and step down](step-over-and-step-down.md) — the other
  knobs that shape every pass.
- [Pocket](../ops/pocket.md), [Profile](../ops/profile.md), and
  [Face cylinder](../ops/rotary-face.md) — the allowance fields in
  their panels.
- [Fields every operation shares](../reference/fields.md) — the shared
  definitions, including the finishing-pass rules.
