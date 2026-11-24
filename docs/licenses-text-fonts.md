# Vendored text fonts — provenance and licenses

`src/core/textFonts.ts` is generated data: single-line (stroke) fonts used by
`src/core/textLayout.ts` for text primitives, engraving labels, and coupon
text. No fills anywhere. Regenerate from the source data rather than
hand-editing; the generator and its inputs live outside the repo (see header
comment in `textFonts.ts`).

## Source chain

1. **Hershey font data — public domain.** The glyph strokes were digitized by
   Dr. A. V. Hershey while working at the U.S. National Bureau of Standards
   (1960s), a US Government work. The widely circulated 1990s Usenet
   distribution states the data is public domain outside the NTIS distribution
   format, with one requirement: this acknowledgement must accompany the data:

   > The Hershey Fonts were originally created by Dr. A. V. Hershey while
   > working at the U. S. National Bureau of Standards.
   >
   > The format of the Font data in this distribution was originally created
   > by James Hurt, Cognition, Inc., Billerica, MA.

   That acknowledgement appears in the header of `src/core/textFonts.ts`.

2. **`hersheytext.json` — npm package `hersheytext@2.0.0`, MIT.**
   Source: https://github.com/techninja/hersheytextjs
   License file text (MIT), fetched 2026-11-24:

   > The MIT License (MIT)
   >
   > Copyright (c) 2014 James T
   >
   > Permission is hereby granted, free of charge, to any person obtaining a
   > copy of this software and associated documentation files (the "Software"),
   > to deal in the Software without restriction, including without limitation
   > the rights to use, copy, modify, merge, publish, distribute, sublicense,
   > and/or sell copies of the Software, and to permit persons to whom the
   > Software is furnished to do so, subject to the following conditions:
   >
   > The above copyright notice and this permission notice shall be included in
   > all copies or substantial portions of the Software.
   >
   > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
   > THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
   > FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
   > DEALINGS IN THE SOFTWARE.

   Both the package license (MIT for the JSON packaging) and the underlying
   Hershey data (public domain) are clean under simple.cam's license policy.
   No GPL/AGPL sources were used.

3. **`°` (U+00B0 degree sign) — original to simple.cam.** The Hershey 95-char
   ASCII set has no degree sign, so a 16-segment circle near cap height was
   authored for this module. Not Hershey data; same license as simple.cam.

## Fonts vendored

| id               | source key    | source name        | style                        |
|------------------|---------------|--------------------|------------------------------|
| `sans`           | `futural`     | Sans 1-stroke      | clean engineering sans       |
| `sans-bold`      | `futuram`     | Sans medium        | heavier sans                 |
| `serif`          | `timesr`      | Serif medium       | Times-like serif             |
| `script`         | `scriptc`     | Script medium      | connected cursive            |
| `gothic-english` | `gothiceng`   | Gothic English     | decorative blackletter       |

## Data conventions baked into the vendored file

- Coordinates in font units, x rightward, y **downward**; cap-top line at
  y = 1, baseline at y = 22, cap height 21 units (verified per font via `H`).
- Advance widths are 2 × the source's `o` field: the source stores advances at
  half the path coordinate scale, and 2× yields correct non-overlapping
  spacing (verified: zero ink-overlap glyphs in the sans/serif/gothic faces).
- Space advance 16 units, grounded on the original Roman Simplex (rowmans JHF)
  space glyph (left −8, right 8), same unit scale.
- Coverage per font: printable ASCII 33–126 (the source's 95-glyph set, with
  the DEL box-cursor glyph at 127 dropped) plus the synthetic `°`.
- Known quirks inherited from the source data: the hyphen-minus `-` is drawn
  as a long dash in a wide (~1.24 cap-height) advance slot, and script faces
  have swashes that overhang neighbouring advance slots.

## Firmware/generator note

None of this bakes in any firmware assumption; it is pure layout data. (Per
the definition of done: no firmware assumption to record.)
