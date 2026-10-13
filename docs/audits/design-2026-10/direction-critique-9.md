# Critic review: Kiwi design 2027 direction (round 10, revision 9)

## 1) Scorecard

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Visual design | 8 | Once a web surface drops its Google Fonts link, its legacy Arabic text falls back to a system font (M2). |
| 2 | UI | 9 | The sync indicator's badge colour and visibility rules contradict its new neutral rows (P5). |
| 3 | UX | 8 | The new "paired with a different store" banner has no way out (M5). The attendance expiry time is off by up to a minute (P8). |
| 4 | Motion | 10 | No findings. Spring settle times reproduce: 300 to 308, 333 and 367 ms. |
| 5 | Feel and haptics | 9 | The new tip flow fires Choose on a Done button, which is not in §15.1's member list (P7). |
| 6 | Copy and language | 8 | The relative-day row is not what `Intl` produces (P2). Plus sign and negative zero are unspecified (P3). The Arabic word for "paired" drifts (P4). |
| 7 | Accessibility | 8 | The new danger banners are never announced to screen readers, which fails WCAG 4.1.3 (M4). |
| 8 | Honesty and consistency | 7 | The preview draws ordinary spaces where §6.3 requires no-break spaces, and the checks can't see it (M1). Check 15 enforces the opposite of P6 (M6). The "not compared" list is incomplete (P1). |
| 9 | Performance | 10 | No findings. |
| 10 | Feasibility and migration safety | 6 | The Plex declaration is cited in a file that has none (M2). The new state keeps a page open that books one store's sales to another (M3). No WebKit or Playwright runner exists (M7). Lifecycle of the new fields is unstated (P6). |

## 2) Verdict

**FAIL.**

## 3) Rebuttal rulings

- **Rebuttal 1 (largest-remainder `shareWeighted`): ACCEPT.** `kiwi-caisse.html@31c94529:13490-13506` sorts by fraction, highest first, with ties going to the earlier index. The split already uses it at `:13611`. The worked example reproduces: −19.50 and −3.50, shares 175.50 and 31.50, sum 207.00.
- **F11 citation note: ACCEPT.** In `functions/api/team/live.js@31c94529`, line 147 is the 503 `not-configured` and line 149 is the 400 `bad-json`. Lines 152, 154, 155 and 156 also match §10.34.

## 4) Findings, ranked

### M1 · major · Honesty · §6.3, §6.6, §18.0 checks 1 and 14, preview
- **Finding:** The "after" frames separate number and unit with an ordinary space (U+0020) almost everywhere, and the checks cannot detect it.
- **Evidence:**
  - §6.3 says "Number to unit: U+00A0", Arabic compact is "U+00A0 ألف", and §6.6 claims widths were measured "with real U+00A0 in the amounts".
  - Code-point dump of the frames (␠ = ordinary space, ⍽ = U+00A0):
    - Home delta: `−1,127␠MAD␠(−5.6%)`
    - Orders key figure: `19,174.00␠MAD`
    - Bill total: `230.00␠MAD`
    - Arabic chart labels: `10␠ألف` and `30,1␠ألف`
    - Arabic basket delta: `13␠درهم`
    - Every Latest-orders row and every tile price is the same.
  - The checks' `txt()` and `fold()` collapse all whitespace (`\s+` → ' ', and `\s` includes U+00A0 and U+202F). Only U+202F is banned, and only in Home frames.
  - My mutation: replace every U+00A0 in Home with U+0020 → **16/16 still green**.
- **What a 10 looks like:** frames carry the formatter's exact output; checks compare exact code points (or assert U+00A0 between number and unit); a mutation row for U+0020.

### M2 · major · Feasibility and Visual · §6.1 (line 375), §6.5
- **Finding:** §6.1 says the legacy `IBM Plex Sans Arabic` declarations are kept "in `tokens.css`, `native-runtime.css:2-4` and `native-shell.css`", and that both family names share one URL per weight after stage 1. Both claims are false on the web.
- **Evidence:**
  - `tokens.css@31c94529` contains no `@font-face`. It only names the family (`:127`, `:153`).
  - On the web, Plex Arabic is declared only by Google Fonts stylesheets (`dashboard.html:62`, `kiwi-order.html`, `OrderPro.html`, `kiwi-serveur.html`, `kiwi-cuisine.html`, …). `kiwi-caisse.html` does not load it at all.
  - §6.5 removes a surface's Google link when that surface adopts the kit. The kit's `tokens-2027.css` declares only `Kiwi Arabic`.
  - So on a half-migrated adopted page (for example the dashboard with its legacy drawers), every legacy Arabic string resolves `--sans` to an undeclared Plex, then Inter Tight (no Arabic glyphs), then Cairo (not loaded), then the system Arabic face.
  - The "same URL per weight" claim, and the census test built on it, have no basis on the web.
- **What a 10 looks like:** stage 1 adds `@font-face "IBM Plex Sans Arabic"` rules pointing at `assets/fonts/` to a legacy stylesheet every web page loads, before any Google link is removed. The citation is corrected, and `font-face-census-test` covers it.

### M3 · major · Feasibility (tenant safety) · §10.26 M1 and M2
- **Finding:** The new `'other-store'` state tells the cashier "Don't reload it". On that open page, the shipped heartbeat books store A's pending sales into store B.
- **Evidence:**
  - Every 5 s, `setInterval(persistShift; saveProvisional)` (`kiwi-caisse.html:23159`) runs `reconcileJournalSales(true)` (`:16194`). Neither has a merchant guard (`:16186-16194`, `:16074-16100`).
  - It replays every entry that is still `saleSyncPending`: refused ones, and queued ones not yet accepted.
  - `postSale` stamps the current `merchant()` (`live-link.js:843`, `body.merchant` at `:910`) and derives `stableId(m, entry)` from it. So after a re-pair the replay posts A's sales under B with a new id, and nothing deduplicates them.
  - The spec's claim that a replay uses "the same stable id" (§10.26, both the Live Link off and the recovery bullets) holds only while the merchant is unchanged.
  - CLAUDE.md §6 names this exact path: a till can change merchant by pairing.
- **What a 10 looks like:** record the merchant on each journal entry at sale time; replay only entries whose merchant equals `merchant()`; suspend replay in the `'other-store'` state; a test for it in `sale-unsynced-test`.

### M4 · major · Accessibility · §10.12, §14.6, §10.26
- **Finding:** Banners have no live-region semantics, so a VoiceOver cashier never learns the till stopped saving.
- **Evidence:**
  - §10.12 defines no `role` or `aria-live`, and §14.6 says "Live updates do not announce".
  - `sync.not_saved`, `sync.not_saved_store` and `sync.storage_error` appear without any user action, from the 5 s autosave or an asynchronous `storageError`.
  - These are status messages under WCAG 4.1.3 (AA).
- **What a 10 looks like:** danger banners that appear on their own get `role="alert"` (others `role="status"`), announced once when they appear, and this is listed in §16.

### M5 · major · UX and Copy · §10.26, `sync.not_saved_store`
- **Finding:** There is no way out of the `'other-store'` state.
- **Evidence:**
  - The banner stays "until a `persistShift` returns `true`", which can never happen while the till stays paired to the other store (`:22699-22710`).
  - The copy says only "Don't reload it". It does not say to close the till for this service's Z, or to pair back. §9.4 says "Errors say what happened, then what to do".
  - When storage is also full, this state is folded into `sync.storage_error`, whose text names only full storage. Check 15 then drops `not_saved_store` (my mutation `paidCases[7].outbox='queue-storage-full'` confirms it), so the real cause disappears.
- **What a 10 looks like:** an action in the banner (close the till for {store}, or pair back to it), a defined exit, and the cause kept when the states combine.

### M6 · major · Honesty · §18.0 check 15 versus §10.26 P6
- **Finding:** Check 15's expected-value model contradicts the rule it claims to enforce.
- **Evidence:**
  - §10.26 says the receipt-return path "never shows `sync.saved_here`".
  - The check's model ignores that path. With `paidCases[8].online=false` (or `outbox='sale-enqueue-failed'`), check 15 goes red and demands "Saved on this till".
  - It agrees with the spec only because the fixture models this path as online with `outbox:'queued'`, an outbox answer this path never produces: no `postSale` runs on it.
  - `fixture-agreement-test` reuses this list, so a correct stage-4 till that is offline on this path would fail the gate.
- **What a 10 looks like:** a separate receipt-return branch in the model (no outbox input, never `saved_here`), plus a mutation for the offline case.

### M7 · major · Feasibility · §2 P1, §6.3, §21.1 stage 1
- **Finding:** The test runners the spec relies on do not exist in the repo.
- **Evidence:**
  - "Playwright locators" and "`format-vectors-test` … in WebKit on every build" are named, but there is no Playwright or WebKit driver in the repo.
  - The harness is puppeteer-core with system Chrome (`tools/design-capture/capture.mjs:605-621`, its README, `tools/browser-trace.mjs:8`). `app/node_modules` holds `puppeteer-core` only, and nothing in `tools/` uses safaridriver or simctl.
  - The M3 fix's iOS guarantee, the claim that WebKit's ICU produces the same strings, rests on this test.
- **What a 10 looks like:** name the runner (safaridriver over WebDriver, an iOS Simulator WKWebView via simctl, or Playwright WebKit added with a lockfile per CLAUDE.md §2) and say where it runs.

### P1 · polish · Honesty · §18.0 line 2502
- **Finding:** The "Drawn from the fixture but not compared" list reads as complete but is not.
- **Evidence:** each of these, mutated, left all 16 checks green:
  - the venue name "Café Atlas" (Home, Home in Arabic, and twice in Kiwi AI);
  - the zone name "Terrace";
  - the menu category names and order, and the sticky "Starters" header;
  - "last Monday" in the Kiwi AI suggestion;
  - today's first point;
  - yesterday's last point moved to x 300 (23:00); only its y is checked.
- **What a 10 looks like:** check these, or list them.

### P2 · polish · Copy · §6.3 relative-day row
- **Finding:** The relative-day row is not produced by the stated mechanism and has no test vector.
- **Evidence:**
  - `Intl.RelativeTimeFormat` with `numeric:'auto'` gives FR "avant-hier" and AR "أول أمس" for −2, not "il y a 2 jours" or "قبل يومين".
  - FR "aujourd’hui" uses U+2019, while every keyed string uses U+0027.
  - Neither the formatToParts table nor the vectors cover relative days.
- **What a 10 looks like:** a stated option and assembly rule, the table corrected, and vectors added.

### P3 · polish · Copy · §6.3 parts table
- **Finding:** The parts table does not cover signs fully.
- **Evidence:**
  - There is no `plusSign` row and no `signDisplay` option, although the vector `pct(0.042)` → `+4.2%` needs both.
  - `num(−0.004, 2)` gives "−0.00", so a cash Difference that rounds to zero could print "−0.00 MAD".
- **What a 10 looks like:** a plusSign row, a stated `signDisplay`, and negative zero normalised, with a vector for each.

### P4 · polish · Copy · `sync.not_saved_store`, `sync.waiting_store`
- **Finding:** The new strings drift from the existing vocabulary.
- **Evidence:**
  - Arabic uses مقترن for "paired", while every other pairing string uses مربوط (`pin.unpaired`, `printer.code.unpaired`, `attendance.unpaired`, the glossary's رمز الربط).
  - FR renders "store" as "établissement" here, but as "commerce" in the `pin.*` and `access.*` strings.
- **What a 10 looks like:** one word per concept, recorded in the glossary.

### P5 · polish · UI · §10.26 sync indicator
- **Finding:** Two rules contradict the new neutral rows.
- **Evidence:**
  - `sync.waiting_store` is declared "not a warning", but the rail's count badge is a §10.13 count badge, which is danger-solid.
  - The indicator is "Hidden when the outbox is empty". Waiting-store entries never enter the outbox, and only `not_synced` and `not_saved` are given an explicit stay-visible exception.
- **What a 10 looks like:** a badge colour per state, and a stay-visible exception for waiting-store.

### P6 · polish · Feasibility · §10.26
- **Finding:** The lifecycle of the new entry fields is not specified.
- **Evidence:**
  - Nothing says the replay clears `saleSyncWaiting` once it queues; only clearing `saleSyncError` is stated.
  - The journal restore whitelist (`kiwi-caisse.html:22863-22864`) drops unlisted keys, so neither `saleSyncWaiting` nor `savedLocally` survives a reload.
  - "Gets no `saleSyncError`" is ambiguous for an entry that already holds a refusal when Live Link is turned off.
- **What a 10 looks like:** state each field's set, clear and persist rule.

### P7 · polish · Feel · §10.26 P7 versus §15.1 and §10.26's tip rule
- **Finding:** The new tip-entry flow breaks two existing rules.
- **Evidence:**
  - Done fires Choose, but §15.1 does not list Done among Choose's members or additions.
  - The "Other percentage" row also fires Choose before any tip is chosen.
  - The general rule "nothing else in the pane moves" is contradicted when the keypad switches to tip mode or a keypad pushes in.
- **What a 10 looks like:** add the Done member to §15.1 (or drop its haptic), and make the general rule exclude the Other percentage row.

### P8 · polish · Copy and UX · §10.34
- **Finding:** "Changes at {time}" is wrong by up to a minute, and the same time is printed twice.
- **Evidence:**
  - The code is taken from `expiresTs`, but the 60 s rule replaces it at the first poll after `expiresTs − 60 s`, about 50 to 60 s before the printed time.
  - `attendance.refresh_failed` prints the same time again on the same sheet.
- **What a 10 looks like:** print the replacement time, and print it once.

### P9 · polish · Honesty · preview
- **Finding:** The preview uses a different Arabic font name from the spec.
- **Evidence:** The preview declares Plex as `"IBM Plex Sans Arabic"` (with the unicode-range and 108 %), not the `"Kiwi Arabic"` family that §6.1 makes the kit's.
- **What a 10 looks like:** the preview uses the spec's family name.

## 5) Checked and found correct

- **Preview self-tests:** 16/16 checks pass and 79/79 mutations are caught.
  - I re-ran every mutation and read the failure message: each one goes red for the reason it targets.
  - Face check passes. Icons render 231/231. Segment hit areas are 44.
- **Mutations I added that were correctly caught:** share-delta polarity, receipt-return offline (see M6), other-store with storage full.
- **Code citations:**
  - `live-link.js@31c94529`: `realEnv`/`on` at 41 and 64-71; `enqueueMoneyBody` at 750-800 (refusals at 764, 767, 793, 799); `postSale`'s three `undefined` returns at 806, 837 and 843, and only those three; the `KiwiLive` export with `isOn` and `merchant` at 1753-1754.
  - `kiwi-caisse.html`: the `recordSale` sync branch (14716-14746); `persistShift` at 22692-22713 with its swallowed catch; the 5 s autosave at 23159; `shareMoney`/`shareWeighted`.
  - `KiwiEnv`: demo tills are localhost-only, so "Live Link off on every demo till" holds, including in the app.
  - `reset.js@a3de3011`: GET 503 at 71, and `lookup` maps database errors to invalid.
  - `live.js` 147-156.
- **Formatter:** I ran all the §6.3 vectors through Chromium 152's `Intl` with the named tags, and they match.
  - Raw ICU output recorded in the spec is right: FR U+202F grouping, ar-MA `.` grouping, three U+200E marks around the AR percent, the Arabic comma in AR dates, en-GB "30.1k".
  - The Moroccan month names are right.
- **Arithmetic and geometry:**
  - Chart step rule and gridline y positions (64.25, 75.4, 50.8); 30K drops 0.4 below the band edge.
  - Banner widths at 283 match within about 0.5 px.
- **Contrast** (sampled and recomputed): ink-3 5.00 and 4.13; line-strong 3.03 and 3.35; danger-solid dark 3.42 and 5.12; danger on its tint 5.53 and 6.75; accent dark 9.42 and 9.12; mint 14.13.
- **Other:**
  - Every icon the spec names is vendored at `31c94529`.
  - The §10.26 tip-entry rules no longer put a keypad in a popover (§10.4).
  - P1, P2, P3 and P4 of the round 9 critique are fixed as stated.
