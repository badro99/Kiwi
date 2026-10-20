#!/usr/bin/env node
/* Kiwi · sync-ledger-boutique-browser-test — the boutique half of the sync
 * ledger suite.
 *   node tools/sync-ledger-boutique-browser-test.mjs
 *
 * Same file, same stack, same checks as sync-ledger-browser-test.mjs (a
 * puppeteer suite on tools/browser-trace.mjs): this entry runs only its
 * « boutique · » scenarios (cash, card, split, offline, a return for store
 * credit then the credit spent), so each half stays well inside check.js's
 * five minutes per suite. */
process.env.KIWI_SYNC_PART = 'boutique';
await import('./sync-ledger-browser-test.mjs');
