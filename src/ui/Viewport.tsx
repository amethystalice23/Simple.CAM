import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan } from '../core/types';
import type { ModelTransform, Primitive, Stock } from '../core/types';
import type { DetectedFeatures } from '../cam/features';
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
  SELECT_COLOR,
  type FeatureOverlayData,
  type MeasurePick,
} from './featureOverlays';

const D2R = Math.PI / 180;

/** A selected feature resolved to its kind and index for highlighting. */
export interface ResolvedSelection {
  kind: 'plane' | 'circle' | 'edge';
  index: number;
}

/** Measurement picks for the selected features (selection = measurement). */
function picksFromSelection(
  features: DetectedFeatures,
  data: FeatureOverlayData | null,
  transform: ModelTransform,
  sel: ResolvedSelection[],
): MeasurePick[] {
  if (!data) return [];
  return sel.map((s): MeasurePick => {
    if (s.kind === 'plane') return planePick(features, transform, s.index);
    if (s.kind === 'circle') {
      return {
        kind: 'circle',
        index: s.index,
        center: data.circleCenter[s.index].clone(),
        color: SELECT_COLOR,
        text: data.circleText[s.index],
      };
    }
    return {
      kind: 'edge',
      index: s.index,
      center: data.edgeMid[s.index].clone(),
      color: SELECT_COLOR,
      text: data.edgeText[s.index],
    };
  });
}

interface Props {
  geometry: THREE.BufferGeometry | null;
  stock: Stock;
  transform: ModelTransform;
  features: DetectedFeatures | null;
  showFeatures: boolean;
  measureMode: boolean;
  opSelection: ResolvedSelection[];
  primitives: Primitive[];
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
  features,
  showFeatures,
  measureMode,
  opSelection,
  primitives,
  onToggleSelect,
  onClearSelection,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);
  const featureGroupRef = useRef<THREE.Group | null>(null);
  const overlayRef = useRef<FeatureOverlayData | null>(null);
  const hoverLineRef = useRef<THREE.LineSegments | null>(null);
  const measureRef = useRef(measureMode);
  measureRef.current = measureMode;
  const onToggleSelectRef = useRef(onToggleSelect);
  onToggleSelectRef.current = onToggleSelect;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  const opSelectionRef = useRef(opSelection);
  opSelectionRef.current = opSelection;
  const featuresRef = useRef(features);
  featuresRef.current = features;
  const transformRef = useRef(transform);
  transformRef.current = transform;
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
          const feats = featuresRef.current;
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
    /** click target: nearest feature, else the plane under the face */
    const measurePickAt = (mx: number, my: number, w: number, h: number): MeasurePick | null => {
      const overlay = overlayRef.current;
      if (measureRef.current && overlay) {
        const nearest = findNearestFeature(overlay, mx, my, camera, w, h);
        if (nearest) return pickFromNearest(overlay, nearest);
      }
      const feats = featuresRef.current;
      const model = modelRef.current;
      if (feats && model && model.visible) {
        raycaster.setFromCamera(
          new THREE.Vector2((mx / w) * 2 - 1, -(my / h) * 2 + 1),
          camera,
        );
        const hits = raycaster.intersectObject(model, false);
        const found = hits.find((hh) => {
          const fi = hh.faceIndex ?? -1;
          return fi >= 0 && fi < feats.faceToPlane.length && feats.faceToPlane[fi] >= 0;
        });
        if (found && found.faceIndex !== undefined && found.faceIndex !== null) {
          return planePick(feats, transformRef.current, feats.faceToPlane[found.faceIndex]);
        }
      }
      return null;
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const overNav = hit(e);
      renderer.domElement.style.cursor = overNav ? 'pointer' : '';
      const hoverLine = hoverLineRef.current;
      const overlay = overlayRef.current;
      if (overNav || !measureRef.current || !hoverLine || !overlay) {
        if (hoverLine) hoverLine.visible = false;
        setLabel(null);
        return;
      }
      const nearest = findNearestFeature(
        overlay,
        e.clientX - rect.left,
        e.clientY - rect.top,
        camera,
        rect.width,
        rect.height,
      );
      if (nearest) {
        hoverLine.geometry.dispose();
        hoverLine.geometry = hoverLineGeometry(overlay, nearest.kind, nearest.index);
        (hoverLine.material as THREE.LineBasicMaterial).color.setHex(nearest.color);
        hoverLine.visible = true;
        setLabel({ text: nearest.text, x: nearest.anchor.x, y: nearest.anchor.y });
      } else {
        hoverLine.visible = false;
        setLabel(null);
      }
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
      const { effectiveRadius: r, axisZ } = stock.calibration;
      const [x0, x1] = originSpan(stock.xOrigin, stock.length);
      const cx = (x0 + x1) / 2;
      // Z0 for 4th-axis work is the stock center (the axis datum), so the
      // cylinder is drawn centered on machine Z = axisZ
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, stock.length, 64), stockMat);
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
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(stock.sizeX, stock.sizeY, stock.sizeZ), stockMat);
      const [x0, x1] = originSpan(stock.origin.x, stock.sizeX);
      const [y0, y1] = originSpan(stock.origin.y, stock.sizeY);
      const [z0, z1] = originSpan(stock.origin.z, stock.sizeZ);
      box.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      stockGroup.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(box), 0x6b5842));
      stockGroup.add(box);
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
      const feats = featuresRef.current;
      const picks = feats
        ? picksFromSelection(feats, overlayRef.current, transformRef.current, opSelectionRef.current)
        : [];
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
      overlayRef.current = null;
      hoverLineRef.current = null;
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

  // Feature overlays: static outlines + the measure-mode hover line. Runs
  // after the scene effect (which owns the feature group) and re-runs when
  // the stock rebuilds the scene.
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group) return;
    if (!features || !geometry) {
      overlayRef.current = null;
      hoverLineRef.current = null;
      setLabel(null);
      return;
    }

    const data = buildFeatureOverlayData(features, transform);
    data.edgeLines.visible = showFeatures;
    data.circleLines.visible = showFeatures;
    data.holeLines.visible = showFeatures;
    group.add(data.edgeLines, data.circleLines, data.holeLines);

    const hoverLine = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false }),
    );
    hoverLine.renderOrder = 5;
    hoverLine.visible = false;
    group.add(hoverLine);

    // selection highlights (light blue, distinct from the hover tints) and
    // the center-to-center connector when exactly two features are selected
    const selObjects: THREE.Object3D[] = [];
    for (const sel of opSelection) {
      if (sel.kind === 'plane') {
        const mesh = planeHighlightMesh(geometry, features, transform, sel.index, SELECT_COLOR);
        if (mesh) {
          mesh.renderOrder = 7;
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
          group.add(mesh);
          selObjects.push(mesh);
        }
      } else {
        const line = new THREE.LineSegments(
          hoverLineGeometry(data, sel.kind, sel.index),
          new THREE.LineBasicMaterial({ color: SELECT_COLOR, transparent: true, depthTest: false }),
        );
        line.renderOrder = 6;
        group.add(line);
        selObjects.push(line);
      }
    }
    const picks = picksFromSelection(features, data, transform, opSelection);
    if (picks.length === 2) {
      const conn = connectorLine(picks[0], picks[1]);
      group.add(conn);
      selObjects.push(conn);
    }

    overlayRef.current = data;
    hoverLineRef.current = hoverLine;

    return () => {
      for (const l of [data.edgeLines, data.circleLines, data.holeLines]) {
        group.remove(l);
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      group.remove(hoverLine);
      hoverLine.geometry.dispose();
      (hoverLine.material as THREE.Material).dispose();
      for (const o of selObjects) {
        group.remove(o);
        const obj = o as THREE.Mesh;
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material;
        mat.dispose();
      }
      overlayRef.current = null;
      hoverLineRef.current = null;
    };
  }, [features, transform, stock, showFeatures, opSelection, geometry]);

  // user primitives (roughing volumes, tabs): translucent orange volumes
  useEffect(() => {
    const group = featureGroupRef.current;
    if (!group) return;
    const objs: THREE.Mesh[] = [];
    for (const p of primitives) {
      const geo =
        p.kind === 'cylinder'
          ? new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, p.length, 48)
          : new THREE.BoxGeometry(p.size.x, p.size.y, p.size.z);
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
      const t = p.transform;
      mesh.rotation.set(
        t.rotationDeg.x * D2R,
        t.rotationDeg.y * D2R,
        t.rotationDeg.z * D2R,
      );
      if (p.kind === 'cylinder') mesh.rotateZ(Math.PI / 2); // geometry Y axis → machine X
      mesh.position.set(t.position.x, t.position.y, t.position.z);
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
          key={`${s.kind}:${s.index}`}
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