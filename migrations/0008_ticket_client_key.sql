-- Clé d'idempotence de la création d'un ticket : un renvoi identique après une
-- réponse perdue retrouve le premier ticket. NULL pour les anciens tickets et
-- les clients qui n'en envoient pas (un index unique ignore les NULL).
ALTER TABLE kiwi_tickets ADD COLUMN client_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiwi_tickets_client_key ON kiwi_tickets (client_key);
