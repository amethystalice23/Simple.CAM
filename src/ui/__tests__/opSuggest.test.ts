/**
 * The suggest-ops knowledge engine (src/ui/opSuggest.ts, docs/PLAN.md
 * "Suggest ops" round 1): one picked feature → measured facts + the ops
 * that could drive it. The gates here are the CONTRACT: every offered
 * candidate must be one its op would actually accept (opTargets.ts's own
 * tolerances), so these tests pin the offer against the acceptance rules.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { DetectedFeatures } from '../../cam/features';
import type { CircleFeature, JobOp, ModelTransform, PlaneFeature, RadialChainFeature, Stock, Tool } from '../../core/types';
import { MAKERA_TOOLS } from '../../core/makeraTools.generated';
import type { FeatureSource } from '../featureSources';
import type { ResolvedFeature } from '../featureSources';
import { createSuggestedOp, describePickedFeature, suggestToolFor } from '../opSuggest';

const IDENTITY: ModelTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotationDeg: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const stock4: Extract<Stock, { kind: 'cylinder' }> = {
  kind: 'cylinder',
  length: 50,
  xOrigin: 'mid',
  calibration: { aOriginDeg: 0, axisZ: 20, effectiveRadius: 10 },
  axisMode: '4-axis',
  materialId: 'delrin',
};

/** minimal source: only the arrays the engine reads, identity transform.
 *  The geometry carries an EMPTY position attribute — planeExtents reads
 *  attr.count whenever any plane exists, so a bare BufferGeometry throws
 *  on the first plane test. */
function source(features: Partial<DetectedFeatures>): FeatureSource {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  return {
    id: 'model',
    geometry,
    transform: IDENTITY,
    features: {
      planes: [],
      circles: [],
      edges: [],
      radialChains: [],
      paths: [],
      faceToPlane: new Int32Array(0),
      planeLoops: [],
      ...features,
    },
  };
}

function resolved(
  kind: ResolvedFeature['kind'],
  source: FeatureSource,
  index: number,
): ResolvedFeature {
  const f = source.features as DetectedFeatures;
  const feature = (
    kind === 'plane' ? f.planes[index] :
    kind === 'circle' ? f.circles[index] :
    kind === 'edge' ? f.edges[index] :
    kind === 'path' ? f.paths[index] :
    f.radialChains[index]
  ) as ResolvedFeature['feature'];
  return { source, kind, index, feature };
}

describe('describePickedFeature — circles', () => {
  it('a full vertical hole rim offers drill, internal thread, chamfer', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 3, y: 4, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 3,
      inner: true,
    };
    const s = source({ circles: [c] });
    const k = describePickedFeature(resolved('circle', s, 0), stock4);
    expect(k.title).toBe('Ø6.0 hole rim');
    expect(k.candidates.map((x) => x.kind)).toEqual(['drill', 'threadMill', 'chamfer']);
    // the metric pitch rides the offer: an M6 rim threads at 1.0
    expect(k.candidates[1].why).toContain('M6.0 × 1.0');
    expect(k.notes).toEqual([]);
  });

  it('a boss rim offers a PROFILE, never a drill or an auto-thread (Alice, 2026-11-12)', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 5,
      inner: false,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    // the 2026-11-12 ruling: threading a plain boss rim was an unusual
    // suggestion — a boss is a contour to turn down (profile), the thread
    // is a deliberate choice, not an automatic offer
    expect(k.candidates.map((x) => x.kind)).toEqual(['profile', 'chamfer']);
    expect(k.candidates[0].why).toContain('boss');
  });

  it('a partial rim refuses the bore ops and says so', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 3,
      inner: true,
      arcs: [[{ x: 3, y: 0, z: 28 }, { x: 0, y: 3, z: 28 }]],
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    expect(k.title).toContain('partial');
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('partial rim');
  });

  it('a circle around the stock axis offers the rotary ring ops', () => {
    // on-axis: center sits on the rotation axis (y 0, z = axisZ)
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 10, y: 0, z: 20 },
      axis: { x: 1, y: 0, z: 0 },
      radius: 8,
      inner: false,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    // face FIRST (her 2026-11-12 ruling): the chamfer rides the finished Ø
    expect(k.candidates.map((x) => x.kind)).toEqual(['faceCylinder', 'cylChamfer']);
  });

  it('an around-X circle OFF the stock axis is refused with the ellipse reason', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 10, y: 4, z: 20 },
      axis: { x: 1, y: 0, z: 0 },
      radius: 8,
      inner: false,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('ellipse');
  });

  it('a 3-axis stock never offers the rotary ops', () => {
    const stock3: Stock = { ...stock4, axisMode: '3-axis' };
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 10, y: 0, z: 20 },
      axis: { x: 1, y: 0, z: 0 },
      radius: 8,
      inner: false,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock3);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('cannot align');
  });

  it('a RADIAL bore (sideways rim) is rescued by a SUGGESTED INDEX at the head', () => {
    // a hole drilled sideways into the stock: rim axis points +Y at A=0.
    // A=90 turns it up; the drill/thread/chamfer follow in the rotated
    // frame. (A vertical far-side rim is NOT this case — the up-facing
    // re-anchor reads a real through-bore at its top mouth, so vertical
    // rims never need an Index.)
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 10, z: 20 },
      axis: { x: 0, y: 1, z: 0 },
      radius: 3,
      inner: true,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['index', 'drill', 'threadMill', 'chamfer']);
    expect(k.candidates[0].angle).toBe(90);
    expect(k.notes[0]).toContain('rotated first');
  });

  it('a bore tilted ALONG the stock axis is refused — no datum aligns it', () => {
    // axis 30° off Z toward X: the X component survives every rotation
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0.5, y: 0, z: Math.cos(Math.PI / 6) },
      radius: 3,
      inner: true,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('cannot align');
  });
});

describe('describePickedFeature — stepped rims (indent vs chamfered bore)', () => {
  /** Solid-of-revolution meshes about Z, from a CLOSED cross-section
   *  profile of (radius, z) points run outer-wall-down (winding
   *  verified outward by cross product on the outer wall). The caller
   *  closes the loop by repeating the first point. */
  function revolve(profile: [number, number][], segments = 32): THREE.BufferGeometry {
    const pts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const x0 = Math.cos(a0), y0 = Math.sin(a0);
      const x1 = Math.cos(a1), y1 = Math.sin(a1);
      for (let k = 0; k < profile.length - 1; k++) {
        const [r0, z0] = profile[k];
        const [r1, z1] = profile[k + 1];
        if (r0 === r1 && z0 === z1) continue;
        pts.push(
          x0 * r0, y0 * r0, z0, x1 * r1, y1 * r1, z1, x1 * r0, y1 * r0, z0,
          x0 * r0, y0 * r0, z0, x0 * r1, y0 * r1, z1, x1 * r1, y1 * r1, z1,
        );
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    return g;
  }

  /** a round bar, top at Z=20, with a flat-bottomed Ø6 indent sunk to
   *  Z=17 under a Ø10 chamfer mouth (rim at Z=20, floor rim at Z=17) —
   *  the shape of Alice's outer_barrel_adapter indent. The closed
   *  cross-section profile, outer-wall-down: top edge → outer wall →
   *  bottom → up the axis → the indent floor → the chamfer cone → back
   *  to the top edge. */
  function indentBar(): { geometry: THREE.BufferGeometry; circles: CircleFeature[] } {
    const base: [number, number][] = [
      [10, 20], [10, 0], [0, 0], [0, 17], [3, 17], [5, 20],
    ];
    const geometry = revolve([...base, base[0]]);
    const circles: CircleFeature[] = [
      {
        kind: 'circle', id: 'mouth', center: { x: 0, y: 0, z: 20 },
        axis: { x: 0, y: 0, z: -1 }, radius: 5, inner: true,
      },
      {
        kind: 'circle', id: 'floor', center: { x: 0, y: 0, z: 17 },
        axis: { x: 0, y: 0, z: 1 }, radius: 3, inner: true,
      },
    ];
    return { geometry, circles };
  }

  it('an indent FLOOR rim (under a larger coaxial mouth) offers pocket + chamfer, not drill/thread', () => {
    const { geometry, circles } = indentBar();
    const s = source({ circles });
    s.geometry = geometry;
    const k = describePickedFeature(resolved('circle', s, 1), stock4);
    expect(k.title).toContain('indent floor');
    expect(k.candidates.map((x) => x.kind)).toEqual(['pocket', 'chamfer']);
    expect(k.candidates[0].why).toContain('Ø6.0 under the Ø10.0 mouth');
  });

  it('the indent MOUTH rim (angled chamfer wall below, indent closes) offers pocket + chamfer, never drill/thread', () => {
    const { geometry, circles } = indentBar();
    const s = source({ circles });
    s.geometry = geometry;
    const k = describePickedFeature(resolved('circle', s, 0), stock4);
    // the wall under the mouth is the chamfer cone — no constant Ø for a
    // thread, and a drill at the mouth's Ø would plough the cone
    expect(k.candidates.map((x) => x.kind)).toEqual(['pocket', 'chamfer']);
    expect(k.title).toContain('indent mouth');
  });

  it('a chamfered BORE floor — hole continues past the rim — keeps drill + thread (indentRole raycast)', () => {
    // a Ø10 bar with a Ø6 THROUGH hole and a Ø10 chamfer at the top:
    // the Ø3-radius bore rim at the chamfer cone's base must NOT read
    // as an indent floor (the ray down the axis flies through)
    // closed cross-section: outer wall down → bottom annulus in to the
    // bore → bore wall up → chamfer cone out → top annulus closed
    const base: [number, number][] = [
      [10, 20], [10, -20], [3, -20], [3, 17], [5, 20],
    ];
    const geometry = revolve([...base, base[0]]);
    // circle at the bore rim under the chamfer mouth (Ø6 bore under
    // Ø10 mouth, hole continues to -20)
    const circles: CircleFeature[] = [
      {
        kind: 'circle', id: 'mouth', center: { x: 0, y: 0, z: 20 },
        axis: { x: 0, y: 0, z: -1 }, radius: 5, inner: true,
      },
      {
        kind: 'circle', id: 'bore', center: { x: 0, y: 0, z: 17 },
        axis: { x: 0, y: 0, z: 1 }, radius: 3, inner: true,
      },
    ];
    const s = source({ circles });
    s.geometry = geometry;
    const k = describePickedFeature(resolved('circle', s, 1), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['drill', 'threadMill', 'chamfer']);
  });
});

describe('describePickedFeature — planes', () => {
  /** a 10×6 level rectangle at Z5, two triangles, all mapped to plane 0 */
  function levelFace(): FeatureSource {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -5, -3, 5, 5, -3, 5, 5, 3, 5,
          -5, -3, 5, 5, 3, 5, -5, 3, 5,
        ]),
        3,
      ),
    );
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0, y: 0, z: 1 },
    };
    return {
      id: 'model',
      geometry: g,
      transform: IDENTITY,
      features: {
        planes: [plane],
        circles: [],
        edges: [],
        radialChains: [],
        paths: [],
        faceToPlane: new Int32Array([0, 0]),
        planeLoops: [],
      },
    };
  }

  it('a level face offers pocket + chamfer and measures its size', () => {
    const s = levelFace();
    const k = describePickedFeature(resolved('plane', s, 0), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['pocket', 'chamfer']);
    const size = k.facts.find((f) => f.label === 'size');
    expect(size?.value).toBe('10.0 × 6.0 mm');
  });

  it('a face pointing AWAY (far side) is rescued by a SUGGESTED INDEX at the head', () => {
    // normal straight down at A=0 — the bottom of a part. Rotation about
    // the stock axis brings it level at A=180°
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0, y: 0, z: -1 },
    };
    const k = describePickedFeature(resolved('plane', source({ planes: [plane] }), 0), stock4);
    // the SIGN gate (opTargets pocketRegions gates the same way): a
    // down-face is NOT level-up — the INDEX is what's offered first,
    // with the pocket/chamfer behind it in the rotated frame
    expect(k.candidates.map((x) => x.kind)).toEqual(['index', 'pocket', 'chamfer']);
    expect(k.candidates[0].angle).toBe(180);
    expect(k.notes[0]).toContain('rotated first');
  });

  it('a sideways face is rescued by a suggested Index at its own angle', () => {
    // 30° tilt in the YZ plane — the rotatable kind: A=30 brings it level
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0, y: 0.5, z: Math.cos(Math.PI / 6) },
    };
    const k = describePickedFeature(resolved('plane', source({ planes: [plane] }), 0), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['index', 'pocket', 'chamfer']);
    expect(k.candidates[0].angle).toBeCloseTo(30, 5);
  });

  it('a tilt ALONG the stock axis is refused — no datum angle removes it', () => {
    // 30° tilt about Y: normal (sin30, 0, cos30) — the X component stays
    // under every rotation, so the face can never face the cutter
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0.5, y: 0, z: Math.cos(Math.PI / 6) },
    };
    const k = describePickedFeature(resolved('plane', source({ planes: [plane] }), 0), stock4);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('cannot remove that tilt');
  });

  it('a face parallel to the stock axis is refused the same way', () => {
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 1, y: 0, z: 0 },
    };
    const k = describePickedFeature(resolved('plane', source({ planes: [plane] }), 0), stock4);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('cannot remove that tilt');
  });
});

describe('describePickedFeature — chains, paths, edges', () => {
  it('a radial chain offers the 4D contour pair', () => {
    const ch: RadialChainFeature = {
      kind: 'radialChain',
      id: 'ch1',
      points: [
        { x: 0, y: 10, z: 20 },
        { x: 5, y: 0, z: 20 },
        { x: 0, y: -10, z: 20 },
      ],
      meanRadius: 10,
    };
    const k = describePickedFeature(resolved('radialChain', source({ radialChains: [ch] }), 0), stock4);
    expect(k.title).toBe('Curved seam Ø20.0');
    expect(k.candidates.map((x) => x.kind)).toEqual(['contour4d', 'rasterContour']);
    expect(k.facts.find((f) => f.label === 'X span')?.value).toBe('0.0 → 5.0 mm');
  });

  it('artwork offers engrave and reports its topology', () => {
    const path = {
      kind: 'path' as const,
      id: 'pa1',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 4, z: 0 },
      ],
      closed: true,
      filled: true,
    };
    const k = describePickedFeature(resolved('path', source({ paths: [path] }), 0), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['engrave']);
    expect(k.facts.find((f) => f.label === 'length')?.value).toBe('5.0 mm');
    expect(k.facts.find((f) => f.label === 'topology')?.value).toBe('closed');
  });

  it('an edge is a datum, not a path — only the Index aim is offered (4-axis)', () => {
    const e = {
      kind: 'edge' as const,
      id: 'e1',
      a: { x: 0, y: 0, z: 0 },
      b: { x: 3, y: 4, z: 0 },
    };
    const k4 = describePickedFeature(resolved('edge', source({ edges: [e] }), 0), stock4);
    expect(k4.candidates.map((x) => x.kind)).toEqual(['index']);
    expect(k4.notes[0]).toContain('datum');
    const stock3: Stock = { ...stock4, axisMode: '3-axis' };
    const k3 = describePickedFeature(resolved('edge', source({ edges: [e] }), 0), stock3);
    expect(k3.candidates).toEqual([]);
  });
});
describe('createSuggestedOp — the op each ticked suggestion becomes', () => {
  const flat = MAKERA_TOOLS.find((t) => t.id === 'makera-o-flute-bits-spiral-o-metal-3-175-12mm')!;

  it('a far-side face: index first, then the pocket prefilled in the ROTATED frame', () => {
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 25 },
      normal: { x: 0, y: 0, z: -1 },
    };
    const s = source({ planes: [plane] });
    const r = resolved('plane', s, 0);
    const k = describePickedFeature(r, stock4);
    const index = createSuggestedOp(k.candidates[0], r, [s], stock4, flat, 'delrin', []);
    expect(index.kind).toBe('index');
    expect((index as Extract<JobOp, { kind: 'index' }>).angle).toBe(180);
    expect(index.featureIds).toEqual([]);

    // the pocket AFTER the index prefills through the rotation: the face
    // at machine Z25 flips to Z15 (A 180 about axis Z20) → endDepth 15
    // below the crown (Z30). Without the index it would read 5.
    const pocket = createSuggestedOp(k.candidates[1], r, [s], stock4, flat, 'delrin', [index]);
    expect(pocket.kind).toBe('pocket');
    expect(pocket.featureIds).toEqual(['p1']);
    expect((pocket as Extract<JobOp, { kind: 'pocket' }>).endDepth).toBe(15);
    const bare = createSuggestedOp(k.candidates[1], r, [s], stock4, flat, 'delrin', []);
    expect((bare as Extract<JobOp, { kind: 'pocket' }>).endDepth).toBe(5);
  });

  it('a vertical M6 rim: the thread mill arrives fully specified', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 3, y: 4, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 3,
      inner: true,
    };
    const s = source({ circles: [c] });
    const r = resolved('circle', s, 0);
    const k = describePickedFeature(r, stock4);
    const tm = createSuggestedOp(k.candidates[1], r, [s], stock4, flat, 'delrin', []);
    expect(tm.kind).toBe('threadMill');
    const t = tm as Extract<JobOp, { kind: 'threadMill' }>;
    expect(t.featureIds).toEqual(['c1']);
    expect(t.internal).toBe(true);
    expect(t.nominalDiameter).toBe(6);
    expect(t.pitch).toBe(1);
    expect(t.startDepth).toBe(2); // crown 30 − rim 28
    // drill keeps its defaults (not depth-bearing): first-click parity
    const drill = createSuggestedOp(k.candidates[0], r, [s], stock4, flat, 'delrin', []) as Extract<
      JobOp,
      { kind: 'drill' }
    >;
    expect(drill.featureIds).toEqual(['c1']);
    expect(drill.depth).toBe(5);
  });

  it('an around-axis rim prefills the rotary face target Ø', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 10, y: 0, z: 20 },
      axis: { x: 1, y: 0, z: 0 },
      radius: 8,
      inner: false,
    };
    const s = source({ circles: [c] });
    const r = resolved('circle', s, 0);
    const k = describePickedFeature(r, stock4);
    const face = createSuggestedOp(k.candidates[0], r, [s], stock4, flat, 'delrin', []);
    expect((face as Extract<JobOp, { kind: 'faceCylinder' }>).targetDiameter).toBe(16);
  });
});

describe('suggestToolFor — the tool each suggestion would run with', () => {
  const tool = (id: string, type: string, diameter: number): Tool =>
    ({ id, name: id, type: type as Tool['type'], diameter }) as Tool;
  const flat6 = tool('f6', 'flat', 6);
  const flat3 = tool('f3', 'flat', 3.175);
  const flat1 = tool('f1', 'flat', 1.5);
  const drill3 = tool('d3', 'drill', 3.175);
  const vbit = tool('v1', 'vbit', 3.175);
  const ball3 = tool('b3', 'ball', 3);
  const library = [flat6, flat3, flat1, drill3, vbit, ball3];

  const rim6 = (): { r: ResolvedFeature; k: ReturnType<typeof describePickedFeature> } => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 3,
      inner: true,
    };
    const s = source({ circles: [c] });
    const r = resolved('circle', s, 0);
    return { r, k: describePickedFeature(r, stock4) };
  };

  it('an in-use tool that fits wins over a better library fit', () => {
    const { r, k } = rim6(); // Ø6 bore → drill bound 6
    // in-use flat 3.175 fits; the library drill 3.175 also fits — the
    // IN-USE preference takes it (her ruling), even over the drill type
    const s = suggestToolFor(k.candidates[0], r, [flat3], library);
    expect(s?.tool.id).toBe('f3');
    expect(s?.inUse).toBe(true);
  });

  it('a bore wants an actual drill bit when the in-use tools do not fit', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c2',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 1.75, // Ø3.5 bore: flat 3.175 still fits
      inner: true,
    };
    const s2 = source({ circles: [c] });
    const r2 = resolved('circle', s2, 0);
    const k2 = describePickedFeature(r2, stock4);
    const s = suggestToolFor(k2.candidates[0], r2, [flat6], library);
    // flat6 (Ø6) does not fit the Ø3.5 bore → library: drill preferred
    expect(s?.tool.id).toBe('d3');
    expect(s?.inUse).toBe(false);
  });

  it('an internal thread mill must clear the minor Ø — and be a thread mill', () => {
    const { r, k } = rim6(); // M6 × 1 → minor ≈ 4.9, bound ≈ 4.4
    const tm = k.candidates[1];
    expect(tm.kind).toBe('threadMill');
    expect(tm.internal).toBe(true);
    // threadMill generation requires a real thread-mill type tool: a Ø5
    // one in use that cannot tilt inside the bore, and no fitting thread
    // mill anywhere → NO suggestion (the generator's own gate, mirrored)
    const wide = suggestToolFor(tm, r, [tool('tm5', 'threadmill', 5)], library);
    expect(wide).toBeNull();
    // a fitting thread mill in use beats everything
    const narrow = suggestToolFor(tm, r, [tool('tm3', 'threadmill', 3)], library);
    expect(narrow?.tool.id).toBe('tm3');
    expect(narrow?.inUse).toBe(true);
  });

  it('the rotary chamfer takes the in-use chamfer bit, never a flat (her report)', () => {
    // her live case: T1 flat in use + T2 90° chamfer bit in use — the
    // around-axis ring offered Rotary chamfer with the FLAT. cylChamfer
    // generation accepts V-bits and ball-noses ONLY; the chamfer bit is
    // the default choice for chamfer ops (Alice, 2026-11-12)
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 10, y: 0, z: 20 },
      axis: { x: 1, y: 0, z: 0 },
      radius: 8,
      inner: false,
    };
    const s = source({ circles: [c] });
    const r = resolved('circle', s, 0);
    const k = describePickedFeature(r, stock4);
    const chamferBit = { ...tool('ch90', 'vbit', 3.175), vAngle: 90 };
    const pick = suggestToolFor(k.candidates[1], r, [flat3, chamferBit], library);
    expect(pick?.tool.id).toBe('ch90');
    expect(pick?.inUse).toBe(true);
    // nothing in use → the library's V-bit (ball is the U-channel case,
    // never the default)
    const fresh = suggestToolFor(k.candidates[1], r, [], [flat3, ...library]);
    expect(fresh?.tool.id).toBe('v1');
  });

  it('chamfer wants a V-bit even when flats are in use', () => {
    const { r, k } = rim6();
    const s = suggestToolFor(k.candidates[2], r, [flat3], library);
    expect(s?.tool.id).toBe('v1');
    expect(s?.inUse).toBe(false);
  });

  it('a pocket takes the largest flat that manoeuvres inside the region', () => {
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0, y: 0, z: 1 },
    };
    const s = source({ planes: [plane] });
    const r = resolved('plane', s, 0);
    const k = describePickedFeature(r, stock4);
    // the plane has no measured extents (empty geometry) → no bound: the
    // largest flat wins
    const s1 = suggestToolFor(k.candidates[0], r, [], library);
    expect(s1?.tool.id).toBe('f6');
  });

  it('a 4D contour: an in-use flat is acceptable, else the ball nose', () => {
    const ch: RadialChainFeature = {
      kind: 'radialChain',
      id: 'ch1',
      points: [
        { x: 0, y: 10, z: 20 },
        { x: 5, y: 0, z: 20 },
        { x: 0, y: -10, z: 20 },
      ],
      meanRadius: 10,
    };
    const s = source({ radialChains: [ch] });
    const r = resolved('radialChain', s, 0);
    const k = describePickedFeature(r, stock4);
    // in-use preference (her ruling): a flat already in the job runs the
    // contour even though a ball would finish better
    const inUseFlat = suggestToolFor(k.candidates[0], r, [flat3], library);
    expect(inUseFlat?.tool.id).toBe('f3');
    expect(inUseFlat?.inUse).toBe(true);
    // nothing in use → the library's ball nose
    const fresh = suggestToolFor(k.candidates[0], r, [], library);
    expect(fresh?.tool.id).toBe('b3');
    expect(fresh?.inUse).toBe(false);
  });

  it('the Index op carries no cutter', () => {
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0, y: 0, z: -1 }, // far side → index at head
    };
    const s = source({ planes: [plane] });
    const r = resolved('plane', s, 0);
    const k = describePickedFeature(r, stock4);
    expect(suggestToolFor(k.candidates[0], r, [], library)).toBeNull();
  });
});
