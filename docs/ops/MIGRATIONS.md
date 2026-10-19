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
| `tools/d1-migrations-test.mjs` | Applies every migration to an empty in-memory SQLite and fails `check.js` unless the result equals `schema.sql`: tables, columns (type, NOT NULL, default, key), indexes and foreign keys. Fast tier, no network. |
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

3. Apply them (wrangler shows the list and asks for confirmation first):

   ```bash
   npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml
   ```

   `npm run db:status` and `npm run db:migrate` are the same two commands.

4. Check again. `node tools/d1-schema.mjs` should exit 0.

Each migration file runs as one batch: if a statement fails, nothing from that
file is applied, and wrangler stops before the next one.

### The first time: 0001 and 0002

Production has no `d1_migrations` table yet, so the first `apply` runs both files.

- **`0001_baseline.sql`** is production's own DDL, read from `sqlite_master` on
  2026-10-19, with `IF NOT EXISTS` on every statement. On production it does
  nothing; it only records the starting point. On a fresh database it rebuilds
  production as it was that day.
- **`0002_close_prod_gap.sql`** adds what `schema.sql` declared and production
  did not have: 14 tables, 6 columns and their indexes. All of it is additive.

**A known trap in 0002.** SQLite has no `ADD COLUMN IF NOT EXISTS`, and one of
the six columns can be created by running code before you apply:
`push_tokens.lang`, by `functions/api/push/register.js`. If step 1 shows that a
column listed in 0002 already exists in production, wrangler will stop on
`duplicate column name` and apply nothing from 0002. In that case, and only
because 0002 has never been applied anywhere: delete that one `ALTER` line from
`0002_close_prod_gap.sql`, commit, and apply again. Never edit a migration that
production has already recorded.

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
- **Tables created by route code.** Several routes run their own `CREATE TABLE IF
  NOT EXISTS` at request time (`functions/api/operations.js`,
  `functions/api/foodcost.js`, `functions/api/agent/_oauth.js`, …). When such a
  route runs before a migration, production gets the route's version of the
  table and the migration's `IF NOT EXISTS` leaves it alone. Step 4 above
  (`node tools/d1-schema.mjs`) is how you notice.
- **Production itself.** The test proves migrations equal `schema.sql`. Only
  `d1-schema.mjs` and `wrangler d1 migrations list --remote` look at production.

## `tools/d1-schema.mjs --apply --yes`

Still there, but use migrations instead. A column it adds is not recorded in
`d1_migrations`, so the next migration that adds the same column fails on
`duplicate column name`.
