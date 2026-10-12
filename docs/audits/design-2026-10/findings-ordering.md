# Findings · cluster ordering

## 1. Scorecard

| Dimension | Score | One-line reason |
|---|---|---|
| Visual design | 4 | No dark mode on all 3 pages; 27 type sizes, 9 radii; a dark gradient band sits at the bottom of every screen; gradient tiles instead of food photos; tokens forked from `tokens.css`. |
| UI | 4 | The back button covers the brand mark; grab handles with no drag; a fake-disabled Continue button; selected chips 1.01:1 against unselected; three different primary-CTA treatments. |
| UX | 4 | 4 steps and about 3.5 s before the first item (splash, mode, numpad, Continue); "Sweet" sugar is preselected and hidden in the cart; the splash lets taps through to cards nobody can see; phone layout stretched to 1440 px. |
| Motion | 0 | UNVERIFIED (needs screen recordings at 60 fps and a reduced-motion pass). Statically, reduced motion covers only the greeting; 4 cubic-beziers plus plain `ease`. |
| Feel and haptics | 0 | UNVERIFIED (needs device test). Statically, the only haptic is `navigator.vibrate`, which iOS Safari does not support, so there is no feedback at all on iPhone. |
| Copy and language | 5 | The poster is 100% French under an EN capture with 0 i18n keys; the OrderPro error gives NFC instructions; aria-labels are French in every language; mixed "Médina, Tangier" / "Médina · Tangier". |
| Accessibility | 3 | `user-scalable=no, maximum-scale=1`; 11.5 px descriptions and 9.5 px nutrition text; 40 px language pills; no `aria-pressed` anywhere; sheets lack `role="dialog"`; white on the #3FB67A gradient end is 2.57:1. |
| Honesty and consistency | 4 | The poster promises integrated payment (Apple Pay, wallet Kiwi) but the flow is pay at the counter or table; the poster mockup UI does not match the shipped UI; "From 12 MAD" when nothing makes it vary; `kiwi-order.html` and `OrderPro.html` differ on 4 175 lines. |
| Performance | 0 | UNVERIFIED (needs INP and CLS traces on an iPhone 12). Statically: a 5 713-line monolithic HTML, 3 Google font families on cellular, and `backdrop-filter` on floating chrome. |

## 2. Verdict

**FAIL.** No dimension is at 10.

## 3. The five changes that would move the scores most

1. **Dark mode for all three guest pages, on shared tokens.** `kiwi-order.html`, `OrderPro.html` and `cafe-atlas-qr.html` contain zero `prefers-color-scheme` rules and none loads `assets/tokens.css`. Every dark frame painted at luminance 0.96 to 1.0. Moves Visual, Accessibility and Honesty.
2. **Remove the parked-sheet shadows and turn zoom back on.** Four sheets sit at `translateY(100%)` and each casts `0 -20px 40px rgba(0,0,0,.18)` up into the viewport, darkening the bottom of every screen. Viewport zoom is also disabled. Moves Visual, UI and Accessibility at low cost.
3. **Shorten the path to the menu.**
   - Kill the 3.2 s greeting, or at least stop it passing taps through.
   - Read the table from the QR URL instead of a numpad.
   - Stop preselecting "Sweet" on an espresso, and list every chosen option in the cart.
   - Moves UX and Honesty.
4. **Raise the controls to iOS conventions.**
   - 17 px body text and 15 px secondary text, down to 5 sizes in total.
   - 44 pt targets for language pills, option chips and category chips.
   - A filled selected state plus `aria-pressed`.
   - A real `disabled` attribute on Continue.
   - Sheets with `role="dialog"`, a focus trap, Escape to close and drag-to-dismiss.
   - Moves UI and Accessibility.
5. **Rebuild the QR poster as something true and printable.** Localised copy, a real scannable QR code, `@media print`, no pitch talk ("Gen Z", "wallet Kiwi"), and a mockup rendered from the real app or a real screenshot. Moves Copy and Honesty.

## 4. Findings

Frame root: `/Users/zaka/Developer/kiwi-design-audit/shots/`. iPhone frames are 1320x2868 at 3x, so CSS px = frame px / 3.

### ordering.mode (`kiwi-order.html`)

- **blocker · no dark mode** · `ordering.mode/{iphone,ipad,desktop}-dark-en.png`
  - Evidence: the manifest reports "painted luminance 0.97" on every dark frame. Dark and light frames are byte-identical on iPad and desktop (sha1 `b84404e6d53f` and `c4d0dd7d72b0` for both themes).
  - Source: `grep prefers-color-scheme kiwi-order.html` returns 0. `theme-color` is pinned at `#F7F5F0` at `kiwi-order.html:12`.
  - A 10: a paired dark token set under `@media (prefers-color-scheme: dark)` and a matching `theme-color media=` pair, so a guest at an evening table is not blinded.
- **major · greeting splash covers the real first screen** · `ordering.mode/iphone-light-en.png`
  - Evidence: the frame shows only "Hello, welcome to café Atlas." The mode cards exist (the waitFor selector passed) but sit under a full-screen opaque overlay.
  - The overlay stays up for 280 + 2 900 + 600 ms ≈ 3.8 s and has `pointer-events: none` with `z-index: 200`. Taps go straight through to mode cards the guest cannot see, so a guest tapping to skip it chooses "dine in" or "takeout" without knowing.
  - Source: `kiwi-order.html:144-160` (overlay), `3950-3979` (timers), `5706-5709` (triggered on landing).
  - A 10: no splash at all, as in Uber Eats and Sunday. If a welcome must exist, it lives inside the mode screen's header.
- **polish · typewriter cursor in the welcome** · same frame
  - Evidence: the `.em-clip.is-typing::after` 2 px blinking caret reveals "welcome to café Atlas." over 1 080 ms. It is a decorative effect with no change of state behind it.
  - Source: `kiwi-order.html:186-205`.
  - A 10: static text.
- **major · bottom dark band (shared with every guest screen)** · `ordering.mode/iphone-light-en.png`, bottom edge
  - Evidence: luminance at the bottom edge is 132/255, against 235 just 200 px higher. The band is about 60 CSS px tall.
  - Source: four parked sheets each carry `box-shadow: 0 -20px 40px rgba(0,0,0,0.18)` at `kiwi-order.html:768, 1606, 1918, 2222` (and `OrderPro.html:823, 1639, 2026, 2331`) while transformed `translateY(100%)`. The upward shadow bleeds into view, and four of them stack.
  - A 10: shadow only on an open sheet (`.is-open .panel { box-shadow… }`), or `visibility: hidden` when closed.

### ordering.table-number

- **major · back button sits on top of the brand mark** · `ordering.table-number/iphone-light-en.png`
  - Evidence: "Café Atlas" reads as "é Atlas"; "Médina" is clipped to "Meuina".
  - `.back-affordance` is absolute at `left: 18px`, 44 px wide (x 18 to 62). `.table-top` flows from x 24, so 38 px of the wordmark sits under a 70% white blur disc.
  - Source: `kiwi-order.html:1160-1174` against `236-243`; markup `2642-2647`.
  - A 10: a header row with the back button and title in one flex row (the iOS nav bar pattern), the title starting after the button.
- **major · ghost of the previous screen** · same frame, y ≈ 950 to 1 050 display px
  - Evidence: "Hello, welcome to café Atlas" shows faintly through the numpad, because the greeting's 600 ms opacity fade overlaps the screen change.
  - A 10: the outgoing layer fully gone before the new screen's content settles.
- **major · fake disabled state on Continue** · same frame, bottom
  - Evidence: a grey `--ink-4` button at `opacity: .7` with `pointer-events: none`, but no `disabled` or `aria-disabled` attribute. VoiceOver announces "Continue, button" and activating it does nothing.
  - When ready it turns black (`--ink`), not brand green, which is a third CTA treatment after the black cart pill and the green-gradient Add / Place order.
  - Source: `kiwi-order.html:365-388`, `4002-4005`.
  - A 10: `btn.disabled = !ready`, and one primary-button style across the flow.
- **major · the guest types a table number after scanning a table QR** · flow
  - Evidence: mode, then numpad, then Continue, which is two steps a QR already knows the answer to. `OrderPro.html` reads `t=` from the link, but the demo guests see (`kiwi-order.html`) does not.
  - A 10: the QR carries the table; the guest lands on the menu with "Table 7" shown and an "Change" link.
- **polish · empty-input placeholder is a lone grey dot** · y ≈ 610 display px
  - Evidence: the dot reads as a bullet, not an input field (`.table-digit.is-placeholder`, `kiwi-order.html:308-313`).
  - A 10: an underlined slot or a caret.
- **polish · hint copy differs by language**
  - Evidence: FR says "Le numéro est gravé sur le bois de la table" (useful); EN says "Enter your table number." (repeats the heading).

### ordering.menu

- **major · no food imagery** · `ordering.menu/iphone-light-en.png`
  - Evidence: every item is a 64 px CSS-gradient tile with a Material glyph. Espresso, Noss-noss and Cappuccino share the identical cup tile. Mint tea, served in a silver teapot, shows an iced-cup-with-drop glyph. Msemen and croissant share the croissant glyph.
  - Source: `kiwi-order.html:592-605`.
  - A 10: merchant photos, as in Uber Eats and Deliveroo. Where there is none, a text-only row, not a fake tile.
- **major · type far below iOS reading sizes**
  - Evidence: item name 14.5 px, description 11.5 px, price 12 px mono, nutrition 9.5 px mono, option group labels 11 px. The page uses 27 distinct `font-size` values.
  - Source: `kiwi-order.html:607-643`, `1696-1712`.
  - A 10: a 5-step scale with body 17 and secondary 15.
- **major · prices set in JetBrains Mono** ("12 MAD", "22 MAD")
  - Evidence: on a consumer menu it reads as terminal output. The cart total is 24 px mono.
  - Source: `.item-price` at `kiwi-order.html:624`; grand total at `864`.
  - A 10: Inter Tight with `tnum`, as the table digit already does at `kiwi-order.html:296`.
- **polish · add buttons sized below 44**
  - Evidence: `.item-add` is a 34 px disc, rescued to 44 px by `::after inset:-5px`. `.video-add` is 26 px, rescued only to 26 + 0. It has no `::after` (`kiwi-order.html:546-560`, `832-835`).
  - A 10: a 44 px visual target, or a stepper that appears in the row after the first add.
- **polish · category chip row** (Top, All, Coffee, Pastries, Savory, Drinks)
  - Evidence: "Drinks" is cut at the right edge with no fade or scroll cue. "Top" next to "All" is ambiguous. Chips are about 37 pt tall.
  - A 10: an edge fade, 44 pt chips, and "Popular" instead of "Top".
- **polish · language switcher crowds the café name**
  - Evidence: a 3-segment, 40 px-tall pill, top right on every screen, competing with "Café Atlas".
  - Source: `kiwi-order.html:2463-2515`.
  - A 10: a single globe button opening a sheet, as Uber Eats does.
- **major · no tablet or desktop layout** · `ordering.menu/{ipad,desktop}-*.png`
  - Evidence: the only media queries are `prefers-reduced-motion` (`kiwi-order.html:218`) and `max-width: 360px` (`1685`). On desktop each row is about 1 400 CSS px wide, the + button sits 1 300 px from the name, and Place order is 1 400 px wide.
  - A 10: a column capped around 600 px, or a two-column grid on iPad.

### ordering.item-options

- **major · defaults chosen for the guest, then hidden** · `ordering.item-options/iphone-light-en.png`, `ordering.cart/iphone-light-en.png`
  - Evidence: "Sweet" and "Single" are preselected on an espresso. In the cart the line shows just "Espresso", because `describeOptions` skips defaults (`kiwi-order.html:4146`: `if (sel === opt.default) continue; // skip defaults`). A guest who never touched the sheet gets sugar and never sees it written down.
  - A 10: required choices start unselected with a "Required" tag, or every chosen option is listed in the cart line, as on Uber Eats.
- **major · selected chip barely distinguishable**
  - Evidence: active `--mint-tint` #EBF5F0 against inactive `--paper-mute` #F4F4F2 is 1.01:1. The `--mint-edge` border is 1.27:1 against the inactive fill, so selection rests on text colour alone, which fails WCAG 1.4.11. Chips are about 37 px tall (10 + 15.6 + 10).
  - There is no `aria-pressed`; `grep -c 'aria-pressed\|aria-checked'` returns 0.
  - Source: `kiwi-order.html:1719-1745`.
  - A 10: a filled forest chip with a white label or a check glyph, at least 44 px tall, with `role="radio"` and `aria-checked` inside a `radiogroup`.
- **polish · "From 12 MAD" in the header next to "Price 12 MAD"**
  - Evidence: "From" is printed even when no option changes the price before the guest acts.
  - Source: `kiwi-order.html:4298`.
  - A 10: show "From" only when price-changing options exist.
- **polish · "pick 1" / "optional" labels**
  - Evidence: 11 px, lowercase, right-aligned grey, so required and optional look the same.
  - A 10: a "Required" pill against grey "Optional".
- **major · CTA label contrast on the gradient**
  - Evidence: `--gradient` runs #1F5D3C to #3FB67A. White on the right end is 2.57:1. "+ Add" sits mostly over the light half.
  - Source: `kiwi-order.html:72`, `.custom-add-btn` at `1816`.
  - A 10: a flat `--atlas` fill (7+:1), and the button says "Add 1 · 12 MAD".
- **major · decorative grab handle**
  - Evidence: a handle is drawn (`.cart-handle`, `kiwi-order.html:773`) but there are no `touchstart`, `pointerdown` or `touchmove` handlers in the file and no Escape handling. Swiping the sheet down does nothing.
  - A 10: drag-to-dismiss with velocity, or no handle.
- **polish · no quantity stepper in the options sheet**
  - Evidence: a second espresso means opening the sheet again.

### ordering.cart

- **blocker · no dark mode** · `ordering.cart/iphone-{light,dark}-en.png`
  - Evidence: light and dark frames are identical (sha1 `6b3b26ac7176` for both).
- **major · qty stepper**
  - Evidence: 30 px circles (`kiwi-order.html:820-829`), rescued to 44 px only by an invisible `::after`. `aria-label="−"` and `"+"` (`4227, 4229`) mean VoiceOver says "minus, button" with no item name.
  - A 10: 44 px buttons labelled "Remove one Espresso" and "Add one Espresso". Going below 1 confirms removal.
- **major · payment gap against the benchmark**
  - Evidence: "Pay at the counter · we'll notify you when it's ready." The guest scans a QR, builds an order, then still has to queue at the till. Uber Eats and Apple Pay sheets close the loop on the phone.
  - A 10: Apple Pay or card in the sheet. Until that exists, say up front on the mode card that payment happens at the counter, which it does, and keep the poster consistent (see qr-poster).
- **polish · "Place order" icon**
  - Evidence: a hand-drawn stroke paper-plane `<svg>` at `kiwi-order.html:3066-3069`. This breaks the Material-only rule. The success check (`2732`), chef hat (`2791`) and bag (`2817`) are also hand-inlined stroke paths. `OrderPro.html` repeats all four (`3219, 3278, 3304, 3630`).
  - A 10: `<i data-icon="send">` and friends.
- **polish · placeholder default text "Table," with a dangling comma**
  - Evidence: `#cart-subtitle` and `#menu-badge-text` render "Table," before JS fills them (`kiwi-order.html:2706, 3058`).

### ordering.qr-poster (`cafe-atlas-qr.html`)

- **blocker · it is not a poster**
  - Evidence: there is no scannable QR code anywhere (the "QR" glyph in the mockup is decorative), no `@media print`, and no table-tent layout. It is a marketing demo page with a "Rejouer l'animation" button.
  - A 10: an A5/A6 printable tent with a real per-table QR, the café name, "Scan to order", the three languages and print CSS.
- **blocker · French only on an English capture**
  - Evidence: `grep -c data-i18n cafe-atlas-qr.html` returns 0, and the page is `lang="fr"` (line 2). Every EN frame shows "Self-order par QR code.", "Chaque table du Café Atlas a son QR…".
  - A 10: FR, EN and AR with RTL.
- **major · claims the product does not make**
  - Evidence: "Paiement intégré, carte, Apple Pay, ou wallet Kiwi" (line 964) against the shipped flow, which says "Pay at the counter" or "payment at the table". "wallet Kiwi" is a Phase-2 surface (CLAUDE.md §7).
  - "C'est là que la Gen Z va déjà" (line 959) is internal pitch voice on a merchant-facing page.
  - A 10: copy that describes exactly what ships.
- **major · mockup is not the product**
  - Evidence: the phone shows a "Table 7" chip, a "QR scanné · commandez sans appeler le serveur" banner, mono caps "MÉDINA · TANGER", and "Tout / Café / Pâtisserie" chips. None of these exist in `kiwi-order.html`, where the menu shows "Takeout", "Top / All" and "Médina · Tangier".
  - It is a third hand-built fork of the menu UI, with a hand-drawn status bar (`<svg>` at lines 997, 1003, 1094).
  - A 10: a real screenshot, or an iframe of the real page.
- **polish · mono tracked caps for "MISSION · SELF-ORDER" and "CAFÉ ATLAS · TABLE 7"**
  - Evidence: letter-spaced JetBrains Mono at about 11 px reads as decoration, not information.
- **blocker · no dark mode**
  - Evidence: dark frames painted luminance 1.0.

### ordering.orderpro-entry (`OrderPro.html`, the real tenant page)

- **major · wrong recovery instruction** · `ordering.orderpro-entry/iphone-light-en.png`
  - Evidence: "Incomplete link · Tap your phone on the venue's tag again to open the menu." with an NFC glyph (`OrderPro.html:4038-4039, 3091, 6133`). A guest who scanned a QR is told to tap an NFC tag.
  - There is no action button, no venue search, and no "ask your server". It is a dead end.
  - A 10: "This link is missing the venue. Scan the code on your table again, or ask a member of staff", plus a button that opens the camera or venue search.
- **major · language switcher inconsistent with kiwi-order**
  - Evidence: OrderPro shows "د / EN / FR" (`OrderPro.html:3072-3074`); kiwi-order shows "Français / العربية / English". The order differs, and a lone "د" is not a recognisable language name.
  - A 10: one component, with full endonyms.
- **major · fork drift**
  - Evidence: `kiwi-order.html` (5 713 lines) and `OrderPro.html` (6 700 lines) carry the same CSS and markup, and a whitespace-insensitive diff still shows 4 175 differing lines. Every fix in this report has to land twice.
  - `apple-mobile-web-app-title` is "Établissement" (`OrderPro.html:10`), a French-only home-screen name.
  - A 10: one guest app, with the demo as a tenant fixture.
- **blocker · no dark mode and the same bottom shadow band**
  - Evidence: luminance 0.96 on dark frames; bottom band shadows at `OrderPro.html:823, 1639, 2026, 2331`.

## 5. Systemic patterns

1. **No dark mode in the whole guest cluster.** Three pages, zero `prefers-color-scheme`, and none imports `assets/tokens.css`. Each redefines its own palette: `--forest` #1F5D3C where the brand `--atlas` is #0B6E4F, and `--ink` #111 where the brand is #0A0F0D (`kiwi-order.html:43-70`). The guest pages drift from the brand silently.
2. **Zoom disabled.** `maximum-scale=1` on all three pages, plus `user-scalable=no` on two (`kiwi-order.html:7`, `OrderPro.html:7`, `cafe-atlas-qr.html:5`). This fails WCAG 1.4.4 on the one surface used by the public, including older guests reading small menus.
3. **Hidden things painting.** Parked sheets cast shadows, the greeting ghosts through and passes taps, and the back button sits on the title. Off-screen and hidden states are not designed; they are just moved.
4. **Screen-reader layer is French and stateless.** aria-labels are hard-coded French ("Langue", "Retour", "Clavier numérique", "Effacer", "Pas de pourboire", `kiwi-order.html:2596, 2642, 2658, 2670, 2954`) and never translated. There are 0 `aria-pressed` or `aria-checked` attributes, and sheets have no `role="dialog"` or `aria-modal`.
5. **Small, mono-heavy type.** 27 sizes, mostly 11 to 13 px. Mono is used for prices, nutrition, eyebrows and totals on a consumer surface.
6. **Three primary-button styles.** Black (Continue, cart pill), green gradient (Add, Place order) and black pill (poster). The gradient's light end fails contrast.
7. **Haptics and reduced motion.** `navigator.vibrate` is the only haptic, so there is none on iOS. `prefers-reduced-motion` covers only the greeting (`kiwi-order.html:218`). Screen slides, sheet springs, `digit-pop` and `add-pop` (scale 1.25) all ignore it.
8. **Phone layout everywhere.** No breakpoint above 360 px, so iPad and desktop frames are a phone UI stretched to full width.
