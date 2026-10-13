# Design direction · round 25 critique of revision 24

## 1. Scorecard

| Dimension | Score | One-line reason |
|---|---|---|
| Visual design | 9 | One finding: §18.3 sets the Till ID value in JetBrains Mono, which §1 and stage 7 retire. |
| UI | 9 | One finding: Home's Kiwi AI entry loses its shipped text label and becomes a bare `auto_awesome` icon, although the nav has room for the label. |
| UX | 7 | Three majors: Kiwi AI suggestions are restaurant-only for every trade; the till's online-order inbox has no home; the team message sheet loses the four one-tap quick messages. Several polish items too. |
| Motion | 10 | I found nothing. The lens spring, sheet springs and reduced-motion rules agree with each other and with the preview. |
| Feel and haptics | 9 | One finding: the new §15.3 rule fires Commit on the AI response frame, which contradicts §15.2 and the §15.6 haptics-map test (Commit only on `local-record`). |
| Copy and language | 8 | The Kiwi AI suggestion rows are written for a restaurant and shown to a shop, spa or hotel (shared with UX). §6.6 measures `home.goal` without tnum. |
| Accessibility | 9 | One finding: `home.goal_set` is a Plain button with a 26 px tall hit area, the default state for every new store, and it cannot grow to 44 without breaking the 8 px gap to the compare control. |
| Honesty and consistency | 7 | Six honesty findings: a false shipped-code claim (Fullscreen), a stale coordinate (§18.1), stale preview captions, a check-18 claim that overstates coverage, an incomplete Settings inventory, and "no function of the assistant is removed" overstating. |
| Performance | 10 | Nothing found. The font plan, census and lazy verticals are unchanged and sound. |
| Feasibility and migration safety | 8 | The OrderPro inbox has no migration target, and two act-table rows have no entry key, so the §9.6 act-reachability lint cannot run on them. |

## 2. Verdict

**FAIL.** Eight dimensions are below 10. There are 3 majors and 13 polish findings, and no blockers.

## 3. Rebuttal rulings

All four rebuttals are unchanged from revision 23. I re-verified each one against the code at 31c94529 and origin/main.

1. **ACCEPT.** The rebuttal's premise still holds in the code it cites. Nothing on origin/main undercuts it.
2. **ACCEPT.** The shipped behaviour it relies on is unchanged at 31c94529 and on origin/main.
3. **ACCEPT.** The point is about what the spec owns versus §23 owner decisions. The design keeps a fallback, so it does not depend on an undecided item.
4. **ACCEPT.** The redeem path is still not idempotent on origin/main, which is exactly what the rebuttal says, and the spec's design handles it as written.

**Critique 23's two majors are genuinely fixed:**
- **M1 (till More and act reachability).** The till More rows exist in §12, and the act-entry table now maps each act to an entry.
- **M2 (goal and recommendation).** The goal line is back on Home (§18.1, 214 to 232). It can be set in Settings › Business and in onboarding step 3. The renewal recommendation moved into Kiwi AI with its branches intact.

## 4. Findings, ranked

### Majors

**M1 · major · §18.6 Kiwi AI, rows 1 to 3, and §12 · the suggestions are restaurant-only for every trade, and the shipped per-trade chips have no home.**
- **The spec.** Rows 1 to 3 are fixed keys: "Which dishes sell best after {time}?", "What should I reorder this week?", "How did today compare with last {weekday}?". §18.6 also says "The chips are the suggestion rows below".
- **What ships.** Home's three chips are at `dashboard.html@319ac100:4986-4988`. They are swapped per trade through `getVocab('aiChips')`, with the shop, spa and hotel lists at `assets/venues.js@319ac100:974`, `:997` and `:1020`, applied in `dateRange.js` `renderHeroAi`.
- **What the 2027 design does.** None of the shipped questions survives. Only row 6 (`ai.suggest.ops.*`) varies by trade, so a boutique or spa owner is offered "dishes".
- **Why it fails.** It is a functional regression on the screen revision 24 changed most. It breaks the spec's own trade-vocabulary rule, and the merchant's first contact with Kiwi AI is a question that does not apply to them.
- **What a 10 looks like.** Rows 1 to 3 are keyed per trade, at least for restaurant, shop, spa and hotel. §12 names `aiChips` as their source, and the preview's AI frame shows a non-restaurant variant.

**M2 · major · §12 act table (`act.reject_online`) and §18.3 till · the online-order inbox has no home and no specification.**
- **What ships.** `assets/orderpro-inbox.js@31c94529:425-445` and `:735-760` (still on origin/main) draw a floating "Commandes" chip (`#kop-chip`). It has a pending badge, a new-order sound and pulse, and accept, pay, reject, ready, served, print and table actions.
- **What the spec does.** It places `act.reject_online` at "Takeaway tab, an incoming online order", but no section specifies that surface. The till rail draws a badge only on Kitchen. Accept and the order's lifecycle are not in the act table at all.
- **Why it fails.** On a Saturday night an online order arrives and the till shows no badge or sound for it. It cannot be accepted from anywhere the spec draws, and the migration has no target for `orderpro-inbox.js`.
- **What a 10 looks like.** §18.3 gives the inbox a home: a rail badge or a Takeaway-tab section with its count. It specifies the arrival alert (sound, haptic class, reduced-motion form) and each action as an act row with an entry key. §21 names the stage that retires `#kop-chip`.

**M3 · major · §18.3 Team on shift, message sheet · the four shipped quick messages are dropped.**
- **What ships.** Four one-tap chips at `kiwi-caisse.html@31c94529:7200-7203`: "Table prête", "Client attend", "Caisse", "Fin pause".
- **What the spec does.** It specifies a free text field only.
- **Why it fails.** The commonest message on a busy shift goes from one tap to opening the keyboard and typing. That is "more taps", which the owner's-eye rule names as a regression.
- **What a 10 looks like.** The sheet keeps the four presets as one-tap rows above the field, with keys in §9.6 and AR strings.

### Polish

**P1 · polish · §15.3 (new AI row) against §15.2 and §15.6 · Commit fires on the response frame.**
- **The rule.** `ai.actions.confirm` and `undo` fire Commit "on the response frame within 600 ms of the tap".
- **The contradiction.** §15.2 says "Local-record frame for Commit and Paid". The §15.6 haptics-map test asserts that "Paid and Commit fire only with trigger: 'local-record'" and that the window is "within 600 ms of final digit". As written, that test fails on the new row.
- **What a 10 looks like.** Either §15.2 and §15.6 gain a named `server-ack` trigger with its own window, or the AI row uses an existing class that may fire on a response.

**P2 · polish · §18.1 Home, `home.goal_set` · the hit area is 26 tall.**
- **The values.** The goal line is at 214 to 232; the Plain button's hit area is 210 to 236.
- **Why it fails.** Principle 4 requires 44 for a Plain button and 8 between separate controls. A 44 hit would run into the compare control at 236. This is the default state for every new store.
- **What a 10 looks like.** The goal-unset state has its own 44 tall row, with the compare control shifted down and the coordinates re-derived, or "Set a goal" merges into one control with the goal line.

**P3 · polish · §18.1 Home row table · the compare control's hit area is stale.** It reads "214 to 258", but the control sits at 236 to 280 in both the spec's own row and the preview frame. **A 10:** it reads 236 to 280.

**P4 · polish · §18.3 Fullscreen · a false shipped-code claim.**
- **The claim.** "Shipped draws it in both (no rule hides #fs-toggle under .kiwi-native at 31c94529)".
- **The code.** `app/src/native-runtime.css@31c94529:62` has `html.kiwi-native #fs-toggle{...display:none!important}`. The same line is on origin/main.
- **A 10:** the row states that the native app already hides it, and drops any design change that rests on the false premise.

**P5 · polish · §18.3 Till ID · Mono is retired elsewhere.** "trailing value ... in JetBrains Mono" contradicts §1 line 396 (codes use the Latin face with tnum) and stage 7's retirement of JetBrains Mono. **A 10:** Inter Tight with tnum, matching §1.

**P6 · polish · preview check 18 · it reads only the inline width, and the not-compared list does not say so.** Using my harness (clone FX0 and the frames, call `__kiwiPreview.run`, restore the sprite), each of these stayed green:
- `transform:scaleX(0.1)` on `.gf`;
- `max-width:0` on the fill;
- `display:none` on `[data-goal-track]`;
- track width set to 10 px;
- fill painted `var(--line)`, the same colour as the track;
- an injected stylesheet `.gf{width:100%!important}`;
- the AR track set to `direction:ltr`, so it fills from the wrong side;
- the goal line moved to top 236, on top of the compare control.

The controls behaved as expected: fill at 100% inline went red on 18, and changed goal text went red on 18. **A 10:** check 18 compares the computed fill box (`getBoundingClientRect` ratio to the track), the fill colour, and the fill side in RTL. Or the page lists these properties as not compared.

**P7 · polish · preview captions are stale.**
- Line 197 says "first row (772 to 836) ... 16 above the tab capsule". The spec and the frame say 778 to 842, 10 above.
- Line 208 (SE) says "tiles end at 528, 69 above the capsule". The spec and the frame say 542 and 55.

**A 10:** the captions match the frames, ideally generated from the same constants.

**P8 · polish · §6.6 `home.goal` row · measured without tnum.**
- **The table.** 273.6 / 300.6 / 261.4.
- **The frame.** Drawn with tnum, it measures 276.19 EN, about 303.2 FR and 263.99 AR, about 2.6 px wider. No breakpoint flips: SE FR at 1.24 is still over 343, and EN at 1.35 is 336.5, under 343.

**A 10:** the row is re-measured with `font-variant-numeric: tabular-nums`, and §6.6 states that the census measures with the frame's features.

**P9 · polish · §12 Till More, Manage · role change and lost count are unmarked.**
- **The spec.** It puts Stock under "Manage (manager role)".
- **What ships.** `#open-stock` is open to every cashier; its comment calls it the only entry to Stock & appro, and it carries an alert count.

**A 10:** the row either keeps Stock open to every role, or marks the role change with a reason. Either way it keeps the alert count.

**P10 · polish · §12 act table · two rows have no entry key.** `act.close_till` ("Close the till") and `act.cancel_sale` ("Cancel sale (cancel.*)") name no entry key, so the §9.6:1280 act-reachability lint cannot check them. **A 10:** both rows name a concrete key.

**P11 · polish · §12 Settings · the inventory is incomplete.**
- **Omitted since 31c94529.** "Canaux de livraison" (`add-integration`, real venues) and "Exporter mes données" (`export-csv`).
- **Omitted from origin/main.** "Le point du matin" (toggle `settings-morning`, d97e1082).

**A 10:** each has a row or a marked deletion with a reason.

**P12 · polish · §18.6 · "No function of the assistant is removed" overstates.** The shipped hero insight `fa-hero-insight` is not in §12's table (`agent.js@319ac100:1490`, `:1500`, `:1518`; EN at `:1428-1429`: "Today · {venue} is solid, {m} % net margin, {s} % above your break-even point"). For real stores (`B.partial`) it is the add-your-costs prompt at `:994`, which `ai.unknown_costs` roughly covers, so the impact is mostly on demo. **A 10:** §12 maps the margin and break-even insight to a home, or marks it as deleted.

**P13 · polish · §18.1 Home nav · the Kiwi AI entry loses its label.** The before frame (`before-dashboard.home-iphone-light.png`) shows a labelled "Kiwi AI" pill. The 2027 frame has a bare `auto_awesome` icon button, although it is now the only route to the moved recommendation. The nav has about 141 px free, and the label measures 61.09. **A 10:** a labelled capsule, or a stated reason with a first-run hint.

## 5. What I checked and found correct

**Preview and fixtures**
- **Fixture checks.** 18 of 18 checks pass with check 6 retired, and 186 of 186 mutations are caught with 14 retired. `why(n)` gives real reasons.
- **Check 19 is real.** I removed the mic, which went red with "ai draws mic 0 times". I added a second mic, which also went red.
- **The not-compared list is accurate for text controls.** These stayed green, as the page claims they would:
  - removing the "Actions" label;
  - emptying the Calculator label;
  - removing the `ai.how` Plain;
  - removing the hire row;
  - changing 5% to 50%.
- **Measured widths match the spec.** Actions is 52.52 (AR 57.17), Kiwi AI is 61.09, and the header capsules are 136.5 and 141.2.
- **The KiwiFormat vectors pass** through the browser's Intl, including the new `share` (U+00A0 before % in FR and AR).
- **Goal arithmetic is right.** 19,174 / 23,500 = 81.6%, shown as 82% with Math.round, the same as the shipped `renderGoal` (`dateRange.js@319ac100:2679-2748`).
- **The AR and SE Home frames** have no overlaps. The AR goal reads correctly right to left.

**Spec claims against the code**
- **Kiwi Insights claims are accurate:** `buildRealHeroRec` at `dateRange.js:2092-2112`, `getHeroAiRec` at `venues.js:4987-5022`, and `insights.js:121-125`.
- **The renewal branches and undo match the code** (`agent-action-center.js@319ac100:153-185`), and the `OPS_HERO` strings match `ai.suggest.ops.*`.
- **The till acts are where the spec says.** I found the `live.js:212` 409 `employee-not-clocked-in`, `manager-pause` and `manager-resume`, `openDrawerNoSale` at `:17021-17045`, and "Retirer du suivi" at `:20928`.
- **Onboarding matches:** 1 of 5 steps, goals at step 3, device at step 5. VIP is consistent across the glossary, §9.6, §22 and Arabic.

**Floor plan**
- The spec keeps it as shipped, consistently across §10.29, §18.4, §22 and §23 row 15. Only history notes mention the withdrawn rebuild.

**Main-moved commits, on origin/main**
- **954bbe18:** the accountant space has its Settings row.
- **cda95c04:** the Réconciliation and Anti-fraude tabs are gone, and the spec agrees.
- **f99fa1e1:** Dynamic Type to 200% on the iPhone dashboard, with the till at 135%, matches.
- **73870f82 (a note, not a finding):** the server-confirmed Face ID now ships on the dashboard. The spec's "shipped" description is pinned at ae45b301 and is accurate at that commit, but it should be refreshed. The till's biometric relock still awaits an owner decision.

**Screens, as the merchant sees them**
- **Home:** better at reading the day, and the goal is back. The Kiwi AI entry is now unlabelled (P13), and "Set a goal" is a 26 px target (P2).
- **Orders:** better. It is denser and easier to scan than the shipped list, and nothing is lost.
- **Till:** the bill is better than `before-till.bill-sheet-ipad-light.jpg`. But online orders have no visible inbox (M2), and team messages need typing (M3).
- **Customers:** better. Search comes first and the VIP marking is clear.
- **Kiwi AI:** the mic, Actions and the tools are restored, and the renewal recommendation lives here correctly. The suggestions only make sense for restaurants (M1), and the margin insight is not homed (P12).
- **Floor plan:** kept exactly as shipped, as the owner decided. Not judged.

**Cleanup:** I stopped the server I started (port 8974), cleared the viewport emulation, closed my tab, and deleted only the `critic24/` scratch subfolder. Nothing in the repo was edited or staged.
