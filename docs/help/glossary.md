---
title: Glossary
---
# Glossary

Machining terms, in plain language, with what each one means in
simple.cam. Pages link here on first use; entries are alphabetical.

If a term is missing, open an issue — or if you're writing a page,
add the entry (follow the two-part format: plain definition, then the
*In simple.cam:* line).

### A axis

The rotary axis: it spins the stock instead of moving a tool. Think
of a lathe spindle built into the CNC bed.

*In simple.cam:* the 4-axis mode mounts the stock on this axis.
Rotary ops write A angles in degrees; [indexing](#indexing) freezes
them.

### adaptive clearing

Deep [roughing](#roughing-pass) that carves smooth looping arcs
instead of straight slots. The tool's engagement stays steady, so it
doesn't jam or overload. Also called trochoidal milling.

*In simple.cam:* deep pockets use it automatically — there's no
switch.

### allowance

Material deliberately left behind so a later, finer pass can remove
it.

*In simple.cam:* split into **side allowance** (a skin on the walls)
and **bottom allowance** (a skin on the floor). Side allowance is
signed: negative cuts past the modeled surface.

### ball-nose

An end mill whose tip is a hemisphere. It cuts smooth curves into
surfaces — the tool that turns stair-steps into flowing shapes.

### CAM

Computer-aided manufacturing: software that turns a 3D model into
the machine instructions that cut it. simple.cam is a CAM app — the
slicer of the CNC world.

### chamfer

A beveled edge: the corner cut off at an angle instead of left
sharp. Cut with a [V-bit](#v-bit) or a chamfer tool.

### chip load

How much material each cutting tooth removes per revolution, in mm.
Too low and the tool rubs and heats; too high and it breaks. The
rule-of-thumb range depends on tool size and material.

*In simple.cam:* the ⚡ popup advises chip load from your tool and
material.

### climb milling

The direction of cut where each tooth takes a slice that starts
thick and thins out. It gives a better finish and less rubbing than
the opposite direction (conventional milling), so CNC work defaults
to it.

*In simple.cam:* always climb — there's no knob.

### collet

The clamp that grips the tool's [shank](#shank) inside the
[spindle](#spindle).

*In simple.cam:* the simulation flags a collet collision before you
ever cut metal.

### crown

The top surface of the stock.

*In simple.cam:* every op's Start/End depth measures **down from the
crown**, not from the model's surface.

### datum

The reference point everything else measures from. Get it wrong and
every dimension is off by the same amount.

*In simple.cam:* an Index op sets the angular (A) datum; thread ops
align their helix to it.

### end mill

The general-purpose flat-tipped cutter — the CNC's "0.4 nozzle",
used for most cutting. Variants: flat, [ball-nose](#ball-nose),
bull-nose (a flat with corner radii).

### engraving

Cutting a shallow line into a surface by following a path with no
side offset — the cutter's centerline *is* the line.

### feed rate

How fast the tool moves through material, in mm/min. "Feeds and
speeds" = feed rate + [spindle](#spindle) RPM together.

### finishing pass

A light final cut at the final size. [Roughing](#roughing-pass)
leaves [allowance](#allowance) behind; finishing removes it. Smoother
and more accurate than trying to do both at once.

### flutes

The cutting edges (teeth) of a mill. More flutes usually means a
finer finish at the same [feed rate](#feed-rate).

### G-code

The machine's instruction language: one command per line, mostly
moves. The post-processor writes it; the Carvera controller reads it.
The equivalent of your printer's `.gcode` file — same idea, bigger
machine.

### G93

Inverse-time [feed rate](#feed-rate): instead of mm/min, the F value
means "do this move in 1/F minutes". Used whenever the A axis moves
together with a straight axis, so speed stays true on curved paths.

### indexing

Rotating the stock to a fixed angle and holding it there, so
ordinary flat cutting can happen at that angle. Like re-fixturing
the part without ever touching it.

### lead-in

The angled or curved path the tool takes into material, instead of
pushing straight down. Prevents snapped tools and marred starts.

*In simple.cam:* entries are ramped or helical, automatic.

### peck drilling

Drilling in steps — a bite, a lift to clear chips, a bite — so deep
holes don't pack with swarf.

### plunge

Feeding the tool straight down into material. Harder on the tool than
cutting sideways, so it runs slower.

### roughing pass

The bulk-removal stage: fast, deep passes that leave a stepped
surface plus [allowance](#allowance) for the [finishing
pass](#finishing-pass). The infill stage of machining — it clears the
bulk, the finish makes it pretty.

### shank

The smooth, non-cutting shaft of a tool above its cutting part. If
the shank hits stock, something breaks.

### spindle

The motor that spins the tool. The business end of the machine — the
CNC equivalent of the hotend assembly, minus the heat.

### step-down

How deep each pass cuts — machining's layer height. Smaller means
finer walls and more passes.

*In simple.cam:* a field on every op with a depth ladder; zero it
out and the op makes a single full-depth pass (see "Finishing pass
only" in the app's op help).

### step-over

How far the tool shifts sideways between adjacent passes — like line
spacing in vase mode. Wider clears material faster but leaves a
rougher surface.

*In simple.cam:* defaults to half the tool's diameter on area-clearing
ops — a conservative bite.

### stock

The blank you start from: a box or a cylinder of raw material.
Machining subtracts from it; printing adds to the bed.

### swarf

The chips coming off a cut. "Swarf finishing" means the tool's flank
lies flat against the surface as it cuts — smooth, precise, and only
possible where the tool can reach.

### tabs

Small bridges of material left holding a cut-out part to the stock
until the job is done. Like the tags holding a model-kit part in its
sprue.

### toolpath

The route the tool follows — a list of moves the machine replays.
One per operation, drawn in the preview, colored by op.

### V-bit

A cone-tipped cutter. Engraves fine lines and cuts [chamfers](#chamfer);
the tip angle sets how deep-and-wide each pass ends up.

### work origin

The job's zero point: X0, Y0, Z0 (and A0 in 4-axis). Every
coordinate counts from it — like homing your printer before a print.

*In simple.cam:* set with the stock: where it sits and, in 4-axis,
the probed A-origin and axis height.
