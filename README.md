# simple.cam

Open-source CAM for the [Carvera CNC](https://www.makera.com/). Load a model,
build toolpath operations, export G-code — the [Carvera Community
Controller](https://github.com/Carvera-Community/Carvera_Controller) handles
the machine.

simple.cam is an independent project, not affiliated with or endorsed by
Makera. G-code output targets the Carvera dialect as observed in Makera
Studio's own exports (see [`examples/`](examples/) and
[docs/makera-dialect.md](docs/makera-dialect.md)).

## What it does

- **3D viewport** (three.js): drag-and-drop STL, stock cylinder/box with
  3-axis/4-axis modes, detected faces/holes/circles to pick from,
  measurement, live toolpath preview.
- **Operations**: face cylinder (the "4D lathe", three pass patterns),
  pocket, profile, drill, chamfer, V-bit threads, spiral-carve grooves,
  slice pockets from the model's cross-section, index ops establishing the
  rotary datum — with per-op feed/speed/clearance overrides.
- **Job persistence**: self-contained `.cam.json` job files (model
  embedded) plus a browser autosave that restores on reload.
- **Post-processor**: Carvera dialect — G93 inverse-time for moves
  coordinating the rotary axis (`F` on every line), `G92.4 A0` wrap, Makera
  `;@MKR` tool tags and comments, `T<n> M6` tool-change blocks with
  `S<rpm> M3` re-fires. Multi-op export with stable controller tool
  numbers. Emission is pinned by golden-file tests.
- **Tool library**: hand-entered tools or a Fusion 360 CSV import;
  per-material Makera preset rows (feeds, depth of cut, spindle RPM)
  selected by the stock material.

Rotary facts baked in: the 4th axis runs parallel to machine X and is
rate-limited (~6.6 RPM sustained), so rotary cuts are timed from that limit
and A accumulates across operations without unwinding between them.

## Status

Working software, first parts cut on hardware (Delrin coupons: facing,
spiral grooves, threads). In active development — see
[docs/PLAN.md](docs/PLAN.md) for the product plan, operation specs, machine
facts, and phases.

```bash
npm install
npm run dev     # http://localhost:5173 — drop an STL and go
npm test        # generator math + post-processor golden files
npm run build
```

## License

MIT — see [LICENSE](LICENSE). Third-party code is limited to
MIT/BSD/BSL/Apache/LGPL components, with the LGPL parts (if used) kept as
separate swappable modules; no AGPL/GPL code is included.