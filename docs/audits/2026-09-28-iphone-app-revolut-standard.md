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
  - The X on the open bill folds the sheet. In takeaway it used to call `clearCart()` directly, so a glance back at the menu lost the sale, and it also skipped the staff-code check that guards "Vider la commande". Emptying now only goes through that guarded button under More actions.
  - The open bill is a real sheet: a scrim dims the menu and folds the sheet on tap, and the sheet has a 24 pt top edge. It has one filled capsule, "Encaisser · 80 MAD". Card is tonal, the kitchen send is a tonal capsule under it, and "Autres actions" is a quiet text link.

Guarded by `tools/native-owner-home-browser-test.mjs` (27 checks, wired in
`tools/check.js`). It fails on the previous commit.

## Still open, in priority order

1. **Code entry:** the dashboard code uses the system keyboard and its accessory bar. A native keypad, as Revolut uses for its passcode, would remove both.
2. **Kitchen and Team roles:** the Kitchen pairing keypad is now an iOS-passcode keypad (round keys, hollow dots that fill with a spring, one filled Confirm). The kitchen production screen and the Team role still need the full pass. See `docs/handoffs/2026-09-28-iphone-million-dollar-pass.md`.
3. **Demo data:** the demo hero delta and the goal card disagree ("−16 % vs yesterday" beside "+3.2 % vs yesterday"). That is demo data, but an owner reading it would lose trust.
4. **Order row glyphs:** order rows use one generic payment glyph. Per-method glyphs (card, cash, QR) would match Revolut's merchant logos.

## Pass 2 · review and execution checklist

Implementation baseline: `00ef8a83`, reviewed 2026-09-28. Later documentation-only
upstream findings were fast-forwarded through `38ada0a9`. The supplied handoff predates the
Kitchen pairing keypad commit; preserve that implementation. Work is isolated
in `codex/kiwi-ios-review`, fast-forwarded from the clean attached checkout.
No merchant credentials, PINs, pairing codes or real transactions may be used.

Evidence labels: **pending**, **browser** (local bundled demo), **simulator**
(installed iOS build), **code** (not exercised), **gated** (requires human).
These labels are not interchangeable; a build is not App Review acceptance.

| Surface / checks | Before | Pass 2 status |
|---|---|---|
| Setup: four roles, entry/back, validation, loading, keyboard, safe areas | Full-bleed native setup exists | browser: FR/EN/AR empty/invalid native login gives inline host status without auth requests; release interaction suite; device keyboard retest pending |
| Owner lock: accessible keypad, no system keyboard, demo entry remains reachable | System keyboard obscures secondary controls | browser FR/EN/AR × light/dark; simulator initial gate observed; no code entered |
| Owner home: period/chart, report/invoice/export/customize, demo delta consistency | Demo comparison sources disagree | browser: comparisons agree, four actions survive locale hydration, report forwarding and chart geometry; simulator home observed, not tap-tested |
| Owner Orders: filters/search/detail, cash/card/QR rows | Generic payment glyph | browser: semantic glyphs and rows; full detail/filter interaction matrix not repeated |
| Owner Report, Clients: PDF, list/detail, new/open/cancel | Phone rows exist | browser Clients navigation/rows; PDF sharing and create/cancel remain device checks |
| Owner More: destinations, theme/language, sign-out/delete open/close only | Native account sheet exists | code/bridge tests; all destination sheets not manually walked |
| Till: demo clock-in, floor/list/table, takeaway/menu/search, waiting | Demo path exists | browser demo clock-in/takeaway/products; exhaustive floor and waiting interactions not repeated |
| Till: bill, cash/card/split/discount/transfer/merge; kitchen send | X folds rather than clears; retain regression | browser bill/scrim/total/More/X retains two items; protected settlement remains gated |
| Till More: refund/drawer/team/menu/end shift/printer | Code-gated actions must remain gated | code/bridge tests; no protected actions executed |
| Till scroll beneath capsule; sheets, keyboard, safe area | Main bottom padding reserves a solid band | browser: 0 parent bottom padding, scroller inside viewport, 126px empty-cart clearance; sheet grabber 44px |
| Kitchen: pairing empty/error, key geometry/haptics; production cards/timers/bump/recall | Pairing keypad already styled | browser gate and Change role exit without code; script-free production fixtures show all queues and long tickets; live bump/recall gated; haptics code-only |
| Team: sign-in, floor, schedule, attendance/clock-in/out | Native host publishes only More | browser gate inherits native EN/AR locale; isolated adapter fixture verifies Tables/Menu/Notifications/Profile/More; planning/attendance remain authenticated device checks |
| FR/EN/AR RTL; light/dark; empty/populated/long/error/offline | Existing owner FR/EN guard only | Owner six combinations; Kitchen/Team script-free geometry fixtures FR-light/EN-dark/AR-dark; no claim of translated fixture content or complete state matrix |
| Large text, portrait/landscape/iPad, 44pt targets, contrast, VO labels | No complete evidence matrix | small Owner gate 320×568 at 1.35 scale; existing 21 device layout controls; no full contrast/VoiceOver or physical AX5 sign-off |
| Motion: reduced-motion, press, sheet dismiss, tabs, chart, success | Mixed web/native implementations | reduced-motion keypad/indicators/sheets; native selection guard; finger-tracking, pull-refresh, edge-back and success choreography not added or device-certified |
| Build, focused guards, full check, mirror equality | Not run for this pass | iOS Debug build/install green; full final frozen-source gate green with one existing style warning; mirror publication recorded in artifact handoff |

Simulator is booted, but the currently exposed computer-control surface does
not list Simulator (`getApp("Simulator")` returned Invalid app). Build/install
and screenshot evidence will be reported separately from interactive checks.

### Pass 2 changes and evidence

- Owner: compact round keypad and hollow indicators, screen-reader digit-count
  announcement without exposing digits, hardware-keyboard support, empty delete,
  original verification handler preserved. Delete glyph inherits the readable key
  foreground; title stays at 600 and the demo entry is a distinct tonal button.
  No Swift/host payload contains a PIN.
  The hosted demo link remains hidden. The keypad is a **native-container web
  control**, not a new Swift authentication implementation.
- Demo: both live comparison cards now use yesterday at the same simulated
  time and snapshot. Percentage updates no longer animate out of step, and
  number animation respects reduced motion. This fixes TODAY only, not the
  wider cross-tab/historical demo-ledger inconsistencies. Real sales and
  reconciliation branches were not changed. Goal labels
  follow FR/EN/AR. Arabic numeric runs are isolated from surrounding RTL text.
- Home actions remount after delayed locale layout hydration. Period buttons
  meet 44px; long action labels can wrap. Native Owner labels update with locale.
- Orders: closed-set cash/card/QR/other metadata chooses vendored Material
  Symbols. QR and backspace SVGs are unmodified Google Outlined assets covered
  by the existing Apache 2.0 license.
- Till: remove the parent's solid reserved band and the extra viewport-height
  shell below the status inset; keep end clearance within the scrolling grid.
  The expanded bill's dismiss grabber is 44px; X still never clears a sale.
- Kitchen: pairing hides native navigation; status text follows the light/dark
  production surface; pairing stays ink. On phones, all three queues stack
  instead of silently hiding preparation below 600px. Haptic hooks added for
  pairing taps/error. A 44px Change role link exits the unpaired screen without
  a code; no pairing request was made during this pass.
- Team: reuse existing four web routes in the Swift capsule, plus More. Hide
  duplicate web tabs only on the hosted phone main screen; keep code and detail
  gates clear. Native locale seeds the first visit without overriding a saved
  employee/venue preference. Existing profile owns planning/attendance, no
  invented routes.

The subsequent simulator report supplied additional defects; these changes
were validated locally rather than marked device-accepted:

- Onboarding: the outer gate scrolls, including a long step 6 with added blank
  team rows. Continue and Back are reachable; no code or final creation is used.
  A sticky header plus status-strip backdrop stays below the safe inset.
  Only required empty name/business fields autofocus. Empty business name now
  produces an inline alert, field annotation and error-haptic request.
- Native sign-in: validate empty/invalid email before calling the hidden form's
  native constraint validation. Publish translated error status and annotate
  the fields. The password remains empty in these checks; no auth request fires.
  The Done toolbar is restricted to printer fields, avoiding the password eye.
- Microphone/speech usage purposes added. Camera, Face ID and local-network
  purposes also localized in FR/EN/AR and compiled into the app. This is bundle
  evidence only; actual iOS permission prompts need a physical-device check.
- Shared modal/drawer backdrops now hide the capsule. A transparent hit shield
  at the capsule's exact published footprint absorbs web touches below it and
  hides with it. Browser hit-testing and real browser touch are covered; final
  native-device click-through regression acceptance remains pending.

Local evidence directory:
`/Users/zaka/.codex/artifacts/kiwi-iphone-pass2-2026-09-28/`.
`owner-*.png` are local bundled browser demos; `team-fixture-*.png` and
`kitchen-fixture-*.png` are **script-free synthetic geometry fixtures** (not
authenticated product flows and not translation acceptance). `till-grid.png`
is the local demo. `kiwi-pass2-simulator-final.png` is an earlier observed installed
iPhone 17 Pro demo home with the native capsule; this session did not tap its
controls. `kiwi-pass2-simulator-lock-release.png` captures the final installed
lock screen. Do not infer a tapped navigation sequence from either screenshot.

Focused results: 147 Pass 2 browser controls; 40 native workspace controls;
21 device layout controls; 7 native bridge controls. The existing Owner/Till
suite was extended with computed scroller geometry. Debug iOS build succeeded
with signing disabled, installed and launched on the booted iPhone 17 Pro. The compiled FR/EN/AR privacy resources were linted, and
compiled runtime JS/CSS and setup JS match the edited sources byte-for-byte.

Full-gate investigation: the first run failed the immediate reservation-editor
snapshot assertion in `kiwi-ui-qa-mcp-test.mjs`. Both a clean detached baseline
at `00ef8a83` and the working version opened that editor on standalone reruns.
No failure was waived as pre-existing. The test now waits up to five seconds
for the real rendered form, then takes a fresh snapshot and retains its title,
content, negative-assertion and real-click checks. A second run caught the demo
comparison being sampled while one card animated. The implementation now uses
one same-time snapshot, updates demo percentages together, and honors reduced
motion; the browser assertion was tightened from 0.11 to 0.01 percentage points.
No failure was waived. Final gate outcome is recorded below when complete.

### Deliberately not certified

This is a completed implementation slice, **not completion of the entire
million-dollar acceptance matrix or App Review approval**. Remaining work:
authenticated Team planning/attendance, Kitchen production bump/recall,
Owner PDF/share and all modal paths, printer/physical haptics, true VoiceOver,
largest system text (the existing runtime still caps scaling at 1.35), full
contrast audit, and the requested new edge-back/pull-refresh/finger-following
sheet/payment-success motion. These require further implementation and/or a
human/device session that can legitimately pass the code gates. No account,
merchant data, sale, customer or credential was created/changed to obtain QA.


### Remaining release blockers from the parallel simulator report

The report at `docs/audits/2026-09-28-simulator-qa-findings.md` remains the
backlog, not an acceptance certificate. Besides the gated checks above:

- Home/Orders/Report/historical ranges still need one coherent demo ledger;
  Report demo emptiness and order-row detail/refresh behavior remain open.
- Keyboard avoidance/accessory behavior needs a device pass throughout; the
  onboarding sticky strip is not a complete keyboard-plugin implementation.
- Full Team/Till translation gaps, centered secondary sheets and drawer polish,
  client-detail actions/history, demo delete-account messaging, native pricing
  presentation and developer-facing demo labels are not certified fixed.
- Kitchen now has an exit, but all other gate/back/forgot-password routes,
  landscape and true largest accessibility size still need the complete sweep.
- No App Store submission, signed archive, review-account lifecycle, physical
  microphone/printer/haptic, VoiceOver or merchant-data acceptance was performed.

The newer repository notes allow designated demo testing, but this execution
kept the supplied handoff's stricter no-code/no-password boundary. No exception
was used to obtain authenticated UI evidence.


### Final validation · 2026-09-28

- `node tools/check.js`: **all checks passed**, no exclusions; one existing
  `background:var(--ink)` debt warning. The final run started after runtime,
  HTML and test changes were frozen. Log: `kiwi-pass2-check-frozen.log` in the
  evidence directory. An earlier complete run also passed.
- Within that gate: native Pass 2 suite green (147 focused controls on the
  standalone final run), native setup 209, Owner/Till 28, workspace 40,
  device-layout 21, host bridge 7. The existing shared-day browser suite passed;
  the handoff's historical failure was not waived.
- Stamp guard: 722 controls, 239 sealed assets. Generated Capacitor Swift package
  path changes restored; no dependency, credential or merchant-data changes.
- Final iOS Debug build succeeded with signing disabled; installed/launched on
  iPhone 17 Pro. Source/bundle equality verified for runtime JS/CSS and setup JS.
  Final lock screenshot is in the evidence folder; interactive native taps and
  physical permission prompts remain unverified.
- This work is a validated implementation slice, not a claim that the entire
  requested every-control/device acceptance matrix is complete.
