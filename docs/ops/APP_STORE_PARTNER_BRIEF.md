# Kiwi Pro · store accounts, partner brief (English)

*Written 2026-08-23 for the partner who will hold the Apple and Google developer
accounts. The French reference is `docs/ops/APP_STORE.md`; everything technical
(build, sign, TestFlight) is in `docs/ops/APP.md`. Nothing in this file is code:
it is the list of things only a person with an ID and a card can do.*

## Why you

Apple's Individual enrollment verifies the holder with a government photo ID in
the Apple Developer app (driver's licence, national ID card or passport depending
on the country). Zakariae has none of the accepted documents at hand, so the two
accounts open in your name. There is no company yet, so *Organisation* enrollment
(which needs a D-U-N-S number) is not possible; once the company exists, both apps
get transferred to its account. The app itself is finished and guarded; these
steps are the only thing between us and TestFlight.

## 1. Apple Developer Program · Individual · 99 USD/year

1. Use (or create) an Apple Account with **two-factor authentication on**, and the
   first/last name fields set to your **legal name exactly as on your ID**. An
   alias, nickname or "Kiwi" in the name field delays approval.
2. Install the **Apple Developer** app on your iPhone, sign in, tap *Enroll Now*,
   choose **Individual / Sole Proprietor**. Scan your ID and take the selfie when
   asked. Pay the 99 USD with your card. Enrollment is usually active within 24–48 h
   (sometimes a few days).
3. When active, open developer.apple.com → Account → Membership details and send
   Zakariae the **Team ID** (10 characters). It goes into an environment variable on
   the build Mac (`KIWI_DEVELOPMENT_TEAM`), never into the repo.
4. App Store Connect (appstoreconnect.apple.com) → Users and Access → invite
   Zakariae's Apple Account as **Admin** so builds can be uploaded and the listing
   edited without your login. Never share the account password itself.
5. Create the app: App Store Connect → Apps → **+** → New App: platform iOS (iPadOS
   is included), name **Kiwi Pro**, primary language **French**, bundle ID
   **com.kiwios.pro** (irreversible, already confirmed), SKU `kiwi-pro-ios`.
   If the bundle ID is not in the dropdown, register it first at
   developer.apple.com → Identifiers → App IDs → explicit `com.kiwios.pro`,
   capabilities: none.
6. Tell Zakariae "Apple is live". He archives and uploads the first build, fills
   the listing from `APP_STORE.md` §3–5, and sets up TestFlight (§6).

## 2. Google Play Console · personal account · 25 USD once

1. play.google.com/console → create a **personal** developer account with your
   Google account, pay the 25 USD, complete the identity verification (1–3 days).
2. Grant Zakariae's Google account **Admin** on the developer account (Users and
   permissions).
3. Create the app: name **Kiwi Pro**, default language French, app (not game),
   free, category Business.
4. Note Google's rule for personal accounts created after November 2023: before a
   production release, the app must run a **closed test with 12 testers for 14
   days**. The internal/closed track is enough for Browse's Android tablet and for
   the review; production waits for that window or for the company account.
5. Tell Zakariae "Play is live". He generates the upload key once, enables Play
   App Signing and uploads the first AAB.

## 3. The demo account for the app reviews (5 minutes, can be either of us)

Both reviews need a working login. In a **private window** on kiwi-os.com → *Se
connecter* → *Créer un compte*: e-mail `demo-review@kiwi-os.com` (the alias
already exists on the contact mailbox), business **Kiwi Démo**, activity
restaurant, a password you choose. The password is typed only into App Store
Connect (*Sign-In Information*) and Play Console (*App access*), nowhere else:
not in WhatsApp, not in a screenshot, not in the repo. Then tell Zakariae; the
menu, formula, recipes and team content are ready in `docs/ops/demo-review/`.

## 4. Three lines for the legal page

`mentions-legales.html` names the publisher as a person until the company exists.
Send Zakariae, for the account holder: full name, postal address, and the name to
print as *directeur de la publication* (normally the same person). Apple compares
the developer account identity with the privacy policy's publisher.

## 5. Later, when the company is registered

D-U-N-S number (free, dnb.com, 5–10 working days) → Apple Organisation account and
Play Organisation account → transfer both apps (a form on each console, no rebuild;
Kiwi Pro has no in-app purchases, iCloud or Passkeys, so nothing blocks it) → legal
page completed with RC, IF, TP, ICE.

## What not to do

- Do not paste the Apple or Google password, a verification code, or the Team ID
  into a public channel; Team ID goes to Zakariae directly, passwords to nobody.
- Do not choose *Organisation* or type a company name anywhere in the enrollment:
  there is no registered entity yet and the application would be rejected.
- Do not create the bundle ID with a different spelling; `com.kiwios.pro` is
  already baked into the app.
