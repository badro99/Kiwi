# iPhone pass 3: status at `917d1de6`

This is a code-level audit of `docs/handoffs/2026-09-28-iphone-pass3-prompt.md` against `main`
at `917d1de6`, written 2026-09-29. Nothing here was retested on the Pro Max; a line marked
done means a commit claims it and the source agrees, not that the tester saw it. The pass-3
agent stopped after item 5 and never wrote its "Pass 3 result" section.

## Changed since the pass-3 prompt was written
- `f07074d3` and `917d1de6` removed the native More tab from every role. The owner, till,
  Kiwi Team and Kitchen now open a header ☰ drawer, and Change role, Sign out, Kiwi AI
  privacy and Delete my account sit at the bottom of that drawer. The dashboard moon button
  is now the Kiwi AI pill. Any instruction that says "More" now means the ☰ drawer.
- Light and dark follow the phone's appearance in every role (`followSystemTheme` in
  `app/src/native-runtime.js`). The in-app theme toggles are hidden inside the app. The
  Team "Apparence · Jour · Nuit · Système" row from item 2 is therefore hidden in the app,
  not translated.
- The SwiftUI More sheet in `KiwiNativeTabRoot` is now unreachable, because no role posts a
  `more` tab. It is dead code.

## P0 and P1
| # | Item | State | Evidence |
|---|------|-------|----------|
| 1 | Every full-screen gate has a way out | Done, not retested | `3e4c3c18` |
| 2 | FR and Darija on an English phone | Done, not retested | `11b07f76`. No sweep of remaining hard-coded FR was recorded |
| 3 | Demo numbers agree | Done, not retested | `2dc2dfc1` |
| 4 | Developer text under Today's volume | Done, not retested | `59ca67e1` |
| 5 | Order detail sheet, poller | Done, not retested | `59f26063` |
| 6 | Client detail as a bottom sheet, tel, WhatsApp, email, locale birthday, thousands spaces | Open | No `tel:` or `wa.me` link in the client surfaces |
| 7 | Delete my account in the demo | Open | `native-runtime.js` still falls back to "The request could not be recorded." |
| 8 | Refund search focus, autocapitalise, focus ring, WKWebView accessory bar app-wide | Open | No accessory-bar suppression in the runtime or the Swift shell |
| 9 | Header strips: grey logo rectangle, status-bar colour, Team empty band | Open | |
| 10 | Team lock greets a stranger by name | Open | No "Not you? Switch employee" anywhere |
| 11 | Kitchen keypad | Partly done | A backspace key exists (`00ef8a83`). Confirm is not yet held until 6 digits |
| 12 | Sign-in error clearing, single-field outline, Forgot password | Open | No forgot-password link in `app/src` |

## P2
All of P2 is open: atlas buttons instead of ink, till category label colours, Orders list
separator, currency and Clients/Customers naming, the "· merchant edition" dot, till drawer
icons and states, the RB avatar contrast, and the motion and haptics pass.

## App Review pack
| Item | State |
|------|-------|
| `docs/ops/app-review-notes.md` | Missing |
| Localised EN, FR, AR permission strings, including microphone | Done. All five `NS*UsageDescription` keys are in `en`, `fr` and `ar` `InfoPlist.strings` |
| Portrait lock on iPhone | Done. `UISupportedInterfaceOrientations` is portrait only |
| No subscription price in the iOS build | Not verified. `399 MAD` is absent from the three shells; the built `app/www` bundle was not scanned |

## Gate health on `main`
- `retail-tender-browser-test.mjs` and `retail-acompte-browser-test.mjs` fail on `68d565f8`,
  before the menu change, with "maison synthetic baseline has five sales" and "fixture
  baseline". `check.js` is red on `main` because of them.
- `maison-caisse-browser-test.mjs` failed twice and then passed on `917d1de6`, so it is flaky.

## Pass 4 result (2026-09-29)

Executed from `docs/handoffs/2026-09-29-iphone-pass4-prompt.md` on the iPhone 17 Pro
simulator (D53BB4E4), English. Nothing was installed on the Pro Max and nothing was
uploaded to TestFlight. Code is in `3e0c4994`; `tools/native-pass4-test.mjs` (wired into
`check.js`) holds one source-level check per fix. "Simulator" means built, installed and
tapped through on the simulator after the change.

### Step 0 · gate
| Item | State | Evidence |
|------|-------|----------|
| Retail tender and acompte fixture baseline | Fixed | `b251b75d`. Cause: Maison and Boutique counted "today" from midnight, so the tests failed between 00:00 and 05:00. Both now use the 5 h business day (`KiwiDayReport.businessDay`). Assertions unchanged |
| Maison caisse flake | Fixed | Same cause and commit; passed on repeated runs and in the full gate |
| `check.js` green before push | Yes | Full run green on `3e0c4994` |

### Step 1 · regression check of items 1 to 5
| Item | State | Evidence |
|------|-------|----------|
| Every gate has a way out | Verified | Simulator: dashboard lock, Team employee code, Team till code and till float screen show Change role. Kitchen pairing adds it in `native-runtime.js`; source check, not re-walked |
| No French on Team lock, till-code step, Refund sheet, client detail | Fixed and verified | Simulator in English. Team lock now greets with the venue; 19 Team toasts and dynamic toast patterns translated |
| Home, Orders, Report agree; Report not empty | Verified | Simulator. Demo days now vary (about ±9 %), so "vs yesterday" is real instead of +0 % |
| Orders: no developer text, detail opens on first tap | Verified | Simulator. Amounts now end in "MAD" |
| French sweep | Done | Till: 231 toast segments added to `caisse-lang.js` in EN and AR (the "God Mode" console name is not shown to staff). Kitchen: two cancellation errors moved to the dictionary. Native runtime: every French string is already locale-guarded |
| Arabic on device | Deferred | The app keeps the language chosen at setup and ignores the launch locale, so I did not switch the simulator to Arabic. `native-pass3-locale-test` covers AR in the browser. The tester should walk Team, Till and Refund once in Arabic on the Pro Max |

### Step 2 · P1
| # | Item | State | Evidence |
|---|------|-------|----------|
| 6 | Client detail sheet | Fixed | Simulator: bottom sheet with one close control, Call (`tel:`), WhatsApp (with consent), Email, birthday "14 March 1988", amounts "11 780 MAD". The grabber and dish-name history landed after that walk and are source-checked |
| 7 | Delete my account in the demo | Fixed | Simulator: the demo explains that deletion applies to a signed-in account and offers Sign in (atlas primary) |
| 7 | Delete my account on Amira Cafe | Deferred | Needs the owner's password; I do not enter passwords. The owner should run it once before submitting |
| 8 | Refund search | Fixed | Simulator: no autofocus, lowercase keyboard, search key, one rounded atlas ring (the square inner ring came from a native-wide focus rule, now exempted). Accessory bar hidden app-wide from the Keyboard plugin, shown only on numeric fields |
| 9 | Header strips | Fixed | Simulator: Team status bar continues the page and the band above the header is gone. Onboarding logo backdrop and status band fixed in CSS; not re-walked, since onboarding needs a fresh install |
| 10 | Team lock identity | Fixed | Simulator: venue name on a fresh lock, "Hello Yassir" plus "Not you? Switch employee" after a logout |
| 11 | Kitchen keypad | Fixed | Confirm disabled until six digits. Source check; the pairing screen was not re-tapped after the change |
| 12 | Sign-in | Fixed | Errors clear on edit, only the wrong field is outlined, "Forgot password?" opens `kiwi-os.com/support.html#mot-de-passe-oublie` in an in-app Safari sheet (host limited to kiwi-os.com). Built; not tapped, since the simulator stays signed in |

### Step 3 · P2
| Item | State | Evidence |
|------|-------|----------|
| Atlas instead of ink: New customer, Request leave, View bill | Fixed | Simulator: New customer and View bill; Request leave by source check |
| Till category labels | Fixed | Simulator: neutral grey labels, no terracotta or amber |
| Orders "Cash ·" separator | Not reproducible | Rows read "Cash / Client 2" |
| Orders currency | Fixed | Simulator |
| Clients vs Customers | Fixed | Simulator: tab and drawer both say Customers |
| "· merchant edition" dot | Fixed | Till, Maison and Boutique open screens |
| Till drawer icons | Fixed | Simulator: End of shift uses a checklist icon, Leave keeps the exit icon |
| Till ID pill | Fixed | Simulator: hidden until the till is paired, then shows "ID · LVKRMH"; tap still copies the full id |
| Kitchen printing dot | Fixed | Simulator: "Off" in a quiet outline pill, "Ready" when the hub is on, a count while tickets wait |
| RB avatar contrast | Fixed | Simulator: My profile avatar is riad on paper (was dark green on atlas); light top-bar avatar is riad instead of mint on white |
| Motion | Fixed | Sheets rise with the brand spring at 310 ms; Team keypad dots fill with the spring; Reduce Motion turns both off. Kitchen and owner dots already used it |
| Haptics | Fixed | Success toasts give a success notification; a wrong Team code gives an error notification (Capacitor Haptics maps to `UINotificationFeedbackGenerator`). Not felt: the simulator has no haptics |
| Dead SwiftUI More sheet | Removed | Sheet, state, helper and the `more` symbols are gone; the tab capsule still works in every role (simulator: till and owner) |

### Step 4 · App Review pack
| Item | State | Evidence |
|------|-------|----------|
| `docs/ops/app-review-notes.md` | Written | Paths per role, ☰ › Change role, ☰ › Delete my account, reviewer-login placeholder, no password. APP_STORE.md §5 now points to it |
| Price scan of `app/www` | Done | One ungated price found and fixed: the Stock forecast upsell toasted "Kiwi Ultra · 1 499 MAD/mois"; the button is now hidden in the app and its handler is silent. Profile, plan change and the plans sheet were already gated. Other matches are sales figures, payroll estimates, a gym product and landing strings no app screen renders |
| Permission strings, portrait lock | Already done | Not redone |

### Left for the owner and the tester
- Run ☰ › Delete my account once on a signed-in test account (Amira Cafe) and confirm the request is recorded.
- Walk Team, Till and Refund once in Arabic on the Pro Max.
- Tap "Forgot password?" on a signed-out install.
- Paste the reviewer login into App Store Connect (`docs/ops/app-review-notes.md` has the placeholder and the notes text).
- Decide when build 7 ships. Nothing was uploaded.
