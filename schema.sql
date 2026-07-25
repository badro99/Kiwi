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
  ts       INTEGER NOT NULL,   -- epoch ms of the sale
  -- What was actually in the basket: JSON [{n:name, q:qty, t:total}], capped at
  -- 40 lines. NULL for every row written before this column existed, and for
  -- any surface that genuinely has no line detail (a payment link, a hotel
  -- folio) — readers must treat absent as unknown, never as zero.
  --
  -- Why it is here: the till recorded its lines locally and KiwiLive.postSale()
  -- dropped them, so the server only ever held {amount, method, label}. `label`
  -- is a ticket SUMMARY ("Pain +3 art."), so ranking it would have ranked
  -- tickets while claiming to rank products. The consequence was that "quel est
  -- mon produit le plus vendu" could only be answered when the caisse happened
  -- to run in the same browser as the dashboard — which, for a merchant with a
  -- till at the counter and a dashboard in the back office, is never.
  lines    TEXT
);
-- Existing databases: add the column in place. SQLite has no
-- ADD COLUMN IF NOT EXISTS, so this errors harmlessly ("duplicate column name")
-- when re-run on a schema that already has it — the rest of the file still
-- applies. See LIVE_LINK.md.
--   ALTER TABLE sales ADD COLUMN lines TEXT;

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

-- Per-STORE config, and the store registry. One row per merchant slug, two jobs:
--
--  1. FEATURE FLAGS — operator-only (maps to pricing tiers). `features` is a JSON
--     object of module→bool; a missing key means the module is ON (current
--     behavior), so an absent row = the full interface. Toggling a module OFF
--     hides it in that merchant's real app on next load.
--
--  2. WHO OWNS THE STORE — account_id + name. One login can hold SEVERAL
--     établissements (a boutique and a restaurant): the dashboard's venue
--     switcher creates them, and each has its own slug, its own till, its own
--     staff and its own money. Without an owner column the server could not tell
--     a client's second shop from a stranger's, so every store on an account was
--     forced onto the ONE slug derived from accounts.business — which meant the
--     second store silently overwrote the first one's type, shared its staff
--     PINs, and reached the operator console as a nameless, ownerless row filed
--     under "démos". account_id is claimed first-write-wins by the account that
--     syncs the slug (functions/api/config.js) and is what lets a store be read
--     and written by its owner and only its owner. name is the store's own
--     display name, so the console prints "Café Nord", not a bare slug.
--
-- account_id NULL = a row from before the registry, or a demo store an operator
-- seeded. Those keep working exactly as before; the first sync from the matching
-- account adopts them.
CREATE TABLE IF NOT EXISTS merchant_config (
  merchant   TEXT PRIMARY KEY,       -- slugMerchant(store name)
  features   TEXT NOT NULL,          -- JSON: {"stock":false,"reservations":false,…}
  plan       TEXT,                   -- basic | pro | ultra | ultimate (optional)
  type       TEXT,                   -- business subtype from onboarding kiwiBizType
                                     -- (restaurant|cafe|boutique|pharmacie|spa|coiffure|…);
                                     -- decides which module set the operator console shows
  account_id TEXT,                   -- accounts.id of the owner ("acc-<uuid>"); NULL = unclaimed
  name       TEXT,                   -- the store's own name ("Café Nord")
  updated_ts INTEGER NOT NULL
);
-- Existing databases (table already created): add the columns once —
--   ALTER TABLE merchant_config ADD COLUMN type TEXT;
--   ALTER TABLE merchant_config ADD COLUMN account_id TEXT;
--   ALTER TABLE merchant_config ADD COLUMN name TEXT;
CREATE INDEX IF NOT EXISTS idx_config_account ON merchant_config (account_id);
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

-- Failed-redeem counter, one row per client IP. /api/pair/redeem cannot require a
-- session (a till has no login), so a 6-digit code was the only thing standing
-- between a script and binding its own device to somebody else's store: 900 000
-- codes with no attempt cap is a few hours of grinding for whatever codes happen
-- to be live. This caps the guessing per source. A SUCCESSFUL redeem clears the
-- row, so a shop fumbling its own code is never punished for long, and rows older
-- than the window are ignored (and overwritten) rather than needing a sweeper.
CREATE TABLE IF NOT EXISTS pair_attempts (
  ip            TEXT PRIMARY KEY,
  fails         INTEGER NOT NULL DEFAULT 0,
  first_ts      INTEGER NOT NULL,
  blocked_until INTEGER
);

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
-- OrderPro reuses this row rather than adding a second published-catalogue
-- table. Two things changed, both additive and both backward-compatible with
-- every menu published before them:
--   · items may carry `photo` / `video` — /api/media/… URLs, never bytes (the
--     files live in R2; see functions/api/media/).
--   · when `type` = 'boutique', `data` holds STOCK instead of a carte:
--       { categories:[{id,name}],
--         products:  [{id,name,categoryId,priceMAD,photo}],
--         variants:  [{id,productId,colorId,size,stock,barcodes:[…]}],
--         colors:    [{id,label,hex}] }
--     `type` decides which sanitizer runs on write and read, so the two shapes
--     can never be confused (functions/api/menu.js).

-- ── OrderPro · order relay (customer phone → caisse → kitchen) ───────────────
-- One row per order a phone sends after tapping an NFC tag. The customer's phone
-- and the till share no browser, no storage and no Bluetooth — this table is the
-- entire link between them.
--
-- The caisse polls its own slug for rows that changed, staff ACCEPT one, and only
-- then is it a kitchen ticket. Nothing auto-accepts and no timeout ever promotes
-- an order: a ticket the kitchen never saw is worse than a customer who waited to
-- be told. The phone polls the same row, so what it shows is the real state.
--
-- `number` is the per-day human ticket number the customer reads out at the
-- counter ("commande 047"). It is assigned inside the INSERT (one statement), so
-- two phones ordering in the same second can never be handed the same number.
CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,   -- "ord-<ts>-<rand>"
  merchant   TEXT NOT NULL,      -- tenant key (slugMerchant — same spine as sales/menus)
  number     INTEGER NOT NULL,   -- human ticket number (per merchant, per day)
  mode       TEXT NOT NULL,      -- 'table' | 'takeout'
  table_no   TEXT,               -- table number for dine-in, empty for takeout
  total      INTEGER NOT NULL,   -- MAD, whole dirhams
  lines      TEXT NOT NULL,      -- JSON: [{id,name,qty,unitPrice,options,note}]
  status     TEXT NOT NULL,      -- 'pending' | 'accepted' | 'ready' | 'rejected'
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);
-- The caisse polls "WHERE merchant = ? AND updated_ts > ?" — this index covers
-- both that and the per-merchant daily number lookup.
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders (merchant, updated_ts);

-- ── BOUTIQUE · inventaire (le stock privé du commerçant) ────────────────────
-- Le catalogue d'une boutique — produits, déclinaisons couleur × taille, stock
-- et codes-barres — vivait UNIQUEMENT dans le localStorage du navigateur qui
-- l'avait saisi. Une fenêtre privée, un deuxième appareil ou un cache vidé et
-- l'inventaire n'existait plus : rien n'en gardait copie. C'est cette table.
--
-- Pourquoi PAS la table `menus` : `GET /api/menu` est PUBLIC (le client qui
-- scanne un QR n'a ni compte ni cookie de porte). `menus` ne contient donc que
-- ce qu'une boutique CHOISIT de publier. Ici c'est l'inventaire de travail —
-- stock réel, tous les codes-barres, articles non publiés — et sa lecture exige
-- toujours une preuve d'identité (session du compte, caisse appairée, ou
-- opérateur). Les deux ne doivent jamais se confondre.
--
-- Un seul document JSON par boutique, remplacé à chaque écriture : le catalogue
-- est petit (quelques milliers de variantes au plus) et les deux surfaces qui
-- l'éditent — le tableau de bord et la caisse — appartiennent au MÊME
-- commerçant. `rev` s'incrémente côté serveur à chaque écriture ; le client
-- renvoie la révision sur laquelle il s'est basé, et une écriture basée sur une
-- révision périmée est refusée (409) plutôt qu'écrasée. Le client fusionne alors
-- et réessaie, pour qu'un produit ajouté à la caisse ne disparaisse jamais parce
-- que le tableau de bord a enregistré une seconde plus tard.
CREATE TABLE IF NOT EXISTS catalogs (
  merchant   TEXT PRIMARY KEY,   -- slugMerchant(nom de la boutique) — même colonne vertébrale que sales/menus
  data       TEXT NOT NULL,      -- JSON : { v, categories[], products[], variants[], seq }
  rev        INTEGER NOT NULL,   -- révision monotone, incrémentée par le serveur
  updated_ts INTEGER NOT NULL
);

-- ── LES AUTRES DONNÉES D'UN ÉTABLISSEMENT (carte, équipe, fidélité, plan…) ───
-- L'inventaire d'une boutique a eu sa copie serveur (table `catalogs`). Tout le
-- reste de ce qu'un commerçant configure vivait encore UNIQUEMENT dans le
-- localStorage du navigateur qui l'avait saisi : sa carte, son équipe et ses
-- plannings de paie, son programme de fidélité, son plan de salle. Un deuxième
-- appareil, une fenêtre privée ou un cache vidé, et l'établissement était vide.
-- Ressaisir vingt salariés et quatre semaines de planning parce qu'on a ouvert
-- Kiwi sur l'iPad du comptoir n'est pas acceptable.
--
-- Une seule table pour toutes ces fonctionnalités, plutôt qu'une table et un
-- endpoint chacune : six copies de la même logique de révision, ce sont six
-- occasions de se tromper sur la tenancy. C'est déjà la forme qu'impose
-- assets/venue-store.js côté navigateur — `kiwi:<feature>:v1:<venue>` contient
-- un objet, et un seul. Le serveur ne fait que lui donner où survivre.
--
-- `merchant` est le slug du NOM du magasin (slugMerchant), jamais l'identifiant
-- de venue du navigateur : celui-ci est tiré de l'horloge à la création
-- (venues.js `'v' + Date.now()`) ou du slug à l'adoption (`'v-' + slug`), donc
-- deux navigateurs du même commerçant ne tombent JAMAIS sur le même. Le slug,
-- lui, est ce que la caisse et le tableau de bord calculent tous les deux à
-- l'identique — la même colonne vertébrale que sales / menus / catalogs.
--
-- La liste des `feature` autorisées est fermée côté serveur (functions/api/
-- store.js → FEATURES) : sans elle, un client authentifié pourrait semer autant
-- de lignes qu'il veut sous des noms inventés.
--
-- Note sur l'équipe : ce document contient des salaires, des CIN et les codes
-- d'accès du personnel. C'est un choix assumé — les codes atteignent déjà D1 par
-- staff_pins, et un roster amputé de ses codes obligerait le commerçant à tout
-- reconfigurer sur chaque appareil. La lecture exige toujours une preuve
-- d'identité sur CE magasin ; rien ici n'est jamais public.
CREATE TABLE IF NOT EXISTS store_docs (
  merchant   TEXT NOT NULL,      -- slugMerchant(nom du magasin)
  feature    TEXT NOT NULL,      -- 'menu' | 'team' | 'fidelity' | 'floorplan' | …
  data       TEXT NOT NULL,      -- JSON : le document de la fonctionnalité, tel quel
  rev        INTEGER NOT NULL,   -- révision monotone, incrémentée par le serveur
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, feature)
);

-- ── CARNET CLIENTS · fidélité ───────────────────────────────────────────────
-- assets/clients-store.js appelle /api/clients depuis la livraison de la
-- fidélité. L'endpoint n'existait pas : les trois appels tombaient sur un 404
-- avalé en silence, donc une caisse sur tablette et un tableau de bord sur
-- portable tenaient deux carnets séparés et comptaient deux fois les points.
--
-- Des LIGNES, pas un document JSON comme store_docs : un carnet grossit sans
-- plafond naturel, et deux caisses qui servent deux clients différents ne
-- doivent pas se croiser. Dernier écrivain gagne PAR FICHE, sur `updated_ts`
-- (l'horloge de la fiche) ; une écriture plus ancienne que la base est ignorée,
-- donc une caisse qui rejoue sa file après une coupure ne rétrograde rien.
--
-- `srv_ts` est autre chose que `updated_ts` : une horloge SERVEUR strictement
-- croissante par magasin, qui ne sert qu'au curseur de synchronisation. Sur
-- l'horloge des fiches, une tablette mal réglée de trois jours écrirait dans le
-- passé du curseur et sa cliente n'apparaîtrait jamais sur les autres appareils.
--
-- `deleted` est une pierre tombale : sans elle, l'appareil qui n'a pas vu la
-- suppression repousse la fiche au prochain encaissement et le client supprimé
-- ressuscite en boucle. Les champs personnels sont vidés à la suppression — il
-- ne reste que l'identifiant, le temps que les autres appareils apprennent.
CREATE TABLE IF NOT EXISTS clients (
  merchant      TEXT NOT NULL,   -- slugMerchant(nom du magasin)
  id            TEXT NOT NULL,   -- l'id de la fiche, généré par le client
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  birthday      TEXT NOT NULL DEFAULT '',
  gender        TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  points        INTEGER NOT NULL DEFAULT 0,
  stamps        INTEGER NOT NULL DEFAULT 0,
  visits        INTEGER NOT NULL DEFAULT 0,
  spend         INTEGER NOT NULL DEFAULT 0,
  consent       INTEGER NOT NULL DEFAULT 0,
  consent_email INTEGER NOT NULL DEFAULT 0,
  source        TEXT NOT NULL DEFAULT 'caisse',
  first_seen    INTEGER NOT NULL DEFAULT 0,
  last_seen     INTEGER NOT NULL DEFAULT 0,
  updated_ts    INTEGER NOT NULL DEFAULT 0,  -- horloge de la FICHE → arbitrage
  srv_ts        INTEGER NOT NULL DEFAULT 0,  -- horloge SERVEUR → curseur
  deleted       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, id)
);
-- Le seul parcours de lecture : « WHERE merchant = ? AND srv_ts > ? ORDER BY srv_ts ».
CREATE INDEX IF NOT EXISTS idx_clients_sync ON clients (merchant, srv_ts);
