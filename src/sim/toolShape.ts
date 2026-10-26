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
 *  threadmill → flat (documented v1 approximation)
 *  laser      → buildToolSpec THROWS — the caller must skip laser moves
 *               before the kernel ever sees them (laserSkipped counter)
 */

import type { Tool } from '../core/types';

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
  /** shank radius, mm — shaftDiameter/2, defaulting to diameter/2 */
  shankRadius: number;
  /** top of the shank above the tip, mm = fluteLen + shank height, where
   *  the shank height is overallLength − fluteLength when both are known,
   *  else 30 (the kernel's pose AABB clamps to the grid anyway) */
  shankTop: number;
  /** shank CONTACT test (red collision — never removal): z strictly above
   *  the flute, up to shankTop, within shankRadius */
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
    case 'threadmill': // documented v1 approximation: threadmill cuts as flat
      return flatSpec(radius, fluteLen, shank);
  }
}

/** shank solid (red-collision contact only — never removal):
 *  radius from shaftDiameter/2 (default diameter/2), top at
 *  fluteLen + (overallLength − fluteLength) or fluteLen + 30 when the
 *  overall length is unknown (the kernel's pose AABB clamps to the grid) */
function shankOf(
  tool: Tool,
  fluteLen: number,
): Pick<ToolSpec, 'shankRadius' | 'shankTop' | 'shankInside'> {
  const shankRadius = (tool.shaftDiameter ?? tool.diameter) / 2;
  const shankLen = tool.overallLength !== undefined ? Math.max(0, tool.overallLength - fluteLen) : 30;
  const shankTop = fluteLen + shankLen;
  return {
    shankRadius,
    shankTop,
    shankInside(z, rhoSq) {
      return z > fluteLen && z <= shankTop && rhoSq <= shankRadius * shankRadius;
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
