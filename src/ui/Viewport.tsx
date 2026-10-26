import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan, rotaryCalibrationOf } from '../core/types';
import type { FeaturePickKind, ModelTransform, Move, Primitive, Stock } from '../core/types';
import { movesToSegments } from './toolpathPreview';
import { sliceAtZ, transformedPositions } from '../cam/slicing';
import type { FeatureSource } from './featureSources';
import { primitiveGeometry, primitivePose } from './featureSources';
import { NavCube } from './navcube';
import {
  buildFeatureOverlayData,
  connectorLine,
  findNearestFeature,
  hoverLineGeometry,
  measureText,
  pickFromNearest,
  planeHighlightMesh,
  planePick,
  pxPerMmAt,
  sampleVisibleAt,
  PATH_COLOR,
  PLANE_SELECT,
  SELECT_COLOR,
  SLICE_COLOR,
  type FeatureOverlayData,
  type MeasurePick,
  type NearestFeature,
} from './featureOverlays';

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
  kind: 'plane' | 'circle' | 'edge' | 'path';
  index: number;
}

/** One source's overlay data — picking and highlighting run per source. */
interface SourceOverlay {
  source: FeatureSource;
  data: FeatureOverlayData;
}

/** A feature pick annotated with the source it came from. */
type SourcedPick = MeasurePick & { sourceId: string };

/** Measurement picks for the selected features (selection = measurement). */
function picksFromSelection(sel: ResolvedSelection[], overlays: SourceOverlay[]): MeasurePick[] {
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
        color: SELECT_COLOR,
        text: entry.data.circleText[s.index],
      });
      continue;
    }
    if (s.kind === 'path') {
      // artwork: highlighted (via the selection line walk), but not a
      // measurement pick — distances between artwork strokes are noise
      continue;
    }
    out.push({
      kind: 'edge',
      index: s.index,
      center: entry.data.edgeMid[s.index].clone(),
      color: SELECT_COLOR,
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
  primitives: Primitive[];
  /** generated moves to draw (PLAN.md "Toolpath preview") */
  previewMoves: Move[] | null;
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
  /** the carve simulator's chunk meshes, when the Simulation layer is on
   *  (PLAN "cutting simulator"): stock-frame greedy-meshed voxels keyed by
   *  chunk id, machine-space positions baked in. The meshes parent into
   *  datumGroup so index rotation is free. */
  simChunks: Map<number, import('../sim/protocol').ChunkMesh> | null;
  /** display layers (the top-right Layers dropdown) + its toggle —
   *  Stock/Model/Features/Paths/Simulation visibility in one place */
  displayLayers: { stock: boolean; model: boolean; features: boolean; paths: boolean; simulation: boolean };
  onToggleLayer: (layer: 'stock' | 'model' | 'features' | 'paths' | 'simulation', v: boolean) => void;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
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
  primitives,
  previewMoves,
  slicePreview,
  viewDatum,
  pickKind,
  facePreview,
  simChunks,
  displayLayers,
  onToggleLayer,
  onToggleSelect,
  onClearSelection,
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
  const opSelectionRef = useRef(opSelection);
  opSelectionRef.current = opSelection;
  const hoverPlaneRef = useRef<THREE.Mesh | null>(null);
  const [label, setLabel] = useState<{ text: string; x: number; y: number } | null>(null);
  /** labels for the selected features, one per pick */
  const selLabelsRef = useRef<(HTMLDivElement | null)[]>([]);
  const distLabelRef = useRef<HTMLDivElement | null>(null);

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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x10141a); // navcube tile backdrop (main scene has its own bg)
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
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
                  : feats?.edges[pick.index]?.id;
          if (id) onToggleSelectRef.current(id);
        }
      }
    };
    /** highlightable/clickable during the active one-shot pick
     * (edge-tracing §5): edges never flash (they carry no facing
     * point); the Ø pick wants circles alone — planes would flash and
     * then bounce anyway. Normal measure mode allows everything. */
    const pickAllows = (kind: 'edge' | 'circle' | 'plane' | 'path'): boolean => {
      const pk = pickKindRef.current;
      if (!pk) return true;
      // the index-angle pick: every solid feature carries a direction to
      // face (a face's normal, a hole's axis, an edge's radial) — only the
      // artwork's strokes don't
      if (pk === 'indexAngle') return kind !== 'path';
      if (kind === 'edge') return false;
      if (pk === 'targetDiameter' || pk === 'wrapDiameter') return kind === 'circle';
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
      const ranked: { entry: SourceOverlay; nearest: NearestFeature }[] = [];
      for (const entry of overlaysRef.current) {
        const nearest = findNearestFeature(entry.data, mx, my, camera, w, h);
        if (
          !nearest ||
          !pickAllows(nearest.kind) ||
          (!edgePickingRef.current && nearest.kind === 'edge')
        ) {
          continue;
        }
        ranked.push({ entry, nearest });
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
        // everything that snapped is hidden behind the surface — the
        // plane under the cursor wins below
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
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, stock.length, 64), stockMat);
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
        const p = anchor.clone().project(camera);
        if (p.z > 1) {
          div.style.display = 'none';
          return;
        }
        div.style.display = '';
        div.style.left = `${((p.x + 1) / 2) * el.clientWidth + 12}px`;
        div.style.top = `${((1 - p.y) / 2) * el.clientHeight - 14}px`;
      };
      const picks = picksFromSelection(opSelectionRef.current, overlaysRef.current);
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
      data: buildFeatureOverlayData(source.features, source.transform),
    }));
    for (const entry of entries) {
      const { data } = entry;
      data.edgeLines.visible = displayLayers.features;
      data.circleLines.visible = displayLayers.features;
      data.holeLines.visible = displayLayers.features;
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
      group.add(data.edgeLines, data.circleLines, data.holeLines, data.pathLines);
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

    // selection highlights (light blue, distinct from the hover tints) and
    // the center-to-center connector when exactly two features are selected
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
          SELECT_COLOR,
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
          new THREE.LineBasicMaterial({ color: SELECT_COLOR, transparent: true, depthTest: false }),
        );
        line.renderOrder = 6;
        group.add(line);
        selObjects.push(line);
      }
    }
    const picks = picksFromSelection(opSelection, entries);
    if (picks.length === 2) {
      const conn = connectorLine(picks[0], picks[1]);
      group.add(conn);
      selObjects.push(conn);
    }

    overlaysRef.current = entries;
    hoverLineRef.current = hoverLine;

    return () => {
      for (const { data } of entries) {
        for (const l of [data.edgeLines, data.circleLines, data.holeLines, data.pathLines]) {
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
    };
  }, [sources, stock, displayLayers.features, opSelection, selectedObjectId]);

  // toolpath preview: feed/rapid polylines straight from the Move[] IR
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group || !previewMoves || !displayLayers.paths) return;
    const segs = movesToSegments(previewMoves, stock);
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
    // feed cuts: amber. Rapids: RED — air moves unmistakable at a glance
    // (Alice's 2026-10-26 ask: diagnose travel collisions by eye)
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
      48,
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