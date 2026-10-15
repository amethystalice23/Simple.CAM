/**
 * Core job model. Generators consume these types and emit Move[] IR;
 * only the post-processor (src/post) turns IR into G-code text.
 *
 * Units: mm, degrees, minutes. Z is negative below the stock crown.
 */

export interface Tool {
  id: string;
  name: string;
  type: 'flat' | 'ball' | 'bull' | 'vbit' | 'drill' | 'threadmill';
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
  /** drill point angle, degrees (drill) */
  drillPointAngle?: number;
  /** thread pitch, mm (threadmill) */
  pitch?: number;
  spindleRpm: number;
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
  /** Z of the stock crown at the reference X, machine coords */
  crownZ: number;
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

export type Operation = FaceCylinderOp;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Placement of a loaded model in machine coordinates. The model keeps its
 * own coordinate system (STL coords are not recentered): `position` moves
 * the model's origin, `rotationDeg` rotates about it first (Euler XYZ).
 */
export interface ModelTransform {
  position: Vec3;
  rotationDeg: Vec3;
}

export function identityTransform(): ModelTransform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationDeg: { x: 0, y: 0, z: 0 },
  };
}
// Phase 1 adds: profile2d | pocket | drill | engrave | indexedPocket
// Phase 2 adds: thread | wrappedGroove