# Critic review: Kiwi design 2027 direction (round 7, revision 6)

I served the preview on 127.0.0.1:8861 and a scratch measuring page on 8862. Both servers are stopped and the browser viewport is back to desktop. I did not edit, stage or commit anything in the repo.

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 8 | The geometry is strict and checks out. But the chart legend can collide with the data line, and selected tabs depend on filled icons that aren't vendored. |
| UI | 7 | The payment pane is 980 pt tall and doesn't fit an iPad in landscape. The tab-capsule table disagrees with itself, and the Kitchen badge label is wrong. |
| UX | 7 | Two dead ends: the "not recorded, try again" path double-books a sale, and the password-reset retry can never succeed. |
| Motion | 9 | The spring and lens timings are correct. One polish item: the 30 pt payment gap isn't a spacing token. |
| Feel and haptics | 9 | The haptics rule cites today's split-payment haptic as the model, but that haptic fires Success even when the share failed to record. |
| Copy and language | 8 | `pay.not_recorded` states something false. Also: a leading space, a composite title with no key, and `split.progress` described as a sum when it is a count. |
| Accessibility | 8 | The Kitchen badge reads "9 new" when only 3 are new. Selected-tab state is shown by icon fill alone, which doesn't render. |
| Honesty and consistency | 6 | The spec calls its cash-close formula "the shipped formula", but it isn't. "Nothing changes visually" in stage 1 is false. Some citations and font notes are stale. |
| Performance | 9 | Fonts are self-hosted and there's no new runtime cost. One caveat: the font-copy step runs before the CSS that still loads those fonts is covered by the bundle test. |
| Feasibility and migration safety | 7 | The bundle-manifest test as written fails against the build script. Stage 1 breaks the native shell's fonts. The money-path wording invites a double-booking bug. |

## 2. Verdict

**FAIL.** No dimension reaches 10, and one finding is a blocker.

## 3. Rebuttal rulings

- **M11, rounding by largest remainder: ACCEPT.** `shareMoney`/`shareWeighted` (kiwi-caisse.html:13478-13506 at 31c94529) already allocate this way, with ties going to the earlier index. Splitting 230 three ways gives 76.67 / 76.67 / 76.66, and the discount pro rata gives 19.50 / 3.50. The spec describes shipped behaviour, so this is not a finding.
- **B1 (dispatchers), B2 (segmented hit area), B3 (icons), B5 (tips), M4 (attendance CAS), M9 (reset 429/503), M10, M12, M13: ACCEPT as fixed.** Each citation resolves at 31c94529 (details in section 5).
- **B4 (fixture checks and mutation self-test): ACCEPT in part.** All 11 checks pass and all 24 mutations are caught, so the self-test is real. But it covers only the six checked frames, and it doesn't tie bill lines to the table's record (finding M5 below).
- **§6.6 "measured in Inter": REJECT in part.** The preview ships only `inter-tight-latin.woff2` and renders the after frames in Inter Tight with the §6.1 fallback tracking. It can't evidence the Inter column, and two margins are 0.6 px and 0.0 px.

## 4. Findings, ranked

### Blocker

**B1 · §10.26 item 3, §15.3, `pay.not_recorded`**
- **Finding:** The spec says that when the outbox reports `queue-storage-full`, "the sale was not recorded, so nothing is lost or doubled". The copy then tells the cashier "nothing was recorded. Try again".
- **Evidence:**
  - In kiwi-caisse.html, `recordSale` (14530-14753) pushes to the journal and calls `persistShift` before `KiwiLive.postSale`.
  - On `posted.ok === false` it only toasts and still returns the entry.
  - live-link.js `enqueueMoneyBody` returns `queue-storage-full` at :764, :767, :793 and :799, after the sale is already in the local books.
  - On a takeaway order, "Try again" has no `settlementTable` dedupe, so the retry books the sale twice.
  - On a table, `paidReceiptForCurrentTable` returns early, so the sale is never queued again and never syncs.
- **What a 10 looks like:** Pick one and say which:
  - Make the record transactional: write ahead to the outbox first, then journal, and roll back on failure.
  - Or treat this state as "recorded on this till, not synced". Use `sync.storage_error`, show a persistent unsynced badge, and offer no retry that can double-book.

### Major

**M1 · §17 rule 5, §18.0, §18.9, preview check 11: cash-close formula**
- **Finding:** Rule 5 says "Expected = float + Cash sales − Cash refunds + Cash in − Cash out" and calls it the shipped formula.
  - It leaves out cash tips, which §10.26 and §18.9 include.
  - It subtracts refunds from a cash-sales figure that is already net of refunds.
- **Evidence:** day-report.js:719 is `expected = round2(opening + cashSales + cashTips + movesIn - movesOut)`, with `cashSales` "déjà net des remboursements espèces". There is no refunds term. The fixture has 0 cash refunds, so the double subtraction never shows.
- **What a 10 looks like:** Quote the shipped expression verbatim: float + net cash sales + cash tips + in − out. Show refunds as an explanatory sub-line only. Add a fixture refund so check 11 would catch a double subtraction.

**M2 · §18.8 R6, password reset "update failed"**
- **Finding:** On a 500 `update-failed`, the spec says "Try again in a moment".
- **Evidence:** functions/auth/reset.js marks the token used (UPDATE `used_ts`, about :119-122) before the password update. The 500 at :133 fires after that, so any retry gets 400 invalid.
- **What a 10 looks like:** Route R6 to the R5 "link expired, send a new link" state, with a one-tap resend. Alternatively, record the spec dependency that the token is consumed only after the update succeeds.

**M3 · §18.3, §10.25, §13.3: payment pane height**
- **Finding:** The pane stack runs from 24 to 980 pt. iPad 11 in landscape is 834 tall and iPad mini in landscape is 744. The spec says "the keypad never scrolls", and the brief's rubric 2 says no scrolling to reach pay. No compact form is designed.
- **What a 10 looks like:** A specified compact stack for heights under about 1000. For example, collapse the tip and breakdown rows into the key-figure line, or move the keypad beside the summary. List the per-device heights the way §13.3 already lists the widths.

**M4 · §10.22, §18.1, §18.11: chart legend**
- **Finding:** The spec says the legend sits in the top-start corner, which "is always empty; never sits on a line".
- **Evidence:**
  - The legend is 213.5 of 343 px wide on the SE (62%) and 53% at 440.
  - The cumulative baseline enters the top band whenever it reaches about 82% of max before the legend's end x. A morning-heavy café does exactly that.
  - In the preview's SE frame, the dashed line passes about 3 px from the legend's end.
- **What a 10 looks like:** Place the legend by rule, outside the plot or above the y-max gridline with reserved headroom. Or test for collisions and move it, with the rule written down.

**M5 · Preview fixture checks: coverage gaps**
- **Finding:** The checks leave much of what is drawn unchecked:
  - Bill lines aren't tied to the table's record. Drawing Harira as 2 × 70.00, or swapping it for Soupe du jour 30.00, keeps 11/11 green while the lines no longer sum to the drawn 230.
  - Orders-list completeness is unchecked: removing #1203 stays green.
  - The SE (light) and AR frames aren't in `MOCKS`, though the spec says the checks cover "the text of its light frames".
  - Also unchecked: polarity colours, bill meta (guests, staff), waiter badges, seat counts, and customer sort order.
- **What a 10 looks like:** Check each drawn line against the fixture, plus the list length and sort order. Add `home-se` and `home-ar`, and a mutation for each.

**M6 · §21.3 bundle-manifest-test, stage 1**
- **Finding 1:** The rule "every file copied to www root from app/src/ is in nativeRuntime" fails at once. tools/build-app-www.mjs:44 copies `SHELL = ['index.html','native-shell.js','native-shell.css']` to the www root (:204).
- **Finding 2:** app/src/native-shell.css:4-7 declares `@font-face url("native-fonts/inter-tight-latin.woff2")` and the others. That file isn't in the CSS scan, and stage 1 deletes the `NATIVE_FONTS` entries (:49-56). The fonts break, so "nothing changes visually" is false until stage 6.
- **What a 10 looks like:** List SHELL in the manifest. Add native-shell.css to the scan. Move the font removal to the same stage that replaces those `@font-face` rules.

**M7 · §6.1, §6.6, preview typeface**
- **Finding:** The spec ships Inter, but the preview has no Inter file and renders the after frames in Inter Tight with fallback tracking. The tight fits (0.6 px, and 0.0 px for `floor.guests`) aren't shown in the shipped face.
- **What a 10 looks like:** Vendor `inter-latin.woff2` into the preview folder and render in Inter. Have `label-fit-test` log the face it actually measured.

**M8 · §10.13, §18.7: Kitchen badge**
- **Finding:** The rail's Kitchen badge shows 9, which counts active tickets (3 New + 6 Preparing). Its label key `badge.new` reads "Kitchen, 9 new". That is false for screen readers and contradicts the visual meaning.
- **What a 10 looks like:** Either count New only (3), or use a `badge.active` key: "Kitchen, 9 open, 3 new".

**M9 · §10.34 against §11**
- **Finding:** §10.34 "opens a Tier A confirm", but §11 defines Tier A as "Confirm: None".
- **What a 10 looks like:** Name the tier that actually confirms (B), or redefine Tier A.

### Polish

1. **§6.6, main table vs factor table.** The capsule widths in the main table (Dashboard 305.1 / 329.8 / 265.3; Till 305.6 / 322.2 / 278.6; Team AR 225.4) disagree with the factor-1 column (303.4 / 327.5 / 262.2; 303.3 / 320.1 / 275.2; Team ≤ 223.9). The "7.5 margin" uses the factor table. Fix: one source of numbers.
2. **§18.1 against §10.33.** The §18.1 row shows " vs yesterday at 17:39" with a leading space, while §10.33 says "no leading space".
3. **§20.3, row 677.** It cites "rows 1091, 1098". Line 1091 is a `classList.toggle` and 1098 is a `}`. The live lines are 1103 and 1110.
4. **§15.0.** It cites "Principle 6", but only five principles exist.
5. **§10.20.** "Commandes, 73 at 13 px measured with Inter Tight" is stale, since the spec now ships Inter.
6. **§10.0 against §10.6.** `k-segmented` and the host `k-seg` don't match.
7. **§18.0 against the preview fixture.** The spec says "T5 has 6; the rest have 4", but the fixture JSON seats T12 = 6. The spec also claims the preview fixture is identical.
8. **§10.30.** It says `split.progress` "sums what was actually paid", but the string is a count: "Shares paid: {paid} of {total}".
9. **§18.4.** The popover title "Table 7 · 4 seats" is a composite string with no key.
10. **§15.3.** It cites "as nativeHapticSuccess() at :11396-11401 does today" as the model. Today's split path fires Success after `cb()` even when `markSplitPartPaid`'s `recordSale` failed. Fix: fire Success only on a confirmed record.
11. **§5.3, §10.20.** Tab selection relies on the filled icon shape. The fill-1 variants aren't vendored, so the preview's selected Home icon renders outlined. Fix: vendor the fill-1 files, or give selection a second cue (weight or colour plus the lens).
12. **Payment pane, 894 → 924.** The 30 pt gap isn't a spacing token, and nothing says it's pinned.
13. **`ob.forgot.title`.** The FR string lacks the "?" that `ob.forgot` carries.

## 5. Checked and found correct

- **Fixture arithmetic, §18.0:**
  - Every order, table and ticket sum.
  - Station counts: Hot 7, Cold 2, Pastry 2, Drinks 4.
  - The customer partition.
  - The close: expected 8,920, counted 8,902, difference −18.
- **Geometry recomputed:**
  - Home, Orders, Till, Floor, AI, KDS, Team and the SE frames (§18.1 to §18.11).
  - Floor scale 1.1245 and the whole refit table.
  - KDS ticket heights 299 / 355 / 463 / 271 / 180, and the overflow pass.
  - Visual angles, keypad key widths, and the §13.3 menu widths and columns.
- **Motion:** lens 115 + 310 = 425 ms; the spring at k 1400, c 74.8.
- **Preview harness:** all 11 checks pass; all 24 mutations caught; 231/231 icons render; compact and default segmented hit areas are 44 and the negative controls fail correctly.
- **Code citations at 31c94529:**
  - Dispatchers (kiwi-caisse.html :6412, :10839, :10963, :19045).
  - Tips (:6628 to :14590), and the absence of a `tip` key in live-link.js and sale.js.
  - The interactive.js load scope.
  - kiwi-serveur and kiwi-cuisine lines.
  - team/live.js `mutateDoc` CAS and the attendance-code lines.
  - The employee.js limiter lines.
  - reset, signup and login lines.
  - `_lib.js` `limitCheck`, `rateLimitUnavailable`, and the PIN bucket and identity rules.
  - native-runtime.js lines, except the stale 1091/1098 in §20.3.
  - KiwiNativeShell.swift lines, and the iOS 15.0 deployment target.
- **Icons:** every icon named in the spec is vendored (237 files); only the replaced names are absent, as the spec says.
- **Copy and rulings:** the guest copy rewrite, the Arabic six-form table, the "Charge" ruling, and the split and discount math (76.67 / 76.67 / 76.66; 19.50 / 3.50).
