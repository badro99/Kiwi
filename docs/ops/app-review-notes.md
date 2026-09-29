# App Review notes · Kiwi Pro for iOS

What to paste into App Store Connect › App Review Information, and what the
reviewer will meet on each path. Written 2026-09-29 for the build after pass 4
(build 7 when the owner ships it). The account background, the review account
and the Play Console side live in `docs/ops/APP_STORE.md`; this file replaces
its §5 text, which still describes the removed More tab.

## Sign-in information (App Store Connect fields)

| Field | Value |
|-------|-------|
| User name | `REVIEWER_LOGIN_EMAIL` (placeholder: the owner pastes the review account e-mail here and in App Store Connect) |
| Password | Entered by the owner in App Store Connect only. Never in this repository, a message or a screenshot. |

Before submitting, the owner signs in with that account on a clean install of the
candidate build and walks the four paths below once. APP_STORE.md §2 lists what
the account still needs (owner code, menu, staff).

## Notes to paste (App access)

> Kiwi Pro is a business app for merchants who already have a Kiwi account,
> created by Kiwi when they subscribe outside the app. Sign in with the account
> in the Sign-In Information fields.
>
> After sign-in the app asks what the device will be used for: Till, Kiwi Team,
> Kitchen or Dashboard. Every role has a menu button (☰) at the top left. At the
> bottom of that menu: Change role, Sign out, Kiwi AI privacy and Delete my
> account. Every full-screen code keypad also has a Change role link, so no
> screen is a dead end.
>
> Dashboard: enter the owner code, or tap "Enter the demo" under the keypad to
> browse sample data. Home, Orders, Report and Customers are the tabs at the
> bottom.
>
> Till: opens on the float screen; enter an opening amount and tap Open till.
> Tap items to build a bill, then View bill to take payment. Refunds, cash
> movements and End of shift are in the ☰ menu.
>
> Kiwi Team (staff app): enter an employee code shown under Dashboard › Team.
>
> Kitchen: pair with the six-digit code generated under Dashboard › Devices.
>
> No printer is needed. The first time you open Printer › Test, iOS asks for
> Local Network access: the app sends ESC/POS tickets to a thermal printer on
> the Wi-Fi (TCP port 9100). Without a printer, tickets queue and the app keeps
> working. The camera is only used to scan a barcode or photograph a delivery
> note.
>
> There are no in-app purchases, no subscriptions or prices shown in the app,
> no ads, no tracking and no third-party login.
>
> Account deletion: ☰ › Delete my account. For a signed-in account it asks for
> the account password, records the request on our server and confirms it;
> Kiwi processes it within 30 days. In the sample-data demo there is no account
> to delete, so the screen explains that and offers Sign in.

## What the reviewer sees, path by path

| Path | Where | Checked on the simulator (pass 4) |
|------|-------|-----------------------------------|
| Role choice | First launch after sign-in, and ☰ › Change role | Yes |
| Dashboard demo | Lock screen › Enter the demo | Yes, opens in English with no French flash |
| Till | Float screen › Open till › menu › View bill | Yes |
| Kiwi Team | Lock › employee code | Yes (demo). Lock shows the venue, then "Hello {name}" with "Not you? Switch employee" |
| Kitchen | Pairing keypad, Confirm enabled at six digits | Keypad only; pairing needs a live code |
| Delete my account (demo) | ☰ › Delete my account | Yes, explains and offers Sign in |
| Delete my account (signed in) | ☰ › Delete my account | **Not verified.** Needs the owner's password on a real test account (Amira Cafe). The owner runs this before submitting. |
| Forgot password | Sign-in › Forgot password? | Opens kiwi-os.com/support.html#mot-de-passe-oublie in an in-app Safari sheet |

## Guideline 3.1.1: no price in the build

Scanned `app/www` after `node tools/build-app-www.mjs` for `MAD/mois`, `MAD/month`,
`/mois`, `399`, `1 499` and `Kiwi Pro ·`. The bundle ships the shared web assets,
so these strings exist in source; what matters is whether a screen in the app
shows them. Every subscription surface is gated on `html.kiwi-native`:

- My profile › Subscription: the native branch renders "Kiwi Pro · Your Kiwi
  workspace" with no price (`assets/account.js`).
- Change plan and the plans sheet: the button is not rendered in the app, and
  the `upgrade-pro` handler answers "Plan changes are not available in this app"
  (`assets/interactive.js`).
- Stock › Forecast upsell: the button is hidden in the app and its handler is
  silent (`assets/stock.js`, `app/src/native-runtime.css`). This was the one
  ungated price and was fixed in pass 4.
- Remaining matches are not subscription prices: menu and revenue insights
  (`/mois` on sales), payroll estimates in Kiwi AI, a gym membership product in
  the gym vertical, and landing-page strings in `assets/i18n.js` that no app
  screen renders.

`tools/native-pass4-test.mjs` holds the three gates above.

## Already done, not to redo

- Localised `NS*UsageDescription` strings in English, French and Arabic.
- Portrait lock on iPhone.
