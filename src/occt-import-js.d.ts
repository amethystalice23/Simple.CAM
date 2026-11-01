/**
 * occt-import-js (LGPL-2.1 — the Open CASCADE WASM kernel wrapper) is a
 * SEPARATE SWAPPABLE MODULE per the license policy, like the clipper
 * lib. The package ships no TypeScript types; these declarations cover
 * only the surface the app uses. Facts verified by probe, 2026-11-01
 * (probes/probe-step.mjs): ReadStepFile converts the file's declared
 * units TO MILLIMETRES itself; the result is per-mesh INDEXED geometry
 * (position [+normal], index triplets) with brep face ranges.
 */
declare module 'occt-import-js' {
  interface OcctMeshResult {
    name?: string;
    attributes: {
      position: { array: number[] | Float32Array };
      normal?: { array: number[] | Float32Array };
    };
    index?: { array: number[] | Uint32Array };
  }
  interface OcctStepResult {
    success: boolean;
    meshes?: OcctMeshResult[];
  }
  const occtimportjs: (moduleArg?: {
    /** emscripten hook: where to fetch the 7.6 MB .wasm from
     *  (the vite ?url asset — never the bundler's default guess) */
    locateFile?: (path: string, scriptDirectory: string) => string;
  }) => Promise<{
    ReadStepFile: (content: Uint8Array, params: unknown) => OcctStepResult;
  }>;
  export default occtimportjs;
}

declare module 'occt-import-js/dist/occt-import-js.wasm?url' {
  const wasmUrl: string;
  export default wasmUrl;
}