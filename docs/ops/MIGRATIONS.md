# D1 migrations: how the production database changes

Production D1 (`kiwi-sales`) used to lag `schema.sql` every time. `CREATE TABLE IF
NOT EXISTS` never touches a table that already exists, and the dated SQL files that
were supposed to close the gap were run by hand, one at a time, when someone
remembered. Nobody could say which ones production had received.

Since 2026-10-19 the database changes through **`wrangler d1 migrations`**:

| Piece | Role |
| --- | --- |
| `migrations/NNNN_name.sql` | The history. Wrangler records each applied file in a `d1_migrations` table in the database and applies only the ones it has not seen. |
| `schema.sql` | The portrait: the whole database as it should be, readable in one file. |
| `tools/d1-migrations-test.mjs` | Applies every migration to an empty in-memory SQLite and fails `check.js` unless the result equals `schema.sql`: tables, columns (type, NOT NULL, default, key), indexes and foreign keys. It also upgrades a POPULATED database (synthetic rows in accounts, sales, receipts, clients, store docs, hotel and print tables, built at the baseline) through every later migration and fails if a row disappears or changes, or an added NOT NULL column misses its default. Fast tier, no network. |
| `wrangler.d1.toml` | Wrangler config for migrations only. It is not called `wrangler.toml` on purpose: Cloudflare Pages reads that name when deploying kiwi-os.com. |
| `migrations/legacy/` | The old dated files, kept because tests read them. Wrangler does not read subfolders, so nothing in there is ever applied. |

## Apply pending migrations to production

Needs a Cloudflare login (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN` with
D1 Edit on the account.

1. See what production is missing, read-only:

   ```bash
   node tools/d1-schema.mjs
   ```

2. See which migrations wrangler would apply:

   ```bash
   npx wrangler d1 migrations list kiwi-sales --remote -c wrangler.d1.toml
   ```

3. Before you apply, stop writes from tills, integrations and staff. Keep writes
   paused until validation finishes. Export a pre-upgrade backup outside the repo:

   ```bash
   mkdir -p "$HOME/kiwi-backups"
   npx wrangler d1 export kiwi-sales --remote --output "$HOME/kiwi-backups/kiwi-sales-before-upgrade.sql" -c wrangler.d1.toml
   ```

   Use a new dated filename for each upgrade. Keep the dump private: it contains
   merchant and authentication data. Record the migration list alongside it and
   verify the dump by importing it into a fresh recovery database as below.

4. Apply them (wrangler shows the list and asks for confirmation first):

   ```bash
   npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml
   ```

   `npm run db:status` and `npm run db:migrate` are the same two commands.

5. Check again. `node tools/d1-schema.mjs` should exit 0.

Each migration file runs as one batch: if a statement fails, nothing from that
file is applied, and wrangler stops before the next one.

### The first time: 0001 and 0002

Production has no `d1_migrations` table yet, so the first `apply` runs every file.

- **`0001_baseline.sql`** is production's own DDL, read from `sqlite_master` on
  2026-10-19, with `IF NOT EXISTS` on every statement. On production it does
  nothing; it only records the starting point. On a fresh database it rebuilds
  production as it was that day.
- **`0002_close_prod_gap.sql`** adds what `schema.sql` declared and production
  did not have: 14 tables, 6 columns and their indexes. All of it is additive.
- **`0003_delivery_collections.sql`** adds the table that records money
  collected against delivery sales. Its route also creates it on first use, so
  on production it may already exist; every statement is `IF NOT EXISTS`.

**A known trap in 0002.** SQLite has no `ADD COLUMN IF NOT EXISTS`, and one of
the six columns can be created by running code before you apply:
`push_tokens.lang`, by `functions/api/push/register.js`. If step 1 shows that a
column listed in 0002 already exists in production, wrangler will stop on
`duplicate column name` and apply nothing from 0002. In that case, stop and have
the owner reconcile the live schema and migration history. Files 0001 through 0010 are applied history and must not be
edited, nor should a failed file be blindly marked as applied.

## If it fails halfway

These commands are for the owner. Agents never execute remote exports, imports or
migrations. There is no transaction across files: earlier successful files and
entries in `d1_migrations` remain committed. A statement failure rolls back the
current file. Keep writes paused and save the error and migration list. Do not
rerun individual SQL fragments on the damaged database.

Restore the pre-upgrade SQL dump into a **fresh** database, never over the existing
one:

```bash
npx wrangler d1 create kiwi-sales-recovery -c wrangler.d1.toml
```

Copy `wrangler.d1.toml` to a private recovery config, replace its database name and
UUID with `kiwi-sales-recovery` and the UUID returned by create, and retain
`migrations_dir = "migrations"`. Then:

```bash
npx wrangler d1 execute kiwi-sales-recovery --remote --file "$HOME/kiwi-backups/kiwi-sales-before-upgrade.sql" -c wrangler.d1.recovery.toml
npx wrangler d1 migrations list kiwi-sales-recovery --remote -c wrangler.d1.recovery.toml
npx wrangler d1 migrations apply kiwi-sales-recovery --remote -c wrangler.d1.recovery.toml
npx wrangler d1 execute kiwi-sales-recovery --remote --command "PRAGMA foreign_key_check" -c wrangler.d1.recovery.toml
```

The dump includes `d1_migrations`; retain that history so only pending files run.
Before applying, compare restored table counts and contents with the backup.
After applying, verify schema, receipts, money totals, customers, staff and stock.
The owner then switches the application's D1 binding to the recovered UUID and
redeploys before reopening writes. Retain the old database for investigation.
Writes accepted after the backup require reconciliation before cutover.

`node tools/d1-restore-rehearsal-test.mjs` rehearses this locally with synthetic
rows in every baseline table, SQL export/import, counts, SHA-256 hashes and exact
row comparisons. It injects a failure inside 0002 and separately tests every
statement prefix of every file, including loss of a success acknowledgement.
Partial replay is **not safe** for `0002_close_prod_gap.sql`,
`0007_auth_slug_reservation_session_revocations.sql`, `0008_ticket_client_key.sql`,
`0009_client_tags.sql` and `0010_sales_written_by.sql`: their unguarded ALTERs
raise duplicate-column errors. This prefix probe is a harsher interruption model,
not a claim that D1 commits half a failed batch. Restore the backup rather than
editing applied migrations. The rehearsal models SQLite transactions and dump
syntax; it does not exercise Cloudflare's service or deployment cutover.

## Change the schema

1. Edit `schema.sql` the way you want the database to look.
2. Write the migration that gets there:

   ```bash
   node tools/d1-migrations.mjs --draft
   ```

   It prints the SQL for the next file (missing tables, `ALTER TABLE … ADD
   COLUMN`, missing indexes). Save it as `migrations/NNNN_short_name.sql`, the
   next number, lowercase name with underscores. Read it before saving.
3. `node tools/d1-migrations-test.mjs` (or `npm run check:fast`) must be green.
4. Commit both files together, push, then apply to production (above).

Rules the test enforces:

- Only `NNNN_name.sql` files at the top of `migrations/`, numbered without gaps.
  A dated file dropped there by habit would be applied to production by the next
  `apply`.
- No `BEGIN` / `COMMIT`: D1 rejects them, wrangler already wraps each file.
- No `DROP TABLE`, `DROP COLUMN`, `DELETE FROM` or `RENAME` unless the file has a
  line `-- destructive: approved by owner YYYY-MM-DD`. Production holds real
  merchant books.
- `0001_baseline.sql` never changes.

What an `ALTER` cannot do (change a constraint or a column type, remove a column)
is listed by `--draft`, never guessed. In SQLite that means rebuilding the table:
create the new table, copy the rows, drop the old one, rename. That is a
destructive migration and needs the owner's go-ahead.

## What the test does not see

- **CHECK constraints.** SQLite has no pragma for them, so they are not compared.
- **Runtime declarations are now checked.** `tools/runtime-ddl-test.mjs` parses
  JavaScript strings, concatenations and static template substitutions throughout
  `functions/`, then compares SQLite columns, types, defaults, keys and indexes
  against `schema.sql`. Unresolved dynamic declarations fail the test. It also
  forbids runtime CREATE for objects owned by migrations through 0010, except
  the explicitly frozen AI and support modules. Newer tables retain their
  fallback until production application is confirmed. See
  [Wave M schema evidence](2026-10-26-wave-m-schema.md) for the retained inventory.
- **Production itself.** The test proves migrations equal `schema.sql`. Only
  `d1-schema.mjs` and `wrangler d1 migrations list --remote` look at production.

## `tools/d1-schema.mjs --apply --yes`

Still there, but use migrations instead. A column it adds is not recorded in
`d1_migrations`, so the next migration that adds the same column fails on
`duplicate column name`.

## Minimum de l’application, 26 octobre 2026

La table `d1_migrations` de production, lue le 26 octobre 2026, s’arrête à
`0016_cpu_polling_indexes.sql`, et la colonne `accounts.business_slug`, son index
unique et `merchant_config` y sont présents. `functions/_schema-version.js` fixe
ce minimum à 16 pour les contrôles locaux, sans sonde au démarrage ni par
requête. Voir `SCHEMA-FALLBACKS.md` pour les tables de routes encore hors
migrations et les retraits restant à faire.
