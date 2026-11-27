// A D1-shaped wrapper over node:sqlite loaded with schema.sql, for the wallet
// suites (same shape as the one in tools/account-deletion-test.mjs).
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function walletDb({ schema = true } = {}) {
  const sql = new DatabaseSync(':memory:');
  if (schema) sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      const statement = sql.prepare(query);
      const bound = (args = []) => ({
        first: async () => statement.get(...args) || null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => { const r = statement.run(...args); return { success: true, meta: { changes: r.changes } }; },
      });
      return { ...bound(), bind: (...args) => bound(args) };
    },
    async batch(list) { return Promise.all(list.map((s) => s.run())); },
  };
  return { sql, DB };
}
