/* Coverage probe · records which coverage annotations and landing claim
 * anchors a test really reached.
 *
 * check-pool.js and check-guard.js preload it (--import) into the suites that
 * carry `// coverage:` annotations or a landing claim anchor, with
 * KIWI_COVERAGE_LEDGER naming a file. The hooks (coverage-hooks.mjs: ES modules
 * through the load hook, CommonJS through Module#_compile) put one call on each
 * marked line, same line, so stack traces keep their numbers; reaching the line
 * appends its key to the ledger at once (a suite killed later keeps what it
 * reached). The full gate then requires every mandatory French cell and every
 * landing claim anchor to have been reached, not only written (tools/check.js). */
import { register, createRequire } from 'node:module';
import fs from 'node:fs';
import { transform } from './coverage-hooks.mjs';

const ledger = process.env.KIWI_COVERAGE_LEDGER;
if (ledger) {
  register('./coverage-hooks.mjs', import.meta.url);
  const Module = createRequire(import.meta.url)('module');
  const compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    const marked = typeof content === 'string' ? transform(filename, content) : null;
    return compile.call(this, marked == null ? content : marked, filename);
  };
  const seen = new Set();
  globalThis.__kiwiCoverageCell = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    try { fs.appendFileSync(ledger, key + '\n'); } catch (_) {}
  };
}
