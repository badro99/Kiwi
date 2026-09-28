# Kiwi Pro on iPhone, held to the Revolut standard

Date: 2026-09-28. Scope: the Capacitor app (`app/`) on an iPhone 17 Pro simulator
(iOS 26.5, 402×874 pt), in all four roles, light and dark. The web and iPad layouts
were not changed.

## What makes Revolut feel effortless

These are the patterns behind Revolut's reputation, stated as rules we can check a screen against.

1. **One hero number.** The home answers one question ("how much do I have") with
   a single large figure, its change beside it, and a chart under it. Nothing
   competes with it above the fold.
2. **Surface frequency, bury depth.** The four or five things done daily are
   round quick actions, one tap from home. Everything else is one level down,
   behind "More", and it never rearranges itself.
3. **Standard iOS chrome.** A bottom tab bar with labelled icons, a translucent
   header that owns the status bar, half-height sheets with a grabber, large
   titles on inner pages. It borrows iOS rather than inventing its own.
4. **Lists, not tables.** Every collection is a row: a round leading glyph, a
   title and a subtitle, and the amount and date on the trailing edge, separated
   by hairlines inside one rounded group.
5. **Grouped cards on a tinted ground.** Cards have no borders, a 20 to 24 pt
   radius and almost no shadow. Labels are quiet (13 pt, secondary) and the
   number carries the weight.
6. **One primary action per screen, pinned where the thumb is.** Onboarding is
   full-bleed, with a big title and a capsule button at the bottom, never a form
   inside a card.
7. **Motion confirms, it doesn't decorate.** Buttons compress on press and
   segmented controls slide. Haptics fire on the important taps.
8. **It follows the phone.** It follows the system appearance and Dynamic Type,
   no text sits under the Dynamic Island, and the status bar is always legible.

## Diagnostic before this pass

| # | Surface | Finding | Rule |
|---|---|---|---|
| 1 | Owner dashboard | The page scrolled visibly behind the clock: the sticky header parked 62 pt down, leaving the status-bar strip uncovered. | 3, 8 |
| 2 | Owner dashboard | The first card was empty: a PDF button over date pills, because the native layer hides the page title. Revenue sat below the fold. | 1 |
| 3 | Owner dashboard | The bottom bar was a lone "More" capsule, and navigation was a web hamburger drawer. | 2, 3 |
| 4 | Owner dashboard | The revenue chart was drawn 620 units wide and scaled to 60 %, so its hour labels were 7 px with a blank band under the curve. | 1 |
| 5 | Owner dashboard | English 7-day chart showed French weekdays ("Sam 18 … Ven 24"). | 8 |
| 6 | Owner pages | Orders and Clients were desktop tables cut at the right edge ("MONTAN…", email truncated). | 4 |
| 7 | Owner pages | Uppercase tracked eyebrows, teal inset borders and a neon mint "Nouveau client" button, next to calmer cards. | 5 |
| 8 | Full menu drawer | The Kiwi logo sat under the clock. | 8 |
| 9 | Native setup | A paper card on an ink stage, with a "Step 1" of 5 progress bar shown before sign-in. It was a web form inside a native app. | 6 |
| 10 | Setup to dashboard | Three visual languages in a row: dark native setup, then a light web onboarding card, then a light lock card. | 3, 6 |
| 11 | Dashboard gates | The tab bar showed over the first-run questions. The status bar was white on the light lock and onboarding. | 3, 8 |
| 12 | Dashboard lock | The code keyboard covered the help line and the "Enter the demo" link. | 6 |
| 13 | Till | The cart was a flat "2 items   85 MAD   ^" shelf with no weight. | 6 |
| 14 | Till | Tiles repeated an uppercase category and a 17 pt green bold price, and two-line names clipped their price. | 5 |
| 15 | Till | The opening float wrapped into three chips plus an orphan "Other". The clock was set in 800 weight. | 5 |
| 16 | Tab bar | Active labels dropped 2 pt (the filled symbol is taller), and there was no room for five tabs. | 3 |
| 17 | More sheet | Full-height sheet with an empty lower half. | 3 |

## What changed

- **Owner home** (`app/src/native-runtime.{css,js}`, phone widths only):
  - Revenue is now the hero, with the chart under it.
  - The period is an iOS segmented control.
  - Four round quick actions (Day report, Invoicing, Export, Customize) each click the dashboard's own control.
  - The figures sit in grouped cards on a tinted ground.
  - The header owns the status-bar strip on every page.
  - The theme follows the system until the owner picks one with the moon button.
- **Native tabs:** Home, Orders, Report, Clients, More. They follow the page, inner pages get a large title, and More opens the full menu or the account actions in a half-height sheet.
- **Lists:** orders and clients become Revolut-style rows at phone width.
- **Chart** (`assets/dateRange.js`):
  - It draws at the phone's real width, and hour ticks thin out until they no longer touch. Desktop is unchanged.
  - Weekday ticks are translated at paint time.
- **Native setup** (`KiwiNativeShell.swift`):
  - A full-bleed ink stage with a big title, dark filled fields, round-icon role rows and a paper capsule primary button pinned at the bottom.
  - Placeholders are readable, and there is no "Step 1" eyebrow before sign-in.
- **Gates:** the first-run questions and the lock are full-screen stages matching the native setup. The lock is top-aligned above the keyboard. The status bar follows their theme.
- **Till:**
  - The cart is a floating ink "Voir la note" pill with a mint count badge and the live total.
  - Tiles show the name first and the price second, never clip, and compress on press.
  - The title is a large title, the opening float is one row of capsules, and the clock uses a 600 weight.
  - The X on the open bill folds the sheet. In takeaway it used to empty the order, so a glance back at the menu lost the sale. Emptying is now an explicit "Vider la commande" under More actions.

Guarded by `tools/native-owner-home-browser-test.mjs` (26 checks, wired in
`tools/check.js`). It fails on the previous commit.

## Still open, in priority order

1. **Code entry:** the dashboard code uses the system keyboard and its accessory bar. A native keypad, as Revolut uses for its passcode, would remove both.
2. **Bill sheet:** the bill sheet still stacks three full-width buttons ("Send to kitchen", "Card", "Take payment") plus "More actions". Revolut would show one primary action with the rest in a menu.
3. **Kitchen and Team roles:** neither has had this pass yet.
4. **Demo data:** the demo hero delta and the goal card disagree ("−16 % vs yesterday" beside "+3.2 % vs yesterday"). That is demo data, but an owner reading it would lose trust.
5. **Order row glyphs:** order rows use one generic payment glyph. Per-method glyphs (card, cash, QR) would match Revolut's merchant logos.
