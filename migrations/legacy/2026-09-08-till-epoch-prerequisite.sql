-- Required before fail-closed till revocation checks are deployed.
-- Schema-aware runners must skip this ALTER if the column already exists.
-- Zero preserves existing signed/legacy pairings; do not revoke or re-pair
-- devices, increment epochs, or rewrite merchant configuration during rollout.
ALTER TABLE merchant_config ADD COLUMN till_epoch INTEGER NOT NULL DEFAULT 0;
