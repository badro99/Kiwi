# Wallet loyalty card (Apple Wallet + Google Wallet)

Date: 27 Nov 2026. Status: approved flow ("good, go ahead, I want something crazy, wow me"),
technical calls below are mine and marked as such.

## Why

Fidelix stands on the counter at Pasta Corner, a Kiwi client, and puts a stamp card in the
customer's Apple Wallet. Kiwi already runs the loyalty program behind that counter (the
`fidelity` store doc, stamps and points on `clients`), so a separate paid app doing the
customer-facing half is a reason for the merchant to doubt Kiwi. The card has to live in the
phone's Wallet, update itself after every visit, and cost the merchant nothing extra.

Success: a Pasta Corner customer scans the stand, has the card in Wallet in under 20 seconds,
and after paying sees the stamp land on the lock screen without opening anything.

## Goals

- One card per customer per merchant, in Apple Wallet or Google Wallet, chosen by the phone.
- Card shows the merchant's logo and colours, the stamps or points from the existing
  `fidelity` program, the next reward, and a QR the till can scan.
- The card updates by push after every purchase, reward and refund, with a lock-screen line
  ("Encore 3 tampons avant votre café offert").
- Three ways in: the counter stand QR, the QR at the bottom of a receipt (which also credits
  that receipt's visit), and the till showing a QR for an attached client.
- At the till, scanning the card (douchette or camera) attaches the customer like picking
  them from the list.
- Works with no certificates configured: the customer then gets the web card (same design,
  saved to the home screen), and nothing in the till breaks.

## Non-goals

- No SMS or WhatsApp verification (costs money, owner rule: zero-cost features only).
- No paid pass service (PassKit, Passcreator, Fidelix itself).
- No change to how stamps and points are computed: `_rules-loyalty.js` stays the only rule.
- No marketing pushes. The card speaks only when the customer's own balance changes.

## Anti-goals (a failure even if it works)

- A stranger who types someone else's phone number gets their card, name or balance.
- A till that cannot reach the server stops crediting stamps.
- A Wallet push that fires on every 15-second sync instead of on a real balance change.
- A certificate, private key or service-account key in git.

## Constraints

- Cloudflare Pages Functions + D1, no new paid service, no root dependencies.
- Every route under `functions/` goes through `node tools/build-fast-routes.mjs`.
- `schema.sql` change ships with the next `migrations/NNNN_wallet_cards.sql`; the owner
  applies it to prod. Until then every wallet route answers fail-soft.
- Client data is tenant-scoped through `_private.js`. The public enrollment routes are the
  first public writes to `clients`; they only ever create a NEW client or credit a
  receipt that proves a purchase.
- File-size ratchet: new code goes in new files (`functions/api/wallet/*`,
  `assets/wallet-*.js`), existing shells only gain a line or two.
- French first in UI copy, EN and AR through the existing i18n; no em dashes in copy.

## Approaches considered

1. **Sign passes in-house on Cloudflare (chosen).** Build `pass.json`, hash the files, sign a
   detached PKCS#7 with WebCrypto (RSA PKCS#1 v1.5, SHA-256) and a small DER writer, zip with
   a store-only zip writer, serve the `.pkpass`. Google side: RS256 JWT "Save to Google
   Wallet" link plus REST PATCH for updates. Zero cost, full control of the design, one
   codebase. Cost: we own the ASN.1 and zip code, tested locally with `openssl cms -verify`.
2. **A paid pass platform.** Fastest, but a monthly fee per merchant and the owner ruled out
   paid services.
3. **Web card only (PWA on the home screen).** Free and simple, but it is not in Wallet, never
   shows on the lock screen, and loses to Fidelix on the exact point the user cares about.
   Kept as the fallback, not the product.

## Design

### The card (Apple storeCard / Google loyaltyObject)

- Top: merchant logo (from the receipt logo already in `store_docs` receipt, cropped), shop
  name as `logoText`.
- Background and foreground from the merchant's brand colour; default Kiwi `--riad` #053B2C
  on `--paper` text. Label colour derived for contrast (builder checks 4.5:1).
- **Strip image (the wow): a live stamp strip.** A PNG drawn on the server for the current
  count: one disc per stamp of the target (10 at Pasta Corner), earned ones filled in the
  brand colour with a check, the last one marked as the reward. Re-rendered on every change,
  so the card visibly fills up. Points model: a progress bar to the threshold instead.
  Rendered in pure JS (anti-aliased discs, PNG via `CompressionStream('deflate')`), at @1x,
  @2x and @3x for Apple, one URL for Google (`/api/wallet/strip/<merchant>/<n>-<target>.png`,
  immutable, cached).
- Fields: primary "7 / 10 tampons" (or "340 points"), secondary "Prochaine récompense:
  1 offert", auxiliary first name. Back: how it works, the shop's address and phone,
  "Géré par Kiwi".
- `changeMessage` on the balance field: "Encore %@ tampons avant votre récompense", and a
  separate message when the reward is ready ("Votre récompense vous attend").
- Barcode: QR with message `KIWI-C:<clientId>` (the till's own client id, so the till
  resolves it offline from its local book).
- `locations`: the shop's coordinates when the owner has set them (one button on the
  dashboard card settings: "Utiliser ma position", done once inside the shop). iOS then
  offers the card on the lock screen near the shop. Google gets the same through the class.
- `relevantDate` not used. `expirationDate` not used.

### Ways in

1. **Counter stand.** Dashboard → Fidélité → Carte Wallet → "Imprimer le présentoir": an A6
   printable page with the shop logo, one QR to `https://kiwi-os.com/carte/<merchant>`, and
   two lines of copy. The page asks for a first name and a phone number.
   - New phone: a client is created (`source: 'wallet'`, consent recorded), the card is
     issued.
   - Phone already in the book: no card, no name, no balance on screen. The page says
     "Ce numéro a déjà une carte chez <shop>. Demandez-la en caisse." (my call: this is what
     stops the stranger-with-your-number case without paying for SMS).
2. **Receipt QR.** Under the ticket code, a small QR to `/carte/<merchant>?r=<saleId>` with
   "Ajoutez ce passage à votre carte". The server checks the sale exists in the merchant's
   sales feed, is under 7 days old, not voided, and has no row yet in `client_purchase_events` for that
   sale (that row is what "a client was attached" means on the server) nor in
   `wallet_claims`.
   - New phone: client created, the sale credited (same purchase key as the till uses, so
     it can never count twice), card issued already showing the stamp.
   - Existing phone: the sale is credited to that client, the page says "Tampon ajouté.
     Votre carte se met à jour." and the existing card gets its push. No card is handed out.
   - The sale id is a random UUID, so the QR cannot be guessed.
   - Receipt QR only prints when the merchant's loyalty is on and the sale had no client.
3. **Till QR.** When a client is attached at the till, the client sheet gets "Carte Wallet":
   a QR on the till screen the customer scans to receive their own card (the cashier has
   seen the person, so existing phones get their card here). The QR carries a single-use
   token, valid 10 minutes, created by the till through an authenticated call.

### At the till

- `handleWedge` (boutique) and the restaurant scan path recognise `KIWI-C:` and attach that
  client, exactly as picking them from the list (`saleClient` in `caisse-accounting.js`,
  the client picker in `pos-boutique`). Unknown id: toast "Carte inconnue sur cette caisse",
  then a server lookup when online.
- Camera scan where the till already has one (`retail-scan.js`) gets the same recognition.
- Typing the phone number keeps working; nothing changes for customers without a card.

### Updates

- Server hook: wherever `/api/clients` writes a changed `points`, `stamps` or reward state
  for a client that has a wallet card, it enqueues one update for that card (dedupe per
  card per 30 s, so a sync replaying the same row does nothing).
- Apple: bump `updated_ts` on the card row, then an empty APNs push (`{}`) to every
  registered device push token with `apns-topic` = the Pass Type ID. The push-type header
  is settled on the first real device (Apple documents the empty payload, not the header).
  A 410 from APNs deletes that registration. Token-based auth with the existing `.p8`
  APNs key works for pass topics when the key and the Pass Type ID share the team (known
  behaviour, node-apn #469). If Apple refuses token auth for the pass topic in practice,
  the fallback is a tiny Worker with an `mtls_certificates` binding holding the pass
  certificate; the dispatch function is written so only the transport changes.
- The device then calls our web service and downloads the fresh `.pkpass`.
- Google: PATCH the loyalty object (balance, strip image URL, message) with a service
  account access token (JWT bearer grant, cached 50 min). Google shows its own
  notification for messages we add.
- Refunds and voids lower the balance the same way; no lock-screen message on a decrease.

### Apple web service (all under `/api/wallet/v1/`)

- `POST   devices/{dev}/registrations/{passTypeId}/{serial}` register (201/200).
- `DELETE devices/{dev}/registrations/{passTypeId}/{serial}` unregister.
- `GET    devices/{dev}/registrations/{passTypeId}?passesUpdatedSince=` serials changed.
- `GET    passes/{passTypeId}/{serial}` latest pass, honours `If-Modified-Since` (304).
- `POST   log` logs Apple's error messages to `client_errors` (truncated, no PII).
- Auth: `Authorization: ApplePass <token>`, a 32-char random token per card, compared in
  constant time.

### Data (migration `NNNN_wallet_cards.sql`)

- `wallet_cards(merchant, serial PK, client_id, auth_token, platform 'apple'|'google'|'web',
  created_ts, updated_ts, last_balance TEXT, revoked INTEGER)`, index on
  `(merchant, client_id)`.
- `wallet_devices(device_id, push_token, serial, created_ts, PRIMARY KEY(device_id,
  serial))`.
- `wallet_claims(merchant, sale_id PK, client_id, claimed_ts)` for receipt QRs.
- `wallet_tokens(token PK, merchant, client_id, expires_ts)` for the till QR.
- A client deleted from the book revokes its cards (pass returns 410 to Apple, object set
  to INACTIVE on Google).

### Secrets (owner creates them, never in git)

- Apple: Pass Type ID (e.g. `pass.com.kiwios.loyalty`) and its certificate, exported as
  `WALLET_APPLE_PASS_TYPE_ID`, `WALLET_APPLE_CERT_PEM`, `WALLET_APPLE_KEY_PEM` (PKCS#8).
  The Apple WWDR G4 intermediate is public and committed. APNs reuses `APNS_KEY_ID`,
  `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`.
- Google: Wallet issuer account, a service account with the Wallet Object Issuer role:
  `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_SA_EMAIL`, `WALLET_GOOGLE_SA_KEY`.
- Missing secrets: the enrollment page offers the web card only, and says nothing about
  Wallet.

### Dashboard

- Fidélité page gains a "Carte Wallet" panel: a live preview of the card in the merchant's
  colours with the current program, the brand colour picker, "Utiliser ma position",
  "Imprimer le présentoir", and the count of cards installed (Apple / Google / web).

### Web card

- `/carte/<merchant>/<serial>?t=<token>`: the same card as a page, kept fresh by polling
  `/api/wallet/card` every 60 s while visible, installable to the home screen. This is what
  Android phones without Google Wallet and every phone before the certificates exist get.

## Left to the builder

- Exact copy and Arabic wording (native idiom, not translated).
- Strip artwork details inside the rules above (Material Symbols only if an icon is drawn,
  roman type, no new accent colour beyond the merchant's own).
- Whether the restaurant camera scan exists today or only the douchette path.
- Test layout, as long as the pass signature is verified with `openssl cms -verify` against
  a throwaway test CA when `openssl` is present, and the zip opens with `unzip -t`.
