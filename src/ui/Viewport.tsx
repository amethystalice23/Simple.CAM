import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Props {
  geometry: THREE.BufferGeometry | null;
  /** stock cylinder along X: radius/length in mm */
  cylinder: { radius: number; length: number };
}

/**
 * Minimal three.js viewport: grid, stock cylinder (axis = X, matching the
 * machine's 4th-axis mounting), and the loaded model. Toolpath preview
 * (wrapped U,V,Z moves mapped back onto the cylinder) lands in Phase 1.
 */
export function Viewport({ geometry, cylinder }: Props) {
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
    controls.target.set(cylinder.length / 2, 0, 0);

    // stock cylinder, axis along machine X
    const stockGroup = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(cylinder.radius, cylinder.radius, cylinder.length, 64),
      new THREE.MeshStandardMaterial({ color: 0x8a6f4d, transparent: true, opacity: 0.45 }),
    );
    cyl.rotation.z = Math.PI / 2; // default Y-axis cylinder → X-axis
    stockGroup.add(cyl);
    const axisLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(cylinder.length, 0, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x44aa44 }),
    );
    stockGroup.add(axisLine);
    scene.add(stockGroup);
    scene.add(new THREE.GridHelper(400, 40, 0x2b2f35, 0x22262a));

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
  }, [cylinder.length, cylinder.radius]);

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