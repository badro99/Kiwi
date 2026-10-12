# Findings · cluster kds

## 1. Scorecard

| Dimension | Score | One-line reason |
|---|---|---|
| Visual design | 4 | Two unrelated designs for one screen. 11 type sizes on the till board (10.5 to 27 px). A 115 pt dead band on every device. Gradient primary button. Mint used as large fills. Off-token hex colours. |
| UI | 3 | The iPhone till board is unusable: columns about 35 pt wide, text clipped to "42" and "Read". Targets of 38×38 and 26×26. Station chips scroll with no edge cue and are cut mid-word. An empty 23 px bar band. |
| UX | 3 | Item names are 15.5 px and notes 12 px, unreadable from 2 m. An overdue ticket gets a 1 px border while a new one gets 2 px plus a 4 px halo. On iPhone, 29% of the height goes to chrome before the first ticket. |
| Motion | 0 | UNVERIFIED. Needs a screen recording of accept, ready and history open/close, plus a reduced-motion pass. Statically: the history drawer uses `cubic-bezier(0.4,0,0.2,1)` 280 ms rather than the brand spring, and neither tab group is registered with `liquid-lens.js`. |
| Feel and haptics | 0 | UNVERIFIED. Needs a device haptics trace. Statically: `kiwi-cuisine.html:1638,1660,1846` use `navigator.vibrate`, which is a no-op in iOS WKWebView, so iPhone and iPad get no haptics at all. |
| Copy and language | 2 | The EN till board mixes in French: subtitle, Toutes, Historique, Nouvelles, Nouvelle, Accepter. The standalone screen defaults to FR on the web whatever the shared language is. One state is named "Preparing", "Cooking" and "In preparation". |
| Accessibility | 3 | Dark Glovo chip 2.52:1, Yassir 2.67:1, warn timer 2.88:1. Light allergen note 3.61:1 at 12 px. Overdue timer 4.06:1 at 15 px. Targets 38 and 26 px. On phone the connection state is a bare grey dot. |
| Honesty and consistency | 5 | The till and standalone screens disagree on columns (New/Preparing plus a History drawer, against New/Cooking/On the pass), titles ("Kitchen screen", "Kitchen display", "Kitchen") and button style. Column counts show "…". |
| Performance | 0 | UNVERIFIED. Needs INP from an iPhone 12 or iPad with 9 or more live tickets, and a CLS trace across a poll repaint. |

## 2. Verdict
**FAIL.** No dimension is at 10.

## 3. The five changes that would move the scores most (ranked)
1. **Rebuild the till board layout and remove the inherited section padding.** Add `.kit-col{padding:0}` and, below 900 pt, a single column behind segmented tabs. That is the pattern `kiwi-cuisine.html:598-611` already ships. This fixes the iPhone blocker and the 115 pt band. Moves UI, UX and Visual.
2. **Finish the till board translation and make the standalone screen follow the shared language.** Moves Copy from 2 to 7 or more, and Consistency.
3. **Set a kitchen-distance type scale and urgency hierarchy.** Item 24 to 28 px, quantity 24 px mono, ticket number 40 px or more, note 18 px bold on a solid warn fill. Overdue gets a 3 px danger frame plus a filled header. New gets the quiet treatment. Moves UX, Visual and Accessibility.
4. **Use theme tokens for every semantic colour and set kitchen targets at 56 pt or more.** Replace `#8A6210`, `#99540F`, `#2B5AA8`, `#B47A14` and `#F0E2BE` with tokens that have dark variants. Eye button 38 to 56, history close 26 to 44, station chip about 38 to 56. Moves Accessibility.
5. **One kitchen-screen component.** Same column taxonomy, same labels, same ticket anatomy, flat `--atlas` action, Material Symbols only, no gradient, no mint slabs. Moves Visual and Consistency.

## 4. Findings by surface

### kds.board (the kitchen board inside the till, `kiwi-caisse.html` #kds-screen)

**B1 · blocker · columns collapse on iPhone**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/iphone-light-en.png`, `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/iphone-dark-en.png`
- **Element:** `.kit-cols` with `.kit-col-new` and `.kit-grid3`.
- **Evidence:** The New column holds its fixed 300 pt (`flex-shrink:0`). The Preparing grid gets the remaining ~110 pt, split into 2 tracks of about 35 pt. Ticket numbers clip to "4", the Glovo chip wraps one character per line ("G · 3"), and buttons read "Read". 6 of 9 tickets cannot be read or acted on.
- **Source:** `kiwi-caisse.html:4953-4961`. There is a 1180 px breakpoint to 2 columns but no phone breakpoint. `assets/caisse-skin.css:201-214` adjusts `.kds-head` and `.kds-body` at phone width but never touches `.kit-cols`.
- **A 10:** Below 900 pt, one column with New / Preparing / Ready segmented tabs showing counts, registered with `liquid-lens.js`, as `kiwi-cuisine.html:598-611` already does.

**B2 · major · 115 pt dead band above the columns on every device**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-light-en.png` (also the ipad and iphone frames)
- **Element:** The empty space between the station bar and the "NOUVELLES / PREPARING" heads.
- **Evidence:** Scanning pixel rows finds a uniform band 115 CSS px tall at y=140 on desktop and iPad, and at y=124 on iPhone. On a 900 pt desktop that is 13% of the viewport, and it pushes the third New ticket (49) below the fold.
- **Source:** `assets/tokens.css:208` sets `section { padding: 96px 0; }`, a rule meant for marketing pages. The columns are `<section class="kit-col">` (`kiwi-caisse.html:7215-7216`) and `.kit-col` (`:4954`) never resets padding. `kiwi-cuisine.html:431-440` documents and fixes exactly this bug for the standalone screen; the till never got the fix.
- **A 10:** Add `.kit-col{padding:0}`, or better, stop shipping a bare `section` selector in the token sheet. The first ticket then starts 14 pt under the station bar.

**B3 · major · French strings on the English board**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-light-en.png` (all 6)
- **Elements and evidence:** Six strings are still French: the subtitle "File de préparation · mise à jour en direct", the chip "Toutes", "Historique", the column head "NOUVELLES", the status "NOUVELLE" and the button "Accepter". Beside them sit translated "Kitchen screen", "Close", "PREPARING" and "Ready". One card can show "NOUVELLE" and the next "PREPARING".
- **Source:** Hard-coded in `kiwi-caisse.html`:
  - `:7202` subtitle
  - `:19368` `>Accepter<` and `Prête`
  - `:19381` `'Servie' : 'Nouvelle' : 'En préparation'`
  - `:19419` `'Toutes'`
  - `:19474` `Historique`
  - `:19477` `Nouvelles`
  - `:19480` `En préparation`
  - `:19341` `À emporter`

  `assets/caisse-lang.js:97-98` translates only `Prête` and `En préparation` (to "Preparing"). A full FR/EN/AR dictionary for these exact labels exists in `assets/pages-pro.js:19492-19495` (`KDS_T`) but the till does not use it.
- **A 10:** Every label goes through one dictionary. EN reads "All, History, New, Accept, Ready" and AR is set in RTL.

**B4 · major · type too small for 2 m**
- **Frames:** All kds.board frames.
- **Element:** `.kit-nm` 15.5 px / 500, `.kit-q` 14 px, `.kit-inote` 12 px, `.kit-status` 10.5 px mono, `.kit-col-head` 11 px, `.kit-type` 12.5 px.
- **Evidence:** I count 11 distinct sizes (10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 27). At 2 m, 15.5 px Inter Tight on a 10" tablet has a cap height under 2 mm. The allergen note "sans coriandre" is the smallest content text on the card.
- **Source:** `kiwi-caisse.html:4968, 4983, 4988, 5000`. The zoom view (`:5037-5046`) only goes to 18 px.
- **A 10:** Four sizes. Ticket number 40, item 26, note 20 bold, meta 16. The note sits on a solid `--warn` fill with a Material `warning` glyph, because it is the line that hurts someone if it is missed.

**B5 · major · urgency hierarchy inverted**
- **Frame:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-light-en.png`
- **Element:** Ticket 42 is late at 16:59. Tickets 47, 48 and 49 are new at 00:47 to 03:13.
- **Evidence:** The late card gets a 1 px `--danger-mute` border (`.kit-order.is-late`). Every new card gets a 2 px forest border plus a 4 px halo (`.kit-order.is-new`). From 2 m, the three-minute-old tickets are the loudest objects on screen and the seventeen-minute-old one is the quietest. Ticket 43, amber at 12:31, differs from a calm card only by its 15 px chip.
- **Source:** `kiwi-caisse.html:4963-4965`. Thresholds at `:19283` (8 and 15 min).
- **A 10:** The card frame and header fill carry the state: calm, then amber, then red with a 3 px frame. New is shown by its column, not by a halo.

**B6 · major · contrast fails in dark mode**
- **Frame:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-dark-en.png`
- **Evidence (measured on the frame):**
  - Glovo chip `#99540F` on `#362612`: **2.52:1**
  - Yassir chip `#2B5AA8` on `#0D1823`: **2.67:1**
  - Warn timer "12:31" and "10:29" `#8A6210` on `#29220E`: **2.88:1**. This is the urgency signal itself.

  In light mode: allergen note `#B47A14` on `#FFFDFA` is **3.61:1** at 12 px, and the overdue timer is **4.06:1** at 15 px semibold. All fail AA 4.5:1.
- **Source:** `kiwi-caisse.html:4972, 4980, 4981, 4988-4989`. These are hex colours with no `html[data-theme="dark"]` override (compare `:5009` onward, which overrides only surfaces).
- **A 10:** Semantic tokens (`--warn-ink`, `--danger-ink`, channel tokens) with dark variants, all at 4.5:1 or better. `kiwi-cuisine.html:475-477` already does this.

**B7 · major · touch targets too small for wet hands**
- **Frames:** All kds.board frames.
- **Elements:**
  - `.kit-eye` 38×38 (`kiwi-caisse.html:4974`)
  - `.kit-history-x` 26×26 (`:5020`)
  - `.kit-station` about 37 pt tall (padding 10 + 13 px, `:4941`)
- **Evidence:** Below the 44 pt floor, and well below the 56 pt the standalone screen promises for gloved use (`kiwi-cuisine.html:621-625`).
- **A 10:** 56 pt minimum for every control on a kitchen surface.

**B8 · major · station chips cut with no affordance**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/ipad-light-en.png`, `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/iphone-light-en.png`
- **Element:** `.kit-stationbar`.
- **Evidence:** iPad shows 6 of 8 stations; Barbecue and Crêpes bar are off-screen. iPhone shows 2 of 8, and "Cuisson chaude 7" is sliced at x=563 by the History button. The scrollbar is hidden (`scrollbar-width:none`) and there is no fade or chevron.
- **Source:** `kiwi-caisse.html:4939-4940`.
- **A 10:** Wrap to two rows on a tablet, or use a station picker sheet. Never clip a label.

**B9 · polish · eye glyph means "show", not "enlarge"**
- **Frames:** All kds.board frames.
- **Element:** `.kit-eye` (aria-label "Agrandir #n").
- **Evidence:** The eye conventionally means visibility. Its function here is zoom. Nine identical eye buttons per screen add noise.
- **Source:** `kiwi-caisse.html:19331, 19370`.
- **A 10:** Tapping the ticket number or header zooms the ticket. If a button is kept, use the Material `open_in_full` glyph.

**B10 · major · hand-drawn and Lucide icons**
- **Frames:** All kds.board frames.
- **Elements:** clock, check, eye, note, book and close (`KDS_SVG`, `kiwi-caisse.html:19328-19335`), the history glyph (`:19474`), the empty-state glyph (`:19409`) and the header close (`data-lucide="x"`, `:7205`; 174 `data-lucide` uses in the file).
- **Evidence:** These are stroke icons at weights 2, 2.2 and 3, which violates the Material-only rule.
- **A 10:** Vendored Material Symbols: schedule, check, open_in_full, sticky_note_2, history, close.

**B11 · polish · two near-identical greens for different actions**
- **Frame:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-light-en.png`
- **Element:** "Accepter" uses `--brand-deep` and "Ready" uses `--atlas` (`kiwi-caisse.html:5007-5009`).
- **Evidence:** Accept and Ready are different actions, but in light mode both are full-width dark-green slabs about 68 pt tall, told apart by a 2-step shade difference.
- **A 10:** Accept is a neutral inverse slab. Ready is the one atlas action. The label carries the verb.

**B12 · polish · header subtitle adds no information**
- **Frame:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.board/desktop-light-en.png`
- **Evidence:** "File de préparation · mise à jour en direct" is 12 px at 5.0:1 inside an 80 pt black slab. It tells the cook nothing they can act on.
- **A 10:** Replace it with live state: connection status, last sync time and the oldest open ticket's age.

### kds.standalone-fixture (`kiwi-cuisine.html`, synthetic tickets)

Fixture caveat: the ticket body ("Demo n", "12:45", a "Ready" action in every column, the "no onion, synthetic ticket" note), "Connexion…" and the "…" counts all come from bypassing pairing (`tools/design-capture/surfaces.json:61`). I judged the chrome and the production CSS that styles them, not the content.

**S1 · major · web screen ignores the shared language (verified real)**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/desktop-light-en.png`, `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/desktop-dark-en.png`
- **Element:** `<html lang>`, the "Cuisine" title, the column heads "NOUVELLES / EN PRÉPARATION / AU PASSE", the "FR" button.
- **Evidence:** `lang()` reads only `kiwiCuisineLang` and defaults to `'fr'`. I probed the page in headless Chrome with `localStorage.kiwiLang='en'` at 440 px and 1440 px; both rendered `lang="fr"`. On native, the iPad and iPhone frames are English because `app/src/native-locale.js` mirrors the locale into `kiwiCuisineLang`. The capture harness seeds no key for this app (`tools/design-capture/capture.mjs:64`), which is why the desktop frames came out French.
- **Effect:** A browser or tablet kitchen screen opens in French whatever the owner chose, until someone taps "FR".
- **Source:** `kiwi-cuisine.html:1054-1057`.
- **A 10:** Read `kiwiCuisineLang`, then `kiwiLang`, then `navigator.language`, then fr. The paired till's language should seed it at pairing time.

**S2 · major · empty station bar renders as a 23 pt band**
- **Frames:** All 6 standalone frames (the strip under the header).
- **Element:** `nav.bar#bar` with no stations.
- **Evidence:** Probed height 23 px, with its own border-bottom and surface fill, holding nothing.
- **Source:** `kiwi-cuisine.html:405-408, 751`.
- **A 10:** `#bar:empty{display:none}`, or hide it until there are two or more stations.

**S3 · major · gradient primary action, and mint as large fills in dark mode**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/desktop-dark-en.png`, `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/iphone-dark-en.png`
- **Element:** `.act-ready` is `linear-gradient(135deg, var(--forest), var(--forest-deep))`. In dark mode the probe resolves it to `#7DF2B0` to `#3FB67A`.
- **Evidence:** On iPhone dark, three 382×58 mint slabs plus the mint "New" tab cover about 20% of the viewport. The brand caps `--mint` at 5% or less as an accent. No other Kiwi primary button uses a gradient.
- **Source:** `kiwi-cuisine.html:523`.
- **A 10:** A flat `--atlas` (dark-mode token) action. Mint only as a 2 to 4 px state edge.

**S4 · major · phone chrome eats 29% of the screen**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/iphone-light-en.png`, `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/iphone-dark-en.png`
- **Evidence:** In points: safe-area band 62 (painted `--paper` while the header is `--surface`, a visible seam), a header wrapped onto two rows 120, the empty bar 24, tabs 73. That is 279 of 956 pt before the first ticket.
- **Source:** `kiwi-cuisine.html:613-625` (≤620 px rules let `.top` wrap and scroll).
- **A 10:** One 56 pt header row holding title, status and clock. Sound and language go into the hamburger. Tabs at 56 pt. Chrome at 150 pt or less.

**S5 · major · connection state shown by colour only on phone**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/iphone-light-en.png`
- **Element:** `#link-txt` hidden at ≤620 px (`.link span{display:none}`, `kiwi-cuisine.html:619-620`). Probe: width 0.
- **Evidence:** Online, connecting and offline differ only by a 10 px dot's colour. That fails WCAG 1.4.1, and it hides the single most important fact on a kitchen screen.
- **A 10:** An icon plus a word, always visible. The Material `wifi_off` and `schedule` glyphs already exist at `kiwi-cuisine.html:1121-1126`.

**S6 · major · hand-drawn icons mixed with Material**
- **Frames:** All standalone frames (sound, sun/moon, fullscreen, check).
- **Element:** `SVG.clock, check, hand, empty, on, off, warn, sun, moon` (`kiwi-cuisine.html:1108-1119`) and the fullscreen SVG (`:747`) are stroke drawings. Only `sync`, `offline` and `alert` are Material (`:1124-1126`).
- **Evidence:** Two icon languages in one 56 pt toolbar.
- **A 10:** All Material Symbols, filled with `currentColor`.

**S7 · polish · theme button shows the current state, not the action**
- **Frames:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/desktop-light-en.png` (sun), `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/desktop-dark-en.png` (moon)
- **Evidence:** It is ambiguous whether the sun means "you are in light" or "switch to light".
- **A 10:** A labelled segmented Light / Dark / Auto control in settings. The wall screen follows the system by default.

**S8 · polish · column counts stuck on "…"**
- **Frames:** All standalone frames.
- **Element:** `#n-new` and `#t-new`.
- **Evidence:** `count()` returns "…" while `!S.loaded`, with no timeout (`kiwi-cuisine.html:1913`). This is partly a fixture artefact. In production, an unpaired or offline screen shows "…" indefinitely beside visible tickets.
- **A 10:** Counts derive from what is painted. After a timeout, a stale state replaces the ellipsis.

**S9 · unverified · iPhone frame shows all three columns' tickets under "New"**
- **Frame:** `/Users/zaka/Developer/kiwi-design-audit/shots/kds.standalone-fixture/iphone-light-en.png`
- **Evidence:** Demo 1, 2 and 3 all appear under the "New" tab. My probe of the repo HTML at 440 px shows only `.col--new` visible (`display:flex`, the others `none`).
- **A 10:** Either confirm a native-bundle-only override or treat this as a capture artefact. Re-capture after a single-column check.

## 5. Systemic patterns
1. **The bare `section` rule in `assets/tokens.css:208` silently pads app surfaces.** The standalone screen found and fixed it (`kiwi-cuisine.html:431-440`), but the till board did not. Any app surface that uses `<section>` inherits 192 px of vertical padding. Fix it in the token sheet, not page by page.
2. **One product screen, two implementations.** The till board and `kiwi-cuisine.html` share no CSS. They disagree on:
   - Column model: New / Preparing plus a History drawer, against New / Cooking / On the pass.
   - Title: "Kitchen screen", "Kitchen display" (`pages-pro.js` KDS_T) and "Kitchen".
   - Ticket anatomy, action colour, button radius (13 against 0) and target size (56 against 38).

   A comment at `kiwi-cuisine.html:411` claims `.st` is "the same component as `.kit-station`", but the heights (56 against about 37) and radii (14 against 10) say otherwise.
3. **Translation by text capture leaks.** `caisse-lang.js` translates only the strings it already knows. Anything rendered from a JS template literal stays French. This is the same leak class as in the till cluster.
4. **Hex colours with no dark variant** (`#8A6210`, `#99540F`, `#2B5AA8`, `#B47A14`, `#F0E2BE`) are where every dark-mode contrast failure comes from.
5. **Icon drift.** Hand-drawn stroke SVG and Lucide appear on both kitchen screens despite the Material-only rule.
6. **Touch-only feedback assumes Android.** `navigator.vibrate` is the only haptic path, so iOS (the native app) gets none. A Capacitor Haptics bridge is needed.
