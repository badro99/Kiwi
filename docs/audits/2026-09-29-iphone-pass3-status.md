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
