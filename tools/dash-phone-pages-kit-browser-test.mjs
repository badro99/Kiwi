#!/usr/bin/env node
/* dash-phone-pages-kit-browser-test · dash-phone-pages-browser-test.mjs, Design 2027 kit in Arabic.
 * One pass per file keeps each suite under check.js's 300 s (puppeteer). */
process.env.KIWI_PHONE_PASS = 'kit';
await import('./dash-phone-pages-browser-test.mjs');
