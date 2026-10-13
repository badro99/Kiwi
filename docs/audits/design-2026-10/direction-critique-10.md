# Critic review: Kiwi design 2027 direction (round 11, revision 10)

## 1) Scorecard

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Visual design | 9 | The Home hero shows two delta-sign conventions side by side: "↓ −1,127 MAD" and "↓ 13 MAD" (M5). |
| 2 | UI | 9 | Banner action style contradicts §10.12; disabled Charge has no reason key; a warning row carries a danger badge (P5, P6). |
| 3 | UX | 7 | The other-store state dropped "don't reload" although the pairing purge already erased the stored service (M2). Only Charge is disabled (M1). |
| 4 | Motion | 10 | No findings. Spring settle times reproduce: 300 to 308, 333 and 367 ms; ζ 0.9996. |
| 5 | Feel and haptics | 10 | No findings. The tip Done and "Other percentage" carve-outs are consistent with §15. |
| 6 | Copy and language | 7 | "Its sales are kept here" overstates (M2). The delta-sign rule disagrees across §6.3, §10.21 and the preview (M5). Vocabulary drift and an empty `{paired}` (P4, P7). |
| 7 | Accessibility | 8 | The danger row `sync.blocked` and the `sync.not_synced` count appear without user action and are never announced (M6). |
| 8 | Honesty and consistency | 7 | Check 15 enforces a row order opposite to §10.26's priority table (M4). Check 1 enforces unsigned tile deltas (M5). Citation slips (P1, P2, P11). |
| 9 | Performance | 10 | No findings. |
| 10 | Feasibility and migration safety | 6 | Other tenant-keyed channels still run against the new store (M1). The M2 font fix is not wired into the stamp scan, and its census rule fails at stage 1 (M3). Release-gate placement (P8). |

## 2) Verdict

**FAIL.**

## 3) Rebuttal rulings

- **Rebuttal 1 (largest-remainder `shareWeighted`): ACCEPT.**
  - `kiwi-caisse.html@31c94529:13490-13506` sorts by fraction, ties going to the lower index.
  - `:13610-13611` already uses it for split bases and tips.
  - A second rounding rule for discounts would let one split round two amounts two ways.
- **F11 citation note: ACCEPT.** `functions/api/team/live.js@31c94529` has `:147` 503 `not-configured`, `:149` 400 `bad-json`, `:152` 403, `:154` 503, `:155` 402 and `:156` 403, as §10.34 maps them.

## 4) Findings, ranked

### M1 · major · Feasibility (tenant safety) and UX · §10.26 "The other-store state"

- **Finding:** The state pauses only `postSale`, the replay, the day report and the outbox, and disables only Charge. Every other channel keyed on the current pairing keeps running against the new store, while the open page still holds store A's service.
- **Evidence:**
  - **Floor sync, both ways.** `publishServiceFloor` posts the in-memory floor snapshot (A's tables) to `/api/service/events` under `currentMerchantSlug()`, which is now B (`kiwi-caisse.html:22553-22578`, every 4 s from `:23160`). The poll at `:22592` pulls B's floor events into A's service.
  - **Kitchen.** Kitchen sends and voids use `currentMerchantSlug()` (`:12322`). Send to kitchen is not disabled.
  - **Refunds.** `postRefund` stamps `merchant()` (`live-link.js:974`, body at `:991`), so a cash refund of an A sale is queued under B. `/api/sale/refund` answers `404 sale-not-found` (`refund.js:78`), and the flush only sends the active merchant's rows (`live-link.js:537`), so it never lands in A's books.
  - **Cash movements.** Cash-session events take the current slug when they have none (`assets/cash-sessions.js:132`).
  - **Visibility.** B's staff unlock with B's PIN and then see A's bills, reprints and journal. That is the leak `caisse-pairing.js:224-233` documents from production on 30/07/2026.
- **What a 10 looks like:** The other-store state is a full-screen lock, like the pairing pad, offering only the banner and `sync.pair_back`. Every network call site keyed on `currentMerchantSlug()` or `KiwiLive.merchant()` (floor publish and poll, kitchen queue, refunds, cash sessions, print relay) checks one `tenantMismatch()` predicate. `sale-unsynced-test` asserts no request of any kind reaches B.

### M2 · major · UX, Copy and Honesty · §10.26, §9.6 `sync.not_saved_store`

- **Finding:** The spec never mentions that re-pairing purges the stored service. As a result:
  - the banner no longer says "Keep it open and don't reload it" (revision 9's copy did);
  - "Its sales are kept here" is true only in page memory;
  - the entry-fields table's "Persisted" column is false for the whole state.
- **Evidence:**
  - Switching to another store runs `onTenantSwitch`, then `localStorage.removeItem('kiwi-caisse-shift')` and `purgeTenantData()` (`pairing-commit.js:78-86`; `kiwi-caisse-shift` is in `TENANT_KEYS`, `tenant-purge.js:34`).
  - From then on `persistShift` refuses to write (`:22699-22710`).
  - So the journal, open bills and cash movements exist only in memory, and a reload or an iOS tab eviction erases them.
  - A grep of the spec finds no mention of `pairing-commit`, `tenant-purge` or the purge.
- **What a 10 looks like:**
  - Cite the purge.
  - Say "Keep this till open and don't reload it" in `sync.not_saved_store`, in all three languages.
  - Mark the state memory-only in the lifecycle table.
  - Ideally, have the purge snapshot the open service into a quarantined, merchant-keyed key that pairing back can restore.

### M3 · major · Feasibility · §6.1, §6.5, §21.3 (the revision 10 M2 fix is not wired in)

- **Finding:** `legacy-faces.css` sits outside the stamp tooling, and the new census rule contradicts stage 1's scope.
- **Evidence:**
  1. **Stamping.** §21.3's CSS-site pass reads only `assets/kit/*.css`, `native-runtime.css` and `native-shell.css`.
     - `assets/fonts/legacy-faces.css` is not scanned, so its `url(…?v=N)` font stamps never move with `bump-stamp`, and `stamp-drift-test` cannot see them.
     - Both families would then request one file from two URLs. That breaks §6.1's "same URL per weight" and is exactly the silent class of bug CLAUDE.md §3 warns about.
  2. **Census rule.** `font-face-census-test` fails "a page that names `IBM Plex Sans Arabic` [and] lacks `legacy-faces.css` before stage 7".
     - Stage 1 links it only on the 18 Google-Plex pages.
     - At `31c94529`, 13 more HTML pages name the family directly or through `tokens.css` with no Google Plex link: `kiwi-caisse.html` (which §6.1 defers to stage 4), `booking.html` (a guest page), `tickets.html`, `kiwi-admin.html`, the 8 landing `index.html` files and a tools fixture.
     - So the gate goes red the day it lands.
- **What a 10 looks like:**
  - Add `assets/fonts/*.css` to the CSS-site scan and the served-folder table.
  - Scope the census rule to "renders the family" or to stage-adopted pages, or link `legacy-faces.css` on every page that names Plex.
  - Say what `booking.html` and `tickets.html` (Arabic in a system face today) get.

### M4 · major · Honesty · §18.0 check 15 versus §10.26 `syncRows()`

- **Finding:** Check 15 contradicts §10.26 in two ways:
  - its model emits rows in nearly the reverse of §10.26's priority order;
  - it folds `sync.not_saved` away when storage is full, although the "Combining" rule says "the popover lists every row that applies, in this order".
- **Evidence:**
  - Fixture `indicator['storage-full']` is `[not_synced, storage_error]`; row 2 must come before row 5.
  - `indicator['other-store-full']` is `[storage_error, not_saved_store]`; row 1 must come first.
  - My mutations:
    - the spec-correct `['storage_error','not_synced']` goes **red** ("record gives [not_synced, storage_error]");
    - the spec-correct `['not_saved_store','storage_error']` goes **red**;
    - listing `not_saved` for storage-full (`tillSave:false` applies) goes **red**.
  - Mutation 87's own message prints the reversed order.
  - Consequence: the rail, which "shows the first row's icon", would show the warning `not_synced` icon over the danger storage row.
  - The round-9 index row (§24, "folded into `sync.storage_error`") is still listed as in force, and it contradicts the round-10 Combining rule.
- **What a 10 looks like:** The model sorts rows by the §10.26 row number and lists every applicable row. The fixture's drawn arrays are corrected. Two mutations draw the old order and go red.

### M5 · major · Honesty, Copy and Visual · §10.21, §6.3, preview Home frames, check 1

- **Finding:** Delta signs follow three rules that disagree, and check 1 enforces the one the spec does not state.
- **Evidence:**
  - §10.21: "the delta in Footnote strong, with a U+2212 minus". Its own example "Card share ↑ 1 pt" carries no plus.
  - §6.3: a change uses `signed` with `'exceptZero'`, so "+" or U+2212.
  - The preview draws "↓ 13 MAD", "↑ 4" and "↑ 1 pt" (unsigned) beside the compare control's signed "↓ −1,127 MAD (−5.6%)" on the same screen, and the same in Arabic.
  - Check 1 builds the expected tile values with `Math.abs` (`home.orders_delta`, `basket_delta`, `share_delta`), so a spec-correct "−13 MAD" fails it.
- **What a 10 looks like:** One stated rule for every delta (arrow plus `signed`, or arrow plus magnitude, everywhere), written in §6.3 and §10.21, drawn the same in all frames, and enforced by check 1.

### M6 · major · Accessibility (WCAG 4.1.3) · §14.6, §10.26 rows 4 and 5

- **Finding:** "Counts, sync rows … never announce" exempts `sync.blocked` (danger, error icon, count badge) and `sync.not_synced` (count badge). Both appear asynchronously from outbox and server events and report the existence of errors, which makes them status messages under WCAG 4.1.3.
- **Evidence:** A sighted cashier sees a red badge appear on the rail. A VoiceOver cashier learns nothing until opening the popover. The round-10 fix covered banners only.
- **What a 10 looks like:**
  - Each row that asks for action announces once, politely, when it first applies (a count change writes nothing).
  - `banner-announce-test` covers the case.

### Polish

- **P1 · §10.26 `tillSave`.**
  - **Finding:** It says "`recordSale`'s three (`:14697`, `:14737`, `:14744`)". There are four: `:14733` is the queued branch, whose answer is the one the online-queued paid line reads.
  - **What a 10 looks like:** All four call sites are cited.
- **P2 · §10.26 `merchant` field.**
  - **Finding:** It says "both restore paths already require [it] to equal the paired store". `:23053` returns only `if (here && …)`, so an unpaired till restores any blob.
  - **Finding:** The fixture's own `older-store-entry` (held by the guard, `tillSave` true, `merchant()` non-empty) matches no indicator row, so it is held forever and never shown.
  - **What a 10 looks like:** The citation is corrected, and a row or rule covers that case.
- **P3 · §10.26 guard.**
  - **Finding:** "Equals `KiwiLive.merchant()`" admits `'' === ''`. Rule 3 then clears `saleSyncPending` on `postSale`'s no-tenant `undefined` (`live-link.js:843`), so the sale is never sent.
  - **Finding:** The preview models no-tenant with a separate `tenant` flag, so check 15 never exercises the guard formula.
  - **What a 10 looks like:** The guard requires a non-empty merchant, and the model derives no-tenant from the guard.
- **P4 · `sync.not_saved_store`.**
  - **Finding:** `unpair()` (`caisse-pairing.js:370-384`) makes `currentMerchantSlug()` empty, which enters the other-store state with `{paired}` = "". The alert would then announce "paired with , but…" while the pairing pad covers the screen.
  - **What a 10 looks like:** An unpaired variant of the copy, or the announcement suppressed under the pad.
- **P5 · §10.12 versus §10.26.**
  - **Finding:** The banner anatomy allows an "optional plain action", but `sync.pair_back` is "secondary M".
  - **Finding:** The disabled Charge has "the banner as its reason", but §10.1 requires a `reason` Footnote inside the button's root, and no key is given.
  - **What a 10 looks like:** The two sections agree on the action style, and the disabled Charge has its own reason key.
- **P6 · §10.26 rows 4 and 5.**
  - **Finding:** `sync.not_synced` pairs a warning icon with a danger-solid badge.
  - **Finding:** What the rail badge shows when the first row has no badge but row 4 or 5 applies is unspecified.
  - **What a 10 looks like:** A badge colour per row, and a rule for the rail badge in that case.
- **P7 · §9.1 versus `access.suspended`.**
  - **Finding:** The glossary fixes EN "Store" for access copy; `access.suspended` says "This business's".
  - **What a 10 looks like:** One word per concept, as the glossary fixes it.
- **P8 · §6.3, release gate.**
  - **Finding:** `tools/build-app-www.mjs` has no release mode (`:243-247`). It is `app`'s plain `npm run build`, used for every build including Android's www.
  - **Finding:** The real release path is `tools/app-archive.sh`.
  - **Finding:** The gate accepts a pass on any installed runtime, so the 15.5 floor's ICU is never required.
  - **What a 10 looks like:** The gate sits in `app-archive.sh` and names the runtime it requires.
- **P9 · §10.34 attendance renewal.**
  - **Finding:** "At exactly `expiresTs − 60 s` … always renews" holds only if the till's clock is not ahead of the server. With the till ahead, the server sees more than 60 s left, returns the old code, and the change slips to the next 10 s poll.
  - **What a 10 looks like:** Use the server's `now` from the response.
- **P10 · §6.6.**
  - **Finding:** `sync.pair_back` "Pair with {store}" interpolates a variable store name and has no fit rule or measurement, while §10.1 says labels never truncate.
  - **What a 10 looks like:** A stated fit or wrap rule for interpolated names, or a measurement.
- **P11 · §18.0 "not compared" list.**
  - **Finding:** It files table-to-zone placement and dish order inside a category under "layout, not data". Both are fixture data (the Zone column, the menu order).
  - **Evidence:** Swapping the T4 and T22 tiles (T4 drawn on the Terrace) and swapping the Harira and Tajine de poisson tiles both stay 17/17 green.
  - **What a 10 looks like:** These are checked, or listed as fixture data that is not compared.
- **P12 · §6.3 assertion.**
  - **Finding:** In production, a string with a banned character "is not drawn", so a key figure goes blank. No fallback is stated.
  - **What a 10 looks like:** A stated fallback, for example strip the banned code points and log them.

## 5) Checked and found correct

- **Preview self-test.**
  - 17/17 checks and 99/99 mutations pass in Chromium 152, served over HTTP.
  - I re-ran rows 73 to 99 through my own harness and read each failure. Every V row goes red in its named check for its stated reason.
  - Kit tests pass: icons 231/231; face 136.1 px against 136.1; segment hit 44; negative controls fail as intended.
- **My mutations that were correctly caught:**
  - U+0020 in the Arabic basket delta and in the Orders summary;
  - the customer city;
  - "Sold out" removed;
  - "Send 3 to kitchen";
  - "See all 138" in English and Arabic (inside `<bdi>`);
  - the Arabic "من أصل 9";
  - the known and contactable counts.
- **Formatter.** I ran raw `Intl` independently (`rel` 0, 1, 2 and 11; `pct(0)`; plus sign; negative zero) for `en-GB`, `fr-FR` and `ar-MA-u-nu-latn`. ICU's U+2019 in "aujourd’hui" and the U+200E literals around the Arabic plus and percent are as the spec says, and the vectors follow.
- **Code claims verified at `31c94529`:**
  - `shiftMerchant` at `:15716` and `:15752`;
  - `persistShift` mismatch return at `:22699-22710`, catch at `:22792`, blob merchant at `:22726`;
  - restore whitelist at `:22863-22864`;
  - `saveProvisional` with `reconcileJournalSales(true)` at `:16186-16194`; `:16383`; the autosave at `:23159`;
  - `live-link.js:843`, `:910`, `:1753-1754`, `on()` at `:64-71`.
- **Fonts.** `tokens.css` has no `@font-face` (`:127`, `:153` name the family only). Native declarations at `native-runtime.css:2-4` and `native-shell.css:4-7`. Exactly 18 HTML pages link Plex from Google. `kiwi-caisse.html` loads no Plex. The preview's fonts are byte-identical to the app's fontsource files.
- **Tooling.** `puppeteer-core` 24.43.1 supports `pierce/` and `>>>`. `.kiwi/` is gitignored.
- **Contrast.** I recomputed the whole text-on-surfaces table plus the tints and danger-solid pairs. Every value matches §5.3.
- **Icons.** Every icon named with a size in the spec, and every `data-i` in the preview, is vendored at `31c94529`.
- **Type steps.** Every after frame uses only the six steps. The one 12 px element is the simulated iOS status-bar clock on the SE frame, which is OS chrome.

The preview server is stopped, the browser tab is closed, my scratch files are deleted, and no repository file was edited.
