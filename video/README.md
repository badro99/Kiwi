# video/ — the Kiwi demo film

A 3-minute product film, built the same way the product is: vanilla HTML, CSS
and JS, no framework, no build step, and — for the renderer — no npm packages
either.

| File | What it is |
|---|---|
| `film.html` | The film. Scenes, layout, motion. Edit this to change the cut. |
| `render.mjs` | Renders `film.html` to an MP4, frame by frame. |
| `shoot.mjs` | Captures the product stills the film embeds. |
| `SCRIPT.md` | The timed voiceover script, matched to the scene boundaries. |
| `stills/` | Real screenshots of the real app. Regenerate with `shoot.mjs`. |
| `out/` | Rendered masters. Git-ignored — these are build artefacts. |

## Why not Remotion / After Effects / an AI video tool

The film needs to show *this* product in *this* design system. Rebuilding the
brand inside another tool means maintaining it twice, and it drifts the first
time a token changes. Building the film in the same HTML and CSS as the product
means the atlas green, Instrument Serif and the liquid-lens easing are the real
ones, by construction. AI video generation was the wrong tool for the opposite
reason — it cannot show a specific product at all.

## How it renders

`render.mjs` launches the system Chrome over the DevTools Protocol, calls the
page's `window.seek(t)` once per frame, screenshots, and pipes the PNG straight
into ffmpeg's stdin. No frames ever hit the disk.

**The one rule `film.html` must obey: every visual is a pure function of `t`.**
No CSS transitions, no CSS animations, no `requestAnimationFrame`, no
`Date.now()`. Capture runs far slower than real time, so anything that animates
itself will tear across frames. Motion is computed in `seek()` and written to
inline styles.

The page signals `window.__filmReady` once fonts and images are in. Readiness
deliberately does **not** block on `img.decode()` — in a backgrounded tab that
promise never settles at all, which would hang the renderer forever.

## Usage

Serve the repo (the `kiwi-static` launch config, port 4178), then:

```bash
node video/shoot.mjs --base http://localhost:4178 --out video/stills
```

```bash
node video/render.mjs --url "http://localhost:4178/video/film.html" --out video/out/kiwi-demo-3min.mp4 --duration 180 --fps 30 --crf 18
```

Roughly 12 minutes for the full master. For a fast check of the whole film,
render at `--fps 1` — 180 frames in about 25 seconds, one per second of runtime,
which is enough to catch layout breakage in every scene.

To watch it play in a normal browser without rendering anything:
`http://localhost:4178/video/film.html?play`

## Editing the cut

- **Traction beat** — `CONFIG.traction` at the top of `film.html`.
- **Timings** — the `SCENES` table. `at` and `dur` must tile 0→180 exactly.
- **The montage** — the `TRADES` array. Every `note` must describe what that
  till actually renders; they are checked against `stills/`, not invented.
- **A scene's motion** — its entry in `DRAW`, which receives local scene time.

`shoot.mjs` drives the app the way a demo viewer does: it boots each register
through the public `KiwiPosDispatch.unlockById()` API and uses the lock screen's
own no-code "Entrer dans la démo" bypass. It never types a PIN. It also sets
`kiwiSkipOnboard` (not `kiwiOnboarded` — that one marks the venue configured and
throws away the Café Atlas demo data).
