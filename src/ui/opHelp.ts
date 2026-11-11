/**
 * Per-op help texts (2026-11-11): the Ops panel's explanatory paragraphs
 * moved OUT of the form and behind each op's ⓘ button. Written for the
 * 3D-printing migrant — short beats, print analogies where they land —
 * while keeping the CAM vocabulary an experienced user searches for
 * (step-down/DOC, step-over, allowance/stock-to-leave, rough vs finish).
 * Rendered as an intro line plus spaced bullet points, never a wall.
 */

import type { JobOp } from '../core/types';
import { OP_KINDS } from './jobGeneration';

export interface OpHelpDoc {
  /** one or two plain sentences: what this op does */
  what: string;
  /** the knobs and the rules, one short beat each */
  points: string[];
}

export const OP_HELP: Record<JobOp['kind'], OpHelpDoc> = {
  // ---- flat ops
  pocket: {
    what: 'Clears a closed area — a pocket — down to a set depth. The workhorse: any flat recess, cavity, or face that needs material gone.',
    points: [
      'Depth — top and bottom of the cut band, measured down from the stock’s top.',
      'Step-down (CNC: “depth of cut”) — how much deeper the tool goes each level.',
      'Step-over — the spacing between passes. Half the tool Ø is a safe default.',
      'Allowance (“stock to leave”) — material kept for a finishing pass. The roughing infill before the final outer-wall pass.',
      'Finishing-only — one full-depth pass; untick when a roughing op already cleared the bulk.',
      'Floor ⇩ — link the depth to a model face; it follows the model if it moves.',
    ],
  },
  profile: {
    what: 'Cuts around a shape following its outline — the CNC version of a print’s perimeter/outer wall. Outside or inside, your pick.',
    points: [
      'Side allowance — signed: positive leaves wall stock; negative trims a boss smaller.',
      'Bottom allowance — floor stock left when not cutting through.',
      'Tabs — little bridges that hold a cut-out part in place, like break-away supports.',
      'Clear to stock — sweeps the leftover frame out to the stock wall.',
      'Depth boxes and the finishing-only collapse behave like the pocket.',
    ],
  },
  drill: {
    what: 'Drills straight down the selected holes, in peck cycles that retract to clear chips.',
    points: [
      'Peck depth — each cycle’s depth before the retract; keep it small in sticky metals.',
      'Plunge feed comes from the drill row of the preset table, not the plunge fraction.',
      'Point angle applies only to real drill bits.',
    ],
  },
  chamfer: {
    what: 'Runs a chamfer bit along selected edges — a small flat where a sharp 90° corner used to be.',
    points: [
      'Direction — “up” traces the bottom edge exactly; “down” offsets down-and-in by the depth.',
      'Select circles, or a face to chamfer its whole outline.',
      'Width comes from the bit’s angle.',
    ],
  },
  engrave: {
    what: 'Traces the artwork’s lines with the tool centreline — a pen plot with a rotating cutter. The line width IS the tool width, so V-bits give thin lines.',
    points: [
      'Flat artwork cuts in its plane; wrapped artwork wraps around the cylinder Ø you point it at (Model tab).',
      'Fill mode — raster-clears closed painted regions with scanlines; holes inside filled loops stay clear.',
      'Laser — one pass at the tool’s focus height; depth is ignored, power rides the S word.',
      'Drop an SVG or DXF on the viewport to add artwork.',
    ],
  },
  slicePocket: {
    what: 'Slices the model at one height and pockets that cross-section — one clean shape that roughs a complicated body.',
    points: [
      'Slice depth — below the crown; drag the violet plane in the viewport to move it.',
      'Inside — pocket the section. Outside — profile around it (the ring may cross the stock edge).',
      'Clear to stock — also sweeps the waste frame out to the stock wall.',
      'Pick a height where the body is clean — away from rounded or chamfered tops.',
    ],
  },
  waterline: {
    what: 'Roughs the whole model in flat slices — CAM’s answer to a print’s layer lines, cut in reverse.',
    points: [
      'Each level clears everything reachable around the model’s section.',
      'Overhangs above a level are keep-out — the tool never goes underneath them.',
      'Allowance — stock to leave on ALL sides for the finishing op (follow with one at allowance 0).',
      'Max depth pre-fills from the tool’s flute length — deeper runs the collet into the work.',
      '4-axis indexed mode works too: run it at several index angles to rough around a part.',
    ],
  },
  rasterContour: {
    what: 'The finishing pass that follows the model’s actual surface — shallow sweeps in parallel rows, like sanding in straight lines.',
    points: [
      'Run it after a waterline rough. Its only rough-vs-finish knob is the allowance — 0 cuts to the surface.',
      'No selection, no depth boxes — the crown is the ceiling, the model sets every depth.',
      'Row angle — 0° runs rows along X, 90° along Y; a 0° + 90° pair gives the cross-hatch finish.',
    ],
  },
  threadMill: {
    what: 'Cuts a thread with a thread mill — a spiral ramp, one full circle per start. For when a tap would never survive the material.',
    points: [
      '⇩ pre-fills Ø, pitch, and length from a picked rim or wall.',
      'Tolerance shifts the helix — the tool cuts its own full profile (a radial fit).',
      'Step over — 0 means the full form in one pass; raise it to split the form for tough materials.',
      'Runs bottom-up; a spring pass re-cuts the final depth.',
    ],
  },
  // ---- rotary ops
  index: {
    what: 'Rotates the stock to an angle and freezes it there — every op below runs on the rotated face. Like re-orienting the print on the bed, mid-job.',
    points: [
      'The datum: a pocket after an Index cuts the rotated face as displayed.',
      'Shortest path — the axis never unwinds the turns earlier ops piled up.',
    ],
  },
  faceCylinder: {
    what: 'Turns the stock down to a target diameter over a stretch of its length — a lathe pass on the 4th axis.',
    points: [
      'Target Ø — starts at a 0.5mm skim of the stock; set your finished size.',
      'X range — narrow it to stay clear of vice jaws.',
      'Step over — defaults to half the tool Ø.',
      'Cut-over — lets the spiral cut past the end faces (no 360° edge rings).',
    ],
  },
  cylChamfer: {
    what: 'Chamfers circles that run around the stock — one full revolution of A at the circle’s exact X.',
    points: [
      'Depth 0 — anchor on the circle and step up from the stock surface.',
      'A depth — drop below an already-clear rim (width = depth × tan of half the bit angle).',
      'Face ops and the stock publish their rims as selectable green circles — a rod end = end rim + a depth.',
      'Ball tools — rounded fillets and U-channels instead of flat chamfers.',
    ],
  },
  spiralCarve: {
    what: 'Cuts helical grooves around the stock — the spiral on a twist pen or a knurled grip.',
    points: [
      'Angle — off the circle direction; 90° gives straight axial lines.',
      'Strands — how many grooves, evenly spaced around 360°; spin sets where strand 1 starts.',
      'Depth — a ladder that re-traces the SAME groove every level (never a mirrored one).',
      'Width — wider than the tool fans parallel passes; 0 = follow the lines (V-bit knurling).',
      'G93 inverse-time on every X+A sweep; plunges run plain G94.',
    ],
  },
  thread: {
    what: 'Cuts a screw thread with a V-bit — the classic lathe thread, wrapped around the stock.',
    points: [
      'Nominal Ø — sets the standard coarse pitch (M6 → 1.0mm…); override freely.',
      'Depth derives from the pitch, the bit’s angle, and tolerance.',
      'Starts — parallel threads spaced around the cylinder.',
      'Fit is empirical — cut a test coupon before committing the part.',
    ],
  },
  rotaryCarve: {
    what: 'Roughs AND finishes a rotary part in one op — slicing the model into vertical revolutions instead of horizontal layers.',
    points: [
      'A radial “heightmap” of the outer surface, dilated by the tool’s shape.',
      'The ladder descends until a level has nothing left to cut, then the finishing pass follows the surface.',
      'Strategy — horizontal rows, vertical rings, or the spiral wrap Makera Studio doesn’t have.',
      'Cylinder stock, model on its axis, 4-axis mode.',
    ],
  },
  contour4d: {
    what: 'Plans its own orientations — no hand-indexing. It works out which angles can reach which surface, then roughs each one.',
    points: [
      'Reports the chosen angles, the coverage %, and the honest unreachable set (deep undercuts).',
      'Clear to stock — sweeps waste between angles so later passes never plot against loose chunks.',
      'Its standing grid threads into the next stock-removing op.',
    ],
  },
  swarfFinish: {
    what: 'The 4-axis finish: the tool tilts to hug the surface with ALL FOUR axes moving — like rolling the cutter along the wall.',
    points: [
      'Flat tools present their side (the flank); ball tools present the glancing window.',
      'Needs a rough ahead — run a 4D contour or rotary contour at allowance first.',
      'Reports every cell it cannot reach — left standing, never silently skipped.',
    ],
  },
};

/** the popup's title: the palette label */
export function opHelpLabel(kind: JobOp['kind']): string {
  return OP_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}
