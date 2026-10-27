#!/usr/bin/env node
/* parity-2027-takeaway-phone-test · tools/parity-2027.mjs, the takeaway flows on a phone.
 * The 2027 skin must change how the till LOOKS, never what it DOES: each flow
 * is played twice by real taps, shipped and 2027, and what it leaves behind
 * (kitchen tickets, tables, table orders, takeaway basket, shift journal) is
 * compared. Split per group and viewport to stay inside check.js's timeout. */
process.argv = [process.argv[0], process.argv[1], '--only', '^takeaway', '--vp', 'phone', '--tag', 'takeaway-phone'];
await import('./parity-2027.mjs');
