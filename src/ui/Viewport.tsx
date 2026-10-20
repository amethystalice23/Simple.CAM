import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan, rotaryCalibrationOf } from '../core/types';
import type { ModelTransform, Move, Primitive, Stock } from '../core/types';
import { movesToSegments } from './toolpathPreview';
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
  type FeatureOverlayData,
  type MeasurePick,
  type NearestFeature,
} from './featureOverlays';

const D2R = Math.PI / 180;

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
  onToggleSelect,
  onClearSelection,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);
  const featureGroupRef = useRef<THREE.Group | null>(null);
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
    scene.add(stockGroup);

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
    scene.add(model);
    if (geometry) geometry.computeBoundingBox();

    // feature overlay group: children managed by the overlay effect below
    const featureGroup = new THREE.Group();
    scene.add(featureGroup);
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