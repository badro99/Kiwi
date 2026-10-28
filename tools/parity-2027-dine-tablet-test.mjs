#!/usr/bin/env node
/* parity-2027-dine-tablet-test · tools/parity-2027.mjs, the dine-in flows on a tablet.
 * The 2027 skin must change how the till LOOKS, never what it DOES: each flow
 * is played twice by real taps, shipped and 2027, and what it leaves behind
 * (kitchen tickets, tables, table orders, takeaway basket, shift journal) is
 * compared. Split per group and viewport to stay inside check.js's timeout. */
process.argv = [process.argv[0], process.argv[1], '--only', '^dine-in', '--vp', 'tablet', '--tag', 'dine-tablet'];
await import('./parity-2027.mjs');
