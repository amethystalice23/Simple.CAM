# TODO

Deferred items from the 2026-11-15 documentation-session review.
Not ordered; pick up when the docs fan-out is done.

- **App: loading notice during startup restore.** When the last
  session's job carries a large/complex STL, reading it back from
  autosave and reconstructing the state takes a while and currently
  reads as the app being stuck. Pop up a "Loading…" notification at
  startup until restore finishes (Alice, 2026-11-15).
- **App: user-defined materials.** The built-in preset table (Aluminum
  6061, Brass 360, Delrin, Hardwood, Acrylic) is narrower than Makera
  Studio's set, and users who calibrate the perfect speeds for their
  exact material should be able to save their own — like custom
  filament profiles in a slicer — not just pick a broad type
  (Alice, 2026-11-15).
