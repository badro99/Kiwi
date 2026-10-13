# Critic review: Kiwi design 2027 direction (round 5, revision 4)

I did not edit, stage or commit anything in the repo, and printed no PIN or credential. The throwaway renders and crops are in `/private/tmp/claude-501/-Users-zaka-Developer-kiwi/b1047fb9-db06-41c7-87ad-42ff893fbacd/scratchpad/c4/`. To view them I started two local `python3 -m http.server` processes on ports 8799 and 8798. Both are still running.

## 1) Scorecard

| # | Dimension | Score | Reason |
|---|---|---|---|
| 1 | Visual design | 7 | Sheet list groups are surface-1 on a surface-1 sheet, so the container disappears. The preview frames drift from the spec: zone label, Paid table, SE row. |
| 2 | UI | 6 | Segment hit areas are 28 / 36 / 48 against the spec's own 44 rule. The hero one-line primary measures 391.6 px in a 384 px button. Button inline padding is never stated. |
| 3 | UX | 6 | Sign-in designs only the 401; 429, 503 and the network case have no design. "Reset password" leads to a route that does not exist. The discount approval limit has no setting. Opening a bill pane silently turns the floor map into the List view on most iPads. |
| 4 | Motion | 7 | "310 ms for every move" cannot be true of a lens that shipped as stretch then settle (115 + 310 ms). The shared-element recipe leaves its coordinate frame and tracking mismatch undefined. |
| 5 | Feel and haptics | 5 | Three of the spec's own haptic tests fail as written. It assumes a native timestamp the plugin does not return. It never inventories the native host's haptics, which already double-fire on a tab change. |
| 6 | Copy and language | 7 | Wrong Arabic preposition join, one key reused across three surfaces, a missing key, and width proofs made only in English. |
| 7 | Accessibility | 7 | Hit areas under 44, and a 56 primary that wraps at text-size factor 1. The kitchen screen breaks the six-step type rule. |
| 8 | Honesty and consistency | 5 | The fixture puts an order on a table that does not exist, and the preview check passes it anyway. Many on-screen figures are missing from the "one fixture". The "72" literal count is 70. |
| 9 | Performance | 8 | The haptic latency gate in §19 cannot be measured on the stock plugin, so it cannot pass or fail. |
| 10 | Feasibility and migration safety | 6 | Native host (Swift tab capsule, native sheets) and Android are absent. The font `url()` rule mis-resolves for `native-runtime.css`. The `KiwiLens` global name collides with the shipped one. |

## 2) Verdict

**FAIL.** No dimension scores 10.

## 3) Rebuttal rulings

- **Rebuttal 1** (stamp scanner M3 withdrawn, P24 fixed): **ACCEPT.** The `stamps.js:72,79` regexes match only js and css, `shellDocs` is root HTML plus the landings, and `check.js:38-44` `list()` reads only the top level, so the withdrawal is right. The new font-resolution rule that replaced it introduces a fresh defect (Major 14 below).
- **Rebuttal 2** (M20, "publishing is a commit, forbidden this round"): **ACCEPT** on the merits, since the round rules forbid commits. The companion claim that the page "works in the built-in browser pane" is false over file://. The pane turns the page into a data: snapshot and all 12 before-images load at naturalWidth 0. The page only works over HTTP. Logged as Polish P23.

## 4) Findings, ranked

### Major

1. **§15.1, §15.3 against §15.6, Paid haptic on clock-in.**
   - **Evidence:** §15.1 and §15.3 fire Paid when the clock-in succeeds. The `employee.js` clock-in (lines 474-530) is a server round trip, so the haptic runs on a server response. §15.6 `haptics-map-test` asserts Paid fires only with `trigger:'local-record'`, so the spec's own test fails.
   - **A 10:** clock-in uses a different event (for example Success), or the test whitelists the clock-in response path by name.

2. **§15.4 and §10.22 against §15's `KiwiHaptics.play` and §15.6.**
   - **Evidence:** chart scrub fires one tick per data point within a single gesture. `play` drops a second call with the same gestureId, and `haptics-map-test` asserts that "no gestureId appears twice". Principle 5 says one gesture fires at most one haptic. So scrub ticks are either suppressed or fail the test.
   - **A 10:** scrub is a declared continuous-gesture exception with its own id scheme (gestureId plus step index) and a rate limit, and both the test and Principle 5 name it.

3. **§15.5 and §19, haptic latency baseline.**
   - **Evidence:** the baseline needs "a native timestamp returned by the plugin call". The installed `@capacitor/haptics` 8.0.2 calls `call.resolve()` with no data and dispatches the haptic asynchronously; `Haptics.swift` also creates a new generator on every call. The "without decision 9" gate therefore cannot be measured without a native change. §23.9 refers to "Kiwi's plugin", but `app/plugins/` holds only `kiwi-dynamic-type` and `kiwi-printer-socket`.
   - **A 10:** the spec names the native shim it needs: a prepared generator, and a resolve that returns `CACurrentMediaTime`. Or it measures with an external method it actually specifies.

4. **§20.3 and §1, the native host and Android are missing from the haptics and lens inventory.**
   - **Evidence:**
     - `KiwiNativeShell.swift:145` fires a Light impact on every `send()`, including tab `navigate` at `:819`. `native-runtime.js:1107` then calls `activateNativeTab`, which fires `hapticLight` again at 1091 and 1098. That is a double buzz today, and a triple one once the web Choose haptic is added.
     - `:334` and `:936` fire a Warning on native destructive sheets and confirms.
     - `KiwiNativeTabRoot` (`:803`) is a second tab bar with its own `@Namespace selectionLens`, so there are two lenses.
     - The native sheets (`KiwiSheetView`, `__kiwiHostCaps={sheet:1}`) are not covered.
     - 13 `navigator.vibrate` sites are not listed, among them `kiwi-cuisine.html:1638, 1660, 1846` (new-order vibration on the kitchen screen, against §15.6), `kiwi-order.html:5205, 5211`, `OrderPro.html:5961`, `kiwi-serveur.html:7146` and `pos-maison.js:3251`.
     - `app/android` exists, and the spec never mentions Android.
   - **A 10:** §20.3 lists every native and vibrate emitter with a keep, remove or route-through-KiwiHaptics decision. It names one lens owner for the native tab bar, and says what Android does.

5. **§18.0 fixture and preview check 2.**
   - **Evidence:** order `{"n":1206,"table":"Table 15","tableId":"T15"}`, but the floor has T1-T12 and T20-T23, with no T15. Check 2 reads `var t = o.tableId && tableOf(o.tableId); if (t && t.status !== 'paid') ...`. `tableOf('T15')` returns null, so the check passes silently. It also tests only that `data-order` exists, not table, method, time or amount.
   - **Further gaps:**
     - Check 1 cannot verify "Orders rows net of refunds = 19,174", because the fixture holds 8 orders that sum to 1,032.
     - Check 3 tests only T4.
     - Check 4 tests ticket ages only for #42, and the preview has no kitchen frame.
     - The page still claims "the same nine checks" and shows 9 of 9 passing.
   - **A 10:** #1206 is on a real table. Every check fails on a missing reference, and the page's checks match the spec's list one for one.

6. **§18.0 against §18.3, §18.4 and §18.9, "every figure comes from one fixture".**
   - **Evidence:** none of these appear in §18.0:
     - the cash-count figures 500, 8,240, 720 and 600;
     - Z 0147;
     - "Othmane N.";
     - 23:41;
     - the menu categories;
     - "Ground floor · First floor".
   - `strings-coverage-test` would fail on them. "First floor" also implies tables beyond the 16 in the fixture.
   - **A 10:** every figure drawn in §18 is a fixture field, or the claim is narrowed to the figures that are.

7. **§18.3 and §10.26 against §6.4, the hero primary label wraps.**
   - **Evidence:** "Confirm 230.00 MAD cash · change 20.00 MAD" at 17 px / 600 measures 391.6 px. The L button is 384 in the widest pane, so the one-line 56 primary wraps at text-size factor 1 in English. French measures 423.7, and a 320 pane is worse. The §6.4 table says "one line ≤1.12".
   - **A 10:** a shorter label (for example "Confirm · change 20.00 MAD") measured in all three languages at the narrowest pane, plus a stated wrap rule.

8. **§10.6 against Principle 4, segmented control hit areas.**
   - **Evidence:** member hit area = track minus padding, which gives compact 28, default 36 and kitchen 48. Host padding does not grow the button's own hit area. The spec's own "each member ≥ 44 × 44" fails for compact and default.
   - **A 10:** a 44 hit area via an inset pseudo-element or `min-block-size`, with the drawn track left as is, and a lint that measures the hit area rather than the paint.

9. **§18.4, the floor map with a bill pane open.**
   - **Evidence:** opening a bill pane refits the plan into 1210 / 1133 / 1032 / 744 widths. iPad 11 landscape scales to 594 / 1060 = 0.56, below the 0.6 floor, which forces the List view. The map stays usable with a pane open only on iPad 13 landscape. The spec does not say this.
   - **A 10:** the spec says which device and orientation combinations keep the map and designs the List fallback. Alternatively it shows the pane as an overlay that does not refit.

10. **§6.2 against §13.6 and stage 3b, type steps.**
    - **Evidence:** the kitchen root (24 px) creates a second set of six sizes. If the till embeds the kitchen board, as stage 3b proposes, the till uses up to 12 sizes, and `type-steps-lint` as worded fails the kitchen screen.
    - **A 10:** the kitchen scale is defined as the same six steps on a scaled root, and the lint counts steps relative to the root, or the embed is scoped.

11. **§18.8 A2, sign-in states.**
    - **Evidence:** `functions/auth/login.js` answers 401 `bad-creds`, 429 (keyed both by IP and by account), 503 (`auth-unavailable`, `not-configured`, `rate-limit-unavailable`) and 400. The spec designs only the 401.
      - `ob.err.rate` says "from this network", which is wrong for the per-account lock.
      - `ob.reset` "Reset password" has no self-serve route: resets are sent only from the operator console (`functions/api/admin/reset.js`). That makes it a dead control under §17.9.
      - The reset landing states (invalid, weak, `update-failed`) have no design.
    - **A 10:** every login answer has a designed state and string. The reset control reads "Ask Kiwi support to reset", or the route is listed as a dependency with a fallback.

12. **§10.31 and §10.2, `discount.manager` "above {limit}".**
    - **Evidence:** `assets/discount-policy.js:58` handles percentages only. No approval-limit setting exists, there is no settings home in the §12 IA, no schema, and no §23 item. Shipped behaviour today: `kiwi-caisse.html:17153` and `:18000` always call `requireManager`.
    - **A 10:** the copy matches shipped behaviour ("needs a manager"), or the limit is specified end to end and owned in §23.

13. **§14.3 and §14.4, lens timing.**
    - **Evidence:** "310 ms for every move" together with "stretch then settle as shipped" is impossible. `assets/liquid-lens.js` stretches, then settles after `setTimeout(...,115)`, so a tap takes about 425 ms in total, and 115 is not a duration token.
    - **A 10:** the two phases are named with tokens (stretch 115, settle 310) and the total is stated.

14. **§21.3 and §6.5, font `url()` resolution.**
    - **Evidence:** a CSS `url()` "resolved against its CSS file's own folder" mis-keys `app/src/native-runtime.css`. `tools/build-app-www.mjs` copies that file to the www root, so `assets/fonts/...` is checked as `app/src/assets/fonts/...` and fails or drifts silently.
    - **A 10:** resolution uses the served path from the build manifest, with `native-runtime.css` named as a case.

### Polish

1. §20.3 says "72 Inter Tight literals". There are 70, and line 1 is the `@font-face` descriptor, which cannot become a `var()`.
2. "Forwards to KiwiLens" collides with the shipped `window.KiwiLens = {rescan, refresh}`.
3. §10.26 step 3 gates the paid moment on `storageError`, but `live-link.js` `enqueueMoneyBody` sets it asynchronously (the IndexedDB write runs after the localStorage write-ahead). It cannot gate a moment that already ran.
4. `discount.not_allowed` refuses when no policy is configured. Shipped code refuses only when `KiwiDiscountPolicy.configured()` (`kiwi-caisse.html:17994`).
5. The Adjust haptic on approval is triggered by a response, which conflicts with the ≤600 ms test rule.
6. `pin.unpaired` "Pair it again to unlock" is reused for the printer code and the attendance code, where it is wrong.
7. The attendance sheet reuses `printer.code.new`.
8. The phone floor's "Occupied" segment has no key.
9. `compare.delta` in Arabic builds "بـ{baseline}", which renders as "بـالأمس". The preview shows the correct "بالأمس".
10. The cash-count width proof is English only. French "Pièce de 0,50 MAD" measures 154.3 against a 120 budget, giving a 370 row against 360.
11. French secondary buttons: "Ajouter une remise" measures 155.2 + 20 icon + 8 gap = 183 in a 188 button. §10.1 never states inline padding, and the toolbar fallback applies only below 400.
12. The French bill bar "View bill · 2 items · 230.00 MAD" measures 321.8 and wraps on SE.
13. "Skip receipt" next to Done is redundant, or its difference is undefined.
14. "Use last close · 500.00" mislabels the opening float. The last close counted 8,842.
15. The 17:00 orders group skips from #1201 to #1205, yet #1201 is refunded in that hour.
16. Spec check 1 and §18.2 `components-sum-test` cannot run on an 8-order fixture.
17. Home's "Latest orders" header has no visible rows at rest.
18. The SE preview compare row omits `expand_more`.
19. The till category lens sits on "All" while the sticky header reads "Starters", against the "follows the scroll section" rule.
20. The preview zone label sits at y143, outside the 32 band. The Paid table T2 shows the word "Paid" instead of the elapsed time.
21. Two numbers are off:
    - table x positions 744 and 1194 should be 743 and 1193;
    - the key figure is about 179 wide, not "210".
22. The shared-element recipe does not say that "Last" is measured in the pushed page's coordinate frame. It also omits the tracking change from −0.015em to −0.025em.
23. Preview before-images fail over file://, as noted under Rebuttal 2.
24. The preview loads Google Fonts and the Material font rather than the self-hosted fonts and the sprite. This affects the preview only.

## 5) Checked and found correct

- **Server and auth code citations:**
  - discount reasons and errors, `sale.js:80, 189-190, 590-615`;
  - `config.js:281-282, 313-317` with the `_business-day.js` defaults 5 and Africa/Casablanca;
  - `_lib.js` password rules, `LIMIT_WINDOW` 15 min, 8 fails, 15 min block, the `till:` identity, `forbidden-till`, and the `pin:` bucket with no reset on success;
  - `sale/cancel.js:276-282`;
  - `employee.js` cited lines, with clock-in idempotent and clock-out with no open entry doing nothing;
  - `team/live.js:145-176`, `print/bridges.js:145-170`, pair redeem (10 fails in 10 min, 15 min block) and create (15 min TTL).
- **Shipped client code citations:**
  - every `native-runtime.js` line cited in §20.3;
  - `tokens.css:179, 208, 255-259`, `design-vexel.css` with 257 `!important`, and the dashboard `visibility:hidden` at 1012, 1022, 3112 and 4413;
  - iOS deployment target 15.0 and Capacitor 8.x.
- **Contrast:** every §5.3 ratio reproduces within ±0.05. The §1 neon and mint ratios are correct against surface-1.
- **Spring math:** settle times are 300-308 / 333 / 367 ms with ζ 0.9996. The k420/c40 comparison is 500-508 ms. The lens bezier overshoots by 6.6%.
- **Layout arithmetic:**
  - Home and SE coordinates and gaps;
  - §13.3 widths and column counts;
  - §10.25 key widths;
  - floor fit 1.124;
  - kitchen ticket heights 243 / 299 / 355 / 463 / 271 / 88 / 180 and the column packing;
  - §18.10 PIN layout.
- **Money and fixture arithmetic:**
  - cash count 8,842 against 8,860 expected, −18 difference, 17 taps;
  - split 76.67 + 76.67 + 76.66;
  - table totals, ticket ages, station and customer counts;
  - Home deltas −5.55% and basket −12.68;
  - AI card 154.
- **Text that fits:**
  - French orders filter (322.5 in 335), French tabs (326.7), French SE compare row;
  - "Apply 23.00 MAD discount" in EN (221.2) and FR (280.9);
  - "Send 2 items to kitchen" (191.7) and "Take payment · 230.00 MAD" (233.5);
  - French split pay (252.4 in 272), French cancel-sale confirm (251.7), "Saisir votre code", "Clôturer la caisse";
  - kitchen item line (295.6) and note (291.4) at 25.5 px, tight but fitting.
- **Arabic:** the minus sign on a negative delta renders before the number, as it should.
- **Preview over HTTP:** all 12 before-images load (552×1200 and 900×1200).
