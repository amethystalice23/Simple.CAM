import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { originSpan, rotaryCalibrationOf } from '../core/types';
import type { FeaturePickKind, ModelTransform, Move, Primitive, Stock, Vec2 } from '../core/types';
import { movesToSegmentMoves } from './toolpathPreview';
import { sliceAtZ, transformedPositions } from '../cam/slicing';
import type { FeatureSource } from './featureSources';
import { primitiveGeometry, primitivePose } from './featureSources';
import { segmentsForRadius } from './meshSegments';
import { NavCube } from './navcube';
import {
  buildFeatureOverlayData,
  connectorLine,
  findNearestFeatures,
  hoverLineGeometry,
  measureText,
  pickFromNearest,
  planeHighlightMesh,
  planePick,
  pxPerMmAt,
  sampleVisibleAt,
  transformFn,
  PATH_COLOR,
  PLANE_SELECT,
  SELECT_COLOR,
  GLOBAL_SELECT_COLOR,
  SLICE_COLOR,
  type FeatureOverlayData,
  type MeasurePick,
  type NearestFeature,
} from './featureOverlays';
import { artworkFillTris } from './artworkFillRegions';

const D2R = Math.PI / 180;

/** Camera projection of the viewport: perspective (the default) or
 * orthographic (true widths, no parallax — the CAM alignment view). */
export type Projection = 'persp' | 'ortho';

/** The persisted projection choice — guarded: storage may be unavailable
 * (private mode), in which case the view is a session-only choice. */
function safeStoredProjection(): Projection | null {
  try {
    const raw = localStorage.getItem('simple.cam.projection');
    return raw === 'ortho' || raw === 'persp' ? raw : null;
  } catch {
    return null;
  }
}

/** dispose a small overlay group's geometries and materials. */
function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

/** A selected feature resolved to its kind and index for highlighting. */
export interface ResolvedSelection {
  /** owning feature source: 'model' or a primitive id */
  sourceId: string;
  kind: 'plane' | 'circle' | 'edge' | 'path' | 'radialChain' | 'thread';
  index: number;
}

/** One source's overlay data — picking and highlighting run per source. */
interface SourceOverlay {
  source: FeatureSource;
  data: FeatureOverlayData;
}

/** A feature pick annotated with the source it came from. */
type SourcedPick = MeasurePick & { sourceId: string };

/** Measurement picks for the selected features (selection = measurement).
 * `color` paints the flavor: op blue, global green. */
function picksFromSelection(
  sel: ResolvedSelection[],
  overlays: SourceOverlay[],
  color: number,
): MeasurePick[] {
  const out: MeasurePick[] = [];
  for (const s of sel) {
    const entry = overlays.find((o) => o.source.id === s.sourceId);
    if (!entry) continue;
    if (s.kind === 'plane') {
      out.push(planePick(entry.source.geometry, entry.source.features, entry.source.transform, s.index));
      continue;
    }
    if (s.kind === 'circle') {
      out.push({
        kind: 'circle',
        index: s.index,
        center: entry.data.circleCenter[s.index].clone(),
        color,
        text: entry.data.circleText[s.index],
      });
      continue;
    }
    if (s.kind === 'path' || s.kind === 'radialChain') {
      // artwork: highlighted (via the selection line walk), but not a
      // measurement pick — distances between artwork strokes are noise.
      // A chain: highlighted (via the selection line walk), but not a
      // measurement pick — a chain's silhouette is a closed seam, not a
      // measurable point.
      continue;
    }
    out.push({
      kind: 'edge',
      index: s.index,
      center: entry.data.edgeMid[s.index].clone(),
      color,
      text: entry.data.edgeText[s.index],
    });
  }
  return out;
}

interface Props {
  geometry: THREE.BufferGeometry | null;
  stock: Stock;
  transform: ModelTransform;
  /** every selectable-feature provider: the model + one per primitive */
  sources: FeatureSource[];
  /** the Model tab's selected object ('model' or a primitive id): it
   * renders clearly picked — tinted model, brightened primitive volumes,
   * lit-up artwork line work */
  selectedObjectId: string | null;
  measureMode: boolean;
  /** false while an op's feature selection is active: straight lines are
   * not operation targets (reserved for the later line-follow engrave) */
  edgePickingEnabled: boolean;
  opSelection: ResolvedSelection[];
  /** which flavor `opSelection` holds: true = an OP's feature picks (the
   *  blue SELECT_COLOR), false = the GLOBAL selection (green) — the two
   *  must never paint alike (Alice, 2026-10-31: "ops is blue, make the
   *  other one green or something") */
  selectionIsOp: boolean;
  /** the op being edited is in 'outline+fill' mode: the artwork's
   * closed+filled regions are pickable (selected or not — a region click
   * must be able to make the FIRST selection) and the SELECTED ones
   * shade (display-only, a translucent infill of the selection blue) */
  fillShade: boolean;
  primitives: Primitive[];
  /** generated moves to draw (PLAN.md "Toolpath preview") */
  previewMoves: Move[] | null;
  /**
   * THE PLAYBACK TRAIL (Alice's spec, 2026-10-29): the transport's current
   * move while a playback highlights paths — null = the full-opacity static
   * preview (no playback). When set, paths render as a TRAIL: the current
   * move and the next two at 50%, the three previous at 15/10/5%, and
   * everything older at a 4% floor — the cloud fades to a readable ribbon
   * that shows where the tool has just been and where it goes next.
   * Alice's ceiling rule: NO path line ever exceeds 50% — full opacity is
   * the model's alone.
   */
  playbackMove: number | null;
  /** the expanded slice-pocket op's section plane (edge-tracing §5): the
   * machine Z to draw the plane + contour at, the datum rotation for
   * slicing the rotated part, and the callback a drag of the plane
   * handle commits through (updates the op's slice depth) */
  slicePreview: {
    z: number;
    rotate: ((p: { x: number; y: number; z: number }) => THREE.Vector3) | null;
    onZChange: (z: number) => void;
  } | null;
  /** the open op's cutting frame (edge-tracing §5): the part renders
   * rotated to this index datum; null = A0. Everything part-relative
   * (stock, model, overlays, preview) rotates together; the grid and axes
   * stay machine. */
  viewDatum: { angle: number; axisZ: number } | null;
  /** the active one-shot pick kind (edge-tracing §5): during a pick only
   * the pickable feature kinds highlight — edges never flash, and the Ø
   * pick shows circles alone. Null = normal measure mode. */
  pickKind: FeaturePickKind | null;
  /** the expanded rotary op's intended result (edge-tracing §5): the
   * violet ghost cylinder about the stock axis, plus the spiral carve's
   * groove helices as part-local mark polylines. Null when the open op
   * is not a rotary surface op. */
  facePreview: {
    xStart: number;
    xEnd: number;
    diameter: number;
    axisZ: number;
    marks: { x: number; y: number; z: number }[][] | null;
  } | null;
  /** the expanded thread-mill op's intended AREA (2026-10-28): a ghost
   * cylinder of the thread's cutting Ø spanning the start→end Z band at
   * the resolved bore/boss — external shows the major Ø, internal the
   * prep-bore d1. Null when the open op isn't a thread mill or its
   * selection hasn't resolved. */
  threadPreview: {
    center: { x: number; y: number };
    topZ: number;
    bottomZ: number;
    diameter: number;
  } | null;
  /** the expanded rotary-chamfer op's intended AREA (2026-11-08): one
   *  magenta ghost cylinder per resolved edge circle, about the stock
   *  axis at the anchor Ø, axially as wide as the chamfer's calculated
   *  width (V-bit: depth·tan(half-angle); ball: the channel's true chord
   *  width). Null when the open op isn't a rotary chamfer or its
   *  selection hasn't resolved. */
  chamferPreview: {
    x: number;
    diameter: number;
    width: number;
    axisZ: number;
  }[] | null;
  /** the pocket op's projected region(s) (2026-11-08, Alice's slot
   *  pick): the selection's loops resolved through the same projection
   *  generation uses — machine-space XY outlines, drawn as a flat
   *  translucent ghost at the selection's rim Z. */
  pocketPreview: {
    regions: Vec2[][];
    selectionZ: number;
  }[] | null;
  /** the carve simulator's chunk meshes, when the Simulation layer is on
   *  (PLAN "cutting simulator"): stock-frame greedy-meshed voxels keyed by
   *  chunk id, machine-space positions baked in. The meshes parent into
   *  datumGroup so index rotation is free. */
  simChunks: Map<number, import('../sim/protocol').ChunkMesh> | null;
  /** the live tool-tip pose from the carve sim's progress stream (b12) —
   *  the marker dot's position + tool axis, MATERIAL frame (the chunks'
   *  frame). Null = no run in flight → no marker. */
  simTip: import('../sim/protocol').TipPose | null;
  /** display layers (the top-right Layers dropdown) + its toggle —
   *  Stock/Model/Features/Paths/Simulation visibility in one place */
  displayLayers: { stock: boolean; model: boolean; features: boolean; paths: boolean; simulation: boolean };
  onToggleLayer: (layer: 'stock' | 'model' | 'features' | 'paths' | 'simulation', v: boolean) => void;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  /** Shift+drag rubber-band box select (Alice, 2026-10-31: "must ensure
   *  there is a way to bulk select paths"): every path feature with a
   *  point inside the screen rect — the caller unions them in. */
  onBoxSelect: (ids: string[]) => void;
}

/**
 * Minimal three.js viewport: grid, stock, and the placed model.
 *
 * Scene axes ARE machine axes: X/Y/Z in the scene equal machine X/Y/Z, with
 * camera.up = +Z (spindle axis up). Nothing remaps coordinates, so a model
 * at machine (10, 20, 5) renders at scene (10, 20, 5). The triad marks
 * machine (0,0,0). Toolpath preview (wrapped U,V,Z moves mapped back onto
 * the cylinder) lands in Phase 1.
 */
export function Viewport({
  geometry,
  stock,
  transform,
  sources,
  selectedObjectId,
  measureMode,
  edgePickingEnabled,
  opSelection,
  selectionIsOp,
  fillShade,
  primitives,
  previewMoves,
  playbackMove,
  slicePreview,
  viewDatum,
  pickKind,
  facePreview,
  threadPreview,
  chamferPreview,
  pocketPreview,
  simChunks,
  simTip,
  displayLayers,
  onToggleLayer,
  onToggleSelect,
  onClearSelection,
  onBoxSelect,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);
  /** the stock group (hidden while the simulator shows carved chunks) */
  const stockGroupRef = useRef<THREE.Group | null>(null);
  const featureGroupRef = useRef<THREE.Group | null>(null);
  /** renderer/camera/controls of the scene effect — shared with the
   * slice-plane effect below */
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  /** live slice-plane drag state — a ref so effect re-runs (the live box
   * update changes props mid-drag) never kill an active drag */
  const sliceDragRef = useRef<{ startClientY: number; startZ: number; z: number; raf: number } | null>(null);
  /** the LIVE slice overlay's rebuild/placeHandle — pending drag frames
   * must target the current group, not a disposed previous effect run */
  const sliceFnsRef = useRef<{ rebuild: (z: number) => void; placeHandle: (z: number) => void } | null>(null);
  /** part-relative world (stock, model, overlays, preview) rotated to the
   * open op's index datum; the slice overlay stays machine-space */
  const datumGroupRef = useRef<THREE.Group | null>(null);
  const sliceGroupRef = useRef<THREE.Group | null>(null);
  /** per-source overlay data — null-entry = no sources (nothing selectable) */
  const overlaysRef = useRef<SourceOverlay[]>([]);
  /** the region-pick meshes (the op being edited, 'outline+fill'): the
   * click picker raycasts these and resolves a region to its OWNER path */
  const fillShadeMeshesRef = useRef<THREE.Mesh[]>([]);
  /** primitive meshes (non-indexed, source-aligned) for plane raycast picks */
  const primMeshesRef = useRef<THREE.Mesh[]>([]);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const hoverLineRef = useRef<THREE.LineSegments | null>(null);
  const measureRef = useRef(measureMode);
  measureRef.current = measureMode;
  const edgePickingRef = useRef(edgePickingEnabled);
  edgePickingRef.current = edgePickingEnabled;
  const pickKindRef = useRef(pickKind);
  pickKindRef.current = pickKind;
  const onToggleSelectRef = useRef(onToggleSelect);
  onToggleSelectRef.current = onToggleSelect;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const onBoxSelectRef = useRef(onBoxSelect);
  onBoxSelectRef.current = onBoxSelect;
  const opSelectionRef = useRef(opSelection);
  opSelectionRef.current = opSelection;
  /** the selection's paint: op picks blue, global green (the prop above) */
  const selColor = selectionIsOp ? SELECT_COLOR : GLOBAL_SELECT_COLOR;
  const selColorRef = useRef(selColor);
  selColorRef.current = selColor;
  const hoverPlaneRef = useRef<THREE.Mesh | null>(null);
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  /** labels for the selected features, one per pick */
  const selLabelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const distLabelRef = useRef<HTMLDivElement | null>(null);
  /** A=0-frame overlay point → WORLD under the current datum view: the
   * SAME rotation the datum group carries (Viewport must test features
   * where they RENDER, not where they sat before the index — the
   * indexed-drill hover/selection bug). Identity when the datum is A0. */
  const viewDatumRef = useRef(viewDatum);
  viewDatumRef.current = viewDatum;
  const datumToWorld = (p: THREE.Vector3): THREE.Vector3 => {
    const vd = viewDatumRef.current;
    if (!vd) return p;
    const th = vd.angle * D2R;
    // the group's transform: world = off + R·(p − off), off = (0,0,axisZ)
    const z = p.z - vd.axisZ;
    return new THREE.Vector3(
      p.x,
      p.y * Math.cos(th) - z * Math.sin(th),
      p.y * Math.sin(th) + z * Math.cos(th) + vd.axisZ,
    );
  };

  // ---- projection: perspective (default) or orthographic ----
  /** persisted per-user like the tool library — whoever asks for ortho
   * wants it every session */
  const PROJECTION_KEY = 'simple.cam.projection';
  const [projection, setProjection] = useState<Projection>(() =>
    safeStoredProjection() ?? 'persp',
  );
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  /** the scene effect's swap function — the two cameras always exist; the
   * toggle just re-points controls/render at the other one */
  const swapProjectionRef = useRef<((mode: Projection) => void) | null>(null);
  const toggleProjection = () => {
    const next: Projection = projection === 'persp' ? 'ortho' : 'persp';
    setProjection(next);
    try {
      localStorage.setItem(PROJECTION_KEY, next);
    } catch {
      /* private mode / cleared storage: a session-only choice then */
    }
    swapProjectionRef.current?.(next);
  };

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d21);
    // the browser smokes' scene handle (the __simTipMarker convention):
    // three.js scenes aren't DOM-inspectable, so the smoke drivers walk
    // from here — a debug hook for scripts/, never app state
    (window as unknown as { __scene?: THREE.Scene }).__scene = scene;
    // both projections exist up front; the toggle re-points controls,
    // render, and the snap math at the active one (swapProjection below)
    const persp = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    persp.up.set(0, 0, 1); // machine Z is up
    persp.position.set(160, -160, 120);
    // orthographic twin: frustum sized on demand from the perspective
    // view (swapProjection) so the toggle never jumps what's on screen
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
    ortho.up.set(0, 0, 1);
    ortho.position.copy(persp.position);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
      projectionRef.current === 'ortho' ? ortho : persp;
    // __camera tracks the ACTIVE projection for the smoke drivers (they
    // project world → screen through its matrices); swapProjection keeps
    // it honest on a projection toggle
    (window as unknown as { __camera?: THREE.Camera }).__camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // __renderer + __controls: the shade-smoke drivers re-render in-task
    // for pixel readback and move the camera to test grazing views
    (window as unknown as { __renderer?: THREE.WebGLRenderer }).__renderer = renderer;
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x10141a); // navcube tile backdrop (main scene has its own bg)
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    (window as unknown as { __controls?: OrbitControls }).__controls = controls;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

    /** fit the ortho frustum's height to `viewH` mm of world, width by the
     * canvas aspect (the height is the zoom invariant on resizes) */
    const fitOrthoFrustum = (viewH: number) => {
      const aspect = Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1);
      ortho.top = viewH / 2;
      ortho.bottom = -viewH / 2;
      ortho.left = (-viewH / 2) * aspect;
      ortho.right = (viewH / 2) * aspect;
      ortho.zoom = 1;
      ortho.updateProjectionMatrix();
    };
    /** swap the active projection, preserving what's on screen: the ortho
     * frustum takes the perspective view's height at the target distance;
     * back the other way the perspective distance is chosen to reproduce
     * the ortho frustum's height. OrbitControls zooms an ortho camera by
     * scaling `zoom`, so distance stays meaningless — only position (the
     * view direction) carries over. */
    const swapProjection = (mode: Projection) => {
      const target = controls.target;
      const halfTanFov = Math.tan(((persp.fov / 2) * Math.PI) / 180);
      if (mode === 'ortho') {
        const dist = persp.position.distanceTo(target);
        fitOrthoFrustum(2 * halfTanFov * Math.max(dist, 1));
        ortho.position.copy(persp.position);
        camera = ortho;
      } else {
        const viewH = (ortho.top - ortho.bottom) / ortho.zoom;
        const dist = Math.max(viewH / (2 * halfTanFov), 1);
        const dir = ortho.position.clone().sub(target).normalize();
        persp.position.copy(target).addScaledVector(dir, dist);
        camera = persp;
      }
      controls.object = camera;
      cameraRef.current = camera;
      (window as unknown as { __camera?: THREE.Camera }).__camera = camera;
      controls.update();
    };
    swapProjectionRef.current = swapProjection;

    // view-orientation cube: click a face to tween the camera to that view
    const navCube = new NavCube();
    let orient: {
      axis: THREE.Vector3;
      angle: number;
      fromDir: THREE.Vector3;
      t0: number;
      radius: number;
    } | null = null;
    const startOrient = (normal: THREE.Vector3) => {
      const offset = camera.position.clone().sub(controls.target);
      const fromDir = offset.clone().normalize();
      const toDir = normal.clone().normalize();
      let axis = new THREE.Vector3().crossVectors(fromDir, toDir);
      if (axis.lengthSq() < 1e-10) {
        // 180° flip: any perpendicular axis works
        axis = Math.abs(fromDir.z) < 0.9
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0);
      }
      orient = {
        axis: axis.normalize(),
        angle: fromDir.angleTo(toDir),
        fromDir,
        t0: performance.now(),
        radius: offset.length(),
      };
    };

    let downX = 0;
    let downY = 0;
    let hoverPlaneKey = ''; // transiently hovered face (source:plane), '' none
    const raycaster = new THREE.Raycaster();
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const hit = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return navCube.hitTest(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
    };

    // ---- Shift+drag rubber-band box select (bulk path selection) ----
    // Shift had no binding in the pointer handlers before this (plain
    // drag still rotates). The listeners sit CAPTURE-phase on the host
    // (the canvas's parent): at-target listeners fire in registration
    // order regardless of capture, but a parent capture runs before the
    // canvas's OrbitControls handlers — parking `controls.enabled` here
    // means their pointerdown gates off and no rotation state starts.
    const bandDiv = document.createElement('div');
    bandDiv.className = 'box-select-band';
    el.appendChild(bandDiv);
    let band: { x0: number; y0: number; x1: number; y1: number } | null = null;
    const drawBand = () => {
      if (!band) return;
      bandDiv.style.left = `${Math.min(band.x0, band.x1)}px`;
      bandDiv.style.top = `${Math.min(band.y0, band.y1)}px`;
      bandDiv.style.width = `${Math.abs(band.x1 - band.x0)}px`;
      bandDiv.style.height = `${Math.abs(band.y1 - band.y0)}px`;
    };
    const endBand = () => {
      band = null;
      bandDiv.style.display = 'none';
      controls.enabled = true;
    };
    const onBandDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.shiftKey || e.target !== renderer.domElement || hit(e)) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      band = { x0: x, y0: y, x1: x, y1: y };
      controls.enabled = false;
      drawBand();
      bandDiv.style.display = 'block';
    };
    const onBandMove = (e: PointerEvent) => {
      if (!band) return;
      const rect = el.getBoundingClientRect();
      band.x1 = e.clientX - rect.left;
      band.y1 = e.clientY - rect.top;
      drawBand();
    };
    const onBandUp = () => {
      if (!band) return;
      if (Math.hypot(band.x1 - band.x0, band.y1 - band.y0) > 4) {
        // Screen-space lasso: every path feature of the MODEL and the
        // ARTWORK sources with ANY point inside the rect (3px slack)
        // selects. No occlusion test — a wrapped dot on the far side of
        // the cylinder still selects; and never circles/planes/edges,
        // those are single-click targets, not bulk-pick candidates.
        const w = Math.max(el.clientWidth, 1);
        const h = Math.max(el.clientHeight, 1);
        const rx0 = Math.min(band.x0, band.x1) - 3;
        const rx1 = Math.max(band.x0, band.x1) + 3;
        const ry0 = Math.min(band.y0, band.y1) - 3;
        const ry1 = Math.max(band.y0, band.y1) + 3;
        const ids: string[] = [];
        const v = new THREE.Vector3();
        for (const source of sourcesRef.current) {
          if (source.id !== 'model' && source.artworkFrame === undefined) continue;
          const xf = transformFn(source.transform);
          for (const path of source.features.paths) {
            for (const p of path.points) {
              const q = xf(p);
              v.set(q.x, q.y, q.z).project(camera);
              if (v.z > 1) continue; // behind the camera
              const sx = ((v.x + 1) / 2) * w;
              const sy = ((1 - v.y) / 2) * h;
              if (sx >= rx0 && sx <= rx1 && sy >= ry0 && sy <= ry1) {
                ids.push(path.id);
                break;
              }
            }
          }
        }
        onBoxSelectRef.current(ids);
      }
      // a sub-4px shift-click falls through to the canvas's normal click
      // handling below — shift-click keeps toggling a single feature
      endBand();
    };
    const onBandCancel = () => {
      if (band) endBand(); // pointerup off-canvas would strand the gesture
    };
    el.addEventListener('pointerdown', onBandDown, true);
    el.addEventListener('pointermove', onBandMove, true);
    el.addEventListener('pointerup', onBandUp, true);
    el.addEventListener('pointerleave', onBandCancel, true);

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // was a drag
      if (e.button === 2) {
        // right-click clears the selection (and any measurements)
        onClearSelectionRef.current();
        return;
      }
      if (e.button !== 0) return;
      const normal = hit(e);
      if (normal) {
        startOrient(normal);
        return;
      }
      // measure mode: left-click toggles the picked feature into the
      // selection (measurements derive from the selection)
      if (measureRef.current) {
        const rect = renderer.domElement.getBoundingClientRect();
        const pick = measurePickAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          rect.width,
          rect.height,
        );
        if (pick) {
          const feats = overlaysRef.current.find((o) => o.source.id === pick.sourceId)?.source
            .features;
          const id =
            pick.kind === 'plane'
              ? feats?.planes[pick.index]?.id
              : pick.kind === 'circle'
                ? feats?.circles[pick.index]?.id
                : pick.kind === 'path'
                  ? feats?.paths[pick.index]?.id
                  : pick.kind === 'radialChain'
                    ? feats?.radialChains[pick.index]?.id
                    : pick.kind === 'thread'
                      ? feats?.threads[pick.index]?.id
                      : feats?.edges[pick.index]?.id;
          if (id) onToggleSelectRef.current(id);
        }
      }
    };
    /** highlightable/clickable during the active one-shot pick
     * (edge-tracing §5): edges never flash (they carry no facing
     * point); the Ø pick wants circles alone — planes would flash and
     * then bounce anyway. Normal measure mode allows everything. */
    const pickAllows = (kind: 'edge' | 'circle' | 'plane' | 'path' | 'radialChain' | 'thread'): boolean => {
      const pk = pickKindRef.current;
      if (!pk) return true;
      // the index-angle pick: every solid feature carries a direction to
      // face (a face's normal, a hole's axis, an edge's radial) — only the
      // artwork's strokes don't
      if (pk === 'indexAngle') return kind !== 'path';
      if (kind === 'edge') return false;
      if (pk === 'targetDiameter' || pk === 'wrapDiameter') return kind === 'circle';
      // the depth picks (floor, chamferDepth, drillDepth) read a facing
      // point: circles and planes carry one, artwork strokes don't — a
      // chain's silhouette is a closed seam, not a floor, so it refuses
      // them too
      if (pk === 'floor' || pk === 'chamferDepth' || pk === 'drillDepth') {
        return kind === 'circle' || kind === 'plane';
      }
      return true;
    };

    /** Feature snap gated by VISIBILITY: candidates ranked by snap
     * distance, and the first whose nearest sample isn't hidden behind
     * the surface under the cursor wins — a feature on the far side of
     * the model must not steal the pick from the face actually hovered.
     * When every snapped candidate is hidden the caller falls through to
     * the plane wash/pick under the cursor. */
    const firstVisibleFeature = (
      mx: number,
      my: number,
      w: number,
      h: number,
    ): { entry: SourceOverlay; nearest: NearestFeature } | null => {
      // EVERY in-tolerance candidate, not just the nearest per source
      // (2026-11-03, the A270-hole report): the nearest circle can sit
      // hidden behind the surface (a hole's far mouth shadows its near
      // rim at some view angles) — with a single candidate the gate then
      // killed the whole pick: no hover, no selection. The ranked list
      // lets the gate fall through to the first VISIBLE feature.
      const ranked: { entry: SourceOverlay; nearest: NearestFeature }[] = [];
      for (const entry of overlaysRef.current) {
        for (const nearest of findNearestFeatures(entry.data, mx, my, camera, w, h, datumToWorld)) {
          if (
            !pickAllows(nearest.kind) ||
            (!edgePickingRef.current && nearest.kind === 'edge')
          ) {
            continue;
          }
          ranked.push({ entry, nearest });
        }
      }
      if (ranked.length === 0) return null;
      ranked.sort((a, b) => a.nearest.d - b.nearest.d);
      const model = modelRef.current;
      const meshes: THREE.Object3D[] = [
        ...(model && model.visible ? [model] : []),
        ...primMeshesRef.current,
      ];
      raycaster.setFromCamera(new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1), camera);
      const first =
        meshes.length > 0 ? (raycaster.intersectObjects(meshes, false)[0] ?? null) : null;
      for (const cand of ranked) {
        if (
          sampleVisibleAt(
            first?.distance ?? null,
            raycaster.ray.origin,
            raycaster.ray.direction,
            cand.nearest.point,
          )
        ) {
          return cand;
        }
      }
      return null;
    };

    /** A click inside a fill region resolves to that region's OWNING
     * path — the region is one pickable surface whose pick lands in the
     * same selection flow as a line click, never a feature of its own
     * (Alice, 2026-10-31: "we currently cant click on a region thats
     * filled"). Round 2: the pick mesh covers UNSELECTED regions too, so
     * the first click can be a region click, and nested loops' fans
     * overlap coplanarly — the DEEPEST owner wins the tie (a click in
     * the ankh's counter toggles the counter, not the outline around
     * it). A line snap still wins (checked first above). */
    const fillRegionPickAt = (mx: number, my: number, w: number, h: number): SourcedPick | null => {
      const meshes = fillShadeMeshesRef.current;
      if (meshes.length === 0 || !pickAllows('path')) return null;
      raycaster.setFromCamera(new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1), camera);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return null;
      // hits come distance-sorted; the coplanar fan stack sits within eps
      const min = hits[0].distance;
      let best: THREE.Intersection | null = null;
      let bestDepth = -Infinity;
      for (const hit of hits) {
        if (hit.distance > min + 1e-4) break;
        const ud = hit.object.userData as { ownerDepths?: number[] };
        const d = ud.ownerDepths?.[hit.faceIndex ?? -1] ?? -1;
        if (d > bestDepth) {
          bestDepth = d;
          best = hit;
        }
      }
      const ud = best?.object.userData as { sourceId?: string; featureIndices?: number[] } | undefined;
      const fIdx = ud?.featureIndices?.[best?.faceIndex ?? -1] ?? -1;
      if (!best || !ud?.sourceId || fIdx < 0) return null;
      const source = sourcesRef.current.find((s) => s.id === ud.sourceId);
      const path = source?.features.paths[fIdx];
      if (!path) return null;
      return {
        kind: 'path',
        index: fIdx,
        sourceId: ud.sourceId,
        center: best.point.clone(),
        color: selColorRef.current,
        text: 'artwork fill region',
      };
    };

    /** click target: the nearest VISIBLE feature across ALL sources, else
     * the plane under the face (model or primitive mesh) */
    const measurePickAt = (mx: number, my: number, w: number, h: number): SourcedPick | null => {
      if (measureRef.current) {
        const visible = firstVisibleFeature(mx, my, w, h);
        if (visible) {
          return {
            ...pickFromNearest(visible.entry.data, visible.nearest),
            sourceId: visible.entry.source.id,
          };
        }
        // everything that snapped is hidden behind the surface — a fill
        // region under the cursor wins next, the plane after that
        const region = fillRegionPickAt(mx, my, w, h);
        if (region) return region;
      }
      // plane fallback: raycast the model mesh and the primitive meshes,
      // resolving the hit face through the OWNING source's faceToPlane —
      // suppressed for the Ø pick (circles only)
      if (!pickAllows('plane')) return null;
      const model = modelRef.current;
      const meshes: THREE.Object3D[] = [
        ...(model && model.visible ? [model] : []),
        ...primMeshesRef.current,
      ];
      if (meshes.length === 0) return null;
      raycaster.setFromCamera(new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1), camera);
      for (const hit of raycaster.intersectObjects(meshes, false)) {
        const sourceId =
          hit.object === model ? 'model' : (hit.object.userData.sourceId as string | undefined);
        const source = sourcesRef.current.find((s) => s.id === sourceId);
        if (!source) continue;
        const fi = hit.faceIndex ?? -1;
        if (fi < 0 || fi >= source.features.faceToPlane.length) continue;
        const planeIdx = source.features.faceToPlane[fi];
        if (planeIdx < 0) continue;
        return {
          ...planePick(source.geometry, source.features, source.transform, planeIdx),
          sourceId: source.id,
        };
      }
      return null;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (band) return; // a box-select drag hides nothing, hovers nothing
      const rect = renderer.domElement.getBoundingClientRect();
      const overNav = hit(e);
      renderer.domElement.style.cursor = overNav ? 'pointer' : '';
      const hoverLine = hoverLineRef.current;
      const hoverPlane = hoverPlaneRef.current;
      const overlays = overlaysRef.current;

      const hideHoverPlane = () => {
        if (hoverPlane) hoverPlane.visible = false;
        hoverPlaneKey = '';
      };

      if (overNav || !measureRef.current || !hoverLine || overlays.length === 0) {
        if (hoverLine) hoverLine.visible = false;
        hideHoverPlane();
        setLabel(null);
        return;
      }
      // nearest VISIBLE feature across all sources; while editing an op,
      // lines are not targets — don't hover them, so the pointer falls
      // through to the face behind
      const usable = firstVisibleFeature(
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      );
      if (usable) {
        hoverLine.geometry.dispose();
        hoverLine.geometry = hoverLineGeometry(usable.entry.data, usable.nearest.kind, usable.nearest.index);
        (hoverLine.material as THREE.LineBasicMaterial).color.setHex(usable.nearest.color);
        hoverLine.visible = true;
        hideHoverPlane();
        setLabel({
          text: usable.nearest.text,
          x: usable.nearest.anchor.x,
          y: usable.nearest.anchor.y,
        });
        return;
      }
      hoverLine.visible = false;
      setLabel(null);

      // no feature nearby: transiently wash the face under the cursor (model
      // or primitive) so faces are hoverable like edges and circles are —
      // but not during the Ø pick (circles only, no plane flashing)
      if (!pickAllows('plane')) {
        hoverLine.visible = false;
        setLabel(null);
        hideHoverPlane();
        return;
      }
      const model = modelRef.current;
      const meshes: THREE.Object3D[] = [
        ...(model && model.visible ? [model] : []),
        ...primMeshesRef.current,
      ];
      if (!hoverPlane || meshes.length === 0) {
        hideHoverPlane();
        return;
      }
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(meshes, false);
      let washed = false;
      for (const found of hits) {
        const sourceId =
          found.object === model ? 'model' : (found.object.userData.sourceId as string | undefined);
        const source = sourcesRef.current.find((s) => s.id === sourceId);
        if (!source) continue;
        const fi = found.faceIndex ?? -1;
        if (fi < 0 || fi >= source.features.faceToPlane.length) continue;
        const idx = source.features.faceToPlane[fi];
        if (idx < 0) continue;
        const key = `${source.id}:${idx}`;
        if (key !== hoverPlaneKey) {
          const built = planeHighlightMesh(
            source.geometry,
            source.features,
            source.transform,
            idx,
            PLANE_SELECT,
          );
          hoverPlane.geometry.dispose();
          if (built) {
            hoverPlane.geometry = built.geometry;
            (built.material as THREE.Material).dispose(); // hoverPlane keeps its own
          }
        }
        hoverPlaneKey = key;
        hoverPlane.visible = true;
        washed = true;
        break;
      }
      if (!washed) hideHoverPlane();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // part-relative world (rotated to the open op's datum), and the
    // machine-space slice overlay group outside it
    const datumGroup = new THREE.Group();
    datumGroupRef.current = datumGroup;
    scene.add(datumGroup);
    const sliceGroup = new THREE.Group();
    sliceGroupRef.current = sliceGroup;
    scene.add(sliceGroup);

    const stockGroup = new THREE.Group();
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x8a6f4d,
      transparent: true,
      opacity: 0.45,
    });
    let center = new THREE.Vector3();

    if (stock.kind === 'cylinder') {
      const r = stock.calibration.effectiveRadius;
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, stock.length, segmentsForRadius(r)),
        stockMat,
      );
      if (stock.axisMode === '3-axis') {
        // 3-axis: the cylinder stands vertical (axis ∥ Z), centered on X0/Y0;
        // machine Z0 sits along its height per xOrigin
        const [z0, z1] = originSpan(stock.xOrigin, stock.length);
        cyl.rotation.x = Math.PI / 2; // default Y-axis cylinder → machine Z
        cyl.position.set(0, 0, (z0 + z1) / 2);
        stockGroup.add(cyl);
        center.set(0, 0, (z0 + z1) / 2);
      } else {
        // 4-axis: Z0 is the stock center (the axis datum), so the cylinder
        // lies along machine X, drawn centered on Z = axisZ
        const axisZ = stock.calibration.axisZ;
        const [x0, x1] = originSpan(stock.xOrigin, stock.length);
        const cx = (x0 + x1) / 2;
        cyl.rotation.z = Math.PI / 2; // default Y-axis cylinder → machine X
        cyl.position.set(cx, 0, axisZ);
        stockGroup.add(cyl);
        stockGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(x0, 0, axisZ),
              new THREE.Vector3(x1, 0, axisZ),
            ]),
            new THREE.LineBasicMaterial({ color: 0x44aa44 }),
          ),
        );
        center.set(cx, 0, axisZ);
      }
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(stock.sizeX, stock.sizeY, stock.sizeZ), stockMat);
      const [x0, x1] = originSpan(stock.origin.x, stock.sizeX);
      const [y0, y1] = originSpan(stock.origin.y, stock.sizeY);
      const [z0, z1] = originSpan(stock.origin.z, stock.sizeZ);
      box.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      stockGroup.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(box), 0x6b5842));
      stockGroup.add(box);
      if (stock.axisMode === '4-axis') {
        // the rotation axis the derived calibration assumes: Y=0 through
        // the box's Z center
        const axisZ = rotaryCalibrationOf(stock).axisZ;
        stockGroup.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(x0, 0, axisZ),
              new THREE.Vector3(x1, 0, axisZ),
            ]),
            new THREE.LineBasicMaterial({ color: 0x44aa44 }),
          ),
        );
      }
      center.copy(box.position);
    }
    datumGroup.add(stockGroup);
    stockGroupRef.current = stockGroup;

    // 4-axis only: the A0-direction marker — a small amber arrow hint at
    // X=0 (with the machine axes), rising from the stock axis toward the
    // material that faced the cutter at A0. Length = stock radius plus a
    // little clearance, so the tip peeks out of the stock ghost. It lives
    // in the (rotating) stock group, so it turns with the part: whatever
    // the open op's datum, this arrow shows where "A0 up" sits now
    // (edge-tracing §5).
    if (stock.axisMode === '4-axis') {
      const axisZ = rotaryCalibrationOf(stock).axisZ;
      const r = rotaryCalibrationOf(stock).effectiveRadius;
      const len = r + 6; // clear of the stock ghost
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffb347, depthTest: false });
      const shaft = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, axisZ),
          new THREE.Vector3(0, 0, axisZ + len),
        ]),
        new THREE.LineBasicMaterial({ color: 0xffb347, depthTest: false }),
      );
      // just a hint of an arrowhead
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 10), arrowMat);
      tip.rotation.x = Math.PI / 2; // apex +Z (local — A0 up)
      tip.position.set(0, 0, axisZ + len + 0.5);
      shaft.renderOrder = 6;
      tip.renderOrder = 6;
      stockGroup.add(shaft, tip);
    }

    // machine Z=0 plane
    const grid = new THREE.GridHelper(400, 40, 0x2b2f35, 0x22262a);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    scene.add(new THREE.AxesHelper(14)); // machine origin (0,0,0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(150, -300, 300);
    scene.add(dir);

    const model = new THREE.Mesh(
      geometry ?? new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x4d7ea8, flatShading: true }),
    );
    modelRef.current = model;
    datumGroup.add(model);
    if (geometry) geometry.computeBoundingBox();

    // feature overlay group: children managed by the overlay effect below
    const featureGroup = new THREE.Group();
    datumGroup.add(featureGroup);
    featureGroupRef.current = featureGroup;

    controls.target.copy(center);

    // the persisted ortho choice: fit the frustum now that the target (the
    // stock center) exists — the perspective default view defines it
    if (projectionRef.current === 'ortho') swapProjection('ortho');

    const onResize = () => {
      if (!el.clientWidth) return;
      persp.aspect = el.clientWidth / el.clientHeight;
      persp.updateProjectionMatrix();
      // orthographic keeps its world height (zoom is distance here);
      // only the width refits by the new aspect
      const viewH = ortho.top - ortho.bottom;
      const aspect = Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1);
      ortho.left = (-viewH / 2) * aspect;
      ortho.right = (viewH / 2) * aspect;
      ortho.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      // the fat-line materials (the playback trail) need the drawing
      // buffer size to map linewidth to true screen pixels
      scene.traverse((o) => {
        const m = (o as THREE.Object3D & { material?: unknown }).material;
        if (m instanceof LineMaterial) m.resolution.set(el.clientWidth, el.clientHeight);
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(el);

    let raf = 0;
    const loop = () => {
      if (orient) {
        const t = Math.min((performance.now() - orient.t0) / 350, 1);
        // ease-in-out cubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const dir = orient.fromDir.clone().applyAxisAngle(orient.axis, orient.angle * e);
        camera.position.copy(controls.target).addScaledVector(dir, orient.radius);
        camera.lookAt(controls.target);
        if (t >= 1) orient = null;
      }
      controls.update();
      renderer.autoClear = true;
      renderer.render(scene, camera);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) {
        navCube.sync(camera.position.clone().sub(controls.target), camera.up);
        renderer.autoClear = false;
        navCube.render(renderer, w, h);
      }

      // keep measurement labels glued to their 3D anchors as the view moves
      const projectLabel = (div: HTMLDivElement | null, anchor?: THREE.Vector3) => {
        if (!div) return;
        if (!anchor) {
          div.style.display = 'none';
          return;
        }
        // selection labels anchor where the feature RENDERS: the A=0-frame
        // center mapped through the datum view (the same world transform
        // the snap uses — labels and rings must not part ways under an
        // index datum)
        const p = datumToWorld(anchor).project(camera);
        if (p.z > 1) {
          div.style.display = 'none';
          return;
        }
        div.style.display = '';
        div.style.left = `${((p.x + 1) / 2) * el.clientWidth + 12}px`;
        div.style.top = `${((1 - p.y) / 2) * el.clientHeight - 14}px`;
      };
      const picks = picksFromSelection(opSelectionRef.current, overlaysRef.current, selColorRef.current);
      picks.forEach((p, i) => {
        const div = selLabelsRef.current[i];
        if (div) div.textContent = p.text;
        projectLabel(div, p.center);
      });
      if (picks.length === 2) {
        const dist = distLabelRef.current;
        if (dist) dist.textContent = measureText(picks[0], picks[1]);
        projectLabel(
          dist,
          new THREE.Vector3().addVectors(picks[0].center, picks[1].center).multiplyScalar(0.5),
        );
      } else {
        projectLabel(distLabelRef.current, undefined);
      }

      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerdown', onBandDown, true);
      el.removeEventListener('pointermove', onBandMove, true);
      el.removeEventListener('pointerup', onBandUp, true);
      el.removeEventListener('pointerleave', onBandCancel, true);
      bandDiv.remove();
      navCube.dispose();
      featureGroupRef.current = null;
      datumGroupRef.current = null;
      sliceGroupRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      swapProjectionRef.current = null;
      overlaysRef.current = [];
      hoverLineRef.current = null;
      hoverPlaneRef.current = null;
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // model geometry and pose are handled by the effects below
  }, [stock]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const mat = model.material as THREE.MeshStandardMaterial;
    model.geometry.dispose();
    model.geometry = geometry ?? new THREE.BufferGeometry();
    if (geometry) {
      geometry.computeVertexNormals();
      mat.visible = true;
    } else {
      mat.visible = false;
    }
  }, [geometry]);

  // the Model tab's object selection tints the model — the object list and
  // the viewport must agree on what is picked. The scene effect recreates
  // the material on stock rebuilds, so re-apply on those too.
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const mat = model.material as THREE.MeshStandardMaterial;
    const sel = selectedObjectId === 'model';
    mat.color.setHex(sel ? 0x84b8e4 : 0x4d7ea8);
    mat.emissive.setHex(sel ? 0x0d2438 : 0x000000);
  }, [selectedObjectId, stock]);

  // Apply placement. Re-runs when the stock changes too, because the scene
  // rebuild creates a fresh model mesh with default pose.
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    model.rotation.set(
      transform.rotationDeg.x * D2R,
      transform.rotationDeg.y * D2R,
      transform.rotationDeg.z * D2R,
    );
    model.position.set(transform.position.x, transform.position.y, transform.position.z);
    model.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  }, [transform, stock]);

  // The open op's cutting frame (edge-tracing §5): the part-relative
  // group renders rotated to the op's index datum — a right-hand rotation
  // about the stock axis (y=0, z=axisZ), the exact inverse of the
  // preview's per-op un-rotation, so toolpaths land at their true machine
  // positions. A0 when no panel is open.
  useEffect(() => {
    const g = datumGroupRef.current;
    if (!g) return;
    const th = (viewDatum?.angle ?? 0) * D2R;
    if (th === 0) {
      g.rotation.set(0, 0, 0);
      g.position.set(0, 0, 0);
      return;
    }
    // pivot about the line through (y=0, z=axisZ) along X:
    // world = off + R·(local − off)  ⇒  position = off − R·off
    const off = new THREE.Vector3(0, 0, viewDatum!.axisZ);
    const p = off.clone().applyEuler(new THREE.Euler(th, 0, 0));
    g.rotation.set(th, 0, 0);
    g.position.copy(off).sub(p);
  }, [viewDatum, stock]);

  // ---- carve simulator: chunk meshes in the stock frame ----
  // The grid IS the display frame (un-rotated stock at A=0 — the same
  // frame movesToSegments maps previews into), so chunk positions are
  // plain machine coords. Parent into datumGroup so index rotation
  // applies for free, exactly like the stock/model/preview. Rebuilds
  // incrementally: each worker `chunk` message replaces one mesh; a
  // chunk whose mesh comes back EMPTY is hidden (fully carved away).
  const simGroupRef = useRef<THREE.Group | null>(null);
  /** the sim chunk material — created once per sim session and shared by
   *  every chunk mesh; NEVER disposed on effect re-runs (chunk messages
   *  re-fire the effect per message, and disposing the shared material
   *  mid-run invalidated every mesh built so far — the "huge gaps" bug:
   *  meshes with a disposed material render blank in three.js once the GPU
   *  resources are reclaimed. Disposal happens only on sim exit below.) */
  const simMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  /** the classification-ghost overlay material (vertexColors) — same
   *  lifecycle rules as simMatRef (never disposed mid-run) */
  const simGhostMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  /** chunk id → the message object its mesh was built from. The effect
   *  re-runs per worker message and iterates the WHOLE chunk map; without
   *  this it would dispose+rebuild every mesh (576 of them on the coupon)
   *  for every single updated chunk — the "simulation won't run" crawl of
   *  2026-10-26. A same-reference chunk is unchanged: skip. */
  const simBuiltRef = useRef(new Map<number, import('../sim/protocol').ChunkMesh>());
  useEffect(() => {
    const datum = datumGroupRef.current;
    if (!datum) return;
    if (!simChunks || simChunks.size === 0) {
      // leaving sim mode: dispose every chunk mesh + the shared materials
      simGroupRef.current?.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      simGroupRef.current?.removeFromParent();
      simGroupRef.current = null;
      simMatRef.current?.dispose();
      simMatRef.current = null;
      simGhostMatRef.current?.dispose();
      simGhostMatRef.current = null;
      simBuiltRef.current.clear();
      return;
    }
    let group = simGroupRef.current;
    if (!group) {
      group = new THREE.Group();
      group.name = 'sim-chunks';
      datum.add(group);
      simGroupRef.current = group;
    }
    if (!simMatRef.current) {
      simMatRef.current = new THREE.MeshStandardMaterial({ color: 0x9c7b52, flatShading: true });
    }
    if (!simGhostMatRef.current) {
      // vertexColors carries the yellow/red classification WITH per-vertex
      // alpha (the mesher's RGBA attribute — yellow translucent, red strong),
      // so the material itself stays at full opacity; slight polygon offset
      // keeps the overlay from z-fighting the solid mesh
      simGhostMatRef.current = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
    }
    const mat = simMatRef.current;
    const ghostMat = simGhostMatRef.current;
    for (const [id, chunk] of simChunks) {
      if (simBuiltRef.current.get(id) === chunk) continue; // unchanged
      simBuiltRef.current.set(id, chunk);
      let mesh = group.children.find(
        (c) => (c as THREE.Mesh).name === `chunk-${id}`,
      ) as THREE.Mesh | undefined;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(chunk.normals, 3));
      geo.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
      if (chunk.indices.length === 0) {
        // fully carved away — an empty mesh keeps it hidden cheaply
        if (mesh) mesh.geometry.dispose(), (mesh.geometry = geo);
        else {
          mesh = new THREE.Mesh(geo, mat);
          mesh.name = `chunk-${id}`;
          mesh.visible = false;
          group.add(mesh);
        }
      } else if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = geo;
        mesh.visible = true;
      } else {
        mesh = new THREE.Mesh(geo, mat);
        mesh.name = `chunk-${id}`;
        group.add(mesh);
      }
      // the classification ghost overlay (yellow gouge / red shank
      // contact) rides on the same chunk message
      const ghostName = `chunk-ghost-${id}`;
      if (chunk.ghostIndices && chunk.ghostIndices.length > 0) {
        const ggeo = new THREE.BufferGeometry();
        ggeo.setAttribute('position', new THREE.BufferAttribute(chunk.ghostPositions!, 3));
        ggeo.setAttribute('normal', new THREE.BufferAttribute(chunk.ghostNormals!, 3));
        ggeo.setAttribute('color', new THREE.BufferAttribute(chunk.ghostColors!, 4, true));
        ggeo.setIndex(new THREE.BufferAttribute(chunk.ghostIndices!, 1));
        let gmesh = group.children.find((c) => (c as THREE.Mesh).name === ghostName) as
          | THREE.Mesh
          | undefined;
        if (gmesh) {
          gmesh.geometry.dispose();
          gmesh.geometry = ggeo;
        } else {
          gmesh = new THREE.Mesh(ggeo, ghostMat);
          gmesh.name = ghostName;
          gmesh.renderOrder = 1;
          group.add(gmesh);
        }
      } else {
        // no ghosts this update — drop any stale overlay mesh
        const stale = group.children.find((c) => (c as THREE.Mesh).name === ghostName);
        if (stale) {
          ((stale as THREE.Mesh).geometry)?.dispose();
          group.remove(stale);
        }
      }
    }
  }, [simChunks, stock]);

  // the sim's live tool-tip marker (b12, Alice's ask: "a marker for the
  // tool tip position ... a dot, or an outline"): a small cyan sphere at
  // the tip plus a slim stub along the tool axis so the approach direction
  // reads. Parented into datumGroup — the tip pose is MATERIAL frame, the
  // same frame the chunk meshes post in, so it lands exactly where the
  // tool just carved, index rotation included. depthTest off + renderOrder
  // above the chunks so the dot reads THROUGH standing stock (that is the
  // point: finding the tool inside the carved cavity). Visible only while
  // a run is in flight (running && tip); the hook clears tip on done/
  // dispose, and this effect just hides the objects on null.
  const simTipGroupRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    const datum = datumGroupRef.current;
    if (!datum) return;
    let g = simTipGroupRef.current;
    if (g && g.parent !== datum) {
      // the scene effect rebuilt the datum group (a stock change) — the old
      // marker group is detached; drop it and build into the fresh one
      disposeGroup(g);
      datum.remove(g);
      g = null;
      delete (window as unknown as { __simTipMarker?: THREE.Group }).__simTipMarker;
    }
    if (!g) {
      g = new THREE.Group();
      g.name = 'sim-tip-marker';
      // the tool silhouette: a SMALL INVERTED CONE, 30% transparent
      // (Alice, 2026-10-29: "make the dot of the tool tip instead be a
      // small 30% transparent inverted cone") — the cone's base sits AT
      // the tip (the cutting edge, where the Ø is), apex up along the
      // shank: it reads as the tool itself rather than a generic dot.
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x66d9ff,
        transparent: true,
        opacity: 0.3, // 30% transparent per the spec
        depthTest: false,
        side: THREE.DoubleSide, // a translucent shell reads from both sides
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.5, 16), coneMat);
      cone.renderOrder = 10;
      cone.name = 'tip-dot';
      g.add(cone);
      // the axis stub: +Z in group-local space (a stub of the tool's shank
      // direction, −axis); rebuilt per pose below from the two endpoints
      const stubMat = new THREE.LineBasicMaterial({
        color: 0x66d9ff,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      });
      const stub = new THREE.Line(new THREE.BufferGeometry(), stubMat);
      stub.renderOrder = 10;
      stub.name = 'tip-stub';
      g.add(stub);
      g.visible = false;
      datum.add(g);
      simTipGroupRef.current = g;
      // the browser smoke drivers' handle (scripts/smoke-tipmarker.mjs):
      // three.js objects aren't DOM-inspectable, so the marker group is
      // published on window for the probe — a debug hook, not app state
      (window as unknown as { __simTipMarker?: THREE.Group }).__simTipMarker = g;
    }
    if (!simTip) {
      g.visible = false;
      if (!simChunks) {
        // the sim session itself ended (Clear / dispose dropped the chunks)
        // — the marker leaves the scene with it; a completed-but-displayed
        // run only HIDES it (done cleared the tip, the chunks remain)
        disposeGroup(g);
        datum.remove(g);
        simTipGroupRef.current = null;
        delete (window as unknown as { __simTipMarker?: THREE.Group }).__simTipMarker;
      }
      return;
    }
    g.visible = true;
    const cone = g.getObjectByName('tip-dot') as THREE.Mesh;
    // the cone's axis: apex toward −(tool axis) — the shank side. Three.js
    // cones point +Y; rotate +Y onto the shank direction. The BASE sits at
    // the tip (the cutting edge), so the cone's center offsets half the
    // height along the shank direction.
    // FLIP: the APEX sits at the tool tip and the cone opens UPWARD along
    // the shank (Alice, 2026-10-29: "smaller and the other way up") —
    // read it as the tool's taper INTO the material. −(tool axis) is the
    // shank side; the apex at the tip means the center offsets half the
    // height along the shank and the cone points BACK down that axis.
    const shank = new THREE.Vector3(-simTip.ax, -simTip.ay, -simTip.az).normalize();
    const half = 1.25; // half the cone height
    cone.position.set(
      simTip.x + shank.x * half,
      simTip.y + shank.y * half,
      simTip.z + shank.z * half,
    );
    // the cone's +Y (apex side) points back INTO the cut, i.e. along the
    // TOOL axis: apex at the tip, base opening toward the shank
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shank.clone().negate());
    const stub = g.getObjectByName('tip-stub') as THREE.Line;
    // the stub rises from the tip ALONG −axis (the shank side, out of the
    // cut): min(flute 10mm) of approach direction, cheap to read
    const len = 10;
    stub.geometry.dispose();
    stub.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(simTip.x, simTip.y, simTip.z),
      new THREE.Vector3(
        simTip.x - simTip.ax * len,
        simTip.y - simTip.ay * len,
        simTip.z - simTip.az * len,
      ),
    ]);
  }, [simTip, simChunks, stock]);

  // THE PLAYBACK TRAIL (Alice's spec + 2026-10-29 correction, verbatim:
  // "display a small cluster of moves around the current cut ... you get
  // a clear idea of where it has just been and where its going whilst
  // its rendering the cut, but without cluttering the screen" — and the
  // correction: the trail rides WITH THE SIMULATION + the tool marker,
  // NOT as part of the Paths view, which stays the full nest). A SHORT
  // cluster only — current move + the next two at 50%, the three
  // previous at 15/10/5% — NOTHING ELSE: no floor of the whole job.
  // Alice's ceiling: no path line exceeds 50%; full opacity is the
  // model's alone. Rapids one shade under their cut twin. Parented into
  // datumGroup beside the marker and the chunks (the same display frame
  // movesToSegmentMoves maps into), rebuilt per transport position.
  useEffect(() => {
    const datum = datumGroupRef.current;
    if (!datum || !previewMoves || playbackMove === null || !displayLayers.simulation) return;
    const segs = movesToSegmentMoves(previewMoves, stock);
    const cur = playbackMove;
    // the SHORT cluster: Δmove ∈ [−3, +2]. Map each Δ to its opacity.
    const band = (d: number): number | null => {
      if (d >= 0 && d <= 2) return 0.5; // current + the next two
      if (d === -1) return 0.15;
      if (d === -2) return 0.1;
      if (d === -3) return 0.05;
      return null; // outside the cluster: NOT DRAWN (no whole-job floor)
    };
    const classes = new Map<number, { feed: number[]; rapid: number[] }>();
    const add = (dMove: number) => {
      let c = classes.get(dMove);
      if (!c) { c = { feed: [], rapid: [] }; classes.set(dMove, c); }
      return c;
    };
    for (let s = 0; s < segs.feedMoves.length; s++) {
      const d = segs.feedMoves[s] - cur;
      if (band(d) === null) continue;
      add(d).feed.push(
        segs.feed[s * 6], segs.feed[s * 6 + 1], segs.feed[s * 6 + 2],
        segs.feed[s * 6 + 3], segs.feed[s * 6 + 4], segs.feed[s * 6 + 5],
      );
    }
    for (let s = 0; s < segs.rapidMoves.length; s++) {
      const d = segs.rapidMoves[s] - cur;
      if (band(d) === null) continue;
      add(d).rapid.push(
        segs.rapid[s * 6], segs.rapid[s * 6 + 1], segs.rapid[s * 6 + 2],
        segs.rapid[s * 6 + 3], segs.rapid[s * 6 + 4], segs.rapid[s * 6 + 5],
      );
    }
    const objects: LineSegments2[] = [];
    // WIDTH (Alice's ask, 2026-10-29: "make those lines a bit thicker,
    // they are translucent its fine to be a few pixels wide"): the stock
    // LineSegments/LineBasicMaterial linewidth is driver-ignored (1px),
    // so the trail renders through the fat-line pipeline — LineSegments2
    // with a screen-space pixel width. Translucent + a few px wide reads
    // cleanly against the carved voxels.
    const mkFat = (pts: number[], color: number, opacity: number) => {
      const g = new LineSegmentsGeometry();
      g.setPositions(pts);
      const m = new LineMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        linewidth: 6, // screen pixels (Alice, 2026-10-29: "twice their current width")
      });
      m.resolution.set(host.current?.clientWidth ?? 800, host.current?.clientHeight ?? 600);
      const line = new LineSegments2(g, m);
      line.renderOrder = 10;
      datum.add(line);
      objects.push(line);
    };
    for (const [d, c] of classes) {
      const o = band(d)!;
      if (c.feed.length > 0) mkFat(c.feed, 0xffd27f, o);
      if (c.rapid.length > 0) mkFat(c.rapid, 0xe05555, Math.max(0.03, o * 0.7));
    }
    return () => {
      for (const l of objects) {
        datum.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    };
  }, [previewMoves, playbackMove, displayLayers.simulation, stock]);

  // sim mode: the carved chunks replace the translucent stock, and the
  // Layer visibility (the Layers dropdown): Stock/Model ticks, and the
  // model ghosts while simulation chunks are displayed (comparison mode —
  // the same mesh instance, material swap only)
  const simActive = (simChunks?.size ?? 0) > 0 && displayLayers.simulation;
  useEffect(() => {
    const stockG = stockGroupRef.current;
    const model = modelRef.current;
    if (!stockG || !model) return;
    const mat = model.material as THREE.MeshStandardMaterial;
    // the sim overlay REPLACES the stock view; the stock tick wins only
    // when there are no sim chunks to show
    stockG.visible = displayLayers.stock && !simActive;
    if (displayLayers.model) {
      const ghost = simActive;
      mat.transparent = ghost;
      mat.opacity = ghost ? 0.25 : 1;
      mat.depthWrite = !ghost;
    } else {
      mat.transparent = true;
      mat.opacity = 0;
      mat.depthWrite = false;
    }
    mat.needsUpdate = true;
  }, [simActive, displayLayers.stock, displayLayers.model, stock, geometry]);

  // Feature overlays: static outlines + the measure-mode hover line, one
  // overlay per source (model + primitives). Runs after the scene effect
  // (which owns the feature group) and re-runs when the stock rebuilds
  // the scene.
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group) return;
    if (sources.length === 0) {
      overlaysRef.current = [];
      hoverLineRef.current = null;
      setLabel(null);
      return;
    }

    const entries: SourceOverlay[] = sources.map((source) => ({
      source,
      // wrapped artwork frames densify the outline polylines (round 5:
      // the fill shade's fineness rule, now on the lines too); flat and
      // mesh sources pass null — their lines are already exact
      data: buildFeatureOverlayData(
        source.features,
        source.transform,
        source.artworkFrame?.kind === 'wrapped'
          ? { diameter: source.artworkFrame.diameter }
          : null,
      ),
    }));
    for (const entry of entries) {
      const { data } = entry;
      data.edgeLines.visible = displayLayers.features;
      data.circleLines.visible = displayLayers.features;
      data.holeLines.visible = displayLayers.features;
      // chain silhouettes are pick TARGETS, not decoration (Alice,
      // 2026-11-08): magenta only while features are selectable — measure
      // mode, which op feature-add and every one-shot pick arm. A
      // SELECTED chain highlights through the generic op-selection walk
      // below, for any open op, regardless of this gate.
      data.chainLines.visible = displayLayers.features && measureMode;
      // artwork line work is the OBJECT's body — an authored primitive
      // must not vanish with the features toggle (there is no volume to
      // render; the amber lines are it)
      data.pathLines.visible = displayLayers.features || entry.source.artworkFrame !== undefined;
      // ... and the lines are also the artwork's selection surface: the
      // picked artwork's strokes light up amber-bright
      if (entry.source.artworkFrame) {
        (data.pathLines.material as THREE.LineBasicMaterial).color.setHex(
          entry.source.id === selectedObjectId ? 0xffe066 : PATH_COLOR,
        );
      }
      group.add(data.edgeLines, data.circleLines, data.holeLines, data.pathLines, data.chainLines);
    }

    const hoverLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }),
    );
    hoverLine.renderOrder = 5;
    hoverLine.visible = false;
    group.add(hoverLine);

    // transient face hover wash (geometry swapped by pointermove)
    const hoverPlane = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: PLANE_SELECT,
        transparent: true,
        opacity: 0.2,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    hoverPlane.renderOrder = 3;
    hoverPlane.visible = false;
    group.add(hoverPlane);
    hoverPlaneRef.current = hoverPlane;

    // selection highlights (op blue / global green, distinct from the hover
    // tints) and the center-to-center connector when exactly two are selected
    const selObjects: THREE.Object3D[] = [];
    for (const sel of opSelection) {
      const entry = entries.find((o) => o.source.id === sel.sourceId);
      if (!entry) continue;
      if (sel.kind === 'plane') {
        const mesh = planeHighlightMesh(
          entry.source.geometry,
          entry.source.features,
          entry.source.transform,
          sel.index,
          selColor,
        );
        if (mesh) {
          mesh.renderOrder = 7;
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
          group.add(mesh);
          selObjects.push(mesh);
        }
      } else {
        const line = new THREE.LineSegments(
          hoverLineGeometry(entry.data, sel.kind, sel.index),
          new THREE.LineBasicMaterial({ color: selColor, transparent: true, depthTest: false }),
        );
        line.renderOrder = 6;
        group.add(line);
        selObjects.push(line);
      }
    }
    // THE FILL SHADE + REGION PICK (Alice, 2026-10-31; round 2): in
    // 'outline+fill' mode EVERY artwork source builds two meshes over its
    // closed+filled paths. The pick mesh covers ALL of them — selected or
    // not — invisible but raycastable, so a region click can make the
    // FIRST selection ("i am unable to click within the ankh to select
    // it"); each triangle carries its loop's feature index + nesting
    // depth, the tie-break when nested fans stack (the counter beats the
    // outline around it). The shade mesh renders only the SELECTED
    // region — the clipper-polygonized triangles — in the selection
    // blue @ 0.2, no depth write, on the frame's surface lift (flat 0.05
    // along +Z, wrapped 0.05 radial — round 4: subdivision made the
    // wrapped shade tessellate FINER than the stock, so the lift no
    // longer needs the round-3 0.2 crutch) + polygon offset so it never
    // z-fights model/stock.
    const shadeMeshes: THREE.Mesh[] = [];
    if (fillShade) {
      for (const entry of entries) {
        if (!entry.source.artworkFrame) continue; // artwork only
        const frame = entry.source.artworkFrame;
        const selected = new Set(
          opSelection
            .filter((s) => s.kind === 'path' && s.sourceId === entry.source.id)
            .map((s) => s.index),
        );
        const tris = artworkFillTris(
          entry.source.features.paths,
          selected,
          frame.kind === 'wrapped' ? 'wrapped' : 'flat',
          frame.kind === 'wrapped' ? frame.diameter : 0,
        );
        if (tris.pick.length === 0) continue;
        const xf = transformFn(entry.source.transform); // the pathLines placement, verbatim
        const pos = tris.verts.map((v) => xf(v));
        const mkGeo = (idx: number[]) => {
          const g = new THREE.BufferGeometry().setFromPoints(pos);
          g.setIndex(idx);
          return g;
        };
        if (tris.shade.length > 0) {
          const shade = new THREE.Mesh(
            mkGeo(tris.shade.flat()),
            new THREE.MeshBasicMaterial({
              color: selColor,
              transparent: true,
              opacity: 0.2,
              depthWrite: false,
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              // units -1 (round 4 measurement, probes/sweep-fill-shade.mjs):
              // with the subdivided mesh the 0.05 lift wins 100% face-on
              // even at -1 — the round-3 -8 was compensating the coarse
              // mesh's 0.45mm chord dips, not the depth fight itself
              polygonOffsetUnits: -1,
            }),
          );
          shade.renderOrder = 6; // beside the selection highlights
          shade.userData.sourceId = entry.source.id; // the smokes' handle
          group.add(shade);
          selObjects.push(shade);
        }
        // invisible-but-pickable: opacity 0 + colorWrite off so nothing
        // ever renders, depthWrite off so nothing occludes — raycast only
        const pick = new THREE.Mesh(
          mkGeo(tris.pick.flatMap((t) => t.v)),
          new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            colorWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        pick.userData.sourceId = entry.source.id;
        pick.userData.featureIndices = tris.pick.map((t) => t.owner);
        pick.userData.ownerDepths = tris.pick.map((t) => t.depth);
        group.add(pick);
        selObjects.push(pick);
        shadeMeshes.push(pick);
      }
    }
    fillShadeMeshesRef.current = shadeMeshes;

    const picks = picksFromSelection(opSelection, entries, selColor);
    if (picks.length === 2) {
      const conn = connectorLine(picks[0], picks[1]);
      group.add(conn);
      selObjects.push(conn);
    }

    overlaysRef.current = entries;
    hoverLineRef.current = hoverLine;

    return () => {
      for (const { data } of entries) {
        for (const l of [
          data.edgeLines,
          data.circleLines,
          data.holeLines,
          data.pathLines,
          data.chainLines,
        ]) {
          group.remove(l);
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
        }
      }
      group.remove(hoverLine);
      hoverLine.geometry.dispose();
      (hoverLine.material as THREE.Material).dispose();
      group.remove(hoverPlane);
      hoverPlane.geometry.dispose();
      (hoverPlane.material as THREE.Material).dispose();
      hoverPlaneRef.current = null;
      for (const o of selObjects) {
        group.remove(o);
        const obj = o as THREE.Mesh;
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material;
        mat.dispose();
      }
      overlaysRef.current = [];
      hoverLineRef.current = null;
      fillShadeMeshesRef.current = [];
    };
  }, [sources, stock, displayLayers.features, measureMode, opSelection, selColor, selectedObjectId, fillShade]);

  // toolpath preview: feed/rapid polylines straight from the Move[] IR.
  // THE PLAYBACK TRAIL (Alice's spec, 2026-10-29): while a playback
  // highlights paths (playbackMove set), segments render by their move-
  // distance from the transport's current move — current + next two at
  // 50%, the three previous at 15/10/5%, everything older at a 4% floor —
  // the full-opacity cloud becomes a readable ribbon of where the tool
  // has just been and where it goes next. Alice's ceiling: no path line
  // ever exceeds 50% (full opacity is the model's alone); rapids ride
  // below their cut-class twin. Static preview (playbackMove null)
  // keeps today's full-opacity render — a paused playback keeps the
  // trail (the committed position drives it).
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group || !previewMoves || !displayLayers.paths) return;
    const segs = movesToSegmentMoves(previewMoves, stock);
    const mk = (pts: number[], color: number, opacity: number, order: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
      );
      line.renderOrder = order;
      group.add(line);
      return line;
    };
    const objects: THREE.LineSegments[] = [];
    // THE PATHS LAYER IS THE FULL NEST, ALWAYS FULL OPACITY (Alice's
    // 2026-10-29 correction: the trail is NOT part of the Paths view —
    // that view exists to show every path at once; the trail lives with
    // the simulation). Feed cuts amber, rapids red.
    if (segs.feed.length > 0) objects.push(mk(segs.feed, 0xffd27f, 0.95, 8));
    if (segs.rapid.length > 0) objects.push(mk(segs.rapid, 0xe05a5a, 0.9, 9));
    return () => {
      for (const l of objects) {
        group.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    };
  }, [previewMoves, displayLayers.paths, stock]);

  // slice-pocket cut plane (edge-tracing §5): a translucent violet quad at
  // the slice Z + the contour outline there, and a grab pill on the plane's
  // near edge that drags it up/down — the orbit pauses for the drag, the
  // op's start-depth box follows live (one re-slice per frame at most)
  useEffect(() => {
    // machine-space group: the overlay shows where the tool cuts (the
    // datum group rotates the PART, this plane stays machine-horizontal)
    const group = sliceGroupRef.current;
    const renderer = rendererRef.current;
    // cameraRef is read LIVE at the use sites below (a projection toggle
    // re-points it without re-running this effect) — only its existence
    // is checked here
    if (!cameraRef.current) return;
    const controls = controlsRef.current;
    if (!group || !renderer || !controls) return;
    if (!slicePreview || !geometry) return;

    const dom = renderer.domElement;
    const plane = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: SLICE_COLOR,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    plane.renderOrder = 1;
    const outline = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: SLICE_COLOR, transparent: true, depthTest: false }),
    );
    outline.renderOrder = 9;
    // the handle: two small arrows (stacked cones, slight gap) reading
    // "drag up / drag down" — never a blob over the part
    const arrowMat = new THREE.MeshBasicMaterial({ color: SLICE_COLOR, depthTest: false });
    const handle = new THREE.Group();
    for (const dir of [1, -1] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 12), arrowMat);
      // ConeGeometry points +Y; stand it on the Z axis, apex outward
      cone.rotation.x = (dir * Math.PI) / 2;
      cone.position.z = dir * 0.9;
      cone.renderOrder = 10;
      handle.add(cone);
    }
    const g = new THREE.Group();
    g.add(plane, outline, handle);
    group.add(g);

    // the placed model's machine-space bounds (rotated to the op's
    // datum when one is active — generation slices the same rotated
    // positions): the quad spans the XY extent, the drag clamps to Z
    const pos0 = transformedPositions(geometry, transform);
    const pos = slicePreview.rotate
      ? (() => {
          const out = new Float32Array(pos0.length);
          for (let i = 0; i < pos0.length; i += 3) {
            const v = slicePreview.rotate({
              x: pos0[i],
              y: pos0[i + 1],
              z: pos0[i + 2],
            });
            out[i] = v.x;
            out[i + 1] = v.y;
            out[i + 2] = v.z;
          }
          return out;
        })()
      : pos0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < x0) x0 = pos[i];
      if (pos[i] > x1) x1 = pos[i];
      if (pos[i + 1] < y0) y0 = pos[i + 1];
      if (pos[i + 1] > y1) y1 = pos[i + 1];
      if (pos[i + 2] < z0) z0 = pos[i + 2];
      if (pos[i + 2] > z1) z1 = pos[i + 2];
    }
    if (!Number.isFinite(x0)) {
      // a geometry with no positions: nothing to draw or to drag against
      group.remove(g);
      disposeGroup(g);
      return () => {};
    }

    const rebuild = (z: number) => {
      const quad = new THREE.BufferGeometry();
      quad.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], 3),
      );
      quad.setIndex([0, 1, 2, 0, 2, 3]);
      plane.geometry.dispose();
      plane.geometry = quad;
      const pts: number[] = [];
      for (const c of sliceAtZ(pos, z).contours) {
        for (let i = 0; i < c.length; i++) {
          const a = c[i];
          const b = c[(i + 1) % c.length];
          pts.push(a.x, a.y, z, b.x, b.y, z);
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      outline.geometry.dispose();
      outline.geometry = lg;
    };
    const placeHandle = (z: number) => {
      // the quad edge midpoints nearest the camera — pushed OUT along
      // the edge normal so the arrows clear the model with a small gap
      // instead of overlapping its edge
      const OUT = 1.3; // cone radius 0.5 + a visible gap
      const mids: { x: number; y: number; nx: number; ny: number }[] = [
        { x: (x0 + x1) / 2, y: y0, nx: 0, ny: -1 },
        { x: x1, y: (y0 + y1) / 2, nx: 1, ny: 0 },
        { x: (x0 + x1) / 2, y: y1, nx: 0, ny: 1 },
        { x: x0, y: (y0 + y1) / 2, nx: -1, ny: 0 },
      ];
      let best = mids[0];
      let bestD = Infinity;
      // live camera (the projection may have toggled since this effect
      // ran); the controls' active object backs it up
      const camPos = cameraRef.current?.position ?? controls.object.position;
      for (const m of mids) {
        const d = new THREE.Vector3(m.x + m.nx * OUT, m.y + m.ny * OUT, z).distanceTo(camPos);
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      handle.position.set(best.x + best.nx * OUT, best.y + best.ny * OUT, z);
    };
    // always draw at the CURRENT plane height — during a drag that's the
    // drag's z (the live box update re-runs this effect, and a skipped
    // rebuild would flash the overlay off for a frame)
    const zNow = sliceDragRef.current?.z ?? slicePreview.z;
    rebuild(zNow);
    placeHandle(zNow);
    // pending drag frames apply through the ref so they always target
    // the LIVE group, never a disposed previous instance
    sliceFnsRef.current = { rebuild, placeHandle };

    // ---- the drag ----
    const raycaster = new THREE.Raycaster();
    const hoverHandle = (e: PointerEvent): boolean => {
      const rect = dom.getBoundingClientRect();
      // cameraRef read LIVE: a projection toggle re-points it without
      // re-running this effect
      const active = cameraRef.current;
      if (!active) return false;
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        active,
      );
      return raycaster.intersectObject(handle, true).length > 0;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || sliceDragRef.current || !hoverHandle(e)) return;
      controls.enabled = false; // the drag owns the pointer, not the orbit
      sliceDragRef.current = {
        startClientY: e.clientY,
        startZ: slicePreview.z,
        z: slicePreview.z,
        raf: 0,
      };
      dom.setPointerCapture(e.pointerId);
      dom.style.cursor = 'ns-resize';
    };
    const onMove = (e: PointerEvent) => {
      const d = sliceDragRef.current;
      if (!d) {
        const over = hoverHandle(e);
        if (over) dom.style.cursor = 'grab';
        else if (dom.style.cursor === 'grab') dom.style.cursor = '';
        return;
      }
      // live camera: the projection may have toggled since this effect
      // ran, and the drag math must match the snap math (pxPerMmAt) in
      // EITHER projection
      const active = cameraRef.current;
      if (!active) return;
      const depth = Math.max(handle.position.distanceTo(active.position), 0.01);
      const h = dom.clientHeight || 1;
      const mmPerPx = 1 / pxPerMmAt(active, h, depth);
      d.z = Math.min(Math.max(d.startZ - (e.clientY - d.startClientY) * mmPerPx, z0), z1);
      if (d.raf === 0) {
        d.raf = requestAnimationFrame(() => {
          d.raf = 0;
          const fns = sliceFnsRef.current;
          if (fns) {
            fns.rebuild(d.z);
            fns.placeHandle(d.z);
          }
          slicePreview.onZChange(d.z);
        });
      }
    };
    const onUp = () => {
      const d = sliceDragRef.current;
      if (!d) return;
      if (d.raf !== 0) cancelAnimationFrame(d.raf);
      sliceDragRef.current = null;
      controls.enabled = true;
      dom.style.cursor = '';
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);

    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      // A prop change (the live box update an active drag CAUSES) re-runs
      // this cleanup — it must NOT kill the drag or re-enable the orbit
      // mid-gesture: the fresh effect re-adds listeners that continue via
      // sliceDragRef, and onUp restores the controls when the user lets
      // go. Only a true unmount has no fresh run (the unmount-only effect
      // below handles that). Drop the fns only if WE are still the live
      // instance — a newer effect run has already replaced them.
      if (sliceFnsRef.current?.rebuild === rebuild) sliceFnsRef.current = null;
      group.remove(g);
      disposeGroup(g);
    };
  }, [slicePreview, geometry, transform, stock]);

  // the face-cylinder op's intended result (edge-tracing §5): a violet
  // ghost cylinder of the target diameter spanning Start→End X about the
  // stock axis, while that op's panel is open. Machine space (the faced
  // cylinder is coaxial with the rotation axis, so the datum view leaves
  // it untouched); live-updates as the ⇩ picks fill the fields.
  useEffect(() => {
    const group = sliceGroupRef.current;
    const partGroup = featureGroupRef.current;
    if (!group || !partGroup) return;
    if (!facePreview || facePreview.xEnd <= facePreview.xStart) return;
    const len = facePreview.xEnd - facePreview.xStart;
    const geo = new THREE.CylinderGeometry(
      facePreview.diameter / 2,
      facePreview.diameter / 2,
      len,
      segmentsForRadius(facePreview.diameter / 2),
    );
    geo.rotateZ(Math.PI / 2); // geometry Y axis → machine X (the stock axis)
    // denser than the stock ghost and drawn over it (depthTest off):
    // the result reads clearly THROUGH the brown stock shell — paler
    // when the spiral marks carry the detail
    const mat = new THREE.MeshBasicMaterial({
      color: SLICE_COLOR,
      transparent: true,
      opacity: facePreview.marks ? 0.14 : 0.28,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (facePreview.xStart + facePreview.xEnd) / 2,
      0,
      facePreview.axisZ,
    );
    mesh.renderOrder = 3;

    // the spiral grooves: opaque violet polylines in the part-local
    // frame — the datum rotation carries them with the part
    const markGeos: THREE.BufferGeometry[] = [];
    const markMat = new THREE.LineBasicMaterial({
      color: SLICE_COLOR,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const markLines = (facePreview.marks ?? []).map((pts) => {
      const lg = new THREE.BufferGeometry().setFromPoints(
        pts.map((q) => new THREE.Vector3(q.x, q.y, q.z)),
      );
      markGeos.push(lg);
      const line = new THREE.Line(lg, markMat);
      line.renderOrder = 7;
      return line;
    });

    group.add(mesh);
    for (const l of markLines) partGroup.add(l);
    return () => {
      group.remove(mesh);
      for (const l of markLines) partGroup.remove(l);
      geo.dispose();
      mat.dispose();
      for (const g of markGeos) g.dispose();
      markMat.dispose();
    };
  }, [facePreview]);

  // the thread-mill op's intended AREA (2026-10-28): a violet ghost
  // cylinder of the thread's cutting Ø over the start→end Z band at the
  // resolved bore/boss, while that op's panel is open — the thread will
  // apply to this band. Machine space; drawn through the stock/model
  // like the face ghost (depthTest off), live with the depth boxes.
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;
    if (!threadPreview || threadPreview.bottomZ >= threadPreview.topZ) return;
    const len = threadPreview.topZ - threadPreview.bottomZ;
    const geo = new THREE.CylinderGeometry(
      threadPreview.diameter / 2,
      threadPreview.diameter / 2,
      len,
      segmentsForRadius(threadPreview.diameter / 2),
    );
    geo.rotateX(Math.PI / 2); // geometry Y axis → machine Z (the thread axis)
    const mat = new THREE.MeshBasicMaterial({
      color: SLICE_COLOR,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      threadPreview.center.x,
      threadPreview.center.y,
      (threadPreview.topZ + threadPreview.bottomZ) / 2,
    );
    mesh.renderOrder = 3;
    group.add(mesh);
    return () => {
      group.remove(mesh);
      geo.dispose();
      mat.dispose();
    };
  }, [threadPreview]);

  // the rotary-chamfer op's intended AREA (2026-11-08): one magenta ghost
  // cylinder per resolved edge circle about the stock axis — the anchor Ø
  // the tip descends to, axially as wide as the chamfer's calculated
  // width (V-bit: depth·tan(half-angle); ball: the channel's true chord
  // width). The same formulas the generator cuts, so the ghost shows the
  // real effect. Machine space (the chamfer is coaxial with the rotation
  // axis, so the datum view leaves it untouched); drawn through the
  // stock/model like the other ghosts (depthTest off), live with the
  // depth boxes.
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;
    if (!chamferPreview || chamferPreview.length === 0) return;
    const meshes: THREE.Mesh[] = [];
    const geos: THREE.BufferGeometry[] = [];
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff55ee,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    for (const c of chamferPreview) {
      const geo = new THREE.CylinderGeometry(
        c.diameter / 2,
        c.diameter / 2,
        c.width,
        segmentsForRadius(c.diameter / 2),
      );
      geos.push(geo);
      geo.rotateZ(Math.PI / 2); // geometry Y axis → machine X (the stock axis)
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, 0, c.axisZ);
      mesh.renderOrder = 3;
      group.add(mesh);
      meshes.push(mesh);
    }
    return () => {
      for (const m of meshes) group.remove(m);
      for (const g of geos) g.dispose();
      mat.dispose();
    };
  }, [chamferPreview]);

  // the pocket op's projected AREA (2026-11-08, Alice's slot pick): a
  // flat translucent ghost at the selection's rim Z — the region(s) the
  // op will cut, resolved through the same projection generation uses
  // (planes, circles, and constant-radius chains alike). Machine space;
  // drawn through the stock/model like the other ghosts (depthTest off).
  useEffect(() => {
    const group = sliceGroupRef.current;
    if (!group) return;
    if (!pocketPreview || pocketPreview.length === 0) return;
    const meshes: THREE.Mesh[] = [];
    const geos: THREE.BufferGeometry[] = [];
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff55ee,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    for (const part of pocketPreview) {
      // orientLoops already made outer CCW / holes CW — THREE.Shape's
      // convention: outer CCW, holes CW
      const signedArea = (pts: Vec2[]): number => {
        let a = 0;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const q = pts[(i + 1) % pts.length];
          a += p.x * q.y - q.x * p.y;
        }
        return a / 2;
      };
      const shapes: THREE.Shape[] = [];
      const outerAreas: number[] = [];
      const holes: { pts: Vec2[]; area: number }[] = [];
      for (const loop of part.regions) {
        const signed = signedArea(loop);
        const poly = loop.map((p) => new THREE.Vector2(p.x, p.y));
        if (signed >= 0) {
          shapes.push(new THREE.Shape(poly));
          outerAreas.push(Math.abs(signed));
        } else {
          holes.push({ pts: loop, area: Math.abs(signed) });
        }
      }
      // holes attach to the smallest enclosing outer
      for (const h of holes) {
        let best = -1;
        let bestArea = Infinity;
        for (let i = 0; i < shapes.length; i++) {
          if (outerAreas[i] > h.area && outerAreas[i] < bestArea) {
            bestArea = outerAreas[i];
            best = i;
          }
        }
        if (best >= 0)
          shapes[best].holes.push(new THREE.Path(h.pts.map((p) => new THREE.Vector2(p.x, p.y))));
      }
      for (const shape of shapes) {
        const geo = new THREE.ShapeGeometry(shape);
        geos.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 0, part.selectionZ);
        mesh.renderOrder = 3;
        group.add(mesh);
        meshes.push(mesh);
      }
    }
    return () => {
      for (const m of meshes) group.remove(m);
      for (const g of geos) g.dispose();
      mat.dispose();
    };
  }, [pocketPreview]);

  // unmount only: no fresh effect run follows, so end any drag and give
  // the controls back
  useEffect(() => {
    return () => {
      sliceDragRef.current = null;
      if (controlsRef.current) controlsRef.current.enabled = true;
    };
  }, []);

  // user primitives (roughing volumes, tabs): translucent orange volumes.
  // Non-indexed meshes from primitiveGeometry (same construction the feature
  // sources detect on) so raycast faceIndex aligns with faceToPlane; the
  // meshes register in primMeshesRef for plane picks and face hovering.
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group) return;
    const objs: THREE.Mesh[] = [];
    for (const p of primitives) {
      if (p.kind === 'artwork') {
        // line work, not a volume: it renders as its amber path overlay
        // (buildFeatureOverlayData), and neither occludes the raycast
        // pickers nor is face-pickable — no solid mesh to build here
        continue;
      }
      const indexed = primitiveGeometry(p);
      const geo = indexed.toNonIndexed(); // faces align with the source detection
      indexed.dispose();
      // the selected primitive reads clearly picked: brighter fill, pale edges
      const sel = p.id === selectedObjectId;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: sel ? 0xf0c050 : 0xd08850,
          transparent: true,
          opacity: sel ? 0.4 : 0.22,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.userData.sourceId = p.id;
      // pose = primitivePose = transformFn: the axis remap is baked into the
      // local geometry, so adding any rotation here desyncs the mesh from
      // the feature overlays and the faceIndex → plane mapping
      const pose = primitivePose(p);
      mesh.position.copy(pose.position);
      mesh.quaternion.copy(pose.quaternion);
      mesh.scale.copy(pose.scale);
      mesh.renderOrder = 2;
      // wireframe edge for definition
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({
          color: sel ? 0xffe0a0 : 0xf0a860,
          depthTest: false,
        }),
      );
      mesh.add(edges);
      group.add(mesh);
      objs.push(mesh);
    }
    primMeshesRef.current = objs;
    return () => {
      for (const m of objs) {
        group.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        for (const child of m.children) {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
      }
      primMeshesRef.current = [];
    };
  }, [primitives, stock, selectedObjectId]);

  return (
    <>
      <div ref={host} className="viewport-canvas" />
      {/* projection toggle — the navcube's corner is the view-control
       * zone (fold, don't add a surface). The pill names the CURRENT
       * projection; the tooltip says what clicking switches to */}
      <button
        type="button"
        className="projection-pill"
        title={
          projection === 'persp'
            ? 'Perspective view — click to switch to orthographic (true widths and diameters, no parallax)'
            : 'Orthographic view — click to switch back to perspective'
        }
        onClick={toggleProjection}
      >
        {projection === 'persp' ? 'Persp' : 'Ortho'}
      </button>
      {label && (
        <div className="measure-label" style={{ left: label.x, top: label.y }}>
          {label.text}
        </div>
      )}
      {/* display layers — the ONE place viewport visibility is controlled
       * (Alice's 2026-10-25 consolidation: Stock/Model/Features/Paths/
       * Simulation move out of the scattered panel checkboxes) */}
      <LayersDropdown layers={displayLayers} onToggle={onToggleLayer} />
      {opSelection.map((s, i) => (
        <div
          key={`${s.sourceId}:${s.kind}:${s.index}`}
          ref={(el) => {
            selLabelsRef.current[i] = el;
          }}
          className="measure-label selected"
        />
      ))}
      {opSelection.length === 2 && <div ref={distLabelRef} className="measure-label dist" />}
    </>
  );
}

/** top-right viewport dropdown: every display layer's tick in one place.
 *  Closes on outside click or Escape; the button highlights when open. */
function LayersDropdown(props: {
  layers: { stock: boolean; model: boolean; features: boolean; paths: boolean; simulation: boolean };
  onToggle: (layer: 'stock' | 'model' | 'features' | 'paths' | 'simulation', v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const ENTRIES: [keyof typeof props.layers, string][] = [
    ['stock', 'Stock'],
    ['model', 'Model'],
    ['features', 'Features'],
    ['paths', 'Paths'],
    ['simulation', 'Simulation'],
  ];
  const onCount = ENTRIES.filter(([k]) => props.layers[k]).length;
  return (
    <div ref={ref}>
      <button
        type="button"
        className={`layers-button${open ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Display layers — Stock, Model, Features, Paths, Simulation"
      >
        ▼ Layers
      </button>
      {open && (
        <div className="layers-menu" role="menu">
          {ENTRIES.map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={props.layers[key]}
                onChange={(e) => props.onToggle(key, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
          <span className="legend" style={{ padding: '2px 6px' }}>{onCount}/5 on</span>
        </div>
      )}
    </div>
  );
}