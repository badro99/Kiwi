-- Qui a écrit la vente : 'till:<appareil>', 'shared:<appareil>', 'till',
-- 'employee' ou 'account', lu par /api/sale dans l'identité authentifiée de la
-- requête (jamais dans le corps). Le Z d'une caisse certifie alors les reçus
-- de SON appareil et signale celui que son manifeste oublie. NULL sur toutes
-- les lignes existantes : elles restent une information, jamais une alerte.
-- Le code tolère la colonne absente tant que la migration n'est pas appliquée
-- (la vente s'écrit sans elle, le Z garde son comportement d'avant).
ALTER TABLE sales ADD COLUMN written_by TEXT;
