/**
 * STEP import glue — PURE, three-free: the occt-import-js result → the
 * app's canonical NON-INDEXED triangle soup (the STLLoader/heightmap
 * convention every consumer — detection, slicing, sim — expects), plus
 * a binary-STL encoder so a STEP model saves SELF-CONTAINED in the job
 * file (modelBytes must be STL: the job round-trip re-parses it with
 * STLLoader, and the saved job cuts exactly the tessellation that was
 * previewed).
 *
 * occt-import-js is LGPL-2.1 and stays a separate swappable module per
 * the license policy — nothing vendored here. Facts verified by probe
 * (2026-11-01): OCCT converts the file's declared units TO MILLIMETRES
 * itself (an inch-file 39.37 coordinate returns as 1000, a metre-file
 * 1.0 as 1000) — no unit handling below. ASSEMBLIES: every mesh in the
 * result concatenates into ONE soup — the app has a single model slot;
 * per-solid selection is future work, not a v1 omission.
 */

/** Tessellation quality for ReadStepFile — the ONE knob that controls
 *  circularity (2026-11-01, Alice: "still too coarse on cylinders when
 *  the model is this small… 256 might be acceptable"). angularDeflection
 *  sets segments/rev on cylinder walls; linearDeflection is a bbox-RATIO
 *  (scales with model size — small parts facet worst and it barely
 *  helps). Measured on the Ø12.8 turned piston (probe: the real-file
 *  out-of-round sweep): default(null) = 76 seg/rev ≈ 0.0055 mm
 *  out-of-round; ang 0.1 = 275 seg/rev ≈ 0.0004 mm. Flat faces are
 *  untouched (the 10 mm cube stays 12 triangles at any setting). */
export const STEP_TESSELLATION = { angularDeflection: 0.1 } as const;

export interface OcctMeshResult {
  name?: string;
  attributes: {
    position: { array: number[] | Float32Array };
    normal?: { array: number[] | Float32Array };
  };
  index?: { array: number[] | Uint32Array };
}

export interface OcctStepResult {
  success: boolean;
  meshes?: OcctMeshResult[];
}

/** the app's one canonical model form: non-indexed soup, mm, normals
 *  per vertex (occt's when it has them, computed facet normals where it
 *  doesn't — never fabricated smooth normals on flat faces) */
export interface StepSoup {
  positions: Float32Array;
  normals: Float32Array;
  triangles: number;
}

/** indexed occt mesh data → one non-indexed soup, all meshes
 *  concatenated (assembly solids merge — single model slot). Returns
 *  triangles: 0 on an empty result; THROWS on a failed read so the
 *  drop path can show the honest message. */
export function stepMeshesToSoup(result: OcctStepResult): StepSoup {
  if (!result || result.success !== true) {
    throw new Error('the STEP file did not parse (no readable solid geometry)');
  }
  const meshes = result.meshes ?? [];
  // pass 1: total size
  let tris = 0;
  for (const m of meshes) {
    if (m.index) tris += Math.floor(m.index.array.length / 3);
    else tris += Math.floor(m.attributes.position.array.length / 9);
  }
  const positions = new Float32Array(tris * 9);
  const normals = new Float32Array(tris * 9);
  const faceNormal = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    out: Float32Array, o: number,
  ): void => {
    // normalized (b−a)×(c−a) — STL facet semantics, honest for flat faces
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 0;
      nz = 1; // degenerate triangle: any unit normal keeps the file valid
    }
    out[o] = nx;
    out[o + 1] = ny;
    out[o + 2] = nz;
  };
  let o = 0;
  for (const m of meshes) {
    const pos = m.attributes.position.array;
    const idx = m.index?.array;
    const nrm = m.attributes.normal?.array;
    if (idx) {
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const c0 = idx[t];
        const c1 = idx[t + 1];
        const c2 = idx[t + 2];
        const i0 = c0 * 3;
        const i1 = c1 * 3;
        const i2 = c2 * 3;
        const ax = pos[i0];
        const ay = pos[i0 + 1];
        const az = pos[i0 + 2];
        const bx = pos[i1];
        const by = pos[i1 + 1];
        const bz = pos[i1 + 2];
        const cx = pos[i2];
        const cy = pos[i2 + 1];
        const cz = pos[i2 + 2];
        positions[o] = ax;
        positions[o + 1] = ay;
        positions[o + 2] = az;
        positions[o + 3] = bx;
        positions[o + 4] = by;
        positions[o + 5] = bz;
        positions[o + 6] = cx;
        positions[o + 7] = cy;
        positions[o + 8] = cz;
        if (nrm) {
          for (let k = 0; k < 9; k++) {
            const corner = k < 3 ? c0 : k < 6 ? c1 : c2;
            normals[o + k] = nrm[corner * 3 + (k % 3)];
          }
        } else {
          faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz, normals, o);
        }
        o += 9;
      }
    } else {
      for (let p = 0; p + 8 < pos.length; p += 9) {
        for (let k = 0; k < 9; k++) positions[o + k] = pos[p + k];
        faceNormal(
          pos[p], pos[p + 1], pos[p + 2],
          pos[p + 3], pos[p + 4], pos[p + 5],
          pos[p + 6], pos[p + 7], pos[p + 8],
          normals, o,
        );
        o += 9;
      }
    }
  }
  return { positions, normals, triangles: tris };
}

/**
 * soup → binary STL bytes (little-endian, the format the job file
 * embeds and STLLoader re-parses on load). The 80-byte header carries a
 * marker so a stray .stl from this path is identifiable.
 */
export function encodeBinaryStl(soup: StepSoup): Uint8Array {
  const tris = soup.triangles;
  const out = new Uint8Array(84 + tris * 50);
  const header = 'simple.cam tessellated model — binary STL';
  for (let i = 0; i < Math.min(header.length, 79); i++) out[i] = header.charCodeAt(i);
  const view = new DataView(out.buffer);
  view.setUint32(80, tris, true);
  let o = 84;
  for (let t = 0; t < tris; t++) {
    const p = t * 9;
    for (let k = 0; k < 3; k++) {
      view.setFloat32(o, soup.normals[p + k], true);
      o += 4;
    }
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o, soup.positions[p + k], true);
      o += 4;
    }
    view.setUint16(o, 0, true); // attribute byte count
    o += 2;
  }
  return out;
}