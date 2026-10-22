-- Étiquettes du carnet clients (« vip », « grossiste »…). Elles ne vivaient que
-- dans le navigateur : un autre appareil ne les voyait jamais, et le tirage
-- suivant les effaçait du carnet local. Tableau JSON, '[]' pour les fiches
-- existantes. Le code tolère la colonne absente tant que la migration n'est pas
-- appliquée (les étiquettes restent alors locales, comme avant).
ALTER TABLE clients ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
