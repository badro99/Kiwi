import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const css = read('assets/pos-mobile.css');
const skin = read('assets/caisse-skin.css');
const js = read('assets/pos-mobile.js');
const scan = read('assets/retail-scan.css');
const html = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');

let controls = 0;
function ok(value, message) { assert.ok(value, message); controls++; }

ok(css.includes('@media (max-width: 860px)') && css.includes('(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)'), 'phone shell covers portrait and large-iPhone landscape');
ok(css.includes('.vx-root > .vx-main') && css.includes('inset: 0 !important'), 'desktop rail offsets are cleared on phones');
ok(css.includes('height: 100dvh') && css.includes('max-height: 100dvh'), 'shell follows the visible phone viewport');
ok(css.includes('.vx-root .vx-ticket') && css.includes('position: fixed'), 'ticket becomes a bottom sheet');
ok(css.includes('.vx-root.vx-ticket-open .vx-ticket'), 'ticket has an explicit open state');
ok(css.includes('env(safe-area-inset-bottom'), 'bottom sheet respects device safe areas');
ok(css.includes('min-width: 36px; min-height: 36px'), 'ticket quantity controls are thumb-sized');
ok(css.includes('font-size: 16px !important'), 'form controls avoid iOS focus zoom');
ok(css.includes('max-height: calc(100dvh - 24px)'), 'modals remain inside the visible viewport');
ok(css.includes('grid-template-columns: repeat(2'), 'product grids use two phone columns');
ok(css.includes('grid-template-columns: repeat(3') && css.includes('max-height: 92dvh'), 'landscape phones use three product columns and a short-screen ticket');
ok(css.includes('safe-area-inset-left') && css.includes('safe-area-inset-right'), 'specialist controls clear landscape notches');
ok(css.includes('calc(20px + env(safe-area-inset-top') && css.includes('calc(14px + env(safe-area-inset-left'), 'specialist rail preserves its normal padding around safe areas');
ok(skin.includes('(orientation: landscape) and (max-width: 1024px) and (max-height: 600px)'), 'restaurant shell covers large-iPhone landscape');
ok(skin.includes('max-height: calc(100dvh - 24px') && skin.includes('.modal input, .modal select, .modal textarea { font-size: 16px; }'), 'restaurant dialogs survive the iOS keyboard without zoom');
ok(skin.includes('.sk-tabs') && skin.includes('overflow-x: auto'), 'restaurant stock tabs stay reachable on phones');

ok(js.includes("peek.setAttribute('aria-controls'"), 'ticket trigger exposes its controlled sheet');
ok(js.includes("peek.setAttribute('aria-expanded'"), 'ticket trigger exposes open state');
ok(js.includes("screen.classList.remove('vx-nav-open')"), 'ticket and navigation drawers are mutually exclusive');
ok(js.includes("screen.classList.remove('vx-nav-open', 'vx-ticket-open')"), 'Escape closes mobile drawers');
ok(js.includes('var totalNode = findTotalNode(ticket)'), 'ticket total is rediscovered after vertical rerenders');
ok(js.includes('new MutationObserver(sync).observe(ticket'), 'ticket peek follows complete ticket rerenders');

ok(scan.includes('.vx-root .krs-launch') && scan.includes('bottom: calc(74px'), 'continuous scan button clears the resting ticket');
ok(scan.includes('.vx-root.vx-ticket-open .krs-launch'), 'scanner launcher yields to an open ticket');
ok(scan.includes('margin: 0; padding: 0; display: grid'), 'global landing-page section spacing cannot push the camera down');
ok(scan.includes('grid-template-rows: clamp(210px,32dvh,260px) auto'), 'phone scanner camera is compact instead of consuming the viewport');
ok(scan.includes('.krs-empty { min-height: 64px'), 'empty scan result collapses to a useful status strip');
ok(html.includes('@media (max-width: 600px)') && html.includes('white-space: normal'), 'unlock greeting wraps on narrow phones');
ok(html.includes('id="cash-received"') && !html.includes('cashInput.focus()'), 'opening cash payment leaves the optional received-amount field unfocused until the cashier taps it');
ok(html.includes('assets/caisse-skin.css?v=3') && html.includes('assets/pos-mobile.css?v=3') && html.includes('assets/pos-mobile.js?v=3'), 'phone layers are cache-busted');
const retailScanVersion = html.match(/assets\/retail-scan\.css\?v=(\d+)/)?.[1];
ok(!!retailScanVersion && sw.includes(`'/assets/retail-scan.css?v=${retailScanVersion}'`), 'scanner iPhone layout is cache-busted consistently');
const shellVersion = Number(sw.match(/var CACHE = 'kiwi-app-v(\d+)'/)?.[1] || 0);
ok(shellVersion >= 340 && sw.includes("'/assets/caisse-skin.css?v=3'") && sw.includes("'/assets/pos-mobile.css?v=3'") && !!retailScanVersion, 'offline shell ships the phone and landscape fixes');

console.log(`pos-mobile-test: ${controls} controls`);
