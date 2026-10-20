#!/usr/bin/env node
/* dash-phone-pages-ar-browser-test · dash-phone-pages-browser-test.mjs, default skin in Arabic.
 * One pass per file keeps each suite under check.js's 300 s (puppeteer). */
process.env.KIWI_PHONE_PASS = 'ar';
await import('./dash-phone-pages-browser-test.mjs');
