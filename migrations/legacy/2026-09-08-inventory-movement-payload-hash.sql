-- I02: bind an inventory movement id to its immutable canonical payload.
--
-- This is an additive legacy-installation migration. Fresh databases get the
-- column from schema.sql; schema-aware fixture runners must skip this file
-- when PRAGMA table_info(inventory_movements) already reports payload_hash.
ALTER TABLE inventory_movements
  ADD COLUMN payload_hash TEXT NOT NULL DEFAULT '';
