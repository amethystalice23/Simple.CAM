import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { originSpan } from '../core/types';
import type { Stock } from '../core/types';

interface Props {
  geometry: THREE.BufferGeometry | null;
  stock: Stock;
}

/**
 * Minimal three.js viewport: grid, stock, and the loaded model.
 * Scene axes map to machine axes: three.js X = machine X, three.js Y =
 * machine Z (up), three.js Z = machine Y. The origin triad marks machine
 * (0,0,0). Toolpath preview (wrapped U,V,Z moves mapped back onto the
 * cylinder) lands in Phase 1.
 */
export function Viewport({ geometry, stock }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d21);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(180, 120, 180);

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
    // center of the stock in scene coords, for the orbit target
    let center = new THREE.Vector3(0, 0, 0);

    if (stock.kind === 'cylinder') {
      const { effectiveRadius: r, crownZ } = stock.calibration;
      const [x0, x1] = originSpan(stock.xOrigin, stock.length);
      const cx = (x0 + x1) / 2;
      // stock surface sits at machine Z = crownZ, so the axis is at crownZ - r
      const axisY = crownZ - r;

      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, stock.length, 64), stockMat);
      cyl.rotation.z = Math.PI / 2; // default Y-axis cylinder → machine X
      cyl.position.set(cx, axisY, 0);
      stockGroup.add(cyl);
      stockGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x0, axisY, 0),
            new THREE.Vector3(x1, axisY, 0),
          ]),
          new THREE.LineBasicMaterial({ color: 0x44aa44 }),
        ),
      );
      center.set(cx, axisY, 0);
    } else {
      const [x0, x1] = originSpan(stock.origin.x, stock.sizeX);
      const [y0, y1] = originSpan(stock.origin.y, stock.sizeY);
      const [z0, z1] = originSpan(stock.origin.z, stock.sizeZ);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(stock.sizeX, stock.sizeZ, stock.sizeY),
        stockMat,
      );
      box.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
      stockGroup.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(box), 0x6b5842));
      stockGroup.add(box);
      center.copy(box.position);
    }
    scene.add(stockGroup);
    scene.add(new THREE.GridHelper(400, 40, 0x2b2f35, 0x22262a));
    scene.add(new THREE.AxesHelper(14)); // machine origin (0,0,0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(150, 300, 150);
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
    // model geometry swaps are handled by the component identity below
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

  return <div ref={host} className="viewport-canvas" />;
}