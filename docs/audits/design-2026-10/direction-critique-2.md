# Critic review: Kiwi design 2027 direction (round 3, revision 2)

Revision 2 is a much stronger document than revision 1. But it fails again, and in a familiar way: it says it mirrors server code it read, and in three places it doesn't. Every number below was recomputed or checked against the repository. I edited, staged and committed nothing.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 5 | The before-and-after page is still missing. Home uses 7 type steps. Bold Text asks for weight 700, which the font file doesn't contain. `#0B6E4F` paints in dark even though §1 says it never does. One spacing value is off the scale. |
| UI | 5 | Three components are used but never specified. The PIN pad is missing states for real server responses. Two hero frames don't add up. §18.2 rewrites Principle 1 locally. §13 contradicts itself on the bill-pane width. |
| UX | 4 | Team clock-in is modelled on the wrong verifier. Sign-up and sign-in are merged into one screen. The cash count is stepper-only. One lockout freezes the whole till. Compliance, Split and the Home compare selector are missing. |
| Motion | 6 | The stated spring constants settle in 508 ms against a 350 ms target. The shipped lens also animates `top` and `height`. The same lens settles two different ways. Two durations contradict each other. |
| Feel and haptics | 4 | Haptics fire on pointerdown inside scrolling views. Four gestures fire two or three haptics. Commit haptics wait on the network with no time limit. The shipped "buzz on toast" hook survives the migration. |
| Copy and language | 6 | Most new strings exist only in English. One act has two names, and one code has two names. The "verbs on buttons" rule is broken. Three cross-references point to the wrong section. Two date and unit formats are undefined. |
| Accessibility | 4 | On iOS 15.0 to 15.3, keyboard users get no focus ring at all. VoiceOver can wander behind sheets. ARIA roles are misused. The date-range band is marked at 1.17:1. Two target-spacing violations sit on Home. |
| Honesty and consistency | 3 | The 05:00 cutoff is hard-coded although the server stores it per merchant. Team clock-in names the wrong verifier. "Drawer open" claims something Kiwi cannot see. Some "verified" counts and ratios are wrong. The ledger shadow run uses a production merchant. |
| Performance | 5 | The strings budget is about 2.5× below today's measured volume. Per-instance shadow-root styles have no plan on iOS below 16.4. The INP measurement stops before paint. Haptic latency has no budget. |
| Feasibility and migration safety | 3 | The kit relies on WebKit 15.4 and 16.4 features on a 15.0 target. `:host{all:initial}` resets the native touch behaviour. The stamp tool and `check.js` don't cover fonts, the sprite or `assets/kit/`. The lens would exist twice. The feel-layer inventory is incomplete. |

## 2. Verdict

**FAIL.** No dimension reaches 10.

## 3. Rebuttal rulings

1. **B5, the before-and-after page: REJECT.** The brief (lines 193-205) makes the page part of Phase 3's single deliverable and calls it the approval gate: "plus a published HTML page … Nothing is built until the owner approves this page." Nothing in the brief says "after the text". The round's deliverable is incomplete.
2. **B6, the `remaining` count: ACCEPT.** Verified. `_lib.js:1356-1359` returns `{error:'bad-pin', status:401}` with no count, and `:L1193` returns 429 with only `retry_after`.
3. **M3, a lens of at least 1.5:1: ACCEPT.** Verified: the edge measures 3.03 (light) and 3.35 (dark) against the track. The selected tab adds an icon-shape change and an accent-ink cue for the worst-case chrome (2.33).
4. **M10, one feel per class with 7 classes: ACCEPT, with a correction.** The plugin also exposes `vibrate({duration})`, a CoreHaptics continuous event at fixed intensity 1.0 and sharpness 1.0 (`Haptics.swift`). So "exactly 7 primitives" is false. Since that event is a full-strength buzz, it is no use for UI meanings, and the class model stands.
5. **M26, sizes above 1.35: ACCEPT.** Verified: `scaleForCategory` caps at 1.35, and `native-runtime.js:405` clamps with `Math.min(1.35, …)`.
6. **B3, stay on iOS 15.0: REJECT.** "Nothing in the kit needs iOS 16" holds, but the kit does need **15.4**:
   - §10.0 uses `:focus-visible` (Safari 15.4);
   - §14.4 relies on `contain: layout paint` (15.4);
   - focus rings that follow the border radius arrive only in 16.4;
   - sheet scroll containment (`overscroll-behavior`) arrives in 16;
   - the shadow kit's form and style primitives (`ElementInternals`, `adoptedStyleSheets`) arrive in 16.4.

   None of these is in the §4 matrix. The spec's own Option B (15.5) loses no device.
7. **M39, shadow DOM instead of `@layer`: ACCEPT.** The cascade reasoning is correct, and so is the 15.4 dependency of `@layer`. The isolation recipe itself has a separate defect (finding M2).
8. **M40, the pages that use `section`: REJECT.** The evidence is wrong:
   - `cookies`, `privacy`, `terms`, `status`, `support` and `mentions-legales` don't load `assets/tokens.css` at all. They load `assets/landing/tokens.css` (`cookies.html:19`).
   - `kiwi-admin.html` and `kiwi-serveur.html` don't load it either; it only appears in their comments.
   - The real set is 8 pages: brand, business-plan-v2, dashboard, kiwi-caisse, kiwi-cuisine, pitch, tickets and wallet.

   The remedy the spec adopts is still right.
9. **Polish 29, the font size: ACCEPT.** Verified: 44,872 B for Inter Tight; 42,848, 45,296 and 45,688 B for Plex Arabic; 40,404 B for JetBrains Mono. Inter is not installed. The switch is gated on the budget.

## 4. Findings, ranked

### Blockers

**X1 · §10.2 "Team clock-in · verifyStaffPin" and §18.8 step 3 · the team lock is modelled on the wrong server (Honesty, UX)**
- **Evidence:**
  - The team app signs in through `/api/employee` with action `login`, which calls `findEmployeeCredential(email, pin)` (`functions/api/employee.js:316-352`, `_lib.js:499`). That needs an **e-mail** plus the code.
  - It answers 401 `bad-employee-code`, 409 `employee-access-ambiguous` and 403 `store-suspended`.
  - Clock-in itself takes a **6-digit, expiring `attendanceCode`** that answers 403 `attendance-code-invalid` (`employee.js:484-497`).
  - The venue is unknown before login. CLAUDE.md §6 names `findEmployeeCredential` as the employee app's verifier.
  - §18.8 also says team devices "pair directly with the signed-in owner session". No route does that, and it would leave an owner session on a staff device.
- **What a 10 looks like:**
  - The team row is an e-mail field plus the pad, with those three states.
  - Clock-in is a 6-digit attendance-code pad with copy for an expired code.
  - Staff device setup is stated without an owner session.

**X2 · §3 row 1, §17.1, §10.19, §10.22, §18.9 · the business day is hard-coded at 05:00 (Honesty)**
- **Evidence:**
  - The file the spec lists as read defines `merchantCutoff()` (`_business-day.js:69-76`), which reads `merchant_config.business_cutoff` (0 to 12).
  - `month-report.js:62` uses it, and so do `z-reconciliation.js:45-70` and `:164-170` ("merchant changes trading hours").
  - Every store with a cutoff other than 5 would get ledger figures that disagree with its own Z reconciliation.
  - "Days run 05:00 to 04:59" and the chart axis would also be false for that store.
- **What a 10 looks like:**
  - The ledger takes cutoff and zone per store from that source.
  - Copy and the axis are built from the cutoff.
  - `ledger-agreement-test` includes a store with a different cutoff.

**X3 · Brief Phase 3 · there is no before-and-after page (Visual)**
- **Evidence:** see rebuttal 1.
- **What a 10 looks like:** the published page for the six screens.

### Major

**M1 · §4 and §10.0 · features missing from the iOS 15.0 plan (Feasibility, Accessibility)**
- **Evidence:**
  - A selector list containing `:focus-visible` is invalid before 15.4, so the whole rule is dropped and there is **no focus ring**.
  - The remaining 15.4, 16 and 16.4 features are listed in rebuttal 6, and none has a fallback.
- **What a 10 looks like:** either the matrix is complete and each feature has a fallback (a separate `:focus` rule, for example), or the floor moves to 15.5.

**M2 · §10.0 and §20.1 · `:host{all:initial}` resets inherited behaviour (Feasibility, UI)**
- **Evidence:**
  - `native-runtime.css:7` sets `-webkit-tap-highlight-color: transparent` on the body.
  - `:18` sets `-webkit-touch-callout: none` and `user-select: none` on controls.
  - `dashboard.html` uses `visibility: hidden` in 4 places.
  - `all:initial` puts all of these back to their defaults on every kit host. The result:
    - a grey tap flash on every kit tap;
    - the iOS callout and text selection on long press, which fights long-press-to-options;
    - kit elements staying visible or clickable inside hidden or `pointer-events:none` legacy containers.
- **What a 10 looks like:** an explicit inherit list (`visibility`, `pointer-events`, `cursor`, the three `-webkit-` properties), asserted by `kit-in-host-test`.

**M3 · §21.3 · the stamp checklist relies on tools that can't see the new files (Feasibility)**
- **Evidence:**
  - `tools/stamps.js:72` and `:79` match only `assets/…\.(js|css)?v=` in root HTML and `kiwi-sw.js`.
  - Fonts (`.woff2`), the per-surface sprite (`.svg`) and any locale URL built at runtime are therefore invisible to `bump-stamp` and `stamp-drift-test`. This is the silent stale-URL failure CLAUDE.md §3 warns about.
  - `check.js:38-44` lists `assets/` without recursing, so `assets/kit/*.js` skips the parse, forbidden-pattern and secret-string passes.
- **What a 10 looks like:** the tool is extended, how strings are referenced is stated, and `check.js` recurses.

**M4 · §20 · how shadow DOM meets forms, ARIA and `data-action` is unspecified (Feasibility, Accessibility)**
- **Evidence:**
  - `ElementInternals` (16.4) is missing on the target.
  - ARIA ID references can't cross a shadow root: `aria-controls` from a tablist to its panels, or `aria-describedby` to the "adjacent Footnote" that explains a disabled button.
  - `interactive.js` delegation sees only the retargeted host, so a multi-action component (bill panel: Split, Discount, Print, primary, overflow) has no contract.
  - A `disabled` attribute on an autonomous element does nothing natively.
- **What a 10 looks like:** a stated event contract, and native `<button>` and `<input>` plus their labels kept inside one root.

**M5 · §8, §14.4 and CLAUDE.md §4 · the lens would exist twice (Feasibility, Motion)**
- **Evidence:**
  - `liquid-lens.js` works on light-DOM `[data-kw-lens]` and cannot reach a lens inside a shadow root, so two lens implementations would run from stage 2 to stage 7.
  - The stage 7 retire list omits `liquid-lens.js`. CLAUDE.md says the lens is "Implemented once".
  - `liquid-lens.js:74`, which the spec cites, also transitions `top .15s ease` and `height .15s ease`: layout properties, an off-token 150 ms and an off-curve `ease`. §14.4's exceptions name only `width`.
- **What a 10 looks like:** one lens module, a retire step, and `top`/`height` either removed or listed as exceptions.

**M6 · §14.3 · the spring constants miss their own target (Motion)**
- **Evidence:**
  - k 420, c 40, m 1, 1/120 s steps, rest at |x| < 0.5 and |v| < 5: a 400 pt sheet settles in **508 ms** in simulation (500 ms when released at 800 or 2,000 pt/s). The target is ≤ 350.
  - Even k 900 at ζ 0.98 settles in 383 ms.
  - The lens also settles two ways: bezier overshoot after a tap, ζ 0.98 with no overshoot after a drag.
- **What a 10 looks like:** constants with a computed settle time, and one character for the lens.

**M7 · §15 · Adjust fires on pointerdown inside scrolling views (Feel)**
- **Evidence:**
  - The menu grid, the bill pane and the 9-row cash count sheet all scroll.
  - Every scroll that starts on a tile or stepper buzzes, against "Never buzz: scrolling".
- **What a 10 looks like:** pointerdown haptics only on surfaces that never scroll (PIN, cash keypad); in scrollers, the haptic fires on the confirmed tap.

**M8 · §15 · one gesture fires more than one haptic (Feel)**
- **Evidence:**
  - Stepper 1 → 0 fires Adjust, then Remove.
  - A row swipe fires Grab (drag start), then the tier's haptic.
  - A remote switch whose save fails fires Adjust, then Failed.
  - "Close the till" fires cash count saved, shift closed and Z generated: three Committed haptics.
- **What a 10 looks like:** each case resolved in the rules list.

**M9 · §15 · Committed waits on the network with no limit (Feel, Performance)**
- **Evidence:**
  - Committed fires on "the server or queue acknowledgement frame", with no bound. An ack 0.3 to 2 s later lands under the next gesture.
  - "Queue acknowledgement" contradicts "offline-queued sends fire nothing".
  - `Haptics.swift` builds a new impact or notification generator per call without `prepare()`.
  - §19 has no latency budget for haptics.
- **What a 10 looks like:** a named ack, a maximum latency (with no haptic after it), and prepared generators.

**M10 · §20.3 · the feel-layer inventory misses shipped haptic hooks (Feel, Feasibility)**
- **Evidence:**
  - `native-runtime.js:1923` (`kiwi:native-haptic`) and `:1924-1928` (`kiwi:toast` → ERROR or SUCCESS) are not mentioned.
  - About 25 direct `hapticLight` and `hapticNotice` calls are not mentioned either (for example the PIN observers at `:L1300-L1310` and `:L1417`).
  - Toasts keep buzzing, which §15 bans.
- **What a 10 looks like:** an inventory of every call site with its class, and the toast hook removed at stage 1.

**M11 · §19 · the strings budget is unreachable with one file per locale (Performance)**
- **Evidence:**
  - The budget is "≤ 15 KB gzip per locale".
  - Today `i18n.js` is 34.6 KB gzip and `caisse-lang.js` is 46.1 KB gzip, holding EN and AR for two surfaces only. That is about 40 KB per locale before the team app, KDS, ordering and verticals.
- **What a 10 looks like:** per-surface bundles with a measured budget each.

**M12 · §19 and §20 · per-instance shadow styles have no plan (Performance)**
- **Evidence:** before 16.4 there is no `adoptedStyleSheets`, so a 200-item menu means hundreds of `<style>`-bearing shadow roots. There is no budget or strategy for this.
- **What a 10 looks like:** a stated strategy (for example, one root per collection and light-DOM leaf elements), measured on iOS 15.

**M13 · §6.1 versus §6.2 and §16 · Bold Text asks for a weight the fonts don't have (Visual, Accessibility)**
- **Evidence:**
  - Bold Text maps 600 to 700, but the Inter subset is `wght` 400 to 600 and Plex Arabic loads only 400, 500 and 600.
  - WebKit will draw a faux bold.
- **What a 10 looks like:** the axis goes to 700 (and Plex 700 loads on demand), or Bold Text is capped at 600.

**M14 · §18.1, §18.3, §18.6 · the type-step counts are wrong (Visual, UI)**
- **Evidence:**
  - "See all" is a Plain button. Buttons default to size M, whose label is Callout, so Home has **7** steps.
  - Kiwi AI's plain "How Kiwi AI uses your data" adds Callout, so it has 4, not 3.
  - The payment frame's count depends on the keypad digit size, which §10.25 never specifies.
- **What a 10 looks like:** the counts recomputed, and the key label size specified.

**M15 · §2 versus §18.2 · Principle 1 is rewritten inside a hero section (UI, UX)**
- **Evidence:**
  - On Orders, the key figure (Heading 20) sits under a Title 28 large title.
  - §18.2 makes the large title "exempt", while §2's test text stays unchanged.
  - The brief's rubric line 1 still says the number that matters is the largest thing on the page.
- **What a 10 looks like:** an Orders layout that obeys the rule as written.

**M16 · §18.6 · the Kiwi AI coordinates can't hold their content (UI)**
- **Evidence:**
  - The intro band is 160 to 206 (46 pt), but two Body lines need 47.6.
  - The plain link has no y band at all.
  - The Today card is 108 pt but needs at least 133 (Footnote 17.6 + 2 × 23.8 + a 44 pt chip + 24 of padding).
- **What a 10 looks like:** bands that sum.

**M17 · §10.2 · the PIN pad is missing real server states (UI, Honesty)**
- **Evidence:**
  - `/api/pin/verify` can also return 403 `forbidden-till` (`_lib.js:1290`).
  - The pairing redeem returns 422 `invalid_or_expired` (`pair/redeem.js:106`, `:153`, `:158`), and the pad has no "code expired" state.
  - The printer code is redeemed by the **bridge** (`print/bridges.js:112-118`), so no Kiwi screen ever types it.
- **What a 10 looks like:** one state per response, and the printer row removed or redesigned as a code display.

**M18 · §10.2 · one lockout freezes every cashier on the till (UX)**
- **Evidence:**
  - The rate-limit bucket covers every code of the store and is keyed `till:<merchant>` (`_lib.js:1268-1271`, `:1296-1302`). A success does not clear it.
  - So 8 typos by anyone lock every cashier on that till for 15 minutes, mid-service.
  - There is no recovery path, and §23 is silent.
- **What a 10 looks like:** an owner unlock or similar recovery path, and copy that says the whole till is paused.

**M19 · §10.26 · "Drawer open" claims a physical state Kiwi can't see (Honesty)**
- **Evidence:**
  - A bridge ack proves the bytes were written, not that the drawer opened. `printer-bridge.js:1626` itself treats outcomes as uncertain.
  - Only the cloud relay is specified. The local bridge, WebUSB and Web Bluetooth transports are not.
- **What a 10 looks like:** "Drawer signal sent", with status copy per transport.

**M20 · §18.9 · the cash count is stepper-only (UX)**
- **Evidence:**
  - Counting 8,842 MAD takes about 40 to 70 taps, and the stepper value is not editable.
  - The 0.20 and 0.10 MAD coins are missing.
- **What a 10 looks like:** a count field per row using the cash keypad, with the stepper secondary.

**M21 · §18.8 step 0 · sign-up and sign-in are one screen (UX)**
- **Evidence:**
  - Step 0 asks for name, business, e-mail and password, plus "Forgot password?".
  - The path for an existing owner on a new device is undesigned.
- **What a 10 looks like:** two modes, each designed.

**M22 · §12 · Compliance is missing from the IA (UX)**
- **Evidence:** the brief lists Compliance as an owner-dashboard surface. §12 claims "every brief surface" but never places it.
- **What a 10 looks like:** Compliance placed for phone, iPad and desktop.

**M23 · §10.23 and §18.3 · Split and Discount lead nowhere (UX)**
- **Evidence:** both are on the hero bill, and both flows are undesigned.
- **What a 10 looks like:** the flows designed, or explicitly deferred to a named round.

**M24 · §13.1 versus §13.3 · the bill-pane width contradicts itself (UI, UX)**
- **Evidence:**
  - §13.1 says the pane is "always 432"; §13.3 says 360 (≥ 1000 wide) and 320 (768 to 999).
  - No till layout exists for widths 600 to 767, which includes the iPad mini in portrait (744).
- **What a 10 looks like:** one width rule, and a till layout for that range.

**M25 · §17.2 versus §18.1 · Home has no compare selector (UX, Honesty)**
- **Evidence:**
  - §17.2 says Home and Report share one compare selector, but §18.1 has none.
  - The shipped Home has "Compare" (`01-home.png`).
  - The "Removed" list also omits the Success rate tile and the Compare button.
- **What a 10 looks like:** the selector placed on Home, and the "Removed" list complete.

**M26 · §6.3 · the Floor shows one figure at two precisions (Honesty)**
- **Evidence:** on iPad the table shows "230 MAD" next to the bill pane's "230.00 MAD", and iPhone rows show "230.00".
- **What a 10 looks like:** one precision for the Floor screen.

**M27 · §18.5 · the Customers counts don't add up (Honesty)**
- **Evidence:** Regular 3 + New 2 + Inactive 2 = 7, against "All 8". VIP is only a row marker, so one customer has no status.
- **What a 10 looks like:** counts that sum, with every customer in exactly one status.

**M28 · §10.19 · in-range days are marked by tint alone (Accessibility)**
- **Evidence:** the accent-tint band measures 1.17:1 (light) and 1.33:1 (dark) against s1, the same failure as round 2's M29.
- **What a 10 looks like:** a second cue.

**M29 · §10.3, §10.6, §10.7, §10.24 · semantics are missing or wrong (Accessibility)**
- **Evidence:**
  - Sheets: no `role="dialog"`, no `aria-modal`, no labelled-by, and no way stated to keep VoiceOver off the page behind on iOS 15 without `inert`.
  - `role="tablist"` is used on filters that have no tab panels.
  - Exclusive chips use `aria-pressed` where radio semantics belong.
  - `aria-description` (ARIA 1.3 draft) carries the only non-visual "Has options" cue, with no WebKit support stated.
- **What a 10 looks like:** dialog semantics with VoiceOver containment on iOS 15, radio semantics for exclusive choices, and no reliance on draft ARIA for the only cue.

**M30 · §18.1 · targets sit too close (Accessibility)**
- **Evidence:**
  - The delta's 44 pt hit area spans 179 to 223, and the segmented control's spans 226 to 270: 3 pt apart.
  - The "See all" hit area (750.5 to 794.5) overlaps the first row, which starts at 793.
  - §10.0 requires 8 pt between targets.
- **What a 10 looks like:** at least 8 pt between every pair of targets.

**M31 · §10 to §18 · new copy is English only (Copy)**
- **Evidence:** only §9.4's 8 rows give FR and AR. PIN states, offline, drawer, payment, cash count, empty states and onboarding are EN-only.
- **What a 10 looks like:** FR and AR for every new string.

**M32 · §21.2 · the ledger shadow run uses a production merchant (Feasibility, Honesty)**
- **Evidence:**
  - The plan runs "a read-only Santos Store session". The brief says Santos is "never test on them".
  - CLAUDE.md §6 forbids agents from entering real merchants' codes.
  - Diffs are logged to the console and `window.__kiwiLedgerDiff`.
- **What a 10 looks like:** a Santos-shaped fixture with anonymised data.

**M33 · §13.2, §18.6, §18.7 · components used but not specified (UI)**
- **Evidence:**
  - The phone till's accent "bill bar" has no component spec and no states.
  - Kiwi AI's accent send circle matches no button variant in §10.1.
  - The "source chip" uses Footnote, against §10.7's Callout chip.
  - The KDS header's sixth segment is "More", although §10.6 says more than 5 segments become a scrolling track.
- **What a 10 looks like:** each specified in §10 with its states, or replaced by an existing component.

**M34 · §10.26 · the cash button shows the tendered amount (UX)**
- **Evidence:** "Confirm cash · 250.00 MAD" labels a 230.00 sale with the amount handed over, not the sale.
- **What a 10 looks like:** "Confirm 230.00 MAD cash · change 20.00".

### Polish

1. **§1 versus §5.2:** the dark `--k-inverse-accent` is `#0B6E4F`, which §1 says never paints in dark.
2. **§5.3 contrast table:**
   - The dark selected-row bar is listed at 10.11, but accent on s1 measures **8.58**; 10.11 is accent-ink.
   - The light chrome "typical" row reads 17.90, 7.53, 5.79 and edge 3.31. Chrome over the canvas equals the canvas, so the values are 17.73, 7.46, 5.74 and 3.28.
3. **§17.3:** the card last-four generator is seeded FNV (`dateRange.js:4371-4374`), not `Math.random`. It should still be deleted.
4. **§20.4:** the page list is wrong; see rebuttal 8.
5. **§18.1:** the 6 pt gap between 186 and 192 is off the spacing scale.
6. **§6.4 versus §10.20:** "1.35: icon only" at every width contradicts "≥ 1.24 on widths < 402".
7. **Cross-references:** §1 points to "§6.6", which doesn't exist; §6.4's label HUD points to §10.24 (it is in §10.20); §14.4 points to §14.6 (screen readers).
8. **§10.22:** the chart long press is "200 ms (`--k-dur-3`)", but `--k-dur-3` is 240. The long-press threshold for tiles is undefined.
9. **§14.5:** `motion-park-test` would fail on the endless loops (spinner, skeleton pulse) unless they are exempted.
10. **§10.13:** the badge has a fixed height of 18, but Caption at 1.35 needs a 21 pt line box. `kit-lint` would also fail the PIN keys, keypad keys, avatars and quantity boxes unless they are listed as exemptions.
11. **§18.4:**
    - "Every status pairs fill, edge and icon", yet Free, Ordering and In progress have no icon.
    - Paid has no edge and measures 1.08:1 against bg.
    - §5.3 omits Ordering and Paid entirely.
12. **§15 internal consistency:**
    - Grab is a "threshold" class, yet it fires on Open table's commit.
    - "Never buzz on the KDS" conflicts with the KDS pairing pad's haptics.
    - §11 fires Success after Tier B acts, which is missing from §15's Committed list and goes against the brief's "none after".
    - Tier A Remove gets Heavy, heavier than any irreversible act.
13. **Names:**
    - "End of shift" in the glossary versus "Close the till" in §18.9.
    - The same code is "owner code" in one place and "account code" in another, and neither is in the glossary.
    - "7 days" on Home versus "Last 7 days" in the picker.
    - The date "3 Oct" and the unit "1 pt" are not defined in §6.3.
    - The floor statuses are missing from the glossary.
14. **Verbs on buttons:** "Custom amount", "No receipt" and "Later" break the rule.
15. **§9.2:** the AR plural labels describe ranges, but CLDR uses n % 100, so 103 is "few" and 111 is "many".
16. **§8:** the variant file naming can't express weight 500 at optical size 40, which the KDS's 32 pt icons need.
17. **The Inter Tight fallback branch** has no tracking table and no fallback metrics; the Arial at 107 % fallback is tuned for Inter.
18. **§5.1:** ink-2 and ink-3 differ by only 1.34:1 (7.46 versus 5.55 on bg), so tertiary text reads as secondary.
19. **§10.21:** "positive" is used as a colour but is not a token.
20. **§20.2:** `kit-in-host-test` expects computed styles equal to the bare gallery, which contradicts §6.5's inherited `--k-font`.
21. **§19:** INP measured to "the first rAF after the DOM commit" stops before paint and under-reports.
22. **§10.20:** the tab capsule's 20 pt margins don't match the compact grid's 16 pt margins below 402 wide.
23. **The floor popover's "6+" chip** has no follow-up input.
24. **§21.1:** `localStorage.kiwiSkin2027.<surface> = on` is not a valid key and value form.
25. **No hero frame at 375 × 667,** the brief's smallest supported device.
26. **The dashboard lock** shows the owner before entry, but `verifyAccountPin` accepts any role that opens the dashboard (`_lib.js:1415-1427`), so a manager unlocking it sees the owner's face.
27. **The payment pane** has two Display figures, which makes the key-figure test ambiguous.

The builder should fix every item above, or rebut it with evidence to a fresh critic. The spec is at `/Users/zaka/Developer/kiwi/docs/specs/kiwi-design-2027.md`.
