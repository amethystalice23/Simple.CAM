# Writing style — simple.cam user docs

Rules for every page under `docs/help/`. Read this before writing or
editing a page. The brand-voice hook checks every write automatically;
this file covers what the hook can't judge.

## Voice

- Audience: makers from a 3D-printing background, new to CNC. They are
  technical people; they just don't know *this* field yet.
- Plain-spoken, practical, warm. Second person ("you"), active voice.
- Sentences under 20 words. Contractions are fine.
- No undefined jargon, no in-jokes, no vague adjectives ("powerful",
  "flexible", "easy"), no business-speak.
- Never condescend. They can read a dial; they just haven't seen this
  dial before.
- New machining term on a page: **link it to the glossary on first
  use** — `[stepover](../glossary.md#step-over)` — and if the sentence
  needs the meaning to land, add a short inline definition too.
- A 3D-printing analogy is welcome when it truly maps; flag it as an
  analogy and drop it when it stops helping.
- Full voice profile: [`brand-guidelines.md`](../../brand-guidelines.md).

## Truth

- Describe what the app does, not what it should do. Sources of truth,
  in order: the UI's own help text (`src/ui/opHelp.ts`), the specs in
  `docs/PLAN.md`, the generator source under `src/cam/`. If sources
  disagree, the code wins — and say so in your report, not the page.
- Never invent a knob, a default, or a number. If you can't verify a
  claim against a source, leave it out and note the gap.

## Linking

- Shared field semantics (depths from the crown, allowances, ⇩ picks):
  link to [`reference/fields.md`](reference/fields.md) — never re-explain
  them on an op page.
- Topics with their own concepts page (feeds and speeds, tabs, the 4th
  axis): link the concept page; the glossary still anchors the first
  use of the term itself.
- Use relative links so they work on GitHub and in the in-app viewer.

## Frontmatter

`title:` only. Example:

    ---
    title: Pocket
    ---

## The ops-page template

Every page in `ops/` follows this skeleton, in this order. Keep the
whole page under ~120 lines; each step gets a figure.

```markdown
---
title: Pocket
---
# Pocket

One line: what it does.

*In 3D printing terms:* the analogy — only if one truly maps.

## What it is
2–3 sentences.

## When you'd use it
3–5 concrete situations as bullets.

## How to use it
Numbered steps, screenshot-anchored (the app's real flow — the op is
added first, then pointed at what it cuts):
1. add the op — `+ Add toolpath`, pick the kind, assign a tool
2. point it at what it cuts (Select features) → Figure 1
3. set the fields that matter (link fields.md for the rest) → Figure 2
4. generate, read the preview → Figure 3
5. the one gotcha users hit

Steps 2–4 carry the three standard figures; steps 1 and 5 are usually
figure-less. Figures sit at the top level of their numbered step. users hit

## Tips & pitfalls
2–4 bullets, each from a verified behavior.
```

## Figures

- Store under `images/<section>/`: `images/ops/`, `images/reference/`…
- Name: `<page>-<nn>-<slug>.png` — `pocket-02-panel.png`. Ops pages
  use the standard set:
  - `<op>-01-select.png` — the selection state: what to click
  - `<op>-02-panel.png` — the op panel, showing the fields the page
    names
  - `<op>-03-preview.png` — the generated [toolpath](glossary.md#toolpath)
    preview in the viewport
  - optional `<op>-04-<slug>.png` — an op-specific state (a toggle on,
    a warning visible)
- Capture at ≥1400 px wide, PNG, the real UI (no mock-ups).
- Figure block format — alt text says what it shows, an italic caption
  under it, and an HTML comment above it with CAPTURE notes (the exact
  UI state to set up; the capture scripts read these):

```markdown
<!-- CAPTURE: pocket op added, panel expanded, End depth picked
     from the floor, stock 20mm box, 2mm-deep demo region -->
![The pocket panel with depths filled from a floor pick](../images/ops/pocket-02-panel.png)
*Figure 2 — End depth is a floor: the tool cuts down to it and stops.*
```

- Caption text must add something the screenshot doesn't show on its
  own (a rule or a gotcha), not just repeat the alt text.

## Callouts

- `**Tip:**` — a nice-to-know.
- `**Caution:**` — a mistake that costs a tool or a part.
- `**3D-printing analogy:**` — the mapping, flagged as one.

## Length

An op page reads in under five minutes. If a section needs more than
a screen, it wants its own concepts page instead.
