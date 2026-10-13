# Critic review: Kiwi design 2027 direction (round 8, revision 7)

## 1) Scorecard

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Visual design | 9 | The frames are disciplined and on-brand, but the chart's top gridline isn't at the band edge that §10.22(2) and §18.1 require. |
| 2 | UI | 9 | The kit, capsules and keypad all re-measure to within 0.1 px. The desktop height rule in §18.3 contradicts itself below 578 px. |
| 3 | UX | 8 | The paid moment tells the cashier the sale is saved on the device when, if storage is full, it may exist only in memory. |
| 4 | Motion | 9 | Spring maths reproduces: 308/308/300 ms, ζ 0.9996, no overshoot. One polish item: the payment-method radio rows have no stated feedback. |
| 5 | Feel and haptics | 9 | The one-per-gesture map holds and every citation checks out. The radio-row gap is the only miss. |
| 6 | Copy and language | 8 | The R5 "update failed" text says the link can't be reused, which has been false since e5639388. The AR `badge.new` cell uses the wrong plural form. |
| 7 | Accessibility | 9 | Every §5.3 contrast value reproduced exactly. The free-table accessible name has no key, and the §18.8 type steps leave out Callout banners. |
| 8 | Honesty and consistency | 7 | The fixture checks claim more than they verify: eight mutations of mine stayed green. The storage-full saved copy is also an honesty problem. |
| 9 | Performance | 9 | Measured budgets hold. The `caisse-lang.js` and `i18n.js` gzip basis figures are stale. |
| 10 | Feasibility and migration safety | 8 | Stage 1 relies on an R5 fallback that main has already outdated, and §21.1 references a token that no longer exists. |

## 2) Verdict

**FAIL.** No dimension reaches 10.

## 3) Rebuttal ruling

- **Rebuttal 1 (largest-remainder `shareWeighted`): ACCEPT.** The arithmetic reproduces, the shares sum exactly, and the tie-break is deterministic. Rounding each share separately would break the total, so the method is correct.

## 4) Findings, ranked

**F1 · MAJOR · §10.26 B1 item 3, paid moment, §9.6 `sync.saved_here`**
- **Finding:** When the outbox write fails with `queue-storage-full`, the paid moment still says the sale is saved on this till and safe on the device. That isn't guaranteed. The sale may exist only in the open page's memory.
- **Evidence:**
  - `assets/live-link.js` `enqueueMoneyBody` returns `{ok:false, reason:'queue-storage-full'}` when the localStorage write-ahead (`qWrite`) fails, and it fails before the IndexedDB enqueue is ever attempted.
  - `persistShift` (kiwi-caisse.html@31c94529:22692) writes `localStorage.setItem(KC_STORE, …)` into the same full store, and its error is swallowed at 14697.
  - So on that path neither the outbox nor the journal is durable. The spec's own storage banner says "the open page can be the only copy", and the paid moment contradicts it.
- **What a 10 looks like:** A separate string for storage-full and enqueue-failed, something like "Recorded on this screen only. Keep the till open." Show `sync.saved_here` only after `persistShift` confirms the write succeeded. Add a fixture check and a mutation for that branch.

**F2 · MAJOR · §18.8 R5 "update failed", §23.12 fallback, judged before and after e5639388**
- **Before e5639388:** correct. A failed account update left the token consumed, so "this link can't be used again" was true.
- **After e5639388:** wrong. `reset.js` now runs `UPDATE reset_tokens SET used_ts = NULL WHERE selector = ? AND used_ts = ?` on failure, but it still returns plain `{error:'update-failed'}` with status 500 and no `retry:true`. The design sends every 500 to R5 (§23.12). The page therefore says the link is dead when it works again, and pushes the merchant to request a new e-mail for nothing. R6 is never reached because it requires `retry:true`.
- **What a 10 looks like (either option):**
  - R5 copy that is true in both worlds, for example "Your password wasn't changed. Try again, or ask for a new link."
  - Or stage 1 returns `retry:true` exactly when the rollback's `meta.changes === 1` and routes that to R6. If the rollback threw, the response stays on R5.
- **Polish rider:** `reset.js:117-123` turns an exception during token consumption into `400 invalid`, and the design describes every 400 as "used, expired or unknown". A database fault is none of those. Either the copy covers it or the route returns 5xx.

**F3 · MAJOR · §18.0 fixture checks overclaim coverage**
- **Finding:** The §18.0 text says the checks hold the "after" frames to the fixture. In practice many fixture-derived strings are unguarded. These mutations, applied in the browser, all left every check green:
  1. Date changed to "13 October"
  2. Compare baseline changed to "yesterday at 17:38"
  3. Legend changed to "Yesterday at 16:39"
  4. AI timestamp changed to "Today at 18:39"
  5. Rail cashier changed from Othmane to Karim
  6. Orders hour group changed from 16:00 to 15:00
  7. T4 status icon swapped to `check_circle`
  8. VIP star removed
- **Also:** Tile badges and options are unchecked. Check 4 can't verify the lines of tickets 43, 46, 47, 48 and 50 because they have no linked record.
- **What changed state did go red:** fixture `date`, `now` and `yesterday`, and the city mutations.
- **What a 10 looks like:**
  - Check 1 derives the date, baseline time, legend time and AI time from `FX.date` and `FX.now`.
  - New checks bind the rail cashier, hour groups, floor status icons, VIP marks and tile badges to the fixture.
  - Each new check gets a matching entry in the 41-mutation self-test.
  - The tickets without records get line data in the fixture, or check 4's claim is narrowed.

**F4 · POLISH · §10.22(2), §18.1, §18.11 chart top gridline**
- **Finding:** On `t-home`, `t-home-se` and the AR mirror, the gridlines sit at 10K and 20K (absolute y about 428 and 390). The data maximum, which is the band edge, is at y 352, so the top gridline isn't at the band edge as the rule requires.
- **What a 10 looks like:** The top gridline lands on the band edge with a label (or the rule is restated), in all three frames, and a check holds it.

**F5 · POLISH · §18.3 desktop height row**
- **Finding:** The row says "below 578 the summary column scrolls while the keypad column stays whole". But the keypad column itself needs 578, and the spec also says the keypad never scrolls. Below 578 both statements can't be true.
- **What a 10 looks like:** A defined form below 578 (keypad step-down or the compact form), with the switch height stated.

**F6 · POLISH · §21.1 stage 1:** It references `var(--kiwi-native-latin)`, which §6.5 no longer defines. A 10 names the current token.

**F7 · POLISH · §19 size basis:**
- `caisse-lang.js` gzip 46,058 is the f249411e figure; at 31c94529 it is 46,794 (both measured the way §19 measures, minus 9 bytes).
- `i18n.js` measures 34,611; the spec says 34,619.

A 10 re-bases both figures on the cited commit.

**F8 · POLISH · §18.8 type steps 4:** Callout banners are missing from the list of what scales. A 10 lists them, with their measured fit.

**F9 · POLISH · AR `badge.new`:** The cell shows the "few" plural form, but the stated convention is "other". A 10 uses the "other" form, or documents the exception.

**F10 · POLISH · free-table accessible name:** "Table 7, Free, 4 seats" isn't backed by an i18n key, so it can't move with FR, EN and AR. A 10 gives it a key in all three languages.

**F11 · POLISH · §10.34 error states:** The 503 `not-configured` (`reset.js:79`) and 400 bad-JSON responses have no designed state. A 10 maps each to a designed screen or names the fallback.

**F12 · POLISH · §18.9 close-out hierarchy:** The size of the key figure isn't stated, and Expected and Difference are set in the Heading style, which is smaller than the Title-style keypad digits. For the cash close the reconciled figure should be the largest thing on screen (brief rubric 1). A 10 states that size and makes Difference dominant.

**F13 · POLISH · payment-method radio rows:** No haptic class is stated. By the map they look like Choose. A 10 says so.

## 5) What I checked and found correct

- **Preview self-tests:** 11/11 checks pass, 41/41 mutations are caught, and the kit self-tests pass (231 icons, segment hit size 44, face probe 136.1 ± 0.3, negative controls). The checks are real, not decorative.
- **§6.6 measured fits and capsule factor table:** all re-measured to within 0.1 px (Compare EN 304.6, FR 329.6, EN month 318.3, FR month 380.4).
- **Spring maths (python):** 200 → 308/308/300 ms, 400 → 333 ms, 880 → 367 ms, rev2 508/500/500 ms, ζ 0.9996, no overshoot.
- **Contrast (python):** every §5.3 value reproduced exactly, including the chrome typical and worst cases.
- **Fixture arithmetic and geometry:** §18.1, 18.3 (apart from F5), 18.4 refit table, 18.6, 18.7, 18.10 and 18.11, plus keypad widths, menu columns and visual angles.
- **Cash-close maths:** matches `day-report.js:717-719`, with cash net of refunds and the tips terms included.
- **Code citations, all accurate:**
  - Haptic lines in `native-runtime.js`, the 14 vibrate sites, Swift lines 145/334/936, `Haptics.swift`, `definitions.d.ts`
  - `liquid-lens.js` lines 74, 154-160 and 215
  - Tips (11018-11030) and the step-0.5 inputs; `DISCOUNT_REASONS` at `sale.js:80`; `requireManager` at 18166; chips at 7058-7061
  - Bridge pair code at `bridges.js` 152-169; `live.js` 152-176 and `mutateDoc`
  - pbxproj deployment target 15.0; the vexel `!important` at 257; font sizes; @fontsource packages; the 8 pages carrying `tokens.css`
- **B1 replay path:** the stable ids, `INSERT OR IGNORE`, the `reconcileJournalSales` callers (16194, 16383) and the `onlyMissing` filter behave as the spec says. Only the storage-full branch (F1) is wrong.
- **R5 and R6 before e5639388:** correct as written. I did not raise "reset consumes the token before the update" against current main.
- **§23 owner items:** each has a fallback except §23.12, whose fallback is what F2 covers.
