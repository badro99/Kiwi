# Kiwi — merchant accounts (login + lead capture)

Real email + password accounts that gate **both** apps (dashboard + caisse) and
capture every signup as a lead. Runs on the **free** Cloudflare Pages + D1 tiers.
Server-side, so it is not bypassable from the browser.

## How it works

- **Screen:** `functions/_middleware.js` serves a self-contained **Log in / Create
  account** screen for anyone who isn't authenticated. No page, CSS or image is
  served until they're in.
- **Signup / login / logout:** `functions/auth/{signup,login,logout}.js`.
  Passwords are **PBKDF2-SHA256 with a per-user salt** — the plaintext is never
  stored. Shared crypto lives in `functions/auth/_lib.js`.
- **Session:** an HttpOnly, Secure, HMAC-signed cookie (`kiwi_sess`), signed with
  `AUTH_SECRET`, valid 30 days. Returning users just log in again.
- **Accounts = leads:** the `accounts` table (email, name, business, created_ts)
  is the lead list; each signup is also mirrored to a Google Sheet (below).
- **Two ways in:**
  1. **Merchant account** — email + password (what clients use).
  2. **Staff bypass** — the shared `SITE_PASSWORD` via the "Accès équipe" link, so
     the owner + partner can demo without an account and never get locked out.

## Cloudflare setup — ✅ already provisioned (2026-07-07)

On the `kiwi-maroc` Pages project:
- D1 `accounts` table created (`schema.sql`).
- `AUTH_SECRET` set (encrypted secret) — signs sessions.
- `SITE_PASSWORD` kept (staff bypass).
- D1 bound as `DB`.

To re-provision elsewhere: apply `schema.sql`, set `AUTH_SECRET` (random 32-byte
hex), optionally `SITE_PASSWORD`, bind D1 as `DB`, deploy.

## Google Sheet mirror (the one manual step)

Cloudflare can't write to Google Sheets directly, so a tiny Google **Apps Script
web app** receives each signup and appends a row. One-time, ~3 minutes:

1. Create a Google Sheet (e.g. "Kiwi — Leads").
2. **Extensions → Apps Script**. Replace everything in `Code.gs` with:

   ```javascript
   function doPost(e) {
     var lock = LockService.getScriptLock();
     lock.waitLock(20000);
     try {
       var data = JSON.parse(e.postData.contents);
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       var sheet = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
       if (sheet.getLastRow() === 0) {
         sheet.appendRow(['Date', 'Email', 'Nom', 'Établissement']);
       }
       var when = data.ts ? new Date(Number(data.ts)) : new Date();
       sheet.appendRow([when, data.email || '', data.name || '', data.business || '']);
       return ContentService.createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
     } catch (err) {
       return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
         .setMimeType(ContentService.MimeType.JSON);
     } finally {
       lock.releaseLock();
     }
   }
   ```

3. **Deploy → New deployment → Web app.** Execute as **Me**, Who has access
   **Anyone**. Deploy, and authorize when prompted. Copy the **Web app URL**
   (ends in `/exec`).
4. In Cloudflare → `kiwi-maroc` → Settings → Variables and secrets → **Add**:
   Type `Text`, name **`LEADS_WEBHOOK`**, value = that `/exec` URL. Save, then
   **Create deployment** (not Retry).

Now every signup appends a row to the sheet. Until `LEADS_WEBHOOK` is set, signups
still save to D1 — nothing is lost; the sheet just isn't populated yet.

## Seeing the leads

- **D1 console** (Cloudflare → D1 → `kiwi-sales` → Console):
  `SELECT created_ts, email, name, business FROM accounts ORDER BY created_ts DESC;`
- **Google Sheet:** live once `LEADS_WEBHOOK` is set.

## Honest limits (pilot-grade)

- **No email verification.** Emails are captured but not confirmed.
- **No password reset flow yet.** (Easy to add — a reset would need email sending.)
- **Basic brute-force posture.** No rate limiting on login yet; fine for a pilot,
  harden before real scale.
- **Single tenant of data.** All merchants share one D1; there is no per-merchant
  data isolation in the demo yet.
- **Cloudflare-only.** The gate + accounts exist only on Cloudflare Pages; GitHub
  Pages stays the open static demo.
- The Google Sheet webhook is unauthenticated (accepts any POST). Low-risk for a
  pilot; can be hardened with a shared token.
