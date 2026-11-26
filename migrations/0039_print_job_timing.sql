-- Mesures du pont d'impression à l'accusé (functions/api/print/_watch.js, 26 nov. 2026) :
-- ouverture de la prise et écriture en ms, prise réutilisée ou neuve. Sans ces
-- colonnes, l'accusé passe quand même (saveTiming rattrape l'erreur).
ALTER TABLE print_jobs ADD COLUMN connect_ms INTEGER;

ALTER TABLE print_jobs ADD COLUMN write_ms INTEGER;

ALTER TABLE print_jobs ADD COLUMN reused INTEGER;
