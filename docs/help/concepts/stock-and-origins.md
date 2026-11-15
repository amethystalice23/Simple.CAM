---
title: Stock and origins
---
# Stock and origins

Every measurement in a job needs a starting point. A CAM job juggles
two: where zero is, and where depths count from. Both hang off the
[stock](../glossary.md#stock) — the blank the job cuts from.

## The stock

The stock is your raw material: the box or rod clamped into the
machine. simple.cam needs its real size and shape before anything
else, because every [toolpath](../glossary.md#toolpath) is planned
against it. The controls live on
[The Stock tab](../the-app/stock-tab.md).

## Two zeroes

- **Machine origin** — the machine's own fixed reference. A job
  never moves it; the controller looks after it.
- **[Work origin](../glossary.md#work-origin)** — where the *job's*
  coordinates start. This one you place yourself, per job.

*In 3D printing terms:* it's the same split your slicer makes. The
machine homes somewhere fixed; your print starts wherever you put
the origin on the bed.

## Where zero lands

The origin pickers on the Stock tab decide where work X0/Y0/Z0 sit
inside the blank: min, mid or max per axis. Corners (`min`) are the
usual choice — touch off the same corner you picked, and the part
sits in the stock exactly where the preview shows it. Mid variants
put the datum on the blank's center instead, which suits symmetric
parts.

## Where depths count from

Flat work measures depths **down from the crown** — the stock's top
surface. Start depth 0, End depth 3 cuts a 3 mm recess into any
blank thickness. The ⇩ pick buttons take a depth straight off the
model; the shared rules are in
[Fields every operation shares](../reference/fields.md#depths).

Rotary work is different: depths hang **from the stock's rotation
center**, not a surface. The **Axis Z** calibration tells the app
where that center sits in machine space — probe it, don't guess.
See [The 4th axis](the-4th-axis.md).

## The A origin

On the rotary axis, zero isn't a place — it's an angle. **A origin
(deg, probed)** on the Stock tab is where the rotation count starts.
Probe it after clamping, so the angle in the preview is the angle
the machine turns to.
