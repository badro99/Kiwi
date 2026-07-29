# Supabase staging migration

Kiwi production continues to use Cloudflare D1. The Supabase project is a
staging shadow until row counts, representative records, tenancy, and rollback
have all been verified.

## Safety rules

- Never commit the database password, a secret/service-role key, or a D1 token.
- Never point the production frontend at staging.
- Never delete or reset D1 during migration.
- Only the published `menus` table is anonymously readable.
- All merchant data is protected by RLS through `account_users` and
  `merchant_config.account_id`.
- Internal authentication material and audit tables have no browser grants.

## Staging project

- Project: `kiwi-staging`
- Project ref: `stglcwxohzssweuanplt`
- Region: West EU (Paris)
- Migration source: `supabase/migrations/`

The project URL and publishable key are not secrets, but the current Kiwi
application does not need them until the shadow adapter is enabled. The database
password and secret/service-role key belong only in local or Cloudflare secret
storage.

## Cutover gates

1. Apply the schema migration to Supabase staging.
2. Export a read-only D1 snapshot and import it into staging.
3. Compare every table's row count and a sample of tenant-owned records.
4. Verify anonymous access exposes only published menus.
5. Verify two test merchants cannot read or update each other's rows.
6. Exercise login, sales, inventory, clients, orders, and offline recovery.
7. Keep D1 untouched and authoritative until explicit production approval.

No production cutover is performed by this migration.

## Shadow importer

`tools/migrate-d1-to-supabase.mjs` reads Cloudflare D1 through the query API and
upserts batches into Supabase staging. It never issues a D1 write or delete. It
also refuses to run unless `MIGRATION_CONFIRM=kiwi-staging` and the Supabase URL
matches `SUPABASE_EXPECTED_PROJECT_REF`.

Required secrets are documented by name in `.env.example`; values must remain
outside Git and browser code. The importer records its result in `import_runs`
and stops on the first row-count mismatch.
