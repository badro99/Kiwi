# Design direction · round 24 critique of revision 23

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 9 | The composer's mic is drawn as an ink-2 icon button. §10.1 says icon buttons are "ink-1, 44 circle … One style everywhere" (P1). |
| UI | 9 | The Action Center loses its visible "Actions" label and becomes a bare `pending_actions` glyph (P2). |
| UX | 7 | Two majors. Till More has no entry for several shipped rail functions, Open the drawer and Team (breaks) among them (M1). Home silently loses the daily goal and the computed recommendations (M2). |
| Motion | 10 | No findings. |
| Feel and haptics | 9 | `ai.actions.confirm` and `.undo` are Commit members, but §15.3 never says which frame they fire on. Both are server verdicts that can fail (P3). |
| Copy and language | 9 | `ai.suggest.price_rise` sends `{pct}` through `KiwiFormat.pct`, which gives "+5.0%", while the frame draws "5%" (P4). Arabic has two names for VIP (P5). |
| Accessibility | 10 | No findings. Every code point in every frame falls inside a declared face. Contrast and bidi as checked by round 22 still hold. |
| Honesty and consistency | 8 | §12 says its table loses nothing but Customize, which M1 and M2 disprove. §18.6's "records `ai.actions.expired`" does not match the code (P6). §18.0's "not compared" list is stale and incomplete (P7). "No function of the assistant is removed" overlooks the operational start card (P8). |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 8 | Building §12 as written removes live till features (the drawer without a sale, break management) as a side effect of a reskin. CLAUDE.md §2 forbids that kind of unplanned removal (M1). |

## 2. Verdict

**FAIL.** Seven dimensions are below 10.

## 3. Rebuttal rulings

1. **Largest remainder: ACCEPT.** `kiwi-caisse.html@31c94529:13490-13493` says "Largest remainders receive the leftover centimes" in `shareWeighted`, as the rebuttal states.
2. **No Cancel in the roster step: ACCEPT, moot.** The roster step was removed in revision 21, so the rebuttal defends nothing live. It is correctly marked as kept for the record.
3. **No kept clock-in time, no code fetch from the team app: ACCEPT.**
   - `employee.js@31c94529:482-483` says the code "proves the employee is physically present".
   - `:494-495` refuses an expired code.
   - `:509` stamps `inTs: now`.
   - `team/live.js:151` uses `entitledMerchant(…, { allowTill: true })`.
4. **No pairing-state check after a timed-out redeem: ACCEPT.**
   - `pair/state.js@31c94529:27-28` returns `merchant-required`.
   - `config.js:184-190` gives the roster only to a caller that proves it is the merchant.
   - `redeem.js:91` reads `terminalId`. On `origin/main` (8c278044) redeem is still not idempotent, so the named server-side fix is still the only complete one.

## 4. Findings, ranked

**M1 · Major · UX, Feasibility, Honesty · §12 "Till More (sheet)" and "Where the shipped functions live"**
- **Finding.** Till More lists exactly: Shift (Cancel sale, Refund, Cash in or out, Shift change, Attendance code, Close the till), Manage (Menu, Stock, Customers and loyalty), and This device (Printer and kitchen printing, Language, Appearance, Haptics). The shipped rail has entries that have no home there, in the rail tabs, or in §22:
  - **Open the drawer** (`kiwi-caisse.html@31c94529:6060`, `data-action="open-drawer"`, `openDrawerNoSale` :17021, `requireManager` :17026). The spec keeps the act itself: `act.open_drawer` (§9.6:1336), its PIN row (§10.2:L1888) and `drawer.no_bridge`. So the act has a manager approval, an offline row and copy, but no button. A cashier who needs change at 20:00 cannot open the drawer without making a sale.
  - **Équipe**, the team drawer (`#open-team` :6092 with a live on-shift count; `openTeamDrawer` :17621; `manager-pause`/`manager-resume` :17647). This is where breaks are started and ended. The spec points everyone at the till for breaks: `clock.break_note` "Breaks are recorded at the till." (§9.6:1380), the §12 Team app row ("breaks are managed by the till"), and §18.10 "Breaks are not started here (§12)". The till has no place to do it.
  - **Plein écran** (`#fs-toggle` :6132), for browser tills.
- **Why it fails.** The table's preface says "nothing in this table is removed except Customize, which §22 lists", and §24 sells M1's fix as "a table of every shipped function and its home". Both are false for the till. It is a removal by omission, the same class as round 22's M1.
- **What a 10 looks like.** Till More › Shift gains "Open the drawer" (manager, `act.open_drawer`) and a "Team on shift" row (live count, start or end a break). The table gets rows for the drawer, Team, Fullscreen (or a §22 line removing it on the native app only) and sign out. A check or `strings-coverage-test` ties every `act.*` key to a reachable entry.

**M2 · Major · UX (owner's eye, Home), Honesty · §18.1, §18.8, §12**
- **Finding.** Home loses two shipped, working things, and no section names either loss:
  - **The daily goal.** "OBJECTIF JOUR · 28 000 MAD" with a progress bar (`dashboard.html@319ac100:4931-4939`), driven by `dateRange.js@319ac100:2700-2730`. It is also the Vexel rail card "Today's goal" (`design-vexel-layout.js:120-124`, `:703-712`) and the shipped desktop "before" frame (19,174.35 / 31,500). The merchant sets it in onboarding (`onboarding.js@319ac100:437-448`, `dailyGoal`) and in Settings ("Objectif journalier", `kiwiSet:goal`). The spec deletes the onboarding step ("The 'goals' step is removed", §18.8:3886). It has no goal on Home and none in Settings › Business (§12). Searching the spec for "goal" finds only that line.
  - **"Kiwi Insights · Recommandations du jour"** (`dashboard.html@319ac100:4965-4997`): recommendations computed by `insights.js` from the venue's menu and sales, with chips and its own AI input. `agent-voice.js` wires a mic onto that input too (`.hai-input`). §12's dictation row names only the AI composer. The 2027 Kiwi AI "Today" card only restates Home's revenue and delta.
- **Why it fails.** For the Café Atlas owner reading the day, "am I on target" is the single most glanceable fact the shipped Home gives. It disappears with no decision recorded in §22 or §23.
- **What a 10 looks like.** Either keep both: a goal line under the key figure ("82% of 23,500 MAD"), the target in Settings › Business, the onboarding field kept, and the insight as Kiwi AI's first card. Or list each removal in §22 with a reason and an owner decision in §23.

**P1 · Polish · Visual · §18.6:3716 against §10.1:1840**
- **Finding.** The mic is an "icon button 44, ink-2". The preview paints it rgb(69,75,71), the ink-2 class. §10.1 says the Icon variant is "none / ink-1, 44 circle … One style everywhere".
- **What a 10 looks like.** Draw the mic in ink-1, or add a stated field-accessory variant to §10.1.

**P2 · Polish · UI · §18.6, header**
- **Finding.** The shipped Action Center is a labelled button: icon `pending_actions` plus `<span>Actions</span>` plus count (`agent-action-center.js@319ac100:254-270`). 2027 draws only the glyph and a danger badge (frame x 324, y 98).
- **Why it fails.** `pending_actions` (a clipboard with a clock) is not a standard nav-bar metaphor. An owner who knows "Actions" loses the word that told them where approvals live.
- **What a 10 looks like.** A text button "Actions" with the badge, or the glyph plus a `ai.actions.title` label at widths that fit (measured in §6.6).

**P3 · Polish · Feel · §15.1 Commit row, §15.3, §18.6:3737**
- **Finding.** "Confirm and undo fire Commit", but §15.3 ("What each commit waits for, by name") has no row for them.
- **Why it fails.** Both are server round trips that can end in `failed` (`approve()` :153-165 settles on the server's answer, including `{ok:false, reason:'network'}`). Firing on the tap would buzz success for a refused action. §15.3's rule for server verdicts (response frame, within 600 ms) is never applied to them.
- **What a 10 looks like.** A §15.3 row: Commit on the response frame of an `ok` settle within 600 ms; nothing on failure or on a late answer.

**P4 · Polish · Copy · §9.6:1674, §18.6:3713, preview**
- **Finding.** `ai.suggest.price_rise` says `{pct}` goes through `KiwiFormat.pct`. `pct` is `signDisplay: 'exceptZero'` with one decimal (§6.3 vectors; preview :2345). Intl in this browser gives `pct(0.05)` = "+5.0%". The frame and §18.6 draw "5%", and the shipped question is "What if I raise prices 5%?" (`agent.js@319ac100:577`).
- **What a 10 looks like.** Spell out an unsigned, integer percent for this string (or a literal "5%"), and the frame agrees.

**P5 · Polish · Copy · §9.6:1628 against the glossary (§9.1:1136) and `customers.vip` (:1631)**
- **Finding.** In Arabic the VIP segment reads "كبار", while the marker and its spoken label are "VIP". The glossary says the marker is "VIP | VIP | VIP".
- **Why it fails.** One thing, two Arabic names. Shipped is internally consistent (segment "كبار", tag "كبير", `clients-directory.js@319ac100:56-58`).
- **What a 10 looks like.** One Arabic word for both, recorded in the glossary.

**P6 · Polish · Honesty · §18.6:3737**
- **Finding.** "Confirming after that renews it once and records `ai.actions.expired` (`:153-165`)." The code records the expired detail only when the renewed request was already replayed (`renewed.replayed`, :159). A normal renewal re-confirms with a new token and records nothing about the expiry.
- **What a 10 looks like.** State both branches as shipped.

**P7 · Polish · Honesty · §18.0:3203 and the preview's claim box**
- **Stale.** The "not compared" list names "the other two Kiwi AI suggestions". Revision 23 draws five: the weekday one is checked, four are keyed and unchecked.
- **Incomplete.** The list calls itself complete but does not say that a control's presence is never compared. My mutations, run through `__kiwiPreview.run(FX, R)` on fresh clones of the seven templates:
  - **Element removal: all stayed green.** Removing the mic's icon button, the `pending_actions` icon (badge kept), or both Calculator and Attach leaves all 16 checks green. Those are exactly the controls round 22's M1 was about, so revision 23's restoration is not held by the self-test. Row 191 only catches a glyph swap.
  - **Text edits: green, as the page claims.** "5%" changed to "50%", and "Search name, phone or email" changed to "…or phone" (the restored e-mail search): both green. Keyed strings are listed as not compared.
  - **Badge hidden: green, as the page claims.** `display:none` or `color:transparent` on the Action Center badge stays green ("whether a text is painted" is listed).
  - **Caught.** `opacity:0` on the mic's parent turns check 13 red ("an ancestor (div.a.ib.ink2) has opacity 0"). Moving the mic to x 376 under send turns it red ("is covered by svg").
- **What a 10 looks like.** Fix "other two" to "other four". Add "whether a control is present at all" to the list, or add a presence check (an expected `data-i` set per frame) with a removal mutation for the mic, the Action Center, Calculator and Attach.

**P8 · Polish · Honesty, UX · §18.6:3727, §12 table**
- **Finding.** "No function of the assistant is removed". But a store without costs set up gets a third, operational start card (`operationalHero()`, `agent.js@319ac100:1505, 1513-1514`, for example a floor-status card for restaurants). §12 places only that store's first two cards (rows 4 and 5).
- **What a 10 looks like.** A home for it (suggestion row 6 for that store), or a §22 line.

**P9 · Polish · Honesty · §18.2:3590**
- **Finding.** "Reconciliation and anti-fraud move to Report and Cash and Z." This names two destinations for two functions without saying which goes where. Neither appears in §12's shipped-functions table or in any Report or Cash and Z section; the spec never mentions anti-fraud again.
- **What a 10 looks like.** One row each in §12's table, with the screen and the control.

## 5. What I checked and found correct

**Screens, as the merchant sees them:**
- **Home:** better at reading the day. One key figure, signed deltas with polarity, latest orders, legible at arm's length. It is worse in that it loses the daily goal and the computed recommendations (M2).
- **Orders:** better. Hour groups, order numbers, method icons including Other (`sync_alt`), refunds in place. Invoicing is reachable from an order's detail (`invoice.a4`).
- **Till (bill and menu):** better. One primary ("Send 2 to kitchen"), Not sent count, legible tiles with quantity badges and options marks. The rail is cleaner but drops the drawer, Team and fullscreen (M1).
- **Customers:** better. Five segments with VIP back, e-mail search back, export, loyalty, retention and campaign in the overflow.
- **Kiwi AI:** now keeps its functions: mic, Action Center with count, Calculator, Attach, both simulators, source-cited card. The weak points are the unlabelled Actions glyph (P2) and a Today card that repeats Home instead of the shipped insight (M2).
- **Floor:** kept as shipped by owner decision 15. The spec says so consistently, check 6 and rows 4, 15, 19 to 21, 33, 34, 92, 107 and 184 to 188 are retired, the fixture keeps only the table-to-zone `plan`, the only `floor.*` key left is `floor.table`, and revision 22's floor appears only as withdrawn history in §24.

**Critique 22's majors are genuinely fixed:**
- **M1 (Kiwi AI).** Mic, Action Center, calculator, attach and simulators are drawn, specified and cited correctly: `agent-voice.js` :28, :34, :37, :87, :115-131; `agent-action-center.js` `allowed()` owner or manager, `undoable` :116, 120 s tokens.
- **M2 (Invoicing and Export).** Homes exist: More › Money › Invoicing and Accounting on phone and sidebar, `invoice.a4`, Report's export popover with three exports, Customers' overflow.

**Preview:**
- Fixture checks: 16 of 16 pass. Mutations: 178 of 178 caught, 14 retired. `why(189..192)` gives the targeted reasons: badge 2 against 1 pending, badge 3 against 2, "mic draws the send symbol", "VIP 1 against VIP 0".
- Mutation rows 180 to 183 also still go red for the reasons they name.
- 109 icons across the seven templates, matching §18.0's count.
- The icon path table matches 38 of 38 vendored files.

**Fonts:**
- The kit self-tests pass: face declarations, Arabic stack 51.69 = 51.69 px, `bill.send` 136.1 and 136.4 against §6.6, and the negative controls.
- The preview's six woff2 files are byte-identical to the app's shipped copies: `@fontsource-variable/inter-tight` latin and latin-ext, `app/www/native-fonts` Plex 400, 500 and 600, and `@fontsource` Plex 700.
- Every code point drawn in every frame falls inside a declared face's `unicode-range`, so nothing falls to `system-ui`.

**Layout and figures:**
- AI frame layout matches §18.6: field 20 to 364, mic 316 to 360, send 376 to 420 (a 12 gap), Calculator and Attach do not overlap, suggestions 468 to 728, placeholder 154 px wide.
- Customers counts: Regular 4 + New 2 + Inactive 2 = 8, with VIP outside the sum as stated.
- The Arabic delta's visual order is correct.

**Locks and server code:**
- §10.2's dashboard Read row matches `askServer` at 319ac100.
- §10.26's account of the store lock matches `till-tenant.js@762bb255`.
- Since 319ac100, `main` added per-device till revocation (895d98ed). That fits under Settings › Devices and the unpaired path, so it is not a finding.

**Housekeeping:**
- Nothing in the repo was edited, staged or committed.
- The HTTP server on port 8973 is stopped, the tab I opened is reset and closed, and only `scratchpad/critic23/` was deleted.
