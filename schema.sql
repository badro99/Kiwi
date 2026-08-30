-- Kiwi Live Link — Cloudflare D1 schema.
-- Apply once after creating the D1 database (see docs/ops/LIVE_LINK.md):
--   wrangler d1 execute kiwi-sales --file=schema.sql --remote
-- or paste it into the D1 console in the Cloudflare dashboard.

CREATE TABLE IF NOT EXISTS sales (
  id       TEXT PRIMARY KEY,   -- client-supplied unique id
  merchant     TEXT NOT NULL,      -- tenant key (one value for the pilot)
  amount       INTEGER NOT NULL,   -- legacy whole MAD; retained for backward compatibility with pre-migration rows and unmigrated readers
  amount_cents INTEGER,            -- centimes; authoritative when present. Legacy rows use amount (whole MAD).
  gross_amount_cents INTEGER,      -- nullable: gross before an approved discount
  discount_amount_cents INTEGER,   -- nullable: bounded, never greater than gross
  discount_reason TEXT,            -- nullable enum: commercial|loyal-customer|kitchen-error|other
  discount_actor_id TEXT,          -- nullable staff/account id, never a PIN or code
  method       TEXT NOT NULL,      -- cash | card | tap | qr | wallet
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
  lines    TEXT,

  -- Where the money was earned. Unlike `method` (how it was paid), this is the
  -- operational surface: dining, terrace, takeaway, delivery, orderpro…
  -- Optional for historical rows; /api/feed reconstructs safe restaurant
  -- cases from their table visit / frozen receipt label.
  channel  TEXT,

  -- ── VENTE DE TEST : annulée, jamais effacée ────────────────────────────────
  -- Une installation, une formation, un essai d'imprimante laissent de vraies
  -- lignes dans les livres d'un vrai commerçant. L'opérateur doit pouvoir les
  -- sortir des chiffres — mais SUPPRIMER la ligne serait détruire une écriture
  -- financière, et une console d'assistance qui efface des ventes est une
  -- console qui, un jour, effacera la mauvaise.
  --
  -- `void_ts` non NULL = la vente est neutralisée : /api/feed cesse de la servir,
  -- donc elle disparaît du chiffre d'affaires, du nombre de ventes, du panier
  -- moyen, du classement produits, de la répartition des encaissements, du
  -- rapport journalier, des exports et des calculs de Kiwi AI — tout cela
  -- recalcule depuis le flux. La LIGNE, elle, reste, avec son montant, son
  -- panier et son horodatage d'origine. Remettre void_ts à NULL rend la vente
  -- aux livres à l'identique : c'est ce qui rend le geste réversible.
  --
  -- Le motif est obligatoire côté serveur (functions/api/admin/sales.js) et
  -- l'auteur est celui du code opérateur, pas une IP — voir sale_audit.
  void_ts     INTEGER,          -- epoch ms de l'annulation ; NULL = vente vivante
  void_reason TEXT,             -- onboarding|imprimante|formation|doublon|installation|autre
  void_note   TEXT,             -- l'explication écrite, obligatoire quand reason='autre'
  void_actor  TEXT,             -- libellé du code opérateur, ou 'equipe'
  void_actor_id TEXT            -- operators.id quand il est connu
);
-- Existing databases: add the column in place. SQLite has no
-- ADD COLUMN IF NOT EXISTS, so this errors harmlessly ("duplicate column name")
-- when re-run on a schema that already has it — the rest of the file still
-- applies. See docs/ops/LIVE_LINK.md.
-- `node tools/d1-schema.mjs` les nomme, `--apply --yes` les pose.
-- Tant que ces colonnes manquent, tout continue de fonctionner : /api/feed
-- retombe sur sa requête d'origine et la console refuse l'annulation en le
-- disant, plutôt que d'échouer en silence.

-- The dashboard polls "WHERE merchant = ? AND rowid > ? ORDER BY rowid".
-- Index on merchant alone is enough: on a rowid table SQLite implicitly
-- appends rowid to every index, so this covers the (merchant, rowid) order.
-- (You cannot name rowid in CREATE INDEX — SQLite rejects it.)
CREATE INDEX IF NOT EXISTS idx_sales_merchant ON sales (merchant);

-- Numeric receipt references are allocated independently from the money ledger.
-- `next_value` is the first number that has never been reserved. A till advances
-- it atomically by a small range, persists that lease locally, and can therefore
-- continue offline without colliding with another till. Gaps are intentional:
-- losing an unused lease must never make its numbers available to somebody else.
CREATE TABLE IF NOT EXISTS ticket_sequences (
  merchant   TEXT NOT NULL,
  period     INTEGER NOT NULL, -- calendar year; keeps the visible ref at <= 5 digits
  next_value INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, period)
);

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
  status     TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' (frozen for non-payment)

  -- ── LES TROIS ADRESSES D'UN CLIENT ────────────────────────────────────────
  -- `email` ci-dessus est l'adresse de CONNEXION : la clé unique, celle que le
  -- client tape pour entrer. Ce n'était pas seulement ça jusqu'ici, c'était
  -- aussi la seule — donc corriger une adresse de connexion mal saisie changeait
  -- du même geste l'adresse à laquelle Kiwi écrit, et inversement.
  --
  -- Les deux suivantes séparent enfin les rôles. Elles sont FACULTATIVES et
  -- vides par défaut : vide ⇒ « la même que la connexion », ce qui est le vrai
  -- état de tous les comptes existants. On ne recopie pas `email` dedans à la
  -- migration — une copie ne saurait plus dire si le client a choisi cette
  -- adresse pour sa facturation ou si personne n'a jamais posé la question.
  contact_email TEXT,                -- l'adresse à laquelle Kiwi écrit au commerce
  billing_email TEXT                 -- facturation / comptabilité, quand elle diffère
);
-- Base déjà déployée : `node tools/d1-schema.mjs` dit ce qui manque.
-- The site gate (functions/_middleware.js → accountActive) revokes a live
-- session as soon as its account row is missing (deleted) or status='suspended'.

-- ── Operator console (Kiwi's own back-office) ───────────────────────────────
-- Operator access codes for kiwi-admin.html. Hashed exactly like account
-- passwords (PBKDF2-SHA256, per-code salt); plaintext is never stored. Add/delete
-- from the console's "Opérateurs" panel. Bootstrap the first code via the staff
-- bypass (owner/partner). See docs/ops/ADMIN.md.
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
  -- active | pending | suspended, PER STORE. `pending` is a fully onboarded
  -- establishment that may explore Kiwi but has not yet been accepted as a
  -- subscriber by God Mode. Existing/legacy NULL rows remain active.
  -- accounts.status freezes a whole LOGIN, which
  -- is the wrong instrument for a client who runs a boutique and a café and has
  -- stopped paying for one of them: freezing the login takes down the shop that
  -- is paid up too. A suspended store keeps every byte it owns — this only cuts
  -- what it can DO: no new sale, no write, no public ordering page.
  -- NULL is read as active, so every row that predates the column is untouched.
  status     TEXT,

  -- ── LE MILLÉSIME DES CAISSES ──────────────────────────────────────────────
  -- Le jeton de caisse (`kiwi_till`) était HMAC(secret, 'kiwi-till-v1:' + slug) :
  -- une fonction pure du nom de la boutique. La même valeur pour tous les
  -- appareils, sans expiration, et RIEN dans le dépôt ne pouvait l'annuler —
  -- alors que le code promettait « jusqu'à ce que le commerçant dépaire ». Un
  -- téléphone d'employé parti gardait donc l'accès au carnet clients et au stock,
  -- et la seule coupure possible, la rotation d'AUTH_SECRET, aurait déconnecté
  -- tous les commerçants en même temps.
  --
  -- Le jeton porte maintenant ce nombre, et il entre dans la signature.
  -- L'incrémenter (POST /api/pair/revoke) périme toutes les caisses de CETTE
  -- boutique. Tant qu'il vaut 0, l'ancienne forme reste acceptée : aucun
  -- comptoir en service ne tombe au déploiement.
  till_epoch INTEGER NOT NULL DEFAULT 0,

  -- ── LA VILLE, ET CE QUE CET ÉTABLISSEMENT NOUS RAPPORTE ───────────────────
  -- Deux colonnes posées par l'OPÉRATEUR depuis la console, jamais par le
  -- client. Elles n'existaient nulle part : ni le compte ni la fiche magasin ne
  -- portaient de ville, et rien dans la base ne disait ce qu'un abonnement vaut.
  -- La vue d'ensemble en avait besoin pour répondre à « dans quelles villes
  -- sommes-nous » et « combien faisons-nous par mois » avec des chiffres réels
  -- plutôt qu'avec une estimation présentée comme un fait.
  --
  -- `city` est saisie à la main et NULL tant que personne ne l'a posée. La vue
  -- compte les non-renseignés à part et le dit — « 12 sur 18 situés » — parce
  -- qu'un classement de villes construit sur la moitié du parc et présenté
  -- comme complet est un chiffre faux.
  --
  -- `mrr` est le montant mensuel CONVENU pour cet établissement, en dirhams
  -- entiers. NULL = rien de convenu à la main, donc le tarif public du palier
  -- s'applique (basic 199 · pro 399 · ultra 1 499). Il existe pour Ultimate,
  -- qui est sur devis et n'a donc pas de prix public : sans cette colonne un
  -- client Ultimate compte pour zéro dans le total, ce qui est pire qu'un
  -- inconnu affiché comme inconnu. Renseigné, il l'emporte sur le tarif du
  -- palier — c'est ce qui permet aussi d'inscrire une remise consentie.
  city       TEXT,
  mrr        INTEGER,

  -- ── CYCLE COMMERCIAL ────────────────────────────────────────────────────
  -- Ces champs sont administrés uniquement depuis God Mode. `billing_cycle`
  -- décrit la périodicité du contrat payant ; les dates ISO (YYYY-MM-DD)
  -- restent lisibles dans D1 et évitent les décalages de fuseau horaire.
  -- `subscription_kind=trial` donne accès au magasin via status=active, tout en
  -- conservant une échéance distincte et visible par l'opérateur.
  subscription_kind  TEXT,          -- paid | trial (NULL = ancien contrat payé)
  billing_cycle      TEXT,          -- monthly | annual
  subscription_start TEXT,          -- YYYY-MM-DD
  subscription_end   TEXT,          -- YYYY-MM-DD
  trial_start        TEXT,          -- YYYY-MM-DD
  trial_end          TEXT,          -- YYYY-MM-DD
  trial_days         INTEGER,       -- durée convenue, en jours
  updated_ts INTEGER NOT NULL
);
-- Base déjà déployée : `node tools/d1-schema.mjs` dit ce qui manque.
-- Tant que city/mrr manquent, la console reste utilisable : /api/admin/overview
-- retombe sur une requête sans elles et répond `columns:{city:false,mrr:false}`,
-- que la vue d'ensemble affiche telle quelle au lieu de montrer « 0 ville ».
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
-- `number` is the per-week human ticket number the customer reads out at the
-- counter ("commande 047"). It is assigned inside the INSERT (one statement), so
-- two phones ordering in the same second can never be handed the same number.
CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,   -- "ord-<ts>-<rand>"
  merchant   TEXT NOT NULL,      -- tenant key (slugMerchant — same spine as sales/menus)
  number     INTEGER NOT NULL,   -- human ticket number (per merchant, Mon–Sun)
  mode       TEXT NOT NULL,      -- 'table' | 'takeout'
  table_no   TEXT,               -- table number for dine-in, empty for takeout
  total      INTEGER NOT NULL,   -- MAD, whole dirhams
  lines      TEXT NOT NULL,      -- JSON: [{id,name,qty,unitPrice,options,note}]
  status     TEXT NOT NULL,      -- 'pending' | 'accepted' | 'ready' | 'served' | 'rejected'
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  -- ── OrderPro · session de table (voir table_sessions, plus bas) ───────────
  -- Toute lecture qui les nomme garde son repli (queue.js) tant que la base
  -- déployée ne les a pas reçues : `node tools/d1-schema.mjs` dit lesquelles
  -- lui manquent, et `--apply --yes` les pose.
  session_id  TEXT,               -- table_sessions.id qui a passé la commande
  server_name TEXT,               -- le serveur affecté à la table, posé à l'acceptation
  menu_rev    INTEGER,            -- menus.updated_ts ayant servi à tarifer
  priced_ts   INTEGER,            -- NULL = prix jamais recalculés côté serveur
  client_ref  TEXT,               -- clé d'idempotence du téléphone
  paid_ts     INTEGER,            -- encaissée (au comptoir, ou avec l'addition de la table)
  -- ── Canaux extérieurs (voir le commentaire sous la table) ────────────────
  -- Elles n'étaient déclarées QUE dans un ALTER commenté : une base neuve ne
  -- les recevait donc jamais, et le repli en cascade de queue.js masquait leur
  -- absence en rendant `channel = 'kiwi'` et `ext_ref = ''` pour tout le monde.
  -- Une commande Glovo y perdait le numéro du prestataire — le seul mot commun
  -- entre son écran et le nôtre pour traiter une réclamation.
  channel     TEXT,               -- NULL/'kiwi' = relais OrderPro · 'glovo', 'shopify', 'generic'…
  ext_ref     TEXT,               -- le numéro que le prestataire imprime sur son bordereau
  customer    TEXT                -- JSON {name, phone, address, note} — le client, pas le coursier
);
-- The caisse polls "WHERE merchant = ? AND updated_ts > ?" — this index covers
-- both that and the per-merchant daily number lookup.
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders (merchant, updated_ts);

-- ── CANAUX EXTÉRIEURS · une commande Glovo est une commande ─────────────────
-- Le coursier attend devant le comptoir que l'imprimante DU PRESTATAIRE sorte
-- son étiquette. Kiwi connaît déjà le chemin « commande extérieure → ticket
-- cuisine → imprimante » : c'est exactement ce que fait OrderPro depuis le
-- téléphone d'un client. Une commande de livraison n'est pas un autre objet,
-- c'est la même commande avec une autre provenance.
--
-- D'où trois colonnes sur `orders` plutôt qu'une deuxième table : la caisse qui
-- interroge sa file, l'écran cuisine, l'acceptation par le personnel et
-- l'impression fonctionnent alors sans une ligne de code de plus. Une table
-- parallèle aurait imposé de tout écrire deux fois, et de se tromper une fois.
--
--   channel   NULL/'kiwi' = le relais OrderPro d'origine. 'glovo', 'shopify',
--             'generic'… = une commande arrivée par /api/channel/order.
--   ext_ref   le numéro que le prestataire imprime sur son propre bordereau.
--             C'est le seul mot commun entre son écran et le nôtre quand il
--             faut réconcilier une réclamation ; sans lui, « la commande 4712 »
--             ne désigne rien chez nous.
--   customer  JSON {name, phone, address, note}. Le coursier n'est pas le
--             client : un ticket de livraison sans adresse ni téléphone oblige
--             à retourner voir la tablette du prestataire, ce qui annule tout
--             le bénéfice.
--
-- Les trois colonnes sont déclarées dans le CREATE TABLE ci-dessus. Elles ne
-- l'étaient PAS avant le 2026-08-11 — seul un ALTER commenté les portait, donc
-- aucune base neuve ne les recevait, et le repli de queue.js rendait l'absence
-- invisible. Base déjà déployée : `node tools/d1-schema.mjs`.

-- Le jeton qu'un prestataire présente pour déposer une commande.
--
-- Pourquoi pas la porte du site : Glovo, Shopify ou un relais Make n'ont ni
-- session ni cookie et n'en auront jamais. Il leur faut une clé porteuse, donc
-- une clé qui ne vaut QUE ça — déposer une commande chez UN commerçant. Elle ne
-- lit rien, n'accepte rien, ne voit aucune autre commande.
--
-- Le secret n'est jamais stocké en clair : la ligne ne garde qu'un SHA-256.
-- SHA-256 et non PBKDF2 (contrairement aux mots de passe et aux codes
-- opérateur) parce qu'un jeton de 32 octets tirés au hasard n'a pas de
-- dictionnaire à lui opposer — l'étirement ne protégerait de rien et coûterait
-- 100 000 itérations à chaque commande déposée.
--
-- `id` voyage DANS le jeton (kwc.<id>.<secret>) : sans lui il faudrait
-- parcourir toutes les lignes pour retrouver à qui appartient un secret.
CREATE TABLE IF NOT EXISTS channel_links (
  id         TEXT PRIMARY KEY,   -- "chl-<uuid>", la partie publique du jeton
  merchant   TEXT NOT NULL,      -- slugMerchant — même colonne vertébrale que sales/orders
  channel    TEXT NOT NULL,      -- 'glovo' | 'shopify' | 'generic' | …
  label      TEXT,               -- ce que le commerçant a écrit ("Glovo Maarif")
  hash       TEXT NOT NULL,      -- SHA-256 hex du secret ; le secret n'est montré qu'UNE fois
  config     TEXT,               -- JSON propre au canal (domaine boutique, …)
  status     TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'paused'
  created_ts INTEGER NOT NULL,
  last_ts    INTEGER,            -- dernière commande reçue — « ça marche » se lit ici
  last_err   TEXT                -- dernier refus, pour diagnostiquer sans les logs
);
-- Un commerçant peut avoir plusieurs clés par canal (une par établissement, ou
-- une de rechange le temps d'une rotation), d'où l'index plutôt qu'une clé
-- primaire composite.
CREATE INDEX IF NOT EXISTS idx_channel_links_merchant ON channel_links (merchant, channel);

-- ── SHOPIFY · connecteur d'inventaire invisible ───────────────────────────
-- Le commerçant autorise Kiwi depuis Intégrations ; aucun jeton Shopify ne
-- traverse le navigateur. Les jetons sont chiffrés en AES-GCM avec
-- SHOPIFY_TOKEN_KEY avant d'entrer dans D1. `channel_links` reste le chemin des
-- anciennes connexions webhook-only et porte aussi l'URL de webhook créée par
-- OAuth, mais jamais le jeton Admin API.
CREATE TABLE IF NOT EXISTS shopify_connections (
  merchant          TEXT PRIMARY KEY,
  shop_domain       TEXT NOT NULL UNIQUE,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_expires_ts  INTEGER NOT NULL DEFAULT 0,
  refresh_expires_ts INTEGER NOT NULL DEFAULT 0,
  scopes            TEXT NOT NULL DEFAULT '',
  location_id       TEXT NOT NULL DEFAULT '',
  location_name     TEXT NOT NULL DEFAULT '',
  channel_link_id   TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'needs_location',
  connected_ts      INTEGER NOT NULL,
  updated_ts        INTEGER NOT NULL,
  last_sync_ts      INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_shopify_connections_shop
  ON shopify_connections (shop_domain, status);

-- L'état OAuth est une capacité courte, à usage unique. Seul son SHA-256 est
-- stocké ; voler une copie de D1 ne donne donc pas une URL de callback valide.
CREATE TABLE IF NOT EXISTS shopify_oauth_states (
  state_hash  TEXT PRIMARY KEY,
  merchant    TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  created_ts  INTEGER NOT NULL,
  expires_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_expiry
  ON shopify_oauth_states (expires_ts);

-- Une correspondance exacte lie une variante Kiwi à l'InventoryItem Shopify
-- d'un emplacement précis. Les noms ne sont jamais une clé : barcode d'abord,
-- SKU unique ensuite, sinon la ligne reste non liée.
CREATE TABLE IF NOT EXISTS shopify_variant_links (
  merchant             TEXT NOT NULL,
  kiwi_variant_id      TEXT NOT NULL,
  shopify_variant_id   TEXT NOT NULL,
  inventory_item_id    TEXT NOT NULL,
  location_id          TEXT NOT NULL,
  match_method         TEXT NOT NULL,
  last_shopify_quantity INTEGER,
  status               TEXT NOT NULL DEFAULT 'active',
  updated_ts            INTEGER NOT NULL,
  PRIMARY KEY (merchant, kiwi_variant_id),
  UNIQUE (merchant, shopify_variant_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_variant_links_inventory
  ON shopify_variant_links (merchant, inventory_item_id, location_id);

-- File durable et coalescée : dix ventes rapides d'une même variante donnent
-- une seule cible finale. Le passage caisse reste réussi même si Shopify est
-- indisponible ; le connecteur réessaie en arrière-plan.
CREATE TABLE IF NOT EXISTS shopify_sync_outbox (
  id               TEXT PRIMARY KEY,
  merchant         TEXT NOT NULL,
  kiwi_variant_id  TEXT NOT NULL,
  target_quantity  INTEGER NOT NULL,
  source_rev       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_ts  INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT NOT NULL DEFAULT '',
  created_ts       INTEGER NOT NULL,
  updated_ts       INTEGER NOT NULL,
  UNIQUE (merchant, kiwi_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_outbox_ready
  ON shopify_sync_outbox (status, next_attempt_ts, updated_ts);

-- Shopify peut livrer un webhook plusieurs fois. Son identifiant de livraison
-- est la clé d'idempotence, pas l'heure ni le corps de la commande.
CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  shop_domain  TEXT NOT NULL,
  webhook_id   TEXT NOT NULL,
  topic        TEXT NOT NULL,
  received_ts  INTEGER NOT NULL,
  PRIMARY KEY (shop_domain, webhook_id)
);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_received
  ON shopify_webhook_events (received_ts);

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

-- ── STOCK RÉEL · REGISTRE DE MOUVEMENTS ──────────────────────────────────
-- Une quantité de stock n'est jamais écrasée : elle est la somme de ce journal
-- append-only. L'identifiant vient du client et rend le rejeu hors-ligne
-- idempotent. `qty_milli` stocke l'unité de référence × 1 000 (g, ml, pièce),
-- donc 1,250 kg ou 0,5 pièce traversent SQLite sans flottant cumulatif.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              TEXT PRIMARY KEY,
  merchant        TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  variant_id      TEXT NOT NULL DEFAULT '',
  location_id     TEXT NOT NULL DEFAULT 'principal',
  qty_milli       INTEGER NOT NULL,              -- signé : entrée +, sortie −
  reason          TEXT NOT NULL,                 -- opening|receipt|sale|count|loss|transfer-*|production-*|return
  unit_cost_cents INTEGER,                       -- coût d'entrée gelé ; NULL si inconnu
  currency        TEXT NOT NULL DEFAULT 'MAD',
  ref_type        TEXT NOT NULL DEFAULT '',       -- sale|receipt|count|transfer|production|manual
  ref_id          TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  actor           TEXT NOT NULL DEFAULT '',
  occurred_ts     INTEGER NOT NULL,
  srv_ts          INTEGER NOT NULL,              -- curseur serveur monotone par magasin
  reversal_of     TEXT NOT NULL DEFAULT '',       -- correction append-only, jamais DELETE
  meta            TEXT,
  created_ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_cursor
  ON inventory_movements (merchant, srv_ts);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_merchant_item
  ON inventory_movements (merchant, item_id, occurred_ts);
CREATE TABLE IF NOT EXISTS inventory_sync_sequences (
  merchant TEXT PRIMARY KEY,
  last_ts   INTEGER NOT NULL
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
  hospitality   TEXT NOT NULL DEFAULT '{}', -- hotel identity, preferences, allergies
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

-- Atomic cursor allocator for /api/clients. Reading MAX(srv_ts) and then
-- writing Date.now() is racy: two tills can receive the same cursor, causing a
-- third device to skip one of the two records forever after advancing `since`.
CREATE TABLE IF NOT EXISTS client_sync_sequences (
  merchant TEXT PRIMARY KEY,
  last_ts  INTEGER NOT NULL
);

-- Idempotence for loyalty credited by an on-duty employee. A payment screen
-- can be retried after weak Wi-Fi; the same table settlement must never award
-- points twice.
CREATE TABLE IF NOT EXISTS employee_loyalty_events (
  merchant  TEXT NOT NULL,
  ref       TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount    INTEGER NOT NULL DEFAULT 0,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, ref)
);

-- ── Journal des modules (qui a activé/désactivé quoi, où, quand) ────────────
-- Une ligne PAR MODULE CHANGÉ, écrite par functions/api/admin/config.js à chaque
-- PUT de l'opérateur. Couper un module n'efface jamais ses données — la table
-- `store_docs`, le catalogue, les réservations restent en place et reviennent
-- telles quelles à la réactivation. Ce journal est donc le seul endroit qui
-- garde la trace du geste lui-même, ce que l'état courant de merchant_config ne
-- dit pas : il ne montre que la dernière valeur.
--
-- `actor` est l'identité du CODE OPÉRATEUR utilisé, pas une adresse IP : le
-- cookie kiwi_op est le même pour tout le monde (HMAC du secret), donc
-- functions/_middleware.js pose en plus un cookie kiwi_op_id signé au moment où
-- un code est vérifié. Sans lui (accès par le laissez-passer équipe, ou session
-- ouverte avant cette version) on inscrit 'equipe' — honnête plutôt que faux.
CREATE TABLE IF NOT EXISTS config_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant   TEXT NOT NULL,          -- l'établissement touché (slug)
  feature    TEXT NOT NULL,          -- la clé de module ('terminaux', 'orderpro', …)
  enabled    INTEGER NOT NULL,       -- 1 = activé, 0 = désactivé
  actor      TEXT NOT NULL DEFAULT '',  -- libellé du code opérateur, ou 'equipe'
  actor_id   TEXT NOT NULL DEFAULT '',  -- operators.id quand il est connu
  ts         INTEGER NOT NULL           -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_audit_merchant ON config_audit (merchant, ts);

-- ── Journal des ventes de test (qui a sorti quelle vente des livres) ────────
-- Une ligne par geste — annulation ET remise —, écrite par functions/api/admin/
-- sales.js. Jamais supprimée, y compris quand la vente est remise dans les
-- livres : « cette vente a été sortie le 12, remise le 14 » est précisément ce
-- qu'un litige demande, et un journal qui s'efface quand on annule l'annulation
-- ne répond à rien.
--
-- Les colonnes montant / méthode / référence / sale_ts sont RECOPIÉES depuis la
-- vente au moment du geste. C'est volontairement redondant avec `sales` : le
-- journal doit rester lisible même si le compte est supprimé plus tard (la
-- « zone dangereuse » de la console efface les ventes), et une écriture datée
-- qui renvoie à une ligne disparue n'est pas une trace.
--
-- `impact` est l'instantané JSON de ce que la console a MONTRÉ à l'opérateur
-- avant qu'il confirme — chiffres retirés, lignes de stock concernées, jour
-- commercial touché, avertissements affichés. Sans lui, on saurait qu'une vente
-- a été sortie, pas ce qu'on avait dit qu'elle emporterait avec elle.
CREATE TABLE IF NOT EXISTS sale_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant   TEXT NOT NULL,             -- l'établissement, jamais un autre (voir sales.js)
  sale_id    TEXT NOT NULL,             -- sales.id
  action     TEXT NOT NULL,             -- 'void' | 'restore'
  reason     TEXT NOT NULL DEFAULT '',  -- le motif imposé
  note       TEXT NOT NULL DEFAULT '',  -- l'explication écrite
  actor      TEXT NOT NULL DEFAULT '',  -- libellé du code opérateur, ou 'equipe'
  actor_id   TEXT NOT NULL DEFAULT '',  -- operators.id quand il est connu
  amount       INTEGER NOT NULL DEFAULT 0, -- legacy whole MAD
  amount_cents INTEGER,                    -- centimes; authoritative when present. Legacy rows use amount (whole MAD).
  method       TEXT NOT NULL DEFAULT '',
  ref        TEXT NOT NULL DEFAULT '',
  sale_ts    INTEGER NOT NULL DEFAULT 0,
  impact     TEXT NOT NULL DEFAULT '',  -- JSON : ce qui était annoncé comme touché
  ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_audit_merchant ON sale_audit (merchant, ts);
CREATE INDEX IF NOT EXISTS idx_sale_audit_sale ON sale_audit (sale_id);

-- ── Journal des comptes (adresses e-mail, envois de réinitialisation) ───────
-- Changer l'adresse de connexion d'un client, c'est changer la clé de sa porte.
-- Le geste doit donc laisser exactement la même trace qu'une coupure de module :
-- quoi, pour qui, par qui, quand, et pourquoi.
--
-- `prev` / `next` portent les adresses AVANT et APRÈS. C'est ce qui rend la
-- reprise possible : si le client conteste, la console relit la dernière ligne
-- et remet l'ancienne adresse (une nouvelle ligne 'email-revert', jamais une
-- suppression).
--
-- Pour une réinitialisation de mot de passe, `next` porte l'adresse de
-- destination MASQUÉE (b••••@domaine.ma) et RIEN D'AUTRE. Le lien lui-même
-- n'entre jamais ici : un journal consultable par tout opérateur qui
-- contiendrait des liens de réinitialisation valides serait un trousseau de
-- clés des comptes clients.
CREATE TABLE IF NOT EXISTS account_audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL DEFAULT '',
  merchant   TEXT NOT NULL DEFAULT '',  -- l'établissement ouvert dans la console, pour retrouver la ligne par magasin
  action     TEXT NOT NULL,             -- 'email' | 'email-revert' | 'contact' | 'billing' | 'reset'
  prev       TEXT NOT NULL DEFAULT '',
  next       TEXT NOT NULL DEFAULT '',
  reason     TEXT NOT NULL DEFAULT '',
  actor      TEXT NOT NULL DEFAULT '',
  actor_id   TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',  -- JSON : état d'envoi, vérification
  ts         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_audit ON account_audit (account_id, ts);
CREATE INDEX IF NOT EXISTS idx_account_audit_merchant ON account_audit (merchant, ts);

-- ── Help Centre: published knowledge + a real, auditable support queue ─────
-- Articles are intentionally global product knowledge. `store_types` scopes
-- what a merchant sees; all three languages are mandatory before publication.
CREATE TABLE IF NOT EXISTS support_articles (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL,
  store_types   TEXT NOT NULL DEFAULT '["all"]',
  feature_key   TEXT NOT NULL DEFAULT '',
  feature_hash  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft',
  revision      INTEGER NOT NULL DEFAULT 1,
  title_fr      TEXT NOT NULL DEFAULT '',
  title_en      TEXT NOT NULL DEFAULT '',
  title_ar      TEXT NOT NULL DEFAULT '',
  body_fr       TEXT NOT NULL DEFAULT '',
  body_en       TEXT NOT NULL DEFAULT '',
  body_ar       TEXT NOT NULL DEFAULT '',
  created_ts    INTEGER NOT NULL,
  updated_ts    INTEGER NOT NULL,
  published_ts  INTEGER,
  actor         TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_support_articles_status ON support_articles (status, category, updated_ts);

CREATE TABLE IF NOT EXISTS support_article_versions (
  id          TEXT PRIMARY KEY,
  article_id  TEXT NOT NULL,
  revision    INTEGER NOT NULL,
  snapshot    TEXT NOT NULL,
  actor       TEXT NOT NULL,
  ts          INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_article_revision ON support_article_versions (article_id, revision);

CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  reference       TEXT NOT NULL UNIQUE,
  merchant        TEXT NOT NULL,
  store_type      TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL,
  priority        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  channel         TEXT NOT NULL,
  contact         TEXT NOT NULL,
  summary         TEXT NOT NULL,
  diagnostics     TEXT NOT NULL DEFAULT '{}',
  assignee        TEXT NOT NULL DEFAULT '',
  created_ts      INTEGER NOT NULL,
  updated_ts      INTEGER NOT NULL,
  closed_ts       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_queue ON support_tickets (status, priority, updated_ts);
CREATE INDEX IF NOT EXISTS idx_support_tickets_merchant ON support_tickets (merchant, updated_ts);

CREATE TABLE IF NOT EXISTS support_messages (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  delivery    TEXT NOT NULL DEFAULT '',
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, ts);

CREATE TABLE IF NOT EXISTS support_attachments (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL,
  merchant    TEXT NOT NULL,
  object_key  TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_attachments (ticket_id, created_ts);

-- Failed searches are deliberately anonymous: no merchant/account/IP column.
CREATE TABLE IF NOT EXISTS support_searches (
  id          TEXT PRIMARY KEY,
  phrase      TEXT NOT NULL,
  lang        TEXT NOT NULL,
  store_type  TEXT NOT NULL DEFAULT '',
  ts          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS support_feedback (
  id          TEXT PRIMARY KEY,
  article_id  TEXT NOT NULL,
  helpful     INTEGER NOT NULL,
  store_type  TEXT NOT NULL DEFAULT '',
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_feedback_article ON support_feedback (article_id, ts);

-- ── Liens de réinitialisation de mot de passe ───────────────────────────────
-- Le lien vaut « je suis ce commerçant » : il est donc traité comme un mot de
-- passe, et stocké comme un mot de passe — c'est-à-dire pas stocké du tout.
--
-- Le jeton envoyé au client s'écrit "<selector>.<verifier>". Seul `selector`
-- sert à retrouver la ligne ; de `verifier` on ne garde que le HMAC. Une fuite
-- de cette table ne donne donc AUCUN lien utilisable, et c'est la raison d'être
-- de la découpe en deux moitiés : chercher directement par le secret obligerait
-- à l'indexer en clair.
--
-- Usage unique : la consommation fait « UPDATE … SET used_ts = ? WHERE selector
-- = ? AND used_ts IS NULL » en UN énoncé, donc deux ouvertures simultanées du
-- même lien ne peuvent pas réussir toutes les deux. Une réinitialisation
-- réussie périme en plus tous les autres liens vivants du compte : le client
-- qui a demandé trois fois ne laisse pas deux clés dans la nature.
--
-- Les lignes périmées ne sont pas balayées par une tâche de fond : elles sont
-- inoffensives (expires_ts est vérifié à la lecture) et la demande suivante
-- pour le même compte les efface.
CREATE TABLE IF NOT EXISTS reset_tokens (
  selector   TEXT PRIMARY KEY,          -- moitié publique du jeton, l'index
  account_id TEXT NOT NULL,
  verifier   TEXT NOT NULL,             -- HMAC de la moitié secrète, jamais la moitié elle-même
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts    INTEGER,                   -- non NULL = déjà consommé, plus jamais valable
  actor      TEXT NOT NULL DEFAULT '',  -- l'opérateur qui a déclenché l'envoi ('client' si demandé depuis l'écran de connexion)
  actor_id   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reset_account ON reset_tokens (account_id, created_ts);

-- ═══════════════════════════════════════════════════════════════════════════
-- ORDERPRO · LA SESSION DE TABLE — le téléphone du client, assis quelque part
-- ═══════════════════════════════════════════════════════════════════════════
-- Jusqu'ici, savoir le slug d'un commerce suffisait à commander chez lui, pour
-- toujours, depuis n'importe où. Le relais était donc honnête (le personnel
-- accepte chaque commande à la main) mais sans mémoire : rien ne distinguait le
-- client assis en terrasse de quelqu'un qui a gardé le lien et commande de chez
-- lui à deux heures du matin.
--
-- Une session est ce qui manquait : un lien VIVANT entre un téléphone et une
-- table, qui s'ouvre au moment où le client pose son téléphone sur le tag, et
-- que la caisse peut FERMER. Encaisser l'addition la ferme ; à partir de là le
-- téléphone n'affiche plus la carte mais un remerciement, et ses commandes sont
-- refusées jusqu'au prochain contact avec le tag.
--
-- `id` EST la capacité — pas de mot de passe à côté, comme /api/order?id=… qui
-- fonctionne déjà ainsi. D'où 22 caractères tirés au sort (≈130 bits) et non un
-- compteur : un identifiant devinable rendrait la fermeture décorative.
--
-- Ce que ça ne prétend PAS être : une identité. On ne sait pas QUI est assis là,
-- on ne le stocke pas, et on ne veut pas le savoir. Une session ne porte aucune
-- donnée personnelle — juste « un téléphone est en train de commander à la 7 ».
CREATE TABLE IF NOT EXISTS table_sessions (
  id          TEXT PRIMARY KEY,               -- "tsx-<22 caractères aléatoires>" ; c'est le secret
  merchant    TEXT NOT NULL,                  -- slugMerchant — même colonne vertébrale que sales/orders/menus
  mode        TEXT NOT NULL DEFAULT 'table',  -- 'table' | 'takeout'
  table_no    TEXT NOT NULL DEFAULT '',       -- vide pour un retrait au comptoir
  status      TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  closed_by   TEXT NOT NULL DEFAULT '',       -- 'settle' | 'caisse' | 'expiry' — pourquoi elle s'est fermée
  opened_ts   INTEGER NOT NULL,
  seen_ts     INTEGER NOT NULL,               -- dernier signe de vie du téléphone : c'est LUI qui allume la table sur le plan de salle
  closed_ts   INTEGER
);
-- Une seule session VIVANTE par table. L'index PARTIEL est ce qui rend la règle
-- vraie sans balayage : les sessions closes s'empilent sans jamais bloquer le
-- client suivant. Même figure que pairings_code_live.
--
-- La table EST l'unité, pas le téléphone : deux personnes attablées ensemble
-- partagent la session, donc la même addition — et l'encaisser les libère
-- toutes les deux. C'est ce qu'on veut.
--
-- `mode = 'table'` dans la condition, sinon la règle mordrait aussi sur les
-- retraits au comptoir : ils ont tous `table_no = ''`, et le deuxième client à
-- commander à emporter se serait heurté à l'unicité du premier.
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_live
  ON table_sessions (merchant, table_no) WHERE status = 'open' AND mode = 'table';
-- La caisse relève « qui est assis en ce moment » à chaque tour de sondage.
CREATE INDEX IF NOT EXISTS idx_tsess_live ON table_sessions (merchant, status, seen_ts);

-- ── TABLE TRANSFERS & MERGES · Traçabilité des déplacements de tables ───────
-- Déplacer ou fusionner une table ne doit jamais effacer l'historique comptable.
-- Chaque déplacement d'une session ou d'une commande est consigné ici, avec la
-- table d'origine, la table de destination, le serveur et l'horodatage.
CREATE TABLE IF NOT EXISTS table_transfers (
  id           TEXT PRIMARY KEY,  -- "trf-<uuid>"
  merchant     TEXT NOT NULL,
  from_table   TEXT NOT NULL,
  to_table     TEXT NOT NULL,
  session_id   TEXT,
  server       TEXT,
  covers       INTEGER,
  orders_count INTEGER,
  is_merge     INTEGER NOT NULL DEFAULT 0,  -- 1 si fusion de tables
  created_ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_table_transfers_live ON table_transfers (merchant, created_ts);

-- ── KITCHEN VOIDS & PERTES · Traçabilité des annulations et pertes cuisine ──
-- Annuler ou modifier un plat envoyé en cuisine ne doit jamais effacer l'écriture.
-- Chaque annulation est tracée avec son motif (erreur, changement client, perte, retour),
-- l'impact perte matière éventuel et l'accord de la cuisine.
CREATE TABLE IF NOT EXISTS kitchen_voids (
  id           TEXT PRIMARY KEY,  -- "voi-<uuid>"
  merchant     TEXT NOT NULL,
  order_id     TEXT,
  table_no     TEXT,
  item_id      TEXT,
  item_name    TEXT,
  qty          INTEGER NOT NULL,
  price        INTEGER,
  reason       TEXT NOT NULL,    -- 'client_change' | 'order_error' | 'kitchen_waste' | 'quality_return'
  is_waste     INTEGER NOT NULL DEFAULT 0,  -- 1 si perte matière réelle
  actor        TEXT,             -- serveur ou caissier
  status       TEXT NOT NULL DEFAULT 'approved', -- 'pending' | 'approved' | 'rejected'
  created_ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kitchen_voids_live ON kitchen_voids (merchant, created_ts);

-- ── PRÉSENCE DE LA CAISSE · le service est-il ouvert ? ──────────────────────
-- La protection contre la commande passée de chez soi ne peut pas venir du
-- téléphone : il ment. Elle vient d'ici. La caisse interroge déjà sa file toutes
-- les six secondes avec une requête authentifiée ; on en note l'heure, et ouvrir
-- une session exige que le comptoir ait donné signe de vie récemment.
--
-- Conséquence voulue : commerce fermé ⇒ caisse éteinte ⇒ aucune session ne
-- s'ouvre, et le téléphone dit « le service n'est pas ouvert » — ce qui est vrai.
-- C'est une porte qui se ferme toute seule le soir, sans horaire à saisir.
CREATE TABLE IF NOT EXISTS order_desk (
  merchant TEXT PRIMARY KEY,     -- slugMerchant
  seen_ts  INTEGER NOT NULL      -- dernier sondage authentifié de /api/order/queue
);

-- ── LA BASE DÉJÀ DÉPLOYÉE ──────────────────────────────────────────────────
-- « CREATE TABLE IF NOT EXISTS » ne touche jamais une table qui existe : tout
-- ce que ce fichier ajoute après le premier déploiement n'atteint la production
-- que si quelqu'un le pose à la main. Cette consigne a été portée pendant un an
-- par des ALTER en commentaire, et elle a échoué trois fois — toujours en
-- silence, parce que chaque lecture qui nomme une colonne absente échoue à
-- l'intérieur d'un `catch` qui la traduit en réponse vide ou en refus :
--
--   · 2026-07-28  merchant_config.status absente → /api/config a rendu
--     `{features:{}, pins:[]}` à TOUS les commerçants pendant 45 minutes.
--   · 2026-08-08  la même → /api/employee refusait chaque employé, bon code en
--     main, avec « Email ou code personnel incorrect. »
--   · 2026-08-11  orders.channel/ext_ref/customer n'ont JAMAIS été déclarées
--     dans le CREATE TABLE : aucune base neuve ne les avait, et le repli en
--     cascade de queue.js rendait l'absence invisible.
--
-- La consigne n'est donc plus écrite ici. Elle se lit :
--
--   node tools/d1-schema.mjs              # ce qui manque à la base déployée
--   node tools/d1-schema.mjs --apply --yes  # le poser
--
-- L'outil DÉDUIT l'écart de ce fichier — il n'a pas de liste à tenir à jour, et
-- ne peut donc pas dériver de lui. `tools/d1-schema-test.mjs` verrouille cette
-- propriété : ajouter une colonne ici sans que l'outil sache la lire fait
-- échouer le test, tout de suite, au lieu de la production dans trois semaines.
--
-- Chaque colonne additive est NULL pour toute ligne écrite avant elle, et toute
-- lecture qui les nomme garde son repli — sans quoi une base pas encore migrée
-- renverrait une file VIDE au lieu d'une erreur, et le comptoir ne verrait plus
-- rien sans que personne ne le signale.
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id);
-- Un double-tap sur « Commander », ou un réseau qui repasse, ne doit pas
-- imprimer deux tickets. Index PARTIEL : les commandes sans client_ref (toutes
-- celles d'avant, et les canaux extérieurs qui ont déjà leur ext_ref) n'y
-- entrent pas et ne peuvent donc pas se gêner entre elles.
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_ref
  ON orders (merchant, client_ref) WHERE client_ref IS NOT NULL;
-- Les prestataires et Shopify rejouent leurs webhooks. La relecture dans les
-- handlers évite le cas normal, cet index tranche la course où deux requêtes
-- ont fait cette relecture avant que l'une des deux n'insère.
CREATE UNIQUE INDEX IF NOT EXISTS orders_ext_ref
  ON orders (merchant, channel, ext_ref)
  WHERE ext_ref IS NOT NULL AND ext_ref <> '';

-- ── Quota journalier de l'assistant IA côté serveur ───────────────────────
-- /api/ai/ask est le modèle de SECOURS, proposé seulement aux appareils qui ne
-- peuvent pas faire tourner l'assistant dans le navigateur (pas de WebGPU, pas
-- de place, pas de mémoire). Il est facturé à l'appel, donc il se compte.
--
-- Le plafond est un garde-fou de DÉPENSE, pas une punition : il existe pour
-- qu'une boucle de câblage cassée ne consomme pas l'allocation du compte en une
-- nuit. La borne qui marche toujours reste `max_tokens` côté endpoint ; cette
-- table n'est que la seconde ligne.
--
-- Tant qu'elle n'est PAS passée sur la base déjà déployée, functions/api/ai/
-- ask.js laisse passer les appels — livrer une fonctionnalité morte serait pire
-- qu'un compteur absent. À appliquer à la main, comme les ALTER ci-dessus.
CREATE TABLE IF NOT EXISTS ai_usage (
  merchant TEXT    NOT NULL,     -- slugMerchant
  day      TEXT    NOT NULL,     -- AAAA-MM-JJ, UTC
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, day)
);

CREATE TABLE IF NOT EXISTS ai_usage_kind (
  merchant TEXT    NOT NULL,     -- slugMerchant
  day      TEXT    NOT NULL,     -- AAAA-MM-JJ, UTC
  kind     TEXT    NOT NULL,     -- 'ask', 'invoice', 'index', 'resolve', 'transcribe', 'image'
  calls    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant, day, kind)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- KIWI OPERATIONS · commandes durables vers les fournisseurs externes
-- ═══════════════════════════════════════════════════════════════════════════
-- Un bouton qui appelle WhatsApp, un prestataire de paiement, un export de
-- paie ou un flux d'achat n'est pas un toast : c'est une commande métier. Elle
-- garde le même identifiant quand le réseau revient, appartient explicitement
-- à un établissement, expose son vrai état (bloquée si le fournisseur manque)
-- et laisse une trace append-only de chaque transition.
CREATE TABLE IF NOT EXISTS operational_commands (
  id              TEXT PRIMARY KEY,
  merchant        TEXT NOT NULL,
  domain          TEXT NOT NULL,
  action          TEXT NOT NULL,
  status          TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  payload         TEXT NOT NULL,
  result          TEXT,
  requested_by    TEXT NOT NULL DEFAULT '',
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT NOT NULL DEFAULT '',
  created_ts      INTEGER NOT NULL,
  updated_ts      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency
  ON operational_commands (merchant, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ops_merchant_domain_time
  ON operational_commands (merchant, domain, updated_ts DESC);

CREATE TABLE IF NOT EXISTS operational_events (
  id          TEXT PRIMARY KEY,
  command_id  TEXT NOT NULL,
  merchant    TEXT NOT NULL,
  event       TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT,
  created_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_events_command
  ON operational_events (merchant, command_id, created_ts);

-- ═══════════════════════════════════════════════════════════════════════════
-- OBSERVABILITÉ · Rapporteur d'erreurs client & télémétrie fail-soft
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS client_errors (
  id            TEXT PRIMARY KEY,
  merchant      TEXT NOT NULL DEFAULT '',
  message       TEXT NOT NULL,
  file          TEXT NOT NULL DEFAULT '',
  line          INTEGER NOT NULL DEFAULT 0,
  col           INTEGER NOT NULL DEFAULT 0,
  stack         TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '',
  version       TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  count         INTEGER NOT NULL DEFAULT 1,
  first_seen_ts INTEGER NOT NULL,
  last_seen_ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_errors_seen ON client_errors (merchant, last_seen_ts);
CREATE INDEX IF NOT EXISTS idx_client_errors_sig ON client_errors (merchant, file, line, message);

-- ═══════════════════════════════════════════════════════════════════════════
-- FACTURES DE VENTE · Émission et numérotation D1 idempotente
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sale_invoices (
  merchant   TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  number     TEXT NOT NULL,
  sale_id    TEXT NOT NULL,
  customer   TEXT,
  snapshot   TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, sale_id),
  UNIQUE (merchant, seq)
);
CREATE INDEX IF NOT EXISTS idx_sale_invoices_merchant_seq ON sale_invoices (merchant, seq);
-- Phase AI 1d-a: durable, append-only sale cancellation facts. The actor is an
-- account/team id, never a PIN or operator code. `sales.void_*` remains the
-- mutable reconciliation state consumed by /api/feed.
CREATE TABLE IF NOT EXISTS sale_void_history (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  voided_ts INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (merchant, sale_id)
);
CREATE INDEX IF NOT EXISTS idx_sale_void_history_merchant_ts
  ON sale_void_history (merchant, voided_ts);

-- Phase AI 1d-c: terminal-bound, append-only financial reconciliation events.
CREATE TABLE IF NOT EXISTS cash_session_events (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  session_id TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open','movement','handover','close')),
  expected_cents INTEGER,
  counted_cents INTEGER,
  gap_cents INTEGER,
  movement_kind TEXT,
  movement_amount_cents INTEGER,
  movement_reason TEXT,
  actor_id TEXT NOT NULL,
  counterparty_actor_id TEXT,
  opened_ts INTEGER NOT NULL,
  occurred_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_merchant_ts
  ON cash_session_events (merchant, occurred_ts);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_terminal_session
  ON cash_session_events (merchant, terminal_id, session_id, occurred_ts);

-- Phase AI 1d-d: one immutable timestamp per canonical order-course milestone.
CREATE TABLE IF NOT EXISTS order_course (
  merchant TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_number INTEGER,
  accepted_ts INTEGER,
  sent_ts INTEGER,
  ready_ts INTEGER,
  served_ts INTEGER,
  closed_ts INTEGER,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, order_id)
);
CREATE INDEX IF NOT EXISTS idx_order_course_merchant_sent
  ON order_course (merchant, sent_ts);

-- ── Relais d'impression (migrations/2026-08-21-print-relay.sql) ─────────────

CREATE TABLE IF NOT EXISTS print_bridges (
  id           TEXT PRIMARY KEY,
  merchant     TEXT NOT NULL,
  name         TEXT,
  platform     TEXT,
  version      TEXT,
  token_hash   TEXT NOT NULL UNIQUE,   -- sha256 du jeton porteur, jamais le jeton
  created_ts   INTEGER NOT NULL,
  last_seen_ts INTEGER,
  revoked_ts   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_print_bridges_merchant ON print_bridges (merchant, revoked_ts);

CREATE TABLE IF NOT EXISTS print_bridge_codes (
  code       TEXT NOT NULL,
  merchant   TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  used_ts    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_bridge_codes_live ON print_bridge_codes (code) WHERE used_ts IS NULL;

CREATE TABLE IF NOT EXISTS print_jobs (
  id         TEXT PRIMARY KEY,
  merchant   TEXT NOT NULL,
  bridge_id  TEXT,                       -- NULL = n'importe quel pont du commerce
  kind       TEXT,                       -- receipt · kitchen · label · test · drawer
  target     TEXT NOT NULL,              -- JSON {ip,port} | {osPrinter}
  data_b64   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued · claimed · done · failed · expired
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  claimed_ts INTEGER,
  done_ts    INTEGER,
  bytes      INTEGER,
  error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs (merchant, status, created_ts);

-- ── Inventaire physique universel & validation propriétaire (migrations/2026-08-22-inventory-counts.sql)

CREATE TABLE IF NOT EXISTS inventory_counts (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  store_id TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL DEFAULT '',
  employee_id TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  employee_role TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewer_id TEXT DEFAULT '',
  reviewer_name TEXT DEFAULT '',
  review_decision TEXT DEFAULT '',
  review_note TEXT DEFAULT '',
  applied_at INTEGER,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_counted REAL NOT NULL DEFAULT 0,
  total_system REAL NOT NULL DEFAULT 0,
  total_diff REAL NOT NULL DEFAULT 0,
  total_variance_cost_mad REAL NOT NULL DEFAULT 0,
  abs_variance_cost_mad REAL NOT NULL DEFAULT 0,
  lines_json TEXT NOT NULL DEFAULT '[]',
  meta_json TEXT DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_date ON inventory_counts (merchant, submitted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_merchant_status ON inventory_counts (merchant, status);

CREATE TABLE IF NOT EXISTS inventory_count_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  event TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  via TEXT,
  note TEXT,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_count_events_merchant_count ON inventory_count_events (merchant, count_id, ts);
