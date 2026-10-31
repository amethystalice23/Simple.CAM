/**
 * Core job model. Generators consume these types and emit Move[] IR;
 * only the post-processor (src/post) turns IR into G-code text.
 *
 * Units: mm, degrees, minutes. For 4-axis work Z0 is the stock center
 * (the Z1-probed axis datum); cuts run below the surface, which sits at
 * axisZ + stock radius.
 */

export interface Tool {
  id: string;
  name: string;
  type: 'flat' | 'ball' | 'bull' | 'vbit' | 'drill' | 'threadmill' | 'corn' | 'laser';
  /** cutting diameter, mm (for vbit: the large end) */
  diameter: number;
  /** included tip angle, degrees (vbit/engraver) */
  vAngle?: number;
  /** flat tip width, mm (vbit/engraver) */
  tipDiameter?: number;
  /** corner radius, mm (bull) */
  cornerRadius?: number;
  /** shank diameter, mm */
  shaftDiameter?: number;
  /**
   * UNDERCUTTING/T-SLOT HEAD, mm — the wide cutting head some bits carry
   * just above the flute (a T-slot cutter: head wider than the shaft). The
   * carve simulator models it as a contact band above the flute (collision
   * honesty — her 2026-10-26 ask: "a head wider than the shaft"); no tool
   * type sets it yet.
   */
  headDiameter?: number;
  /** head length above the flute, mm — see headDiameter */
  headLength?: number;
  /** flute length, mm */
  fluteLength?: number;
  /** overall length, mm */
  overallLength?: number;
  flutes?: number;
  /** cutter material, e.g. 'carbide' */
  material?: string;
  /** grouping family for listings, e.g. 'Spiral O · Metal', 'Drill' */
  subtype?: string;
  /** drill point angle, degrees (drill) */
  drillPointAngle?: number;
  /** thread pitch, mm (threadmill) */
  pitch?: number;
  /** LASER: focus/standoff height the head rides at above the surface, mm */
  focus?: number;
  /**
   * Makera's per-tool, per-material cutting presets (imported from the
   * Fusion start-values; see scripts/import-makera-tools.mjs). Generation
   * prefers the preset matching the stock material, falling back to the
   * material-preset tables.
   */
  presets?: ToolPreset[];
  /**
   * Spindle speed, RPM — for a LASER tool this slot is the beam POWER
   * in percent (documented reuse: the whole ⚡→preset→tool resolution
   * chain is shared, and per-material presets give per-material power).
   * The post emits it as the 0–1 S fraction, never an `S<rpm> M3` line.
   */
  spindleRpm: number;
}

export interface ToolPreset {
  /** preset material name, e.g. 'Aluminum' */
  material: string;
  spindleRpm: number;
  /** XY feed, mm/min */
  feed: number;
  plungeFeed: number;
  /** Makera's recommended axial DOC for this tool+material, mm */
  stepDown: number;
  rampFeed: number;
}

export interface AxisWords {
  x?: number;
  y?: number;
  z?: number;
  a?: number;
}

/**
 * One machine move. `feed` is the F word to emit, ALWAYS explicit.
 * Its unit is decided by the post-processor per move:
 *  - a move coordinating A with any linear axis requires G93 (inverse time):
 *    feed = 1/minutes for that move
 *  - everything else runs in G94: feed = mm/min
 * See docs/PLAN.md — community firmware halts on a G93 line without F.
 */
export interface Move {
  words: AxisWords;
  /** F word (unit per the G93/G94 rule above) */
  feed: number;
  /** G0 rapid (ignores feed) */
  rapid?: boolean;
  comment?: string;
  /**
   * Spindle speed to (re)start before this move, RPM — the effective rate
   * (tool default, or the op's ⚡ override) stamped on an op's first move;
   * the post emits Makera's own `S<rpm> M3` line when it changes.
   */
  spindleRpm?: number;
  /**
   * LASER beam power as a 0–1 fraction (docs/makera-dialect.md "Laser
   * job"): the modal S word on G1s — G0 never fires the beam. Stamped on
   * each path's first cut and as 0 to extinguish before travels; the post
   * emits S on change and brackets the op with M321/M322.
   */
  power?: number;
  /**
   * Set on an op's FIRST move by the export pipeline: the op's 1-based
   * position in the exported job, its display name, and the controller
   * tool number (user-editable; the controller shows it on the T<n> M6
   * prompt). The post emits `;@MKR|TOOLPATH_START` markers and tool-change
   * blocks (`M5` / `; T<n>-<name>` / `T<n> M6`) from these. Untagged move
   * lists — e.g. bare post tests — emit none of that.
   */
  op?: { number: number; name: string; toolNumber: number };
}

/** True when a move coordinates A with a linear axis (needs G93). */
export function isSimultaneous(m: Move): boolean {
  const w = m.words;
  return w.a !== undefined && (w.x !== undefined || w.y !== undefined || w.z !== undefined);
}

export type FeedMode = 'G93' | 'G94';

/**
 * Probe-derived rotary calibration (established by the controller:
 * M465.1 leveling, M469.x center calibration — we only consume it).
 */
export interface RotaryCalibration {
  /** probed angular zero of the stock, degrees */
  aOriginDeg: number;
  /**
   * Machine Z of the stock center (the rotation axis). This is the 4th-axis
   * Z datum: the Z1 probe on the motor block with known offsets — the same
   * origin Makera Studio places. The stock surface is at axisZ + effectiveRadius.
   */
  axisZ: number;
  /** measured stock radius, mm (from probe or stock spec) */
  effectiveRadius: number;
}

/**
 * Where the job origin (machine 0) sits along a stock dimension.
 * 'min' = at the low end, 'mid' = centered, 'max' = at the high end.
 */
export type OriginEdge = 'min' | 'mid' | 'max';

/**
 * Machine-coordinate span [start, end] of a stock dimension of `size` mm,
 * given where the job origin sits. E.g. a 100mm stock with origin 'max'
 * spans X −100…0 (the far end is at −100, the origin at 0).
 */
export function originSpan(origin: OriginEdge, size: number): readonly [number, number] {
  switch (origin) {
    case 'min':
      return [0, size];
    case 'max':
      return [-size, 0];
    case 'mid':
      return [-size / 2, size / 2];
  }
}

/**
 * Machine capability of the job — orthogonal to stock shape: a cylinder can
 * sit in a vise (3-axis), a box can ride the rotary axis (4-axis).
 */
export type AxisMode = '3-axis' | '4-axis';

/**
 * Rotary geometry of the stock for 4-axis work. Cylinders carry their
 * probed calibration; a box's geometry is derived — it behaves as a
 * cylinder whose radius is half the Y-Z diagonal (the corners are the
 * max radius; flats sit inside that circle, so facing cuts air over the
 * flats before engaging corners — conservative, never gouges).
 */
export function rotaryCalibrationOf(stock: Stock): RotaryCalibration {
  if (stock.kind === 'cylinder') return stock.calibration;
  const [z0, z1] = originSpan(stock.origin.z, stock.sizeZ);
  return {
    aOriginDeg: 0,
    axisZ: (z0 + z1) / 2,
    effectiveRadius: Math.hypot(stock.sizeY, stock.sizeZ) / 2,
  };
}

export type Stock =
  | {
      kind: 'box';
      sizeX: number;
      sizeY: number;
      sizeZ: number;
      /** job origin (machine 0,0,0) location within the box, per axis */
      origin: { x: OriginEdge; y: OriginEdge; z: OriginEdge };
      /** box has no stored calibration — rotaryCalibrationOf derives it */
      axisMode: AxisMode;
      materialId: string;
    }
  | {
      kind: 'cylinder';
      /** stock length along its axis: X in 4-axis (rotary), height along Z
       * in 3-axis (the cylinder stands vertical) */
      length: number;
      /** where machine 0 sits along the stock axis: X0 in 4-axis, Z0 in 3-axis */
      xOrigin: OriginEdge;
      /** rotation axis is machine X (4th axis parallel to X, verified) */
      calibration: RotaryCalibration;
      axisMode: AxisMode;
      materialId: string;
    };

/** Face a cylinder down to a target diameter ("4D lathe" turning). */
export interface FaceCylinderOp {
  kind: 'faceCylinder';
  id: string;
  toolId: string;
  /** finished diameter, mm */
  targetDiameter: number;
  /** axial sweep, machine X, mm */
  xStart: number;
  xEnd: number;
  /** radial depth per roughing pass, mm */
  stepDown: number;
  /**
   * FINISHING PASS ONLY (Alice, 2026-10-26): skip the roughing ladder —
   * one pass straight to the target Ø. The step-down is ignored; the op
   * assumes the bulk is already gone (a roughing op or a previous run).
   */
  finishingOnly?: boolean;
  /**
   * Step-over, mm — the shared pass spacing for all patterns: axial ring
   * spacing ('vertical'), indexed-pass arc length at the cut radius
   * ('horizontal'), axial advance per revolution ('spiral').
   */
  stepOver: number;
  /** plunge feed for Z steps, mm/min (G94) */
  plungeFeed: number;
  /** radial material left for the finishing pass, mm */
  finishAllowance: number;
  /** direction of continuous A rotation */
  rotation: 'cw' | 'ccw';
  /**
   * Cut pattern for each depth level (see docs/PLAN.md):
   * - 'vertical': rings — a full A revolution at each X; X steps by the
   *   step-over between rings
   * - 'horizontal': indexed passes — a full X sweep at each A; A steps by
   *   the step-over arc between passes
   * - 'spiral': one continuous helix — A advances with the X sweep, depth
   *   steps happen in the cut at the sweep ends
   */
  pattern: 'vertical' | 'horizontal' | 'spiral';
  /** cut feed for pure-linear cutting moves (G94 mm/min): horizontal X sweeps */
  feed: number;
  /** rapid clearance above the stock surface, mm — ⚡ override, else the default */
  clearance?: number;
  /**
   * Allow the tool to cut past the stock's end faces (Alice, 2026-10-27):
   * OFF (default) = a rotary pocket — every level opens and closes with a
   * full 360° edge ring at the level's entry/exit X, so both end walls cut
   * sharp and flush and the helical entries dive into pre-cleared air;
   * ON = the spiral may overhang the ends (the helical ramp entries are
   * the point, nothing past the end faces gets cleared).
   */
  cutBeyondStock?: boolean;
}

/**
 * Carve helical grooves into a cylinder about the stock axis (PLAN.md
 * Phase 2, wrapped-groove family). Strands are multi-start helices at
 * `spiralAngle` off the circumferential direction; depth is a step-down
 * ladder whose levels retrace the same helix; width beyond the tool
 * Ø fans parallel helices axially. X+A sweeps run G93 from the rotary
 * limit (src/cam/spiralCarve.ts).
 */
export interface SpiralCarveOp {
  kind: 'spiralCarve';
  id: string;
  toolId: string;
  /** the cylinder surface the spiral cuts into: R = diameter/2 */
  surfaceDiameter: number;
  /** axial operating area */
  xStart: number;
  xEnd: number;
  /** helix angle off the circumferential direction, degrees (90 = axial) */
  spiralAngle: number;
  /** strands evenly spaced around 360° (multi-start) */
  count: number;
  /** groove depth below the surface, mm */
  depth: number;
  /** target groove width, mm — wider than the tool Ø fans parallel passes */
  width: number;
  /** axial depth-per-level ladder, mm */
  stepDown: number;
  /** direction of A advance */
  rotation: 'cw' | 'ccw';
  /** G94 mm/min — axial sweeps (a 90° spiral) and fan re-positioning */
  feed: number;
  /** G94 plunge feed at the strand starts */
  plungeFeed: number;
  /** rapid clearance above the stock surface, mm — ⚡ override, else the default */
  clearance?: number;
  /** starting A of strand 1, degrees — rotates the whole strand pattern
   *  around the cylinder (spacing between strands is preserved); stacks
   *  additively with the index datum. Default 0 = first strand at the datum. */
  spin?: number;
}

/**
 * External thread cut with a V-bit on the rotary axis (PLAN.md Phase 2).
 * The cylinder is defined like the spiral carve (Start/End X + a
 * diameter — here the NOMINAL diameter); groove depth and the crest
 * diameter derive from pitch, the tool's tip angle, and tolerance
 * (src/cam/thread.ts). Levels retrace the same
 * helix at identical absolute A phase; a spring pass finishes each start.
 */
export interface ThreadOp {
  kind: 'thread';
  id: string;
  toolId: string;
  /** the thread's nominal diameter, mm */
  nominalDiameter: number;
  xStart: number;
  xEnd: number;
  /** tooth-to-tooth distance, mm (lead = starts × pitch) */
  pitch: number;
  /** thread starts (multi-start: 360°-spaced helices) */
  starts: number;
  /** fit allowance: tenths of a mm shrinking the teeth (deeper grooves +
   * a smaller crest diameter), 0 = nominal geometry */
  tolerance: number;
  /** axial depth-per-level ladder for the grooves, mm */
  stepDown: number;
  rotation: 'cw' | 'ccw';
  /** target surface speed at the CUTTING depth, mm/min along the groove:
   * per-level G93 timing holds it constant as the grooves deepen (the
   * cutting radius shrinks, so A runs faster level by level), never above
   * the machine's rotary ceiling */
  feed: number;
  /** G94 plunge feed at the start entries */
  plungeFeed: number;
  /** the surface the depth ladder starts from, mm Ø — the faced crest
   * Ø when a facing op precedes; null = the stock surface */
  surfaceDiameter: number | null;
  /** rapid clearance above the stock surface, mm — ⚡ override, else the default */
  clearance?: number;
}

/**
 * Internal/external threads cut with a single-profile thread mill in
 * machine XYZ — no A, G94 throughout (PLAN.md ops table, 2026-10-28).
 * Mill-tested ground truth: examples/MakeraStudioGHM9_Stage3_TOP…
 * `[T6]14ccw thread` — external M14×1 CCW, Ø4.75 mill. Their cycle:
 * plunge beside the boss to the thread BOTTOM, RADIAL feed in to the
 * helix radius (the entry notch is the bottom groove), ASCENDING helix
 * one pitch per revolution, straight rapid up at the top; the whole
 * cycle runs twice (spring = a full second pass). Path radius pinned by
 * that file: 8.76 = d3/2 + toolR, d3 = ISO 724 EXTERNAL minor
 * (nominal − 1.2268·p). FIT IS RADIAL — a full-form tool cuts its own
 * profile, so tolerance shifts the helix radius, never the depth:
 * external Rc = d3/2 + toolR − tolerance, internal Rc = nominal/2 −
 * toolR + tolerance (tips at the major). Rotation: cw/ccw thread
 * perception, the rotary Thread op's naming (Alice, 2026-10-28: "dont
 * use right-hand/left-hand as the other thread tool uses cw/ccw, so be
 * consistant") — 'ccw' = left-hand (the 14ccw example: helix
 * CW-viewed-from-above ascending), 'cw' = right-hand.
 */
export interface ThreadMillOp {
  kind: 'threadMill';
  id: string;
  toolId: string;
  targets: ThreadMillTarget[];
  /** the thread's nominal (major) diameter, mm */
  nominalDiameter: number;
  /** tooth-to-tooth distance, mm (lead = starts × pitch) */
  pitch: number;
  /** thread starts (multi-start: starts helices offset one pitch) */
  starts: number;
  /** fit allowance, mm: internal + (deeper grooves → looser nut),
   * external − (thinner teeth → looser bolt) */
  tolerance: number;
  /** cw/ccw thread perception — 'ccw' = left-hand, 'cw' = right-hand */
  rotation: 'cw' | 'ccw';
  /**
   * RADIAL depth per pass, mm — 0 (default) = the full form in ONE
   * radial pass (the Makera cycle); > 0 ladders the form in even
   * steps for tough materials (Alice, 2026-10-28): each level runs
   * the full thread bottom-up, the last at the final radius, the
   * spring repeating the final level.
   */
  stepOver: number;
  /** XY cut feed, mm/min (G94) */
  feed: number;
  /** plunge feed for the approach descent, mm/min (G94) */
  plungeFeed: number;
  /** rapid clearance above the rim/face, mm */
  safeClearance: number;
}

/** One thread, machine space. */
export interface ThreadMillTarget {
  /** machine XY of the thread axis */
  center: Vec2;
  /** internal (bore) or external (boss) */
  internal: boolean;
  /** thread start, machine Z — the rim/face the thread runs down from */
  topZ: number;
  /** thread length downward, mm (> 0) */
  depth: number;
  /**
   * Internal only: the radius the PREP bore is actually cut to, mm —
   * the aside-room retract decision reads it (boreR − toolR vs margin).
   * Default/0 = the ISO minor radius (the prep the op itself recommends);
   * a CAD bore already at size or a user-picked larger drill leaves more
   * room and the tool lifts instead of unwinding.
   */
  boreRadius?: number;
}

/** One chamferable edge: a circle coaxial with the stock axis. */
export interface CylChamferEdge {
  /** machine X of the edge circle — fixed through the whole cut */
  x: number;
  /** the circle's Ø, mm — the tip lands at Ø/2 − depth */
  diameter: number;
}

/**
 * Chamfer edge circles coaxial with the rotary axis (docs/edge-tracing.md
 * §6): a V-bit parked at the circle's exact X, swept one full A revolution
 * per level with its tip at Ø/2 − depth — the degenerate face-cylinder
 * vertical ring (one X, one ring per level). The depth IS the direction:
 * - 0 — the tip anchors exactly on the circle; the flank shears whatever
 *   rises above it on either side of X (a step wall, the root of an
 *   existing chamfer). The wall's height is deliberately unknown (the
 *   one-circle rule), so levels descend from the stock surface — air
 *   sweeps are harmless and the wedge peels at stepDown increments.
 * - > 0 — the circle is the highest point; the tip slides below it and
 *   the flank opens outward (a rod end, the top of a modelled chamfer).
 *   The ladder tops out at the circle itself.
 */
export interface CylChamferOp {
  kind: 'cylChamfer';
  id: string;
  toolId: string;
  edges: CylChamferEdge[];
  /** tip depth below the anchor circle's Ø, mm (0 = anchor on it) */
  depth: number;
  /** radial step-per-level, mm */
  stepDown: number;
  /** G94 plunge feed at the level entries, mm/min */
  plungeFeed: number;
  /** direction of the A sweep */
  rotation: 'cw' | 'ccw';
  /** rapid clearance above the stock surface, mm — ⚡ override, else the default */
  clearance?: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Detected features — see docs/edge-tracing.md. Model-space geometry. */
export interface PlaneFeature {
  kind: 'plane';
  id: string;
  point: Vec3;
  normal: Vec3;
}

export interface CircleFeature {
  kind: 'circle';
  id: string;
  center: Vec3;
  /** loop normal (Newell); sign distinguishes outer boundaries from holes */
  axis: Vec3;
  radius: number;
  /** true when the loop bounds material outside it — an interior hole */
  inner: boolean;
  /** Present only on PARTIAL circles — a circle reconstructed from broken
   * rim fragments (a cylinder with flats or flutes cut in): the surviving
   * vertex chains, model space, in loop order. Absent = a full circle.
   * The Ø picks and snapping treat fragments exactly like full circles;
   * the path-following ops (chamfer/pocket/drill) refuse them — a broken
   * rim bounds neither a disc nor a 360° path. */
  arcs?: Vec3[][];
}

export interface EdgeFeature {
  kind: 'edge';
  id: string;
  a: Vec3;
  b: Vec3;
}

/** Artwork line work: one flattened polyline from an imported SVG, in
 * the SOURCE's local space like every other feature kind. */
export interface PathFeature {
  kind: 'path';
  id: string;
  points: Vec3[];
}

/** A circle whose loop is an interior hole aligned to the machine drill axis. */
export interface HoleFeature {
  kind: 'hole';
  id: string;
  center: Vec3;
  diameter: number;
}

export type Feature = PlaneFeature | CircleFeature | EdgeFeature | HoleFeature;

/**
 * User-added operation targets — roughing volumes, tabs, keep-out regions.
 * See docs/edge-tracing.md §4. `position` in the transform is the primitive's
 * center (not an arbitrary origin), machine coordinates.
 */
export type Primitive =
  | {
      kind: 'cylinder';
      id: string;
      /** axis ∥ machine X (the stock rotation axis) */
      diameter: number;
      length: number;
      /** creation-time dimensions, for the revert buttons */
      original: { diameter: number; length: number };
      transform: ModelTransform;
    }
  | {
      kind: 'box';
      id: string;
      size: Vec3;
      /** creation-time dimensions, for the revert buttons */
      original: Vec3;
      transform: ModelTransform;
    }
  | {
      kind: 'artwork';
      id: string;
      /** flattened line work, user units, SVG orientation (u right, v
       * DOWN) — the import parse output, kept raw so the scale knob
       * stays live */
      paths: Vec2[][];
      /** document extent, user units (centering + the scale math) */
      width: number;
      height: number;
      presentation: 'flat' | 'wrapped';
      /** wrapped: the artwork's OWN cylinder Ø — the cutting surface
       * declaration. Pre-filled from the stock at drop time, then
       * independent: face first, then point this at the new surface. */
      wrapDiameter: number;
      /** wrapped: the TOTAL angle the document width wraps — the
       * angular picture is the invariant, so changing the Ø never
       * rescales the logo (mm/unit derives: arc(width) = wrapAngle) */
      wrapAngle: number;
      transform: ModelTransform;
    };

/**
 * Clear a 2D region in stepped Z levels with contour-parallel passes
 * (tool-center paths inset from the region by the tool radius, then by
 * stepOver). Regions are machine-space XY contours, outer CCW / holes CW
 * (the slicing convention).
 */
export interface PocketOp {
  kind: 'pocket';
  id: string;
  toolId: string;
  regions: Vec2[][];
  /**
   * The XY clamp contours (CCW) — the stock footprint, or a DELIBERATELY
   * DILATED one when cut-over is on. Present: tool-center paths clamp
   * inside it; absent: paths run unclamped (profile's cut-over ON keeps
   * its loops intact).
   */
  footprint?: Vec2[][];
  /** machine Z the pocket starts from (surface) */
  topZ: number;
  /**
   * Machine Z for INTER-PASS RAPID TRAVEL, mm — default topZ + safeClearance.
   * Set by callers whose cut band sits below standing material the surface
   * reference doesn't account for (the waterline rough: its bands descend
   * the model, but the uncleared stock OUTSIDE the clearing region and the
   * keep-out islands inside it both stand to the stock crown — a travel at
   * band-top height sweeps laterally through them).
   */
  travelZ?: number;
  /** machine Z of the pocket floor */
  floorZ: number;
  /** axial depth per level, mm */
  stepDown: number;
  /** radial step-over between clearing passes, mm */
  stepOver: number;
  /** XY cut feed, mm/min (G94) */
  feed: number;
  /** plunge feed, mm/min */
  plungeFeed: number;
  /** rapid clearance above topZ, mm */
  safeClearance: number;
  /**
   * Finishing pass (Alice, 2026-10-26): the ladder is collapsed to ONE
   * level at the floor and the bulk above it is ASSUMED already removed
   * — the entry descends through air and plunges straight (entry.ts),
   * never ramping at material that is not there.
   */
  finishingOnly?: boolean;
  /**
   * HONEST APPROACH CEILING (2026-10-30, the 4D contour's yellow streaks):
   * machine Z of the tallest standing material under the entry disc's
   * footprint, when the caller KNOWS it (the waterline rough with a
   * standing-stock grid — a trimmed orientation's previous levels may have
   * cleared nothing above the band top, so the ladder assumption behind
   * topZ is broken). Raises the approach rapid's stop plane and the entry
   * ramp's fresh-material bound; the ladder itself is untouched. Absent:
   * topZ is the honest surface, exactly today's behavior.
   */
  approachCeiling?: number;
}

/** Peck-drill hole centers. Emitted as explicit G0/G1 moves (no cycles). */
export interface DrillOp {
  kind: 'drill';
  id: string;
  toolId: string;
  targets: { x: number; y: number; topZ: number; depth: number }[];
  /** peck increment, mm; 0 = single continuous plunge */
  peckDepth: number;
  /** plunge feed, mm/min */
  plungeFeed: number;
  /** rapid clearance above each hole, mm */
  safeClearance: number;
}

/** Cut-out tabs: N uncut bridges spanning the groove, holding the part to
 *  the surrounding stock. Deep levels (below floorZ + height) cut SPANS
 *  between the tabs; shallower levels cut through unbroken. */
export interface ProfileTabs {
  /** bridges around the contour (clamped to what the perimeter fits) */
  count: number;
  /** bridge height above the profile floor, mm */
  height: number;
  /** bridge length along the contour, mm */
  length: number;
}

/**
 * Follow a contour as a wall pass: tool center offset to one side of the
 * line (outside grows the contour, inside shrinks it, online follows it
 * exactly). Contours are machine-space XY, closed (outer CCW / holes CW).
 */
export interface ProfileOp {
  kind: 'profile';
  id: string;
  toolId: string;
  contours: Vec2[][];
  /**
   * The declared stock's XY outer contours (CCW).
   * Present: the wall pass clamps to it — open spans at the stock edge
   * (cut-over OFF). Absent: the loop runs unclipped, kept intact even
   * past the stock (cut-over ON / old saves).
   */
  footprint?: Vec2[][];
  side: 'outside' | 'inside' | 'online';
  /**
   * ROUGHING stock RAISED ON THE FLOOR, mm — the cut floor lifts by it.
   * The old single `allowance` moved BOTH axes at once (floor AND wall);
   * split per Alice, 2026-10-28: "allowance i dont want to change as it
   * is height as well as width, which would mean unseen consequences."
   * Forced ≥ 0 — a negative bottom would cut below the declared floor.
   */
  bottomAllowance: number;
  /**
   * RADIAL stock outside the tool path, mm — SIGNED. Positive leaves wall
   * stock for a finishing pass; negative steps the tool-center path
   * INSIDE the contour line, turning a boss down below its modeled Ø
   * (the thread-prep case: land the crest at `nominal − 2·tolerance`,
   * the ISO-fit major — Alice, 2026-10-28). The path offset is
   * `toolR + sideAllowance`, whichever sign.
   */
  sideAllowance: number;
  /** machine Z the pass starts from (surface) */
  topZ: number;
  /** machine Z of the profile floor */
  floorZ: number;
  /** axial depth per level, mm */
  stepDown: number;
  /** XY cut feed, mm/min (G94) */
  feed: number;
  /** plunge feed, mm/min */
  plungeFeed: number;
  /** rapid clearance above topZ, mm */
  safeClearance: number;
  /** cut-out tabs — absent = cut through in one piece (src/cam/profile.ts) */
  tabs?: ProfileTabs;
  /**
   * Finishing pass (Alice, 2026-10-26): the ladder is collapsed to ONE
   * full-depth level and the bulk above it is ASSUMED already removed —
   * the entry descends through air and plunges straight (entry.ts),
   * never ramping at material that is not there.
   */
  finishingOnly?: boolean;
}

/**
 * One chamfer path: a closed loop the V-bit flank is placed through.
 * 'circle' loops are analytic (hole rims, boss outlines); 'poly' loops
 * are face outlines (planeLoops) that didn't circle-match.
 * materialOutside orients the 'auto' side per loop.
 */
export type ChamferLoop =
  | { kind: 'circle'; center: Vec2; radius: number; z: number; materialOutside: boolean }
  | { kind: 'poly'; points: Vec2[]; z: number; materialOutside: boolean };

/**
 * Cut a chamfer along edge loops with a V-bit/chamfer tool. The cone
 * flank passes through the anchor loop: tip Z is depth d beyond the
 * loop's plane (down or up along the wall), tool-center path is the loop
 * offset rt (the flat-tip radius) toward the chosen side — the tip's far
 * edge lands on the loop at the chamfer's deepest point, and the flank
 * meets the anchor plane at width d·tan(vAngle/2).
 */
export interface ChamferOp {
  kind: 'chamfer';
  id: string;
  toolId: string;
  loops: ChamferLoop[];
  /**
   * 'add': the selected edge is a sharp corner — cut a new chamfer through
   * it (flank through the anchor, tip depth below at the anchor radius).
   * 'existing': the model already has the chamfer — the DIRECTION option
   * selects which end was clicked: 'up' = the bottom edge, traced exactly
   * (depth ignored); 'down' = the top edge, tip slides down-and-in by
   * depth·tan(vAngle/2) along the modelled face.
   */
  mode: 'add' | 'existing';
  /** 'auto' resolves per loop from materialOutside; the others override */
  side: 'auto' | 'inside' | 'outside';
  /**
   * Which way the wall extends from the edge ('add'), or which end of the
   * modelled chamfer was selected ('existing'): 'up' = bottom edge
   * (traced exactly), 'down' = top edge (slides by depth).
   */
  direction: 'down' | 'up';
  /** chamfer reach along the wall from the anchor loop's plane, mm */
  depth: number;
  /** XY cut feed, mm/min (G94) */
  feed: number;
  /** plunge feed, mm/min (G94) */
  plungeFeed: number;
  /** rapid clearance above the anchor plane, mm */
  safeClearance: number;
}

export type Operation =
  | FaceCylinderOp
  | SpiralCarveOp
  | ThreadOp
  | ThreadMillOp
  | PocketOp
  | DrillOp
  | ProfileOp
  | ChamferOp;
// Phase 1 adds: engrave | indexedPocket
// Phase 2 adds: thread | wrappedGroove

/**
 * An operation in the job sequence: user-editable state that generation
 * resolves against the selection, stock, and tool (src/ui/jobGeneration.ts).
 * Feeds/step-downs come from material presets × tool type at generation
 * time — per-type parameters worth exposing live here, and cutting-rate
 * deviations from the tool defaults live in `rates`.
 */
/**
 * The parameter varied along one dimension of a calibration-coupon matrix
 * (src/cam/testPattern.ts — the Calibration dialog). On rotary stock row
 * = strand (around the cylinder), col = X grouping; on flat stock row =
 * Y, col = X. The parameter not on an axis holds the tool-preset default
 * for every cell, so it never confounds the matrix.
 */
export type MatrixParam = 'spindleRpm' | 'feed' | 'stepDown' | 'stepOver';

export interface JobOpBase {
  id: string;
  toolId: string;
  /** selected feature ids feeding this op */
  featureIds: string[];
  /**
   * Per-op cutting-rate overrides — "this one operation is a bit different".
   * Unset fields fall back to the tool + stock-material preset values (the
   * Tools tab) at generation time; the ops-panel popup edits these. Kept on
   * a tool change on purpose (the popup shows the deviation from the new
   * tool's defaults); job files carry it as-is.
   */
  rates?: OpRates;
}

export interface OpRates {
  /** XY cut feed, mm/min (G94) */
  feed?: number;
  /** plunge feed, mm/min (G94) */
  plungeFeed?: number;
  /** spindle speed, RPM — emitted as an active `S<rpm> M3` line at the op
   * boundary (Makera's own format, verified against their emitted programs) */
  spindleRpm?: number;
  /** rapid clearance above the cut surface, mm — approach/retract height;
   * unset = the shared default (SAFE_CLEARANCE, 5mm). Rarely changed, so it
   * lives here in the ⚡ popup rather than as a panel field */
  clearance?: number;
}

export type JobOp =
  | (JobOpBase & {
      kind: 'faceCylinder';
      targetDiameter: number;
      /** axial sweep, machine X, mm — prefilled with the stock span; narrow
       * it to avoid vice jaws / mounted fixtures */
      xStart: number;
      xEnd: number;
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the roughing ladder —
       *  one pass straight to the target Ø. Assumes the bulk is gone. */
      finishingOnly?: boolean;
      /** step-over mm (ring spacing / pass arc / per-rev advance); null = derive (0.5·tool Ø) */
      stepOver: number | null;
      finishAllowance: number;
      rotation: 'cw' | 'ccw';
      /** ring / indexed-pass / continuous-helix — same semantics as FaceCylinderOp.pattern */
      pattern: 'vertical' | 'horizontal' | 'spiral';
      /** allow the tool past the stock's end faces (Alice, 2026-10-27): off =
       *  rotary pocket (360° edge rings square both ends); on = the spiral
       *  may overhang. Absent = off (old saves stay sharp). */
      cutBeyondStock?: boolean;
    })
  | (JobOpBase & {
      kind: 'spiralCarve';
      /** helical grooves about the stock axis (edge of the Phase-2
       * wrapped-groove family). Start/End X and Surface Ø come from the
       * stock by default or the ⇩ picks, like the face cylinder. */
      surfaceDiameter: number;
      xStart: number;
      xEnd: number;
      /** helix angle off the circumferential direction, degrees (90 = axial) */
      spiralAngle: number;
      /** strands evenly spaced around 360° (multi-start) */
      count: number;
      /** groove depth below the surface, mm */
      depth: number;
      /** target groove width, mm — wider than the tool Ø fans parallel passes */
      width: number;
      /** axial depth-per-level ladder, mm */
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the depth ladder —
       *  one full-depth sweep per strand. Assumes the bulk is gone. */
      finishingOnly?: boolean;
      rotation: 'cw' | 'ccw';
      /** starting A of strand 1, degrees — rotates the whole strand pattern
       *  around the cylinder; stacks additively with the index datum.
       *  Default 0 = first strand at the datum. */
      spin?: number;
    })
  | (JobOpBase & {
      kind: 'thread';
      /** external V-bit thread about the stock axis (PLAN.md Phase 2).
       * The cylinder definition is the spiral carve's, with the Ø being
       * the thread's NOMINAL diameter (⇩-pickable); pitch, starts,
       * tolerance, and the optional pre-face carry the thread. */
      nominalDiameter: number;
      xStart: number;
      xEnd: number;
      /** tooth-to-tooth distance, mm (lead = starts × pitch) */
      pitch: number;
      /** thread starts (multi-start: 360°-spaced helices) */
      starts: number;
      /** fit allowance: tenths of a mm shrinking the teeth; 0 = nominal */
      tolerance: number;
      /** depth-per-level ladder for the grooves, mm */
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the depth ladder —
       *  cut the groove at full depth once (+ the spring pass). */
      finishingOnly?: boolean;
      rotation: 'cw' | 'ccw';
      /** the surface the ladder starts from (the faced crest Ø when a
       * facing op precedes); null = the stock surface */
      surfaceDiameter: number | null;
    })
  | (JobOpBase & {
      kind: 'threadMill';
      /**
       * 3-axis thread milling (PLAN.md ops table, 2026-10-28): internal
       * AND external threads with a single-profile thread mill — helix in
       * machine XYZ, fit RADIAL (tolerance shifts the helix radius, the
       * tool cuts its own full form). The selection (rim circle or
       * cylindrical wall facet) prefills this; depths are mm below the
       * stock crown like every depth-bearing op.
       */
      /** internal (bore) or external (boss) — prefilled from the selection
       *  (circle.inner / the wall-normal side), user-editable */
      internal: boolean;
      /** the thread's nominal (major) diameter, mm — editing prefills the
       *  standard ISO coarse pitch (metricPitch), like the rotary thread */
      nominalDiameter: number;
      /** tooth-to-tooth distance, mm (lead = starts × pitch) */
      pitch: number;
      /** thread starts (multi-start: starts helices offset one pitch) */
      starts: number;
      /** fit allowance, mm: internal + (deeper grooves → looser nut),
       *  external − (thinner teeth → looser bolt); 0 = form-true */
      tolerance: number;
      /** cw/ccw thread perception — 'ccw' = left-hand, 'cw' = right-hand
       *  (the rotary Thread op's naming, Alice 2026-10-28) */
      rotation: 'cw' | 'ccw';
      /** RADIAL depth per pass, mm — 0 = one full-form pass (the Makera
       *  cycle); > 0 ladders the form for tough materials */
      stepOver: number;
      /** thread start, mm below the stock crown (0 = the rim/face) */
      startDepth: number;
      /** thread floor, mm below the stock crown (length = end − start) */
      endDepth: number;
    })
  | (JobOpBase & {
      kind: 'index';
      /**
       * Absolute machine A, degrees: freeze the stock at this angle. This
       * op establishes the cutting datum for every op after it in the
       * sequence — subsequent pocket/profile/drill ops run in the rotated
       * frame (their selected features mapped through the rotation, the
       * indexed face "vertically up"). 4-axis mode only.
       */
      angle: number;
    })
  | (JobOpBase & {
      kind: 'cylChamfer';
      /**
       * Chamfer edge circles around the stock axis (edge-tracing §6): one
       * full A revolution at each selected circle's exact X, the V-bit
       * flank through it. The circles come from the selection — face
       * cylinder ops publish their step edges (Øtarget at Start/End X),
       * the stock publishes its end rims, and model circles coaxial with
       * the axis work too. Depth IS the direction: 0 anchors on the
       * circle (cut up-and-out along the wall above it), >0 slides the
       * tip below the circle (chamfer in from the rim).
       */
      /** chamfer depth below the selected circles' Ø, mm (0 = anchor on it) */
      depth: number;
      /** radial step-per-level, mm */
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the radial ladder —
       *  one revolution at the final flank depth. */
      finishingOnly?: boolean;
      rotation: 'cw' | 'ccw';
    })
  | (JobOpBase & {
      kind: 'pocket';
      /**
       * What the selected features prefill: 'floor' sets the END depth from
       * the crown-to-feature distance (cut down TO it); 'rim' sets the
       * START depth (cut down FROM it). Geometry alone cannot tell a hole
       * rim from a hole bottom — the boxes stay user-editable either way.
       */
      selectionIs: 'floor' | 'rim';
      /** cut start, mm below the stock crown */
      startDepth: number;
      /** cut floor, mm below the stock crown (start = end → single pass) */
      endDepth: number;
      /** roughing stock left on the floor and walls, mm; 0 = finish to size */
      allowance: number;
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the step-down ladder —
       *  go straight down and cut only the finishing level at the floor.
       *  Assumes the bulk is already cleared (a roughing op, or a previous
       *  run). The explicit version of the old start = end trick. */
      finishingOnly?: boolean;
      stepOver: number;
      /**
       * The ⇩ floor pick (edge-tracing §5): a live-linked plane/circle whose
       * Z drives endDepth (its depth-in-frame, so indexed datums are
       * respected) until the end-depth box is hand-edited — which nulls it.
       * Null = detached (a plain number).
       */
      floorFeatureId: string | null;
      /** FLATTEN: interior loops are voids to cross, not islands to keep —
       * the region is each selected face's outer boundary alone, so the
       * tool passes over indents/holes and mills off anything proud
       * inside. Off (default) preserves interior features. */
      flatten: boolean;
      /**
       * Tail stock cut-over (Alice, 2026-10-28): on = the clearing
       * DELIBERATELY steps over the selected area's border by one
       * step-over — the swept cut extends that far past the outline,
       * clean past boundary drop-offs (her flat-on-the-barrel: clear
       * past the horizon so the transition to the curve is crisp) and
       * over the stock edge; off = the cut stops at the selected
       * outline and clamps inside the stock. Absent = ON
       * (normalizeJobOps pins it).
       */
      cutBeyondStock?: boolean;
    })
  | (JobOpBase & {
      kind: 'drill';
      depth: number;
      peckDepth: number;
    })
  | (JobOpBase & {
      kind: 'chamfer';
      /** 'add' cuts a new chamfer through the edge; 'existing' rides the modelled face */
      mode: 'add' | 'existing';
      /** 'auto' resolves per loop from the feature geometry (material side) */
      side: 'auto' | 'inside' | 'outside';
      /**
       * Which way the wall extends from the edge ('add'), or which end of
       * the modelled chamfer was selected ('existing'): 'up' = bottom edge
       * (traced exactly), 'down' = top edge (slides by depth).
       */
      direction: 'down' | 'up';
      /** chamfer reach along the wall, mm */
      depth: number;
    })
  | (JobOpBase & {
      kind: 'engrave';
      /** cut depth below the artwork's surface, mm */
      depth: number;
      /** depth-per-level ladder, mm */
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the depth ladder —
       *  one full-depth pass along the paths. */
      finishingOnly?: boolean;
    })
  | (JobOpBase & {
      kind: 'profile';
      selectionIs: 'floor' | 'rim';
      /** cut start, mm below the stock crown */
      startDepth: number;
      /** cut floor, mm below the stock crown (start = end → single pass) */
      endDepth: number;
      /** roughing stock RAISED ON THE FLOOR, mm — forced ≥ 0 (the
       *  2026-10-28 split: the old single allowance moved floor AND wall) */
      bottomAllowance: number;
      /** RADIAL stock outside the path, mm — SIGNED: negative steps the
       *  path INSIDE the contour (turns a boss down, e.g. to the ISO-fit
       *  thread crest); the prep insert prefills it */
      sideAllowance: number;
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the step-down ladder —
       *  one full-depth wall pass at the floor. Assumes the bulk is gone. */
      finishingOnly?: boolean;
      side: 'outside' | 'inside' | 'online';
      /** the ⇩ floor pick — see the pocket variant */
      floorFeatureId: string | null;
      /** side=outside only: also clear the excess between the contour
       * and the stock wall (the waste-stock toggle, edge-tracing §2) —
       * falls back to the outline ring when the frame is thinner than
       * the tool */
      clearToStock: boolean;
      /** cut-out tabs (hold-down bridges) — null = cut through unbroken;
       * threaded to profile2d at generation */
      tabs: ProfileTabs | null;
      /**
       * Tail stock cut-over (Alice, 2026-10-28): a single-cut op, so on
       * keeps the ORIGINAL permission meaning — the loop stays intact
       * even where it runs out of stock to cut through (never clipped);
       * off clips the wall pass to the stock (open spans at the edge).
       * Absent = ON (pre-cut-over saves keep their behavior;
       * normalizeJobOps pins it).
       */
      cutBeyondStock?: boolean;
    })
  | (JobOpBase & {
      kind: 'slicePocket';
      /**
       * Cut from the model's cross-section (edge-tracing §2): the region
       * comes from ONE slice plane (`sliceDepth`) — put it where the
       * section is clean, away from rounded/chamfered tops — and the op
       * cuts the `startDepth`…`endDepth` band with that region. 'outside'
       * profiles around the section (the tool rides the outline, offset
       * out by the tool radius + allowance — fins/buttresses keep their
       * shape through the band); 'inside' pockets the section interior.
       * No feature selection; the floor comes from the ⇩ pick; the
       * viewport cut-plane handle drags `sliceDepth`.
       */
      regionMode: 'outside' | 'inside';
      /** the section plane: where the cross-section comes from, mm below
       * the stock crown — independent of the cut band below */
      sliceDepth: number;
      /** cut start, mm below the stock crown (0 = the crown) */
      startDepth: number;
      /** cut floor, mm below the stock crown (start = end → single pass) */
      endDepth: number;
      /** wall stock left outside the tool path (outside mode) / on the
       * interior walls and floor (inside mode), mm */
      allowance: number;
      stepDown: number;
      /** FINISHING PASS ONLY (Alice, 2026-10-26): skip the step-down ladder —
       *  cut the whole band in one level at the floor. */
      finishingOnly?: boolean;
      stepOver: number;
      /** the ⇩ floor pick — see the pocket variant */
      floorFeatureId: string | null;
      /** regionMode=outside only: also clear the excess between the
       * section and the stock wall (the waste-stock toggle, edge-tracing
       * §2) — falls back to the outline ring when the frame is thinner
       * than the tool */
      clearToStock: boolean;
      /** cut-out tabs on the outside profile ring — null = no bridges;
       * threaded to profile2d at generation (ignored in 'inside' mode) */
      tabs: ProfileTabs | null;
    })
  | (JobOpBase & {
      kind: 'waterline';
      /**
       * Waterline CONTOUR of the whole loaded model (PLAN.md Phase A): constant-Z
       * levels from the stock crown down to the model floor, each level
       * clearing the model's XY silhouette (plus a boundary margin) minus
       * the UPPER SHADOW: the union of every cross-section at/above the
       * cut plane, so overhangs are keep-out a vertical tool must respect — the rough stops at the
       * model's boundary; the surrounding stock stays for a cut-out profile
       * op to ride in. No selection — the model is the target; no depth
       * boxes — the crown and the model floor set the range.
       */
      /** roughing stock left on walls AND floor for a finishing op, mm (0 = to size) */
      allowance: number;
      stepDown: number;
      stepOver: number;
      /** clearance around the model's silhouette, mm — null = derive the
       * tool Ø + allowance + step over at generation: the moat is two tool
       * passes wide, so mesh noise on the model's wall cannot pinch the
       * perimeter pass into plunge-per-sliver arcs (2026-10-25) */
      margin: number | null;
      /** Allow tail stock cut-over (Alice, 2026-10-26): skip the stock-
       * footprint clip on the clearing reach, so the boundary pass may run
       * OUTSIDE the declared stock instead of pinching off at its edge —
       * kills the near-edge artifacts where the model approaches the
       * boundary, at the price of the tool tip passing beyond the stock
       * (mind what physically sits there: tail stock, fixtures). */
      cutBeyondStock: boolean;
      /**
       * CLEAR EXCESS STOCK (Alice, 2026-10-26): every level clears the
       * waste right out to the stock edge (footprint − keep-out) instead of
       * stopping at the silhouette + margin — essential in 4-axis, where
       * leftover shelves can bottom out the collet and indexing can break
       * uncleared chunks loose. Absent = off (the model's column only).
       */
      clearToStock?: boolean;
      /**
       * MAX DEPTH below the crown, mm — the ladder stops here instead of at
       * the model floor (Alice, 2026-10-26): the 4-axis short-tool throttle.
       * Limit each orientation's op to the depth its tool can reach
       * alongside tall features (the sim's red marks show where the collet
       * would hit). Absent/null/0 = unlimited.
       */
      maxDepth?: number | null;
      /**
       * FINISHING PASS ONLY (Alice, 2026-10-26): scrub only where the tool
       * touches the model SURFACE — a contour-hugging band around every
       * section ring at each level (walls, islands, interior contours),
       * ignoring pure stock clearance — with the FULL region cleared only
       * at the level where the ladder bottoms out (the floor/waste
       * clearance the cut-out profile rides in). Levels above the model
       * have no surface to scrub and are skipped. Assumes a rough at
       * allowance ran ahead; the step-down still sets the level density.
       */
      finishingOnly?: boolean;
    })
  | (JobOpBase & {
      kind: 'contour4d';
      /**
       * THE 4D CONTOUR (P3 of the true-4D plan, named per her own file
       * and usage): a whole-model multi-orientation rough that PLANS
       * its own index angles — no user-chosen orientations. The
       * planner runs the cleared-set map over a candidate ladder,
       * greedily covers the model's surface cells, and emits per-
       * orientation roughing at the chosen angles (the fields below
       * are each orientation pass's waterline parameters, since the
       * emission generates a waterline rough at every chosen datum).
       * The honest unreachable set is reported, never silently
       * dropped.
       */
      /** roughing stock left on the model for a finishing op, mm */
      allowance: number;
      stepDown: number;
      stepOver: number;
      /** the candidate-ladder spacing, degrees — the planner evaluates
       *  every orientStep around the circle (her 2026-10-29 ruling:
       *  "30 for now" — the knob) */
      orientStep: number;
      /** per-orientation roughing fields — see the waterline op; the
       *  emission stage passes them through to each chosen angle's
       *  rough */
      margin: number | null;
      cutBeyondStock: boolean;
      /** CLEAR EXCESS STOCK (Alice 2026-10-29, DEFAULT ON): every
       * level of every orientation's rough clears out to the stock
       * edge, like the waterline's own toggle. Without it the rough
       * strands waste columns around the part — big chunks that drop
       * or fly off mid-job, leaving the later orientations (and any
       * standing-material model) plotting against stock that moved */
      clearToStock: boolean;
      maxDepth?: number | null;
      finishingOnly?: boolean;
    })
  | (JobOpBase & {
      kind: 'rasterContour';
      /**
       * Raster contour of the whole loaded model (PLAN.md Phase B): the
       * paired SURFACE pass to the waterline contour. A heightmap of the
       * model is taken by downward raycasts, dilated with the tool's
       * kernel (flat disc / ball hemisphere) so every sweep clears to the
       * tool-compensated surface, and cut in serpentine rows at a fixed
       * step over — cutting only where material sits above the surface
       * (no air cutting). Assumes bulk clearing already happened (a
       * waterline contour with allowance): warns when the stock above the
       * surface is deep. 4-axis indexed like the waterline op. Rough-vs-
       * finish is the allowance choice, not the op.
       *
       * Row direction: `angle` in degrees, default 0 = rows along X;
       * rows run along (cos α, sin α). Arbitrary angles (negatives fine,
       * no clamp) — 90 gives Y-only rows, and a 0°+90° op pair gives the
       * cross-hatch "both directions" finish. The Phase C rotational op
       * composes from these same directions.
       */
      allowance: number;
      stepOver: number;
      /** row angle, degrees — absent = 0 = rows along X */
      angle?: number;
      /**
       * FINISHING PASS ONLY (Alice, 2026-10-26): the single surface pass
       * with NO flat roughing levels — replaces the old "step down 0"
       * convention (job files with stepDown 0/absent migrate to checked).
       * Unchecked = rough in flat levels at `stepDown` + the final
       * finishing pass on the surface.
       */
      finishingOnly?: boolean;
      /** Z step-down for the roughing levels, mm — used only when
       *  finishingOnly is OFF */
      stepDown?: number;
      /**
       * CLEAR EXCESS STOCK (Alice, 2026-10-26 — the waterline's option on
       * the paired surface pass): cells inside the stock footprint whose
       * tool-compensated surface is air are WASTE — they clear flat at the
       * model's own floor, so the pass finishes the whole stock out to the
       * edge. Model-adjacent cells keep the dilated surface (sub-tool gaps
       * against the model clear exactly as deep as the tool can reach
       * without gouging — no region math needed). Absent = the model's
       * column only.
       */
      clearToStock?: boolean;
      /** allow tail stock cut-over (Alice, 2026-10-26): the waste domain
       *  grows by the tool radius, so row centers may cross the stock edge
       *  for clean exits. Absent = centers stay inside the footprint. */
      cutBeyondStock?: boolean;
    })
  | (JobOpBase & {
      kind: 'rotaryCarve';
      /**
       * Rotary relief carving (PLAN.md Phase C) — the raster core in the
       * unwrapped (x, θ) frame: the whole model on the stock's rotation
       * axis is the target, no selection. A dexel map of the OUTER surface
       * radius is taken by radial raycasts, dilated with the tool's
       * kernel, and ONE op roughs AND finishes: the Makera-style ladder
       * runs a COMPLETE full-wrap sweep at each depth level (constant cut
       * radius, a cell cut where the compensated surface sits below the
       * plane) before descending, ending at the first level with nothing
       * left to cut — then the finishing pass follows the compensated
       * surface itself. `finishingOnly` skips the ladder (the panel
       * zeroes the allowance on tick, the raster precedent).
       *
       * Three path strategies per sweep: 'horizontal' rows along X with
       * rapid A steps; 'vertical' continuous-A rings at constant X;
       * 'spiralWrap' one helix per sweep (X advancing while A turns — the
       * strategy Makera Studio does NOT have). A accumulates monotonically
       * across wraps; the post's inter-op G92.4 shrink keeps the counter
       * small. Cylinder stock + a model on its axis; 4-axis mode.
       */
      stepDown: number;
      stepOver: number;
      allowance: number;
      strategy: 'horizontal' | 'vertical' | 'spiralWrap';
      /** FINISHING PASS ONLY: the single surface pass, no roughing ladder.
       *  Absent = unchecked (old saves byte-identical, the spin precedent). */
      finishingOnly?: boolean;
    })
  | (JobOpBase & {
      kind: 'swarfFinish';
      /**
       * THE TRUE 4D FINISH (PLAN.md "The true 4D finishing pass", Alice's
       * SWARF ruling from the Makera propeller video): the tool's flank
       * hugs the model surface with ALL FOUR AXES moving — per surface
       * cell, the part rotates to the attitude that brings that cell's
       * normal against the flute's side, and the pass sweeps monotone-A
       * through whole contact patches at G93 inverse time. NOT fixed
       * angles: the contact attitude follows the surface normal
       * everywhere it bends (A\* = atan2(n.y,n.z)+90°, the flute flank).
       * The whole loaded model on the rotation axis is the target, like
       * the rotary contour — no selection. Cylinder stock, 4-axis mode,
       * and a FLANK tool: flat or corn endmill (the ball window kernel
       * and V-flank come later — the op picks its kernel by the tool and
       * fails honestly on the unbuilt ones).
       *
       * The pass assumes bulk clearing ran ahead (a 4D contour or rotary
       * rough at allowance) — it sweeps the surface where it is, and the
       * honest coverage report names every cell no pass reaches (the
       * twin-blade clip class, pure-X unreachable normals) instead of
       * silently dropping them.
       */
      /** contact-map grid density, mm — the θ rows' ARC step at the stock
       *  radius (X pitch = half, the rotaryCarve grid contract, so the map
       *  matches the rough's standing grid cell-for-cell) */
      stepOver: number;
    });

/**
 * The one-shot "adjust to face" pick kinds (edge-tracing §5): the ops
 * panel banners the mode, the next viewport click applies it to that op.
 * 'floor' drives end depth; the face-cylinder kinds take Start/End X and
 * the target diameter straight off a selected feature. 'wrapDiameter'
 * targets an artwork PRIMITIVE, not an op — it picks the Ø the artwork
 * wraps (its cutting-surface declaration). 'indexAngle' aims an Index op:
 * the clicked face's normal / hole's axis / edge's radial becomes the
 * absolute A that brings it to face the cutter.
 */
export type FeaturePickKind =
  | 'floor'
  | 'targetDiameter'
  | 'startX'
  | 'endX'
  | 'wrapDiameter'
  | 'indexAngle';

/** Ops with depth boxes and the ⇩ floor pick (edge-tracing §5). */
export type DepthBearingJobOp = Extract<
  JobOp,
  { kind: 'pocket' | 'profile' | 'slicePocket' }
>;

export function isDepthBearingJobOp(op: JobOp): op is DepthBearingJobOp {
  return op.kind === 'pocket' || op.kind === 'profile' || op.kind === 'slicePocket';
}

/** Round to 2 decimals — every value the app auto-fills into a number box
 * (depths, positions, angles) reads clean; user-typed values are untouched. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Placement of a loaded model in machine coordinates. The model keeps its
 * own coordinate system (STL coords are not recentered): `scale` stretches
 * in model space first, then `rotationDeg` rotates about the origin, then
 * `position` moves it (Euler XYZ).
 */
export interface ModelTransform {
  position: Vec3;
  rotationDeg: Vec3;
  scale: Vec3;
}

export function identityTransform(): ModelTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationDeg: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}
// Phase 1 adds: profile2d | pocket | drill | engrave | indexedPocket
// Phase 2 adds: thread | wrappedGroove