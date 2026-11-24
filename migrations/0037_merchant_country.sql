-- Pays d'exploitation d'un commerce (owner, 24 nov. 2026 : CHICTRATEC SL / Startoner en Espagne).
-- NULL = Maroc, la valeur de tout commerce d'avant. assets/country-catalog.js, functions/api/admin/country.js.
ALTER TABLE merchant_config ADD COLUMN country TEXT;
