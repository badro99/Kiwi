-- Horloge de confiance de la caisse (décision du 4 novembre 2026) : la vente garde
-- l'heure du serveur à l'arrivée (received_ts) et celle de l'appareil (device_ts)
-- à côté de ts, l'heure corrigée. Colonnes nullables : les anciennes ventes restent NULL.
ALTER TABLE sales ADD COLUMN received_ts INTEGER;
ALTER TABLE sales ADD COLUMN device_ts INTEGER;
