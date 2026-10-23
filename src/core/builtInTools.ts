/**
 * The built-in tool library: Makera's imported set plus OUR additions.
 * Makera's Fusion tool files (CarveraProfiles) carry no laser module —
 * it's a machine accessory, not a CAM tool — so it's appended here
 * rather than faked into the generated import (which regeneration would
 * drop). Defaults come from the mill-tested examples: Makera's own
 * aluminum vector engrave is S0.2 F100 (examples/lengrave_TOP,
 * docs/makera-dialect.md "Laser job").
 */

import { MAKERA_TOOLS } from './makeraTools.generated';
import type { Tool } from './types';

/**
 * The Makera 5W Laser Module as a library tool: 3.175 mm shank, so it
 * drops straight into the default collet fitted to the machine. The
 * `spindleRpm` slot is the beam POWER in percent (documented reuse —
 * the ⚡→preset→tool resolution chain is shared); `focus` is the
 * standoff the head rides at.
 */
export const LASER_TOOL: Tool = {
  id: 'simple-cam-laser-module',
  name: 'Makera 5W Laser Module',
  type: 'laser',
  subtype: 'Laser',
  diameter: 0.1, // spot
  shaftDiameter: 3.175, // the default collet's shank
  spindleRpm: 20, // power %
  focus: 1.5,
  presets: [
    {
      // the one mill-tested data point we have: Makera's own engrave
      material: 'Aluminum',
      spindleRpm: 20, // S0.2
      feed: 100,
      plungeFeed: 100, // unused — the laser never plunges
      stepDown: 0.5,
      rampFeed: 100,
    },
  ],
};

export const BUILT_IN_TOOLS: Tool[] = [...MAKERA_TOOLS, LASER_TOOL];