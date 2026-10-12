# Design audit 2026-10 · cluster `till` (cashier register)

This critic pass covers 16 surfaces and 92 frames (English, light and dark, iPhone, iPad and desktop). It also uses the App Store simulator baselines `app/ios/build/app-store-screenshots/iphone-6.9/raw-till-{open,menu,bill}.png` and `ipad-13/raw-till-bill.png`. Frames are in `/Users/zaka/Developer/kiwi-design-audit/shots/till.*/`. I judged the till as a tool used at speed during a lunch rush.

**Capture notes (not design findings):**
- `till.floor-list` exists for iPhone dark only.
- On desktop the burger step was skipped because the rail is always visible.
- The iPad and desktop `till.floor-map` frames skipped the List/Map toggle.
- The iPhone audit frames show neither the native tab capsule nor the floating "View bill" pill. The App Store capture `raw-till-menu.png` shows both, so I judged the iPhone navigation from that frame.

## 1. Scorecard

| Dimension | Score | Reason |
| --- | --- | --- |
| Visual design | 3 | 36 distinct font sizes (8 to 88 px, with half-pixel steps); hand-drawn stroke icons for dishes; close-out sheet hard-coded dark in light mode; iPad category chips wrap to 3 rows. |
| UI | 3 | Card stepper cut off the card on iPad and desktop; kitchen screen columns crushed to 40 px slivers on iPhone; native number spinners; selected state invisible on the dark segmented control; Save has no disabled state at 0. |
| UX | 3 | "Cancel a sale" opens a sheet titled "Reprint a receipt"; "Delete my account" sits in the cashier menu; a Ready and Paid order has no action; two equal-weight green primary buttons in the iPad bill. |
| Motion | 0 | UNVERIFIED. Needs recordings of sheet open and close, the stepper, the toast stack and the lens pill, at 60 fps and with Reduce Motion on. |
| Feel and haptics | 0 | UNVERIFIED. Needs a haptics trace for add-to-bill, payment success and error toasts. |
| Copy and language | 2 | French on 8 of 16 surfaces in an English till; "Remise" (hand-over) translated as "Discount"; raw `sale-ref-…-seed-46` ids shown to the cashier; French decimals and weekday on the English web till. |
| Accessibility | 2 | Team broadcast button at about 1.05:1 in dark; free-table status dot at 1.02:1; 8 to 10 px labels; targets around 29 pt; French aria-labels on the stepper. |
| Honesty and consistency | 3 | Demo journal rebuilt with `Math.random` on every load; team "tables actives" disagree with the floor plan; a paused waiter owns an in-progress table; the Cancel label leads to a Reprint sheet. |
| Performance | 0 | UNVERIFIED. Needs INP traces on an iPhone 12 for adding an item, opening the bill, Take payment, and the kitchen screen ticking every second. |

## 2. Verdict

**FAIL.**

## 3. Five changes ranked

1. **Use keyed strings in the till instead of the French-keyed text-node sweep in `assets/caisse-lang.js`.** This one mechanism causes every leak (hand-over, stock, team, kitchen screen, takeaway history, toasts) and the "Remise" to "Discount" mistranslation. It also misses aria-labels set after the sweep runs.
2. **Make the demo journal deterministic.** Use a seeded generator keyed on the business day (`kiwi-caisse.html` ~L14256-14305), and derive team table counts from the floor plan.
3. **Fix three layouts:**
   - the card stepper that runs off the card (L9790-9798);
   - the kitchen screen on iPhone (`.kit-col-new{width:300px}` at L4955, and `.kit-grid3` never drops below 2 columns, L4960);
   - the iPad bill footer, where "Take payment 105 MAD" wraps into a 2×2 block.
4. **Clean up the cashier menu:**
   - rename "Cancel a sale", or send it to a sheet that leads with cancel;
   - move Delete account, AI privacy and Leave demo out of the till menu (`app/src/native-runtime.js` L850);
   - add a "Hand over" primary to Ready and Paid takeaway orders.
5. **Fix the type scale and the `var(--ink)` fills:**
   - go from 36 font sizes to about 6 tokens, with 12 px as the floor;
   - replace the 5 `background: var(--ink)` rules (L1272, L2083, L2806, L3789, L4726);
   - make the close-out card follow the theme.

## 4. Findings by surface

Frame paths are relative to `/Users/zaka/Developer/kiwi-design-audit/shots/`. Source paths are relative to `/Users/zaka/Developer/kiwi/`.

### till.menu-builder

- **Major · dish illustrations are hand-drawn stroke SVGs.**
  - Frames: `till.menu-builder/ipad-light-en.png`, `desktop-light-en.png`.
  - Evidence: 35 custom 64×64 glyphs drawn at `stroke-width:2.7`. Couscous royal, Couscous tfaya, Couscous légumes and Pastilla share the same dome.
  - Source: `kiwi-caisse.html` L9562-9700 (`MENU_ART`, `MENU_ART_RULES`); CSS L1331-1337.
  - A 10: filled Material Symbols per category, or no art at all.
- **Major · the iPhone card has no art and no "+" button, while iPad and desktop have both.**
  - Frame: `iphone-light-en.png`.
  - A 10: one card layout on every device.
- **Major · the category name is repeated on all 35 cards** even though a chip already filters by category.
  - A 10: category shown only as chips and section headers.
- **Major · the iPhone chip row is clipped mid-word** ("Co…") with no fade at the edge.
  - A 10: an edge fade and snap scrolling.
- **Major · on iPad the chips wrap to 3 rows (about 190 pt).**
  - Frame: `till.bill-sheet/ipad-light-en.png`.
  - A 10: one row that scrolls sideways.
- **Polish:**
  - The header line "7 categories · 35 items" adds nothing on a selling screen.
  - There are two back controls for the same list: the "Takeaway orders" pill and the "←" in the iPhone chip row.

### till.bill-sheet

- **Blocker · the card stepper is cut off on iPad and desktop.**
  - Frames: `till.bill-sheet/ipad-light-en.png` and `desktop-light-en.png`; also on the real simulator in `app-store-screenshots/ipad-13/raw-till-bill.png`.
  - Evidence: the "+" sits past the card edge, and on desktop the price wraps to "45 / MAD".
  - Source: `kiwi-caisse.html` L9790-9798.
  - A 10: the stepper takes its own row and never clips.
- **Major · two equal-weight primary buttons on iPad and desktop.**
  - "Send to kitchen" sits above "Take payment" on iPad; iPhone puts them the other way round.
  - A 10: one primary button per context, in the same order on every device.
- **Major · "Take payment" is atlas green in light but paper white in dark** (`iphone-dark-en.png`).
- **Major · the Card button is a black block with no label on iPad and desktop.**
  - Source: `#pay-card.pay-icon{background:var(--ink)}` at L2083. The phone gets a label only through `app/src/native-runtime.js` L1028-1036.
- **Major · "Clear the order" is an 11 px red text link** next to Print and Reprint.
- **Polish:**
  - The total appears three times on the iPhone sheet.
  - Item names wrap in the roughly 230 pt bill column.
  - The note placeholder is truncated to "…no onior".
  - The stepper uses mismatched text glyphs: an en dash "–" in the bill, a minus "−" on the card (L9793).

### till.payment-cash

- **Major · "105,00 MAD" and "0,00 MAD" use a decimal comma in English**, while the rest of the till shows "105 MAD".
- **Major · quick-cash chips are about 31 pt tall** (`iphone-light-en.png`), and iPad tip chips about 32 pt.
- **Polish:**
  - The tip row is centred while everything else is left-aligned.
  - Percentages are written "5 %" with a space.
  - On iPad the payment dialog is a 400 pt card with 11 px labels.

### till.payment-card

- **Blocker · the whole iPhone light frame is in French.**
  - Frame: `till.payment-card/iphone-light-en.png`.
  - Strings: "3 commandes en cours", "Prête", "Payé", "Non payé", "Encaisser · 130 MAD", "Ticket cuisine en attente", "HISTORIQUE · SERVIES AUJOURD'HUI".
  - The dark frame of the same flow is mostly English, because the translation sweep runs after the render and lost this race.
- **Major · three toasts stacked at once** cover about 45% of the screen and the "Take payment · 200 MAD" button.
- **Major · the 270 pt "Paid" overlay sits on top of unrelated order cards.**
- **Major · the card flow differs by device.**
  - Desktop shows "Hold the card or phone near the reader" with only a Close button; iPhone goes straight to "Paid".
  - Source: L11110-11160.

### till.takeaway-list

- **Major · order 51 is Ready and Paid but has no action.** Every unpaid card has a full-width "Take payment".
  - A 10: a "Hand over" primary button.
- **Major · history headers are in French and mistranslated.**
  - Frame: `ipad-light-en.png`.
  - Strings: "HISTORIQUE · DATE DE REMISE INCONNUE" and "Discount · heure inconnue".
  - Source: `assets/caisse-lang.js` L152 maps `'Remise':'Discount'`; the string itself is at `kiwi-caisse.html` L20811. A cashier reads that order 52 got a discount.
- **Polish · iPad and desktop keep an empty bill panel (about 300 pt) beside the list.**

### till.side-rail

- **Blocker · "Delete my account" (red), "Kiwi AI privacy" and "Leave the demo" are in the cashier's menu** on a shared counter device.
  - Frame: `ipad-light-en.png`. On iPhone the item is clipped at the bottom edge.
  - Source: `app/src/native-runtime.js` L850 and L812.
- **Major · 8 type sizes in a 300 pt rail**, with 9 pt capital-letter eyebrows.
- **Major · the rail stays dark in light mode.**
- **Major · the desktop shows "Lundi 12 Octobre" while iPad shows "Monday 12 October".**
  - Source: `kiwi-caisse.html` L7303-7304. The date follows the till language only on native.
- **Polish:**
  - The terminal-ID pill appears in some frames and not others (L18548-18553).
  - Rail icons render at about 14 pt next to 28 pt text.

### till.cancel-sale

- **Blocker · "Cancel a sale" opens "Reprint a receipt".**
  - Source: L10899-10909 calls `KiwiPosReprint.open`; the header is hard-coded "Réimprimer un ticket" at `assets/pos-reprint.js` L583.
  - Cancelling is two taps deep, under a different name.
- **Major · raw ids shown to the cashier**, for example "cash · sale-ref-827e7680-seed-46".
- **Polish · on iPhone about 40% of the sheet is empty below the list.**

### till.refund

- **Major · today's sales appear as two different journals.**
  - Refund lists times 20:41/39/36/33/30 with references like "261012-0047-2J".
  - Reprint lists 20:42/39/37/34/31/28 with references like "sale-ref-…".
  - The two use different reference formats.
- **Polish:**
  - The last row is cut off with no fade.
  - iPad metadata is about 9 pt.

### till.cash-movement

- **Major · in dark, the selected direction is invisible.**
  - Frame: `iphone-dark-en.png`.
  - Evidence: both "Cash out" and "Cash in" tiles sample as (7,11,9).
- **Major · in light, the selected direction is a black slab.**
- **Major · Save looks enabled when the amount is 0.**
- **Major · native number spinners on iPad and desktop.**
  - Source: `<input type="number">` at L6760.
  - A 10: `inputmode="decimal"` with an on-screen keypad.
- **Polish:**
  - "Supplier purchase" is preselected as the reason.
  - The amount field shows its focus ring before anyone touches it.

### till.handover

- **Blocker · the sheet is in French**, with English mixed in.
  - French: "Passation de caisse", "Poste ouvert à", "Encaissé", "Fond du poste", "Espèces comptées dans le tiroir", "Écart avec l'attendu", "Continuer".
  - English: "Cash taken", "Expected in drawer", "Cancel".
  - Source: L7089 and its sibling lines.
- **Major · the gap field shows a lone "·" as its value.**
- **Polish · native number spinner on iPad.**

### till.end-of-shift

- **Major · the close-out card is dark in every light frame.**
  - Source: `.cloture-card{background:var(--ink-bg)}` and `.clo-title{color:#fff;font-weight:400}` at L3227-3241.
- **Major · "Close the till" is a large mint fill**, which breaks the rule that mint stays at or below 5% of a screen.
- **Major · a sales nudge ("At 77% of today's target, 4 057 MAD to go") sits inside the cash reconciliation.**
- **Major · "Cash counted" and "Difference" show "·" placeholders.**
- **Polish · the screen has two names**: the eyebrow "END OF SHIFT" and the title "Till close-out".

### till.stock

- **Blocker · almost everything is in French.**
  - Strings: "Stock & appro", "Réception", "Vue d'ensemble", "VALEUR DU STOCK", "EN ALERTE", "Alertes stock", "RUPTURE", "BAS", "Perte", "Commander".
  - English appears mid-phrase, as in "by 12 kg". Only "Declare waste" is fully English.
- **Major · "Declare waste" appears twice, both times as a red fill.**
- **Major · the iPhone header overflows.**
  - The subtitle is truncated, a third header button is clipped, and the "Approvisionnement" tab is cut off.
- **Polish · units are not pluralised**, for example "5 plateau … by 14 plateau".

### till.team

- **Blocker · the "Message to the whole team" button is invisible in dark (about 1.05:1).**
  - Source: `.team-broadcast button{background: var(--ink); color:#fff}` at L3789. `--ink` turns light in dark mode and the text stays white.
- **Major · French and franglais in the sheet.**
  - "shift en cours" at L6901, "En service depuis…", "PAS EN SERVICE", "fin de shift", "Message à toute l'équipe" at L17445.
- **Major · "Paused · 8 min" is shown in alarm red for a normal break.**
- **Major · each row has red icon-only buttons with no labels.**

### till.kds

- **Blocker · the iPhone layout is crushed.**
  - The new-orders column is fixed at 300 pt, so the in-progress column shrinks to slivers showing "4", "Read", "PRE".
  - Source: L4953-4961, with no phone breakpoint.
  - A 10: a single column with a New / Preparing switch.
- **Major · French and English mixed on one screen.**
  - French: "File de préparation", "Toutes", "Cuisson chaude", "NOUVELLES", "Accepter".
  - English: "PREPARING", "Ready".
  - The French set comes from `assets/pages-pro.js` L19493.
- **Major · an empty band of about 150 pt above the columns.**
- **Polish:**
  - Ticket timers like "17:03" read as clock times.
  - The eye button on each ticket has no label.

### till.floor-map

- **Major · the map runs off the iPhone screen**; T16 is not visible.
- **Major · waiter avatar badges overlap chairs**, and the "outdoor" label overlaps chair circles.
- **Major · the legend is a black slab in light mode.**
- **Polish:**
  - Orphan shapes on iPad: an unlabelled circle next to T9, a small rectangle at the kitchen, a line at the left wall.
  - The subtitle "vue caissier" is French.

### till.floor-list

- **Major · the "Free" status dot sits at 1.02:1 contrast.**
- **Major · rows show no bill amount and no elapsed time.**
- **Polish · "5 / 9 occupied" has a stray dot in front of it.**

## 5. Systemic patterns

1. **Translation by text-node sweep.**
   - French phrases are the dictionary keys, and the dictionary only runs after a screen has rendered.
   - Anything new or late stays French, and so do aria-labels (L9793 "Retirer un").
   - Words with two meanings translate wrong ("Remise" becomes "Discount").
   - Eight surfaces leak.
2. **Numbers invented on every load** (`Math.random` at L14256-14305).
   - Average ticket reads anywhere from 218,26 to 296,66 MAD on the same "47 transactions" day.
   - The drawer reads 6 410 MAD in one frame and 7 750 MAD in the next.
   - The App Store screenshots inherit this.
   - The team and floor screens disagree:
     - The floor plan gives in-progress T22 to the paused Mehdi K.
     - Karim and Sofia each have 2 in-progress tables there, while Team says "3 tables actives".
     - Yassir's 4 tables appear nowhere, unless they are on the 1st floor, which no frame shows.
3. **`background: var(--ink)` debt.**
   - Five rules make black slabs in light mode and invisible controls in dark.
   - The `tools/check.js` ban misses all five because of the space after the colon.
4. **Light mode is only half a theme.** The rail, the close-out card, the legend and the Card button stay dark.
5. **No type scale.**
   - 36 px font sizes, including 8, 9, 9.5, 10 and 10.5.
   - iPad dialogs show 9 to 11 px metadata.
6. **iPad and desktop dialogs are shrunken phone sheets.** They are cards about 400 pt wide with 11 px labels, 32 pt chips and native number spinners.
7. **Primary buttons compete or are duplicated.** Send to kitchen vs Take payment, Declare waste twice, and Reprint vs Cancel naming.
8. **Account-level controls sit on a shared device**, in the same menu cashiers open to reach Refund.

## Lead's verification notes

- **`background: var(--ink)` and the gate.** The critic's cause is wrong, the
  conclusion half right. The regex in `tools/check.js:189` allows spaces
  (`\s*:\s*`); what it misses is scope: `INK_SCOPE` covers CSS, JS and
  `dashboard.html`, not `kiwi-caisse.html`, so the till's five rules are never
  counted. It is also a debt warning, not a ban.
- **Demo code legend on the till lock.** Checked: a paired (real) till renders
  its own PIN screen (`assets/caisse-pairing.js:725-737`) with a neutral footer,
  and the demo legend is off when `KiwiEnv.demosAllowed === false`
  (`assets/pos-dispatch.js:378`). Demo-only, not a leak.
