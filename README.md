# simple.cam

Open-source CAM for the Carvera CNC. Load a model, build toolpath
operations, export G-code — the [Carvera Community
Controller](https://github.com/Carvera-Community/Carvera_Controller) handles
the machine.

**Status: Phase 0 scaffold** — see [docs/PLAN.md](docs/PLAN.md) for the full
product plan (operation specs, firmware rules, license policy, phases).

```bash
npm install
npm run dev     # http://localhost:5173 — drop an STL, generate demo facing job
npm test        # generator math + post-processor golden files
npm run build
```

What works today:

- three.js viewport with the stock cylinder (4th axis ∥ X, as mounted)
- STL drag-and-drop
- `faceCylinder` generator: "4D lathe" facing to a diameter with
  roughing/finishing passes, A-wrapped continuous rotation, G93 inverse-time
  feeds, honest RPM-limited time estimates
- Carvera post-processor: G93 rules (F on every line, machine halts otherwise),
  `G92.4 A0` wrapping, prep-assumption header, tool comments
- golden-file tests pinning the emitted G-code

Planned (Phase 1–2): flat 2.5D ops, indexed pockets, edge/hole tracing,
V-bit threads on the 4th axis, wrapped spiral grooves; then 3-axis custom
via opencamlib.

License: MIT (see CLAUDE.md for the strict no-AGPL/GPL-code policy).