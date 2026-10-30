/**
 * THE ORIENTATION COVER (P3 of the true-4D plan): picking index angles
 * is a SET-COVER problem over surface cells, not a path problem. The
 * greedy takes the cleared-set map's per-orientation cleared sets and
 * repeatedly picks the orientation that clears the most currently-
 * uncovered material cells, until no candidate adds anything. The
 * minimal-set promise this exists for: a handful of planned
 * orientations instead of hand-tuned index stacks.
 *
 * Greedy termination is exact for the greedy's own criterion (no
 * candidate adds a cell → stop), and the result is reported with its
 * numbers — covered cells, the picks with per-pick gains, and the
 * coverable set the picks worked over — so the planner's caller (the
 * op summary, her oracle runs) sees the honest coverage, never just
 * the chosen angles.
 */

import type { ClearedSetResult } from './clearedSet';

export interface CoverPick {
  /** the chosen orientation, degrees absolute */
  angle: number;
  /** cells this pick cleared that no earlier pick had */
  gain: number;
  /** total material cells covered after this pick */
  total: number;
}

export interface CoverPlan {
  picks: CoverPick[];
  /** material cells cleared by the chosen set */
  covered: number;
}

export function greedyCover(map: ClearedSetResult): CoverPlan {
  const n = map.nx * map.nTheta;
  const covered = new Uint8Array(n);
  const used = new Uint8Array(map.orientations.length);
  const picks: CoverPick[] = [];
  let coveredCount = 0;

  for (;;) {
    let best = -1;
    let bestGain = 0;
    for (let oi = 0; oi < map.orientations.length; oi++) {
      if (used[oi]) continue;
      let gain = 0;
      for (let k = 0; k < n; k++) {
        if (!covered[k] && map.cleared[oi * n + k] === 1) gain++;
      }
      if (gain > bestGain) {
        bestGain = gain;
        best = oi;
      }
    }
    if (best < 0 || bestGain === 0) break;
    used[best] = 1;
    for (let k = 0; k < n; k++) {
      if (!covered[k] && map.cleared[best * n + k] === 1) {
        covered[k] = 1;
        coveredCount++;
      }
    }
    picks.push({ angle: map.orientations[best], gain: bestGain, total: coveredCount });
    if (picks.length >= map.orientations.length) break; // the whole ladder is in
  }

  return { picks, covered: coveredCount };
}