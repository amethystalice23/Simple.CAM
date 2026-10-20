import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan, rotaryCalibrationOf } from '../core/types';
import type { ModelTransform, Move, Primitive, Stock } from '../core/types';
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
  PLANE_SELECT,
  SELECT_COLOR,
  SLICE_COLOR,
  type FeatureOverlayData,
  type MeasurePick,
  type NearestFeature,
} from './featureOverlays';

const D2R = Math.PI / 180;

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
  kind: 'plane' | 'circle' | 'edge';
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
  showFeatures: boolean;
  measureMode: boolean;
  /** false while an op's feature selection is active: straight lines are
   * not operation targets (reserved for the later line-follow engrave) */
  edgePickingEnabled: boolean;
  opSelection: ResolvedSelection[];
  primitives: Primitive[];
  /** generated moves to draw (PLAN.md "Toolpath preview") */
  previewMoves: Move[] | null;
  showPreview: boolean;
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
  showFeatures,
  measureMode,
  edgePickingEnabled,
  opSelection,
  primitives,
  previewMoves,
  showPreview,
  slicePreview,
  viewDatum,
  onToggleSelect,
  onClearSelection,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);
  const featureGroupRef = useRef<THREE.Group | null>(null);
  /** renderer/camera/controls of the scene effect — shared with the
   * slice-plane effect below */
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d21);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.up.set(0, 0, 1); // machine Z is up
    camera.position.set(160, -160, 120);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x10141a); // navcube tile backdrop (main scene has its own bg)
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

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
                : feats?.edges[pick.index]?.id;
          if (id) onToggleSelectRef.current(id);
        }
      }
    };
    /** click target: the nearest feature across ALL sources, else the plane
     * under the face (model or primitive mesh) */
    const measurePickAt = (mx: number, my: number, w: number, h: number): SourcedPick | null => {
      if (measureRef.current) {
        let best: SourcedPick | null = null;
        let bestD = Infinity;
        for (const entry of overlaysRef.current) {
          const nearest = findNearestFeature(entry.data, mx, my, camera, w, h);
          if (!nearest || (!edgePickingRef.current && nearest.kind === 'edge')) continue;
          if (nearest.d < bestD) {
            bestD = nearest.d;
            best = { ...pickFromNearest(entry.data, nearest), sourceId: entry.source.id };
          }
        }
        if (best) return best;
      }
      // plane fallback: raycast the model mesh and the primitive meshes,
      // resolving the hit face through the OWNING source's faceToPlane
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
      // nearest feature across all sources; while editing an op, lines are
      // not targets — don't hover them, so the pointer falls through to the
      // face behind
      let usable: { entry: SourceOverlay; nearest: NearestFeature } | null = null;
      for (const entry of overlays) {
        const nearest = findNearestFeature(
          entry.data,
          e.clientX - rect.left,
          e.clientY - rect.top,
          camera,
          rect.width,
          rect.height,
        );
        if (!nearest || (!edgePickingRef.current && nearest.kind === 'edge')) continue;
        if (!usable || nearest.d < usable.nearest.d) usable = { entry, nearest };
      }
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
      // or primitive) so faces are hoverable like edges and circles are
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

    const onResize = () => {
      if (!el.clientWidth) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
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
    for (const { data } of entries) {
      data.edgeLines.visible = showFeatures;
      data.circleLines.visible = showFeatures;
      data.holeLines.visible = showFeatures;
      group.add(data.edgeLines, data.circleLines, data.holeLines);
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
        for (const l of [data.edgeLines, data.circleLines, data.holeLines]) {
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
  }, [sources, stock, showFeatures, opSelection]);

  // toolpath preview: feed/rapid polylines straight from the Move[] IR
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group || !previewMoves || !showPreview) return;
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
    if (segs.feed.length > 0) objects.push(mk(segs.feed, 0xffd27f, 0.95, 8));
    if (segs.rapid.length > 0) objects.push(mk(segs.rapid, 0x5a86a8, 0.5, 8));
    return () => {
      for (const l of objects) {
        group.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    };
  }, [previewMoves, showPreview, stock]);

  // slice-pocket cut plane (edge-tracing §5): a translucent violet quad at
  // the slice Z + the contour outline there, and a grab pill on the plane's
  // near edge that drags it up/down — the orbit pauses for the drag, the
  // op's start-depth box follows live (one re-slice per frame at most)
  useEffect(() => {
    // machine-space group: the overlay shows where the tool cuts (the
    // datum group rotates the PART, this plane stays machine-horizontal)
    const group = sliceGroupRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!group || !renderer || !camera || !controls) return;
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
      for (const m of mids) {
        const d = new THREE.Vector3(m.x + m.nx * OUT, m.y + m.ny * OUT, z).distanceTo(
          camera.position,
        );
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
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
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
      const depth = Math.max(handle.position.distanceTo(camera.position), 0.01);
      const h = dom.clientHeight || 1;
      const mmPerPx = (2 * Math.tan(((camera.fov / 2) * Math.PI) / 180) * depth) / h;
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
      const indexed = primitiveGeometry(p);
      const geo = indexed.toNonIndexed(); // faces align with the source detection
      indexed.dispose();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xd08850,
          transparent: true,
          opacity: 0.22,
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
        new THREE.LineBasicMaterial({ color: 0xf0a860, depthTest: false }),
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
  }, [primitives, stock]);

  return (
    <>
      <div ref={host} className="viewport-canvas" />
      {label && (
        <div className="measure-label" style={{ left: label.x, top: label.y }}>
          {label.text}
        </div>
      )}
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