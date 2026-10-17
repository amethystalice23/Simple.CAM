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

export type Operation = FaceCylinderOp | PocketOp | DrillOp | ProfileOp;
// Phase 1 adds: engrave | indexedPocket
// Phase 2 adds: thread | wrappedGroove

/**
 * An operation in the job sequence: user-editable state that generation
 * resolves against the selection, stock, and tool (src/ui/jobGeneration.ts).
 * Feeds/step-downs come from material presets × tool type at generation
 * time; these fields are only the per-type parameters worth exposing.
 */
export interface JobOpBase {
  id: string;
  toolId: string;
  /** selected feature ids feeding this op */
  featureIds: string[];
}

export type JobOp =
  | (JobOpBase & {
      kind: 'faceCylinder';
      targetDiameter: number;
      /** axial sweep, machine X, mm — prefilled with the stock span; narrow
       * it to avoid vice jaws / mounted fixtures */
      xStart: number;
      xEnd: number;
      /** optional cylinder primitive as the facing target: its axial extent
       * and diameter override the fields above (kept in sync on select) */
      primitiveId: string | null;
      stepDown: number;
      /** step-over mm (ring spacing / pass arc / per-rev advance); null = derive (0.5·tool Ø) */
      stepOver: number | null;
      finishAllowance: number;
      rotation: 'cw' | 'ccw';
      /** ring / indexed-pass / continuous-helix — same semantics as FaceCylinderOp.pattern */
      pattern: 'vertical' | 'horizontal' | 'spiral';
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
    })
  | (JobOpBase & {
      kind: 'drill';
      depth: number;
      peckDepth: number;
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
    });

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