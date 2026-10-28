/**
 * Tool cutting solids for the carve kernel (src/sim — pure core). Each tool
 * becomes a rotationally-symmetric solid in its LOCAL frame: tip at the
 * origin, tool axis pointing DOWN as local −Z, so `z` here is the height
 * ABOVE the tip along the axis. `inside(z, rhoSq)` is the membership test;
 * the kernel feeds it z_local = −q·axis and rhoSq = |q|² − z_local² per
 * voxel, so only the profile function per type matters.
 *
 * Tool types (src/core/types.ts Tool):
 *  flat       → cylinder ρ ≤ r, 0 ≤ z ≤ fluteLen
 *  ball       → hemisphere ρ² + (z−r)² ≤ r² below z = r, cylinder above
 *  bull       → filleted bottom corner (torus blend: below z = cr the
 *               radius pulls in by cr − √(cr² − (cr−z)²))
 *  vbit, corn → truncated cone ρ ≤ tipR + z·tan(halfAngle) up to full
 *               radius, cylinder to fluteLen ('corn' maps to V-Bit in the
 *               post's tool-type table, so it cuts as a vbit)
 *  drill      → cone by drillPointAngle (default 118°), cylinder above
 *  threadmill → the TOOTHED BAND: ISO 60° trapezoid teeth at pitch spacing
 *               (flutes = the tooth count), REVOLVED (the tool spins) —
 *               tip flat p/6 at the cut Ø, 30° flanks, root at
 *               cutØ − 1.2268·p; the taper to the shank (fluteLength =
 *               the cutting length) is contact-only, never removal
 *  laser      → buildToolSpec THROWS — the caller must skip laser moves
 *               before the kernel ever sees them (laserSkipped counter)
 */

import type { Tool } from '../core/types';
// D3_FACTOR: the ISO 724 external minor (1.2268·p) — the thread-mill root
import { D3_FACTOR } from '../cam/threadMill';

export interface ToolSpec {
  /** max cutting radius, mm */
  radius: number;
  /** cutting length above the tip, mm — carve only this, never the shank */
  fluteLen: number;
  /** cutting-volume test in the tool's local frame (see module doc) */
  inside(z: number, rhoSq: number): boolean;
  /** local AABB of the cutting volume: [x0, x1, y0, y1, z0, z1] — the FLUTE
   *  only (byte-identical to the pre-shank specs, pinned by toolShape
   *  tests); the kernel extends its pose AABB with shankRadius/shankTop */
  bounds(): [number, number, number, number, number, number];
  /** shank radius, mm — the WIDEST shank-profile band (an undercutting
   *  head, else shaftDiameter/2, else diameter/2): the kernel's pose AABB
   *  extends by it so red contact scanning covers the whole solid */
  shankRadius: number;
  /** top of the shank above the tip, mm = fluteLen + shank height, where
   *  the shank height is overallLength − fluteLength when both are known,
   *  else 30 (the kernel's pose AABB clamps to the grid anyway) */
  shankTop: number;
  /** shank CONTACT test (red collision — never removal): true where any
   *  shank-profile band [zFrom, zTo] contains z within its radius — today
   *  the shaft cylinder above the flute, plus the optional undercutting
   *  head band (headDiameter > shaft, Alice's 2026-10-26 T-slot groundwork:
   *  "a head wider than the shaft") */
  shankInside(z: number, rhoSq: number): boolean;
}

export function buildToolSpec(tool: Tool): ToolSpec {
  if (tool.type === 'laser') {
    throw new Error(`tool '${tool.name}' is a laser — laser moves must be skipped, never carved`);
  }
  const radius = tool.diameter / 2;
  const fluteLen = tool.fluteLength ?? tool.diameter * 4;
  const shank = shankOf(tool, fluteLen);

  switch (tool.type) {
    case 'ball': {
      const r = radius;
      return {
        radius,
        fluteLen,
        ...shank,
        inside(z, rhoSq) {
          if (z < 0 || z > fluteLen) return false;
          if (z < r) {
            const dz = z - r;
            return rhoSq <= r * r - dz * dz;
          }
          return rhoSq <= r * r;
        },
        bounds() {
          return [-r, r, -r, r, 0, fluteLen];
        },
      };
    }

    case 'bull': {
      // filleted bottom corner: below z = cr the flank radius shrinks so the
      // profile is a quarter-torus of tube radius cr — radius(z) =
      // r − (cr − √(cr² − (cr − z)²)) for 0 ≤ z ≤ cr. (The spec's ρ² +
      // (z − cr)² ≤ r² sketch is a barrel, not a fillet; this matches the
      // real bull-nose profile.) cr ≥ r degenerates to a ball.
      const r = radius;
      const cr = Math.min(tool.cornerRadius ?? 0, r);
      if (cr <= 1e-12) {
        return flatSpec(radius, fluteLen, shank);
      }
      return {
        radius,
        fluteLen,
        ...shank,
        inside(z, rhoSq) {
          if (z < 0 || z > fluteLen) return false;
          const eff = z < cr ? r - (cr - Math.sqrt(Math.max(0, cr * cr - (cr - z) * (cr - z)))) : r;
          return rhoSq <= eff * eff;
        },
        bounds() {
          return [-r, r, -r, r, 0, fluteLen];
        },
      };
    }

    case 'vbit':
    case 'corn': {
      // truncated cone: ρ ≤ tipR + z·tan(halfAngle) until it reaches the
      // full radius, then a cylinder of that radius to fluteLen. tipR from
      // tipDiameter/2 (default 0 — a sharp point).
      const tipR = (tool.tipDiameter ?? 0) / 2;
      const vAngle = tool.vAngle ?? 90;
      const half = (Math.max(1e-6, Math.min(179, vAngle)) / 2) * (Math.PI / 180);
      const slope = Math.tan(half);
      // cone height where the cone reaches radius (clamped to fluteLen)
      const coneH = slope > 1e-12 ? (radius - tipR) / slope : fluteLen;
      const zCone = Math.min(Math.max(0, coneH), fluteLen);
      return {
        radius,
        fluteLen,
        ...shank,
        inside(z, rhoSq) {
          if (z < 0 || z > fluteLen) return false;
          const eff = z <= zCone ? tipR + z * slope : radius;
          return rhoSq <= eff * eff;
        },
        bounds() {
          return [-radius, radius, -radius, radius, 0, fluteLen];
        },
      };
    }

    case 'drill': {
      // cone point by drillPointAngle (the INCLUDED angle, default 118°):
      // ρ ≤ z·tan(halfAngle) below the cone height, cylinder above
      const angle = tool.drillPointAngle ?? 118;
      const half = (Math.max(1e-6, Math.min(179, angle)) / 2) * (Math.PI / 180);
      const slope = Math.tan(half);
      const coneH = Math.min(radius / slope, fluteLen);
      return {
        radius,
        fluteLen,
        ...shank,
        inside(z, rhoSq) {
          if (z < 0 || z > fluteLen) return false;
          const eff = z <= coneH ? z * slope : radius;
          return rhoSq <= eff * eff;
        },
        bounds() {
          return [-radius, radius, -radius, radius, 0, fluteLen];
        },
      };
    }

    case 'flat':
      return flatSpec(radius, fluteLen, shank);

    case 'threadmill': {
      // The TOOTHED BAND cuts — the 60° thread form, not a flat wall
      // (Alice, 2026-10-28: her sim report — "it has done a straight cut,
      // like the flat vertical wall left by an endmill, rather than using
      // the tooth profile of the threadmill"). The form derives from the
      // tool's own record: a trapezoid TOOTH — tip flat p/6 at the cut Ø
      // (the groove's root flat), flanks at 30° (60° included), root at
      // cutØ − 1.2268·p (the ISO d3, D3_FACTOR — the root circle rides the
      // crest plane by design). REVOLVED about the spindle axis: the tool
      // spins, so the revolved envelope is the exact removal solid —
      // sweeping it along the helix traces the groove continuously.
      // `flutes` = the TOOTH count, at ONE circumferential spot, pitch
      // spaced (Alice) — multi-tooth bands merge over the root cylinder
      // (why they are pitch-locked); a 1-tooth stands alone on its neck.
      // Above the band: the NECK at the CONSTANT root Ø through the whole
      // cutting length (Alice, 2026-10-28 night — the red-column report:
      // "just above where the tool is cutting, taller and taller as the
      // spiral climbs" was this tool modeled with a linear taper to the
      // shank, running deeper than the crest at every height). The root
      // circle rides the crest plane EXACTLY (d3/2 + 0.6134·p = Ø/2), so
      // a constant-Ø neck grazes at tolerance 0 and shaves `tol`-deep
      // past it — real thread-milling physics, not a collision. The
      // taper/shank starts only ABOVE the cutting length.
      if (tool.pitch === undefined || !(tool.pitch > 0)) {
        return flatSpec(radius, fluteLen, shank); // no pitch on record — nothing to derive
      }
      const p = tool.pitch;
      const teeth = Math.max(1, tool.flutes ?? 1);
      const rootR = radius - (D3_FACTOR / 2) * p;
      if (rootR <= 0) return flatSpec(radius, fluteLen, shank); // degenerate — skip the form
      const tan30 = Math.tan(Math.PI / 6);
      const halfTip = p / 12; // half the p/6 tip flat
      const toothSpan = halfTip + (radius - rootR) * tan30; // ≈ 0.437·p per side
      const bandLen = 2 * toothSpan + (teeth - 1) * p;
      const centers = Array.from({ length: teeth }, (_, k) => toothSpan + k * p);
      const shaftR = (tool.shaftDiameter ?? tool.diameter) / 2;
      const cutting = Math.max(bandLen, fluteLen);
      const top = tool.overallLength !== undefined ? tool.overallLength : cutting + 30;
      // contact bands: the constant-Ø neck through the cutting length,
      // then the shank above it
      const bands: ShankBand[] = [];
      if (cutting > bandLen) {
        bands.push({ zFrom: bandLen, zTo: cutting, r0: rootR, r1: rootR });
      }
      if (top > cutting) {
        bands.push({ zFrom: cutting, zTo: top, r0: shaftR, r1: shaftR });
      }
      return {
        radius,
        // the CUTTING solid is the toothed band alone — the cutting length
        // is the TAPER's reach (contact), not cutting extent
        fluteLen: bandLen,
        shankRadius: Math.max(shaftR, rootR),
        shankTop: top,
        shankInside(z, rhoSq) {
          return shankInsideBands(bands, z, rhoSq);
        },
        inside(z, rhoSq) {
          if (z < 0 || z > bandLen) return false;
          const rho = Math.sqrt(rhoSq);
          if (rho > radius) return false;
          // between teeth the multi-tooth band is solid at the root
          // circle (the merged body — it shaves the crests when the fit
          // is cut deeper than nominal, honest physics); a 1-tooth's
          // body below its root is the neck — contact, never removal
          if (rho <= rootR) return teeth >= 2;
          const halfW = halfTip + (radius - rho) * tan30;
          return centers.some((c) => Math.abs(z - c) <= halfW);
        },
        bounds() {
          return [-radius, radius, -radius, radius, 0, bandLen];
        },
      };
    }
  }
}

/** shank-profile band: z ∈ (zFrom, zTo] within its radius — contact-only
 *  (red collision), never removal. The radius may TAPER linearly r0 → r1
 *  (a thread mill's thin taper between the toothed band and the shank);
 *  cylindrical bands are the r0 === r1 case. */
type ShankBand = { zFrom: number; zTo: number; r0: number; r1: number };

/** Band membership radius at z (linear r0 → r1). */
function bandRadiusAt(b: ShankBand, z: number): number {
  if (b.zTo <= b.zFrom) return b.r0;
  const t = Math.min(1, Math.max(0, (z - b.zFrom) / (b.zTo - b.zFrom)));
  return b.r0 + (b.r1 - b.r0) * t;
}

/** Contact test over a band stack (red collision — never removal). */
function shankInsideBands(bands: ShankBand[], z: number, rhoSq: number): boolean {
  for (const b of bands) {
    if (z > b.zFrom && z <= b.zTo) {
      const r = bandRadiusAt(b, z);
      if (rhoSq <= r * r) return true;
    }
  }
  return false;
}

/** shank solid (red-collision contact only — never removal) as BANDS above
 *  the flute: today the shaft cylinder (radius shaftDiameter/2, default
 *  diameter/2; top at fluteLen + (overallLength − fluteLength), or +30 when
 *  the overall length is unknown — the kernel's pose AABB clamps to the
 *  grid), plus the optional UNDERCUTTING HEAD a T-slot bit carries: a wide
 *  band right above the flute (headDiameter/headLength) with the slimmer
 *  shaft continuing above it. shankRadius = the widest band, shankTop =
 *  the topmost — the kernel's AABB covers the whole solid. */
function shankOf(
  tool: Tool,
  fluteLen: number,
): Pick<ToolSpec, 'shankRadius' | 'shankTop' | 'shankInside'> {
  const shaftRadius = (tool.shaftDiameter ?? tool.diameter) / 2;
  const shankLen = tool.overallLength !== undefined ? Math.max(0, tool.overallLength - fluteLen) : 30;
  const shankTop = fluteLen + shankLen;
  const bands: ShankBand[] = [];
  const headR = (tool.headDiameter ?? 0) / 2;
  const headLen = tool.headLength ?? 0;
  if (headR > 0 && headLen > 0) {
    // the head sits directly above the flute; the shaft continues above it
    bands.push({ zFrom: fluteLen, zTo: fluteLen + headLen, r0: headR, r1: headR });
    if (shankTop > fluteLen + headLen) {
      bands.push({ zFrom: fluteLen + headLen, zTo: shankTop, r0: shaftRadius, r1: shaftRadius });
    }
  } else {
    bands.push({ zFrom: fluteLen, zTo: shankTop, r0: shaftRadius, r1: shaftRadius });
  }
  return {
    shankRadius: Math.max(...bands.map((b) => Math.max(b.r0, b.r1))),
    shankTop: Math.max(...bands.map((b) => b.zTo)),
    shankInside(z, rhoSq) {
      return shankInsideBands(bands, z, rhoSq);
    },
  };
}

function flatSpec(radius: number, fluteLen: number, shank: Pick<ToolSpec, 'shankRadius' | 'shankTop' | 'shankInside'>): ToolSpec {
  return {
    radius,
    fluteLen,
    ...shank,
    inside(z, rhoSq) {
      return z >= 0 && z <= fluteLen && rhoSq <= radius * radius;
    },
    bounds() {
      return [-radius, radius, -radius, radius, 0, fluteLen];
    },
  };
}
