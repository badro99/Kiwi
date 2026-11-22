-- 0028 · Avances (acomptes) qui expirent. Une avance garde une pièce pour une
-- cliente qui a versé une partie du prix. Passé le délai réglé au tableau de
-- bord (Reçu · Validité des bons), la caisse scanne chaque pièce pour la
-- remettre en stock, et l'argent versé devient un avoir au nom de la cliente.
-- Colonnes nullables ou à défaut vide : une note ouverte avant 0028 reste
-- lisible et n'expire jamais d'office.
ALTER TABLE retail_balances ADD COLUMN kind TEXT NOT NULL DEFAULT '';
ALTER TABLE retail_balances ADD COLUMN expires_ts INTEGER;
ALTER TABLE retail_balances ADD COLUMN lines TEXT;
ALTER TABLE retail_balances ADD COLUMN closed_ts INTEGER;
ALTER TABLE retail_balances ADD COLUMN close_reason TEXT;
ALTER TABLE retail_balances ADD COLUMN close_credit_code TEXT;
