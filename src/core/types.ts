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
  type: 'flat' | 'ball' | 'bull' | 'vbit' | 'drill' | 'threadmill' | 'corn';
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
  /**
   * Makera's per-tool, per-material cutting presets (imported from the
   * Fusion start-values; see scripts/import-makera-tools.mjs). Generation
   * prefers the preset matching the stock material, falling back to the
   * material-preset tables.
   */
  presets?: ToolPreset[];
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
  /** G94 plunge feed at the start entries */
  plungeFeed: number;
  /** the surface the depth ladder starts from, mm Ø — the faced crest
   * Ø when a facing op precedes; null = the stock surface */
  surfaceDiameter: number | null;
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
}

export interface EdgeFeature {
  kind: 'edge';
  id: string;
  a: Vec3;
  b: Vec3;
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
  /** machine Z the pocket starts from (surface) */
  topZ: number;
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
  side: 'outside' | 'inside' | 'online';
  /** wall allowance left outside the tool path, mm */
  allowance: number;
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

export type Operation = FaceCylinderOp | SpiralCarveOp | ThreadOp | PocketOp | DrillOp | ProfileOp | ChamferOp;
// Phase 1 adds: engrave | indexedPocket
// Phase 2 adds: thread | wrappedGroove

/**
 * An operation in the job sequence: user-editable state that generation
 * resolves against the selection, stock, and tool (src/ui/jobGeneration.ts).
 * Feeds/step-downs come from material presets × tool type at generation
 * time — per-type parameters worth exposing live here, and cutting-rate
 * deviations from the tool defaults live in `rates`.
 */
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
   * boundary (Makera's own format, verified in MakeraStudio) */
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
      /** step-over mm (ring spacing / pass arc / per-rev advance); null = derive (0.5·tool Ø) */
      stepOver: number | null;
      finishAllowance: number;
      rotation: 'cw' | 'ccw';
      /** ring / indexed-pass / continuous-helix — same semantics as FaceCylinderOp.pattern */
      pattern: 'vertical' | 'horizontal' | 'spiral';
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
      rotation: 'cw' | 'ccw';
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
      rotation: 'cw' | 'ccw';
      /** the surface the ladder starts from (the faced crest Ø when a
       * facing op precedes); null = the stock surface */
      surfaceDiameter: number | null;
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
      kind: 'profile';
      selectionIs: 'floor' | 'rim';
      /** cut start, mm below the stock crown */
      startDepth: number;
      /** cut floor, mm below the stock crown (start = end → single pass) */
      endDepth: number;
      /** roughing stock left on the floor and walls, mm; 0 = finish to size */
      allowance: number;
      stepDown: number;
      side: 'outside' | 'inside' | 'online';
      /** the ⇩ floor pick — see the pocket variant */
      floorFeatureId: string | null;
      /** side=outside only: also clear the excess between the contour
       * and the stock wall (the waste-stock toggle, edge-tracing §2) —
       * falls back to the outline ring when the frame is thinner than
       * the tool */
      clearToStock: boolean;
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
      stepOver: number;
      /** the ⇩ floor pick — see the pocket variant */
      floorFeatureId: string | null;
      /** regionMode=outside only: also clear the excess between the
       * section and the stock wall (the waste-stock toggle, edge-tracing
       * §2) — falls back to the outline ring when the frame is thinner
       * than the tool */
      clearToStock: boolean;
    });

/**
 * The one-shot "adjust to face" pick kinds (edge-tracing §5): the ops
 * panel banners the mode, the next viewport click applies it to that op.
 * 'floor' drives end depth; the face-cylinder kinds take Start/End X and
 * the target diameter straight off a selected feature.
 */
export type FeaturePickKind = 'floor' | 'targetDiameter' | 'startX' | 'endX';

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