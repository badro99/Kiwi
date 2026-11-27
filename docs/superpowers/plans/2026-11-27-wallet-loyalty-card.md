# Wallet loyalty card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner rule: no subagents). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Apple Wallet and Google Wallet stamp cards for Kiwi merchants' customers, signed and pushed in-house on Cloudflare.

**Architecture:** Pure-JS building blocks under `functions/api/wallet/` (zip, DER/PKCS#7, PNG strip, pass.json, Google JWT), a D1 card store, public enrollment and Apple web-service routes, an update hook on `/api/clients` writes, then till scan, receipt QR and a dashboard panel.

**Tech Stack:** Cloudflare Pages Functions, D1, WebCrypto, `CompressionStream`, vanilla JS front end.

**Spec:** `docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md`

## Global Constraints

- Zero-cost: no paid service, no root dependency.
- Secrets only from env: `WALLET_APPLE_PASS_TYPE_ID`, `WALLET_APPLE_CERT_PEM`, `WALLET_APPLE_KEY_PEM`, `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_SA_EMAIL`, `WALLET_GOOGLE_SA_KEY`; APNs reuses `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`.
- Every wallet route fail-soft without tables or secrets (web card still works without secrets).
- Migration `migrations/0040_wallet_cards.sql` with `schema.sql`; never applied to prod by the agent.
- `node tools/build-fast-routes.mjs` after adding routes; every new test in `tools/` and named in `tools/check.js`.
- Asset stamps through `node tools/bump-stamp.js`; size and coupling pins never raised.
- Copy: French first, no em dashes, roman type, Material Symbols only.

## Review Focus

- A phone already in the book typed on the public page: no name, balance or card leaks.
- A receipt QR scanned twice, or after the till already attached a client: credits once.
- `/api/clients` sync replaying an unchanged row: no push.
- Missing certificates: enrollment returns the web card, never a 500.
- Pass served to Apple with a stale `If-Modified-Since`: 304, not a fresh sign each poll.

---

### Task 1: Store-only zip writer
**Files:** Create `functions/api/wallet/_zip.js`, `tools/wallet-zip-test.mjs`.
**Produces:** `crc32(bytes) -> number`, `storeZip(files: {name, data: Uint8Array}[]) -> Uint8Array`.
- [ ] Test: `crc32(utf8('123456789')) === 0xCBF43926`; a 3-file zip passes `unzip -t` (skip-warn if no `unzip`) and each entry reads back byte-equal through a central-directory parse in the test.
- [ ] Run red, implement, run green, commit.

### Task 2: DER writer and detached PKCS#7 signature
**Files:** Create `functions/api/wallet/_der.js`, `functions/api/wallet/_pkcs7.js`, `tools/wallet-pkcs7-test.mjs`.
**Produces:** `pemToDer(pem) -> Uint8Array`, `signDetached({ content: Uint8Array, certPem, keyPem, chainPems: string[], now }) -> Promise<Uint8Array>` (CMS SignedData, sha256, rsaEncryption, signed attrs contentType/signingTime/messageDigest, certs = signer + chain).
- [ ] Test: in a temp dir, openssl makes a throwaway CA, an intermediate and a leaf (RSA 2048, PKCS#8 key); sign a manifest; `openssl cms -verify -binary -inform DER -content manifest.json -CAfile ca.pem -purpose any` exits 0; a one-byte change to the content fails verify. Skip-warn when `openssl` is absent.
- [ ] Run red, implement, run green, commit.

### Task 3: Stamp strip PNG
**Files:** Create `functions/api/wallet/_png.js`, `tools/wallet-strip-test.mjs`.
**Produces:** `encodePng(width, height, rgba: Uint8Array) -> Promise<Uint8Array>`, `stampStrip({ filled, target, color, bg, scale }) -> Promise<Uint8Array>` (375×123 points × scale; target ≤ 12 one row, ≤ 24 two rows; `pointsBar({ value, threshold, color, bg, scale })` for the points model).
- [ ] Test: PNG signature and IHDR dims (1125×369 at scale 3); inflate IDAT with `zlib`, the centre pixel of disc 1 equals `color` when filled=1, equals `bg` blend (not color) for disc 2; the reward disc (last) has a distinct ring.
- [ ] Run red, implement, run green, commit.

### Task 4: Card model and pass.json
**Files:** Create `functions/api/wallet/_card.js`, `tools/wallet-card-test.mjs`.
**Produces:** `cardView({ fidelity, client, merchant }) -> { model, balance, target, rewardLabel, remaining, ready, text }` (uses `_rules-loyalty.js` shapes) and `passJson({ view, card, merchant, env, baseUrl }) -> object` (storeCard, `formatVersion:1`, `passTypeIdentifier`, `teamIdentifier`=`APNS_TEAM_ID`, `serialNumber`, `authenticationToken`, `webServiceURL` = `${baseUrl}/api/wallet`, colours, `barcodes:[{format:'PKBarcodeFormatQR', message:'KIWI-C:'+clientId, messageEncoding:'iso-8859-1'}]`, `locations` when merchant has lat/lng, `changeMessage` on the balance field).
- [ ] Test: Pasta Corner config (visit, target 10, reward "1 offert") with 7 stamps → "7 / 10", remaining 3, changeMessage contains `%@`; 10 stamps → ready; amount model → points; no lat → no `locations`.
- [ ] Run red, implement, run green, commit.

### Task 5: D1 tables and card store
**Files:** Modify `schema.sql`; create `migrations/0040_wallet_cards.sql` (via `node tools/d1-migrations.mjs --draft`), `functions/api/wallet/_store.js`, `tools/wallet-store-test.mjs`.
**Produces:** `issueCard(db, { merchant, clientId, platform }) -> { serial, authToken }` (reuses an unrevoked card of the same client+platform), `cardBySerial(db, serial)`, `registerDevice`, `unregisterDevice`, `serialsUpdatedSince(db, deviceId, since)`, `touchCards(db, merchant, clientId, balanceKey) -> card[]` (only when `last_balance` differs), `claimSale(db, merchant, saleId, clientId) -> boolean`, `mintTillToken`, `useTillToken`.
- [ ] Test on `node:sqlite` with schema.sql: issue twice → same serial; touch with same balance → []; claim twice → true then false; till token used twice → second null; expired token → null.
- [ ] `tools/d1-migrations-test.mjs` green. Commit.

### Task 6: Pass bundle
**Files:** Create `functions/api/wallet/_pkpass.js`, `functions/api/wallet/AppleWWDRCAG4.pem` (public cert, committed), extend `tools/wallet-pkcs7-test.mjs`.
**Produces:** `buildPkpass({ pass, images: {name: bytes}, env }) -> Promise<Uint8Array|null>` (null when Apple secrets are missing).
- [ ] Test: with the throwaway certs in env, the bundle unzips to `pass.json`, `manifest.json`, `signature`, images; manifest SHA-1s match; signature verifies against manifest with openssl.
- [ ] Commit.

### Task 7: Routes
**Files:** Create `functions/api/wallet/enroll.js` (POST public), `functions/api/wallet/v1/[[path]].js` (Apple web service), `functions/api/wallet/strip/[[path]].js`, `functions/api/wallet/card.js` (web card JSON by serial+token), `functions/api/wallet/till-token.js` (POST, tenant-auth); run `node tools/build-fast-routes.mjs`. Test `tools/wallet-routes-test.mjs` (in-process with a sqlite D1 shim like other route tests).
- [ ] Tests: new phone → client row `source:'wallet'` + card; existing phone → 200 `{exists:true}` and no name/points in body; receipt claim credits once and twice returns `{already:true}`; claim on a sale with a purchase event → `{already:true}`; Apple GET pass without auth → 401, with `If-Modified-Since` ≥ updated → 304; no tables → 503 JSON; no Apple secrets → enroll returns `{web:url}` only.
- [ ] Commit.

### Task 8: Update hook and pushes
**Files:** Create `functions/api/wallet/_notify.js`, `functions/api/wallet/_google.js`; modify `functions/api/clients.js` (one call after a successful write), `functions/api/push/_dispatch.js` (export a topic-taking sender, no behaviour change for existing callers). Test `tools/wallet-notify-test.mjs` with a fetch stub.
**Produces:** `notifyClientChanged(env, merchant, clientRow, ctx)`; `googleSaveUrl(env, object) -> string|null`; `googlePatch(env, objectId, patch)`.
- [ ] Tests: changed stamps → one APNs request per registered device with topic = pass type id and body `{}`; same balance → zero requests; APNs 410 deletes the registration; Google configured → one PATCH; nothing configured → no fetch.
- [ ] Commit.

### Task 9: Public page `carte.html`
**Files:** Create `carte.html`, `assets/wallet-carte.js`, `assets/wallet-carte.css`; add `/carte/*` rewrite in `_redirects` if needed. Browser test `tools/wallet-carte-browser-test.mjs`.
- [ ] Enroll form (first name, phone, consent), Apple/Google/web buttons by user agent, the existing-phone message, the receipt-claim message, the web card view with polling.
- [ ] Commit.

### Task 10: Till: scan and till QR
**Files:** Create `assets/wallet-till.js` (scan parse + QR sheet); modify the boutique `handleWedge` and the restaurant client picker with one line each.
- [ ] Test `tools/wallet-till-test.mjs`: `parseCardScan('KIWI-C:abc') === 'abc'`, other codes null; browser check that a wedge burst `KIWI-C:<id>` attaches that client in boutique and restaurant demo.
- [ ] Commit.

### Task 11: Receipt QR
**Files:** Modify `assets/receipt.js` (opts.cardUrl → QR line, net-zero lines), callers pass it when loyalty on and no client.
- [ ] Extend `tools/receipt-ticket-code-test.mjs`: QR present only with `cardUrl`, ESC/POS emits `GS ( k` QR block.
- [ ] Commit.

### Task 12: Dashboard panel
**Files:** Create `assets/wallet-dashboard.js` (+ css); one hook line in the Fidélité page.
- [ ] Live preview, colour, position, print stand (A6 page with QR), installed counts.
- [ ] Commit, bump stamps, push both mirrors.
