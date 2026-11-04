-- La cliente de la vente : l'id de sa fiche du carnet (clients.id), envoyé par
-- la caisse avec la vente et rendu par /api/feed. Une vente importée sur une
-- autre tablette garde ainsi sa cliente, et un avoir émis contre elle s'attache
-- à la bonne fiche. NULL sur toutes les lignes existantes (affichées « client non
-- renseigné »). Le code tolère la colonne absente tant que la migration n'est
-- pas appliquée.
ALTER TABLE sales ADD COLUMN client_id TEXT;
