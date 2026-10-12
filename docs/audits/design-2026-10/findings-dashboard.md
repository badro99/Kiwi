# Design audit 2026-10 · cluster `dashboard`

Critic pass over 17 surfaces (`dashboard.*`): 102 EN frames (iPhone, iPad, desktop × light, dark), AR dark frames of `dashboard.home` and `dashboard.orders`, and the real simulator captures in `app/ios/build/app-store-screenshots/iphone-6.9/raw-{home,orders,report,customers,retention,ai}.png` and `ipad-13/raw-{home,orders,customers,retention}.png`.

Frame root: `/Users/zaka/Developer/kiwi-design-audit/shots/`. Raw captures: `/Users/zaka/Developer/kiwi/app/ios/build/app-store-screenshots/`.

The question for this cluster: does an owner understand how today is going in three seconds, and does every number agree with every other screen? The first is nearly yes on iPhone. The second is no, on almost every screen.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 4 | One figure printed at two precisions on one card (19,174 and 19,174.35). Three different selection styles side by side. Orphan tiles on iPad. Title Case page names next to sentence-case nav. Decorative badges that mean nothing. |
| UI | 4 | The cash-count grid spills its subtotals outside the card. A primary button looks disabled and gives no reason. "Delete my account" sits in the main sidebar. iPhone Customers has unlabelled icon-only buttons. An error state shows on an untouched form. |
| UX | 4 | iPhone Home gets the 3-second read right (hero, delta, period). iPad puts five KPI tiles above the revenue hero, so the hero is below the fold. Report opens on Yesterday while Home opens on Today. "vs yest." never says "at the same time". |
| Motion | 0 | Not checked. Needs screen recordings of the range switch, lens pill, sheet open/close, and a reduced-motion run. |
| Feel and haptics | 0 | Not checked. Needs a haptics trace from the native shell (tab switch, range switch, pull, destructive confirm). |
| Copy and language | 3 | French dates in the English Z history. "Client 8" and "Kiwi Wallet" untranslated in Arabic. MAD and درهم on the same AR screen. The word "demo" in owner copy. Three names for the same AI and three for the same report. KPI percentages in the wrong order on AR desktop. |
| Accessibility | 3 | Avatar initials at 1.55:1, month-report icon at 1.09:1 in dark, "Close the day" button at 2.66:1. A visible focus box on every page heading on iPad and iPhone. VoiceOver and Dynamic Type not checked. |
| Honesty and consistency | 1 | Today's revenue has four values across Home, Menu analysis, Compliance and the AI panel. Yesterday has three (Home baseline, Report, Notifications). Customer status disagrees for 5 of 8 customers between Customers and Retention. Daily goal is 31,500 on Home and 28,000 in Settings. Fixed costs are 113,000 or 393,199. Payroll is 45,600 or 78,000. Static seeds are labelled LIVE. |
| Performance | 0 | Not checked. Needs INP and CLS traces on an iPhone 12 (Home range switch, Orders scroll, Floor plan drag). The capture log also shows two frames detached mid-load (home desktop-dark-en, stock desktop-dark-en). |

## 2. Verdict

**FAIL.** No dimension reaches 10, and honesty and consistency is at 1.

## 3. The five changes that move the scores most

1. **One ledger, one number.** Every revenue, order count, basket, margin, payroll and fixed-cost figure on every dashboard screen should read from the same day ledger (`KiwiDayReport` / `KiwiSales`). That covers Home, Orders, Report, Compliance Z, Menu analysis, the AI panel, Notifications, Terminals, Team and Planning. Delete the static seeds that sit next to live numbers:
   - `assets/dateRange.js:703-704` (margin 71.4, success 99.34)
   - `assets/conformite.js:291-332` (Z_DATA and Z history)
   - `assets/accounting.js:27` (842,300)
   - `assets/interactive.js:1941` and `:346` (45,310 and 251)

   This takes Honesty from 1 to about 6.
2. **One customer segmentation.** Customers uses `segment()` in `clients-store.js:486`, overridden by hardcoded `seg:` values in `clients-directory.js:95-102`. Retention uses `groupOf` in `customer-retention.js:250`. Both screens should call one function with one set of labels. Today 5 of 8 customers have different statuses on the two screens.
3. **Name the baseline.** Home's "vs yest." compares against yesterday at the same time of day (`dateRange.js:322 demoPreviousAt`). Report compares against last Sunday. Notifications quote yet another yesterday. Label it "vs yesterday at 17:39" and give Report the same comparison option. When the day ends, Report's Yesterday total should be the number Home's chip compared against.
4. **Fix RTL and translation leaks in one pass.** Wrap every number and unit in a bidi isolate on the AR desktop KPI tiles. Translate "Client N", "Kiwi Wallet", the Z-history dates and the AI name. Pick درهم or MAD once. This takes Copy from 3 to about 6.
5. **Remove the visual debris that reads as broken.** Fix the cash-count grid overflow (`dashboard.html:3879-3881`), the heading focus box on touch devices (`interactive.js:4883`), avatar and icon contrast, the returning-customers chip collision, the orphan KPI tile on iPad, and "Delete my account" in the primary sidebar. This takes Visual and UI from 4 to about 6.

## 4. Findings by surface

### dashboard.home

- **blocker · Returning customers card counts orders as customers** · `dashboard.home/desktop-light-en.png`, `dashboard.home/desktop-dark-ar.png`
  - Evidence: the card says "36 of 137 customers seen", and 137 is the Orders tile. The AR card says "48 من 183 عميل", and 183 is the AR order count. The customer book holds 8 customers (`dashboard.customers/desktop-light-en.png`).
  - Source: the denominator is the order count (`dateRange.js:706`, `regulars.unit '/ 182'`, and demoClock `regularsRatio: 0.26`). The +26 % delta is a seed (`dateRange.js:706`, `delta: 26`) that happens to equal the 26 % ring.
  - A 10: "Returning customers today: n of m identified customers", both from the customer book, and no delta unless a real prior period exists.
- **blocker · Gross margin and success rate are constants next to live tiles** · `dashboard.home/iphone-light-en.png`, `iphone-dark-ar.png`, raw `iphone-6.9/raw-home.png`, `ipad-13/raw-home.png`
  - Evidence: 71.4 % +1.8 % and 99.34 % +0.2 % are identical in every capture across 3 hours of demo time, while Orders moved 123 → 134 → 137 → 183. Menu analysis shows 50.7 % gross margin for the same day; the AI panel implies 69 % (581,300 / 842,300).
  - Source: `assets/dateRange.js:703-704`.
  - A 10: margin computed from the ledger's COGS, with one definition and the same value on Home, Menu analysis and the AI panel.
- **major · "vs yest." is an unlabelled same-time comparison** · `dashboard.home/iphone-light-en.png` chip "−1,127 MAD · −5.6 % vs yest.", raw `iphone-6.9/raw-home.png` "−1,199 MAD · −6.5 %"
  - Evidence: the implied baseline is 18,337 MAD at 17:39. Report for the same yesterday (`raw-report.png`) says 33,399.45 MAD and 215 transactions. Home's Orders +3.4 % implies yesterday had 119 orders. An owner who taps through cannot reconcile either figure.
  - Source: `dateRange.js:2395-2398`, `:322-332`.
  - A 10: "vs yesterday at 17:39 · 18,337 MAD", tappable through to the Report at that hour.
- **major · Daily goal disagrees with Settings** · `dashboard.home/desktop-light-en.png` "TODAY'S GOAL 19,174.35 / 31,500 MAD" vs `dashboard.settings/desktop-light-en.png` "Daily goal 28 000 MAD"
  - Source: 31,500 is the demo full-day revenue (`assets/demoClock.js:15`). 28 000 is a hardcoded default (`assets/interactive.js:2179`, `getSet('goal', '28 000')`), and that setting's own hint says it "Updates the dashboard goal bar".
  - A 10: one stored goal, read by both screens.
- **major · Same figure at two precisions on one screen** · `dashboard.home/desktop-light-en.png` (hero 19,174 MAD, goal card 19,174.35), `ipad-13/raw-home.png` (18,835 vs 18,834.98)
  - A 10: whole numbers on the overview, decimals only in the Report.
- **major · iPad buries the hero** · `ipad-13/raw-home.png`, `dashboard.home/ipad-light-en.png`
  - Evidence: the revenue hero starts at about y 1630 of 2752 px. Five KPI tiles and a 230 px "Today" header come first. The Card/cash tile is an orphan in a 2-column grid with an empty right cell. iPhone puts revenue first.
  - A 10: the same order on every device (revenue and delta, then chart, then tiles), with a tile count that fills the grid.
- **major · Chip collides with text** · `dashboard.home/desktop-light-en.png`, `desktop-dark-ar.png`
  - Evidence: the "+26 %" pill overlaps "of 137 customers seen" (both at about y 1035 display px). The same collision appears in AR over "من 183 عميل مسجل".
  - A 10: the delta on its own line, or right-aligned with at least 8 px of gap.
- **major · AR desktop KPI numbers are reordered** · `dashboard.home/desktop-dark-ar.png`
  - Evidence: Card/cash reads "33 % / 67" (iPhone AR reads "67 / 33 %"). Deltas render as "% 3,4+" and "% 9,3-". The hero chip reads "مقابل أمس % MAD · -6,2 1696-". The goal reads "25 622,37درهم" with no space.
  - Cause: iPhone AR (`iphone-dark-ar.png`) renders the same tiles correctly, so the desktop tile markup lacks isolation. `assets/rtl-numbers.js` exists but does not reach these nodes.
  - A 10: every number and unit wrapped in a bidi isolate, with identical output on all three devices.
- **major · Currency label changes within one AR screen** · `dashboard.home/iphone-dark-ar.png`
  - Evidence: hero "25 622 درهم", chip "−1696 MAD", goal "5 878 MAD المتبقي" (desktop). Thousands grouping also differs: "25 622" vs "1696".
  - A 10: one currency label and one grouping rule per locale.
- **polish · Period label sits under the chart on iPhone** · `dashboard.home/iphone-light-en.png`
  - Evidence: the hero reads "Revenue & orders 19,174 MAD" with no "Today". The range control is at about y 1430 of 2868 px. "Revenue & orders" shows only revenue.
  - A 10: "Today · 19,174 MAD" in the hero eyebrow.
- **polish · "Customize" as a quick action** · `dashboard.home/iphone-light-en.png`, round buttons Day report / Invoicing / Export / Customize
  - Editing the layout is not a daily task.
  - A 10: three task actions, with Customize in an edit menu.
- **polish · Avatar initials invisible in the light theme** · `dashboard.home/desktop-light-en.png`, top-right "RB"
  - Evidence: 1.55:1 (sampled #060E0B on #053B2C).
  - A 10: at least 4.5:1.
- **polish · Chart axis keeps "05h" in Arabic** · `dashboard.home/iphone-dark-ar.png`
  - A 10: a localised hour format.

### dashboard.orders

- **blocker · The order list is an arithmetic sequence** · `dashboard.orders/iphone-light-en.png`, `desktop-dark-en.png`, `iphone-dark-ar.png`
  - Evidence: every amount is a multiple of 28.28 (28.28, 56.56, 84.85, 113.12, 141.41, 169.68, 197.97, 226.24, 254.53). Customers are "Client 1…12" counting down, and payment methods rotate. A merchant who sees this will assume the product invents data.
  - A 10: rows from the same ledger as the 19,174 hero, summing to it.
- **major · The same totals three times on one screen** · `dashboard.orders/desktop-dark-en.png`
  - Evidence: subtitle "184 orders · 25,735 MAD · Today", then the hero "25,735 MAD", then "184 orders · avg basket 140 MAD".
  - A 10: one header with total, count and basket.
- **major · Two "All" filters stacked** · `dashboard.orders/iphone-light-en.png`
  - Evidence: chips "All Cards Mobile Cash Refunds" and a segmented control "All Reconciliation Anti-fraud", each with a different selected style (mint chip vs grey-blue lens pill).
  - A 10: one segmented control for the view, with payment method as a single filter menu.
- **major · Untranslated strings in Arabic** · `dashboard.orders/iphone-dark-ar.png`, `desktop-dark-ar.png`
  - Evidence: "Client 8", "Kiwi Wallet" and "MAD" in every row. The hero shows "MAD 25 622" (unit on the left) while rows show "84,85 MAD" (unit on the right).
  - A 10: "زبون 8", localised method names, and one unit position.
- **polish · Kiwi Wallet rows are taller** · `dashboard.orders/desktop-dark-en.png`
  - Evidence: only Kiwi Wallet has an icon, stacked above the label, so its row is about 84 px against 68 px.
  - A 10: an icon for every method, inline, at a fixed row height.
- **polish · Copy** · the "Orders up to date" heading, and a Tip column of "·" on every row.
  - A 10: drop the heading and hide a column that is empty on every row.

### dashboard.daily-report

- **blocker · Yesterday has three values**
  - Evidence: `dashboard.daily-report/desktop-light-en.png` shows 33,399.45 MAD and 215 transactions. `dashboard.notifications/desktop-light-en.png` says "Yesterday's transaction summary · 45,310 MAD from 251 transactions" (`assets/interactive.js:1941`, `:346`). Home's baseline is the third value (see above).
  - A 10: Notifications quote the Report.
- **major · Different comparison baseline** · Report says "+7 % vs. last Sunday", Home says "vs yesterday".
  - A 10: the same compare selector on both.
- **major · Ambiguous peak bar** · `dashboard.daily-report/desktop-light-en.png`, Rhythm of the day
  - Evidence: the 11:00 bar is highlighted as "Peak 5,052.02 MAD" while the 20:00 bar reaches the same height (both top out at about y 961 display px).
  - A 10: a single tallest bar, or both flagged.
- **major · An unclosed day reads as neutral** · a grey "DAY NOT CLOSED" pill on a past day.
  - A 10: an amber state with a "Close day" action that opens the Z flow.
- **major · Month-report icon invisible in dark** · `dashboard.daily-report/iphone-dark-en.png` and raw `iphone-6.9/raw-report.png`
  - Evidence: a black glyph on #0A0F0D, 1.09:1.
  - Cause: the Material SVG is loaded as `<img>`, so it cannot take `currentColor` (`assets/day-report-dash.js:694`).
  - A 10: inline SVG with `fill="currentColor"`.
- **polish · Layout**
  - On iPhone, Print sits alone on its own row, Export is at the right, and End of Month is full width: three button weights for three equal actions.
  - "Sales before refunds" duplicates Net when refunds are 0.
  - The date appears twice on desktop.
  - First and last sale take a full-width card for two values.
  - "End of Month Report" is Title Case.
  - The 14-day total includes today's partial bar without marking it as in progress (437,171.73 / 437,030.32 / 429,705.61 across captures).
  - A 10: one action row (Export, Print, Month), as a menu on phone, and a refunds tile only when refunds are non-zero.
- **polish · Three names** · nav "Daily report", tab bar "Report", quick action "Day report".
  - A 10: one name.

### dashboard.customers and dashboard.customer-retention (lead confirmed)

- **blocker · Status disagrees for 5 of 8 customers** · `dashboard.customers/desktop-light-en.png`, `dashboard.customer-retention/desktop-light-en.png`, raw `iphone-6.9/raw-customers.png`, `raw-retention.png`

  | Customer | Customers | Retention |
  | --- | --- | --- |
  | Youssef Amrani (41 d) | Dormant | Visiting less often |
  | Hind Moujahid (38 d) | Dormant | Visiting less often |
  | Mehdi Cherkaoui (8 visits) | New | Visiting less often |
  | Walid Fassi (5 visits) | New | Regular |
  | Salma Fassi | VIP | Regular |

  - The totals disagree too. Customers: "Regulars 3 · VIP 1 · New 2 · Dormant 2". Retention: "Regulars 5 · Visiting less often 3 · Inactive 0".
  - Cause: the demo rows hardcode `seg:` (`assets/clients-directory.js:95-102`) and break the store's own rule (`assets/clients-store.js:485-491`). That rule says New needs at most 2 visits and VIP is at least 3,000 MAD or 20 visits, so Nawal and Imane should be VIP. Retention runs a separate engine with different thresholds (`assets/customer-retention.js:250-261`: 30 and 90 days, 1.5 × rhythm) and different labels.
  - A 10: one segmentation function and one label set on both screens.
- **major · "every 7d" for all eight customers** · the Usual rhythm column on Retention.
  - Synthetic history makes the column carry no information.
  - A 10: the real median gap, or "·".
- **major · "Demo data" chip and a toast on a merchant screen** · `dashboard.customer-retention/desktop-light-en.png`
  - Evidence: a "Demo data" chip, and the toast "Settings saved on this device" covering the account menu.
  - A 10: no demo badge on a merchant surface, and toasts below the top bar.
- **major · Icon-only actions on iPhone** · raw `iphone-6.9/raw-customers.png`
  - Evidence: three unlabelled circles (export, loyalty, retention) next to a labelled "New customer".
  - A 10: labels, or an overflow menu.
- **polish · Points mirror spend 1:1** · the Points column equals Spent on every row, and Retention's Loyalty column is "·" on every row.
  - A 10: one loyalty column with real values.
- **polish · Subtitle repeats the tabs** · "Café Atlas · Activity · groups · offers · suggestions · results", in mixed case, directly above tabs with the same names. The Customers subtitle reads "The full book · contacts, loyalty and consent."
  - A 10: no subtitle, or a count.
- **polish · Header pattern differs** · iPhone Customers puts the title in the nav bar. Retention puts the logo in the nav bar and a large title below. The tab bar highlights Customers while on Retention.
  - A 10: one navigation pattern.

### dashboard.compliance (lead confirmed, worse than reported)

- **blocker · Cash-count subtotals render outside the card** · `dashboard.compliance/ipad-light-en.png`, `ipad-dark-en.png`
  - Evidence: the page overflows by 5 px, but the subtotal column overflows much more. The right-column "= 0 MAD" sits past the card's right edge (edge at about 1998 px, text from about 2015 px) and the viewport cuts off the "0" and "MAD". Left-column subtotals are hidden under the right column.
  - Cause: fixed tracks `60px 14px 70px 14px 1fr` inside a 2-column grid (`dashboard.html:3879-3881`) leave the 1fr track at about 0.
  - A 10: one denomination per row on tablets, or the subtotal under the input, with no clipping at any width.
- **blocker · Expected cash doesn't add up from the lines shown**
  - Evidence: 8,240 + 720 − 600 = 8,360, but the card shows 8,860. The difference is a 500 MAD opening float that is never shown (`assets/conformite.js:338-341`).
  - A 10: "Opening float 500 MAD" as a visible line.
- **blocker · Register totals contradict Home**
  - Evidence: Today's register is 8,240 + 17,850 + 1,420 = 27,510 MAD, labelled "LIVE COUNTERS · 20:45", while Home shows 19,174 or 25,735 MAD.
  - Cause: Z_DATA is static (`conformite.js:291`); only the timestamp is live (`:123`).
  - A 10: counters from the ledger.
- **major · Z history is from June, in French, in an English UI**
  - Evidence: "02 juin 2026 … 27 mai 2026" in October 2026 (`conformite.js:324-332`).
  - A 10: real closures, formatted for the locale.
- **major · Duplicate denomination**
  - Evidence: "10 MAD" appears twice (bill and coin, `conformite.js:315-316`) with nothing to tell them apart.
  - A 10: "10 MAD note" and "10 MAD coin", or a single row.
- **major · Error before any input**
  - Evidence: "Variance −8,860 MAD · major variance, verify now" and a required reason field on an untouched form.
  - A 10: the variance appears after the first count.
- **major · Primary button contrast**
  - Evidence: "Close the day → generate Z" is white on #76A999, 2.66:1, with no reason given for the disabled look.
  - A 10: at least 4.5:1, plus a line saying what unlocks it.
- **polish · Variance colours**
  - Evidence: −18 is green, −42 amber, −8 green. Size drives the colour, not the sign, so a green shortfall reads as good.
  - A 10: neutral within tolerance, amber or red outside it, and the sign always shown.

### dashboard.terminals

- **major · Visible focus box on the page title** · `dashboard.terminals/ipad-light-en.png`, `iphone-light-en.png`, `ipad-dark-en.png`, `iphone-dark-en.png` (also Planning, Settings and Floor plan on iPad/iPhone)
  - Evidence: a 2 px green rectangle around "Terminal Fleet" after navigation.
  - Cause: `interactive.js:4883-4884` focuses the h1. `tokens.css:239` suppresses the ring, but the native/touch skin overrides it.
  - A 10: focus moves for VoiceOver, with no visible ring on pointer or touch navigation.
- **major · "273 tx today" vs 137 orders on Home**
  - Evidence: the Terminals subtitle and per-device counts (87 + 54 + 0 + 132).
  - A 10: the same count as Orders.
- **polish** · "Terminal Fleet" is Title Case, and "Test Tx" is jargon. On iPad dark one "Manage" button is filled mint and the rest are outlined.

### dashboard.team and dashboard.planning

- **major · Hours disagree between adjacent screens**
  - Evidence: Team "Hours · current period 270 h 30" vs Planning "Hours this period 287 h 30" on desktop; 302 h 30 vs 284 h 30 on iPad; 284 h 30 vs 275 h on iPhone. Team "On shift today" reads 5, 7 and 7 across captures.
  - A 10: one period and one total.
- **major · Planning contradicts itself** · `dashboard.planning/ipad-dark-en.png`
  - Evidence: "Hours this period 284 h 30 · total entered on the schedule" next to "Nothing planned yet · Planned 0 h · No shift or day off has been entered".
  - A 10: "Worked 284 h 30 · Planned 0 h", labelled as such.
- **major · Payroll disagrees with Menu analysis**
  - Evidence: Team and Planning show base salaries of 45,600 MAD a month. Menu analysis break-even shows "Fixed salaries 78,000 MAD".
  - A 10: one payroll figure.
- **major · "demo" in owner copy**
  - Evidence: "from today's demo hours" (`assets/team.js:248`).
  - A 10: "from today's clock-ins".
- **polish** · The iPad table truncates "BASE SALA…". A trash icon on every row puts delete one tap from the list. iPhone filter chips are cut off at the edge with no fade.

### dashboard.reservations

- **major · Floor plan says 2 reserved, Reservations says 0 bookings today**
  - Evidence: `dashboard.floor-plan/desktop-light-en.png` shows the legend "Reserved 2" and "Right now · No bookings today" in the same view. `dashboard.reservations/desktop-light-en.png` shows Today 0.
- **polish · Three names** · nav "Reservations & appointments", page "Bookings", eyebrow "KIWI RESERVATIONS". Four zero tiles sit above the setup empty state, and "Guests expected 0" has a "·" sub-line.
  - A 10: the empty state replaces the tiles.

### dashboard.floor-plan

- **major · Occupancy is counted three ways**
  - Evidence: header "24 tables · 11 in service", tile "10 free of 24", legend "Free 4 · Seated 5 · Paid 1 · Reserved 2", footer "12 tables · 5 occupied".
  - A 10: one occupancy model, with room and venue clearly scoped.
- **polish** · A "Demo · statuses set by hand" chip. iPhone opens the Table assignment sheet by itself, with both an X and a Close button. "Floor Plan" is Title Case while the nav says "Floor plan".

### dashboard.menu

- **major · Empty menu next to 137 sales and 86 alerts** · `dashboard.menu/desktop-light-en.png`
  - Evidence: "0 items · 0 sections" with an "86 Alerts" tab. Stock offers "Mark 86 on menu" for items that do not exist.
  - A 10: the demo venue ships with its menu, or alerts hide when there is nothing to alert on.
- **polish** · "All · 0 item" should be "0 items". The empty-state line "No demo content will be added." speaks to the developer, not the owner.

### dashboard.stock

- **major · Food-cost ratio disagrees**
  - Evidence: Stock says "Cost ratio 11.9 %"; Menu analysis says "Ingredient cost 19.3 %" for the same venue and week.
  - A 10: one ratio.
- **major · Stale dates**
  - Evidence: "Last delivery: 12 May / 13 May" in October.
  - A 10: real dates, or relative ones ("5 months ago" is itself the alert).
- **polish** · On iPad the KPI values wrap ("15,765 / MAD") in four narrow tiles. The iPhone tab row is cut at "Ord" with no fade. "Tomorrow · 09h" differs from the "09:00" used elsewhere.

### dashboard.menu-analysis

- **blocker · Revenue today is 27,512 MAD**
  - Evidence: `dashboard.menu-analysis/desktop-light-en.png` vs Home 19,174 and Orders 25,735 in the same session. 27,512 is the old seed constant (`dateRange.js:917`, `rev 27512.50`).
  - A 10: the same ledger as Home.
- **major · "You are right on track" while missing the target**
  - Evidence: monthly budget target 825,000, "At this pace → month-end ≈ 809,053 MAD", verdict "on track". It also says "312,600 MAD left over 10 days" on 12 October, when 19 days remain.
  - A 10: "Projected 809,053, 15,947 short" in amber, with the correct day count.
- **polish** · "→" arrows inside sentences ("At this pace → month-end").

### dashboard.ai-panel

- **major · AI numbers contradict the dashboard**
  - Evidence: "Today · 22.3 % net margin, 32.3 % above your break-even point" vs Menu analysis "Today you are 221 % above break-even" and gross margin 50.7 %. "Fixed costs 393,199 MAD" vs Menu analysis "Fixed costs / month 113,000 MAD". The 30-day revenue of 842,300 is static (`assets/accounting.js:27`).
  - A 10: the panel quotes the dashboard's figures.
- **major · Three names for one feature**
  - Evidence: the button says "Kiwi AI · Agent" (desktop) or "Kiwi AI" (phone), the panel title says "Kiwi copilot · Café · Restaurant" (`assets/agent.js:1377`), and AR says "كيوي AI · الوكيل". The line "I'm your finance director" overclaims.
  - A 10: one name in all three languages.
- **polish** · The close button shows a focus ring on open (iPad and iPhone dark). The "local · EN" chip is developer language.

### dashboard.notifications

- **major · Wrong figures and stale event times**
  - Evidence: yesterday is quoted as 45,310 MAD and 251 transactions (see Report). "Terminal T2 offline · 1 hr ago", while Terminals shows Terrace offline since 09:18 and the capture is at 20:45. Times are 12-hour ("11:45 PM") where the rest of the product uses 24-hour.
  - A 10: notifications generated from real events, with 24-hour times in FR, AR and EN-MA.

### dashboard.settings

- **major · Daily goal is 28 000 MAD here and 31,500 on Home** (see Home). The French grouping "28 000" also appears inside the English UI.
  - A 10: one goal, with the locale's grouping.
- **major · Positive colour on an incomplete state**
  - Evidence: "Receipt state · 7 legal details to complete" is in brand green, and "Encrypted" is in large green display type.
  - A 10: amber for anything incomplete, and security status as a quiet line.
- **polish** · The IDENTITY / CHECKOUT / DESIGN / PROTECTION badges carry no information. On iPad the "Dark mode" row uses a check while the next row uses a toggle. iPhone tiles truncate "Café Atlas · Maa…" and "7 legal details to co…". "Liquid Glass · Opaque" is internal jargon.

### Shell (all surfaces)

- **major · "Delete my account" in the primary sidebar** · `dashboard.compliance/ipad-light-en.png`, `ipad-13/raw-home.png`, every iPad frame
  - Evidence: a red destructive item two rows under "Leave the demo".
  - A 10: inside Settings › Account, behind a confirmation.
- **polish · Chrome colour in light theme**
  - Evidence: the light theme keeps a black top bar and sidebar. On iPad the status-bar strip above the dark header is pale (`dashboard.compliance/ipad-light-en.png`, top 35 display px).
  - A 10: one chrome colour per theme, extending under the status bar.

## 5. Systemic patterns

1. **Seeds next to live data.** The demo clock drives some tiles (revenue, orders, basket), while static constants drive their neighbours (margin, success rate, Z register, Z history, accounting, notifications, monthly budget). Each screen looks plausible on its own, but no two agree. This is the biggest defect in the cluster, and it ships in the App Store screenshots (`raw-home.png` vs `raw-report.png`).
2. **Parallel engines for one concept.** Two customer segmentations, three "yesterday" figures, two goals, two food-cost ratios, two payrolls, three occupancy counts. Each feature wrote its own reader instead of calling the existing one.
3. **Labels that claim more than the data.** "LIVE" on static counters, "vs yest." on a same-hour comparison, "on track" on a miss, "customers seen" on an order count, "finance director" on a chat panel.
4. **Naming drift.** Daily report / Report / Day report. Kiwi AI / Kiwi AI · Agent / Kiwi copilot. Reservations / Bookings. Title Case page titles under sentence-case nav.
5. **RTL handled per component, not per number.** iPhone AR tiles are right and desktop AR tiles are reversed. MAD and درهم alternate. Latin "Client" and "Kiwi Wallet" leak through. This needs one formatting helper that returns an isolated span.
6. **Touch builds show desktop focus behaviour.** Programmatic heading focus paints a box on iPad and iPhone on at least four surfaces.
7. **Demo vocabulary in merchant UI.** "Demo data", "Demo · statuses set by hand", "from today's demo hours", "No demo content will be added", "Leave the demo". A paying merchant should never read the word "demo".

## Lead's verification notes

- **"Demo vocabulary in merchant UI" (pattern 7).** Every frame in this cluster
  is the demo venue, where "Demo data", "Leave the demo" and the demo chips are
  intended. The real finding is narrower: strings like "from today's demo
  hours" (`assets/team.js:248`) and "No demo content will be added." must be
  checked for whether they can render for a real merchant (`KiwiEnv.isReal()`).
- **App Store screenshots.** The Report vs Home "yesterday" mismatch is why the
  Report screen was left out of the submitted iPhone set.
