# design-capture

Screenshot matrix for the design audit. One command captures a Kiwi surface across
devices, themes and languages, writes PNGs outside the repo, and appends a manifest.
It drives **demo surfaces only**.

Files:

- `capture.mjs` the runner (puppeteer-core from `app/node_modules`, system Chrome).
- `surfaces.json` the inventory: every surface, how to reach it, which devices apply.
- This file.

## Run it

```bash
cd /Users/zaka/Developer/kiwi
node tools/design-capture/capture.mjs --list                         # every surface and its status
node tools/design-capture/capture.mjs --cluster dashboard            # all 17 dashboard pages, all devices
node tools/design-capture/capture.mjs --surface till.bill-sheet --devices iphone --themes dark --langs en
node tools/design-capture/capture.mjs --cluster till --dry           # show what would be captured
```

Clusters: `marketing`, `access`, `dashboard`, `till`, `verticals`, `team`, `kds`, `ordering`.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--cluster <name>` | none | every surface of a cluster |
| `--surface <id[,id]>` | none | one or more surfaces, e.g. `dashboard.orders` |
| `--devices` | surface default | `iphone`, `iphone-se`, `ipad`, `ipad-land`, `desktop` |
| `--themes` | `light,dark` | |
| `--langs` | surface default (`fr,en,ar`; landing has 7) | |
| `--out <dir>` | `/Users/zaka/Developer/kiwi-design-audit/shots` | outside the repo |
| `--force` | off | recapture frames that already exist |
| `--jobs N` | 3 | parallel frames. Use `--jobs 1` on a busy machine |
| `--frame-timeout ms` | 150000 | hard stop for a hung frame |
| `--settle ms` | 600 | wait before motion is frozen and the shot is taken |
| `--offline` | off | also block Google Fonts (fonts then fall back, frames look wrong) |
| `--www <dir>` | temp dir | reuse an already built native bundle |
| `--debug`, `--keep-www` | off | keep the temp bundle |

Output:

```
<out>/<surface>/<device>-<theme>-<lang>.png
<out>/<surface>/<device>-<theme>-<lang>.failed.png   (what the page looked like when a step failed)
<out>/manifest.jsonl
```

Each manifest line: `surface, cluster, device, theme, lang, url, steps[], ok, error,
warnings[], blocked, host, file, title, sha1, ms, timestamp`. `sha1` lets you spot two
surfaces that painted the same pixels (a step that did not take). A frame that already
exists is skipped, a failed frame is retried on the next run, so a cluster run is
resumable: just run the same command again.

## What each device is

| Device | Viewport | How it is rendered |
| --- | --- | --- |
| `iphone` | 440 x 956 @3x, touch, mobile | the native app: bundle from `tools/build-app-www.mjs`, Capacitor and `kiwiShell` stubs, host insets 62 / 34, tab bar 106 |
| `iphone-se` | 375 x 667 @2x | same, insets 20 / 0 / 83 |
| `ipad` | 1032 x 1376 @2x, touch | same bundle, insets 24 / 20, no tab bar (the shell hides it above 900 pt) |
| `ipad-land` | 1376 x 1032 @2x | as `ipad` |
| `desktop` | 1440 x 900 @2x | plain web pages from the repo, no native bundle |

Marketing, ordering and sign-in are not part of the app bundle, so on `iphone` and `ipad`
they render as plain mobile web (same viewport, no native stubs). `fullPage` surfaces
(marketing) are taken at 1x so the PNG stays under Chrome's size limit.

Frames are deterministic after a 600 ms settle: motion is frozen with a stylesheet (zero
duration, one iteration), `prefers-reduced-motion` is emulated as `no-preference` so the
app runs its real animations first. Demo data is not frozen: figures follow the clock.

## Language and theme

Set before the first paint, with `evaluateOnNewDocument`:

| App | Language | Theme |
| --- | --- | --- |
| dashboard | `localStorage.kiwiLang` | `kiwiDashTheme` |
| till | `kiwiCaisseLang` | `kiwiCaisseTheme` (`html[data-caisse-theme]`) |
| team | `kiwi-employee-language:demo` | `kiwiTheme` |
| ordering | `.lang-btn` click (kiwi-order), `orderProLang` | `kiwiTheme` / system |
| marketing | the locale folder (`/fr/`, `/en/`, `/ar/`, `/de/`, ...) | system (`prefers-color-scheme` is emulated) |
| native | also `kiwiNativeLocale` and `kiwiAppRole` | |

After the steps run, the harness reads what actually painted and writes a `warnings`
entry when it disagrees: `dir` must be `rtl` for Arabic, `<html lang>` must match, the
theme attribute must match, and, when no modal scrim is dimming the page, the composite
background luminance must be dark for dark and light for light. Warnings do not fail a
frame; read them in the manifest.

## Safety

Do not weaken these.

- Only the repo is served, on `127.0.0.1`. `/api/*` and `/auth/*` answer `404 {}`.
- Every other request is aborted and counted in `blocked`, including `kiwi-os.com` and
  `*.pages.dev`. Only Google Fonts is let through (static font files, no data) unless `--offline`.
- Only demo surfaces. The real sign-in screen is rendered by calling
  `functions/_middleware.js` with a dummy environment; its form is never submitted.
- Codes: the public demo till codes are read at run time from `assets/pos-dispatch.js` and
  pressed on the on-screen keypad (`demoCode`). The team demo accepts any code
  (`demoPin`). Nothing prints a code, and no step types a code for a real merchant. The
  setup wizard stops before any digit is entered.
- The harness edits no repo file and never runs git.

## Adding a surface

Append an object to `surfaces.json`:

```json
{ "id": "dashboard.my-page", "cluster": "dashboard", "title": "My page",
  "app": "dashboard", "native": true, "entry": "/dashboard.html",
  "devices": ["iphone", "ipad", "desktop"],
  "boot": "dashboard-demo",
  "steps": [ { "do": "nav", "to": "my-nav-key" }, { "do": "waitFor", "selector": ".my-page" } ] }
```

Fields: `id` (`cluster.name`, becomes the folder), `app` (`dashboard`, `caisse`, `serveur`,
`cuisine`, `order`, `orderpro`, `shell`, `static`), `native` (true when the page is in the
app bundle, so phone and iPad get the native look), `entry` (path), `devices`, `langs`
(override the default), `themeFixed` (`"dark"` for screens that are always dark),
`themeCheck:false` (skip the luminance warning), `fullPage`, `localePaths`
(`{lang: path}`), `langQuery` (query parameter that carries the language), `boot`, `steps`,
`status` (`"blocked"` surfaces are listed but skipped), `notes`.

Boots: `dashboard-demo` (first-run wizard, explore the demo, owner lock, skip), `till-demo`
(open the shift and land on the takeaway builder), `none`.

Steps (`{do, ...}`), all accept `optional:true` (skip on failure), `then:ms` (wait after),
`only:{device:[], lang:[], theme:[]}`, and `{lang}` / `{theme}` inside strings:

| `do` | Fields | What it does |
| --- | --- | --- |
| `goto` | `path` | navigate |
| `wait` | `ms` | sleep |
| `waitFor` / `waitGone` | `selector`, `text?`, `timeout?` | wait until a visible match appears / disappears |
| `click` | `selector`, `text?`, `visible?` | JS click on the first match (visible match preferred) |
| `tap` | `selector`, `visible?` | real pointer click at the centre. Use it where a handler listens to pointer events |
| `hover`, `key`, `type` | `selector`, `value` | `type` is for synthetic non-secret text only |
| `eval` | `js`, `expect?` | async snippet in the page; throw to fail |
| `scroll`, `scrollThrough` | `selector?`, `to` | scroll a container; `scrollThrough` wakes lazy content before a full page shot |
| `nav` | `to` | dashboard sidebar entry by `data-nav` or `data-action` |
| `host` | `to` | native host route (tab bar) on phone and iPad |
| `dashEnter` | `stopAtLock?` | enter the dashboard demo; keeps clicking until the screens react |
| `tillLock`, `demoCode`, `demoPin` | `vertical` / `kind` | show the till keypad; press a demo code |
| `setViewport` | `w`, `h` | rotate or resize mid-frame |

`text` is a case-insensitive regex tested against `textContent` / `aria-label`.

To find selectors without guessing, open the page through the same server (a scratch
script that imports `startServer` from `capture.mjs` works) or read the file's `data-action`
and `id` attributes. Run the new surface alone on `desktop`, then check
`manifest.jsonl` for `warnings` and compare `sha1` with its neighbours.

## Known limits

- **Sign-in on the native app** is a Swift screen. Chromium cannot paint it, so
  `access.sign-in` is the web account gate and `access.role-picker` is the shell's web layer.
- **Menu is empty in the dashboard demo** ("Your menu is empty"). The 200-item menu state
  needs a fixture the demo does not ship.
- **Kitchen screen** (`kiwi-cuisine.html`) needs a pairing code; only the pairing pad and a
  synthetic-ticket fixture are captured. Real tickets show in `kds.board` (the till's own screen).
- **Not reachable offline:** Order Pro with a live session, printer pairing, Live Link,
  operator view (needs a real operator session), payments with a terminal.
- **Time of day changes the data.** Demo sales and "open now" states follow the clock, so
  two runs hours apart differ. The harness does not pin the date.
- **Machine load.** Each frame is a full page boot (about 10 s). Three parallel jobs are
  fine on an idle machine; if frames time out, use `--jobs 1`.
- **iPad insets and the iPhone SE tab height** are estimates from `KiwiNativeShell.swift`,
  not measured on a device.
- Frames are single viewport shots (not scrolled) except marketing, which is full page.
