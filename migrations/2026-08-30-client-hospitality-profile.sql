-- Structured hotel guest profile shared by dashboard Hospitality+ and caisse.
-- JSON keeps the client row extensible as hotels add preference fields without
-- creating a new table or splitting one guest across multiple feature stores.
ALTER TABLE clients ADD COLUMN hospitality TEXT NOT NULL DEFAULT '{}';
