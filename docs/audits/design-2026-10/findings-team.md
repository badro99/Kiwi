# Findings · cluster `team` (staff app, `kiwi-serveur.html`)

Frames: `/Users/zaka/Developer/kiwi-design-audit/shots/team.{tables,table-detail,menu,notifications,profile}/{iphone,ipad,desktop}-{light,dark}-en.png` (30 frames, EN only). Judged as the app a waiter or cashier opens at the start and end of every shift, often on their own phone.

**Capture caveat.** Every frame was captured in browse mode. The harness clicked `#ci-browse-link`, then forced each tab with a JS click on a hidden `.bt-btn`. In the product, browse mode hides `.bottom-tabs` (`kiwi-serveur.html:2734`), and the native host only pushes team tabs when the page is not in browse mode (`app/src/native-runtime.js:1322`). So "Off shift" over a live floor is partly a harness artefact. It is reported once as H-1, because browse mode is enforced with `display:none` alone and the controls stay mounted and live. The native tab capsule is drawn by the Swift host and never appears in WebView frames, so tab-bar navigation can't be judged from these frames.

## 1. Scorecard

| Dimension | Score | One-line reason |
| --- | --- | --- |
| Visual design | 4 | 27 font sizes and 13 radii in one page; two greens outside the tokens (#3FB67A, #14E08A) fight `--atlas`/`--mint`; three page-title treatments; a phone-bezel mock on iPad and desktop. |
| UI | 4 | The table footer stacks 6 controls in 4 colours; destructive cancel uses `window.confirm()`; "+" buttons do nothing until a table is chosen; "Change role" is injected under a bill; one hand-drawn SVG icon. |
| UX | 4 | Cancel-whole-table sits 8 pt under Take payment; on iPad the app is a 420 × 880 px phone in a 1032 pt canvas; the 36-item menu has no search; there are two sign-out paths. |
| Motion | 0 | Can't judge from stills. Needs recordings of tab switch, table open/close, add item and the liquid-lens pill, under normal and reduced motion. |
| Feel and haptics | 0 | Can't judge from stills. Needs a device haptics trace. In the code, the page has a single `navigator.vibrate` (`kiwi-serveur.html:7146`) and nothing on add item, send or payment. |
| Copy and language | 3 | At least 12 French strings leak into the EN table-detail and menu screens; the internal name "OrderPro" appears in copy; "Your shift live" means nothing; "4 guests" is shown on an empty table. |
| Accessibility | 4 | Counts measure 2.31 to 2.96:1, chevrons 2.65:1, dark "Annuler" 3.42:1; all type is in px, so Dynamic Type can't work; 9.5 px labels; 42 pt secondary buttons. |
| Honesty and consistency | 5 | "5" appears three times plus "4 tables" in one header block; a hardcoded "Service (compris) 0 MAD" row; "Your shift live" shown while off shift; the off-shift dot is invisible in dark. |
| Performance | 0 | Can't judge from stills. Needs INP traces on an iPhone 12 for tab switch, quantity +/- and add-to-table. |

## 2. Verdict

**FAIL.** No dimension reaches 10, and three can't be judged from these frames.

## 3. The five changes that would move the scores most

1. **Translate the two money screens.** Every dynamic template string in table detail and menu is hardcoded French: `kiwi-serveur.html:8509, 8520, 8529, 8530, 8592-8608, 8817, 9576, 9645, 10248`, plus `Tout` at 5743, 5751, 5920 and 9615. Route them through `employeeLanguage` the way `employeeCoverCount` (5708) already does. Copy +3, UX +1.
2. **Kill the phone mock on iPad and desktop.** Replace `.app {width:420px;height:880px;border:6px}` (`kiwi-serveur.html:508-517`, only undone under 500 px at line 521) with an adaptive split view: table list plus open table. Visual +1, UX +1.
3. **Rebuild the table-detail footer around one action.** Take payment becomes the single filled button and Add items the secondary. Bill, Transfer, Merge and Cancel move into a "More" action sheet, with Cancel confirmed by a native destructive sheet instead of `confirm()` (8817, 8860). Remove `.screen-table` from the native gate list (`app/src/native-runtime.js:216`). UI +2, UX +1.
4. **Collapse the visual system to tokens.** Retire `--emerald #3FB67A` (line 133) and `--urgent-bg #14E08A` (line 405). Cut 27 font sizes to 7 steps and 13 radii to 4. Use one page-title style. Replace `SLIDERS_SVG` (5821) with the Material `tune` icon. Visual +2.
5. **Clear the accessibility floor.** Bring counts to at least 4.5:1 and chevrons to at least 3:1 (remove `opacity:.6` at line 1207 and around line 4001). Darken the dark-mode danger ink. Use rem sizing with `-apple-system-body` so Dynamic Type works. Make `.td-extra-btn` a real 44 pt (lines 1650-1651). Accessibility +3.

## 4. Findings by surface

### team.tables

- **major · Counts repeated in the header**
  - Frame: `team.tables/iphone-light-en.png`
  - Evidence: "My tables 5", the "All 5" chip, a "5" pill and "4 tables" all sit within 470 pt. The "5" pill and "4 tables" stack in one right-hand column, so the header reads as 5 against 4.
  - Source: `kiwi-serveur.html:4013-4022` (`.scope-title`), 4289-4297.
  - What a 10 looks like: one count, on the segmented control only.
- **major · "4 guests" on an available table**
  - Frame: T3 card, "T3 · 4 guests / Available".
  - Evidence: the card shows the table's capacity as guests, but an empty table has no guests.
  - Source: `kiwi-serveur.html:5708-5711`.
  - What a 10 looks like: "Seats 4" on free tables, and "4 guests" only on seated ones.
- **major · Neon bill-requested card in dark mode**
  - Frame: `iphone-dark`, card T2.
  - Evidence: a full-bleed #14E08A fill (`--urgent-bg`, line 405). This is a fourth green, which breaks the "mint at most 5%" rule. Light mode uses #1F5D3C instead, a different hue family.
  - What a 10 looks like: one urgency token, used the same way in both themes.
- **polish · Unlabelled dot**
  - Frame: T2, "2 guests ●".
  - Evidence: the dot has no label and no `aria-label`.
  - What a 10 looks like: a Material `receipt_long` glyph, or nothing, since the status line already says "Bill requested".
- **major · Low-contrast counts**
  - Evidence: "All tables 21" measures 2.31:1 and "Occupied 4" 2.96:1 in light; 3.81:1 and 3.69:1 in dark.
  - Source: line 1207 and lines 3999-4001.
  - What a 10 looks like: at least 4.5:1.
- **major · Chevrons below 3:1**
  - Evidence: 2.65:1 in light, 3.49:1 in dark.
  - What a 10 looks like: at least 3:1, or no chevron at all.
- **polish · Table id printed twice**
  - Evidence: each card shows a "T1" tile and the title "T1 · 4 guests".
  - What a 10 looks like: the title reads "4 guests · 45 min".
- **polish · "tap to view" next to a chevron**
  - Source: line 8223.
  - What a 10 looks like: the chevron alone.
- **major · Manual refresh button as the sync model**
  - Source: line 4278.
  - Evidence: there is no pull-to-refresh.
  - What a 10 looks like: a quiet sync indicator, with pull-to-refresh as the fallback.
- **major · Phone mock on iPad**
  - Frame: `ipad-light`.
  - Evidence: a 420 × 880 CSS px phone with a 6 px bezel, using 41% of the width and 64% of the height.
  - Source: lines 498-531.
  - What a 10 looks like: a split view.
- **major · Phone mock on desktop**
  - Frame: `desktop-light`.
  - Evidence: the same bezel uses about 30% of the width. There is no hamburger and no visible tab bar, so the frames show no route to the other tabs.

### team.table-detail

- **blocker · French leaks on the money screen**
  - Evidence: "Note cuisine…" ×2, "Sous-total", "Service (compris)", "Annuler toute la table", "Changer table" and "Fusionner" are 7 of the 12 strings on screen. "Paiement en cours…", "Table réglée" and the `confirm()` text are French too.
  - Source: lines 8509, 8520, 8529-8530, 8592-8608, 8817.
- **blocker · Cancel sits next to payment**
  - Evidence: a full-width 44 pt Cancel button is 8 pt below Take payment, and it is confirmed with a browser `window.confirm()`.
  - Source: lines 8605 and 8817.
  - What a 10 looks like: Cancel in a "More" sheet, confirmed by a native destructive sheet.
- **major · Six-control footer in four colours**
  - Evidence: in dark mode, Add items is #3FB67A, Bill #0B6E4F and Take payment #7DF2B0. The footer is about 248 pt, 26% of a 956 pt screen.
  - Source: lines 1637-1643; line 419.
  - What a 10 looks like: one primary, one secondary and an overflow menu, at most 120 pt tall.
- **major · "Change role" under the bill**
  - Source: `app/src/native-runtime.js:216`, which lists `.screen-table` as an entry gate.
- **major · Hardcoded service row**
  - Evidence: "Service (compris) 0 MAD" is a literal, not a computed value.
  - Source: line 8530.
  - What a 10 looks like: the row shows only when the merchant configures service.
- **polish · Status shown twice**
  - Evidence: the header reads "In progress · 45 min" and a pill also says "In progress".
- **polish · Note fields always open**
  - Evidence: a 44 pt input under every line.
  - What a 10 looks like: a collapsed "Add note" link.
- **major · Danger text contrast**
  - Evidence: 3.42:1 in dark (#b85245 on #241d1a) and 4.06:1 in light.
  - Source: lines 135 and 1642.
- **polish · Secondary buttons about 43 pt**
  - Evidence: `min-height:44px` conflicts with `height:42px`.
  - Source: lines 1650-1651.

### team.menu

- **blocker · French leaks**
  - Evidence: the "Sélectionnez une table d'abord…" banner and toast, "Tout" and "FORMULE".
  - Source: lines 9576, 10248, 10255, 5743, 9615, 9645.
- **major · "+" buttons do nothing**
  - Evidence: 10 fully emphasised "+" buttons with no table selected; each only raises a toast.
  - Source: lines 10248-10255.
  - What a 10 looks like: the buttons are hidden until a table is chosen, or they open a table picker.
- **major · No search on a 36-item menu**
  - Evidence: about 10 items fit per screen.
  - What a 10 looks like: a sticky search field and a dense list.
- **polish · Chip scroller clipped inside the 16 pt gutter**
  - Evidence: "Pasti" is cut off inside the gutter instead of at the screen edge.
- **major · Hand-drawn icon**
  - Source: `SLIDERS_SVG` at line 5821.
  - What a 10 looks like: the Material `tune` icon.
- **polish · Redundant "STARTERS" eyebrow**
  - Evidence: printed 7 times under a "Starters" filter.
- **polish · Chip count contrast**
  - Evidence: 3.45:1.

### team.notifications

- **major · Internal product name in copy**
  - Evidence: "OrderPro orders" in the empty state.
  - Source: line 5184.
  - What a 10 looks like: "online orders".
- **major · "Your shift live" while off shift**
  - Source: lines 4314 and 5126.
- **polish · Empty state with no action, then blank screen**
- **polish · Third page-title style**
  - Evidence: Notifications is bold at about 24 px. Tables uses `.scope-title` at 22 px / 400 (lines 4013-4017). Profile uses an eyebrow plus a bold title.

### team.profile

- **major · Identity shown twice**
  - Evidence: the header and a 63 pt card directly below it both show the name.
- **major · Two sign-out routes with two words**
  - Evidence: "Log out" sits beside Clock in, and the hamburger has "Sign out" (`native-runtime.js:812`). The top-left hamburger opens only account actions (lines 840-841).
- **major · Log out next to Clock in**
  - Evidence: a text link 40 pt from the primary button, so a mis-tap ends the session.
- **polish · "6h 00" duration format**
  - Evidence: reads as a clock time, and "12h 00" means noon in French.
  - Source: around line 10512.
- **polish · 9.5 px labels**
  - Source: line 2616.
- **major · Counter with no period**
  - Evidence: "12 SHIFTS" sits beside a week strip showing 6 working days. The counter comes from `assets/employee-planning.js:75`; the strip comes from `SCHEDULE_DATA` (line 10446) or `employeeSchedule` (line 6965).
- **polish · Three stacked headers**
  - Evidence: an eyebrow, a title and a subtitle.

### Cross-surface

- **major · H-1 · Browse mode is enforced by CSS only**
  - Evidence: the comment at lines 2724-2735 says the view is locked read-only, but the code only hides the tabs. The tab panels are neither inert nor disabled, so the Take payment controls remain live.
  - What a 10 looks like: `inert` on every tab panel except Profile.
- **major · Off-shift dot invisible in dark mode**
  - Evidence: `rgba(10,15,13,0.25)` on #0f1714, about 1.0:1, with no dark override.
  - Source: lines 2737-2741.

## 5. Systemic patterns

1. **French text built in the page code never reaches the translation table.** The dict at lines 5100-5420 only translates text already in the HTML; anything built in JS templates stays French. The same leak in Arabic is likely but not verified.
2. **Six greens compete for "primary".** `--atlas`, `--emerald`, `--urgent-bg`, `--mint`, #1F5D3C and #EBF5F0 all appear as primary or status colours. The comment at line 133 concedes `--emerald` has no brand equivalent.
3. **Type and shape sprawl.** 27 px font sizes (8 to 64, including half-pixel steps) and 13 radii, all in px, so Dynamic Type does nothing.
4. **Desktop-preview scaffolding shipped to devices.** The `.phone-frame` / `.app` mock applies to every viewport wider than 500 px, including the native iPad app.
5. **Duplication used as decoration.** Table ids, statuses, counts and identity each print twice or more.
6. **Escape hatches next to main actions.** Log out, Cancel table and Change role all sit in the thumb zone of the main action.
7. **Feel can't be verified from stills.** The code has a single `vibrate` call; a device trace is needed to confirm what fires on payment and add item.
