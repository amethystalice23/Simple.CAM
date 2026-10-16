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

export type Stock =
  | {
      kind: 'box';
      sizeX: number;
      sizeY: number;
      sizeZ: number;
      /** job origin (machine 0,0,0) location within the box, per axis */
      origin: { x: OriginEdge; y: OriginEdge; z: OriginEdge };
      materialId: string;
    }
  | {
      kind: 'cylinder';
      /** stock length along X, mm */
      length: number;
      /** where machine X0 sits along the stock axis */
      xOrigin: OriginEdge;
      /** rotation axis is machine X (4th axis parallel to X, verified) */
      calibration: RotaryCalibration;
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
  /** plunge feed for Z steps, mm/min (G94) */
  plungeFeed: number;
  /** radial material left for the finishing pass, mm */
  finishAllowance: number;
  /** direction of continuous A rotation */
  rotation: 'cw' | 'ccw';
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
      stepDown: number;
      finishAllowance: number;
      rotation: 'cw' | 'ccw';
    })
  | (JobOpBase & {
      kind: 'pocket';
      /**
       * What the selected features mean: 'floor' cuts from the stock
       * crown down TO them (roughing to a surface / hole bottom);
       * 'top' cuts down FROM them by `depth` (classic pocket at a rim).
       * Geometry alone cannot tell a hole rim from a hole bottom.
       */
      selectionIs: 'floor' | 'top';
      /** cut depth below the selection, mm (selectionIs = 'top' only) */
      depth: number;
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
      selectionIs: 'floor' | 'top';
      /** cut depth below the selection, mm (selectionIs = 'top' only) */
      depth: number;
      stepDown: number;
      allowance: number;
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