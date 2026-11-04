-- Dépense d'une cliente en centimes entiers. La colonne flottante `spend`
-- accumulait des erreurs d'arrondi (0,1 + 0,2) ; `spend_cents` est un entier.
-- Le serveur écrit les deux pendant la transition et ne lit que les centimes.
-- NULL (ligne écrite avant l'application de cette migration par un ancien
-- déploiement) retombe sur `spend` à la lecture : rien ne casse. Le code tolère
-- la colonne absente tant que la migration n'est pas appliquée.
ALTER TABLE clients ADD COLUMN spend_cents INTEGER;
UPDATE clients SET spend_cents = CAST(ROUND(spend * 100) AS INTEGER);
