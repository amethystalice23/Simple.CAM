import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan } from '../core/types';
import type { ModelTransform, Stock } from '../core/types';

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
    el.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);

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
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
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