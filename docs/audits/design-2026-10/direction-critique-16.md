# Design direction · round 17 critique of revision 16

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | No findings. Every frame's computed sizes are on the six steps, the SE status bar is 13 px, and the contrast spot-checks match §5.3. |
| UI | 8 | The PIN pad has no "till approval" use and no state for a 200 whose role does not open the till (M1). |
| UX | 7 | Built as written, either a waiter's code opens the till or a cashier is told a manager is needed (M1). The dashboard's offline unlock is lost or misdescribed (M2). |
| Motion | 10 | No findings. Spring settle times re-simulated at 308/308/300, 333 and 367 ms. The new exit fade and its reduced-motion row hold. |
| Feel and haptics | 8 | §15.3 fires Failed for a cashier approving a till gate (M1). An offline code refusal has no stated haptic, and "codes are online-only" survives in §15.3 (P3). |
| Copy and language | 7 | Manager copy appears on cashier-level gates and the role refusal has no key (M1). `pin.offline` is false on the dashboard (M2). Two wording errors (P1, P2). |
| Accessibility | 8 | Offline, the pad fires an assertive alert on every automatic retry, about every 10 s (M3). |
| Honesty and consistency | 6 | The false premise recurs for the dashboard (M2). The glyph and paint checks read a reference, not the drawing (M4). Three statement drifts (P3, P6, P7). |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 8 | The census rule as worded fails stage 1's own design (P5). The pad's retry and timeout rule is unspecified for most uses (P4). M2 implies an unlisted regression. |

## 2. Verdict

**FAIL.** Seven dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (largest remainder): ACCEPT.** `shareWeighted` (`kiwi-caisse.html@31c94529:13490-13506`) floors each share and hands leftover cents by fraction, ties to the lower index. Tips use it at `:13611`.
- **Rebuttal 2 (no Cancel in the roster step): ACCEPT.** The reasoning holds. One wording issue: it still says "Try again stays focusable and live throughout", which revision 16's P2 made false (P7).

## 4. Findings, ranked

### Majors

**M1 · major · §10.2 uses table (1634-1642), response table (1674-1698), §9.6 `pin.manager.sub` / `.not_manager`, §15.3 (L2816) · the till's approval level and its role refusal are missing**

- **The shipped till has two approval levels.** `openAuthorization` (`kiwi-caisse.html@31c94529:17319-17345`):
  - **Till level:** title "Autorisation caisse", hint "Code caissier, manager ou propriétaire requis", routed to `authorizeTill`.
  - **Manager level:** routed to `authorizeManager`.
  - **Till-level call sites:** `requireTillOperator` at `:10907`, `:10924`, `:10943`, `:10951`, `:13026`, `:13071`, `:16468`, `:16995`, `:19024`, `:21160` and `:21352`, plus `orderpro-inbox.js:243-247` through `KiwiAuthorizeTillAction`.
- **The server never checks the role.** `verifyStaffPin` (`_lib.js:1251-1350`) returns 200 for any staff code, a waiter's included. The role check runs only in the browser: `acceptStaff` (`caisse-pairing.js:763-779`) and `authorizeTill` (`:941-948`).
- **What the spec does instead:**
  - Line 1697 files the till-operator gates under "Manager", refused with `pin.manager.not_manager`.
  - `pin.manager.sub` says "{act} needs a manager's personal code".
  - No response row covers "200, role does not open the till", for the till lock or for the till gates.
  - Line 1694 cites the shipped refusal "by name", but §9.6 has no key for it, which breaks the coverage rule (1058).
  - §15.3 fires Failed for any non-manager role.
- **Consequence, built as written:** one of two things happens.
  - The "200 ok" row lets a waiter's or kitchen code unlock the till and approve cash out, close the till or a shift change. That is unsafe.
  - Or "Close the till needs a manager's personal code" is false copy, and a cashier gets Failed and is blocked at close.
- **What a 10 looks like:**
  - An eighth use, till approval, with its own title and sub naming the real roles.
  - A "200, role does not open the till" row for the till lock and the till approval, with a key such as `pin.not_till`.
  - The matching §15.3 row.
  - The offline row split by access level, and the full list of call sites.

**M2 · major · §10.2 network row (1693), Rules (1730), `pin.offline` (L1118), lint rationale (L1064), Sources (20) · the dashboard lock compares codes in the browser**

- **What the shipped dashboard does:**
  - `dashboard.html@31c94529:5870-5891`: `allPins()` reads plaintext `{role, code, name}` from `localStorage.kiwiPins`, with the comment "Keep the old full fallback offline".
  - `:6355-6358`: `configuredPins().find(p => p.code === val)` unlocks without asking the server. Online this applies to the owner's code; offline, to every configured code.
  - `:6349-6354`: its comment says local codes go first "parce qu'ils répondent sans réseau".
  - `assets/onboarding.js:645-648` and `:676` write those codes during onboarding.
- **Spec claims this makes false:**
  - "None of these has an offline check".
  - "nothing anywhere compares a code against a code".
  - `pin.offline`: "Codes are checked online, so this screen can't unlock yet".
  - The Sources line: "dashboard.html … ask[s] the server only".
  - The rules' "Online, on the server only" list also omits `/api/employee`.
- **This is the same class as round 16's M1**, on the owner's main device (the onboarding browser or the app).
- **Consequence:** either offline owner unlock is silently removed (not in §22 or §23), or the copy is false. Plaintext codes kept in `localStorage` go unmentioned. On a till the owner onboarded (§23.10) they stay until a re-pair purges them (`tenant-purge.js:28`), against the lint's "no code … kept on one".
- **What a 10 looks like:** the mechanism is stated, with an owner decision (keep it through a verifier like the till's, or remove it, plus migrating the plaintext codes), its own rows and copy, and a §22 entry if it goes.

**M3 · major · §10.2 network row (1693), message-row rule (1727), §10.26 pad step (2271-2272), R8 · an assertive alert on every automatic retry**

- **The three rules that combine:**
  - `pin.offline` is written to `role="alert"`.
  - Each answer is cleared and rewritten, "so a second identical refusal is announced again".
  - The network row retries automatically "every 10 s".
- **No rule silences automatic retries on the pad,** although the roster step has one (2310). `pin-announce-test` enforces the rewrite.
- **Who hits it:** offline, on the dashboard lock, team sign-in, clock-in, the pairing pad and the store lock, VoiceOver is interrupted about every 10 s. This contradicts §10.26's own announcing rule ("a re-render … writes nothing").
- **What a 10 looks like:** an automatic retry writes nothing unless its cause changes. A Try again counts as the cashier's and is announced. The test asserts silence for repeated automatic answers.

**M4 · major · §18.0 checks 1 and 13, preview `glyph()` and `painted()` (2498-2513, 2580-2594), claims at lines 7, 11, 3077 and 3083 · the checks read the reference, not the drawing**

- **What the checks actually read:** `glyph()` returns the `href` id when the symbol has any `<path>`. `painted()` compares the `<svg>`'s computed fill. Delta text colour is read from its class.
- **My 13 mutations all stayed green:**
  - The path data of `#i-arrow_upward` and `#i-arrow_downward` swapped in the sprite, so every Home arrow points the wrong way.
  - The contents of `#i-check_circle` and `#i-receipt_long` swapped.
  - `#i-star`'s path emptied.
  - `rotate(180deg)` on the compare arrow.
  - `scaleY(-1)` on the Arabic compare arrow.
  - `fill="#0B6E4F"` set on the compare arrow's `<use>`, as an attribute and again as a style.
  - `visibility:hidden` on the compare arrow.
  - `opacity:0` on the SE orders arrow.
  - `scale(0)` on a floor status icon.
  - An inline accent colour on the compare delta text, which keeps its `dang` class.
- **The kit's icon test** only checks that the `<use>` rectangle overlaps the `<svg>`.
- **What a 10 looks like:**
  - Each symbol's path is compared with a hash of `assets/icons/material/<name>.svg`.
  - Each icon's computed transform chain is checked, allowing only §9.5's `scaleX` mirror for icons that may mirror.
  - Fill is read from the `<use>` and the path, or from a pixel probe.
  - Visibility and opacity must be above zero.
  - Delta text colour is checked by computed colour.
  - One mutation for each of these.

### Polish

| # | Section | Finding | Evidence | What a 10 looks like |
|---|---|---|---|---|
| P1 | §9.6 `pin.offline_unknown` (L1119) | "…and this one isn't among them" claims something the till cannot know. A code used in the last 7 days can be evicted by the 12-row cap. | `caisse-pairing.js:88` (`rows.slice(-12)`). Rows are written for any proven code, roles that don't open the till included, because `rememberOfflinePin` runs before `acceptStaff`. | "…and this one can't be checked offline on this till." |
| P2 | `pin.offline` scope (L1118) | "this screen can't unlock yet" is used on clock-in, team sign-in and the pairing pad, where nothing unlocks. | Use list in the key's own note and at line 1693. | A wording that fits each use, or a neutral "can't be checked yet". |
| P3 | §15.3 (2803, 2815) vs §10.2 (1695) | "codes are online-only" survives. An offline refusal is "As bad-pin", yet §15.3 says "network: nothing", while every other refused code fires Failed (§15.1). | Lines 2784, 2803, 2815. | The sentence corrected, and the offline verdict given its haptic and trace trigger. |
| P4 | §10.2 (1693) vs §10.26 (2298) | The pad retries "every 10 s" with no timeout outside the till (the 12 s is `verifyCode`'s) and no end-of-request rule. The roster step says "as in the pad's network row" but defines the rule differently. | Lines 1693, 2298. | One retry and timeout rule, stated once, used by both. |
| P5 | §6.1 (557), §6.5 (736) vs stage 1 (551-554, 3976) | "can be served by two URLs that are not the same package's subsets" fails the 47 pages where stage 1 deliberately declares Plex Arabic at 400 to 600 from both Google and `legacy-faces.css`. | §6.1 class table and the stage 1 row. | "Is requested from two URLs" (observed on the network), or the stage 1 to 6 overlap allowed by name. |
| P6 | §23.2 (4079), §10.2 (1696, 1709) | "opens offline with no code" understates it. The catch also opens the till on a 5xx, a captive portal's HTML 200, or JSON without `pins`. | `caisse-pairing.js:621-632`, `:652-660`. | "whenever the staff list cannot be loaded", so the owner decides on the real trigger. |
| P7 | Rebuttal 2 (4344) | "Try again stays focusable and live throughout" contradicts revision 16's P2 (no button before the first failure). | Lines 2282 and 2293. | The rebuttal reworded. |

## 5. Checked and found correct

- **Round 16 fixes:**
  - The till verifier's lifecycle table checks out line by line at `31c94529`: `:33`, `:57`, `:63`, `:70-99`, `:88`, `:221`, `:376`, `:584`, `:650`, `:656`, `:658-659`, `:763-779`, `:896`, `:921`, `:923`, `:941-962`, `:958`, `maison-stock-movements.js:434-438`. Its offline refund, stock and cancel behaviour is described correctly.
  - The message row's regions and rule are sound apart from M3.
  - Critique 15 polish P1 to P8 are fixed: the R6 focus assertions, the reserved Try again slot, retry timing in the roster step, the "Keep it open without reloading it" copy, the per-weight-and-character census wording with Inter Tight allowed by name, the exit fade in §14.4 and §14.5, the file-name note, and the SE status bar at 13 px.
- **Strings:** 454 rows and 444 Arabic strings, generated independently. 452 × 8 = 3,616. My French punctuation and U+202F lints pass (the only hits are exempt ICU selectors).
- **Fonts:**
  - The preview's `@font-face` block matches §6.1 descriptor by descriptor, Latin Extended declared before Latin, and the six file sizes match.
  - My corpus: every non-Arabic character resolves to Inter Tight and is in both the macOS Arial and the iOS 26.5 WebFonts Arial. Every Arabic character, tatweel included, is in Plex 400 and 600. U+2020 is only in the Latin Extended file, as the range design expects.
- **Motion and colour:** spring settle times and the damping ratio (1.0) reproduced. Six contrast ratios spot-checked against §5.3; all match.
- **Preview:** 17 of 17 checks and 142 of 142 mutations, and `why(n)` gives the reason each row targets for all 142. The frames hold 132 icons. Every frame's computed type sizes are on the six steps.

**Housekeeping:** the HTTP server I started (port 8867) is stopped, and I closed the one tab I opened. I deleted only the `critic16` scratch subfolder. Nothing in the repo was edited, staged or committed.
