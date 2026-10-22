#!/usr/bin/env node
/* Kiwi · trades-ledger-retail-browser-test — the retail third of the trades
 * ledger suite.
 *   node tools/trades-ledger-retail-browser-test.mjs
 *
 * Same file, same stack, same checks as trades-ledger-browser-test.mjs (a
 * puppeteer suite on tools/browser-trace.mjs, full tier only). This entry runs
 * only the retail tills (épicerie, pharmacie, librairie, fleuriste), each
 * sold from the shared boutique catalogue, so each third stays well inside
 * check.js's five minutes per suite. */
process.env.KIWI_TRADES_PART = 'retail';
await import('./trades-ledger-browser-test.mjs');
