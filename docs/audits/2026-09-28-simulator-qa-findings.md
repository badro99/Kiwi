# iPhone simulator QA: findings for the execution agent

Date: 2026-09-28. Device: iPhone 17 Pro simulator (iOS 26.5, 402 × 874 pt), build of
`main` @ `00ef8a83`, fresh install. English system language, light mode unless noted.
The tester only taps and reports; the execution agent fixes. Each item says where it lives and
what "done" looks like. P0 blocks launch or review. P1 would be noticed by a reviewer or on
day one. P2 is polish.

## P0

1. **The last onboarding step cannot be scrolled, so the user is stuck.** Dashboard role, then
   "Get started", then the "Team access" step (6/6). The page is taller than the screen
   (three code cards), and swiping does nothing, so Continue and Back are unreachable. Only a
   force-quit gets out.
   - Cause: this is a regression from `1b5569ed`. `app/src/native-runtime.css` sets
     `.kob-body{overflow:visible}` and `.kob-card{max-height:none;min-height:100%}`. The
     original scroller is `.kob-body{overflow-y:auto}` inside a max-height card
     (`assets/onboarding.js:188`), and the fixed `.kob-root` never scrolls.
   - Fix: make `.kob-root` the scroller in the native rules
     (`overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain`), or
     restore `.kob-body{overflow-y:auto}` with the footer pinned.
   - Add a test: on every onboarding step at 402 × 874, `.kob-foot .kob-btn.primary` must be
     reachable (scrollable into view, then clickable).
2. **Sign-in gives no feedback when fields are empty or the email is invalid.** In native
   setup, Sign in (and the keyboard's Go) does nothing, with no message, no shake and no
   disabled look.
   - Cause: `KiwiNativeHostAction('login')` in `app/src/native-shell.js:623` calls
     `login.requestSubmit()` on the hidden web form. HTML constraint validation blocks it
     and shows its bubble on the hidden web page.
   - Fix: validate before submitting. Push an inline status ("Enter your email and
     password." / "Enter a valid email address.") into the native context. Also mark the
     field (the red ring the web form already has), and send a warning haptic.
3. **The onboarding steps also give no feedback.** "Tell us about your business" with an
   empty name: Continue is silently ignored. Same fix: an inline message under the field,
   the field ringed, and a warning haptic.

P0-4. **Tapping the mic in the AI box will crash the app on a real iPhone.** `assets/agent-voice.js:117`
   calls `getUserMedia({audio:true})`, and Info.plist has no `NSMicrophoneUsageDescription`.
   iOS kills an app that touches the mic without it (the simulator does not enforce this; it
   silently showed a "recording" state). A reviewer tapping the mic means an automatic
   rejection. Add `NSMicrophoneUsageDescription` (and `NSSpeechRecognitionUsageDescription`
   if speech recognition is used) in FR/EN/AR, and check the other `getUserMedia` callers
   (`pos-boutique.js`, `pos-maison.js`, `pressing-caisse.js`, `retail-scan.js`: the camera
   string exists, the mic string does not). Then verify on a physical device.
P0-5. **Taps on the native tab bar also reach the page underneath.** On Home, the Gross margin
   KPI card sits under the tab capsule; tapping the Clients tab selected Clients *and* opened
   the "Gross Margin" sheet. Make the web content under the capsule non-interactive (or
   stop the touch in Swift) so a tab tap never clicks through.

## P1

4. **"Explore the demo first" lands on the 4-digit code screen.** The demo is then behind a
   small grey "Enter the demo →" link. An App Store reviewer will read this as "the demo
   needs a code". Explore should go straight into the demo, or the lock screen should make
   "Enter the demo" a real secondary button. Put the demo path in the App Review notes as
   well.
5. **When the keyboard opens, onboarding content scrolls under the status bar.** The Kiwi logo
   collides with the clock and the progress bar sits over the battery icon. This happens on
   the name, business, locations (auto-focus) and team-codes steps. Give the status-bar
   strip a backdrop (as on the owner home header), or keep the header fixed and stop the
   page from shifting when the keyboard opens.
6. **Optional fields are auto-focused.** "Main city · optional" and the already-filled owner
   name on Team access get the cursor, so the keyboard covers Continue. Only auto-focus a
   required, empty field.
7. **The web keyboard bar (^ v ✓) shows on every onboarding field.** It gives away that the
   screens are a web page. Hide the WKWebView input accessory bar (Capacitor Keyboard
   `setAccessoryBarVisible(false)`, or the WKWebView input accessory override), and rely on
   Return moving to the next field, which already works.
8. **There is no way back out of onboarding.** Once Dashboard is picked, the welcome screen
   offers no route back to the role picker ("Change role"), and the edge-swipe gesture does
   nothing on any step. Add a leading back control on the welcome screen that returns to
   role selection, and support the edge swipe as Back on the steps.
9. **The sign-in "Done" keyboard button sits on top of the password eye.** When the keyboard
   is up, the floating Done capsule covers the show-password toggle, and the Sign in button
   is hidden behind the keyboard. Either the primary button should ride above the keyboard
   (`safeAreaInset(.bottom)`), or the Done toolbar should go (Return already moves the
   focus).
10. **The "Choose a role without setup" touch area is only the text.** A tap about 10 pt
    above the text does nothing. It needs a 44 pt hit area (`.contentShape`, plus padding).
11. **There is no "Forgot password?" on sign-in.** It is expected on any sign-in screen, and
    it gives stuck owners a way forward. Link to the existing web reset flow.
12. **The permission prompts are French-only.** Camera, Face ID and local-network strings in
    Info.plist have no `en.lproj`/`ar.lproj` `InfoPlist.strings`. An English reviewer sees
    French. Localise all three.

13. **The keyboard shifts the whole page under the status bar, everywhere.** In onboarding,
    Clients search and more, the fixed header slides under the clock when the keyboard
    opens. `@capacitor/keyboard` is not installed. Add it with `resize: 'native'` (or
    `'body'`) and the accessory bar hidden. That one change should also close items 7 and 8
    in this section.
14. **The native tab bar stays on top of web sheets** and covers their bottom buttons:
    - Notifications ("Mark all as read");
    - the Gross Margin sheet ("Close" / "View cost of goods");
    - the client detail ("Close").

    Hide the capsule while a sheet or drawer is open (`nativeBlockingLayer()` must see
    these), or pad the sheets by `--kiwi-host-tab-height`.
15. **The demo numbers contradict each other across tabs:**
    - Home today: 25,411 MAD and 172 orders.
    - Orders today: 42,879 MAD and 189 orders.
    - 7 days: hero 152,112 vs goal 198,400 vs payment mix 134,700 vs channel sum 198,399.
    - The 7-day axis ends "Fri 24" when today is Mon 28.
    - The Report tab says "No sales that day".

    A reviewer or prospect loses trust immediately. Derive every demo figure from one
    seeded ledger, dated relative to today.
16. **The Report tab is empty in the demo.** It is one of five main tabs. Seed it from the
    same demo ledger (CLAUDE.md notes it reads a different source, which is fine on the web
    but not for a main native tab).
17. **Order rows do nothing when tapped,** and the list re-renders every 3 s under the
    finger. Rows need a detail sheet (items, payment, time, receipt/refund actions), and the
    poller must not rebuild rows while a touch is in progress.
18. **The delete-account sheet opens already showing "The request could not be
    recorded."** In the demo it should say "Sign in with the owner account first." (the
    string exists in `nativeAccountDeletion`). For App Review, provide a real test account
    where deletion works end to end (guideline 5.1.1(v)).
19. **A subscription price is shown in the app:** "Abonnement Kiwi Pro · 399 MAD/mois · tout
    inclus" on the Home payment-mix card (in French in the EN UI). Apple's in-app purchase
    rules (guideline 3.1) make showing a price for a subscription sold outside the app a
    common rejection. Hide pricing and subscription copy in the native build.
20. **Developer text is visible:** "demo clock sync · refresh 3s" under Orders' volume card,
    in low-contrast mint. Remove it.
21. **Untranslated French in the EN UI:**
    - "Objectif · 7 days" and "101 % atteint" (Home goal card);
    - "Femme" (client detail);
    - "Abonnement … /mois" (Home payment-mix card).

    Sweep with `tools/check.js` i18n coverage for these nodes.
22. **The client detail is a centred card, not a bottom sheet.** It also has no actions (call,
    WhatsApp, edit), shows the birthday raw as `1988-03-14`, and says "31 visits · 11,780
    MAD" beside "No purchase details recorded".

## P2

13. The sign-in field placeholders repeat their labels ("Email" / "Email"). Use examples
    instead (`name@business.ma`).
14. After the keyboard closes on sign-in, the page stays scrolled up by about 15 pt until the
    next layout. It should settle back.
15. The onboarding "‹ Back" is a typed character. Use a chevron icon. "Skip" sits next to
    Back at the bottom left; iOS puts Skip at the top right.
16. The "+ More types (13)" dashed button reads as a web control. Make it a tonal capsule.
17. The locations stepper: "−" does not look disabled at 1, and the line "Just one today?
    Perfect." does not change at 2+.
18. Copy: "You included." should be "Including you." (a literal translation).
19. The team-codes step:
    - the all-caps "REQUIRED" badge uses a beige that is not in the brand palette (make it
      sentence case, in brand colours);
    - every card repeats "Name (e.g. Salma)";
    - the role picker is a web `<select>`.
20. The dashboard lock:
    - "Welcome" is set in a heavy display weight, which the brand bans;
    - "MERCHANT DASHBOARD" is an all-caps tracked label;
    - it still uses the system keyboard (already open in the audit as the native keypad).
21. The native setup is always dark, but the dashboard onboarding follows the system theme
    (light), so the flow flips from dark to light mid-setup. Pick one: either the setup
    follows the system, or the web gates go dark to match.

22. Double titles: the header says "Orders" and the large title says "Orders"; likewise
    "Report" / "Daily report" and "Clients" / "Customers". Keep one: a large title that
    collapses into the header on scroll.
23. Orders stacks three filter layers (chips, a Today dropdown, All/Reconciliation/Anti-fraud).
    Collapse them into one control row. Row amounts have no "MAD" and show decimals, unlike
    everywhere else. "Cash ·" has a dangling separator. The demo times read 22:50 while the
    device says 07:44.
24. Number formatting is mixed: "99,698" and "33,897" (comma) vs "152 112" (space), and
    "198 400,00" is the only figure with decimals. Use one formatter for MAD.
25. All-caps labels remain: "VS PREVIOUS 7 DAYS", "TODAY'S VOLUME · LIVE", "KIWI INSIGHTS ·
    MEASURED", "THE LAST 14 DAYS", "FOR YOU", "MARGIN BY CATEGORY", "TO WATCH".
26. Compare has no on state and no legend, and both curves are green. Draw the previous period
    dashed in `--ink-3`, and show the toggle as selected.
27. The fourth channel donut ("OrderPro") wraps onto its own row. Use a 2 × 2 grid.
28. The AI-suggestion notification icon is blue, and the QR payment segment is brown/orange:
    neither is in the brand palette.
29. The Report footer (ICE number · Kiwi Pro 1.0 (3) · Help centre) sits under the tab capsule.

## Till role (Pro Max, 440 × 956 pt, build `kiwi-pass2`)

- **T1 (P1) · Several till screens are still in French in the EN UI:**
  - the waiting-list form ("File d'attente", "Nom du client", "Combien de personnes?",
    "Préférence d'installation", "Intérieur", "Peu importe");
  - the waiting-list card ("2 pers.", "Attabler", "Retirer", "à l'instant");
  - the drawer's theme toggle, which becomes "Mode jour" once Night mode is on;
  - the takeaway history header "HISTORIQUE · DATE DE REMISE INCONNUE";
  - the refund search placeholder.

  The refund subtitle mixes Darija and French: "Khtar la transaction à rembourser, journal
  d'lyoum."
- **T2 (P1) · Till modals are centred cards, not bottom sheets:** waiting-list add, Refund,
  and Till authorisation. On a phone they should be bottom sheets with a grabber and
  swipe-to-dismiss, and the keyboard must not hide their buttons (waiting-list Add/Cancel
  sat under the keyboard).
- **T3 (P1) · Refund auto-focuses its search.** The keyboard covers the transaction list you
  came to pick from. Don't auto-focus. The field also shows a square focus ring inside its
  rounded shape.
- **T4 (P1) · The Till tools drawer is a web left panel, not iOS.** It has an orphan
  "Open drawer" tile alone on its row, and a "Menu 0" badge while the menu has 35 items.
  "Kitchen printing" carries a "·" badge, and "Leave" and "End of shift" share an icon. On a
  phone it should be a grouped list sheet.
- **T5 (P2) · The "Till authorisation" keypad** (cancel table) uses square keys, in a different
  style from the new round passcode keys, and shows "LOCAL DEMO · ANY CODE WORKS" in caps.
  Its subtitle is French ("Annuler la table T22").
- **T6 (P2) · An empty table bill** shows "Take payment" as the primary action at 0 MAD. It
  should be disabled, or the primary should be "Send to kitchen" until items exist.
- **T7 (P2) · Takeaway board cards use a mint left accent bar.** That is the "accent rail on
  rounded card" pattern the brand audit calls an AI tell. Use a status chip only. Order
  51 shows "Ready · Paid" but still sits under "In progress".
- **T8 (P2) · Floor plan:** the list rows are fine. The "1st floor" pill uses a superscript
  "st" that renders oddly, and the "5 / 9 occupied" footer has a leading "·".

Verified OK on the till: clock-in with an "Other" float (it gets a decimal pad), Floor
list and open table, the table bill sheet, Waiting list add/remove, Refund list, and Night
mode toggles the whole till to dark. The status bar follows the theme.

## Verified OK

- Fresh install shows the splash, then sign-in. There is no crash, and no white flash between
  them.
- The email field uses the email keyboard with no auto-capitalisation. Return moves to the
  password field, and Go submits.
- Onboarding: Back keeps the entered values, the progress bar advances, and the revenue
  target gets a decimal pad.
- The stepper clamps at 1 and pluralises.
- Relaunching mid-onboarding returns to the welcome screen, not to a stuck step.
- The role picker lists all four roles with round icons and chevrons.
- The till bill: X folds the sheet and keeps the order, and the draft survives an app
  relaunch.
- The kitchen pairing keypad renders as an iOS passcode pad. Codes were not entered.
- The owner home, notifications (swipe down dismisses), Compare, period switching, Clients
  list, search and dark-mode toggle all work in the demo. The More sheet includes "Delete my
  account".
- A mid-session "crash" was actually the execution agent reinstalling the app on the same
  simulator (runningboard: `installcoordinationd`). **The tester now uses the iPhone 17 Pro
  Max simulator (CFFD750C…) so installs don't collide. The executor keeps the 17 Pro.**

## Not tested yet (next tester pass)

- Code-gated flows. The tester does not type codes into a build that talks to the live
  server. Two options: point the app at `npm run dev` (local wrangler) and use Amira Cafe
  (the owner-designated test account, CLAUDE.md §6), or have the owner type the code.
