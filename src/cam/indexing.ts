/**
 * Index-angle helpers (PLAN.md "indexed pocket/profile/drill"): with the
 * stock frozen at a fixed A, flat 2.5D operations run in the frame rotated
 * with the stock. Generation maps the A=0 machine-space features through
 * `indexedPointRotation` (right-hand rotation about the machine X axis
 * through the stock axis at y=0, z=axisZ — the same convention as the
 * rotary preview wrap), then emits one G0 A positioning move before the
 * flat moves, which are valid machine coordinates as-is.
 */

import * as THREE from 'three';

/** Map an A=0 machine point to its position with the stock at index angle A. */
export function indexedPointRotation(
  angleDeg: number,
  axisZ: number,
): (p: { x: number; y: number; z: number }) => THREE.Vector3 {
  const th = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return (p) => {
    const zrel = p.z - axisZ;
    return new THREE.Vector3(p.x, p.y * cos - zrel * sin, p.y * sin + zrel * cos + axisZ);
  };
}

/**
 * The index angle that brings a selected feature to face the cutter: its
 * radial direction (about the stock axis) rotated onto machine +Z, in
 * degrees normalized to [0, 360).
 */
export function indexToFaceTop(p: { x: number; y: number; z: number }, axisZ: number): number {
  const deg = (Math.atan2(p.y, p.z - axisZ) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/**
 * The index angle that aligns a DIRECTION with machine +Z — the general
 * rule for "Index to selection": a face's normal (or a hole's axis)
 * rotated to point straight up. Rotation about X cannot remove an X
 * component, so directions tilted in X are best-effort (their YZ
 * projection is aligned).
 */
export function indexToAlignDirection(dir: { x: number; y: number; z: number }): number {
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 1e-9) return 0;
  const deg = (Math.atan2(dir.y / len, dir.z / len) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}