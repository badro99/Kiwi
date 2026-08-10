import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const css = read('assets/pos-mobile.css');
const js = read('assets/pos-mobile.js');
const scan = read('assets/retail-scan.css');
const html = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');

let controls = 0;
function ok(value, message) { assert.ok(value, message); controls++; }

ok(css.includes('@media (max-width: 860px)'), 'phone shell is breakpoint-gated');
ok(css.includes('.vx-root > .vx-main') && css.includes('inset: 0 !important'), 'desktop rail offsets are cleared on phones');
ok(css.includes('height: 100dvh') && css.includes('max-height: 100dvh'), 'shell follows the visible phone viewport');
ok(css.includes('.vx-root .vx-ticket') && css.includes('position: fixed'), 'ticket becomes a bottom sheet');
ok(css.includes('.vx-root.vx-ticket-open .vx-ticket'), 'ticket has an explicit open state');
ok(css.includes('env(safe-area-inset-bottom'), 'bottom sheet respects device safe areas');
ok(css.includes('min-width: 36px; min-height: 36px'), 'ticket quantity controls are thumb-sized');
ok(css.includes('font-size: 16px !important'), 'form controls avoid iOS focus zoom');
ok(css.includes('max-height: calc(100dvh - 24px)'), 'modals remain inside the visible viewport');
ok(css.includes('grid-template-columns: repeat(2'), 'product grids use two phone columns');

ok(js.includes("peek.setAttribute('aria-controls'"), 'ticket trigger exposes its controlled sheet');
ok(js.includes("peek.setAttribute('aria-expanded'"), 'ticket trigger exposes open state');
ok(js.includes("screen.classList.remove('vx-nav-open')"), 'ticket and navigation drawers are mutually exclusive');
ok(js.includes("screen.classList.remove('vx-nav-open', 'vx-ticket-open')"), 'Escape closes mobile drawers');
ok(js.includes('var totalNode = findTotalNode(ticket)'), 'ticket total is rediscovered after vertical rerenders');
ok(js.includes('new MutationObserver(sync).observe(ticket'), 'ticket peek follows complete ticket rerenders');

ok(scan.includes('.vx-root .krs-launch') && scan.includes('bottom: calc(74px'), 'continuous scan button clears the resting ticket');
ok(scan.includes('.vx-root.vx-ticket-open .krs-launch'), 'scanner launcher yields to an open ticket');
ok(html.includes('@media (max-width: 600px)') && html.includes('white-space: normal'), 'unlock greeting wraps on narrow phones');
ok(html.includes('assets/pos-mobile.css?v=2') && html.includes('assets/pos-mobile.js?v=2'), 'phone layer is cache-busted');
ok(html.includes('assets/retail-scan.css?v=4'), 'scanner collision fix is cache-busted');
ok(sw.includes("'kiwi-app-v337'") && sw.includes("'/assets/pos-mobile.css?v=2'"), 'offline shell ships the phone fix');

console.log(`pos-mobile-test: ${controls} controls`);
