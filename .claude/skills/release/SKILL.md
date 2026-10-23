---
name: release
description: Cut and publish a simple.cam release. Use when Alice says "push a release", "cut a release", "ship a release", or "release the build" — that phrase means the full procedure: version bump, commit + tag + push, GitHub Release with the prebuilt web zip, GitHub Pages redeploy, and memory update.
---

# Releasing simple.cam

Alice's phrase "push a release" means ALL of the steps below. None are
optional except where marked. Work top to bottom; a step that fails
stops the release — fix it before continuing.

## Standing rules

- Git identity: **alice@discordia.org.uk only** — never the Red Hat
  address. Check `git config user.email` before the first commit.
- Commit messages end with the Claude Code co-author attribution line
  given in the session reminder.
- The release number follows the existing pattern: `1.0.0-beta.N`
  (see `git tag -l`). If the next number is ambiguous (a feature batch
  vs. a single fix), ask Alice.
- Version bumps get their own commit, `Bump version to <version>`,
  matching the existing history.
- If Alice names a specific piece of work that isn't committed yet,
  commit that FIRST with a descriptive message, then do the bump.

## Procedure

1. **Preflight** — `git status --short` must be clean (allow
   untracked scratch files, but nothing that belongs in the release).
   Confirm with Alice what's shipping if the working tree isn't at a
   natural stopping point. Run `npm run build` once to prove the tree
   builds before bumping anything. (If the runner agent is asked to do
   this, note it has previously flaked by dumping the full build log
   past its output limit — just run the build inline if it fails.)

2. **Bump** — edit `"version"` in package.json to the new number.

3. **Build AFTER the bump** — `npm run build`. The about box shows the
   version from package.json via the `__APP_VERSION__` vite define, so
   a dist built before the bump reports the old release. Never zip a
   stale dist.

4. **Commit + tag + push** —
   ```
   git add package.json
   git commit -m "Bump version to <version> …"
   git push
   git tag v<version>
   git push origin v<version>
   ```

5. **Package the web zip** — in a temp dir (NOT the repo):
   - folder `Simple.CAM-v<version>/` containing `dist/index.html`,
     `dist/assets/`, and a `README.txt` written from the template
     below with the version and URLs substituted;
   - `zip -r Simple.CAM-v<version>-web.zip Simple.CAM-v<version>`.

6. **GitHub Release** —
   ```
   gh release create v<version> /path/to/Simple.CAM-v<version>-web.zip \
     --title "v<version>" --notes "<notes>"
   ```
   Notes: bullet the user-visible changes since the previous release
   (skim `git log <prev-tag>..HEAD`), then the standing paragraph
   about the prebuilt zip (no npm needed, unzip + any static server,
   see README.txt inside) and the hosted copy URL. End release notes
   with the generated-with line from the session reminder.

7. **Redeploy GitHub Pages** — the hosted copy at
   https://amethystalice23.github.io/Simple.CAM/ does NOT auto-update;
   it serves the `gh-pages` branch and only a fresh push changes it.
   Orphan-branch deploy so main's tree is never touched:
   ```
   TMP=$(mktemp -d) && cd "$TMP"
   git init -q -b gh-pages
   git config user.email alice@discordia.org.uk
   git config user.name "Alice"
   cp -r <repo>/dist/* .
   cp <repo>/LICENSE .
   touch .nojekyll        # keep Jekyll off the ES-module assets
   git add -A
   git commit -m "Deploy v<version> to GitHub Pages"
   git remote add origin git@github.com:amethystalice23/Simple.CAM.git
   git push origin gh-pages:gh-pages    # force if it complains
   ```
   Pages is already enabled and pointed at `gh-pages`/`/` — do NOT
   POST the pages config again (it 409s).

8. **Verify** — `curl -s https://amethystalice23.github.io/Simple.CAM/`
   returns 200 and references the NEW hashed asset filename from
   dist/index.html; the asset URL itself returns 200. Then check the
   release page lists the zip.

9. **Memory** — update the `phase1-resume-state` memory with a short
   "Released as v<version>" entry (commits, headline changes, tag
   pushed), and update the version hook line in MEMORY.md.

## README.txt template

```
Simple.CAM v<version> — prebuilt web package
================================================

Open-source CAM for the Carvera CNC. This is the finished build:
no npm, no Node.js, nothing to install.

RUNNING IT
----------
The app is a web page, and browsers do not let a page run modules
straight from a double-clicked file. Pick whichever of these is
easiest — any of them takes under a minute:

  * Python (most systems have it):
        unzip, then in this folder run:  python -m http.server
        open http://localhost:8000 in a browser

  * VS Code: install the "Live Server" extension, right-click
    index.html, "Open with Live Server".

  * Any other static file server pointed at this folder works too.

USING IT
--------
Drag an STL onto the page (or a saved .cam.json job, or an SVG for
artwork), set up stock and operations, Export g-code, and upload the
.nc to the Carvera Community Controller as usual.

Source code and releases: https://github.com/amethystalice23/Simple.CAM
Hosted copy (nothing to download): https://amethystalice23.github.io/Simple.CAM/

License: MIT — see LICENSE at the repository above.
```