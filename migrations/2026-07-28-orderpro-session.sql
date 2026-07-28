-- ═══════════════════════════════════════════════════════════════════════════
-- Kiwi · rattrapage de la base de PRODUCTION — OrderPro, session de table
--
--   npx wrangler d1 execute kiwi-sales --remote \
--     --file=migrations/2026-07-28-orderpro-session.sql
--
-- Constaté sur la base vivante (kiwi-sales, 78c72b8d-…) le 28 juillet 2026 :
-- `orders` s'arrête à `customer`, et NI `table_sessions` NI `order_desk`
-- n'existent. Le code, lui, est écrit depuis longtemps pour s'en passer — chaque
-- lecture qui nomme ces colonnes a son repli, chaque écriture son catch. Rien
-- ne CASSE donc en production ; tout DÉGRADE en silence, ce qui est pire :
--
--   · client_ref + son index unique — absents ⇒ l'INSERT riche de
--     functions/api/order/index.js échoue à chaque commande et retombe sur la
--     version sans colonnes. L'idempotence est INACTIVE : un double-tap sort
--     bien deux tickets, deux numéros, deux fois le même plat en cuisine.
--     C'est exactement la panne que la clé a été écrite pour empêcher.
--   · order_desk — absente ⇒ deskOpen() rend `true` par repli assumé. La règle
--     « commerce fermé, caisse éteinte, plus de commande » ne mord jamais :
--     qui détient le slug commande à trois heures du matin depuis chez lui.
--   · table_sessions — absente ⇒ encaisser l'addition ne coupe rien. Le
--     téléphone du client garde la carte ouverte après son départ.
--   · priced_ts / menu_rev — absentes ⇒ aucune trace de « ces prix viennent
--     bien de la carte publiée », donc rien à montrer si un ticket est contesté.
--   · paid_ts / session_id / server_name — absentes ⇒ la file rend toujours
--     `paid:false`, et un ticket cuisine ne porte le nom d'aucun serveur.
--
-- Purement ADDITIF : aucun DROP, aucun UPDATE, aucune colonne redéfinie. Les
-- commandes déjà en base gardent leurs valeurs et reçoivent NULL partout
-- ailleurs, ce que tout le code lit déjà comme « pas renseigné ».
--
-- Les six ALTER ne sont pas idempotents (SQLite n'a pas d'ADD COLUMN IF NOT
-- EXISTS) : relancé sur une base déjà à jour, le script s'arrête sur
-- « duplicate column name ». C'est sans danger — rien n'est modifié — mais
-- vérifiez d'abord avec :
--   npx wrangler d1 execute kiwi-sales --remote \
--     --command "SELECT name FROM pragma_table_info('orders')"
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Les six colonnes additives sur `orders` ─────────────────────────────
ALTER TABLE orders ADD COLUMN session_id  TEXT;
ALTER TABLE orders ADD COLUMN server_name TEXT;
ALTER TABLE orders ADD COLUMN menu_rev    INTEGER;
ALTER TABLE orders ADD COLUMN priced_ts   INTEGER;
ALTER TABLE orders ADD COLUMN client_ref  TEXT;
ALTER TABLE orders ADD COLUMN paid_ts     INTEGER;

-- L'index PARTIEL est ce qui rend l'idempotence vraie : deux commandes peuvent
-- partager un `client_ref` NULL (le QR historique n'en envoie pas), mais deux
-- clés identiques chez le même commerçant sont refusées par la base elle-même,
-- et non par une relecture qui peut perdre la course.
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_ref
  ON orders (merchant, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders (session_id);

-- ── 2. La session de table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS table_sessions (
  id          TEXT PRIMARY KEY,               -- "tsx-<22 caractères aléatoires>" ; c'est le secret
  merchant    TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'table',  -- 'table' | 'takeout'
  table_no    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  closed_by   TEXT NOT NULL DEFAULT '',       -- 'settle' | 'caisse' | 'expiry'
  opened_ts   INTEGER NOT NULL,
  seen_ts     INTEGER NOT NULL,
  closed_ts   INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_live
  ON table_sessions (merchant, table_no) WHERE status = 'open' AND mode = 'table';
CREATE INDEX IF NOT EXISTS idx_tsess_live ON table_sessions (merchant, status, seen_ts);

-- ── 3. La présence du comptoir ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_desk (
  merchant TEXT PRIMARY KEY,
  seen_ts  INTEGER NOT NULL
);
