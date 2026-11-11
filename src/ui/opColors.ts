/**
 * Per-operation-kind accent colors (Alice, 2026-11-11, after ZCam's
 * toolpath list): each op row carries a colored left bar and the kind
 * select picks up the hue, so the panel reads at a glance the way their
 * screenshot does. Panel rows only — the viewport keeps its feed-amber /
 * rapid-red convention (her ruling: color encodes cut vs non-cut there,
 * not op identity). hues crowd in places (17 kinds); near-duplicates were
 * spent on kinds that rarely coexist.
 */

import type { JobOp } from '../core/types';

export const OP_KIND_COLORS: Record<JobOp['kind'], string> = {
  // ---- flat ops
  pocket: '#ff6f91', // rose
  profile: '#ff9d5c', // orange
  drill: '#4ecf7a', // green
  chamfer: '#5fd0a8', // mint
  engrave: '#b48cff', // lavender
  slicePocket: '#f05c5c', // red
  waterline: '#54c8e8', // cyan
  rasterContour: '#7f8ff0', // indigo
  threadMill: '#f5e050', // yellow
  // ---- rotary ops
  index: '#8d99a3', // gray — positions the stock, cuts nothing
  faceCylinder: '#4fc3f7', // sky
  cylChamfer: '#8fd05f', // lime
  spiralCarve: '#e91e8c', // magenta
  thread: '#e6a23c', // amber
  rotaryCarve: '#35d0ba', // teal
  contour4d: '#9d6bff', // violet
  swarfFinish: '#6fe0a8', // spring green
};
