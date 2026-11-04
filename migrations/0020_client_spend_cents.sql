-- Dépense d'une cliente en centimes entiers. La colonne flottante `spend`
-- accumulait des erreurs d'arrondi (0,1 + 0,2) ; `spend_cents` est un entier.
-- Volontairement NULL, sans rattrapage : une ligne NULL n'a pas été touchée
-- depuis la migration et se lit depuis `spend`, exactement comme avant
-- (COALESCE(spend_cents, ROUND(spend * 100)), un seul fragment :
-- functions/api/_spend-cents.js). Une ligne écrite par le nouveau code porte les
-- deux colonnes, qui concordent. Un ancien déploiement qui tourne encore après
-- la migration n'écrit que `spend` sur des lignes NULL : aucune valeur périmée
-- possible, quel que soit l'ordre migration / déploiement.
ALTER TABLE clients ADD COLUMN spend_cents INTEGER;
