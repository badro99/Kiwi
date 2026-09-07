-- Additive only. Old actions remain unknown: never backfill inferred actors.
ALTER TABLE table_sessions ADD COLUMN closed_actor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE table_sessions ADD COLUMN closed_actor_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN cancel_actor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN cancel_actor_name TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN cancel_ts INTEGER;
