/**
 * Per-op help texts (2026-11-11): the Ops panel's explanatory paragraphs
 * moved OUT of the form and behind each op's ⓘ button — the popup says
 * what the op does and what its knobs mean. The wording carries over the
 * field-level hints that used to sit in the panel.
 */

import type { JobOp } from '../core/types';
import { OP_KINDS } from './jobGeneration';

export const OP_HELP: Record<JobOp['kind'], string> = {
  // ---- flat ops
  pocket:
    'clears the selected faces or holes to the end depth: depth boxes run the band, the ' +
    'ladder steps down, and step-over spaces the passes. The region is the selection ' +
    'offset by the side allowance (roughing wall stock); the tail-stock toggle adds one ' +
    'step-over past the outline. Depths are below the stock top · start = end → single ' +
    'finishing pass · allowance = stock left for finishing · a floor ⇩ pick links the ' +
    'depth to a feature (it moves with the model).',
  profile:
    'cuts AROUND the selection: the tool rides the outline offset by the side allowance ' +
    '(signed — negative turns a boss down), with the bottom allowance leaving floor ' +
    'stock. Tabs (bridges) hold the part in place when cutting through; clear-to-stock ' +
    'sweeps the waste frame out to the stock wall. Depth boxes and the finishing-only ' +
    'collapse behave like the pocket.',
  drill:
    'pecks the selected holes straight down: peck depth splits the hole into retracting ' +
    'chip-clearing segments, and the plunge feed comes from the drill row of the preset ' +
    'table. Point angle (drill tools) sets the tip geometry.',
  chamfer:
    'adds a new chamfer through the selected edge (direction = which way the wall ' +
    'extends); existing rides a chamfer already in the model — direction selects which ' +
    'end you clicked: the bottom edge (up) traces that circle exactly, the top edge ' +
    '(down) traces down-and-in by depth. Select circles, or a face to chamfer its ' +
    'outline; width follows the bit’s angle.',
  engrave:
    'follows the selected artwork paths at depth — no tool offset, the centerline IS ' +
    'the path. The frame comes from the artwork itself: flat artwork cuts in its ' +
    'plane, wrapped artwork cuts around its own Ø (point that at the faced surface — ' +
    'the Model tab). Drop an SVG/DXF on the viewport to add artwork; a V-bit or small ' +
    'flat bit is usual. FILL mode raster-clears the selected closed painted regions — ' +
    'scanlines along the machine’s fast X (axial on a wrapped logo), a hole inside a ' +
    'filled loop stays clear — with the scan spacing defaulting to the tool’s tip ' +
    'width. LASER: one pass at the tool’s focus height — depth is ignored, power comes ' +
    'from the tool (or the ⚡ override) and lands as the S word on the cut lines.',
  slicePocket:
    'clears the model’s cross-section at the slice depth (the violet plane, drag it in ' +
    'the viewport): put it where the body is clean, away from rounded or chamfered ' +
    'tops. Inside pockets the section’s interior over the depth band; outside rides a ' +
    'profile around it (the ring may cross the stock edge); clear-to-stock also sweeps ' +
    'the waste frame to the stock wall. The cut runs start → end depth over that one ' +
    'shape; features that change inside the band keep their slice’s silhouette.',
  waterline:
    'roughs the whole model in constant-Z waterline levels from the stock crown down ' +
    'to the model floor — or the max depth, if set. No selection needed; works in ' +
    '4-axis indexed mode too (run several with index rotations between them to rough ' +
    'around a part). Each level clears everything the tool can reach around the model’s ' +
    'section, minus the union of every cross-section ABOVE the level’s cut plane — ' +
    'overhangs are keep-out, nothing is ever programmed underneath them. Allowance is ' +
    'BOTH-axis roughing stock for a finishing op: every level’s cut plane rises by it ' +
    'and its clearing region insets from the model contour. Follow with a finishing op ' +
    '(allowance 0). Scrub (finishing-only) touches only where the tool TOUCHES the ' +
    'model — the contour band around every section ring plus the flats exposed to the ' +
    'next slice; waste clears only where the ladder bottoms out. Max depth pre-fills ' +
    'from the tool’s flute length (deeper puts the shaft and collet into standing ' +
    'stock).',
  rasterContour:
    'the paired SURFACE pass to the waterline contour: a heightmap of the model is ' +
    'taken by downward raycasts, dilated with the tool’s kernel (flat disc / ball ' +
    'hemisphere) so every sweep clears to the tool-compensated surface, and cut in ' +
    'serpentine rows — cutting only where material sits above the surface (no air ' +
    'cutting). No selection, no depth boxes: the stock crown is the ceiling, the ' +
    'model’s surface sets every z. Run it after a waterline contour with allowance: ' +
    'this op’s allowance is the only rough-vs-finish knob — 0 cuts to the model ' +
    'surface. Row angle 0 = rows along X; 90 = along Y; a 0° + 90° pair gives the ' +
    'cross-hatch finish.',
  threadMill:
    'single-profile thread mill, cut bottom-up in one helix per start (a full second ' +
    'spring pass, like Makera’s own 14×1 example). The fit is radial: tolerance shifts ' +
    'the helix, the tool cuts its own full form. Step over 0 = the full form in one ' +
    'pass; set it to split the form into radial steps for tough materials. Internal ' +
    'retract picks itself — pull aside and lift when the cleared bore has room, follow ' +
    'the spiral out when it doesn’t. Rotation names the thread like the 4-axis Thread ' +
    'op does. The ⇩ prefills Ø/pitch/length from a picked rim or wall.',
  // ---- rotary ops
  index:
    'rotates the stock to an absolute datum angle — every op below runs in that ' +
    'rotated frame (a pocket after an index cuts the rotated face). The stock freezes ' +
    'at this A until the next index. Shortest-path: the axis never unwinds previous ' +
    'ops’ turns.',
  faceCylinder:
    'turns the stock down to the target Ø — the 4-axis lathe. X range and target Ø ' +
    'default from the stock (narrow the X range to avoid vice jaws); target Ø starts ' +
    'at a 0.5mm skim, set it to your finished size. Step over defaults to 0.5·tool Ø ' +
    '(the radius, a conservative radial engagement) and spaces rings, passes, or ' +
    'per-rev advance. Three stroke patterns: horizontal (X passes, rapid A steps), ' +
    'vertical (continuous A rings), spiral (one helix per level). Off (default): ' +
    'every level opens and closes with a full 360° edge ring — both end walls cut ' +
    'sharp and flush (a rotary pocket). On (cut-over): the spiral may cut past the ' +
    'end faces.',
  cylChamfer:
    'chamfers edge circles around the stock axis — one full A revolution at the ' +
    'circle’s exact X, the V-bit flank through it, no side to pick (the cone cuts ' +
    'whichever side of X carries material). Depth 0 anchors on the circle and peels ' +
    'the wall above it level by level from the stock surface; a depth slides below the ' +
    'circle from an already-clear rim (width = depth × tan(half the bit angle), the ' +
    'chamfer angle = 90° − half-angle). Face cylinder ops publish their step edges at ' +
    'their target Ø, and the stock its end rims, as selectable green circles; a ' +
    'rod-end chamfer = the end rim + a depth. A BALL-NOSE tool cuts rounded profiles ' +
    'instead: depth 0 anchors on the circle and the upper hemisphere shears a FILLET ' +
    'up-and-to-the-side; a depth plunges a U-shaped channel — depth ≤ the ball’s ' +
    'radius is the true U (depth = radius = full semicircle, width = tool Ø); deeper ' +
    'goes past the equator and the shank flattens the channel walls (warned).',
  spiralCarve:
    'helical grooves about the stock axis — angle off the circumferential direction ' +
    '(90° = axial lines), strands evenly around 360°, spin is where strand 1 starts ' +
    'around the cylinder. Depth climbs a step-down ladder whose levels RETRACE the ' +
    'same groove (the sweep alternates direction so every level deepens the identical ' +
    '3D curve). Width wider than the tool Ø fans parallel passes; width 0 just ' +
    'follows the lines (the tool cuts its own width — V-bit knurling). Defaults from ' +
    'the stock; the ⇩ picks fill the area off the model. G93 inverse-time for every ' +
    'X+A sweep; plunges run G94.',
  thread:
    'external V-bit thread — groove depth derives from pitch, the bit’s angle, and ' +
    'tolerance (crest Ø = nominal − 2·tolerance; grooves cut deeper by it). Editing ' +
    'the nominal Ø fills the standard coarse pitch (M6 → 1.0, M4 → 0.7…); override it ' +
    'freely. Starts = multiple parallel grooves spaced around the cylinder. Fit is empirical — cut ' +
    'a test coupon before committing the part.',
  rotaryCarve:
    'the raster core in the unwrapped (x, θ) frame: a dexel map of the model’s OUTER ' +
    'surface radius is taken by radial raycasts, dilated with the tool’s kernel, and ' +
    'ONE op roughs and finishes — a complete full-wrap sweep at each depth level ' +
    'before descending the ladder, ending at the first level with nothing left to ' +
    'cut, then the finishing pass follows the compensated surface itself. No ' +
    'selection: the whole model on the stock’s rotation axis is the target. A ' +
    'accumulates across wraps (the post keeps the counter small); material behind an ' +
    'air gap along a ray is reported, never left as a silent mystery. Cylinder stock, ' +
    'model on its axis, 4-axis mode. Strategy picks the sweep: horizontal (X passes, ' +
    'rapid A steps), vertical (continuous A rings, rotary-ceiling limited), spiral ' +
    'wrap (one helix per sweep — Makera Studio doesn’t have this one).',
  contour4d:
    'plans its own index angles: no hand-tuned orientation stacks. The planner maps ' +
    'which surface cells each candidate angle can clear (the 30° ladder by default), ' +
    'greedily picks the minimal set that covers the model, and emits a waterline ' +
    'rough at every chosen angle — the chosen angles, the coverage, and the honest ' +
    'unreachable set (deep undercuts no angle reaches) all report in the summary. ' +
    'Clear-to-stock (default on) sweeps the waste between orientations so later ' +
    'angles never plot against loose chunks; the standing grid threads into the next ' +
    'stock-removing op.',
  swarfFinish:
    'the true 4D finish: the tool hugs the surface with ALL FOUR AXES moving — every ' +
    'surface cell rotates to its own contact attitude, whole patches swept as one ' +
    'long monotone-A pass at G93 inverse time. Not fixed angles: the attitude follows ' +
    'the surface everywhere it bends. Kernel by tool: a flat or corn endmill presents ' +
    'the FLANK (the normal against the flute’s side); a ball endmill presents the ' +
    'glancing WINDOW (the normal up, the general-coverage pass that cleans what the ' +
    'side cannot hug). Assumes a rough ran ahead — run a 4D contour or rotary contour ' +
    'at allowance first. The summary reports every cell the envelope cannot reach ' +
    '(twin-blade clips, unreachable normals) — left standing, never silently skipped.',
};

/** the popup's title: the palette label */
export function opHelpLabel(kind: JobOp['kind']): string {
  return OP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}
