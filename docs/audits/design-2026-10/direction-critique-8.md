# Critic review: Kiwi design 2027 direction (round 9, revision 8)

## 1) Scorecard

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Visual design | 8 | The frames match their coordinates to the point. But the kit's Arabic font stack is specified two ways that contradict each other (M4), and §10.22 says "two gridlines" while the F4 rule draws three. |
| 2 | UI | 9 | Where the Other-percentage tip keypad renders is undefined against §10.4. Expected appears twice on the cash count before the first entry. |
| 3 | UX | 7 | Every demo till, and any store with Live Link off, would show a permanent "not sent" warning that Send now cannot clear (M1). A failed till autosave is signalled for 1.1 s and then nowhere (M2). |
| 4 | Motion | 10 | No findings. Spring constants, lens timing, shared-element arithmetic and reduced-motion frames all reproduce. |
| 5 | Feel and haptics | 10 | No findings. The map follows the one-haptic-per-gesture rule, F13 is fixed, and every native call site cited is accurate. |
| 6 | Copy and language | 7 | The formatter as specified cannot produce the §6.3 table (M3). The F2 fix put "Your password wasn't changed" on the link-check screen. The AR free-table name breaks the glossary. |
| 7 | Accessibility | 9 | The VoiceOver name for a free table says فارغة while the tile and legend say متاحة. Every contrast figure I recomputed matches. |
| 8 | Honesty and consistency | 7 | §18.0 again claims every drawn figure is checked, but six fixture-derived things I mutated stayed green (M5). §18.7 contradicts §10.13 on the Kitchen badge. §6.3 makes a false claim about CLDR. |
| 9 | Performance | 10 | No findings. Gzip bases re-measure exactly: 34,611 and 46,794 B. |
| 10 | Feasibility and migration safety | 7 | `kit-in-host-test` would enforce a host font stack that §6.1 forbids (M4). No locale tags are named for `Intl` (M3). The new `savedLocally` field has an undefined path. |

## 2) Verdict

**FAIL.** Seven dimensions are below 10.

## 3) Rebuttal rulings

- **Rebuttal 1 (largest-remainder `shareWeighted`): ACCEPT.** `kiwi-caisse.html@31c94529:13490-13506` allocates the leftover cents by largest remainder, ties to the earlier index, and the split already uses it at `:13611`. The worked example reproduces: −19.50 and −3.50, shares 175.50 and 31.50, sum 207.00.
- **Citation note on F11: ACCEPT.** `functions/api/team/live.js@31c94529:147` is the 503 `not-configured` and `:149` is the 400 `bad-json`, which is what §10.34 now maps.

## 4) Findings, ranked

### M1 · MAJOR · §10.26 sync indicator and paid line; §18.0 check 15 "refused" case
- **Finding:** `sale-sync-unavailable` is treated as an outbox refusal. It is also what every sale gets when Live Link is off.
- **Evidence:**
  - `postSale` returns `undefined` when `!on()` (`live-link.js@31c94529:806`).
  - `on()` defaults to `realEnv()` (`:64-71`), so it is off on every demo till and on any store that set `kiwiLive='0'`.
  - `recordSale` then sets `saleSyncError = 'sale-sync-unavailable'` on every sale (`kiwi-caisse.html:14735-14737`), and `reconcileJournalSales` does the same on replay (`:16089-16093`).
  - Under §10.26, every such sale shows "Saved on this till" plus a persistent `sync.not_synced` "{n} sales on this till only, not sent".
  - `sync.send_now` replays through the same `postSale`, so the count never falls.
  - The App Store frames are demo tills (§17.4; `final/iphone-6.9/03-till-bill.png` is a demo takeaway bill), so the store listing would ship this warning.
- **What a 10 looks like:**
  - Distinguish "not applicable" (Live Link off, no tenant, or an amount `postSale` skips) from "refused". Today that difference shows only as `posted === undefined` versus `{ok:false}`.
  - Hide the indicator when `KiwiLive` is off, or give it its own neutral state.
  - Add a check-15 case and a mutation for it.

### M2 · MAJOR · §10.26 item 3, F1 fix
- **Finding:** A failed autosave on its own has no persistent state.
- **Evidence:**
  - `sync.screen_only` lives only inside the paid moment, which lasts 1100 ms and "never takes a tap".
  - The persistent signals key off `saleSyncError` or `storageError`. When `persistShift` fails but the outbox queues (the small write-ahead copy fits while the whole-service blob does not), or on the merchant-mismatch early return at `:22699-22710`, neither is set.
  - Every later sale then misses the till journal and the Z, and nothing on screen persists to warn the cashier.
  - The spec's own copy asks "Keep the till open", then removes itself.
- **What a 10 looks like:** a persistent `savedLocally=false` state (banner plus indicator row) until a `persistShift` succeeds, covered by `sale-unsynced-test`.

### M3 · MAJOR · §6.3 `KiwiFormat`, §9.6
- **Finding:** The mechanism the spec states cannot produce the output table it specifies, and one supporting claim is false.
- **Evidence (measured in the preview browser's ICU):**
  - Line 412 says "CLDR gives French and Arabic a narrow no-break space". That is false for Arabic.
    - `ar` gives "19,174.50".
    - `ar-MA` gives "19.174,50".
    - Neither gives U+202F, so replacing U+202F alone cannot yield the §6.3 AR "19 174".
  - Both AR percent outputs carry U+200E, which §6.3 bans.
  - `Intl.DateTimeFormat` for `ar` gives "الاثنين، 12 أكتوبر" with an Arabic comma, not the table's "الاثنين 12 أكتوبر".
  - Every locale gives hyphen-minus, not U+2212.
  - No locale tags are named anywhere. The preview's hand-built month names are Moroccan (ماي, يوليوز), which implies `ar-MA`, but `ar-MA` groups with ".".
- **What a 10 looks like:**
  - Named tags per language, for example `en-GB`, `fr-FR`, `ar-MA-u-nu-latn`.
  - The full post-processing list: grouping to U+00A0, stripping U+200E, U+200F and U+061C, minus to U+2212, the percent spacing, and the date comma.
  - A test-vector table that check 1 and `KiwiFormat` both use.

### M4 · MAJOR · §6.1 versus §6.5 and §20.2 (font stack)
- **Finding:** The kit's font stack is specified two contradictory ways, and a test enforces the wrong one.
- **Evidence:**
  - §6.1 sets the kit stack to `"Inter Tight", "Inter Tight Fallback", "Kiwi Arabic"`, with Plex limited to Arabic code points by `unicode-range` and `size-adjust: 108%`. Digits and "MAD" come from Inter Tight.
  - §6.5 says kit components inherit `--k-font: var(--sans)`, and `kit-in-host-test` requires `font-family` to equal the host's resolved `--sans`.
  - On every Arabic page, `tokens.css@31c94529:153` sets `--sans: "IBM Plex Sans Arabic", "Inter Tight", …`: Plex first, unadjusted, without the Arabic-only range.
  - So during migration the test would require Arabic digits in Plex at 100%. Every AR width in §6.6 assumes the opposite, including the guest chips at 310.6 of 312.
  - The preview draws the §6.1 version, so it does not show what the test would enforce.
- **What a 10 looks like:** the kit sets its own `--k-font` from `tokens-2027.css`, independent of the legacy `--sans`. The test asserts that stack, and the two Plex family names are reconciled.

### M5 · MAJOR · §18.0 claim versus the preview's checks
- **Finding:** §18.0 says "Every figure, name, time and label that §18 draws … comes from one fixture", and that every drawn figure is compared. These mutations all left 15/15 green:
  1. Today's line ending at y 90, about 13,000 MAD, under a key figure of 19,174.
  2. Yesterday's 17:39 point moved from 20,301 to about 11,000.
  3. The same on the SE frame and the AR frame.
  4. The now-dot moved to x 260, about 18:40.
  5. The "20K" gridline relabelled "25K", and the "17:00" axis label changed to "18:00" (axis labels come from the cutoff, §10.22).
  6. The notification badge "3" changed to "9" on all Home frames. "3 unread" is a fixture fact in §18.0, yet the embedded fixture has no `notifications` source.
  7. The AI source chip "Sales · today" changed to "Sales · yesterday".
- The chart is the worst of these: it can contradict the key figure printed directly above it.
- **What a 10 looks like:**
  - Check 14 also derives each line's 17:39 value from the tallies through the plot scale, the now-dot's x from `now` and the cutoff, the gridline values and positions, and the axis labels.
  - A `notifications` source in the fixture, with the badge checked against it.
  - Matching mutations for each, or the claim narrowed to what is checked.

### P1 · POLISH · §18.8 R4 versus the `ob.reset.failed` copy
The F2 fix changed `ob.reset.failed` to "Your password wasn't changed. Try again.", but R4 still uses that key for a GET 503 while the link is being checked, before any password has been entered. The key's usage note (line 1220) lists three uses and omits R4. A 10 gives R4 its own copy, for example "Couldn't check this link. Try again."

### P2 · POLISH · §9.6 `floor.table_free_a11y` AR
It uses فارغة, but the glossary (§9.1) and `floor.status.free` use متاحة. VoiceOver and the legend disagree, which breaks rubric 10. A 10 uses متاحة, or interpolates `{status}`.

### P3 · POLISH · §18.7 line 2905 versus §10.13 and check 5
§18.7 says "All … 3 + 6 = 9, which is also the till rail's Kitchen badge". §10.13, §18.3 and check 5 say the badge is New only (3), and mutation 37 requires 9 to fail. A 10 deletes the stale clause.

### P4 · POLISH · §10.22 anatomy
It says "Two hairline gridlines". The F4 rule plus round 10K steps draws three in the fixture (30.1K, 20K, 10K), as all three Home frames show. A 10 restates the anatomy as "the band-edge gridline plus 10K steps".

### P5 · POLISH · §18.8 banner geometry
The banners are measured "in the SE's 303 sheet". 303 is the L-button label budget (343 − 40, §6.6), and onboarding is a full page at 343, not a sheet. The real message width is 283, not 243, so the line counts are conservative but the geometry stated is wrong. A 10 measures at the real banner width.

### P6 · POLISH · §10.26 `savedLocally` on the receipt-return path
When `paidReceiptForCurrentTable` returns an existing entry (`kiwi-caisse.html:14550-14553`), no `persistShift` runs, so `entry.savedLocally` is undefined or stale. Undefined would read as `screen_only` for a receipt that is already stored. A 10 defines this path.

### P7 · POLISH · §10.26 tip "Other percentage" versus §10.4
§10.4 says "A popover never holds a keypad", but `pay.tip.other` "opens the cash keypad" from inside the tip popover without saying where. In the regular form the pane already holds the Received keypad. A 10 states where it renders and what happens to the Received entry.

### P8 · POLISH · §18.9 Expected shown twice
Before the first entry, the Display slot shows Expected while the summary keeps Expected on its Heading line, so the same figure appears twice on one sheet. The opening-float use of "the same component" also has no stated key figure. A 10 hides the Heading line until the crossfade and names the opening sheet's key figure.

### P9 · POLISH · §10.34 error state
"No code (never a stale one)" applies to a failed 10 s poll too, so one network blip erases a code the server still accepts for minutes. A 10 keeps showing the code until `expiresTs`, with an inline "couldn't refresh" line.

## 5) Checked and found correct

- **Preview self-tests:** 15/15 checks pass and 58/58 mutations go red. Fonts load with the right face (reference label 136.1). Mutations 42 to 58 are real.
- **My own mutations caught correctly:** sold-out tile, Harira sold out, customer city, contactable count, AR "of 9", See all, bill staff, Orders staff, lifetime spend, tile price, bill total, primary count.
- **Fixture arithmetic:**
  - All table and order totals from menu prices.
  - Ticket ages and states.
  - Station counts 7, 2, 2, 4.
  - Open-order times.
  - Day tallies: 19,174, 66 %, −5.6 %, basket −13.
  - Close: 25,310, expected 8,920, counted 8,902, difference −18.
  - Customer partition dates (74 and 91 days); Monday 12 October 2026.
- **Geometry:**
  - §18.1 and §18.11 bands and gaps.
  - §18.3 bill and payment coordinates, which DOM-measure exactly in the preview; the compact (578) and compact-short (514) arithmetic.
  - §18.4 plan scale 1.1245 and table positions, which match the preview exactly; the refit and overlay table for six devices; tile-form heights.
  - §18.7 ticket heights and lane fill (834, 670, 537, 166).
  - §18.10 pad layout; §13.3 menu columns; §10.25 key widths.
  - KDS visual angles (22.9, 14.5, 17.6 and 15.9 arcmin).
- **Fits (re-measured with the page's fonts):** `sync.screen_only` 287.5 and 374.9; `ob.reset.failed` 284.6 and 344.4; FR `ob.offline` 549.1; capsule EN and FR at all four factors; compare control EN 304.5; date button 164.3.
- **Contrast:** recomputed ink-3, line-strong, on-accent, danger-solid, warning-solid and the neon or mint claims (measured on s1). All match.
- **Code citations at 31c94529:**
  - `persistShift` (:22692-22793) and `recordSale` (:14550-14746); `enqueueMoneyBody` (:750-800).
  - `shareMoney` and `shareWeighted`; the paid-moment haptics (:11384-11405); `markSplitPartPaid`.
  - `_lib.js` 1193, 1235, 1268, 1272, 1292, 1352, 1359, 1392, 1436.
  - `employee.js` 295, 336, 340, 344, 361, 369, 491, 497, 523; `pair/redeem.js` 106, 153, 158.
  - `sale/cancel.js` 276-282; `pin/verify.js` 41-58; `team/live.js` 147-176.
  - `native-runtime.css` and `native-shell.css` `@font-face` lines; 257 `!important` in `design-vexel.css`; gzip bases 34,611 and 46,794.
- **Reset routing at a3de3011:** `reset.js:71, 79, 82, 84, 90-91, 106, 109-110, 122-123, 130, 138-145` and `reset.html:323-333`. R5, R6 and §23.12 match the shipped server.
