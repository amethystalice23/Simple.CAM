# simple.cam

Open-source CAM for the Carvera CNC: TypeScript + React + three.js web app,
G-code out, Carvera Community Controller handles the machine. **Read
`docs/PLAN.md` before doing product/architecture work** — it records verified
machine facts (4th axis ∥ X, G93 rules, A RPM limits), the operation specs,
phase plan, and the license policy.

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build
npm test           # vitest run (generators + post golden files)
```

## Conventions

- Generators emit `Move[]` IR (`src/core/types.ts`) — never gcode strings.
- Post-processor (`src/post/`) is the only code that emits G-code; every
  behavior is pinned by golden-file tests in `src/post/__tests__/golden/`.
- Units: mm, degrees. G93 inverse-time for any move coordinating A with a
  linear axis; **F on every G1 line while G93 is active**; `G92.4 A0` after
  continuous rotation.
- TypeScript strict, no `any`. Every generator gets real numeric tests.
- **License policy (hard rule):** MIT/BSD/BSL/Apache/LGPL only, never paste
  AGPL/GPL code (PrusaSlicer/OrcaSlicer Measure, jscut, Blender CAM, PyCAM,
  the community controller). Reimplement from descriptions; LGPL kernels stay
  separate swappable modules.
- Reference material from the planning phase (binary analysis of
  MakeraStudio proving there is no plugin API) is in `reference/`
  with notes in `docs/analysis notes.md`. Use the local notes kept alongside it.

## Project agents

- `cam-kernel` — CAM math, generators, cylinder-canvas transform (`src/cam`)
- `post-processor` — Carvera dialect, G93/G92.4 rules, golden tests (`src/post`)
- `viewport-ui` — React + three.js front end (`src/ui`)
- 
- `runner` — cheap model (haiku). Mechanical verification only: run the
  unit tests, the build, or golden regeneration and relay the output.
  **Delegate to it whenever you need a test/build result and nothing
  else** — don't run `npm test` inline unless you're mid-debug and need
  the output yourself. It never edits source files.