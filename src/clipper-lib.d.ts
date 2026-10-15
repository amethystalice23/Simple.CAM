/**
 * Minimal typed surface of `clipper-lib` (pure-JS port of Angus Johnson's
 * Clipper, BSL) — only what our wrapper (src/cam/clipper.ts) uses.
 * The package ships no typings of its own.
 */
declare module 'clipper-lib' {
  export interface ClipperPoint {
    X: number;
    Y: number;
  }
  export type ClipperPath = ClipperPoint[];

  export const JoinType: {
    readonly jtSquare: number;
    readonly jtRound: number;
    readonly jtMiter: number;
  };
  export const EndType: {
    readonly etOpenSquare: number;
    readonly etOpenRound: number;
    readonly etOpenButt: number;
    readonly etClosedLine: number;
    readonly etClosedPolygon: number;
  };
  export const ClipType: {
    readonly ctIntersection: number;
    readonly ctUnion: number;
    readonly ctDifference: number;
    readonly ctXor: number;
  };
  export const PolyType: {
    readonly ptSubject: number;
    readonly ptClip: number;
  };
  export const PolyFillType: {
    readonly pftEvenOdd: number;
    readonly pftNonZero: number;
    readonly pftPositive: number;
    readonly pftNegative: number;
  };

  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: ClipperPath, joinType: number, endType: number): void;
    AddPaths(paths: ClipperPath[], joinType: number, endType: number): void;
    /** delta in the same integer scale as the paths */
    Execute(solution: ClipperPath[], delta: number): boolean;
  }

  export class Clipper {
    AddPath(path: ClipperPath, polyType: number, closed: boolean): boolean;
    AddPaths(paths: ClipperPath[], polyType: number, closed: boolean): boolean;
    Execute(
      clipType: number,
      solution: ClipperPath[],
      subjFillType: number,
      clipFillType: number,
    ): boolean;
  }
}