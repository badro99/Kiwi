# HANDOFF · Making Kiwi videos with HyperFrames

Written 2026-10-26 for a fresh Claude session that has to produce a Kiwi marketing video
(reel, ad, product demo) from start to finished MP4. Read it top to bottom once, then
keep §6 (the rules) and §9 (the checklist) open while you work.

---

## 1. The tool

**HyperFrames** (HeyGen, Apache-2.0, `npm i hyperframes`, latest checked 0.8.200,
source: github.com/heygen-com/hyperframes) is the "open-source After Effects" we use.
A video is an HTML page: elements carry `data-start` / `data-duration`, animation runs
on a seekable timeline (GSAP or CSS), and the CLI drives headless Chrome to capture
every frame and FFmpeg to encode. It has a Studio (browser timeline preview), lint,
a `check` gate with snapshots, a local motion catalog, and local rendering.

Why it fits Kiwi: our product **is** HTML. The real caisse, dashboard and serveur
screens can be shown in the film as themselves, not redrawn.

The Claude skills are already installed in `~/.claude/skills/`:

| Skill | Use it for |
| --- | --- |
| `hyperframes` | **Entry point. Invoke it first.** Routes to the right workflow. |
| `hyperframes-core` | The authoring contract: timing attributes, clips, tracks, sub-compositions. Read before writing composition HTML. |
| `hyperframes-cli` | init, lint, check, snapshot, preview, render, timeline, history. |
| `hyperframes-animation` / `hyperframes-keyframes` | Motion, camera moves, zooms, transitions. |
| `hyperframes-creative` | Concept, palette, type, beat planning. |
| `hyperframes-audio` | Fades, ducking under voice-over, mixing. |
| `hyperframes-registry` | Ready-made effects and transitions. Search here before hand-building one. |
| `product-launch-video` | The workflow that usually matches a Kiwi product video. |
| `media-use` | Sourcing, grading and treating footage and images. |

Machine check (2026-10-26): Node v24.18 (needs 22+), FFmpeg 8.1.1, about 87 GB free.

---

## 2. What happened before (so you don't repeat it)

Eight reels were made between 2026-10-11 and 2026-10-12. **The project folders are no
longer on this Mac** (`~/Movies` now only has `TV` and `TapRecord`; nothing in the
`trwork-archive` repo either). Ask the owner whether they kept copies. If not, start a
fresh project and reuse the lessons below, which are the valuable part.

| Version | How it was built | Verdict |
| --- | --- | --- |
| v1 | EffectCraft, 36 s, 30 fps | "Not bad at all" |
| v2 | HyperFrames 0.8.147, frames as HTML compositions, numpy synth score, 60 fps | Base project |
| v3 | One hand-built `film.html` with a pure `seek(t)` function, puppeteer render, motion blur by blending 8 to 48 subframes per frame | Smoother motion |
| v7 | The owner's own After Effects cut with **hand-drawn app UI** | **Rejected**: drawn UI "downgrades the looks of our apps" |
| v8 | **Real app screens**: static snapshots of live screens (demo tenant Café Atlas, clock frozen), loaded as same-origin iframes; the film only moves a camera and writes numbers into them | The direction to keep |

The v8 story, which still works as a default spine: one order (Tajine kefta + Thé à la
menthe, 210 MAD) at the caisse, then it lands on the dashboard, then stock, margin,
Kiwi IQ, then the same account on iPad, Mac and phone, then the end card.

The owner's quality benchmark: an "engraving-style" Claude ad
(prompt-motion.com/lexnlin-038035). What they liked in it: **one persistent anchor
across fast cuts**, letter-by-letter word morphs, strobes inside a fixed drawn ring,
hand-painted marks over imagery. Kiwi's anchor is the **diamond dot over the i** in
the logo (`assets/kiwi-newlogo.svg`).

On 2026-10-19 the owner also brought two AI-generated clips (Seedance via Dola AI,
15 s, 720×1280): a night-medina mood piece and a kaftan-boutique sale. Review: the
boutique one carries the story, but both had a "Dola AI" watermark, made-up text on
the tablet screen, a tablet that turns from an iPad into an Android between shots,
and no Kiwi branding. Regeneration prompts were written that ask for a plain white
tablet screen so the real caisse can be laid over it (see §5.3).

---

## 3. Setup (about 10 minutes)

**Where the project lives.** Never inside the Kiwi repo, never in iCloud. Use
`~/Developer/kiwi-video/<film-name>/`. This Mac has 256 GB: when a film is finished,
push the project (no renders, no `node_modules`) to a private GitHub repo, attach the
final MP4s as release assets, check that the upload matches, then delete the local
renders and frame caches.

```bash
mkdir -p ~/Developer/kiwi-video && cd ~/Developer/kiwi-video
npx hyperframes init <film-name>
cd <film-name>
npx hyperframes doctor
```

Then, inside the session: invoke the `hyperframes` skill and let it route (usually
`/product-launch-video` or `/general-video`). Follow its steps; they include a short
intent interview, a storyboard, and preview before render.

**Brand inputs to copy into the project** (copy, don't link, so the project is
self-contained):

- Logo: `assets/kiwi-newlogo.svg`, `kiwi-newlogo-dark.svg`, `kiwi-newlogo-inverse.svg`
- Favicon mark: `assets/kiwi-favicon-new.svg`
- Mascot: `assets/mascot/01-neutral` … `06-celebrate` (PNG with alpha). Rules in
  `docs/specs/kiwi-character.md`: never mirror, stretch, recolour or crop the leaf and
  feet; never next to money amounts or receipts.
- Tokens: `assets/tokens.css` (colours below)
- Icons: `assets/icons/material/` only

---

## 4. Capturing the real app

The owner's hardest rule: **the app on screen is the real app.** Two ways to get it:

1. **Snapshots (best for animation).** Serve the repo locally (`npm run dev`, which is
   `wrangler pages dev .`), open the screen on the demo account, freeze the clock
   (v8 used 2026-10-12 21:14 Casablanca; Morocco is UTC+0 since 20 Sept 2026), strip
   scripts and motion, and save a static HTML copy per screen into the project's
   `snaps/`. Mount them as same-origin iframes and animate a camera over them.
   You can then write new numbers into them with JS (a ticket total counting up,
   a KPI changing) without the app's pollers fighting you.
2. **Screen recordings (best for real interactions).** Drive the screen with the
   in-app browser or Playwright, record, and place the clip as footage.

Surfaces worth filming: `kiwi-caisse.html` (the till), `dashboard.html`,
`kiwi-serveur.html` (waiter phone), `kiwi-cuisine.html` (kitchen), `kiwi-order.html`
(customer QR order). Shoot French screens and put English lines over them unless the
owner asks otherwise.

**Data:** demo data only. Café Atlas is the demo tenant. Amira Cafe is the owner's
test account but its figures are real stored records, so prefer the demo. **Never**
film Santos Store or any other real merchant.

**Secrets:** the repo has markdown files with plaintext merchant PINs. If you export
the site (v8 did a `git archive` into `site/`), that folder must never be uploaded,
committed to the video repo, or sent to any cloud renderer. Never show a PIN, staff
code or pairing code on screen.

---

## 5. Making the film

### 5.1 Story before pixels
Write `STORYBOARD.md` first: beats, seconds, on-screen line, which real screen, and
which camera move. Keep it to one idea per beat. Reels: 15 to 30 s. Formats: 9:16
1080×1920 first (Reels, TikTok, Shorts, WhatsApp Status), then 1:1 and 16:9 cuts
from the same compositions.

**Claims** come only from the live site copy. Pricing, if shown:
Kiwi Basic 199 MAD/mois · Pro 399 · Ultra 1 499 · Ultimate sur devis. Never show
internal financials, projections or fundraising. No Kiwi Pay, Banking or Investing
unless the owner asks.

### 5.2 Look and motion
- Colours: `--atlas #0B6E4F` (primary), `--riad #053B2C` (deep), `--mint #7DF2B0`
  (accent, under 5% of the frame), `--paper #F7F5F0` (backgrounds, never pure white),
  `--ink #0A0F0D`. No new accent colours.
- Type: Inter Tight for Latin, IBM Plex Sans Arabic for Arabic, JetBrains Mono only
  for codes and figures. **Never italic.** No heavy display weights. No emojis in
  titles. No em dashes in on-screen copy (use a comma or a middle dot).
- Signature motion: the liquid lens spring, `cubic-bezier(0.34, 1.45, 0.5, 1)` over
  310 ms. Use it for any pill or selection that moves.
- Continuity: the diamond i-dot travels through cuts as the anchor.
- Search the registry/catalog before hand-building an effect:
  `npx hyperframes catalog --query "<the move in plain English>"` (runs locally).

### 5.3 Mixing in AI footage
Generated live-action shots (merchant, shop, customer) are fine as atmosphere.
To use them well:
- Ask the generator for a **plain glowing white screen, no interface, no text, no
  logos** on any device, and describe the person and the tablet the same way in
  every prompt so they stay consistent.
- Lay the real caisse snapshot over that screen (corner-pinned with a CSS
  `matrix3d` per frame, or a static shot so a single transform holds).
- Use the generator's paid, watermark-free export. Don't ship a watermark.
- Reject takes with warped hands, changing devices, or legible fake text.

### 5.4 Sound
- Music: the earlier films used a local numpy synth score (120 BPM, cuts on a
  0.125 s grid). Any licensed track the owner supplies is fine.
- Voice-over: ElevenLabs never connected and paid APIs are off (zero-cost rule), so
  use macOS `say` as a placeholder until the owner supplies a recorded VO. Duck the
  music under it (`hyperframes-audio`).
- Loudness: two-pass `loudnorm` to -14 LUFS integrated, true peak -2.0 before AAC so
  the encoded file stays under -1.5 dBTP.

### 5.5 Loop
```bash
npx hyperframes lint                       # after each structural change
npx hyperframes check --snapshots          # gate: runtime errors, layout, contrast
npx hyperframes snapshot --at 2,7.5,14     # midpoints of each scene
npx hyperframes preview --background       # Studio timeline; give the owner the URL
# only after the owner approves:
npx hyperframes render --quality draft   --output out/draft.mp4
npx hyperframes render --quality delivery --output out/kiwi-<name>-916.mp4
ffprobe -v error -show_format -show_streams out/kiwi-<name>-916.mp4
```
Bracket your edits with `npx hyperframes history begin/end` so the owner's own
Studio edits are never overwritten.

---

## 6. Rules (each one cost a session before)

1. **Real app UI only.** No hand-drawn or AI-imagined interfaces. This is what sank v7.
2. **Local renders only.** Never `publish`, never `cloud`, `lambda` or `cloudrun`,
   never sign in to HeyGen. Zero-cost rule (owner, 2026-10-12): no paid APIs, no
   paid AI tokens.
3. **The owner makes the images.** For raster assets (brush strokes, food photos,
   receipt paper, live-action shots) write the prompt; the owner generates it in
   ChatGPT or Seedance and drops the file in the project's `assets/`. Don't call
   image generators yourself.
4. **Never put a 3D tilt on a group of iframes**, and never show the world map and the
   device group in the same frame: Chrome leaves parts unpainted.
5. **Headless Chrome returns a stale frame about 2% of the time.** v8 fixed it by
   waiting two `requestAnimationFrame`s before each capture and burning a frame-number
   strip under the picture, then checking every frame's number and cropping the strip
   at the end. If you see a stutter, check for this first.
6. **Motion blur:** 8 subframes leaves stepped ghost copies on fast moves. Use 32 in
   fast windows and 48 on the biggest whip; keep slow parts cheap.
7. **At most 3 headless browsers at a time** on this Mac; 6 overloaded it. If renders
   time out, look for orphan Chrome processes (`ppid 1`) and kill those first.
8. **Don't commit video projects or renders into the Kiwi repo.** Only this handoff
   lives here.

---

## 7. Delivery

- `kiwi-<name>-916.mp4` 1080×1920, `-11.mp4` 1080×1080, `-169.mp4` 1920×1080.
  H.264 High, yuv420p, 30 or 60 fps, AAC 48 kHz, `+faststart`.
- A poster frame PNG for each.
- Send the finished files to the owner with SendUserFile, then archive (§3).

---

## 8. First moves for the new session

1. Read this file, then `docs/handoffs/HANDOFF.md` Part 1 for the current product state.
2. Ask the owner three things: what the film is for (ad, launch, merchant demo), its
   length and platform, and whether they still have any of the v2 to v8 folders or
   the regenerated Seedance clips.
3. Invoke the `hyperframes` skill, scaffold the project in `~/Developer/kiwi-video/`.
4. Storyboard, snap the real screens, build, `check`, preview, get approval, render.

---

## 9. "Perfect" checklist before you hand it over

- [ ] Every screen shown is the real app, demo data, no real merchant, no codes visible
- [ ] No fake or garbled text anywhere, no watermark, no third-party logos
- [ ] Same device model in every shot
- [ ] Brand colours and fonts only, nothing italic, no em dashes in copy
- [ ] Every claim and price matches the live site
- [ ] The anchor (diamond i-dot) carries through the cuts
- [ ] Logo and end card present, readable on a phone at arm's length
- [ ] Text clear of the platform UI zones (top 250 px, bottom 400 px on 9:16)
- [ ] No stale or dropped frames (scrub at 0.25× around every cut)
- [ ] Loudness -14 LUFS, peaks under -1.5 dBTP, music ducked under voice
- [ ] Looks right on a cheap Android screen, not only on the Mac (dark scenes go muddy)
- [ ] `hyperframes check` green, `ffprobe` clean, owner approved the preview
- [ ] Project pushed to a private repo, renders as release assets, local copies cleaned
