-- Authentification : réservation atomique du slug d'établissement et révocation
-- serveur d'une session fermée par /auth/logout.
--
-- business_slug n'est PAS recopié pour les comptes existants : les anciens
-- comptes à nom sans lettre latine partagent le slug « client », et un index
-- unique les refuserait. Seuls les comptes créés après ce déploiement le
-- remplissent ; signup.js garde son balayage pour les autres.
--
-- Le code supporte les deux états : avant cette migration, signup retombe sur
-- l'INSERT d'avant et la révocation n'est pas lue (table absente).

CREATE TABLE IF NOT EXISTS session_revocations (
  sid        TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires_ts INTEGER NOT NULL
);

ALTER TABLE accounts ADD COLUMN business_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_business_slug ON accounts (business_slug) WHERE business_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_revocations_expires ON session_revocations (expires_ts);
