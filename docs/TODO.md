# TODO

Deferred items from the 2026-11-15 documentation-session review.
Not ordered; pick up when the docs fan-out is done.

- **App: loading notice during startup restore.** When the last
  session's job carries a large/complex STL, reading it back from
  autosave and reconstructing the state takes a while and currently
  reads as the app being stuck. Pop up a "Loading…" notification at
  startup until restore finishes (Alice, 2026-11-15).
