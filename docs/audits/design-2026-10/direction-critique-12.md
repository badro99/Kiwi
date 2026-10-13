# Critic review: Kiwi design 2027 direction (round 13, revision 12)

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | Frames use tokens only. Contrast and the six type steps check out. Arabic Home is now drawn in light. I found nothing. |
| UI | 8 | "Pair a different store" is a Plain button that opens a Tier B sheet, which breaks §11. The parked row cannot be reached on iPad. The PIN pad's state table has no row for the new 409. |
| UX | 5 | Blocker: an idle till that is re-paired or unpaired gets the store lock. Setting a service aside costs a second pairing code. On a device with a locked till, the kitchen screen and the app's sign-in screen go dead. |
| Motion | 10 | Spring settles re-simulated: 308/308/300, 333 and 367 ms, ζ 0.9996. Nothing in revision 12 touches motion. |
| Feel and haptics | 9 | The new 409 `pair-other-store` "shakes, as for a wrong code", but §15.1 and §15.3 give it no haptic. |
| Copy and language | 8 | The Arabic word for "bill" breaks the glossary. `{bills}` has no plural noun row. A zero change in a sentence has no key. Two stale or garbled sentences. |
| Accessibility | 10 | Focus goes to the lock's heading, the live-region rules hold, and the Arabic light frame is drawn. I found nothing. |
| Honesty and consistency | 6 | The lock text claims an open service that does not exist. "Every held entry is shown" is false on iPad. Two new checks compare against fixed strings. One invariant sentence is stale. |
| Performance | 10 | The gate's cost is negligible. Budgets are unchanged. |
| Feasibility and migration | 4 | The predicate blocker. The literal `KiwiTenantGate.locked()` throws on pages without the gate. `font-face-census-test` cannot pass on the Arabic landing at stage 1. Wrong citation. |

## 2. Verdict

**FAIL.**

## 3. Rebuttal rulings

- **Rebuttal 1 (largest-remainder rounding): ACCEPT.** `kiwi-caisse.html:13493-13506@31c94529` sorts by the fractional part, with ties going to the earlier index, as stated. The split tip uses it at `:13611`.
- **Census correction (48 withdrawn, 52 adopted): ACCEPT.** My own census over the HTML files at 31c94529 gives 52 pages:
  - 18 with a Google link in the markup;
  - 18 through `article.css`;
  - 11 through the Next chunk;
  - 1 Kiwi `@font-face` (`app/src/index.html`);
  - 4 with none.

## 4. Findings, ranked

### Blocker

**B1 · §10.26 `tenantMismatch()` locks idle tills (UX, Honesty, Feasibility).**
- **Finding:** the predicate reads "service open" from `shiftMerchant`, which the till does not use for that.
- **Evidence:**
  - `const svc = shiftMerchant || ''; if (!svc) return false; // no service open`.
  - At 31c94529, `kiwi-caisse.html:22690` sets `let shiftMerchant = currentMerchantSlug();` at page load. It is reassigned only when a service opens (`:15716`, `:15752`) and never cleared.
  - The till's real open-service flag is `shiftOpenedAt`: null at `:14014`, and `persistShift` returns early on `!shiftOpenedAt` at `:22693`. Closing the till reloads the page (`:16305`).
- **Consequence:** a till paired with A, with no service open, that is re-paired to B from the pairing pad (or unpaired) gets `svc='A'` against `'B'` or `''`, so the predicate is true. Then:
  - The gate's `locked()` is that source with no "service open" condition, so every `/api/` and `/auth/` call for B is refused.
  - `submit()` shows the lock instead of `bootWithPin(B)`.
  - The lock says "the open service belongs to A", which is false.
  - The held copy can never land (`persistShift` returns early), so "Pair a different store" never appears. The only ways out are A's code or a reload, which the lock tells the cashier not to do.
  - Check 15 cannot see this, because every case has a service open.
- **What a 10 looks like:** the predicate is keyed on `shiftOpenedAt && !registerClosing`, with `shiftMerchant` used only as the store. Fixture and `tenant-gate-test` cases cover an idle till re-paired A to B and an idle till unpaired: no lock, gate open, B's staff pad.

### Major

**M1 · §10.26 "Inside the two send functions" (Feasibility).**
- **Finding:** the literal line `if (KiwiTenantGate.locked()) return {...}` in `live-link.js` throws a ReferenceError on every page without the gate.
- **Evidence:**
  - `live-link.js` loads on `dashboard.html` and `kiwi-serveur.html`, which do not load `pairing-commit.js`, so they get no gate.
  - The dashboard calls `postSale` at `interactive.js:3032` (record a sale) and `hotel.js:2362`.
- **What a 10 looks like:** `window.KiwiTenantGate && KiwiTenantGate.locked()`, plus a unit test that calls `postSale` with no gate loaded.

**M2 · §10.26 row 9 / sync indicator (UX, UI, Honesty).**
- **Finding:** a parked service is invisible on the iPad till.
- **Evidence:**
  - Row 9 is "the phone's More row and the popover, never on the rail".
  - The rail icon, which is the only way to open the popover on iPad, is "visible while any of rows 1 to 7 applies".
  - So on an iPad with only a parked service, nothing shows it. The tills are iPads (§6.3).
  - "Every held entry is shown" and check 15's `heldShownBy: 'parked'` both pass anyway.
- **What a 10 looks like:** row 9 also makes the indicator visible, and check 15 models the device class.

**M3 · §10.26 "Pair a different store" (UX).**
- **Finding:** after confirming, the till shows "the ordinary pairing pad, unrestricted", even when it is already paired with B.
- **Evidence:** B's code was single-use (`redeem.js` `UPDATE … used_ts`). So a till moved to B on purpose needs B's owner to create a second code.
- **What a 10 looks like:** in the paired variant, confirming boots B through B's staff pad. The pad appears only in the unpaired variant.

**M4 · §10.26 "Where it loads" (UX, Feasibility).**
- **Finding:** the gate on `kiwi-cuisine.html` and `app/src/index.html` has no source and no UI.
- **Evidence:**
  - On those pages, `locked()` falls back to its boot rule: a held key in the `locked` state for another store than `kiwiLiveMerchant`.
  - Both values live in `localStorage` for the whole origin (kiwi-os.com, `capacitor://localhost`).
  - So on a device whose till is locked, the kitchen screen for B gets no tickets and the native shell cannot sign in or switch roles. Nothing on screen says why, until A pairs back.
- **What a 10 looks like:** the boot rule applies only on the till, or each page registers its own source and states what it shows. `tenant-gate-test` covers a kitchen screen on the same origin.

**M5 · §6.1/§6.5/§21.1 font plan on the 11 Next-chunk pages (Feasibility, Honesty).**
- **Evidence:**
  - The chunk's `@import` requests Plex weights 200 to 600.
  - `ar/index.html` uses `font-extralight` 83 times and `font-light` 3 times.
  - `legacy-faces.css` declares only weights 400 to 600, Arabic ranges only.
- **Consequences:**
  - (a) Most of `ar/`'s Arabic stays on Google's 200 face, so "their Arabic moves to the self-hosted build" is false.
  - (b) `html[lang=ar] body{font-family:IBM Plex Sans Arabic,…}` sets digits and Latin in Plex, which only Google's faces cover. After stage 1, weight 400 is fetched from two URLs (`assets/fonts` and gstatic), so `font-face-census-test`'s own "one weight from two URLs" rule fails on `ar/` and `ar/robot/`.
  - (c) When the `@import` is removed, Arabic at 200 and 300 renders at 400. `kiwi-cuisine.html` also requests 700 (12 uses), and `legacy-faces.css` has none. Neither change is stated.
- **What a 10 looks like:** the census reports weights per page, every requested weight is declared or its mapping is stated, and the two-URL rule is scoped to a unicode range.

**M6 · §11 against §10.26 (UI).**
- **Finding:** Tier B triggers must be tonal danger, an overflow item or a swipe, and §10.1 reserves tonal danger for destructive triggers.
- **Evidence:** `lock.store.other` is a Plain button (accent ink) that opens a Tier B sheet, and §11's Tier B list does not name the act.
- **What a 10 looks like:** a tonal danger trigger, or a named exception in §11.

### Polish

- **P1 · Feel, §15.1 and §15.3.** The pairing row of §15.3 lists 200, 422, and 429/503/network. The 409 has no haptic, and §24 says no fix touches §15. *A 10:* 409 is in Failed's members and in the pairing row.
- **P2 · UI, §10.2 state table.** The table says it has "one per answer the server can give", but it has no 409 `pair-other-store` row. Its 422, 429 and network rows do not list the store lock as a use.
- **P3 · UX, §10.26 lock pad.** The shipped `redeem()` falls back to `localRedeem()` on a network error or a 404/405 (`caisse-pairing.js:247-256`), with no `expectMerchant` check. `confirmTillProof` falls back to `GET /api/pair/state?merchant=B` (`:285`, `:315-324`), which the gate refuses.
  - Offline, A's valid code shows "Code invalide" instead of `pin.offline`.
  - The "{store}'s code only" rule has a client-side bypass.
  - *A 10:* the lock's pad uses a redeem with no local fallback, and the `pair/state` step is handled.
- **P4 · Honesty, "the staff gate is never skipped".**
  - `askStaff` boots without a pad for an explicitly empty roster, and when `/api/config` fails with no offline rows (`:639-660`).
  - `onTenantSwitch` deletes A's offline PIN key on the way in (`:221`), so an exit while `/api/config` fails opens A's service with no code.
  - *A 10:* the spec states the empty-roster case, and the exit never boots without a verified roster.
- **P5 · Honesty, preview check 15.** `lockPad` and `lockExit` are compared with the fixed strings `'store-only'` and `'staff_pad'` (preview, about lines 2763-2764). Mutations 112 and 113 only edit those strings, which contradicts §18.0's "expected comes from a source". No paid case has a parked service, so row 9 never enters the checked rows.
- **P6 · Honesty, §10.26.** The held-entry paragraph ends "accounted for by the lock or by row 5", stale against its own "exactly three reasons". The preview's code comment says the same.
- **P7 · Copy, Arabic "bill".** The glossary says Bill is الحساب, but `lock.store.why_body` uses فواتيره and `lock.store.other_body` uses فاتورة.
- **P8 · Copy, §9.2.** `{bills}` is plural, but there is no "bill" noun row, so `strings-completeness-test` fails by its own rule.
- **P9 · Copy, §6.3 sentence scope.** Only `_down` and `_up` exist. A change that rounds to zero would read "0 MAD less than yesterday". *A 10:* an `ai.today_same` key, and the chart summary's zero case.
- **P10 · Copy, `lock.store.other_body`.** "Nothing of it is … shown" is contradicted by row 9, which shows its count.
- **P11 · Copy.** The §18.0 sentence "…and the frames use only those tokens, and prints the result at the top" is garbled. The preview intro still says "Home in Arabic (RTL, dark)".
- **P12 · UX/Copy.** "A parked key is offered back" has no strings and no UI. Restoring an earlier business day's service as the open one does not say which day its Z closes.
- **P13 · Feasibility.**
  - The `api-base.js` wrappers are cited at ":73-116". They actually run from `:73` (fetch) to `:175` (WebSocket at `:167`).
  - "Injected after API_BASE_TAG" applies to all four app pages, while the source pages already carry the tag first, so it loads twice unless the script guards against that.
  - `tenant-gate-test` covers only the web page, not the app bundle with its absolute API URLs.

## 5. Checked and found correct

**Citations at 31c94529**
- The census: 52 pages, split 18/18/11/1/4, confirmed with my own script. The Next chunk is linked with `data-precedence="next"`, and `_headers` serves `/_next/static/*` as immutable.
- `pairing-commit.js`: `:76`, `:86`, `:92`, `:100`.
- `caisse-pairing.js`: `:220`/`:222`, `:244`, `:315`, `:370`, `:527`/`:537`, `:662`.
- `live-link.js`: `:805`, `:972`, `:979`.
- `redeem.js` looks up the merchant before the single-use `UPDATE`.
- `auth-guard.js` and `entitlements-v2.js` capture `fetch` at load, so loading the gate first is right.
- The service worker passes `/api/` straight to the network.

**Spec content**
- Contrast pairs recomputed (9.61, 4.63, 3.03, 3.42, 5.36, 6.66, 5.12 and others).
- The six formatter vectors run through Chromium 152's `Intl` via check 1.
- Revision 12's polish items are fixed: P1, P2, P4, P5, P6 and P7.
- The delta scope is consistent across §6.3, §10.21, §10.22, §10.33, §18.6 and §18.9.

**Preview, in Chromium 152**
- Fixture checks pass 17 of 17, the mutation self-test catches 113 of 113, and the kit tests pass (icons 248 of 248, face 136.1).
- My own mutations were all caught:
  - Kiwi AI card: "less" changed to "more"; its order count; its revenue; its delta.
  - Customers: the contactable count; the known-customer count; Leila's city.
  - Home on the SE: the average basket; the card share.
  - Till: the sold-out mark, in both directions; the bill header's table.
  - Orders: the basket; the summary; the refund marker.
- The frames use tokens only.

**Housekeeping:** the server on port 8791 is stopped, the browser tab is closed, the scratch files are deleted, and no repo file was edited, staged or committed.
