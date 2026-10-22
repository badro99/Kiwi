#!/usr/bin/env node
/* Kiwi · trades-ledger-care-browser-test — the care third of the trades
 * ledger suite.
 *   node tools/trades-ledger-care-browser-test.mjs
 *
 * Same file, same stack, same checks as trades-ledger-browser-test.mjs (a
 * puppeteer suite on tools/browser-trace.mjs, full tier only). This entry runs
 * only the care tills (coiffure, spa, salle de sport), each sold from
 * the merchant's `workspaces` catalogue, so each third stays well inside
 * check.js's five minutes per suite. */
process.env.KIWI_TRADES_PART = 'care';
await import('./trades-ledger-browser-test.mjs');
