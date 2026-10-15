import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan } from '../core/types';
import type { ModelTransform, Stock } from '../core/types';
import { NavCube } from './navcube';

const D2R = Math.PI / 180;

interface Props {
  geometry: THREE.BufferGeometry | null;
  stock: Stock;
  transform: ModelTransform;
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
export function Viewport({ geometry, stock, transform }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);

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
      const normal = hit(e);
      if (normal) startOrient(normal);
    };
    const onPointerMove = (e: PointerEvent) => {
      renderer.domElement.style.cursor = hit(e) ? 'pointer' : '';
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const stockGroup = new THREE.Group();
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x8a6f4d,
      transparent: true,
      opacity: 0.45,
    });
    let center = new THREE.Vector3();

    if (stock.kind === 'cylinder') {
      const { effectiveRadius: r, crownZ } = stock.calibration;
      const [x0, x1] = originSpan(stock.xOrigin, stock.length);
      const cx = (x0 + x1) / 2;
      // stock surface is at machine Z = crownZ, so the axis sits at crownZ - r
      const axisZ = crownZ - r;

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
  }, [transform, stock]);

  return <div ref={host} className="viewport-canvas" />;
}