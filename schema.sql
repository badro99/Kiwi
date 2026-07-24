-- Kiwi Live Link — Cloudflare D1 schema.
-- Apply once after creating the D1 database (see LIVE_LINK.md):
--   wrangler d1 execute kiwi-sales --file=schema.sql --remote
-- or paste it into the D1 console in the Cloudflare dashboard.

CREATE TABLE IF NOT EXISTS sales (
  id       TEXT PRIMARY KEY,   -- client-supplied unique id
  merchant TEXT NOT NULL,      -- tenant key (one value for the pilot)
  amount   INTEGER NOT NULL,   -- MAD, whole dirhams
  method   TEXT NOT NULL,      -- cash | card | tap | qr | wallet
  label    TEXT,               -- "À emporter #12", "Table 4", …
  ref      TEXT,               -- caisse receipt ref
  ts       INTEGER NOT NULL    -- epoch ms of the sale
);

-- The dashboard polls "WHERE merchant = ? AND rowid > ? ORDER BY rowid".
-- Index on merchant alone is enough: on a rowid table SQLite implicitly
-- appends rowid to every index, so this covers the (merchant, rowid) order.
-- (You cannot name rowid in CREATE INDEX — SQLite rejects it.)
CREATE INDEX IF NOT EXISTS idx_sales_merchant ON sales (merchant);

-- ── Accounts (merchant login + lead capture) ────────────────────────────────
-- One row per merchant who signs up. Passwords are PBKDF2-SHA256: `salt` and
-- `hash` are hex; the plaintext password is never stored. This table doubles as
-- the leads list (email/name/business/created_ts); signups are also mirrored to
-- a Google Sheet via LEADS_WEBHOOK. See functions/auth/*.
CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,       -- "acc-<uuid>"
  email      TEXT NOT NULL UNIQUE,   -- normalized lowercase, login key
  name       TEXT,                   -- contact name
  business   TEXT,                   -- établissement
  salt       TEXT NOT NULL,          -- PBKDF2 salt (hex)
  hash       TEXT NOT NULL,          -- PBKDF2 derived key (hex)
  created_ts INTEGER NOT NULL,       -- epoch ms of signup
  status     TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'suspended' (frozen for non-payment)
);
-- Existing databases (table already created): add the column once —
--   ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
-- The site gate (functions/_middleware.js → accountActive) revokes a live
-- session as soon as its account row is missing (deleted) or status='suspended'.

-- ── Operator console (Kiwi's own back-office) ───────────────────────────────
-- Operator access codes for kiwi-admin.html. Hashed exactly like account
-- passwords (PBKDF2-SHA256, per-code salt); plaintext is never stored. Add/delete
-- from the console's "Opérateurs" panel. Bootstrap the first code via the staff
-- bypass (owner/partner). See ADMIN.md.
CREATE TABLE IF NOT EXISTS operators (
  id         TEXT PRIMARY KEY,       -- "op-<uuid>"
  label      TEXT,                   -- human name for the code ("Badr", "Partner")
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);

-- Staff PINs per merchant — what the caisse/serveur PIN pad resolves to a role.
-- Managed remotely from the console so an owner never has to. role is free text
-- (serveur | plongeur | caisse | manager | …). pin is 4 digits, unique per
-- merchant. Absent for a merchant ⇒ the app falls back to its hardcoded defaults.
CREATE TABLE IF NOT EXISTS staff_pins (
  id         TEXT PRIMARY KEY,       -- "pin-<uuid>"
  merchant   TEXT NOT NULL,
  pin        TEXT NOT NULL,          -- 4-digit
  name       TEXT,                   -- staff member name
  role       TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pins_merchant ON staff_pins (merchant);

-- Per-merchant feature flags — operator-only (maps to pricing tiers). `features`
-- is a JSON object of module→bool; a missing key means the module is ON (current
-- behavior), so an absent row = the full interface. Toggling a module OFF hides
-- it in that merchant's real app on next load.
CREATE TABLE IF NOT EXISTS merchant_config (
  merchant   TEXT PRIMARY KEY,
  features   TEXT NOT NULL,          -- JSON: {"stock":false,"reservations":false,…}
  plan       TEXT,                   -- basic | pro | ultra | ultimate (optional)
  type       TEXT,                   -- business subtype from onboarding kiwiBizType
                                     -- (restaurant|cafe|boutique|pharmacie|spa|coiffure|…);
                                     -- decides which module set the operator console shows
  updated_ts INTEGER NOT NULL
);
-- Existing databases (table already created): add the column once —
--   ALTER TABLE merchant_config ADD COLUMN type TEXT;
-- Mirrored up from the client at onboarding (assets/onboarding.js → KiwiConfig
-- .syncType → POST /api/config); the console reads it to show boutique modules
-- for a boutique, restaurant modules for a restaurant, etc.

-- ── Caisse pairing (dashboard ⇄ caisse, cross-device) ───────────────────────
-- One row per 6-digit pairing code the dashboard issues (functions/api/pair/
-- create.js). A caisse on any device redeems it (functions/api/pair/redeem.js) to
-- become that merchant's store, of the right trade. Single-use: redeem stamps
-- used_ts in one atomic UPDATE. The partial unique index guarantees at most one
-- LIVE (unused) code per value at a time; expired/used rows keep the code free
-- for reuse. Codes carry the store's type/subtype/name so the caisse boots the
-- matching vertical with no extra lookup.
CREATE TABLE IF NOT EXISTS pairings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  merchant    TEXT NOT NULL,
  type        TEXT,
  subtype     TEXT,
  name        TEXT,
  account_id  TEXT,
  created_ts  INTEGER NOT NULL,
  expires_ts  INTEGER NOT NULL,
  used_ts     INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS pairings_code_live ON pairings(code) WHERE used_ts IS NULL;

-- ── Published menu (customer QR self-order → kiwi-order.html) ────────────────
-- One row per merchant: the carte a customer sees after scanning the table QR.
-- The merchant's dashboard menu lives client-side (localStorage, per-venue, via
-- assets/menu-catalog.js) — a record NO customer device can read. This table is
-- the PUBLISHED copy: the dashboard mirrors its menu up here (functions/api/menu
-- .js POST, merchant derived from the session) and the customer page reads it
-- back (GET, public — see the allow-list in functions/_middleware.js). It holds
-- ONLY what a customer is meant to see: the display name, the trade type, and the
-- menu itself. Never PINs, sales, or any account data.
--   data JSON shape (mirrors assets/menu-catalog.js's store):
--     { cats:  [{ id, name, sub:[{id,name}] }],
--       items: [{ id, name, price, catId, subId, desc, avail }] }
CREATE TABLE IF NOT EXISTS menus (
  merchant   TEXT PRIMARY KEY,         -- slugMerchant(business) — the QR's ?merchant=
  name       TEXT,                     -- display name shown to the customer
  type       TEXT,                     -- trade (cafe|restaurant|…), for future theming
  data       TEXT NOT NULL,            -- JSON: { cats:[…], items:[…] }
  updated_ts INTEGER NOT NULL
);
