# iPhone pass 4: execution prompt

You are the execution agent for the Kiwi Pro iPhone app (Capacitor 8, bundle `com.kiwios.pro`,
source in `app/`). Pass 3 stopped after five items. Your job is to finish everything that is
left, verify each fix on your own simulator, and leave the app ready for App Store review.
The bar: a reviewer never gets stuck, never sees French or developer text on an English
phone, and never sees numbers that contradict each other.

## Read first
1. `CLAUDE.md` at the repo root, especially §1 (push to both mirrors), §3 (stamps and the
   gate), §4 (brand) and §6 (tenant safety, and the demo and Amira Cafe code exception).
2. `docs/audits/2026-09-29-iphone-pass3-status.md`. It is the current state and lists what
   is done, what is open, and what changed since pass 3.
3. `docs/handoffs/2026-09-28-iphone-pass3-prompt.md` for the full wording of every item.
   Where the two disagree, the status audit wins.
4. `docs/audits/2026-09-28-simulator-qa-findings.md` for file pointers and screenshots.

## What changed under you
- There is no More tab in any role. Every role has a header ☰ drawer, and Change role,
  Sign out, Kiwi AI privacy and Delete my account are at the bottom of it
  (`nativeSideMenu`, `mountNativeAccountGroup` in `app/src/native-runtime.js`).
- Light and dark follow the phone (`followSystemTheme`). Do not reintroduce an in-app theme
  toggle.
- The SwiftUI More sheet in `KiwiNativeTabRoot` is unreachable.

## Hard rules
- Use the iPhone 17 Pro simulator (D53BB4E4-F195-41EF-8DE2-9F74BAEADC62). Never install on
  the Pro Max (CFFD750C…); that is the tester's device.
- Build: `node tools/build-app-www.mjs && (cd app && npx cap sync ios)`, then
  `git checkout app/ios/App/CapApp-SPM/Package.swift`, then xcodebuild with
  `CODE_SIGNING_ALLOWED=NO`.
- Work in a worktree off the latest `main`. Rebase before every push.
- Stage specific paths only. Never `git add -A`, never stage `* 2.*` files, never
  force-push, and never leave anything staged.
- Commit as `<scope> · <what>` with the footer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push `main` by URL to both
  `https://github.com/zaka33333-hash/Kiwi.git` and `https://github.com/badro99/Kiwi.git`.
- Brand: no italics, no em dashes in user-facing copy, Material Symbols only (vendor into
  `assets/icons/material/`), no bold display weights, mint at most 5 %, primary buttons in
  atlas `#0B6E4F`, not ink.
- Demo surfaces and Amira Cafe are test accounts, so you may enter their codes through the
  UI. Never print, log or commit any code. Do not touch other merchants; Santos Store is
  real.
- Keep `tools/native-owner-home-browser-test.mjs`, `tools/native-pass2-browser-test.mjs`
  and `tools/native-workspace-ux-test.mjs` green, and add a check for every fix.
- Do not upload to TestFlight. The owner decides when build 7 ships.

## Step 0: make the gate green
`node tools/check.js` is red on `main` before you touch anything.
- `retail-tender-browser-test.mjs` and `retail-acompte-browser-test.mjs` fail on their
  fixture baseline ("maison synthetic baseline has five sales", "fixture baseline"). Find
  the commit that broke them with `git bisect` in a detached worktree. Fix the cause, or
  the fixture if the product change was intended; do not weaken the assertion.
- `maison-caisse-browser-test.mjs` is flaky: it failed twice and passed on the third run.
  Find the race (see CLAUDE.md §5 on rendering under a poller) and make it deterministic.
- Commit these separately, then continue. From here on, `check.js` must be green before
  every push.

## Step 1: regression check of pass 3 items 1 to 5
Items 1 to 5 were committed but never retested, and the menu change landed on top of them.
On your simulator, in English and in Arabic, confirm:
- every full-screen gate (Team employee code, Team till code, till float screen, dashboard
  lock, Kitchen pairing) still shows a working way out now that More is gone;
- no French remains on the Team lock and till-code step, the Refund sheet or client detail;
- Home, Orders and Report agree for today, and Report is not empty;
- Orders shows no developer text, and an order row opens its detail sheet on the first tap.

Fix anything that regressed before moving on. Then grep `kiwi-caisse.html`,
`assets/caisse-lang.js`, `kiwi-serveur.html` and `app/src/native-runtime.js` for hard-coded
French reachable on iPhone. Pass 3 asked for this sweep and did not record it.

## Step 2: open P1 items (pass 3 numbering)
6. **Client detail.** Make it a bottom sheet with a grabber and one close control. Make the
   phone number a `tel:` link, and add WhatsApp and email actions. Format the birthday
   with the locale ("14 March 1988"), and put thousands spaces in every amount
   ("11 780 MAD").
7. **Delete my account in the demo.** It must not end on "The request could not be
   recorded." In the demo, explain that deletion applies to a signed-in real account and
   offer Sign in. On Amira Cafe, verify end to end that the request is recorded and the
   confirmation is clear. App Review guideline 5.1.1(v) depends on this, so it comes first
   in this step.
8. **Refund search.** No autofocus, no autocapitalise, and no square focus ring inside the
   rounded field. Hide the WKWebView keyboard accessory bar (up, down, check) app-wide,
   from the Swift side, not per input.
9. **Header strips.** Remove the grey rectangle behind the onboarding logo. The status-bar
   area must continue the page background on onboarding and Kiwi Team, in both
   appearances. Remove the ~60 pt empty band above the Team header when scrolled.
10. **Team lock identity.** On a fresh install, show the venue instead of "Bonjour
    {name}" until an employee is known, and add "Not you? Switch employee".
11. **Kitchen keypad.** The backspace key already exists. Hold Confirm until 6 digits are
    entered, or shake the dots with an error haptic when it is pressed early.
12. **Sign-in.** Clear the error when a field is edited, and outline only the wrong field.
    Add "Forgot password?" that opens the existing reset flow in an in-app browser sheet.

## Step 3: P2 polish
- Replace filled ink buttons with atlas: "New customer", "Request leave", till
  "View bill".
- Till category labels use terracotta and amber, which are outside the palette. Use
  neutral labels or atlas and riad tints.
- Orders list:
  - remove the dangling separator in "Cash ·";
  - show the currency on amounts;
  - use one word for Clients and Customers across the nav and the heading.
- Till open screen: remove the orphan leading dot in "· merchant edition".
- Till drawer: give "Leave" and "End of shift" different icons, make the TILL ID pill do
  something visible or remove it, and replace the lone mint Kitchen printing dot with a
  labelled state.
- Fix the owner avatar "RB", which is mint on near-white and fails contrast.
- Motion: sheets rise with the brand spring (`cubic-bezier(0.34, 1.45, 0.5, 1)`, 310 ms),
  keypad dots fill with a spring, and success and error use `UINotificationFeedbackGenerator`
  haptics through the bridge. Respect Reduce Motion.
- Remove the unreachable SwiftUI More sheet from `KiwiNativeTabRoot`, and keep the tab
  capsule working in every role.

## Step 4: App Review pack
- Write `docs/ops/app-review-notes.md`. It should cover:
  - how a reviewer reaches each role's demo (Dashboard → Enter the demo, Till, Kiwi Team
    with any 4-digit code, Kitchen);
  - how to change role, via ☰ → Change role;
  - where Delete my account is, via ☰ → Delete my account.

  Leave a clearly marked placeholder where the owner will paste a reviewer login. Never
  write a password.
- Permission strings and the portrait lock are already done. Do not redo them.
- Build `app/www` and grep the bundle for `MAD/mois`, `MAD/month`, `/mois`, `399`, `1 499`
  and `Kiwi Pro ·`. No subscription price may be visible anywhere in the iOS build
  (guideline 3.1.1). Remove any you find from the app bundle only.

## How to work
- After each item: build, install on your simulator, tap through the exact path, take a
  screenshot, then commit and push. Keep commits small, one concern each.
- When done, append a "Pass 4 result" section to
  `docs/audits/2026-09-29-iphone-pass3-status.md`. For every item in Steps 0 to 4, mark it
  fixed (with the commit and how you verified it), deferred (with the reason), or not
  reproducible. Commit that too. Then report back in plain words. The tester will retest
  on the Pro Max.
- If you run out of room, stop at a clean commit and write the result section for what you
  finished. An unfinished pass with an honest result section beats a finished-looking one
  without it.
