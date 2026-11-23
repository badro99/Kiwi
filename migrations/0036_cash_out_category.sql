-- 0036 · La catégorie d'une sortie de caisse, choisie au tiroir avec la grille
-- de Dépenses (assets/till-categories.js, functions/api/cash-sessions.js).
-- Nullable : sans 0036, la caisse enregistre la sortie sans catégorie et la
-- page Dépenses la devine d'après le motif, comme avant.
ALTER TABLE cash_session_events ADD COLUMN movement_category TEXT;
