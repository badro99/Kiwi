# Critic review: Kiwi design 2027 direction (round 4, revision 3)

Revision 3 is the best version so far. Most of its arithmetic holds up when recomputed: the contrast tables, the spring settle times, the KDS visual angles, the cash-count sum and tap count, the §13.3 till widths, and nearly every server line it cites. It still fails. A few of its own rules break in its own hero frames, three fixes were adopted only in part, and the code shows new defects the earlier critics missed.

I edited, staged and committed nothing. My only writes were throwaway renders of the six preview mocks in the scratchpad (`…/scratchpad/critic3/*.png`).

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 6 | Every main surface uses 7 type sizes, but the brief allows 6 per surface. The "before" half of the preview renders on one machine only. Gaps, radii and grid margins fall off the token scale. Several preview frames don't match the spec. |
| UI | 6 | The iPad cash keypad (384 wide) is placed in a 336 column and a 360 popover. The PIN pad's manager-code use is missing. The attendance and printer code displays have no states. Several components are underspecified. |
| UX | 6 | The sign-up server answers are undesigned. The paid moment and the offline outbox disagree. The team pad sends before an e-mail exists. The manager-code flow is undefined. |
| Motion | 7 | The KPI "morph" has no recipe. The "transform and opacity only" rule contradicts the colour animations. Some durations and thresholds are missing. |
| Feel and haptics | 5 | The payment haptic waits on a network write the till makes through a queue. The map departs from the brief without saying why. The latency budget depends on an undecided owner item. Pads buzz inside draggable sheets. |
| Copy and language | 6 | About 30 strings used in §10 to §18 have no keys. There are plural misses, a percent-format clash, a French label that overflows, and a truncated line in the preview. |
| Accessibility | 6 | Two hit areas overlap on Home. The 8 pt spacing rule as written fails every list and segmented control. `color-scheme` is reset inside shadow roots. Guest browsers have no stated minimum. |
| Honesty and consistency | 4 | Discount reasons that the server rejects (blocker). The worked example contradicts itself across heroes. Copy promises an owner action that doesn't exist yet. "No literal 5" is impossible with the current `/api/config`. |
| Performance | 6 | The haptic budget has no fallback. The app would load two Latin faces until stage 7. The shadow-root cost of controls inside collection items is unplanned. |
| Feasibility and migration safety | 4 | Same discount blocker. The ledger's cutoff source returns null. The payment path conflicts with the outbox. The app's font CSS isn't planned for. The collection rule has a gap. Guest browsers have no support matrix. |

## 2. Verdict

**FAIL.** No dimension reaches 10.

## 3. Rebuttal rulings

1. **M3, the stamp scanner: REJECTED as a rebuttal.**
   - The builder's evidence is accurate: `tools/stamps.js:72` and `:79` use `[A-Za-z0-9._/-]`, so subfolders are matched.
   - But M3 never said subfolders were missed. It said the regexes match only `.js|.css`, which is true, so `.woff2` and `.svg` are invisible. It also said a runtime-built locale URL would be invisible, which is true as a conditional.
   - The rebuttal answers a claim nobody made. The remedy is adopted in full, so M3 doesn't come back, but one gap is new: polish P24.
2. **X2, the file path: ACCEPTED as a clarification.**
   - `merchantCutoff()` is at `functions/api/_business-day.js:69-76` (0 to 12, default 5).
   - Nothing of substance was disputed.
   - The adopted fix is incomplete, though: see major M2.

## 4. Findings, ranked

### Blocker

**B1 · §10.31 and §9.6 `discount.reason.*` · the discount reasons are ones the server refuses (Honesty, Feasibility, UX)**
- **Evidence:**
  - `functions/api/sale.js:80` accepts only `commercial`, `loyal-customer`, `kitchen-error` and `other`. Anything else gets 400 `bad-discount-reason` (`:189`).
  - The spec's chips are Staff meal, Regular customer, Complaint and Other. Staff meal and Complaint have no server code.
  - The live-link outbox keeps a sale "until the server confirms it" (`assets/live-link.js:232-241`). So a discounted sale with either reason never reaches the dashboard or the Z.
- **What a 10 looks like:** the reason chips map one-to-one to the server set, or the server set grows in the same stage. Either way, a test sends each chip through `/api/sale`.

### Major

**M1 · §15.3, §10.26 and §19 · the payment haptic waits on `POST /api/sale`, but the till writes sales through an outbox (Feel, UX, Performance, Feasibility)**
- **Evidence:**
  - Today's till fires the paid moment as soon as the sale is recorded locally: `recordSale` → `nativeHapticSuccess()` → `kiwi:sale-paid` (`kiwi-caisse.html:11315-11331`). Upload happens later, through the outbox.
  - The spec makes Committed wait for a 2xx "the frame the paid moment starts", within 600 ms.
  - Built as written, either the paid moment waits a network round trip (offline-first breaks, and the ≤ 200 ms INP budget breaks with it), or a payment gets no haptic whenever the queue is behind or the till is offline.
- **What a 10 looks like:** Committed fires on the durable local record. The server ack drives a sync indicator. The paid moment's offline behaviour is stated.

**M2 · §3 row 1 and §17.1 · "No client code holds a literal 5" can't be met with the current `/api/config` (Honesty, Feasibility)**
- **Evidence:**
  - `config.js:281-282` initialises `timezone = ''` and `businessCutoff = null`, and only overwrites them with valid values (`:313-317`).
  - The server's own fallback is `5` and `Africa/Casablanca` (`_business-day.js:69-76`).
  - So the client has to hold the default.
- **What a 10 looks like:** `/api/config` returns the values `merchantCutoff()` and `merchantZone()` resolve. Alternatively, the spec states the null fallback and `ledger-agreement-test` covers a store with no cutoff row.

**M3 · §18.1 to §18.7 and the preview · the worked example contradicts itself (Honesty)**
- **Evidence:**
  - (a) Home and Orders list "#1208 · Table 4 · Card · 17:36 · 230 MAD" as paid. At 17:39, §18.3 and §18.4 show Table 4 still open with 230.00 unpaid.
  - (b) §18.3 says "open since 17:02", which is 37 minutes at 17:39. The preview's Floor shows T4 at "45 min".
  - (c) KDS ticket 42 (Tajine poulet citron, No olives, Salade marocaine, Harira, 17 min) contains the two lines §18.3 marks "Not sent". Harira, sent at 17:21, would read 18 minutes.
  - (d) §18.4 on iPhone has "T22 · 4 guests · In progress · 230.00 MAD". The preview draws T22 as a free 2-seat table.
  - (e) Home says "Returning 3 of 8". In the preview's Customers list only Salma (Regular) visited today; Leila also visited today but is New.
- **What a 10 looks like:** one fixture behind every hero and the preview, with the cross-screen checks in `ledger-agreement-test`.

**M4 · §10.2 (429 at the till), §12 and §23.8 · copy and Settings depend on an undecided owner item with no fallback (Honesty)**
- **Evidence:**
  - The pad always shows `pin.paused.owner_hint` ("The owner can lift the pause from the dashboard: Settings › Devices").
  - Settings lists "Lift the code pause".
  - `POST /api/pin/unlock` doesn't exist (`functions/api/pin/` holds only `verify.js`). It's owner decision 8.
- **What a 10 looks like:** the hint and the Settings row appear only once the route ships. Until then the copy says only "wait {minutes} min".

**M5 · §10.2 "one component, five uses" · the manager-code use is missing (UI, UX, Feel)**
- **Evidence:**
  - Today the PIN pad also approves managers: `pin/verify.js` issues refund and inventory approvals, and `sale/cancel.js:276` calls `verifyStaffPin`.
  - The spec calls for a manager code in §10.3, §10.31 and §11, but defines no server call, no response states and no copy for it.
  - Its haptic is contradictory: §15.3 says "final digit → Committed", and the same table says "Tier B confirm → never".
  - It shares the store-wide `pin:<merchant>` bucket (`_lib.js:1302`). So a manager's typo inside a cancel sheet counts toward pausing every till for 15 minutes.
- **What a 10 looks like:** a sixth row with its route, its states, its haptic and its lockout copy.

**M6 · §10.25, §18.9, §10.31 and §10.3 · the iPad keypad doesn't fit the containers it's placed in (UI)**
- **Evidence:**
  - iPad keys are 3 × 120 + 2 × 12 = **384** wide.
  - The cash-count keypad column is **336** wide (§18.9).
  - The discount popover is 360 wide, so about 328 of content (§10.4, §10.31).
  - The cash-count sheet is 720 wide in §10.3 and **840** in §18.9.
- **What a 10 looks like:** a key geometry for each container width, and one sheet width.

**M7 · §10.34 and §10.35 · the code displays have no states (UI)**
- **Evidence:**
  - `pair-code` answers 401 `unauthorized` (`print/bridges.js:150`) and 503 `relay-not-provisioned` (`:168`).
  - Generating an attendance code can fail; today's till shows "Erreur · Code non généré" (`caisse-attendance-code.js:72-73`).
  - §10.0 requires loading, error and empty states for every component.
- **What a 10 looks like:** a state table for each display, with keyed copy.

**M8 · §18.8 A1 · the sign-up answers are undesigned (UX, Copy)**
- **Evidence:**
  - `functions/auth/signup.js` returns 400 `email`, 400 `name`, 400 `weak` with a reason of short (under 10 characters), long, common or personal (`_lib.js:92-118`), 409 `exists`, 409 `business-taken`, and 429.
  - The spec designs only `exists`. It shows no password rule before submit and has no strings for the rest.
- **What a 10 looks like:** one state and one keyed string per answer, with the password rules visible before submit.

**M9 · §6.2 against brief rubric 4 · seven type sizes per surface (Visual)**
- **Evidence:**
  - The brief says "no more than six sizes per surface". The spec counts per layer instead.
  - The till uses Display (the attendance and printer codes, §10.34 and §10.35) plus the six steps in §18.3.
  - The dashboard uses Display on Home plus Callout (the source chip, default segmented controls, chips) plus the rest.
  - That redefinition is never stated as a deviation.
- **What a 10 looks like:** six per surface, or the per-layer rule taken to the owner as a decision.

**M10 · §18.1 · hit areas overlap on Home (Accessibility, Visual)**
- **Evidence:**
  - "See all" spans 814 to 858; the tab capsule spans 852 to 914. That's a 6 pt overlap, against §18's own "every pair ≥ 8 apart".
  - At rest the capsule covers row #1208 (866 to 930). In my render, "Latest orders" touches the capsule and #1207 peeks out under the home indicator.
- **What a 10 looks like:** the last band ends at 844 or above, or the rule is stated against the scroll inset, and the resting frame ends cleanly.

**M11 · §10.0 and the §18 intro · the 8 pt spacing rule as written fails every list (Accessibility)**
- **Evidence:** these all have abutting hit areas:
  - rows of 64 in §18.2, §18.4 (phone) and §18.5;
  - segmented segments;
  - the five tab-capsule items (78.4 each, touching);
  - phone cash keys, each "a third of the content width" with no gap;
  - the date grid.

  The target audit as specified would fail all of them.
- **What a 10 looks like:** the rule applies between separate controls; contiguous rows and segments are exempt, at 44 minimum each; the audit matches.

**M12 · §20.2 · `color-scheme` isn't in the inherit list (Accessibility, Visual, Feasibility)**
- **Evidence:** `:host{all:initial}` resets `color-scheme` to `normal`. In dark mode, the native radio and checkbox (§10.24, §10.10), scrollbars, carets and autofill would render in light colours.
- **What a 10 looks like:** `color-scheme: inherit`, asserted in dark by `kit-in-host-test`.

**M13 · §6.5 and §21.3 step 9 · the app loads both Latin faces until stage 7 (Performance, Feasibility)**
- **Evidence:**
  - `app/src/native-runtime.css:1` declares "Inter Tight"; `:7` applies it to `html.kiwi-native` and `body`.
  - Lines 23, 98, 120, 945 and 1126 hard-code it on native chrome that lives until stage 7 (the offline pill, the tab bar, the paid label).
  - After a surface flips to Inter, both faces load, against "never loaded together".
  - `NATIVE_FONTS` serves `native-fonts/…` while `tokens-2027.css` points at `assets/fonts/…`, so the app would ship two copies.
- **What a 10 looks like:** the native CSS changes listed per stage, and one font path in the app.

**M14 · §20.6 · the collection rule says nothing about controls inside items (Performance, Feasibility, UI)**
- **Evidence:**
  - Controls inside items: switches in rows, steppers in bill lines and cash-count rows, K buttons on tickets, share chips in split rows.
  - Option one: they're nested kit elements. Each is a shadow root; the cash count alone has 11 × 3 = 33 before the keypad.
  - Option two: each collection reimplements the control. That breaks "one control per job".
- **What a 10 looks like:** the rule stated, with a root count.

**M15 · §15.5, §19 and §23.9 · the ≤ 20 ms haptic budget has no fallback (Feel, Performance)**
- **Evidence:**
  - The budget depends on prepared generators, which are handed to the owner.
  - `Haptics.swift` creates a new generator per call with no `prepare()`.
  - §19 says "a budget miss fails the round".
- **What a 10 looks like:** the budget is conditional on decision 9, or a measured unprepared baseline is the fallback target.

**M16 · §15.1 and §15.3 against the brief's haptics map · deviations with no reason given (Feel)**
- **Evidence:**
  - The brief gives send to kitchen, open till and confirm table impact medium. The spec makes send and open table a notification Success, the same feel as a payment.
  - "Open the till" (§18.9) has no haptic anywhere.
  - Pull to refresh is Medium; the brief says Light.
  - A Void opened by swipe gets no warning.
  - Every PIN unlock fires Success, dozens of times a shift.
  - "Apply discount: the bill write" names no request; the discount travels with the sale (`sale.js:178-190`).
- **What a 10 looks like:** follow the map, or justify each deviation, and name every request.

**M17 · §10.21 · the KPI morph has no recipe (Motion)**
- **Evidence:** §10.21 says "the value morphs into the detail header (§14)", but §14.4 has no shared-element recipe. The brief requires shared-element moves.
- **What a 10 looks like:** a duration, a curve, the type-step interpolation and a reduced-motion frame.

**M18 · §9.6 · "every new string" isn't true: about 30 are missing (Copy)**
- **Evidence:** strings used in §10 to §18 that have no key:
  - §10.16: "Add your first dish", "No refunds today", "Clear filter", "You're offline";
  - §10.21: "Add dish costs to see margin", "Couldn't load";
  - §10.23: "Edit options", "Void", "Transfer table", "Merge", "Clear bill", "Cancel table";
  - §10.20: "Lock", "Switch cashier";
  - §10.33: "Yesterday at the same time", "Last Monday at the same time";
  - §10.34: "Changes at {time}";
  - §18.4: "Amounts in MAD" and the five status words;
  - §12: "Sign out of this device";
  - §13.6: the KDS menu (History, Stations, Display, Sound, Input, Touch, Bump bar, Read-only);
  - the chart summary label (§10.22) and the badge label (§10.13).
- **What a 10 looks like:** every one keyed in EN, FR and AR.

**M19 · §4.1 · guest browsers have no stated minimum (Feasibility, Accessibility)**
- **Evidence:**
  - These rows say "n/a, covered by the floor": `:is()`/`:where()` (iOS 14), flex `gap` (14.1), `dvh` (15.4) and compact `Intl` (14.1).
  - The app floor doesn't cover guests' own browsers, and §4.1 itself handles guests separately for `:focus-visible` and `inert`.
  - On iOS 13, every `:where()` reset is dropped.
- **What a 10 looks like:** a stated guest minimum, with a fallback per feature.

**M20 · the preview page · the "before" half works on one machine only (Visual, Honesty)**
- **Evidence:**
  - All 12 befores are `file:///Users/zaka/Developer/kiwi-design-audit/shots/…`, outside the repo.
  - In the built-in browser pane all 12 report `naturalWidth 0` and show "Capture not found".
  - The page is untracked (`??` in git status). The brief asks for a published page, and the partner needs access (CLAUDE.md §1).
- **What a 10 looks like:** the captures copied beside the page with relative URLs, and the page published.

### Polish

1. **§7.2 against §18.3, §18.4 and §18.7:**
   - Landscape iPad is "expanded", so its margin should be 32; the heroes use 24.
   - Wide should be 32 margins, 24 gaps and max 1200; the KDS uses 24 and 16 at full width.
2. **§7.1, gaps off the scale:** in §18.3 the bill pane goes from 78 to 104, a 26 gap. In §18.11 the tiles end at 584 and the capsule starts at 597, a 13 gap.
3. **Radius 16 is off-token** in the preview: the rail lens (`.ri`), keypad keys (`.key`) and floor tables (`.tb`). The spec never sets these three radii.
4. **An 11 px initials badge** in the preview Floor is off the 7-step scale. The spec leaves that badge's step undefined.
5. **Preview against spec:**
   - The dark chart stroke uses `--acc` (#3CCB8F), but §5.4 says accent-ink (#5FD9A3).
   - The dark capsule gets a 1 px border that §7.4 doesn't specify.
   - The source chip is painted s1, but §10.7 says s2. As specified, it sits on §18.6's s2 card at 1.0:1.
   - The disabled send button is accent at 45 % opacity, but §10.1 says surface-3 with ink-3.
6. **Truncation in the preview:** Customers truncates "Casablanca · last visit 74 days …" in EN at factor 1 on the 440 phone. §10.8 never says subtitles wrap.
7. **The preview Floor doesn't "scale uniformly to fit":** the tables span y 200 to 736 of a canvas that runs 136 to 1008.
8. **No AR (RTL) after-frame and no 375 × 667 after-frame are rendered**, so §9.5 and §18.11 are unshown.
9. **§6.4 says the segmented control "fits" at factors up to 1.12. Not in FR:** "Remboursements" at Footnote strong measures 104 px (Inter Tight 600, measured). A segment is 98 on the 440 phone and 83.75 on the SE.
10. **§9.2, plurals:** `home.returning_value` and §9.4 row 5 are counted strings but aren't marked plural. FR needs "1 client connu sur 8 est revenu", and the AR noun after `{total}` needs its few, many and other forms.
11. **§6.3 against §10.31:** the EN percent format is "5.6%", but the discount chips and preview use "5 %", "10 %", "15 %" and "Discount 10 %".
12. **§10.30:** the rule puts the remainder on the last share, but the example (76.67 + 76.67 + 76.66) makes the last share the short one.
13. **§10.21:** deltas are coloured by sign, so "Card share ↑ 1 pt" in accent-ink presents more card payments, and so more fees, as good. A 10 defines each KPI's polarity.
14. **§10.2, clock-in:** the clock action's 401 `employee-session-required` (`employee.js:361`) and 403 `store-suspended` (`:369`) are missing, and §15.3 doesn't classify them.
15. **§18.10, team sign-in:**
    - The pad is live before an e-mail is entered. The final digit sends `{email:''}`, which counts as a failed try (`employee.js:336`).
    - `team.signin.next` is defined but used by no element.
    - The anatomy order differs from §10.2.
16. **§10.9:** the field's value and placeholder have no type step.
17. **§18.7:** a compressed ticket can't be 192 tall. A 112 header plus a 64 K button leaves 16 for a 25.5 px Body line (35.7 line box). The 304 for a full card has no derivation.
18. **§10.3:** the sheet's drag region is undefined. The clock-in pad and the docked phone keypad fire on pointerdown inside draggable sheets, so a drag that starts on a key buzzes.
19. **§20.3 against §10.20:** "navigation never buzzes" is the reason for deleting `:677`, yet tab changes still fire Choose (`:1091`, `:1098`).
20. **§20.3, inventory incomplete:** `app/src/native-shell.js:161` (`KiwiNative.hapticLight`) and `:263` (`kiwi:native-haptic` "danger") aren't listed.
21. **§14.4 "transform and opacity only"** contradicts the colour animations: button and row fill, the inserted-line tint over `--k-dur-7`, and the KDS recall frame.
22. **§14.4 and §14.7:** the new bill row's fade-in has no duration, and the toast's swipe-down dismissal has no threshold.
23. **§20.4:**
    - The action names (`discount`, `pay`, `print`) aren't namespaced in the global `Kiwi.handlers` map, where `data-action="discount"` (`kiwi-caisse.html:6378`) and `"pay"` (`kiwi-serveur.html:8570`) already exist.
    - A single-action component can fire twice, once through the host's `data-action` click and once through `kiwi:action`.
24. **§21.3:** font URLs inside `assets/kit/tokens-2027.css` will be relative (`../fonts/…`), while the shell preload uses `assets/fonts/…`. Nothing says the scanner resolves both to one asset key.
25. **§2 and §17 tests** use light-DOM selectors (`.k-btn--primary`, `[data-k-total]`, `[data-k-part]`, `[data-key-figure]`) for elements that live inside shadow roots. The harness has to pierce roots, which isn't stated.
26. **§10.0:** the `:not(:defined)` placeholder is 36 for `k-segmented`, but the default size is 44 and kitchen is 56. That causes a layout shift on upgrade unless the placeholder is keyed to the size.
27. **§4.1 claims every WebKit feature** but omits WAAPI (§14.3), scroll-snap (§10.6), `Intl.RelativeTimeFormat` (§6.3) and `env()` safe areas.
28. **§11 and §23.6:** the Void sheet's stock copy has no fallback text if the stock module behaves differently.
29. **§18.4:** the floor plan's VoiceOver and keyboard order is unspecified.

**Checked and correct:**
- every §5.3 ratio, recomputed in Python with WCAG 2.x;
- the §14.3 spring settle times (300 to 308 ms, 333 ms, 367 ms) and ζ = 1.00;
- the §13.6 visual angles (22.9, 14.5 and 15.9 arcmin);
- the §13.3 menu widths and column counts;
- the §18.9 cash-count sum and the 17 taps;
- the §18.6 bands;
- the Arial fallback metrics (99.9 % and 24.9 %);
- the font file sizes;
- the 26 haptic lines in `native-runtime.js`;
- the `_lib.js`, `employee.js`, pairing and printer-bridge citations;
- the list of 8 pages that use `section`.
