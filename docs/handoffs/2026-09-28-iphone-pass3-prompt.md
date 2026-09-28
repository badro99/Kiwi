# iPhone pass 3: execution prompt

You are the execution agent for the Kiwi Pro iPhone app (Capacitor 8, bundle `com.kiwios.pro`,
source in `app/`). A separate tester is running the app on the iPhone 17 Pro Max simulator and
reporting what it sees. Your job is to fix everything below, verify each fix on your own
simulator, and ship. The bar is App Store review and launch day: a reviewer must never get
stuck, never see French or developer text on an English phone, and never see numbers that
contradict each other.

## Read first
1. `CLAUDE.md` (repo root), especially §1 on pushing to both mirrors, §3 on stamps, §4 on
   brand, and §6 on tenant safety and the demo and Amira Cafe code exception.
2. `docs/audits/2026-09-28-simulator-qa-findings.md`. The section "Retest of `f922df3f`" is
   the current state. Earlier sections give background and file pointers.
3. `docs/handoffs/2026-09-28-iphone-million-dollar-pass.md` for the toolchain, the design
   standard and the motion rules.

## Hard rules
- Use the iPhone 17 Pro simulator (D53BB4E4-F195-41EF-8DE2-9F74BAEADC62). Never install on
  the Pro Max (CFFD750C…); that is the tester's device.
- Build: `node tools/build-app-www.mjs && (cd app && npx cap sync ios)`, then
  `git checkout app/ios/App/CapApp-SPM/Package.swift`, then xcodebuild with
  `CODE_SIGNING_ALLOWED=NO`.
- Stage specific paths only. Never use `git add -A`, never stage `* 2.*` files, never
  force-push, and never leave anything staged.
- Commit as `<scope> · <what>` with the `Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>` footer. Push `main` by URL to both
  `https://github.com/zaka33333-hash/Kiwi.git` and `https://github.com/badro99/Kiwi.git`.
- Brand: no italics, no em dashes in user-facing copy, Material Symbols only, no bold
  display weights, mint at most 5 %, and primary buttons in atlas `#0B6E4F`, not ink.
- Demo surfaces and Amira Cafe are test accounts, so you may enter their codes through the
  UI. Never print, log or commit any code. Do not touch other merchants (Santos Store is
  real).
- `node tools/check.js` must be green before every push. Keep
  `tools/native-owner-home-browser-test.mjs` and `tools/native-pass2-browser-test.mjs`
  green, and add a check for every fix you make.

## P0: fix first, in this order
1. **Kiwi Team lock screen is a dead end.** Change role → Kiwi Team shows the 4-digit keypad
   with only a refresh button. Add the same "Change role" link the kitchen pairing keypad got,
   calling the same native host action. Apply it to every full-screen gate that hides the tab
   capsule:
   - the Team employee code;
   - the Team "code de la caisse" 6-digit step;
   - the till "Open till" float screen;
   - the dashboard 4-digit lock (which already has "Switch account"; confirm it also reaches
     Change role).

   Then write a test that walks every role and asserts each gate has a visible way out. The
   rule to enforce: any state where `nativeBlockingLayer()` sends `tabs: []` must render an
   exit.
2. **French and Darija on an English phone.** Localise these in EN and AR, driven by the
   app locale rather than `kiwi-employee-language`'s French default:
   - The Team lock: ÉQUIPE, "Bonjour {name}", "Entrez votre code", "VOTRE COMPTE EST CRÉÉ PAR
     VOTRE RESPONSABLE DANS ÉQUIPE".
   - The Team till-code step: "SAISISSEZ LE CODE DE LA CAISSE POUR OUVRIR LE SERVICE",
     "Pointer l'arrivée", "Consulter sans pointer".
   - The Team settings row: "Apparence · Jour · Nuit · Système".
   - The till Refund sheet subtitle ("Khtar la transaction à rembourser, journal d'lyoum.")
     and its placeholder ("Rechercher, table, montant, réf").
   - Client detail Gender "Femme".

   Then grep the till (`kiwi-caisse.html`, `assets/caisse-lang.js`), the Team
   (`kiwi-serveur.html`) and the native runtime for any remaining hard-coded FR strings
   reachable on iPhone, and fix those too. Verify EN, FR and AR (RTL) on device.

## P1: a reviewer would notice
3. **Demo numbers must agree.** They should come from one source for the same day:
   - Home shows 30 868 MAD / 207 orders; Orders shows 49 895 MAD / 214 orders.
   - The Report tab says "No sales that day" for Today and Yesterday, with a 0 MAD 14-day
     strip.
   - At 12:00 the Orders list shows today's orders at 00:00 and 23:44. Timestamps must be
     before "now" and inside the 5 h business day.
   - The till drawer says "Menu 0" while 35 items are listed.
   - Kiwi Team's week strip shows scheduled hours, yet "Schedule & requests" says 0 shifts
     and "My upcoming shifts · Nothing to show".
   - A VIP client with 31 visits and 11 780 MAD spent says "No purchase details recorded".

   Seed consistent demo history for the Report and client purchase history.
4. **Remove developer text:** "demo clock sync · refresh 3s" under Today's volume.
5. **Order rows must open an order detail sheet:** items, payment, time, table, staff, plus
   refund and print actions. Stop the 3 s poller from rebuilding the list under the finger;
   see CLAUDE.md §5 on rendering under a poller.
6. **Client detail:** make it a bottom sheet with a grabber and one close control, not a
   centred card with both X and Close. Add these changes:
   - make the phone number tappable (tel:) and add WhatsApp and email actions;
   - format the birthday with the locale ("14 March 1988");
   - use thousands spaces on every amount (11 780 MAD).
7. **Delete my account in the demo:** it must not open with "The request could not be
   recorded." Explain that deletion applies to a signed-in real account, with a Sign in
   button. On a real account, verify end to end on Amira Cafe that the request is recorded
   and the confirmation is clear. App Review guideline 5.1.1(v) requires this to work.
8. **Refund search:** don't auto-focus it, turn off auto-capitalisation, and remove the
   square focus rectangle inside the rounded field. The WKWebView accessory bar (up, down,
   check) still appears on till inputs. Hide it app-wide, not only on sign-in.
9. **Header strips:**
   - The onboarding welcome logo sits in a flat grey rectangle.
   - The status-bar strip is a solid colour that doesn't match the gradient on the
     onboarding and Kiwi Team screens.
   - Team has a ~60 pt empty band above its header when scrolled.

   The status-bar area should continue the page background.
10. **Team lock greets "Bonjour Yassir" on a fresh install.** Show the venue until an
    employee is known, and add "Not you? Switch employee".
11. **Kitchen keypad:** disable Confirm until 6 digits are entered, or shake the dots with a
    haptic when it is pressed early. Add a backspace key.
12. **Sign-in:**
    - clear the error when the user edits a field;
    - outline only the field that is wrong;
    - add a "Forgot password?" link to the existing reset flow, opened in an in-app browser
      sheet.

## P2: polish
- Replace filled ink buttons with atlas: "New customer", "Request leave", till "View bill".
- Till category labels use terracotta and amber, which are outside the palette. Use
  neutral labels, or the atlas and riad tints.
- Orders list:
  - the "Cash ·" label ends in a dangling separator;
  - amounts show no currency;
  - the nav says "Clients" while the heading says "Customers". Pick one.
- Till open screen: remove the orphan leading dot in "· merchant edition".
- Till drawer:
  - "Leave" and "End of shift" share an icon;
  - the "TILL ID" pill does nothing visible;
  - the Kitchen printing badge is a lone mint dot.

  Give each drawer item its own icon and a clear state.
- The owner avatar "RB" is mint on near-white and fails contrast.
- Motion: every sheet should rise with the brand spring, keypad dots should fill with a
  spring, and success and error should use `UINotificationFeedbackGenerator` haptics via the
  bridge. Respect Reduce Motion.

## App Review pack (write it, don't just fix code)
- Write `docs/ops/app-review-notes.md`. It should explain:
  - how a reviewer reaches each role's demo (Dashboard → Enter the demo; Till; Kiwi Team
    with any 4-digit code; Kitchen);
  - how to change role;
  - where to find Delete my account.

  Leave a placeholder where the owner will paste a reviewer login. Never write the password.
- Confirm Info.plist has localised EN, FR and AR strings for every permission, including
  `NSMicrophoneUsageDescription`.
- Either lock iPhone to portrait in Info.plist, or test landscape on every role and fix it.
- Check that no subscription price ("399 MAD/mois") is visible anywhere in the iOS build
  (guideline 3.1.1).

## How to work
- Work in a worktree off the latest `main`. Pull with rebase before every push.
- After each P0 or P1 item: build, install on your simulator, tap through the exact path in
  the findings, take a screenshot, then commit and push. Small commits, one concern each.
- When done, append a "Pass 3 result" section to
  `docs/audits/2026-09-28-simulator-qa-findings.md`. For every item above, list it as fixed
  (with the commit and how you verified it), deferred (with the reason), or not reproducible.
  Then report back in plain words. The tester will retest on the Pro Max.
