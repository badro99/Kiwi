/* Coverage probe · turns each `// coverage:` annotation of a browser suite into
 * a record that the line was reached in this run.
 *
 * check-pool.js and check-guard.js preload it (--import) into the browser suites
 * that carry annotations, with KIWI_COVERAGE_LEDGER naming a file. The load hook
 * (coverage-hooks.mjs) puts one call on each annotation line, same line, so
 * stack traces keep their numbers; reaching the line appends its cell to the
 * ledger at once (a suite killed later keeps what it reached). The full gate
 * then requires every mandatory French cell to have been reached, not only
 * declared (tools/check.js, section « Coverage cells reached »). */
import { register } from 'node:module';
import fs from 'node:fs';

const ledger = process.env.KIWI_COVERAGE_LEDGER;
if (ledger) {
  register('./coverage-hooks.mjs', import.meta.url);
  const seen = new Set();
  globalThis.__kiwiCoverageCell = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    try { fs.appendFileSync(ledger, key + '\n'); } catch (_) {}
  };
}
