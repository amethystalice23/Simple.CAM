/**
 * Hand-rolled from-spec SVG line-work import (license policy: no
 * GPL/AGPL vector libraries). Scans <path> elements under their
 * ancestor <g> transforms, parses path data (M/L/H/V/C/S/Q/T/A/Z,
 * absolute and relative, implicit command repeats), and flattens every
 * curve to a polyline at the chord tolerance — the app's one canonical
 * artwork form.
 *
 * Text and fonts are the EDITOR's job (Inkscape "object to path");
 * shape primitives (<rect>/<circle>/…) are not parsed — convert to
 * paths first. Output is in USER UNITS (the SVG coordinate system):
 * the scale knob (mm of surface per artwork unit) belongs to
 * placement/wrap time, not here.
 */

import type { Vec2 } from './types';

/** affine [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f */
type Mat = { a: number; b: number; c: number; d: number; e: number; f: number };

const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** m ∘ n — apply n first, then m (SVG's list composes like nested groups) */
function matMul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

const apply = (m: Mat, p: Vec2): Vec2 => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});

function numbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)) {
    const v = parseFloat(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>/]+))`));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

/** one SVG transform function → matrix */
function transformFn(name: string, v: number[]): Mat {
  switch (name) {
    case 'translate':
      return { a: 1, b: 0, c: 0, d: 1, e: v[0] ?? 0, f: v[1] ?? 0 };
    case 'scale':
      return { a: v[0] ?? 1, b: 0, c: 0, d: v[1] ?? v[0] ?? 1, e: 0, f: 0 };
    case 'rotate': {
      // rotate(θ) or rotate(θ cx cy): rotate about (cx, cy)
      const r = ((v[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const rot: Mat = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      const cx = v[1] ?? 0;
      const cy = v[2] ?? 0;
      return matMul(
        { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy },
        matMul(rot, { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy }),
      );
    }
    case 'matrix':
      return { a: v[0] ?? 1, b: v[1] ?? 0, c: v[2] ?? 0, d: v[3] ?? 1, e: v[4] ?? 0, f: v[5] ?? 0 };
    case 'skewX': {
      const t = Math.tan(((v[0] ?? 0) * Math.PI) / 180);
      return { a: 1, b: 0, c: t, d: 1, e: 0, f: 0 };
    }
    case 'skewY': {
      const t = Math.tan(((v[0] ?? 0) * Math.PI) / 180);
      return { a: 1, b: t, c: 0, d: 1, e: 0, f: 0 };
    }
    default:
      return IDENTITY; // unknown function: identity, not a crash
  }
}

/** parse an SVG transform attribute into one matrix (a list composes
 * like nested groups: the leftmost function is the outermost) */
function parseTransform(text: string): Mat {
  let m = IDENTITY;
  const parts: Mat[] = [];
  for (const call of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    parts.push(transformFn(call[1], numbers(call[2])));
  }
  for (let i = parts.length - 1; i >= 0; i--) m = matMul(m, parts[i]);
  return m;
}

export interface ImportedArtwork {
  /** flattened polylines, user units */
  paths: Vec2[][];
  /** per-path topology + paint, parallel to `paths`: `closed` = the
   *  subpath carried an explicit Z (or its flattened endpoints coincide
   *  within the chord tolerance); `filled` = the SVG fill STATE that
   *  reached it (own attr/style > inherited <g> > default = painted).
   *  The engrave FILL pass reads these — "just because a path is closed
   *  does not guarantee its filled" (Alice, 2026-10-31). */
  meta: { closed: boolean; filled: boolean }[];
  /** document size in user units (viewBox preferred, else width/height) */
  width: number;
  height: number;
}

/**
 * The SVG fill STATE declared on a tag, or null when it declares none
 * (→ inherit). `fill="none"` and `fill-opacity: 0` unpaint; anything
 * else (named colors, hex, url patterns — approximated as painted)
 * paints. Defaults live at the CALLER: SVG's initial fill is black.
 */
function declaredFill(rest: string): boolean | null {
  const fill = attr(rest, 'fill');
  const style = attr(rest, 'style');
  const styleFill = style?.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/)?.[1]?.trim();
  const styleOpacity = style?.match(/(?:^|;)\s*fill-opacity\s*:\s*([^;]+)/)?.[1]?.trim();
  const opacity = attr(rest, 'fill-opacity') ?? styleOpacity;
  const value = fill ?? styleFill;
  if (opacity !== null && opacity !== undefined && parseFloat(opacity) === 0) return false;
  if (value === undefined) return null;
  return value.trim().toLowerCase() !== 'none';
}

/**
 * Extract the line work of an SVG document: every <path> outside
 * <defs>, flattened to polylines in user units. Multiple subpaths in
 * one d become separate polylines.
 */
export function parseSvgPaths(svgText: string, chordTol = 0.05): ImportedArtwork {
  const paths: Vec2[][] = [];
  const meta: { closed: boolean; filled: boolean }[] = [];
  const stack: Mat[] = [];
  const fillStack: boolean[] = [];
  let combined = IDENTITY;
  // SVG's initial fill is BLACK — every path paints unless something
  // says otherwise (the fill STATE, not the parsed geometry, decides)
  let fillNow = true;
  let defsDepth = 0;
  let width = 0;
  let height = 0;

  for (const tag of svgText.matchAll(/<\s*(\/?)\s*([a-zA-Z]+)([^>]*)>/g)) {
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    const rest = tag[3];
    // self-closing (`<defs id="d" />` — Inkscape writes these): open and
    // close in one, so it must not push onto any depth/stack
    const selfClosing = !closing && /\/\s*$/.test(rest);
    if (name === 'defs') {
      if (!closing && !selfClosing) defsDepth += 1;
      else if (closing) defsDepth -= 1;
      continue;
    }
    if (defsDepth > 0) continue;
    if (name === 'svg' && !closing) {
      const vb = attr(rest, 'viewBox');
      if (vb) {
        const v = numbers(vb);
        if (v.length >= 4) {
          width = v[2];
          height = v[3];
        }
      }
      if (width === 0) width = numberOrZero(attr(rest, 'width'));
      if (height === 0) height = numberOrZero(attr(rest, 'height'));
      fillNow = declaredFill(rest) ?? true;
      continue;
    }
    if (name === 'g') {
      if (selfClosing) continue; // no children — no transform, no stack entry
      if (closing) {
        const m = stack.pop();
        if (m) combined = m;
        fillNow = fillStack.length > 0 ? (fillStack.pop() as boolean) : true;
      } else {
        stack.push(combined);
        fillStack.push(fillNow);
        const t = attr(rest, 'transform');
        if (t) combined = matMul(combined, parseTransform(t));
        fillNow = declaredFill(rest) ?? fillNow;
      }
      continue;
    }
    if (name === 'path' && !closing) {
      const own = attr(rest, 'transform');
      const d = attr(rest, 'd');
      if (!d) continue;
      const painted = declaredFill(rest) ?? fillNow;
      const m = own ? matMul(combined, parseTransform(own)) : combined;
      const { polys, closed } = parsePathDataMeta(d, chordTol);
      polys.forEach((poly, i) => {
        const mapped = poly.map((p) => apply(m, p));
        if (mapped.length >= 2) {
          paths.push(mapped);
          meta.push({ closed: closed[i], filled: painted });
        }
      });
    }
  }
  return { paths, meta, width, height };
}

function numberOrZero(text: string | null): number {
  if (!text) return 0;
  return numbers(text)[0] ?? 0;
}

// ------------------------------------------------------------ path data

/**
 * Parse SVG path data into flattened polylines. One token walk: a
 * letter sets the command; numbers before the next letter REPEAT it
 * (SVG's implicit repeat), and after an M the repeats become LineTos.
 */
export function parsePathData(d: string, chordTol = 0.05): Vec2[][] {
  return parsePathDataMeta(d, chordTol).polys;
}

/**
 * parsePathData + per-subpath CLOSURE (the fill pass's topology): a
 * subpath is closed iff it carried an explicit Z, or its flattened
 * endpoints coincide within the chord tolerance (an authored loop).
 * `closed` parallels `polys`.
 */
export function parsePathDataMeta(
  d: string,
  chordTol = 0.05,
): { polys: Vec2[][]; closed: boolean[] } {
  const items: (string | number)[] = [];
  for (const m of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g)) {
    items.push(m[1] ?? parseFloat(m[2]!));
  }
  let i = 0;
  const nextNum = (): number => {
    const it = items[i++];
    if (typeof it !== 'number') throw new Error('path data: missing number');
    return it;
  };

  const polys: Vec2[][] = [];
  const closed: boolean[] = [];
  let cur: Vec2[] = [];
  let curClosed = false;
  let cx = 0;
  let cy = 0; // current point
  let sx = 0;
  let sy = 0; // subpath start (for Z)
  let cmd = '';
  /** previous cubic's second control (for S reflection) */
  let reflX: number | null = null;
  let reflY: number | null = null;
  /** previous quadratic's control (for T reflection) */
  let qX: number | null = null;
  let qY: number | null = null;

  const push = (p: Vec2) => {
    const last = cur[cur.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) cur.push(p);
  };
  const startSub = (x: number, y: number) => {
    if (cur.length >= 2) {
      polys.push(cur);
      closed.push(curClosed || subpathCoincident(cur, chordTol));
    }
    cur = [{ x, y }];
    curClosed = false;
    sx = x;
    sy = y;
    reflX = reflY = qX = qY = null;
  };
  const lineTo = (x: number, y: number) => {
    if (cur.length === 0) startSub(cx, cy);
    push({ x, y });
    cx = x;
    cy = y;
    reflX = reflY = qX = qY = null;
  };
  const abs = (c: string, x: number, y: number): Vec2 =>
    c === c.toLowerCase() ? { x: cx + x, y: cy + y } : { x, y };

  const emitCubic = (p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2) => {
    flattenCubic(p0, c1, c2, p1, chordTol).forEach(push);
    cx = p1.x;
    cy = p1.y;
    reflX = 2 * p1.x - c2.x;
    reflY = 2 * p1.y - c2.y;
    qX = qY = null;
  };
  const emitQuad = (p0: Vec2, q: Vec2, p1: Vec2) => {
    flattenQuad(p0, q, p1, chordTol).forEach(push);
    cx = p1.x;
    cy = p1.y;
    qX = q.x;
    qY = q.y;
    reflX = reflY = null;
  };

  while (i < items.length) {
    const it = items[i];
    if (typeof it === 'string') {
      cmd = it;
      i++;
      if (cmd === 'M' || cmd === 'm') {
        const p = abs(cmd, nextNum(), nextNum());
        startSub(p.x, p.y);
        cx = p.x;
        cy = p.y;
        cmd = cmd === 'M' ? 'L' : 'l'; // further pairs are implicit lines
        continue;
      }
    } else if (!cmd) {
      i++; // stray numbers before any command
      continue;
    }
    switch (cmd) {
      case 'L':
      case 'l': {
        const p = abs(cmd, nextNum(), nextNum());
        lineTo(p.x, p.y);
        break;
      }
      case 'H':
      case 'h': {
        const x = nextNum();
        lineTo(cmd === 'H' ? x : cx + x, cy);
        break;
      }
      case 'V':
      case 'v': {
        const y = nextNum();
        lineTo(cx, cmd === 'V' ? y : cy + y);
        break;
      }
      case 'C':
      case 'c': {
        const c1 = abs(cmd, nextNum(), nextNum());
        const c2 = abs(cmd, nextNum(), nextNum());
        const p1 = abs(cmd, nextNum(), nextNum());
        emitCubic({ x: cx, y: cy }, c1, c2, p1);
        break;
      }
      case 'S':
      case 's': {
        const c2 = abs(cmd, nextNum(), nextNum());
        const p1 = abs(cmd, nextNum(), nextNum());
        const c1: Vec2 =
          reflX === null || reflY === null
            ? { x: cx, y: cy }
            : { x: reflX, y: reflY };
        emitCubic({ x: cx, y: cy }, c1, c2, p1);
        break;
      }
      case 'Q':
      case 'q': {
        const q = abs(cmd, nextNum(), nextNum());
        const p1 = abs(cmd, nextNum(), nextNum());
        emitQuad({ x: cx, y: cy }, q, p1);
        break;
      }
      case 'T':
      case 't': {
        const p1 = abs(cmd, nextNum(), nextNum());
        const q: Vec2 =
          qX === null || qY === null
            ? { x: cx, y: cy }
            : { x: 2 * cx - qX, y: 2 * cy - qY };
        emitQuad({ x: cx, y: cy }, q, p1);
        break;
      }
      case 'A':
      case 'a': {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const large = nextNum();
        const sweep = nextNum();
        const p1 = abs(cmd, nextNum(), nextNum());
        flattenArc(
          { x: cx, y: cy },
          rx,
          ry,
          rot,
          large !== 0,
          sweep !== 0,
          p1,
          chordTol,
        ).forEach(push);
        cx = p1.x;
        cy = p1.y;
        reflX = reflY = qX = qY = null;
        break;
      }
      case 'Z':
      case 'z': {
        if (cur.length > 0) {
          push({ x: sx, y: sy });
          cx = sx;
          cy = sy;
          curClosed = true;
        }
        reflX = reflY = qX = qY = null;
        break;
      }
      default:
        break; // unknown command: skip
    }
  }
  if (cur.length >= 2) {
    polys.push(cur);
    closed.push(curClosed || subpathCoincident(cur, chordTol));
  }
  return { polys, closed };
}

/** a subpath whose flattened endpoints meet within the chord tolerance
 *  is a loop by construction, Z or no Z */
function subpathCoincident(cur: Vec2[], tol: number): boolean {
  return Math.hypot(cur[0].x - cur[cur.length - 1].x, cur[0].y - cur[cur.length - 1].y) <= tol;
}

/** flatten a cubic Bézier by de Casteljau splitting until the control
 * polygon is within `tol` of the chord (the emitted point EXCLUDES the
 * start — callers have it) */
function flattenCubic(p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, tol: number): Vec2[] {
  const out: Vec2[] = [];
  const rec = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, depth: number): void => {
    const flat = offchord(a, d, b) + offchord(a, d, c);
    if (flat <= tol || depth > 16) {
      out.push(d);
      return;
    }
    const mid = (p: Vec2, q: Vec2): Vec2 => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const ab = mid(a, b);
    const bc = mid(b, c);
    const cd = mid(c, d);
    const abc = mid(ab, bc);
    const bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    rec(a, ab, abc, m, depth + 1);
    rec(m, bcd, cd, d, depth + 1);
  };
  rec(p0, c1, c2, p1, 0);
  return out;
}

/** a quadratic as its exact cubic equivalent (controls at 2/3) */
function flattenQuad(p0: Vec2, q: Vec2, p1: Vec2, tol: number): Vec2[] {
  const c1 = { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) };
  const c2 = { x: p1.x + (2 / 3) * (q.x - p1.x), y: p1.y + (2 / 3) * (q.y - p1.y) };
  return flattenCubic(p0, c1, c2, p1, tol);
}

/** flatten an SVG endpoint-parameterized arc (spec F6.5 center
 * conversion, F6.6 radii correction) into chord segments */
function flattenArc(
  p0: Vec2,
  rxIn: number,
  ryIn: number,
  rotDeg: number,
  large: boolean,
  sweep: boolean,
  p1: Vec2,
  tol: number,
): Vec2[] {
  if (rxIn === 0 || ryIn === 0) return [p1]; // degenerate: a line
  const rot = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  // endpoints into the ellipse's local frame
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda); // spec F6.6: radii too small — scale up
    rx *= s;
    ry *= s;
  }
  const sign = large !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / Math.max(den, 1e-12)));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const center = {
    x: cxp * cos - cyp * sin + (p0.x + p1.x) / 2,
    y: cxp * sin + cyp * cos + (p0.y + p1.y) / 2,
  };
  // parametrization angle of a point: its local-frame offsets
  const ang = (p: Vec2): number => {
    const px = p.x - center.x;
    const py = p.y - center.y;
    const lx = cos * px + sin * py;
    const ly = -sin * px + cos * py;
    return Math.atan2(ly / ry, lx / rx);
  };
  let t0 = ang(p0);
  let t1 = ang(p1);
  if (!sweep && t1 > t0) t1 -= 2 * Math.PI;
  if (sweep && t1 < t0) t1 += 2 * Math.PI;
  // chord length with sagitta ≈ tol: c ≈ sqrt(8·r·tol)
  const arcLen = Math.abs(t1 - t0) * Math.max(rx, ry);
  const maxChord = Math.sqrt(8 * Math.max(rx, ry) * tol);
  const steps = Math.max(2, Math.ceil(arcLen / Math.max(maxChord, 1e-6)));
  const out: Vec2[] = [];
  for (let s = 1; s <= steps; s++) {
    const t = t0 + ((t1 - t0) * s) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push({
      x: center.x + ex * cos - ey * sin,
      y: center.y + ex * sin + ey * cos,
    });
  }
  return out;
}

/** distance of p from the chord a→b (perpendicular offset length) */
function offchord(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby) || 1e-12;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (len * len);
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}