# Design direction · round 16 critique of revision 15

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 9 | One polish item: the "after" SE frame draws its status-bar clock at 12 px, below the spec's 13 px floor and off the six steps. |
| UI | 10 | No findings. The roster step's states, the single primary, the busy Try again and the type steps all hold. |
| UX | 8 | Built as written, the till loses its shipped offline unlock and offline manager approval without saying so. Try again also shows before anything has failed. |
| Motion | 9 | §14.4 gives no transition for the roster step's exit into the till when the store has chosen no staff codes. |
| Feel and haptics | 10 | No findings. The map, the one-haptic rule and the lock's haptics all check out. |
| Copy and language | 8 | `pin.offline` ("Codes are checked online") and `pin.manager.offline` are false for the shipped till. The roster lines promise a lock that R9 says a reload breaks. |
| Accessibility | 8 | The PIN pad's error states have no rule for announcing them, and R8 contradicts the pad's own live region. R6 also asserts a focus position that the entry rule contradicts. |
| Honesty and consistency | 7 | Two majors: the "codes are server-only" premise is false at 31c94529, and every preview icon check reads a metadata attribute instead of the glyph actually drawn. |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 9 | The census rule fails the kit's own two-file Inter Tight. The 10 s retry interval's no-overlap argument does not hold. |

## 2. Verdict

**FAIL.** Seven of the ten dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (largest remainder, ties to the earlier share): ACCEPT.** I re-read `shareWeighted` at `kiwi-caisse.html@31c94529:13490-13506`. It floors each share, sorts by `b.frac - a.frac || a.i - b.i`, and hands out the leftover cents in that order. Tips use it at `:13611`.
- **Rebuttal 2 (no Cancel in the roster step): ACCEPT.**
  - The till is already paired with the service's store, so the pad step cannot return.
  - R6 makes a verified roster the only exit.
  - Every check is bounded at 8 s, and Try again stays live and focusable throughout.
  - A Cancel with nowhere to lead would be a control that does nothing, which breaks the brief's own honesty rule.

## 4. Findings, ranked

### Major

**M1 · major · §23.2, §10.2 network rows, §9.6 `pin.offline` / `pin.manager.offline` and the codes lint, §10.26 line 2250 · "codes are server-only" is false at 31c94529**

- **What the spec says:**
  - §23.2: "a locked till cannot unlock offline (codes are server-only). The pad says so (`pin.offline`)."
  - §10.2's network-error rows disable the keys for the till lock and the manager pad.
  - The new lint's rationale says "A four-digit code is compared on the server only".
  - The lint table also says "`pin.offline` 'Codes are checked online' is true".
- **What the shipped till does instead** (`assets/caisse-pairing.js@31c94529`):
  - `:50-56`: "A candidate typed offline is hashed again and compared locally".
  - `:75-100`: `rememberOfflinePin` stores a salted SHA-256 verifier of each code proven online, kept 7 days, at most 12 rows. `verifyOfflinePin` compares against it.
  - `:921-923`: `verifyCode` calls `rememberOfflinePin` on success and `.catch(function () { return verifyOfflinePin(merchant, code); })` on failure.
  - `verifyCode` is the single path for the till pad, `authorizeTill` and `authorizeManager` (`:941-962`). So a discount is approved offline today through a role read from the cached row.
  - `:653-657`: `askStaff` shows the pad offline when verifier rows exist. The spec cites `:652-660` but treats only its fallback branch.
  - The file's own comments at `:888-889` and `:939-940` say the opposite of what the code does, which is likely where the spec's premise came from.
- **Consequence, built as written:** one of two things happens.
  - The till silently loses offline unlock and offline discount approval, a regression for an offline-first POS that §22 "What is deleted" never lists.
  - Or the shipped fallback stays, and `pin.offline` tells a cashier "this screen can't unlock yet" on a pad that does unlock.

  Either way, the owner is asked to rule on decision 2 on a false premise.
- **What a 10 looks like:**
  - §10.2 states the shipped offline verifier.
  - §23.2 asks the real question: keep the 7-day offline unlock and offline manager approval, or remove them. If removed, §22 lists it.
  - §10.2 has an offline row per use that matches the decision.
  - `pin.offline` and `pin.manager.offline` say what is true.
  - The codes lint's rationale is corrected.

**M2 · major · preview checks 1 and 13, §18.0's claims for them · every drawn icon is unchecked**

- **The check reads a label, not the drawing.** The checks read the `data-i` attribute on the wrapper span. The glyph is painted by `<use href="#i-…">`, and nothing compares the two.
- **My sweep:** I swapped the `href` of each of the 132 drawn icons across the 8 frames. 0 of 132 turned any check red. That includes:
  - every Home delta arrow and compare arrow, on all three Home frames (down swapped for up);
  - the Orders method icons (`credit_card` swapped for `payments`);
  - the Floor status icons (`receipt_long` swapped for `check_circle`);
  - the till option marks (`tune`).
- **Removing the VIP star glyphs entirely** stays green.
- **Changing only `data-i`**, which paints nothing, turns check 13 red with "T9 draws the check_circle icon". The message says "draws", but what it read is metadata.
- **Polarity colour is unchecked too.** I moved the compare arrow from `dang` to `acc` on all Home frames and it stayed green, although §10.21 says arrow colour follows polarity.
- **What a 10 looks like:** checks 1 and 13 read the symbol each `<use>` actually references, plus the arrow's computed colour against polarity. Mutations swap the `href`, not the label.

**M3 · major · §10.2 Rules (line 1691), §10.26 pad step (2234), R8 (2300) · PIN pad errors are not announced, and R8 contradicts the pad**

- **No announcement rule for errors.** The pad's only live-region rule announces `pin.progress`. Nothing announces the message row (anatomy item 5) when it shows `pin.wrong`, `lock.store.wrong_store`, `pin.offline`, `pair.invalid`, `pin.paused.*` and so on.
- **iPad users get nothing.** iPads have no haptic engine (§15.0), so a VoiceOver cashier on an iPad gets no signal that a code was refused. That breaks WCAG 4.1.3, the same criterion the spec applies to its banners.
- **R8 is false as written.** R8 and the pad-step rule say the lock's "only live region is the roster step's own line" and "no live region is written while it shows". But the pad step contains the pairing pad, whose `aria-live` progress region is written on every digit. `banner-announce-test` built from R8 would fail, or would strip the pad's progress announcement.
- **What a 10 looks like:**
  - The message row is a live region, present and empty at load, that is written once per server answer. Errors are polite or assertive by a stated rule.
  - R8 names the pad's region as allowed in the pad step.
  - A test asserts that each refusal is announced.

### Polish

| # | Section | Finding | Evidence | What a 10 looks like |
|---|---|---|---|---|
| P1 | §10.26 R6 vs "Focus and announcement" | R6's held-back case asserts "Try again focused and `aria-busy`". On entry, though, focus moves to the title, and the first request (the one sent at pair-back) is the held-back case mutation 129 targets. "Focus stays on Try again throughout" never says throughout what. | Lines 2270, 2272 and 2298 | R6 asserts focus on the title for the pair-back request and on Try again only after the cashier presses it. |
| P2 | §10.26 answer table, "Checking" row | On the first request a busy "Try again" is shown before anything has failed. The label offers a retry of a request that has not failed yet. | Line 2245 | No button until the first failure, or a neutral busy state. |
| P3 | §10.26 Retries | "The interval is longer than the 8 s timeout, so two requests never overlap" holds only when nothing else starts a request. A Try again between ticks, or an `online` event during a request, can collide with the 10 s tick. It is also unstated whether a cashier's tap that joins an automatic request is announced when it fails with the same cause. | Lines 2259 and 2261 | The tick is skipped while a request is in flight, or rescheduled from each request's end. A joined request counts as cashier-caused for announcing. |
| P4 | §9.6 `lock.roster.*` vs R9 | Both lines say the service "stays locked" until the roster loads. R9 says that after an autosave, a reload opens the service with no verified roster. A cashier stuck on this screen is the one most likely to reload. | Lines 1254-1255 and 2301 | Copy that holds across a reload (for example "Keep this till open"), or R9 made true. |
| P5 | §6.5 line 721 and §6.1 census rule | The test "fails if … one family from two URLs is requested", or for "overlapping unicode-ranges". The kit's own Inter Tight Latin and Latin Extended faces are one family from two URLs, and their ranges overlap (U+0304, U+0308 and U+0329 are in both; U+2020 is in Latin Extended and inside Latin's U+2000-206F). Any Latin Extended character in merchant data trips the gate. | fontsource `index.css:58` and `:68`, matching the §6.1 block | Scope the rule per weight and per character, with the fontsource overlap named as allowed. |
| P6 | §14.4 | The lock's transitions cover pad step to roster step, and either step to the staff pad. The lifecycle's third exit, into the till for a store with no staff codes, has no transition and no reduced-motion row. | Lines 2287 and 2640 | The exit is named (for example a `--k-dur-2` crossfade) in §14.4 and §14.5. |
| P7 | §6.1 P13 paragraph | The paragraph says "only the folder in each `url()` differs". The preview's file names differ too, and the preview's own comment says so. | Line 476 vs preview lines 8-9 | Both say the same thing. |
| P8 | Preview SE frame | `.se .sb{font-size:12px}` draws the status-bar clock at 12 px, below the 13 px floor and not one of the six steps. The 440 frames draw it at 17. | Preview CSS line 93; measured computed sizes on the SE frame: 44, 28, 20, 17, 13, 12 | Draw it at a step, or mark the OS chrome as excluded from `type-steps-lint`. |

## 5. Checked and found correct

**Round 15 majors, verified as fixed:**
- **M1:**
  - `rosterPending` has one definition, used word for word by the predicate, the lifecycle table and the preview's `rosterPending`/`lockStep`.
  - The in-flight state shows `state.checking` with no cause line.
  - The 8 s timeout reads as no connection, and a non-JSON body as a server error.
  - Mutations 129 to 133 all go red, and `why()` gives the right reason for each.
- **M2:** both roster lines now name only the staff list. My lint reimplementation passes. `config.js:11` confirms the roster is names and roles only.
- **M3:**
  - Corpus coverage: every non-Arabic character is in Inter Tight and in both the macOS and the iOS 26.5 `WebFonts/Arial.ttf`, and every Arabic character is in Plex. My corpus came to 140 characters (spec: 141).
  - U+202F is in neither Inter Tight nor Arial, and is banned.
  - The cmap counts hold: Inter Tight 231, Plex 676 plus 5, Arial 235 Arabic code points.

**Fonts:**
- All six preview fonts are byte-identical to the fontsource files. Sizes: 44,872, 89,800, 42,848, 45,296, 45,688 and 44,280 B.
- The ranges match `index.css:58` and `:68`.
- The spec's `@font-face` block matches the preview's, descriptor by descriptor.
- Inter Tight's U+00A0 advance equals the space (480/2048).
- The hhea metrics give 99.9% and 24.9% at a 97% `size-adjust`.
- Every stack is quoted correctly at 31c94529: `tokens.css:125-130` and `:153`, `native-shell.css:4-7`, `:13`, `:29`, `native-runtime.css:1-8`.

**Formatter:** all 17 vectors pass in all three languages, assembled independently from `formatToParts`, in Chromium 152 and in macOS JavaScriptCore. Raw ICU fr-FR emits U+202F as its group separator, as stated.

**Strings:**
- The §9.6 table has 453 rows and 443 Arabic strings.
- My reimplementations of the French-punctuation, U+202F, الفاتورة, bill/account and roster-code lints all pass.
- 3,608 = 451 × 8.
- AR `ob.create` measures 124.71 px; `bill.send` measures 136.45 px (AR) and 136.09 px (EN).

**Colour and motion:**
- Every WCAG ratio in §5.3 that I recomputed matches.
- Spring settle times: 308/308/300, 333 and 367 ms. Revision 2's spring: 508/500/500 ms.

**Preview:**
- 17 of 17 checks and 133 of 133 mutations go red.
- Every one of the 453 text nodes inside `data-fx`/`data-k` is genuinely checked (my sweep: 0 stayed green).
- The before images are scaled copies of the real captures.
- Kit self-tests pass at desktop width. One run in a 287 px hidden tab reported a failure that I could not reproduce at 377 or 1440 px, so it is not listed as a finding.

**Code citations at 31c94529:**
- `caisse-pairing.js:221`, `:376`, `:621-632`, `:652-660`;
- `pairing-commit.js:92-95`;
- `kiwi-caisse.html:14014`, `:15749`, `:15752`, `:16189`, `:16305`, `:22690`, `:22693`, `:22713`, `:22792`, `:22827`, `:23159`;
- 19 server error codes in `_lib.js`, `employee.js`, `pair/redeem.js`, `sale/cancel.js` and `team/live.js`.

**Haptics:** the map follows the one-haptic-per-gesture rule. The lock and roster step fire nothing except Failed on a wrong store's code.

**Housekeeping:** the HTTP server on port 8851 is stopped. I closed tab-23, the only tab I opened. I deleted only the `critic15` scratch subfolder. Nothing in the repo was edited, staged or committed.
