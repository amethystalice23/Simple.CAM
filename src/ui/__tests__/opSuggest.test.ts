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
import type { CircleFeature, ModelTransform, PlaneFeature, RadialChainFeature, Stock } from '../../core/types';
import type { FeatureSource } from '../featureSources';
import type { ResolvedFeature } from '../featureSources';
import { describePickedFeature } from '../opSuggest';

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

  it('a boss rim offers an EXTERNAL thread, never a drill', () => {
    const c: CircleFeature = {
      kind: 'circle',
      id: 'c1',
      center: { x: 0, y: 0, z: 28 },
      axis: { x: 0, y: 0, z: 1 },
      radius: 5,
      inner: false,
    };
    const k = describePickedFeature(resolved('circle', source({ circles: [c] }), 0), stock4);
    expect(k.candidates.map((x) => x.kind)).toEqual(['threadMill', 'chamfer']);
    expect(k.candidates[0].why).toContain('external');
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
    expect(k.candidates.map((x) => x.kind)).toEqual(['cylChamfer', 'faceCylinder']);
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
    expect(k.notes[0]).toContain('not vertical');
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

  it('a tilted face offers nothing and points at the Index op', () => {
    // 30° tilt about Y: normal (sin30, 0, cos30)
    const plane: PlaneFeature = {
      kind: 'plane',
      id: 'p1',
      point: { x: 0, y: 0, z: 5 },
      normal: { x: 0.5, y: 0, z: Math.cos(Math.PI / 6) },
    };
    const k = describePickedFeature(resolved('plane', source({ planes: [plane] }), 0), stock4);
    expect(k.candidates).toEqual([]);
    expect(k.notes[0]).toContain('Index op');
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