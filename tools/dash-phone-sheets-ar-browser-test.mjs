#!/usr/bin/env node
/* dash-phone-sheets-ar-browser-test · dash-phone-sheets-browser-test.mjs, in Arabic.
 * One pass per file keeps each suite under check.js's 300 s (puppeteer). */
process.env.KIWI_PHONE_PASS = 'ar';
await import('./dash-phone-sheets-browser-test.mjs');
