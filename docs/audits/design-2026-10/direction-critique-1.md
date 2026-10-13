# Critic review: Kiwi design 2027 direction (round 2)

The direction is a real step up from round 1. It has one token file, a kit, keyed strings, a ledger, a haptics map and a migration ladder. But if it were built exactly as written, it would ship invented card-terminal features, haptics that never fire on iOS, a layout model the app's minimum iOS (15) cannot run, and a principle its own showcase screens fail.

I recomputed every contrast ratio with the WCAG 2.x formula and checked the claims against the codebase. No files were edited, staged or committed.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 5 | The black ink-1 lens breaks the colour hierarchy, and two different lens paints sit side by side. The hero screens use 7 type steps against a 6-step rule, and the tab lens measures 1.09:1. |
| UI | 4 | Components the spec itself uses are missing, including the chart on the top screen. The destructive-button rules contradict each other, and Principle 1 fails on the spec's own hero screens. |
| UX | 3 | The card flow describes a terminal integration that does not exist. Four of the six required hero screens are absent. Options are hidden behind long-press, and the KDS input and overflow, till IA and onboarding are undefined. |
| Motion | 6 | Good grammar, but it breaks its own transform-and-opacity-only rule (row height, lens width, button width). The physics model is impossible in WAAPI, and many durations are off-token. |
| Feel and haptics | 4 | Bare `selectionChanged()` is silent on iOS. Two haptics per gesture, one haptic for seven meanings, and a double fire with the existing native feel layer. |
| Copy and language | 6 | One act has two names, there are no plural rules for Arabic, no missing-key fallback, RTL icon and keypad direction are unspecified, and the number formats are inconsistent. |
| Accessibility | 4 | Fixed pixel boxes fight Dynamic Type up to 2.35×, selected rows rely on a 1.17:1 fill, timed actions disappear, and swipe-only and long-press-only actions have no alternative. Reduce Transparency and Increase Contrast are absent. |
| Honesty and consistency | 3 | Invented terminal and card data, PIN lockout constants that contradict the server, a ledger with no business-day boundary, and wrong numbers in the spec's own contrast tables and hero data. |
| Performance | 2 | No INP, CLS or frame budget, no font-loading plan, no custom-element upgrade plan, and unmeasured "60 fps" and "110 KB" claims. |
| Feasibility and migration safety | 3 | iOS 15 target, tokens scoped to the page versus per-component adoption, no plan for cascade isolation against Vexel, unflagged changes to live pages, and a duplicate of the shipped Dynamic Type plugin. |

## 2. Verdict

**FAIL.** No dimension is at 10.

## 3. Findings, ranked

### Blockers

**B1 · §13.2 Payment (Card), §10.3 destructive confirm, §9 "Payment declined" · the card integration is invented**
- **Finding:** The spec says "Present the card on the terminal with the live terminal state". The void body says "230.00 MAD goes back to the card ending 4421". The haptics map has "Payment declined" and "server confirmed".
- **Evidence:**
  - `assets/caisse-hardware.js:26-38`: "Kiwi does not yet drive a certified EMV terminal", returning `recordOnly: true, externalTerminal: true`.
  - A card's last 4 digits exist only as `Math.random` demo output (`assets/dateRange.js:4387`).
  - Kiwi cannot know whether a card was declined, and cannot refund a card.
- **What a 10 looks like:**
  - A record-only card step: "Paid on the terminal? Confirm 230.00 MAD by card".
  - The void copy describes what Kiwi actually does: "Sale cancelled in Kiwi. Refund the card on your terminal."
  - No "declined" or "live terminal" state until a real terminal integration exists.

**B2 · §9 haptics map · selection haptics are silent on iOS**
- **Finding:** Segmented, tab, sidebar, chip and chart scrub are all mapped to bare `selectionChanged()`.
- **Evidence:**
  - `app/node_modules/@capacitor/haptics/ios/.../Haptics.swift:24-29`: `selectionChanged` does nothing unless `selectionStart()` has created the generator first.
  - The shipped code already works around this with start, changed, end (`app/src/native-runtime.js:2091`).
- **What a 10 looks like:** The map defines a discrete selection as `selectionStart` → `selectionChanged` → `selectionEnd`, and a continuous one (scrub) as a generator held open for the gesture. The haptics map test asserts the bracket.

**B3 · §5.2 container queries, §5.5 `backdrop-filter`, §8.1 drag physics · not supported on iOS 15**
- **Evidence:**
  - `app/ios/App/App.xcodeproj/project.pbxproj`: `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.
  - Container queries need iOS 16, and the whole layout model (§5.2) depends on them.
  - Unprefixed `backdrop-filter` needs iOS 18. Below that, the spec's own "no support" fallback silently drops every material.
  - Generating a spring as `linear()` easing needs iOS 17.2.
- **What a 10 looks like:** Either raise the minimum to iOS 16 and state which devices are lost, or specify a fallback without container queries. Write `-webkit-backdrop-filter`, and name the spring implementation.

**B4 · §1 Principle 1 and its test · the hero screens fail the spec's own test**
- **Finding:** The test says the "count of visible `.k-btn--primary` equals 1".
- **Evidence:**
  - §13.1 Home has no primary at all.
  - §13.3 has a primary K button on every ticket: "Start" ×3 and "Ready" on 42.
  - The test fails on both showcase screens.
- **What a 10 looks like:** Reword the principle: at most one primary for the view's main task, and per-item actions in a collection use a defined variant. Rewrite the test to match, and show each hero screen passing it.

**B5 · Brief Phase 3 versus §13 · four of the six required hero screens are missing**
- **Finding:** The brief asks for dashboard home, orders, till menu and bill, floor, customers and Kiwi AI, plus a published before-and-after page. The spec covers Home, the till bill and the KDS.
- **Evidence:** Orders, Floor, Customers and Kiwi AI are not designed. The floor plan appears only as a haptics row, although round 1 flagged the phone floor map overflowing and free-table dots being invisible. There is no before-and-after page.
- **What a 10 looks like:** All six at coordinate level, like §13.1 and §13.2, plus the published before-and-after page.

**B6 · §10.2 PIN pad · the lockout copy contradicts the server, and there is no offline state**
- **Finding:** The pad says "After 5 failures… Try again in 0:30" and "3 tries left".
- **Evidence:**
  - `functions/auth/_lib.js:1157-1159`: 8 failures per 15-minute window, then a 15-minute block. The pad would show false information.
  - The check is server-side only, and the pad has no offline state, so a till that loses its connection can lock staff out mid-service with no designed screen.
- **What a 10 looks like:** The pad shows the `remaining` and `retryAfter` values returned by `/api/pin/verify`. It also has an offline state with honest copy and a defined policy for the session.

### Major

**M1 · §10.4 and §0 · black ink-1 lens**
- **Finding:** "Ink-1 capsule" in light is a 19.03:1 black pill, the strongest-contrast object on Home, sitting directly under the hero.
- **Evidence:**
  - It contradicts §0, "the brand colour belongs on the one action".
  - It contradicts §14, which deletes "`background: var(--ink)` slabs".
  - It is the pattern `tools/check.js:182` bans because it "inverts in dark mode". It only escapes the lint by being renamed.
- **What a 10 looks like:** A lens that stays below the primary in visual weight, for example surface-1 on a surface-2 track with elevation 1, and a selected label in ink-1 at 600.

**M2 · §10.4 versus §10.12 · two lens paints for one job**
- **Finding:** The segmented lens is ink-1, while the tab capsule, rail and sidebar lens is accent-tint.
- **Evidence:** CLAUDE.md §4 and Principle 3 require one selection style.
- **What a 10 looks like:** One lens paint across segmented controls, tabs, the rail and the sidebar.

**M3 · §10.12 tab capsule · the signature motion is invisible in light**
- **Evidence:** The accent-tint `#E2EFE8` lens on light chrome (about `#F8F6F2`) measures 1.09:1. In dark, tint on surface-1 measures 1.33:1. The 310 ms spring the brand is built on cannot be seen.
- **What a 10 looks like:** A lens of at least 1.5:1 against its track, or a shape cue that moves with it.

**M4 · §4.2 "At most 6 steps per surface" · the hero screens use 7**
- **Evidence:**
  - §13.1 uses Display, Title (KPI values), Heading ("MAD", "Latest orders"), Body, Callout (segmented), Footnote and Caption (axes, tab labels).
  - §13.2 also uses all 7.
- **What a 10 looks like:** The hero screens obey the rule, for example the KPI value drops to Heading or the tab labels move out of the count, and a lint counts steps per frame.

**M5 · §2 #7, §10.1, §10.5, §10.7 · destructive rules contradict each other**
- **Evidence:**
  - §10.1 says danger-solid "exists only inside the confirm sheet", but the §10.5 swipe action is danger-solid.
  - §2 #7 says a destructive control "is a tonal danger button and always opens a confirm sheet", but §10.7 "Remove" is plain, and stepping a line to 0 has no confirm.
- **What a 10 looks like:** One rule with stated exceptions. For example, unsent lines are removed without a confirm (undo toast), and sent lines are voided through the confirm sheet.

**M6 · §10 · missing kit components the spec itself uses**
- **Finding:** These are used in the spec but never specified:
  - the chart (Home's centrepiece, with scrub, tooltip and haptics);
  - the text and search field;
  - the switch, stepper, chip, popover, tooltip, banner, badge, avatar and skeleton;
  - the spinner, the date-range picker (the calendar button in §13.1), the options/modifier sheet, the cash keypad, the receipt choice and the floor plan.
- **What a 10 looks like:** Each one has its anatomy and the full state table, like §10.1.

**M7 · §8.3 "Only transform and opacity are animated" · the spec breaks it repeatedly**
- **Evidence:**
  - §8.2 bill line insert animates "row height 0 to h", and line delete is a "collapse".
  - §10.7 has a "width spring" on the primary.
  - The shipped lens animates `width` (`assets/liquid-lens.js:74,149`), and §10.4 says to register in that file.
- **What a 10 looks like:** A FLIP or transform-only recipe for each case, or the rule amended to allow these named exceptions.

**M8 · §8.1 drag physics and §8.3 "every animation runs through WAAPI and retargets"**
- **Finding:** WAAPI has no spring and no velocity-preserving retarget. A cubic-bezier retarget restarts at zero velocity.
- **What a 10 looks like:** A named solver (requestAnimationFrame integration, or generated `linear()` keyframes on iOS 17.2 and later with a fallback), and a retarget rule that carries velocity forward.

**M9 · §9 "more than one haptic per gesture" (never) · the spec does it twice**
- **Evidence:**
  - The cash Confirm in §13.2 fires Heavy (drawer) and Success (payment accepted).
  - The last PIN digit fires `selectionChanged`/`selectionEnd` and then Success.
- **What a 10 looks like:** One haptic per gesture, explicitly chosen. For example, cash confirm fires only Success, and the drawer is shown visually.

**M10 · §1 Principle 5, "every haptic maps to one meaning" · the map breaks it**
- **Evidence:**
  - Light covers 7 meanings: add, stepper −, toggle, pull to refresh, long press, drag start and add-via-stepper.
  - Medium covers both "remove a line" and "send to kitchen".
- **What a 10 looks like:** Reword the principle as "one meaning per interaction class", or make the weights distinct. Removing a line and sending to kitchen must not feel the same.

**M11 · §9 and §8.2 versus the shipped native feel layer · double scale and double haptics**
- **Evidence:** `app/src/native-runtime.js:2050-2170` already scales every control to .97 on touch-down through WAAPI `scale`, ticks selection haptics on segmented and tab changes, and uses a fourth curve, `cubic-bezier(.2,.8,.2,1)`. The spec replaces only `hapticLight` and `hapticNotice`.
- **What a 10 looks like:** The spec retires or absorbs that layer explicitly, so press scale and haptics fire exactly once.

**M12 · §9 Heavy "cash drawer opens"**
- **Finding:** On iPad the drawer kick travels by the CloudPRNT path (`/api/print/jobs`, polled by the bridge), so the haptic claims an event that has not happened and may never happen.
- **What a 10 looks like:** The haptic is tied to the payment commit and the copy says "Drawer opening", or the haptic waits for the bridge's acknowledgement.

**M13 · §13.2 grid tile · a tap adds 1, and options need a long press**
- **Evidence:**
  - This contradicts §12.9: modifiers start empty and nothing proceeds until the person chooses.
  - A long press is not discoverable to "a first-time cashier" (brief, UX).
- **What a 10 looks like:** A tap on an item with required options opens the options popover. Only items with no required options add directly. A visible affordance marks items that have options.

**M14 · §10.7 · removing a line already sent to the kitchen is undefined**
- **Finding:** That is a void. It needs a reason, maybe the manager code, a kitchen notification and a stock reversal.
- **What a 10 looks like:** Separate rules for removing sent and unsent lines, with copy and the KDS's reaction.

**M15 · §10.2 anatomy "Identity: avatar 56 and name" above the till lock pad**
- **Evidence:** `verifyStaffPin` takes `{merchant, pin}` and returns the identity, so the person is unknown until after the code is entered.
- **What a 10 looks like:** On a shared till, identity appears after verification (or a staff picker comes first, stated). Only the dashboard lock shows the owner before entry.

**M16 · §10.12 till rail "More holds shift tools only" · several till functions have no home**
- **Finding:** The menu builder, stock, customers and loyalty, printer pairing, language, theme and §9's "Settings › Device › Haptics" have no place on the till or team app. Phone also drops Waiting.
- **What a 10 looks like:** A complete IA table, with every brief surface mapped to a destination per device.

**M17 · §7.4 and §13.3 KDS · no input method and no overflow rule**
- **Finding:** A 24-inch wall screen read from 2 m is not touched, yet every action is a 64-pt touch button.
- **Evidence:** Six Preparing tickets at about 400 pt each do not fit into 928 pt, and "then wrap" says nothing about where.
- **What a 10 looks like:**
  - The input method is named (touch monitor, bump bar or keyboard mapping).
  - The overflow is defined, for example compressed cards or "+3 more" with the oldest always visible, and the wall never scrolls.

**M18 · §13.2 Card success · the screen leaves on its own**
- **Finding:** "Returns to Floor after 4 s, or at once on any tap."
- **Evidence:**
  - "Any tap" includes Print and Send.
  - A 4-second auto-dismiss of a choice fails WCAG 2.2.1.
  - A takeaway should return to Takeaway, not Floor.
- **What a 10 looks like:** The receipt choice waits for a decision (or for the next sale), and the screen returns to wherever the sale started.

**M19 · Round-1 access blocker "a second onboarding after the first" · not addressed**
- **Evidence:** About 11 screens. §15 stage 6 only re-fonts the Swift screens.
- **What a 10 looks like:** One flow of about 4 screens, with each question asked once, specified.

**M20 · Round-1 compliance blockers · no design and no rule**
- **Finding:** Round 1 flagged expected cash not adding up (a hidden 500 MAD float), clipped subtotals, and Z from June. The spec has no cash count, Z or end-of-shift design, and no rule that every total shows the lines that sum to it.
- **What a 10 looks like:** A §12 rule, "every total lists its components, including the opening float", plus a designed cash count and Z sheet.

**M21 · §2 #1 and §12 `KiwiLedger.get(key, range)` · the range ignores the 5 h business day**
- **Evidence:** CLAUDE.md §5, "Two clocks". "Today" means the 5 h business day on the till; the spec only uses business day as a seed input.
- **What a 10 looks like:** The ledger resolves ranges on the till's business-day boundary, and the agreement test checks the 04:59 versus 05:00 edge.

**M22 · §11 "One name per thing" · the spec gives one act two names**
- **Evidence:**
  - "Cancel a sale" (§10.12, §11 row 3) versus "Void sale #1208?" (§10.3).
  - The till's "Charge" versus the team app's existing "Take payment".
- **What a 10 looks like:** A glossary table of the core verbs and nouns in FR, EN and AR.

**M23 · §2 #2 `KiwiStrings.t` · no plural rules**
- **Evidence:** "Send 3 items", "3 tries left" and "3 of 8 known customers" all have counts. Arabic has six plural forms (Intl.PluralRules), so زبناء and زبونًا change with the count.
- **What a 10 looks like:** ICU-style plural keys, with the AR forms covered in the leak test.

**M24 · §2 #2 · behaviour on a missing key is undefined, and strings arrive as fetched JSON**
- **Evidence:** `kiwi-sw.js` serves stale-while-revalidate, so a deploy that adds a key shows whatever `t()` returns for an unknown key on first load.
- **What a 10 looks like:** A fallback chain (AR → EN, never FR in an EN frame), strings shipped as stamped JS, and a test for this.

**M25 · RTL (§8.2 mentions push only) · mirroring is unspecified**
- **Finding:** Nothing says which icons mirror (`chevron_right`, `send`, `arrow_forward`) or which do not (`arrow_upward`). Nothing pins the PIN and cash keypads to `direction:ltr` (CSS grid mirrors them by default). Nothing gives the KDS lane order or the chart time axis in AR.
- **What a 10 looks like:** A mirroring table.

**M26 · §4.4 Dynamic Type versus fixed geometry · the layouts break at large sizes**
- **Evidence:**
  - KPI tile 192×112: at AX3, Title 66 + label 31 + delta 31 + padding 32 = 160.
  - Till tile 190×112 at XXXL comes to about 123.
  - The L button at 56 tall holds Body at 40 px × 1.4 = 56, which leaves zero padding.
  - "A label never wraps" cannot hold for "Send 3 items to kitchen" at AX3 (about 480 px wide in a 384 px button).
  - The FR "Aujourd'hui" segment overflows at XL.
  - There is no clamp for AX4 and AX5.
- **What a 10 looks like:** Min-heights, not heights. Wrap and stack rules per component at XL, XXL and AX1 and above. A stated clamp at AX3.

**M27 · §4.4 `dynamic-type.js` probe · duplicates the shipped native plugin with different values**
- **Evidence:**
  - `app/plugins/kiwi-dynamic-type` already observes `UIContentSizeCategory.didChangeNotification`.
  - Its factors are 0.85, 0.90 and 0.95, and every AX size caps at 1.35. The spec's are 0.82, 0.88 and 0.94, up to 2.35.
  - The spec's probe re-measures only on resume and `visibilitychange`, so it misses a text-size change made from Control Center while the app is open.
- **What a 10 looks like:** One source, the plugin's event, with the factor table reconciled.

**M28 · §4.4 "Long-pressing a tab shows the iOS large-content viewer" · not available to a web-drawn tab bar**
- **Finding:** That viewer is a native control. A web-drawn tab bar cannot reach it without a native bridge, so tab labels stay capped at 12 px for AX users.
- **What a 10 looks like:** A native bridge is specified, or the labels scale with a defined icon-only layout.

**M29 · §3.3 and §10.5 "Selected (iPad split view): accent-tint fill" · the only cue is too faint**
- **Evidence:** Tint on surface-1 measures 1.17:1 in light and 1.33:1 in dark, and nothing else marks the row. This fails WCAG 1.4.11 and 1.4.1.
- **What a 10 looks like:** A second cue, such as a leading 3 pt accent bar or a check, or a tint of at least 3:1.

**M30 · §10.9, §10.8 and §13.2 · timed actions disappear**
- **Evidence:** The toast action lasts 6 s, KDS Undo lasts 5 s (the two rules also disagree), and the receipt choice lasts 4 s. This fails WCAG 2.2.1, and VoiceOver users cannot reach them in time.
- **What a 10 looks like:** Actions persist while focused or while VoiceOver is running, one duration token, and Undo is also reachable from the ticket's history.

**M31 · §10.5 swipe and §13.2 long press · hidden gestures with no alternative**
- **What a 10 looks like:** Every swipe or long-press action also exists as a visible control or a VoiceOver custom action, and the spec names them.

**M32 · §8.2 number roll and §13.1 chart · nothing for screen readers**
- **Finding:** Rolling digit columns read as nonsense, and the chart has no text alternative.
- **What a 10 looks like:** The roll is `aria-hidden` with a visually hidden true value. The chart has a summary label, readable data points and a scrub value announced politely.

**M33 · §5.5 and §3 · iOS display accommodations are not handled**
- **Finding:** Nothing covers Reduce Transparency (the media query isn't supported in WebKit, so a native bridge is needed), Increase Contrast (`prefers-contrast: more`), Bold Text or Button Shapes.
- **What a 10 looks like:** A row per setting: the material becomes opaque, `line` becomes `line-strong`, the weight steps up.

**M34 · §10.9 "plain action in the inverse accent" · an undefined token**
- **Evidence:** If a builder uses `--k-accent`, light `#0B6E4F` on `#1C2320` is 2.56:1 and fails.
- **What a 10 looks like:** A `--k-inverse-accent` token is defined (`#5FD9A3` on `#1C2320` is 9.11:1).

**M35 · Performance · no budgets and no gates**
- **Evidence:** The brief's Speed line (INP under 200 ms on an iPhone 12, no layout shift, 60 fps) appears nowhere: no budget, no trace gate, no weight limit for JS, CSS or fonts.
- **What a 10 looks like:** Numeric budgets per surface and a capture-time INP/CLS/frame trace wired into the round evidence.

**M36 · §4.1 fonts · no loading strategy**
- **Finding:** No preload, no `font-display`, and no metric-matched fallback (`size-adjust`/`ascent-override` on a local fallback), so swapping to Inter shifts layout. During stages 3 to 6, pages load Inter Tight and Inter together, and the size is unstated.
- **What a 10 looks like:** A loading recipe, a weight budget, and a rule that a page switches font atomically.

**M37 · §2 #3 light-DOM custom elements and §4.4 · layout shift on load**
- **Finding:** Before upgrade, `<k-figure>` and `<k-segmented>` render with no size. The root font size set by `dynamic-type.js` reflows the page after first paint.
- **What a 10 looks like:** `:not(:defined)` placeholder sizes, and a blocking inline root-size script in `<head>`.

**M38 · §15 stage 1 · tokens are scoped to the page, but adoption is per component**
- **Finding:** `tokens-2027.css` is "scoped to `html[data-skin~="2027"]`", yet stage 3a puts the PIN pad into legacy pages that lack the attribute, so it renders with undefined tokens.
- **What a 10 looks like:** The tokens also resolve on `.k-root` or the kit host, and the scoping rule is stated.

**M39 · §15 · no plan for the kit winning against existing styles**
- **Evidence:** `assets/design-vexel.css` has 257 `!important` rules and element selectors on `button`, `svg`, `input`, `a` and `section`. The kit's `.k-btn` will lose to them.
- **What a 10 looks like:** An `@layer` order or `:where()` reset strategy, and a gallery test rendered inside the dashboard and caisse cascades.

**M40 · §2 #4 and §14 · "Delete `section{padding:96px 0}` from `tokens.css`" is an unflagged visible change**
- **Evidence:** 17 pages load `tokens.css` and use `<section>`, including `cookies.html`, `privacy.html`, `terms.html`, `status.html`, `pitch.html`, `wallet.html` and `kiwi-admin.html`. None of them loads the landing stylesheet.
- **What a 10 looks like:** The rule moves into each consuming page, or is neutralised only under the skin flag.

**M41 · §15 stage 1 · "Nothing visible", yet the ledger replaces today's dashboard figures**
- **Finding:** Changing the figures merchants see is visible, and it is unflagged on live data.
- **What a 10 looks like:** A ledger flag, a comparison run against Santos-shaped data that does not write, and a changelog line.

**M42 · §15 · the stamp and service-worker rituals for new kit files are missing**
- **Finding:** Nothing says that new `assets/kit/*`, the fonts and the strings must enter `kiwi-sw.js` SHELL and `tools/asset-stamps.json`, or that adding precache entries needs `bump-stamp.js --sw`. A pos-* vertical adopting the kit also moves its `pos-dispatch.js` rev.
- **What a 10 looks like:** A stage-1 checklist naming those exact steps.

### Polish

1. **§3.3, dark chrome table:** ink-2 is stated as 6.39 and measures 5.62. Accent is stated as 5.62 and measures 5.42 for the fill (`#3CCB8F`) or 6.39 for accent-ink. Correct the table.
2. **§3.3, toast row "accent-lit 9.11":** `#3CCB8F` on `#1C2320` is 7.73. The 9.11 belongs to `#5FD9A3`. Name the right token.
3. **§3.3, hairline "1.33:1 light":** that is against surface-1. Against bg it is 1.24. State the surface.
4. **§13.1 "Today · Sunday 12 October":** 12 October 2026 is a Monday.
5. **§13.3 counts:** "All 9", but the lanes hold 3 + 6 + 2 = 11, and the stations hold 7 + 2 + 2 + 4 = 15. Define what "All" counts.
6. **§10.12 radius:** the tab capsule is "62 tall… radius 28 (capsule)", but a capsule at that height is 31. §5.3 says the same thing two ways.
7. **§13.1 KPI gap:** the gap is 16, but §5.2 sets compact gaps at 12.
8. **§10.4 spacing:** the track uses "padding 3", which is outside §5.1's "no other values" scale.
9. **§5.4 elevation 2 in dark:** "on surface-3", yet the tab capsule is chrome (surface-1 tint) and the toast is inverse.
10. **§10.4 segmented labels:** "Callout 600", while §4.2 defines Callout at 500. §13.2's badge uses Footnote 600, while §4.2 assigns badges to Caption.
11. **§7.4 and §13.3:** Ready is called "a compact column", but at 564 wide it is the widest lane.
12. **§13.3:** a "⚠" glyph appears. Use the Material `warning` icon, per §10.8.
13. **§4.3 precision:** tile price precision is unstated. On iPad the menu and the bill are on screen together, so "80" next to "80.00" would break the precision rule.
14. **§13.1 versus §11 row 2:** the delta drops the U+2212 minus signs.
15. **Number formats:** AR uses "5,6%" while FR uses U+202F before %. AR uses LRM marks while §4.3 mandates `<bdi>`. EN examples use a normal space while the tile uses U+202F.
16. **PIN lockout copy:** "Try again in 0:30" is the mm:ss form §10.8 bans, and it lacks a full stop.
17. **KDS timer:** no copy is defined for under 1 minute.
18. **KDS error toast:** "…Retrying." is progress in a toast, which §10.9 bans.
19. **Chart labels:** "20k" and "10k" are a compact notation `KiwiFormat` does not define (FR "20 k", AR unspecified).
20. **§4.1 versus §4.3:** §4.1 says "'MAD' come from Inter", but §4.3 says MAD never appears in an AR frame.
21. **Payment success:** §10.1 (check plus "Paid" for 600 ms) and §13.2 (check, then receipt choice) choreograph it differently. Pick one.
22. **§10.1 button loading:** "the spinner replaces the icon", but L primaries have no icon, so they get no progress feedback.
23. **Focus states:** no component state table lists focus-visible. A ring with a 2 px offset inside the segmented track will be clipped.
24. **§13.1 nav bar:** the AI button is a surface-2 circle and the notifications button is a bare icon, so two icon-button styles sit side by side.
25. **§13.1 nav bar targets:** AI ends at x 372 and notifications starts at x 376, a 4 pt gap against §10's 8 pt minimum.
26. **§0 "Atlas green kept":** `#0B6E4F` never paints in dark, where the KDS is dark by default. `--riad` is dropped without a line.
27. **§13.3 KDS calm header:** surface-2 on surface-1 in dark is 1.10:1, so the header band is invisible.
28. **§5.5 blur cap:** at most 2 blurred layers, but the nav bar, tab capsule and sheet header can co-occur. Give a priority rule. The "keeps an iPhone 12 at 60 fps" claim is unmeasured.
29. **§4.1 font size:** "about 110 KB" for Inter 4 variable with opsz, wght, Latin and Latin Extended is unmeasured. State the axis ranges and the measured size.
30. **§8.2 push:** "dims to 92 %" means nothing in dark. Define it as a scrim.
31. **§8.2 number roll:** the roll direction for a decrease is undefined.
32. **§8.4 reduced motion:** the PIN loading pulse is missing from the table.
33. **§8.1 and §8.2 durations:** 120, 200, 250, 600, 1200, 4000 and 5000 ms appear outside the duration tokens. Tokenise them or cut them.
34. **§13.2 search field:** no `line-strong` outline, against §3.1's "input outline" role.
35. **§10.7 bill line names:** "up to 2 lines" and "never truncated" conflict for longer names.
36. **§6 icons:** "the vendored sprite" does not exist. The README's curl fetches only `default/24px.svg`, and the spec gives no file naming for the fill-1, weight-500 and opsz-20/40 variants.
37. **§9 haptic timing:** PIN keys and steppers should fire on touch-down, as the iOS keypad does, not on `pointerup`.

The builder should fix every item above, or rebut it with evidence to a fresh critic.
