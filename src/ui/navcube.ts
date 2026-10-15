import * as THREE from 'three';

/**
 * View-orientation cube (bottom-right corner of the viewport): shows which
 * way the scene is currently being viewed, and its faces can be clicked to
 * snap the camera to that view. Rendered into the corner of the main canvas
 * with a scissor viewport, in machine axes (Z up): FRONT is the −Y side,
 * matching the default camera placement.
 */

export const NAV_SIZE = 96; // CSS px square
const NAV_MARGIN = 12;

/** Faces in BoxGeometry material order: +X, −X, +Y, −Y, +Z, −Z. */
const FACE_DEFS: {
  key: [number, number, number];
  label: string;
  color: number;
  /** which way text should read upright when that face is viewed head-on */
  textUp: [number, number, number];
}[] = [
  { key: [1, 0, 0], label: 'RIGHT', color: 0x6b8aa6, textUp: [0, 0, 1] },
  { key: [-1, 0, 0], label: 'LEFT', color: 0x57708a, textUp: [0, 0, 1] },
  { key: [0, 1, 0], label: 'BACK', color: 0x39597a, textUp: [0, 0, 1] },
  { key: [0, -1, 0], label: 'FRONT', color: 0x4d7ea8, textUp: [0, 0, 1] },
  { key: [0, 0, 1], label: 'TOP', color: 0x6e97c4, textUp: [0, 1, 0] },
  { key: [0, 0, -1], label: 'BOTTOM', color: 0x8a7350, textUp: [0, 1, 0] },
];

/** Transparent label chip: white text with a dark halo, readable on any face. */
function labelTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(16, 20, 26, 0.85)';
  ctx.strokeText(label, 64, 66);
  ctx.fillStyle = '#f2f6f9';
  ctx.fillText(label, 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class NavCube {
  readonly scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1.7, 1.7, 1.7, -1.7, 0.1, 10);
  private cube: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private labelGeo = new THREE.PlaneGeometry(1.3, 1.3);
  private boxGeo = new THREE.BoxGeometry(2, 2, 2);
  private textures: THREE.CanvasTexture[] = [];

  constructor() {
    const materials = FACE_DEFS.map((f) => new THREE.MeshBasicMaterial({ color: f.color }));
    this.cube = new THREE.Mesh(this.boxGeo, materials);
    this.scene.add(this.cube);

    // label chips just outside each face, oriented so text reads upright
    for (const f of FACE_DEFS) {
      const normal = new THREE.Vector3(...f.key);
      const tex = labelTexture(f.label);
      this.textures.push(tex);
      const plane = new THREE.Mesh(this.labelGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      plane.position.copy(normal).multiplyScalar(1.02);
      plane.up.set(...f.textUp);
      plane.lookAt(normal.clone().multiplyScalar(2));
      this.scene.add(plane);
    }

    this.scene.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(this.boxGeo),
        new THREE.LineBasicMaterial({ color: 0x10141a }),
      ),
    );
  }

  /**
   * Point the nav camera along the current view direction. `up` is the main
   * camera's up; when looking straight down/up it degenerates, so fall back
   * to +Y so the TOP face shows BACK at screen-top (the usual convention).
   */
  sync(viewDir: THREE.Vector3, up: THREE.Vector3) {
    const d = viewDir.clone().normalize();
    let u = up.clone();
    if (Math.abs(u.dot(d)) > 0.999) u = new THREE.Vector3(0, 1, 0);
    this.camera.position.copy(d).multiplyScalar(4);
    this.camera.up.copy(u);
    this.camera.lookAt(0, 0, 0);
  }

  /** Render into the bottom-right corner. Caller clears autoClear handling. */
  render(renderer: THREE.WebGLRenderer, w: number, h: number) {
    const x = w - NAV_SIZE - NAV_MARGIN;
    const y = NAV_MARGIN;
    renderer.setViewport(x, y, NAV_SIZE, NAV_SIZE);
    renderer.setScissor(x, y, NAV_SIZE, NAV_SIZE);
    renderer.setScissorTest(true);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }

  /**
   * Corner-viewport hit test in CSS pixels relative to the canvas. Returns
   * the clicked face's outward normal (machine axis), or null off-cube.
   */
  hitTest(px: number, py: number, w: number, h: number): THREE.Vector3 | null {
    const left = w - NAV_SIZE - NAV_MARGIN;
    const top = h - NAV_SIZE - NAV_MARGIN;
    if (px < left || px > left + NAV_SIZE || py < top || py > top + NAV_SIZE) return null;
    const nx = ((px - left) / NAV_SIZE) * 2 - 1;
    const ny = 1 - ((py - top) / NAV_SIZE) * 2;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = this.raycaster.intersectObject(this.cube, false);
    if (hits.length === 0 || !hits[0].face) return null;
    // the cube sits at the origin, unrotated: local face normal == world
    return hits[0].face.normal.clone();
  }

  dispose() {
    this.boxGeo.dispose();
    this.labelGeo.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        const mesh = o as THREE.Mesh;
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else (mesh.material as THREE.Material).dispose();
        if (o instanceof THREE.LineSegments) o.geometry.dispose();
      }
    });
    this.textures.forEach((t) => t.dispose());
  }
}